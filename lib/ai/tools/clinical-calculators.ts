import { tool } from "ai";
import { z } from "zod";
import {
  type CalculationOutcome,
  calculateFluidBalance,
  calculateIdwg,
  calculateKtv,
  calculateUfRate,
  calculateUrr,
} from "@/lib/clinical";

/**
 * Calculadoras clínicas como herramientas del modelo.
 *
 * El esquema de entrada es deliberadamente permisivo (números sin rango): si
 * el modelo envía un valor implausible, la herramienta no falla en el SDK sino
 * que devuelve `ok: false` con códigos traducibles que la tarjeta muestra y
 * que el modelo puede explicar ("¿la duración está en minutos?"). La
 * validación real (rangos de plausibilidad y coherencia) vive en
 * `lib/clinical/*`, una sola fuente de verdad probada con Vitest.
 *
 * No requieren aprobación: son cálculos deterministas, sin efectos.
 */

const number = (description: string) => z.number().describe(description);
const optionalNumber = (description: string) =>
  z.number().optional().describe(description);

const COMMON =
  "Usa SOLO valores que el usuario haya dado; si falta alguno, pídeselo en lugar de suponerlo. El resultado se muestra en una tarjeta: no repitas la fórmula, comenta la interpretación en 1-2 frases.";

export const calcularURR = tool({
  description: `Calcula la tasa de reducción de urea (URR, %) a partir del BUN o la urea pre y posdiálisis. ${COMMON}`,
  execute: (input): CalculationOutcome => calculateUrr(input),
  inputSchema: z.object({
    postBun: number("BUN/urea posdiálisis."),
    preBun: number("BUN/urea prediálisis."),
    unit: z
      .enum(["mg/dL", "mmol/L"])
      .optional()
      .describe("Unidad de ambos valores (por defecto mg/dL)."),
  }),
});

export const calcularKtV = tool({
  description: `Calcula el spKt/V con la fórmula de Daugirdas de 2.ª generación. ${COMMON}`,
  execute: (input): CalculationOutcome => calculateKtv(input),
  inputSchema: z.object({
    durationHours: number("Duración de la sesión en HORAS (240 min = 4)."),
    postBun: number("BUN posdiálisis (mg/dL)."),
    postWeightKg: number("Peso posdiálisis en kg."),
    preBun: number("BUN prediálisis (mg/dL)."),
    sessionsPerWeek: optionalNumber("Sesiones por semana (por defecto 3)."),
    ufLiters: number("Ultrafiltración total en LITROS (2500 mL = 2,5)."),
  }),
});

export const calcularGananciaInterdialitica = tool({
  description: `Calcula la ganancia de peso interdialítica en kg y en % del peso seco. ${COMMON}`,
  execute: (input): CalculationOutcome => calculateIdwg(input),
  inputSchema: z.object({
    dryWeightKg: number("Peso seco prescrito en kg."),
    previousPostWeightKg: number(
      "Peso posdiálisis de la sesión anterior en kg."
    ),
    preWeightKg: number("Peso prediálisis de hoy en kg."),
  }),
});

export const calcularTasaUltrafiltracion = tool({
  description: `Calcula la tasa de ultrafiltración normalizada (mL/kg/h). ${COMMON}`,
  execute: (input): CalculationOutcome => calculateUfRate(input),
  inputSchema: z.object({
    durationHours: number("Duración de la sesión en HORAS."),
    ufVolumeMl: number("Volumen de ultrafiltración en mL."),
    weightKg: number("Peso posdiálisis (o peso seco) en kg."),
  }),
});

export const calcularBalanceHidrico = tool({
  description: `Calcula el balance hídrico de la sesión (ingresos − egresos, mL). Omite los conceptos que el usuario no mencione. ${COMMON}`,
  execute: (input): CalculationOutcome => calculateFluidBalance(input),
  inputSchema: z.object({
    ivFluidsMl: optionalNumber("Líquidos IV / bolos de solución salina (mL)."),
    oralIntakeMl: optionalNumber("Ingesta oral durante la sesión (mL)."),
    otherLossesMl: optionalNumber("Otras pérdidas: vómito, sangrado... (mL)."),
    primingRinsebackMl: optionalNumber(
      "Cebado/retorno de sangre administrado al paciente (mL)."
    ),
    transfusionMl: optionalNumber("Hemoderivados transfundidos (mL)."),
    ultrafiltrationMl: optionalNumber("Ultrafiltración total (mL)."),
    urineMl: optionalNumber("Diuresis durante la sesión (mL)."),
  }),
});

export { CALCULATOR_TOOL_NAMES } from "./calculator-names";
