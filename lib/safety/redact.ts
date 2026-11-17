/**
 * Redacción de datos personales (PII/PHI) antes de persistir un mensaje o
 * enviarlo a un proveedor de IA.
 *
 * Es una función pura basada en reglas (expresiones regulares), no en un
 * modelo: es determinista, auditable, no añade latencia y no envía el dato a
 * ningún tercero para "detectarlo". Prioriza la exhaustividad sobre la
 * precisión: ante la duda, oculta. Limitaciones en docs/arquitectura-clinica.md.
 */

export const PII_TYPES = [
  "email",
  "phone",
  "medicalRecord",
  "birthDate",
  "nationalId",
  "name",
] as const;

export type PiiType = (typeof PII_TYPES)[number];

/** Marcadores que sustituyen al dato. El prompt del sistema los explica. */
export const PII_PLACEHOLDERS: Record<PiiType, string> = {
  birthDate: "[FECHA_NACIMIENTO]",
  email: "[CORREO]",
  medicalRecord: "[HISTORIA_CLINICA]",
  name: "[NOMBRE]",
  nationalId: "[DOCUMENTO]",
  phone: "[TELEFONO]",
};

export type RedactionResult = {
  text: string;
  /** Número de sustituciones por tipo (solo tipos con al menos una). */
  counts: Partial<Record<PiiType, number>>;
  total: number;
};

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

// Móvil colombiano (3XX XXX XXXX) o fijo con indicativo 60X, con o sin +57.
const PHONE =
  /(?<![\d.])(?:\+?57[\s.-]?)?(?:3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}|\(?60[1-8]\)?[\s.-]?\d{3}[\s.-]?\d{4})(?![\d.]\d)/g;
