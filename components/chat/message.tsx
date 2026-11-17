"use client";
import type { UseChatHelpers } from "@ai-sdk/react";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { CALCULATOR_TOOL_NAMES } from "@/lib/ai/tools/calculator-names";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { cn, sanitizeText } from "@/lib/utils";
import { MessageContent, MessageResponse } from "../ai-elements/message";
import { Shimmer } from "../ai-elements/shimmer";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "../ai-elements/tool";
import { Logo } from "../brand/logo";
import { CalculationCard } from "../clinical/calculation-card";
import { ProtocolSearchResult } from "../clinical/protocol-citations";
import { RedactionNotice, RedFlagAlert } from "../clinical/safety-notices";
import { SessionRecordCard } from "../clinical/session-record-card";
import { useDataStream } from "./data-stream-provider";
import { DocumentToolResult } from "./document";
import { DocumentPreview } from "./document-preview";
import { MessageActions } from "./message-actions";
import { MessageReasoning } from "./message-reasoning";
import { PreviewAttachment } from "./preview-attachment";

const clinicalWidth = "w-[min(100%,480px)]";

type MessagePart = ChatMessage["parts"][number];
type CalculatorPart = Extract<
  MessagePart,
  { type: `tool-${(typeof CALCULATOR_TOOL_NAMES)[number]}` }
>;

function isCalculatorPart(part: MessagePart): part is CalculatorPart {
  return (CALCULATOR_TOOL_NAMES as readonly string[]).includes(
    part.type.replace(/^tool-/, "")
  );
}

function WaitingText() {
  const t = useTranslations("message");
  const { waitingStatus } = useDataStream();
  const waitingText = waitingStatus?.message ?? t("waiting");

  return (
    <div className="flex min-h-[calc(13px*1.65)] min-w-0 items-center text-[13px] leading-[1.65]">
      <Shimmer
        as="span"
        className="font-medium whitespace-normal break-words"
        duration={1}
      >
        {waitingText}
      </Shimmer>
    </div>
  );
}

function ToolApprovalActions({
  addToolApprovalResponse,
  approvalId,
}: {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  approvalId: string;
}) {
  const t = useTranslations("message");
  const handleDeny = useCallback(() => {
    addToolApprovalResponse({
      approved: false,
      id: approvalId,
      reason: "User denied the tool call",
    });
  }, [addToolApprovalResponse, approvalId]);

  const handleAllow = useCallback(() => {
    addToolApprovalResponse({
      approved: true,
      id: approvalId,
    });
  }, [addToolApprovalResponse, approvalId]);

  return (
    <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
      <button
        className="rounded-md px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
        onClick={handleDeny}
        type="button"
      >
        {t("deny")}
      </button>
      <button
        className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-sm transition-colors hover:bg-primary/90"
        onClick={handleAllow}
        type="button"
      >
        {t("allow")}
      </button>
    </div>
  );
}

