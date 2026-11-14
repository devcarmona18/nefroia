import { parse, unparse } from "papaparse";
import { toast } from "sonner";
import { Artifact } from "@/components/chat/create-artifact";
import {
  CopyIcon,
  LineChartIcon,
  RedoIcon,
  SparklesIcon,
  UndoIcon,
} from "@/components/chat/icons";
import { SpreadsheetEditor } from "@/components/chat/sheet-editor";

type Metadata = Record<string, never>;

export const sheetArtifact = new Artifact<"sheet", Metadata>({
  actions: [
    {
      description: "viewPrevious",
      icon: <UndoIcon size={18} />,
      isDisabled: ({ currentVersionIndex }) => {
        if (currentVersionIndex === 0) {
          return true;
        }

        return false;
      },
      onClick: ({ handleVersionChange }) => {
        handleVersionChange("prev");
      },
    },
    {
      description: "viewNext",
      icon: <RedoIcon size={18} />,
      isDisabled: ({ isCurrentVersion }) => {
        if (isCurrentVersion) {
          return true;
        }

        return false;
      },
      onClick: ({ handleVersionChange }) => {
        handleVersionChange("next");
      },
    },
    {
      description: "copyCsv",
      icon: <CopyIcon />,
      onClick: ({ content, t }) => {
        const parsed = parse<string[]>(content, { skipEmptyLines: true });

        const nonEmptyRows = parsed.data.filter((row) =>
          row.some((cell) => cell.trim() !== "")
        );

        const cleanedCsv = unparse(nonEmptyRows);

        navigator.clipboard.writeText(cleanedCsv);
        toast.success(t("toasts.copiedCsv"));
      },
    },
  ],
  content: ({ content, currentVersionIndex, onSaveContent, status }) => (
    <SpreadsheetEditor
      content={content}
      currentVersionIndex={currentVersionIndex}
      isCurrentVersion={true}
      saveContent={onSaveContent}
      status={status}
    />
  ),
  description: "Useful for working with spreadsheets",
  initialize: () => null,
  kind: "sheet",
  onStreamPart: ({ setArtifact, streamPart }) => {
    if (streamPart.type === "data-sheetDelta") {
      setArtifact((draftArtifact) => ({
        ...draftArtifact,
        content: streamPart.data,
        isVisible: true,
        status: "streaming",
      }));
    }
  },
  toolbar: [
    {
      description: "formatClean",
      icon: <SparklesIcon />,
      onClick: ({ sendMessage, t }) => {
        sendMessage({
          parts: [{ text: t("messages.formatClean"), type: "text" }],
          role: "user",
        });
      },
    },
    {
      description: "analyzeVisualize",
      icon: <LineChartIcon />,
      onClick: ({ sendMessage, t }) => {
        sendMessage({
          parts: [
            {
              text: t("messages.analyzeVisualize"),
              type: "text",
            },
          ],
          role: "user",
        });
      },
    },
  ],
});
