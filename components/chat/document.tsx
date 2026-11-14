import { useTranslations } from "next-intl";
import { memo, useCallback } from "react";
import { toast } from "sonner";
import { useArtifact } from "@/hooks/use-artifact";
import type { ArtifactKind } from "./artifact";
import { FileIcon, LoaderIcon, MessageIcon, PencilEditIcon } from "./icons";

type Translator = ReturnType<typeof useTranslations>;

const getPastText = (
  t: Translator,
  type: "create" | "update" | "request-suggestions",
  title: string
) => {
  switch (type) {
    case "create":
      return t("created", { title });
    case "update":
      return t("updated", { title });
    case "request-suggestions":
      return t("addedSuggestions", { title });
    default:
      return null;
  }
};

const getPresentText = (
  t: Translator,
  type: "create" | "update" | "request-suggestions",
  args:
    | { title: string; kind: ArtifactKind }
    | { id: string; description: string }
    | { documentId: string }
) => {
  if (type === "create") {
    return "title" in args && args.title
      ? t("creating", { title: args.title })
      : t("creatingNoTitle");
  }
  if (type === "update") {
    return "description" in args
      ? t("updating", { description: args.description })
      : t("updatingNoDescription");
  }
  return t("addingSuggestions");
};

type DocumentToolResultProps = {
  type: "create" | "update" | "request-suggestions";
  result: { id: string; title: string; kind: ArtifactKind };
  isReadonly: boolean;
};

function PureDocumentToolResult({
  type,
  result,
  isReadonly,
}: DocumentToolResultProps) {
  const t = useTranslations("document");
  const { setArtifact } = useArtifact();
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (isReadonly) {
        toast.error(t("sharedNotSupported"));
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();

      const boundingBox = {
        height: rect.height,
        left: rect.left,
        top: rect.top,
        width: rect.width,
      };

      setArtifact((currentArtifact) => ({
        boundingBox,
        content: currentArtifact.content,
        documentId: result.id,
        isVisible: true,
        kind: result.kind,
        status: "idle",
        title: result.title,
      }));
    },
    [isReadonly, result, setArtifact, t]
  );

  return (
    <button
      className="flex w-fit cursor-pointer flex-row items-center gap-2 rounded-xl border bg-background px-3 py-2"
      onClick={handleClick}
      type="button"
    >
      <div className="text-muted-foreground">
        {type === "create" ? (
          <FileIcon />
        ) : type === "update" ? (
          <PencilEditIcon />
        ) : type === "request-suggestions" ? (
          <MessageIcon />
        ) : null}
      </div>
      <div className="text-left">{getPastText(t, type, result.title)}</div>
    </button>
  );
}

export const DocumentToolResult = memo(PureDocumentToolResult, () => true);

type DocumentToolCallProps = {
  type: "create" | "update" | "request-suggestions";
  args:
    | { title: string; kind: ArtifactKind }
    | { id: string; description: string }
    | { documentId: string };
  isReadonly: boolean;
};

function PureDocumentToolCall({
  type,
  args,
  isReadonly,
}: DocumentToolCallProps) {
  const t = useTranslations("document");
  const { setArtifact } = useArtifact();
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (isReadonly) {
        toast.error(t("sharedNotSupported"));
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();

      const boundingBox = {
        height: rect.height,
        left: rect.left,
        top: rect.top,
        width: rect.width,
      };

      setArtifact((currentArtifact) => ({
        ...currentArtifact,
        boundingBox,
        isVisible: true,
      }));
    },
    [isReadonly, setArtifact, t]
  );

  return (
    <button
      className="cursor pointer flex w-fit flex-row items-start justify-between gap-3 rounded-xl border px-3 py-2"
      onClick={handleClick}
      type="button"
    >
      <div className="flex flex-row items-start gap-3">
        <div className="mt-1 text-neutral-500">
          {type === "create" ? (
            <FileIcon />
          ) : type === "update" ? (
            <PencilEditIcon />
          ) : type === "request-suggestions" ? (
            <MessageIcon />
          ) : null}
        </div>

        <div className="text-left">{getPresentText(t, type, args)}</div>
      </div>

      <div className="mt-1 animate-spin">{<LoaderIcon />}</div>
    </button>
  );
}

export const DocumentToolCall = memo(PureDocumentToolCall, () => true);
