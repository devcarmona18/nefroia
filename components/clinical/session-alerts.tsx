"use client";

import { AlertOctagonIcon, AlertTriangleIcon, InfoIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type {
  SessionAlert,
  SessionAlertSeverity,
} from "@/lib/clinical/session-record";
import { cn } from "@/lib/utils";

const SEVERITY_STYLES: Record<SessionAlertSeverity, string> = {
  critical:
    "border-red-400 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/60 dark:text-red-100",
  info: "border-slate-300 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100",
  warning:
    "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100",
};

const SEVERITY_ICONS = {
  critical: AlertOctagonIcon,
  info: InfoIcon,
  warning: AlertTriangleIcon,
};

export function SessionAlertList({ alerts }: { alerts: SessionAlert[] }) {
  const t = useTranslations("sessionRecords.alerts");
  const tFlags = useTranslations("safety.redFlags.categories");
  const format = useFormatter();
  if (alerts.length === 0) {
    return null;
  }
  return (
    <ul className="space-y-1.5" data-testid="session-alerts">
      {alerts.map((alert) => {
        const Icon = SEVERITY_ICONS[alert.severity];
        const params =
          alert.code === "redFlag"
            ? {
                categories: String(alert.params.categories)
                  .split(",")
                  .map((category) => tFlags(category))
                  .join(", "),
              }
            : Object.fromEntries(
                Object.entries(alert.params).map(([name, value]) => [
                  name,
                  typeof value === "number"
                    ? format.number(value, { maximumFractionDigits: 2 })
                    : value,
                ])
              );
        const key = alert.code.startsWith("calc.")
          ? `calc.${alert.code.slice(5)}`
          : alert.code;
        return (
          <li
            className={cn(
              "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
              SEVERITY_STYLES[alert.severity]
            )}
            data-severity={alert.severity}
            key={`${alert.code}-${JSON.stringify(alert.params)}`}
          >
            <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-medium">
                {t(`severity.${alert.severity}`)}:{" "}
              </span>
              {t.has(key) ? t(key, params) : alert.code}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
