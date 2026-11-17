import type { PageText } from "./clean";
import { estimateTokens } from "./text";

/**
 * Troceado ("chunking") consciente de la estructura:
 *  1. El texto se divide en bloques (párrafos, listas, encabezados).
 *  2. Los encabezados (Markdown "#", numerados "2.1 Título" o EN MAYÚSCULAS)
 *     actualizan la ruta de sección "Título › Subtítulo" que acompaña a cada
 *     fragmento como metadato de cita.
 *  3. Los bloques se acumulan hasta `maxTokens`; un encabezado nuevo cierra el
 *     fragmento si ya tiene un tamaño mínimo (las secciones son unidades de
 *     sentido y la cita "§ sección" queda exacta).
 *  4. Un bloque mayor que `maxTokens` se parte por frases (y, en último caso,
 *     por palabras).
 *  5. Dentro de una misma sección, cada fragmento nuevo repite las últimas
 *     frases del anterior (`overlapTokens`) para no perder contexto en el corte.
 */

export type ChunkOptions = {
  maxTokens: number;
  overlapTokens: number;
  /** Tamaño a partir del cual un encabezado nuevo cierra el fragmento. */
  minTokens: number;
};

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  maxTokens: 800,
  minTokens: 120,
  overlapTokens: 100,
};

export type Chunk = {
  ordinal: number;
  content: string;
  /** Página donde empieza el fragmento (null en formatos sin páginas). */
  page: number | null;
  /** Ruta de sección, p. ej. "Hipotensión intradiálisis › Actuación". */
  heading: string | null;
  tokenCount: number;
};

type Block =
  | { kind: "heading"; level: number; text: string; page: number | null }
  | { kind: "text"; text: string; page: number | null };

const MARKDOWN_HEADING = /^(#{1,6})\s+(.+?)\s*#*$/;
const NUMBERED_HEADING =
  /^(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+(\p{Lu}[^.!?]{2,80})$/u;
const LIST_ITEM = /^(?:[-*•·]|\d{1,2}[.)])\s+/;
const MAX_HEADING_CHARS = 90;

function isUpperCaseHeading(line: string) {
  const letters = line.replace(/[^\p{L}]/gu, "");
  return (
    letters.length >= 4 &&
    line.length <= MAX_HEADING_CHARS &&
    letters === letters.toUpperCase() &&
    letters !== letters.toLowerCase() &&
    !/[.;,]$/.test(line)
  );
}

function detectHeading(line: string): { level: number; text: string } | null {
  const markdown = MARKDOWN_HEADING.exec(line);
  if (markdown) {
    return { level: markdown[1].length, text: markdown[2].trim() };
  }
  const numbered = NUMBERED_HEADING.exec(line);
  if (numbered && line.length <= MAX_HEADING_CHARS) {
    return {
      level: numbered[1].split(".").length,
      text: `${numbered[1]} ${numbered[2].trim()}`,
    };
  }
  if (isUpperCaseHeading(line)) {
    return { level: 1, text: line };
  }
  return null;
}

/** Párrafos separados por línea en blanco; las listas conservan sus saltos. */
export function toBlocks(pages: PageText[]): Block[] {
  const blocks: Block[] = [];
  for (const { page, text } of pages) {
    let paragraph: string[] = [];
    const flush = () => {
      if (paragraph.length > 0) {
        const joined = paragraph.reduce((acc, line) => {
          if (!acc) {
            return line;
          }
          return LIST_ITEM.test(line) ? `${acc}\n${line}` : `${acc} ${line}`;
        }, "");
        blocks.push({ kind: "text", page, text: joined });
        paragraph = [];
      }
    };
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line) {
        flush();
        continue;
      }
      const heading = detectHeading(line);
      if (heading) {
        flush();
        blocks.push({ kind: "heading", page, ...heading });
        continue;
      }
      paragraph.push(line);
    }
    flush();
  }
  return blocks;
}

