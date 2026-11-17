/**
 * Utilidades de texto compartidas por la ingesta y la búsqueda. Puras y sin
 * dependencias, para poder probarlas de forma aislada.
 */

const DIACRITICS = /\p{Diacritic}/gu;

/**
 * Minúsculas y sin tildes: "Hipotensión" y "hipotension" deben coincidir en la
 * búsqueda léxica (el personal escribe a menudo sin tildes en el móvil). Se
 * aplica igual al indexar y al consultar.
 */
export function normalizeForSearch(text: string): string {
  return text.normalize("NFD").replace(DIACRITICS, "").toLowerCase();
}

/**
 * Estimación conservadora de tokens (~4 caracteres por token). Los tokenizadores
 * subword (XLM-R en e5, cl100k en OpenAI) producen para el español entre 3,8 y
 * 4,8 caracteres por token; sobrestimar es preferible a truncar el embedding.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Palabras vacías del español (y algunas del inglés) para consultas léxicas. */
export const STOPWORDS = new Set([
  "a",
  "al",
  "algo",
  "ante",
  "antes",
  "como",
  "con",
  "contra",
  "cual",
  "cuales",
  "cuando",
  "de",
  "del",
  "desde",
  "donde",
  "durante",
  "e",
  "el",
  "ella",
  "ellas",
  "ellos",
  "en",
  "entre",
  "era",
  "es",
  "esa",
  "ese",
  "eso",
  "esta",
  "este",
  "esto",
  "estos",
  "estas",
  "ha",
  "hay",
  "la",
  "las",
  "le",
  "les",
  "lo",
  "los",
  "mas",
  "me",
  "mi",
  "muy",
  "ni",
  "no",
  "nos",
  "o",
  "os",
  "para",
  "pero",
  "por",
  "que",
  "quien",
  "se",
  "segun",
  "ser",
  "si",
  "sin",
  "sobre",
  "son",
  "su",
  "sus",
  "tambien",
  "te",
  "tiene",
  "tras",
  "tu",
  "un",
  "una",
  "uno",
  "unos",
  "unas",
  "y",
  "ya",
  "hacer",
  "debo",
  "debe",
  "deben",
  "cuanto",
  "cuantos",
  "the",
  "of",
  "and",
  "or",
  "to",
  "in",
  "is",
  "what",
  "how",
  "for",
  "with",
  "on",
  "an",
]);

/** Términos de búsqueda: normalizados, sin palabras vacías, sin duplicados. */
export function searchTerms(text: string): string[] {
  const words = normalizeForSearch(text).match(/[a-z0-9]+/g) ?? [];
  const terms: string[] = [];
  for (const word of words) {
    if (word.length < 2 || STOPWORDS.has(word) || terms.includes(word)) {
      continue;
    }
    terms.push(word);
  }
  return terms;
}

/**
 * Consulta tsquery en modo OR ("a | b | c"). `websearch_to_tsquery` y
 * `plainto_tsquery` usan AND, demasiado estricto para preguntas en lenguaje
 * natural; el ranking (ts_rank_cd) premia los fragmentos con más términos.
 * Los términos solo contienen [a-z0-9], así que no hay inyección en tsquery.
 */
export function toOrTsQuery(text: string, maxTerms = 12): string | null {
  const terms = searchTerms(text).slice(0, maxTerms);
  return terms.length > 0 ? terms.join(" | ") : null;
}
