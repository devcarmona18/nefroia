import { z } from "zod";
import { REFERENCES } from "./references";
import {
  type Band,
  type CalculationOutcome,
  DISCLAIMER_KEY,
  round,
} from "./types";
import { rangedOptional, toIssues } from "./validation";

export const INTAKE_FIELDS = [
  "oralIntakeMl",
  "ivFluidsMl",
  "primingRinsebackMl",
  "transfusionMl",
] as const;

export const OUTPUT_FIELDS = [
  "ultrafiltrationMl",
  "urineMl",
  "otherLossesMl",
] as const;

const ALL_FIELDS = [...INTAKE_FIELDS, ...OUTPUT_FIELDS];

export const fluidBalanceInputSchema = z
  .object({
    ivFluidsMl: rangedOptional("fluidMl"),
    oralIntakeMl: rangedOptional("fluidMl"),
    otherLossesMl: rangedOptional("fluidMl"),
    primingRinsebackMl: rangedOptional("fluidMl"),
    transfusionMl: rangedOptional("fluidMl"),
    ultrafiltrationMl: rangedOptional("fluidMl"),
    urineMl: rangedOptional("fluidMl"),
  })
  .superRefine((input, ctx) => {
    // Un balance sin ningún dato no es "cero": es un cálculo vacío.
    // Un 0 explícito sí es un dato; solo cuenta la ausencia (undefined/null).
    if (
      ALL_FIELDS.every(
        (field) => input[field] === undefined || input[field] === null
      )
    ) {
      ctx.addIssue({
        code: "custom",
        params: { code: "no_fluid_data" },
        path: [],
      });
    }
  });

export type FluidBalanceInput = Partial<
  Record<(typeof ALL_FIELDS)[number], number>
>;

export function classifyFluidBalance(_balanceMl: number): Band {
  // Sin umbral normativo: se informa el signo y la valoración es clínica.
  // Un balance 0 tampoco es "adecuado" por sí mismo (depende del objetivo).
  return "info";
}

function balanceKey(balanceMl: number): string {
  if (balanceMl < 0) {
    return "fluidBalance.negative";
  }
  return balanceMl > 0 ? "fluidBalance.positive" : "fluidBalance.neutral";
}

/**
 * Balance hídrico de la sesión:
 *   balance = ingresos (oral + IV + cebado/retorno + transfusión)
 *           − egresos (ultrafiltración + diuresis + otras pérdidas)
 */
export function calculateFluidBalance(input: unknown): CalculationOutcome {
  const parsed = fluidBalanceInputSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return {
      calculator: "fluidBalance",
      issues: toIssues(parsed.error),
      ok: false,
    };
  }
  const data = Object.fromEntries(
    ALL_FIELDS.map((field) => [field, parsed.data[field] ?? 0])
  ) as Record<(typeof ALL_FIELDS)[number], number>;
  const intake = INTAKE_FIELDS.reduce((sum, field) => sum + data[field], 0);
  const output = OUTPUT_FIELDS.reduce((sum, field) => sum + data[field], 0);
  const value = round(intake - output, 0);

  return {
    ok: true,
    result: {
      band: classifyFluidBalance(value),
      calculator: "fluidBalance",
      details: [
        { key: "totalIntake", unit: "mL", value: round(intake, 0) },
        { key: "totalOutput", unit: "mL", value: round(output, 0) },
      ],
      disclaimerKey: DISCLAIMER_KEY,
      formula:
        "Balance = ingresos (oral + IV + cebado/retorno + transfusión) − egresos (UF + diuresis + otras pérdidas)",
      interpretationKey: balanceKey(value),
      interpretationParams: {},
      reference: REFERENCES.fluidBalance,
      substitution: `(${INTAKE_FIELDS.map((f) => data[f]).join(" + ")}) − (${OUTPUT_FIELDS.map((f) => data[f]).join(" + ")})`,
      unit: "mL",
      value,
    },
  };
}
