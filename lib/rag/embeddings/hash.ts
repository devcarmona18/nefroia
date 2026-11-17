import { EMBEDDING_DIMENSIONS } from "../constants";
import { normalizeForSearch, STOPWORDS } from "../text";
import { type Embedder, l2Normalize } from "./types";

/**
 * Embedder determinista por "feature hashing" (Weinberger et al., 2009) de
 * palabras y n-gramas de caracteres. NO es semántico: captura solapamiento
 * léxico y morfológico ("hipotensión" ~ "hipotenso"). Sirve para pruebas,
 * entornos sin red (CI, e2e) y como último recurso; en producción se usa e5.
 */

function fnv1a(text: string): number {
  let hash = 0x81_1c_9d_c5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01_00_01_93);
  }
  return hash >>> 0;
}

function addFeature(vector: number[], feature: string, weight: number) {
  const hash = fnv1a(feature);
  const index = hash % vector.length;
  // Signo pseudoaleatorio: reduce el sesgo de las colisiones.
  const sign = (hash >>> 16) & 1 ? 1 : -1;
  vector[index] += sign * weight;
}

export function hashEmbedding(
  text: string,
  dimensions = EMBEDDING_DIMENSIONS
): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const words = normalizeForSearch(text).match(/[a-z0-9]+/g) ?? [];
  for (const word of words) {
    if (STOPWORDS.has(word) || word.length < 2) {
      continue;
    }
    addFeature(vector, `w:${word}`, 1);
    const padded = `<${word}>`;
    for (let i = 0; i + 4 <= padded.length; i += 1) {
      addFeature(vector, `g:${padded.slice(i, i + 4)}`, 0.5);
    }
  }
  return l2Normalize(vector);
}

export function createHashEmbedder(): Embedder {
  return {
    dimensions: EMBEDDING_DIMENSIONS,
    embedPassages: (texts) =>
      Promise.resolve(texts.map((text) => hashEmbedding(text))),
    embedQuery: (text) => Promise.resolve(hashEmbedding(text)),
    id: "hash/fnv1a-384",
    maxInputTokens: Number.POSITIVE_INFINITY,
    minRelevantSimilarity: 0.15,
  };
}
