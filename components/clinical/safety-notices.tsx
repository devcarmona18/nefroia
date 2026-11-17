"use client";

import { ShieldAlertIcon, ShieldCheckIcon, SirenIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { RedFlagCategory } from "@/lib/safety/red-flags";
import type { PiiType } from "@/lib/safety/redact";
import { cn } from "@/lib/utils";

/** Aviso al usuario: se ocultaron datos personales antes de llamar al modelo. */
export function RedactionNotice({
  total,
  counts,
}: {
  total: number;
  counts: Partial<Record<PiiType, number>>;
}) {
  const t = useTranslations("safety.redaction");
  const types = Object.keys(counts)
    .map((type) => t(`types.${type}`))
    .join(", ");
  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sky-900 text-xs dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-100"
      data-testid="redaction-notice"
      role="status"
    >
      <ShieldCheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{t("body", { count: total, types })}</span>
    </div>
  );
}

/** Escalamiento inmediato ante signos de alarma (independiente del modelo). */
export function RedFlagAlert({
  categories,
}: {
  categories: RedFlagCategory[];
}) {
  const t = useTranslations("safety.redFlags");
  return (
    <div
      className="rounded-lg border-2 border-red-500 bg-red-50 px-4 py-3 text-red-950 dark:border-red-600 dark:bg-red-950/70 dark:text-red-50"
      data-testid="red-flag-alert"
      role="alert"
    >
      <p className="flex items-center gap-2 font-semibold text-sm">
        <SirenIcon aria-hidden="true" className="size-4" />
        {t("title")}
      </p>
      <p className="mt-1 text-sm">{t("body")}</p>
      <p className="mt-1 text-xs opacity-90">
        {t("detected", {
          categories: categories.map((c) => t(`categories.${c}`)).join(", "),
        })}
      </p>
    </div>
  );
}

/** Aviso persistente del rol de apoyo a la decisión (visible en todo momento). */
export function ClinicalDisclaimer({
  className,
  variant = "inline",
}: {
  className?: string;
  variant?: "inline" | "banner";
}) {
  const t = useTranslations("safety");
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-muted-foreground",
        variant === "banner"
          ? "rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950 text-xs dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100"
          : "text-[11px] leading-snug",
        className
      )}
      data-testid="clinical-disclaimer"
    >
      <ShieldAlertIcon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      <span>{t("disclaimer")}</span>
    </p>
  );
}
