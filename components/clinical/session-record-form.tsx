"use client";

import { Loader2Icon, WandSparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import {
  type CreateRecordState,
  createSessionRecordAction,
} from "@/app/(clinical)/hojas/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function SessionRecordForm() {
  const t = useTranslations("sessionRecords.create");
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<
    CreateRecordState,
    FormData
  >(createSessionRecordAction, { status: "idle" });

  useEffect(() => {
    if (state.status === "error") {
      toast.error(t("error"));
    }
    if (state.status === "created") {
      if (state.redacted > 0) {
        toast.info(t("redacted", { count: state.redacted }));
      }
      router.push(`/hojas/${state.id}`);
    }
  }, [state, router, t]);

  return (
    <form
      action={formAction}
      className="grid gap-2 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] print:hidden"
      data-testid="session-record-form"
    >
      <Label className="font-medium" htmlFor="session-notes">
        {t("title")}
      </Label>
      <Textarea
        aria-describedby="session-notes-hint"
        className="min-h-28"
        id="session-notes"
        maxLength={6000}
        minLength={10}
        name="notes"
        placeholder={t("placeholder")}
        required
      />
      <p className="text-muted-foreground text-xs" id="session-notes-hint">
        {t("label")}
      </p>
      <Button className="justify-self-end" disabled={isPending} type="submit">
        {isPending ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <WandSparklesIcon className="size-4" />
        )}
        {isPending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
