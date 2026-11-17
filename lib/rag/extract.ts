import type { PageText } from "./clean";

export type ProtocolKind = "pdf" | "docx" | "markdown" | "text";

export type ExtractedDocument = {
  pages: PageText[];
  /** Número de páginas físicas (solo PDF). */
  pageCount: number | null;
};

async function extractPdf(bytes: Uint8Array): Promise<ExtractedDocument> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  // pdf.js puede transferir (y vaciar) el buffer: se le pasa una copia.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  try {
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    return {
      pageCount: totalPages,
      pages: text.map((pageText, index) => ({
        page: index + 1,
        text: pageText,
      })),
    };
  } finally {
    await pdf.destroy();
  }
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    const lower = String(entity).toLowerCase();
    if (lower.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    }
    if (lower.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    }
    return ENTITIES[lower] ?? match;
  });
}

/**
 * HTML simple (salida de mammoth) → texto con encabezados Markdown, para que
 * el troceado conserve la estructura de secciones del documento Word.
 */
export function htmlToStructuredText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(
        /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
        (_match, level: string, inner: string) =>
          `\n\n${"#".repeat(Number(level))} ${inner.replace(/<[^>]+>/g, "").trim()}\n\n`
      )
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<\/(p|div|ul|ol|table|tr|blockquote)>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/t[dh]>/gi, " | ")
      .replace(/<[^>]+>/g, "")
  );
}

async function extractDocx(bytes: Uint8Array): Promise<ExtractedDocument> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.convertToHtml({
    buffer: Buffer.from(bytes),
  });
  // Word no tiene páginas fijas: la cita se hace por sección.
  return {
    pageCount: null,
    pages: [{ page: null, text: htmlToStructuredText(value) }],
  };
}

function extractPlain(bytes: Uint8Array): ExtractedDocument {
  const text = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
  return { pageCount: null, pages: [{ page: null, text }] };
}

export function extractDocument(
  bytes: Uint8Array,
  kind: ProtocolKind
): Promise<ExtractedDocument> {
  switch (kind) {
    case "pdf":
      return extractPdf(bytes);
    case "docx":
      return extractDocx(bytes);
    default:
      return Promise.resolve(extractPlain(bytes));
  }
}
