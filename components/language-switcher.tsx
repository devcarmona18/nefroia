"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type MouseEvent, useCallback, useTransition } from "react";
import { setLocale } from "@/i18n/actions";
import { type Locale, locales } from "@/i18n/config";
import { cn } from "@/lib/utils";

/**
 * Selector de idioma (ES/EN). Guarda la elección en una cookie mediante una
 * server action y refresca la ruta para renderizar con el nuevo idioma.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations("language");
  const current = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleChange = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const locale = event.currentTarget.dataset.locale as Locale;
      if (locale === current) {
        return;
      }
      startTransition(async () => {
        await setLocale(locale);
        router.refresh();
      });
    },
    [current, router]
  );

  return (
    <fieldset
      aria-label={t("label")}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border/50 p-0.5 text-[11px]",
        className
      )}
      data-testid="language-switcher"
    >
      {locales.map((locale) => (
        <button
          aria-label={t(locale)}
          aria-pressed={current === locale}
          className={cn(
            "rounded-md px-2 py-1 font-medium uppercase transition-colors",
            current === locale
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          data-locale={locale}
          data-testid={`language-${locale}`}
          disabled={isPending}
          key={locale}
          onClick={handleChange}
          type="button"
        >
          {locale}
        </button>
      ))}
    </fieldset>
  );
}