const PHONE_WITH_CUE =
  /((?:tel[eé]fono|tel|cel(?:ular)?|m[oó]vil|whatsapp|contacto|phone)\.?\s*(?:n[°ºo.]*\s*|#\s*|:\s*)*)(\+?\d[\d\s.-]{5,14}\d)/gi;

const DATE = String.raw`(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}\s+de\s+[a-záéíóú]+\s+(?:de\s+|del\s+)?\d{4})`;
const BIRTH_DATE = new RegExp(
  String.raw`((?:fecha\s+de\s+nacimiento|f\.?\s?nac(?:imiento)?\.?|nacid[oa](?:\s+el)?|naci[oó](?:\s+el)?|\bfn\b|\bdob\b|date\s+of\s+birth|born(?:\s+on)?)\s*[:-]?\s*)${DATE}`,
  "gi"
);

const MEDICAL_RECORD =
  /((?:historia\s+cl[ií]nica|n[úu]mero\s+de\s+historia|\bh\.?\s?c\.?(?=[\s:#])|\bhistoria(?=\s*(?:n[°ºo.]|#|:))|\bmrn\b|medical\s+record(?:\s+number)?|expediente|n[úu]mero\s+de\s+ingreso|episodio)\s*(?:n[°ºo.]*\s*|#\s*|:\s*)*)((?=[A-Za-z0-9-]*\d)[A-Za-z0-9][A-Za-z0-9-]{3,})/gi;

const ID_NUMBER = String.raw`(?:\d{1,3}(?:[.\s]\d{3}){2,3}|\d{6,11})`;
const ID_SEPARATOR = String.raw`\s*(?:n[°ºo.]*\s*|#\s*|:\s*)*`;
// Palabras que anuncian un documento (sin distinguir mayúsculas).
const ID_WITH_CUE = new RegExp(
  String.raw`((?:c[eé]dula(?:\s+de\s+(?:ciudadan[ií]a|extranjer[ií]a))?|tarjeta\s+de\s+identidad|documento(?:\s+de\s+identidad)?|identificaci[oó]n|identificad[oa]\s+con|\bnuip\b|\bdni\b|pasaporte|registro\s+civil|\bc\.\s?c\.?|\bcc\b(?!\s*(?:de|por|/)))${ID_SEPARATOR})${ID_NUMBER}`,
  "gi"
);
// Siglas que solo cuentan como documento en mayúsculas (TI, CE, RC).
const ID_WITH_UPPERCASE_CUE = new RegExp(
  String.raw`((?:\bT\.?\s?I\.?|\bC\.?\s?E\.?|\bR\.?\s?C\.?)${ID_SEPARATOR})${ID_NUMBER}`,
  "g"
);
// Número suelto con forma de cédula: 8-10 dígitos o grupos de miles con punto.
// No se toca si va seguido de una unidad clínica (p. ej. "5.000.000 UI").
const BARE_ID =
  /(?<![\w.,/-])(?:\d{1,3}(?:\.\d{3}){2,3}|\d{8,10})(?![\w/-]|[.,]\d|\s*(?:ml|mg|mcg|µg|ui|u\b|kg|g\b|l\b|%|mmol|meq|cc\b|células|cel\b|\/))/gi;

const NAME_CUE =
  /(?<![\p{L}\d])(paciente|pte\.?|pcte\.?|sr\.?|sra\.?|srta\.?|señor(?:a|ita)?|don|doña|usuari[oa]|nombre(?:\s+completo)?(?:\s+del\s+paciente)?|patient|mr\.?|mrs\.?|ms\.?)(\s*:\s*|\s+)/giu;
const NAME_PARTICLE = /^(?:de|del|la|las|los|y|da|dos|van|von)$/;
const CAPITALIZED = /^\p{Lu}\p{Ll}+$/u;
const ALL_CAPS = /^\p{Lu}{3,}$/u;
const WORD = /^([\p{L}'’-]+)(\s+)?/u;
const MAX_NAME_TOKENS = 5;

// Palabras que suelen ir en mayúscula tras "paciente" sin ser un nombre.
const NOT_A_NAME = new Set(
  [
    "a",
    "al",
    "ante",
    "con",
    "sin",
    "en",
    "de",
    "del",
    "el",
    "la",
    "los",
    "las",
    "un",
    "una",
    "no",
    "se",
    "que",
    "por",
    "para",
    "y",
    "o",
    "su",
    "refiere",
    "presenta",
    "ingresa",
    "llega",
    "acude",
    "tolera",
    "niega",
    "manifiesta",
    "consciente",
    "estable",
    "masculino",
    "femenino",
    "adulto",
    "adulta",
    "mayor",
    "renal",
    "crónico",
    "cronico",
    "nuevo",
    "nueva",
    "hd",
    "fav",
    "hta",
    "dm",
    "erc",
    "irc",
    "cvc",
    "uci",
    "bun",
    "kdoqi",
    "with",
    "the",
    "is",
    "has",
    "was",
    "presents",
    "reports",
    "male",
    "female",
    "who",
    "on",
    "in",
    "hemodinámicamente",
    "hemodinamicamente",
    "diabético",
    "diabetico",
    "hipertenso",
    "hipertensa",
    "hospitalizado",
    "ambulatorio",
    "hemodiálisis",
    "hemodialisis",
    "diálisis",
    "dialisis",
    "número",
    "numero",
    "habitual",
    "conocido",
    "conocida",
    "programado",
    "programada",
  ].map((word) => word.toLowerCase())
);

function isNameToken(token: string) {
  if (NOT_A_NAME.has(token.toLowerCase())) {
    return false;
  }
  return CAPITALIZED.test(token) || ALL_CAPS.test(token);
}

/**
 * Longitud del nombre propio que empieza en `rest` (0 si no hay nombre):
 * hasta cinco palabras capitalizadas, admitiendo partículas ("de la", "del").
 */
function matchNameLength(rest: string): number {
  let offset = 0;
  let end = 0;
  let tokens = 0;

  while (tokens < MAX_NAME_TOKENS) {
    const match = WORD.exec(rest.slice(offset));
    if (!match) {
      break;
    }
    const [, token, gap = ""] = match;
    const isParticle = tokens > 0 && NAME_PARTICLE.test(token);
    if (!(isParticle || isNameToken(token))) {
      break;
    }
    offset += token.length + gap.length;
    if (!isParticle) {
      tokens += 1;
      end = offset - gap.length;
    }
    // Un salto de línea o la ausencia de espacio termina el nombre.
    if (!gap || gap.includes("\n")) {
      break;
    }
  }
  return end;
}

function redactNames(text: string, onMatch: () => void): string {
  let output = "";
  let cursor = 0;
  NAME_CUE.lastIndex = 0;

  for (;;) {
    const cue = NAME_CUE.exec(text);
    if (!cue) {
      break;
    }
    const nameStart = cue.index + cue[0].length;
    const length = matchNameLength(text.slice(nameStart));
    if (length === 0) {
      continue;
    }
    output += text.slice(cursor, nameStart) + PII_PLACEHOLDERS.name;
    cursor = nameStart + length;
    NAME_CUE.lastIndex = cursor;
    onMatch();
  }
  return output + text.slice(cursor);
}

/**
 * Oculta datos identificativos en un texto libre en español (Colombia) o
 * inglés. El orden importa: primero los patrones con contexto más específico.
 */
export function redactPii(input: string): RedactionResult {
  const counts: Partial<Record<PiiType, number>> = {};
  const count = (type: PiiType) => {
    counts[type] = (counts[type] ?? 0) + 1;
  };
  const replaceAll = (
    source: string,
    pattern: RegExp,
    type: PiiType,
    keepCue: boolean
  ) =>
    source.replace(pattern, (_match, cue: string) => {
      count(type);
      return `${keepCue ? cue : ""}${PII_PLACEHOLDERS[type]}`;
    });

  let text = input;
  text = replaceAll(text, EMAIL, "email", false);
  text = replaceAll(text, BIRTH_DATE, "birthDate", true);
  text = replaceAll(text, MEDICAL_RECORD, "medicalRecord", true);
  text = replaceAll(text, ID_WITH_CUE, "nationalId", true);
  text = replaceAll(text, ID_WITH_UPPERCASE_CUE, "nationalId", true);
  text = replaceAll(text, PHONE_WITH_CUE, "phone", true);
  text = replaceAll(text, PHONE, "phone", false);
  text = replaceAll(text, BARE_ID, "nationalId", false);
  text = redactNames(text, () => count("name"));

  const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
  return { counts, text, total };
}

/** Suma dos recuentos de redacción (p. ej. varias partes de un mensaje). */
export function mergeRedactionCounts(
  a: Partial<Record<PiiType, number>>,
  b: Partial<Record<PiiType, number>>
): Partial<Record<PiiType, number>> {
  const merged: Partial<Record<PiiType, number>> = { ...a };
  for (const type of PII_TYPES) {
    if (b[type]) {
      merged[type] = (merged[type] ?? 0) + (b[type] ?? 0);
    }
  }
  return merged;
}

const PLACEHOLDER_PATTERN = new RegExp(
  Object.values(PII_PLACEHOLDERS)
    .map((value) => value.replace(/[[\]]/g, "\\$&"))
    .join("|")
);

/** Indica si un texto ya contiene marcadores de redacción. */
export function containsRedactionPlaceholder(text: string): boolean {
  return PLACEHOLDER_PATTERN.test(text);
}

type TextLikePart = { type: string; text?: string };

/**
 * Aplica la redacción a las partes de texto de un mensaje. Devuelve partes
 * nuevas (no muta) y el recuento agregado.
 */
export function redactMessageParts<T extends TextLikePart>(
  parts: T[]
): { parts: T[]; counts: Partial<Record<PiiType, number>>; total: number } {
  let counts: Partial<Record<PiiType, number>> = {};
  let total = 0;
  const redacted = parts.map((part) => {
    if (part.type !== "text" || typeof part.text !== "string") {
      return part;
    }
    const result = redactPii(part.text);
    counts = mergeRedactionCounts(counts, result.counts);
    total += result.total;
    return result.total > 0 ? { ...part, text: result.text } : part;
  });
  return { counts, parts: redacted, total };
}
