"use client";

import { ClipboardListIcon, ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { SessionRecordToolOutput } from "@/lib/ai/tools/session-record";
import { CalculationResultView } from "./calculation-card";
import { SessionAlertList } from "./session-alerts";

export function FieldList({ fields }: { fields: string[] }) {
  const t = useTranslations("sessionRecords.fields");
  return <>{fields.map((field) => t(field)).join(", ")}</>;
}

export function SessionRecordCard({
  output,
}: {
  output: SessionRecordToolOutput;
}) {
  const t = useTranslations("sessionRecords");
  if (!output.ok) {
    return (
      <div
        className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm"
        role="alert"
      >
        {t(`toolErrors.${output.error}`)}
      </div>
    );
  }
  return (
    <section
      aria-labelledby={`record-${output.recordId}`}
      className="space-y-3 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]"
      data-testid="session-record-card"
    >
      <header className="flex items-start justify-between gap-3">
        <h3
          className="flex items-center gap-2 font-medium text-sm"
          id={`record-${output.recordId}`}
        >
          <ClipboardListIcon aria-hidden="true" className="size-4" />
          {t("card.title", { alias: output.patientAlias ?? t("noAlias") })}
        </h3>
        <Link
          className="inline-flex items-center gap-1 text-primary text-xs hover:underline"
          href={`/hojas/${output.recordId}`}
        >
          {t("card.open")}
          <ExternalLinkIcon aria-hidden="true" className="size-3" />
        </Link>
      </header>

      <SessionAlertList alerts={output.alerts} />

      {output.calculations.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {output.calculations.map((result) => (
            <CalculationResultView
              compact
              key={result.calculator}
              result={result}
            />
          ))}
        </div>
      )}

      {output.missingFields.length > 0 && (
        <p className="text-sm" data-testid="missing-fields">
          <span className="font-medium">{t("missing")}: </span>
          <FieldList fields={output.missingFields} />
        </p>
      )}
      {output.unverifiedFields.length > 0 && (
        <p className="text-amber-800 text-sm dark:text-amber-200">
          <span className="font-medium">{t("unverified")}: </span>
          <FieldList fields={output.unverifiedFields} />
        </p>
      )}
      <p className="border-t pt-2 text-muted-foreground text-xs">
        {t("reviewNotice")}
      </p>
    </section>
  );
}
