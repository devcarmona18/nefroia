import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  InfoIcon,
  type LucideIcon,
  SparklesIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { Band } from "@/lib/clinical/types";
import { cn } from "@/lib/utils";

/**
 * Banda de interpretación: color + icono + texto. El significado nunca
 * depende solo del color (WCAG 1.4.1); los pares texto/fondo superan 4.5:1.
 */
export const BAND_STYLES: Record<
  Band,
  { className: string; icon: LucideIcon }
> = {
  adequate: {
    className:
      "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-100",
    icon: CheckCircle2Icon,
  },
  alert: {
    className:
      "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/60 dark:text-red-100",
    icon: AlertTriangleIcon,
  },
  caution: {
    className:
      "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100",
    icon: CircleAlertIcon,
  },
  info: {
    className:
      "border-slate-300 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100",
    icon: InfoIcon,
  },
  optimal: {
    className:
      "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-100",
    icon: SparklesIcon,
  },
};

export function BandBadge({
  band,
  className,
}: {
  band: Band;
  className?: string;
}) {
  const t = useTranslations("clinical.bands");
  const { className: styles, icon: Icon } = BAND_STYLES[band];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium text-xs",
        styles,
        className
      )}
      data-band={band}
      data-testid="band-badge"
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {t(band)}
    </span>
  );
}
