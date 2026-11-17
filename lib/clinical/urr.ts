import { z } from "zod";
import { REFERENCES } from "./references";
import {
  type Band,
  type CalculationOutcome,
  DISCLAIMER_KEY,
  round,
} from "./types";
import { crossFieldIssue, ranged, toIssues } from "./validation";

export const URR_MINIMUM = 65;
export const URR_TARGET = 70;

/**
 * La URR es un cociente, así que sirve BUN o urea mientras pre y post usen la
 * misma magnitud y unidad. La unidad solo fija el rango de plausibilidad.
 */
function urrInputSchema(unit: UrrUnit) {
  const range = unit === "mmol/L" ? "ureaMmolL" : "ureaMgDl";
  return z
    .object({ postBun: ranged(range), preBun: ranged(range) })
    .superRefine((input, ctx) => {
      if (input.postBun >= input.preBun) {
        crossFieldIssue(ctx, "postBun", "post_bun_not_lower");
      }
    });
}

export const URR_UNITS = ["mg/dL", "mmol/L"] as const;
export type UrrUnit = (typeof URR_UNITS)[number];

export type UrrInput = {
  preBun: number;
  postBun: number;
  unit?: UrrUnit;
};

export function classifyUrr(urr: number): Band {
  if (urr < URR_MINIMUM) {
    return "alert";
  }
  return urr < URR_TARGET ? "adequate" : "optimal";
}

/**
 * Tasa de reducción de urea: URR = (BUN_pre − BUN_post) / BUN_pre × 100.
 * La banda se decide sobre el valor redondeado que ve la enfermera.
 */
export function calculateUrr(input: unknown): CalculationOutcome {
  const rawUnit = (input as { unit?: unknown } | null)?.unit ?? "mg/dL";
  if (!URR_UNITS.includes(rawUnit as UrrUnit)) {
    return {
      calculator: "urr",
      issues: [{ code: "invalid_unit", field: "unit" }],
      ok: false,
    };
  }
  const parsed = urrInputSchema(rawUnit as UrrUnit).safeParse(input ?? {});
  if (!parsed.success) {
    return { calculator: "urr", issues: toIssues(parsed.error), ok: false };
  }
  const { preBun, postBun } = parsed.data;
  const value = round(((preBun - postBun) / preBun) * 100, 1);
  const band = classifyUrr(value);

  return {
    ok: true,
    result: {
      band,
      calculator: "urr",
      details: [],
      disclaimerKey: DISCLAIMER_KEY,
      formula: "URR = (BUN_pre − BUN_post) / BUN_pre × 100",
      interpretationKey: `urr.${band}`,
      interpretationParams: { minimum: URR_MINIMUM, target: URR_TARGET },
      reference: REFERENCES.urr,
      substitution: `(${preBun} − ${postBun}) / ${preBun} × 100`,
      unit: "%",
      value,
    },
  };
}