const PurePreviewMessage = ({
  addToolApprovalResponse,
  chatId,
  message,
  vote,
  isLoading,
  setMessages: _setMessages,
  regenerate: _regenerate,
  isReadonly,
  requiresScrollPadding: _requiresScrollPadding,
  onEdit,
}: {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  requiresScrollPadding: boolean;
  onEdit?: (message: ChatMessage) => void;
}) => {
  const t = useTranslations("message");
  const attachmentsFromMessage = message.parts.filter(
    (part) => part.type === "file"
  );

  useDataStream();

  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  const hasAnyContent = message.parts?.some(
    (part) =>
      (part.type === "text" && part.text?.trim().length > 0) ||
      (part.type === "reasoning" &&
        "text" in part &&
        part.text?.trim().length > 0) ||
      part.type.startsWith("tool-")
  );
  const isThinking = isAssistant && isLoading && !hasAnyContent;

  const attachments = attachmentsFromMessage.length > 0 && (
    <div
      className="flex flex-row justify-end gap-2"
      data-testid={"message-attachments"}
    >
      {attachmentsFromMessage.map((attachment) => (
        <PreviewAttachment
          attachment={{
            contentType: attachment.mediaType,
            name: attachment.filename ?? "file",
            url: attachment.url,
          }}
          key={attachment.url}
        />
      ))}
    </div>
  );

  const mergedReasoning = message.parts?.reduce(
    (acc, part) => {
      if (part.type === "reasoning" && part.text?.trim().length > 0) {
        return {
          isStreaming: "state" in part ? part.state === "streaming" : false,
          rendered: false,
          text: acc.text ? `${acc.text}\n\n${part.text}` : part.text,
        };
      }
      return acc;
    },
    { isStreaming: false, rendered: false, text: "" }
  ) ?? { isStreaming: false, rendered: false, text: "" };

  const parts = message.parts?.map((part, index) => {
    const { type } = part;
    const key = `message-${message.id}-part-${index}`;

    if (type === "reasoning") {
      if (!mergedReasoning.rendered && mergedReasoning.text) {
        mergedReasoning.rendered = true;
        return (
          <MessageReasoning
            isLoading={isLoading || mergedReasoning.isStreaming}
            key={key}
            reasoning={mergedReasoning.text}
          />
        );
      }
      return null;
    }

    if (type === "text") {
      return (
        <MessageContent
          className={cn("text-[13px] leading-[1.65]", {
            "w-fit max-w-[min(80%,56ch)] overflow-hidden break-words rounded-2xl rounded-br-lg border border-border/30 bg-gradient-to-br from-secondary to-muted px-3.5 py-2 shadow-[var(--shadow-card)]":
              message.role === "user",
          })}
          data-testid="message-content"
          key={key}
        >
          <MessageResponse>{sanitizeText(part.text)}</MessageResponse>
        </MessageContent>
      );
    }

    if (type === "data-redaction") {
      return (
        <RedactionNotice
          counts={part.data.counts}
          key={key}
          total={part.data.total}
        />
      );
    }

    if (type === "data-red-flags") {
      return <RedFlagAlert categories={part.data.categories} key={key} />;
    }

    if (isCalculatorPart(part)) {
      const { toolCallId, state } = part;
      if (state === "output-available") {
        return (
          <div className={clinicalWidth} key={toolCallId}>
            <CalculationCard outcome={part.output} />
          </div>
        );
      }
      return (
        <div className={clinicalWidth} key={toolCallId}>
          <Tool className="w-full" defaultOpen={state === "output-error"}>
            <ToolHeader state={state} type={part.type} />
            <ToolContent>
              {state === "output-error" ? (
                <ToolOutput errorText={part.errorText} output={undefined} />
              ) : (
                <ToolInput input={part.input} />
              )}
            </ToolContent>
          </Tool>
        </div>
      );
    }

    if (type === "tool-buscarProtocolos") {
      const { toolCallId, state } = part;
      if (state === "output-available") {
        return (
          <div className="w-full" key={toolCallId}>
            <ProtocolSearchResult output={part.output} />
          </div>
        );
      }
      return (
        <div className={clinicalWidth} key={toolCallId}>
          <Tool className="w-full" defaultOpen={false}>
            <ToolHeader state={state} type={type} />
            <ToolContent>
              {state === "output-error" ? (
                <ToolOutput errorText={part.errorText} output={undefined} />
              ) : (
                <ToolInput input={part.input} />
              )}
            </ToolContent>
          </Tool>
        </div>
      );
    }

    if (type === "tool-crearHojaSesion") {
      const { toolCallId, state } = part;
      if (state === "output-available") {
        return (
          <div className="w-[min(100%,640px)]" key={toolCallId}>
            <SessionRecordCard output={part.output} />
          </div>
        );
      }
      return (
        <div className={clinicalWidth} key={toolCallId}>
          <Tool className="w-full" defaultOpen={state === "output-error"}>
            <ToolHeader state={state} type={type} />
            <ToolContent>
              {state === "output-error" && (
                <ToolOutput errorText={part.errorText} output={undefined} />
              )}
            </ToolContent>
          </Tool>
        </div>
      );
    }

    if (type === "tool-createDocument") {
      const { toolCallId } = part;

      if (part.output && "error" in part.output) {
        return (
          <div
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50"
            key={toolCallId}
          >
            {t("errorCreating")}: {String(part.output.error)}
          </div>
        );
      }

      return (
        <DocumentPreview
          isReadonly={isReadonly}
          key={toolCallId}
          result={part.output}
        />
      );
    }

    if (type === "tool-updateDocument") {
      const { toolCallId } = part;

      if (part.output && "error" in part.output) {
        return (
          <div
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50"
            key={toolCallId}
          >
            {t("errorUpdating")}: {String(part.output.error)}
          </div>
        );
      }

      return (
        <div className="relative" key={toolCallId}>
          <DocumentPreview
            args={{ ...part.output, isUpdate: true }}
            isReadonly={isReadonly}
            result={part.output}
          />
        </div>
      );
    }

    if (type === "tool-requestSuggestions") {
      const { toolCallId, state } = part;

      return (
        <Tool
          className="w-[min(100%,450px)]"
          defaultOpen={true}
          key={toolCallId}
        >
          <ToolHeader state={state} type="tool-requestSuggestions" />
          <ToolContent>
            {state === "input-available" && <ToolInput input={part.input} />}
            {state === "output-available" && (
              <ToolOutput
                errorText={undefined}
                output={
                  "error" in part.output ? (
                    <div className="rounded border p-2 text-red-500">
                      {t("error")}: {String(part.output.error)}
                    </div>
                  ) : (
                    <DocumentToolResult
                      isReadonly={isReadonly}
                      result={part.output}
                      type="request-suggestions"
                    />
                  )
                }
              />
            )}
          </ToolContent>
        </Tool>
      );
    }

    // Herramientas que requieran aprobación (needsApproval) en el futuro.
    if (
      type.startsWith("tool-") &&
      "state" in part &&
      part.state === "approval-requested"
    ) {
      const approvalId = (part as { approval?: { id: string } }).approval?.id;
      return (
        <div className={clinicalWidth} key={key}>
          <Tool className="w-full" defaultOpen={true}>
            <ToolHeader
              state={part.state}
              type={type as `tool-${string}` as never}
            />
            <ToolContent>
              {"input" in part ? <ToolInput input={part.input} /> : null}
              {approvalId ? (
                <ToolApprovalActions
                  addToolApprovalResponse={addToolApprovalResponse}
                  approvalId={approvalId}
                />
              ) : null}
            </ToolContent>
          </Tool>
        </div>
      );
    }

    return null;
  });

  const actions = !isReadonly && (
    <MessageActions
      chatId={chatId}
      isLoading={isLoading}
      key={`action-${message.id}`}
      message={message}
      onEdit={onEdit ? () => onEdit(message) : undefined}
      vote={vote}
    />
  );

  const content = isThinking ? (
    <WaitingText />
  ) : (
    <>
      {attachments}
      {parts}
      {actions}
    </>
  );

  return (
    <div
      className={cn(
        "group/message w-full",
        !isAssistant && "animate-[fade-up_0.25s_cubic-bezier(0.22,1,0.36,1)]"
      )}
      data-role={message.role}
      data-testid={`message-${message.role}`}
    >
      <div
        className={cn(
          isUser ? "flex flex-col items-end gap-2" : "flex items-start gap-3"
        )}
      >
        {isAssistant && (
          <div className="flex h-[calc(13px*1.65)] shrink-0 items-center">
            <div className="flex size-7 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground ring-1 ring-border/50">
              <Logo size={16} />
            </div>
          </div>
        )}
        {isAssistant ? (
          <div className="flex min-w-0 flex-1 flex-col gap-2">{content}</div>
        ) : (
          content
        )}
      </div>
    </div>
  );
};

export const PreviewMessage = PurePreviewMessage;

export const ThinkingMessage = () => (
  <div
    className="group/message w-full"
    data-role="assistant"
    data-testid="message-assistant-loading"
  >
    <div className="flex items-start gap-3">
      <div className="flex h-[calc(13px*1.65)] shrink-0 items-center">
        <div className="flex size-7 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground ring-1 ring-border/50">
          <Logo size={16} />
        </div>
      </div>

      <WaitingText />
    </div>
  </div>
);
