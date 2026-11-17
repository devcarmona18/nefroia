/**
 * Detección determinista de signos de alarma ("banderas rojas") en el mensaje
 * del usuario. Complementa al prompt del sistema: aunque el modelo falle, la
 * interfaz muestra el aviso de escalamiento inmediato.
 *
 * No diagnostica: solo reconoce expresiones que, en una sala de hemodiálisis,
 * exigen avisar de inmediato según el protocolo de la unidad.
 */

export const RED_FLAG_CATEGORIES = [
  "cardiacArrest",
  "chestPain",
  "consciousness",
  "breathing",
  "severeHypotension",
  "bleeding",
  "airEmbolism",
  "anaphylaxis",
  "seizure",
  "hemolysis",
  "hyperkalemia",
] as const;

export type RedFlagCategory = (typeof RED_FLAG_CATEGORIES)[number];

const PATTERNS: Record<RedFlagCategory, RegExp[]> = {
  airEmbolism: [
    /embolia\s+(?:a[eé]rea|gaseosa)/,
    /air\s+embol/,
    /aire\s+en\s+(?:la\s+)?l[ií]nea\s+venosa/,
    /entr[oó]\s+aire/,
  ],
  anaphylaxis: [
    /anafila/,
    /anaphyla/,
    /reacci[oó]n\s+al\s+dializador/,
    /dialy[sz]er\s+reaction/,
    /edema\s+de\s+glotis/,
    /angioedema/,
  ],
  bleeding: [
    /sangrado\s+(?:abundante|masivo|activo|profuso|que\s+no\s+(?:cede|para))/,
    /hemorragia/,
    /no\s+(?:para|deja)\s+de\s+sangrar/,
    /desconexi[oó]n\s+de\s+(?:la\s+)?(?:aguja|l[ií]nea)/,
    /salida\s+(?:accidental\s+)?de\s+(?:la\s+)?aguja/,
    /needle\s+dislodg/,
    /(?:severe|heavy|massive)\s+bleeding/,
    /h(?:a)?emorrhage/,
  ],
  breathing: [
    /disnea\s+(?:s[uú]bita|severa|intensa|grave)/,
    /no\s+(?:puede|logra)\s+respirar/,
    /dificultad\s+(?:respiratoria|para\s+respirar)\s+(?:severa|s[uú]bita|grave|intensa)/,
    /saturaci[oó]n\s+(?:de\s+)?(?:menos\s+de|<|bajo|por\s+debajo\s+de)\s*(?:8\d|[0-7]\d)/,
    /cianosis/,
    /(?:severe|sudden)\s+(?:dyspnea|shortness\s+of\s+breath)/,
    /can(?:no|')t\s+breathe/,
  ],
  cardiacArrest: [
    /paro\s+card[ií]a?co/,
    /parada\s+card/,
    /paro\s+cardiorrespiratorio/,
    /sin\s+pulso/,
    /no\s+tiene\s+pulso/,
    /cardiac\s+arrest/,
    /no\s+pulse/,
    /pulseless/,
  ],
  chestPain: [
    /dolor\s+(?:opresivo\s+)?(?:en\s+el\s+|en\s+|de\s+|del\s+)(?:pecho|t[oó]rax)/,
    /dolor\s+tor[aá]cico/,
    /dolor\s+precordial/,
    /opresi[oó]n\s+(?:en\s+el\s+pecho|tor[aá]cica|precordial)/,
    /chest\s+pain/,
    /angina/,
  ],
  consciousness: [
    /p[eé]rdida\s+de\s+(?:la\s+)?con(?:s)?ciencia/,
    /perdi[oó]\s+(?:la\s+|el\s+)?con(?:o)?(?:s)?ci(?:encia|miento)/,
    /inconsciente/,
    /no\s+responde(?!\s+a)/,
    /no\s+responde\s+a(?:\s+los)?\s+(?:est[ií]mulos|la\s+voz|al\s+llamado)/,
    /no\s+responde\s+al\s+llamado/,
    /s[ií]ncope/,
    /se\s+desmay/,
    /desmayo/,
    /unresponsive/,
    /unconscious/,
    /loss\s+of\s+consciousness/,
    /syncope/,
    /passed\s+out/,
  ],
  hemolysis: [
    /hem[oó]lisis/,
    /h(?:a)?emolysis/,
    /sangre\s+(?:color\s+)?(?:vino|cereza)/,
    /cherry[\s-]red\s+blood/,
  ],
  hyperkalemia: [
    /hiperpotasemia/,
    /hiperkalemia/,
    /hyperkal(?:a)?emia/,
    /potasio\s+(?:de\s+|en\s+|>\s*|mayor\s+(?:de|a)\s+)?(?:6[.,]\d|[7-9](?:[.,]\d)?)(?!\d)/,
    /potassium\s+(?:of\s+|>\s*|above\s+)?(?:6\.\d|[7-9](?:\.\d)?)(?!\d)/,
  ],
  seizure: [
    /convulsi/,
    /crisis\s+(?:convulsiva|epil[eé]ptica)/,
    /seizure/,
    /convuls/,
  ],
  severeHypotension: [
    /hipotensi[oó]n\s+(?:severa|grave|refractaria|que\s+no\s+(?:responde|cede|mejora))/,
    /(?:no\s+responde|sin\s+respuesta)\s+a\s+(?:la\s+)?(?:soluci[oó]n\s+salina|bolos?|l[ií]quidos|trendelenburg)/,
    /(?:ta|pa|tensi[oó]n|presi[oó]n)(?:\s+arterial)?\s*(?:de\s+|en\s+|:\s*)?(?:[4-7]\d)\s*\/\s*\d{2}/,
    /shock/,
    /choque\s+(?:hipovol[eé]mico|s[eé]ptico|cardiog[eé]nico)/,
    /(?:severe|refractory)\s+hypotension/,
  ],
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ");
}

/** Categorías de alarma presentes en el texto (sin duplicados). */
export function detectRedFlags(text: string): RedFlagCategory[] {
  const normalized = normalize(text);
  return RED_FLAG_CATEGORIES.filter((category) =>
    PATTERNS[category].some((pattern) => pattern.test(normalized))
  );
}