const SENTENCE_BOUNDARY = /(?<=[.!?;:])\s+(?=[\p{Lu}\d¿¡(-])|\n/u;

export function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_BOUNDARY)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** Parte un texto en piezas ≤ maxTokens (por frases y, si no basta, palabras). */
function splitOversized(text: string, maxTokens: number): string[] {
  const pieces: string[] = [];
  for (const sentence of splitSentences(text)) {
    if (estimateTokens(sentence) <= maxTokens) {
      pieces.push(sentence);
      continue;
    }
    let current = "";
    for (const word of sentence.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (estimateTokens(candidate) > maxTokens && current) {
        pieces.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) {
      pieces.push(current);
    }
  }
  return pieces;
}

/** Últimas frases de un texto que caben en `overlapTokens`. */
function overlapTail(text: string, overlapTokens: number): string {
  if (overlapTokens <= 0) {
    return "";
  }
  const sentences = splitSentences(text);
  const tail: string[] = [];
  let tokens = 0;
  for (let i = sentences.length - 1; i >= 0; i -= 1) {
    const sentenceTokens = estimateTokens(sentences[i]);
    if (tokens + sentenceTokens > overlapTokens) {
      break;
    }
    tail.unshift(sentences[i]);
    tokens += sentenceTokens;
  }
  return tail.join(" ");
}

export function chunkPages(
  pages: PageText[],
  options: Partial<ChunkOptions> = {}
): Chunk[] {
  const { maxTokens, minTokens, overlapTokens } = {
    ...DEFAULT_CHUNK_OPTIONS,
    ...options,
  };
  if (overlapTokens >= maxTokens) {
    throw new Error("overlapTokens debe ser menor que maxTokens");
  }

  const chunks: Chunk[] = [];
  const headingStack: { level: number; text: string }[] = [];
  let parts: string[] = [];
  let partsPage: number | null = null;
  let partsHeading: string | null = null;

  const headingPath = () =>
    headingStack.length > 0
      ? headingStack.map((heading) => heading.text).join(" › ")
      : null;

  const currentTokens = () => estimateTokens(parts.join("\n\n"));

  const emit = (withOverlap: boolean) => {
    const content = parts.join("\n\n").trim();
    if (!content) {
      parts = [];
      return;
    }
    chunks.push({
      content,
      heading: partsHeading,
      ordinal: chunks.length,
      page: partsPage,
      tokenCount: estimateTokens(content),
    });
    const tail = withOverlap ? overlapTail(content, overlapTokens) : "";
    // El solapamiento nunca es todo el fragmento (evita bucles sin avance).
    parts = tail && tail !== content ? [tail] : [];
  };

  const addPiece = (text: string, page: number | null) => {
    const candidate = [...parts, text].join("\n\n");
    if (parts.length > 0 && estimateTokens(candidate) > maxTokens) {
      emit(true);
      // Si el solapamiento + la pieza no caben, se descarta el solapamiento.
      if (estimateTokens([...parts, text].join("\n\n")) > maxTokens) {
        parts = [];
      }
      partsPage = page;
    }
    if (parts.length === 0) {
      partsPage = page;
      partsHeading = headingPath();
    }
    parts.push(text);
  };

  for (const block of toBlocks(pages)) {
    if (block.kind === "heading") {
      if (parts.length > 0 && currentTokens() >= minTokens) {
        emit(false);
      }
      while ((headingStack.at(-1)?.level ?? 0) >= block.level) {
        headingStack.pop();
      }
      headingStack.push({ level: block.level, text: block.text });
      if (parts.length > 0) {
        // Sección corta fusionada con la anterior: el título queda en el texto.
        parts.push(block.text);
      }
      continue;
    }
    const pieces =
      estimateTokens(block.text) > maxTokens
        ? splitOversized(block.text, maxTokens - overlapTokens)
        : [block.text];
    for (const piece of pieces) {
      addPiece(piece, block.page);
    }
  }
  emit(false);
  return chunks;
}
