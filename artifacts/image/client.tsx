import { toast } from "sonner";
import { Artifact } from "@/components/chat/create-artifact";
import { CopyIcon, RedoIcon, UndoIcon } from "@/components/chat/icons";
import { ImageEditor } from "@/components/chat/image-editor";

export const imageArtifact = new Artifact({
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
      description: "copyImage",
      icon: <CopyIcon size={18} />,
      onClick: ({ content, t }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${content}`;

        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0);
          canvas.toBlob((blob) => {
            if (blob) {
              navigator.clipboard.write([
                new ClipboardItem({ "image/png": blob }),
              ]);
            }
          }, "image/png");
        };

        toast.success(t("toasts.copiedImage"));
      },
    },
  ],
  content: ImageEditor,
  description: "Useful for image generation",
  kind: "image",
  onStreamPart: ({ streamPart, setArtifact }) => {
    if (streamPart.type === "data-imageDelta") {
      setArtifact((draftArtifact) => ({
        ...draftArtifact,
        content: streamPart.data,
        isVisible: true,
        status: "streaming",
      }));
    }
  },
  toolbar: [],
});
