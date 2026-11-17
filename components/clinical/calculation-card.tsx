"use client";

import { CalculatorIcon, TriangleAlertIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import type {
  CalculationIssue,
  CalculationOutcome,
  CalculationResult,
  CalculatorId,
} from "@/lib/clinical/types";
import { cn } from "@/lib/utils";
import { BAND_STYLES, BandBadge } from "./band";

function useNumber() {
  const format = useFormatter();
  return (value: number, digits = 2) =>
    format.number(value, { maximumFractionDigits: digits });
}

/**
 * Las fórmulas se escriben con coma decimal y la sustitución con los valores
 * numéricos tal cual: se unifica el separador según el idioma.
 */
export function localizeDecimals(text: string, locale: string) {
  const separator = locale.startsWith("es") ? "," : ".";
  return text.replace(/(\d)[.,](\d)/g, `$1${separator}$2`);
}

function unitSuffix(unit: string) {
  if (!unit) {
    return "";
  }
  return unit === "%" ? " %" : ` ${unit}`;
}

export function CalculationResultView({
  result,
  compact = false,
}: {
  result: CalculationResult;
  compact?: boolean;
}) {
  const t = useTranslations("clinical");
  const locale = useLocale();
  const formatNumber = useNumber();
  const titleId = `calc-${result.calculator}-title`;
  const interpretationParams = Object.fromEntries(
    Object.entries(result.interpretationParams).map(([key, value]) => [
      key,
      formatNumber(value),
    ])
  );

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "rounded-xl border bg-card text-card-foreground shadow-[var(--shadow-card)]",
        compact ? "p-3" : "p-4"
      )}
      data-calculator={result.calculator}
      data-testid="calculation-card"
    >
      <header className="flex items-start justify-between gap-3">
        <h3
          className="flex items-center gap-2 font-medium text-muted-foreground text-sm"
          id={titleId}
        >
          <CalculatorIcon aria-hidden="true" className="size-4" />
          {t(`calculators.${result.calculator}`)}
        </h3>
        <BandBadge band={result.band} />
      </header>

      <p className="mt-2 font-semibold text-3xl tabular-nums tracking-tight">
        <span data-testid="calculation-value">
          {formatNumber(result.value)}
        </span>
        <span className="ml-1 font-normal text-base text-muted-foreground">
          {unitSuffix(result.unit).trim()}
        </span>
      </p>

      <p
        className={cn(
          "mt-2 rounded-md border px-3 py-2 text-sm",
          BAND_STYLES[result.band].className
        )}
        data-testid="calculation-interpretation"
      >
        {t(`interpretation.${result.interpretationKey}`, interpretationParams)}
      </p>

      {result.details.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          {result.details.map((detail) => (
            <div
              className="rounded-md bg-muted/50 px-2 py-1.5"
              key={detail.key}
            >
              <dt className="text-muted-foreground text-xs">
                {t(`details.${detail.key}`)}
              </dt>
              <dd className="font-medium tabular-nums">
                {formatNumber(detail.value)}
                {unitSuffix(detail.unit)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {!compact && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            {t("formulaAndReference")}
          </summary>
          <div className="mt-2 space-y-2">
            <p>
              <span className="font-medium">{t("formula")}: </span>
              <code className="rounded bg-muted px-1 py-0.5">
                {localizeDecimals(result.formula, locale)}
              </code>
            </p>
            <p>
              <span className="font-medium">{t("substitution")}: </span>
              <code className="rounded bg-muted px-1 py-0.5">
                {localizeDecimals(result.substitution, locale)}
              </code>
            </p>
            <p>
              <span className="font-medium">{t("reference")}: </span>
              <cite className="not-italic">{result.reference.citation}</cite>
            </p>
          </div>
        </details>
      )}

      {!compact && (
        <p className="mt-3 border-t pt-2 text-muted-foreground text-xs">
          {t("disclaimer")}
        </p>
      )}
    </section>
  );
}

function IssueItem({ issue }: { issue: CalculationIssue }) {
  const t = useTranslations("clinical");
  const field = issue.field
    ? t.has(`fields.${issue.field}`)
      ? t(`fields.${issue.field}`)
      : issue.field
    : "";
  const message = t.has(`errors.${issue.code}`)
    ? t(`errors.${issue.code}`, {
        max: issue.max ?? "",
        min: issue.min ?? "",
        unit: issue.unit ?? "",
      })
    : t("errors.invalid");
  return (
    <li>
      {field ? <span className="font-medium">{field}: </span> : null}
      {message}
    </li>
  );
}

export function CalculationIssuesView({
  calculator,
  issues,
}: {
  calculator: CalculatorId;
  issues: CalculationIssue[];
}) {
  const t = useTranslations("clinical");
  return (
    <section
      className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 text-sm dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100"
      data-testid="calculation-issues"
      role="alert"
    >
      <h3 className="flex items-center gap-2 font-medium">
        <TriangleAlertIcon aria-hidden="true" className="size-4" />
        {t("invalidTitle", { calculator: t(`calculators.${calculator}`) })}
      </h3>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {issues.map((issue) => (
          <IssueItem issue={issue} key={`${issue.field}-${issue.code}`} />
        ))}
      </ul>
    </section>
  );
}

export function CalculationCard({ outcome }: { outcome: CalculationOutcome }) {
  if (outcome.ok) {
    return <CalculationResultView result={outcome.result} />;
  }
  return (
    <CalculationIssuesView
      calculator={outcome.calculator}
      issues={outcome.issues}
    />
  );
}
