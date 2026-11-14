import type { Locale as DateFnsLocale } from "date-fns";
import { enUS, es } from "date-fns/locale";

/** Locale de date-fns según el idioma de la interfaz. */
export function getDateFnsLocale(locale: string): DateFnsLocale {
  return locale === "es" ? es : enUS;
}
