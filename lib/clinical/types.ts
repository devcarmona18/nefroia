/**
 * Tipos compartidos por las calculadoras clínicas de NefroIA.
 *
 * Las calculadoras son funciones puras: no leen entorno, red ni base de datos.
 * Devuelven claves de traducción (no textos) para que la interfaz las muestre
 * en español o inglés, y datos numéricos que el modelo puede citar tal cual.
 */

export type CalculatorId = "urr" | "ktv" | "idwg" | "ufRate" | "fluidBalance";

/**
 * Banda de interpretación. Cada banda se muestra con color de la paleta de
 * marca Y con etiqueta de texto (nunca solo color).
 */
export type Band = "optimal" | "adequate" | "caution" | "alert" | "info";

export type ClinicalReference = {
  /** Identificador estable para enlazar con docs/arquitectura-clinica.md. */
  id: string;
  /** Cita bibliográfica corta, independiente del idioma. */
  citation: string;
};

export type CalculationDetail = {
  /** Clave en `clinical.details.*`. */
  key: string;
  value: number;
  unit: string;
};

export type CalculationResult = {
  calculator: CalculatorId;
  value: number;
  unit: string;
  band: Band;
  /** Clave en `clinical.interpretation.*`. */
  interpretationKey: string;
  /** Valores para interpolar en la interpretación (umbrales, etc.). */
  interpretationParams: Record<string, number>;
  /** Fórmula aplicada, en notación legible. */
  formula: string;
  /** Sustitución de la fórmula con los datos introducidos. */
  substitution: string;
  reference: ClinicalReference;
  details: CalculationDetail[];
  /** Clave del aviso legal/clínico que acompaña a todo resultado. */
  disclaimerKey: "clinical.disclaimer";
};

export type CalculationIssue = {
  /** Campo afectado (clave en `clinical.fields.*`); vacío si es global. */
  field: string;
  /** Código del error (clave en `clinical.errors.*`). */
  code: string;
  min?: number;
  max?: number;
  unit?: string;
};

export type CalculationOutcome =
  | { ok: true; result: CalculationResult }
  | { ok: false; calculator: CalculatorId; issues: CalculationIssue[] };

export const DISCLAIMER_KEY = "clinical.disclaimer" as const;

/** Redondeo decimal estable (evita 1.005 → 1.00 por coma flotante). */
export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
