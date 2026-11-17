/**
 * Limpieza del texto extraído antes de trocearlo. Los PDF son la fuente más
 * ruidosa: cabeceras y pies repetidos en cada página, números de página,
 * palabras partidas con guion al final de línea y ligaduras tipográficas.
 */

export type PageText = {
  /** Número de página (1..n) o null si el formato no tiene páginas fijas. */
  page: number | null;
  text: string;
};

// Caracteres de control (categoría Unicode Cc) salvo \t y \n.
const CONTROL_CHARS = /\p{Cc}/gu;
const keepTabsAndNewlines = (char: string) =>
  char === "\n" || char === "\t" ? char : "";
const LIGATURES: Record<string, string> = {
  ﬀ: "ff",
  ﬁ: "fi",
  ﬂ: "fl",
  ﬃ: "ffi",
  ﬄ: "ffl",
};
const PAGE_NUMBER_LINE =
  /^\s*(?:p[aá]g(?:ina)?\.?\s*|page\s*)?\d{1,4}(?:\s*(?:de|of|\/)\s*\d{1,4})?\s*$/i;

/** Normalización a nivel de carácter y línea (válida para cualquier formato). */
export function cleanText(text: string): string {
  return (
    text
      .normalize("NFC")
      .replace(/\r\n?/g, "\n")
      .replace(CONTROL_CHARS, keepTabsAndNewlines)
      .replace(/[ﬀ-ﬄ]/g, (ligature) => LIGATURES[ligature] ?? ligature)
      .replace(/[   ]/g, " ")
      .replace(/[​-‍﻿]/g, "")
      // Palabra partida con guion al final de línea: "hipo-\ntensión".
      .replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2")
      .replace(/[ \t]+/g, " ")
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function lineSignature(line: string) {
  // Los números cambian de página a página ("Página 3 de 9", fechas...).
  return line.toLowerCase().replace(/\d+/g, "#").trim();
}

/**
 * Elimina cabeceras/pies repetidos: líneas que aparecen entre las dos primeras
 * o las dos últimas de al menos el 60 % de las páginas (con ≥ 3 páginas), y
 * líneas que solo contienen un número de página.
 */
export function removeRepeatedLines(pages: PageText[]): PageText[] {
  const minPages = 3;
  const edgeLines = 2;
  const counts = new Map<string, number>();

  if (pages.length >= minPages) {
    for (const { text } of pages) {
      const lines = text.split("\n").filter((line) => line.trim());
      const edges = new Set([
        ...lines.slice(0, edgeLines),
        ...lines.slice(-edgeLines),
      ]);
      for (const line of edges) {
        const signature = lineSignature(line);
        counts.set(signature, (counts.get(signature) ?? 0) + 1);
      }
    }
  }

  const threshold = Math.ceil(pages.length * 0.6);
  const isRepeated = (line: string) =>
    pages.length >= minPages &&
    (counts.get(lineSignature(line)) ?? 0) >= threshold;

  return pages.map(({ page, text }) => {
    const lines = text.split("\n");
    const contentIndexes = lines
      .map((line, index) => (line.trim() ? index : -1))
      .filter((index) => index >= 0);
    // Solo se eliminan en los bordes de la página: la misma frase en el
    // cuerpo del texto es contenido, no cabecera.
    const edges = new Set([
      ...contentIndexes.slice(0, edgeLines),
      ...contentIndexes.slice(-edgeLines),
    ]);
    const kept = lines.filter((line, index) => {
      if (line.trim() && PAGE_NUMBER_LINE.test(line)) {
        return false;
      }
      return !(edges.has(index) && isRepeated(line));
    });
    return { page, text: kept.join("\n") };
  });
}

/** Limpieza completa de un documento paginado. */
export function cleanPages(pages: PageText[]): PageText[] {
  return removeRepeatedLines(
    pages.map(({ page, text }) => ({ page, text: cleanText(text) }))
  )
    .map(({ page, text }) => ({ page, text: cleanText(text) }))
    .filter(({ text }) => text.length > 0);
}
