"use client";

import { PrinterIcon, TrashIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useTransition } from "react";
import { toast } from "sonner";
import { deleteSessionRecordAction } from "@/app/(clinical)/hojas/actions";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  const t = useTranslations("sessionRecords");
  const handlePrint = useCallback(() => window.print(), []);
  return (
    <Button
      data-testid="print-record"
      onClick={handlePrint}
      size="sm"
      variant="outline"
    >
      <PrinterIcon className="size-4" />
      {t("print")}
    </Button>
  );
}

export function DeleteRecordButton({ id }: { id: string }) {
  const t = useTranslations("sessionRecords");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleDelete = useCallback(() => {
    // biome-ignore lint/suspicious/noAlert: confirmación nativa, accesible
    if (!window.confirm(t("deleteConfirm"))) {
      return;
    }
    startTransition(async () => {
      const { ok } = await deleteSessionRecordAction(id);
      if (ok) {
        toast.success(t("deleted"));
        router.push("/hojas");
      }
    });
  }, [id, router, t]);

  return (
    <Button
      disabled={isPending}
      onClick={handleDelete}
      size="sm"
      variant="ghost"
    >
      <TrashIcon className="size-4" />
      {t("delete")}
    </Button>
  );
}
