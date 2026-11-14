"use client";

import { useTranslations } from "next-intl";

/**
 * Sugerencias de inicio del chat (ejemplos de enfermería renal), localizadas.
 * Edita la lista en `messages/es.json` y `messages/en.json` (clave
 * `chat.suggestions`).
 */
export function useSuggestions(): string[] {
  const t = useTranslations("chat");
  return t.raw("suggestions") as string[];
}
