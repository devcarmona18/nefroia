import { z } from "zod";
import { REFERENCES } from "./references";
import {
  type Band,
  type CalculationOutcome,
  DISCLAIMER_KEY,
  round,
} from "./types";
import { crossFieldIssue, ranged, toIssues } from "./validation";

/** Umbral de uso habitual (no normativo): > 4 % del peso seco. */
export const IDWG_ALERT_PERCENT = 4;
/** Diferencias mayores entre dos pesadas consecutivas se consideran error. */
const MAX_PLAUSIBLE_GAIN_KG = 15;
const MAX_PLAUSIBLE_LOSS_KG = 10;

export const idwgInputSchema = z
  .object({
    dryWeightKg: ranged("dryWeightKg"),
    previousPostWeightKg: ranged("weightKg"),
    preWeightKg: ranged("weightKg"),
  })
  .superRefine((input, ctx) => {
    const gain = input.preWeightKg - input.previousPostWeightKg;
    if (gain > MAX_PLAUSIBLE_GAIN_KG || gain < -MAX_PLAUSIBLE_LOSS_KG) {
      crossFieldIssue(ctx, "preWeightKg", "implausible_weight_change");
    }
  });

export type IdwgInput = {
  preWeightKg: number;
  previousPostWeightKg: number;
  dryWeightKg: number;
};

export function classifyIdwg(percentOfDryWeight: number): Band {
  if (percentOfDryWeight < 0) {
    return "info";
  }
  return percentOfDryWeight > IDWG_ALERT_PERCENT ? "alert" : "adequate";
}

/**
 * Ganancia de peso interdialítica (GID):
 *   GID (kg) = peso pre − peso post de la sesión anterior
 *   GID (%)  = GID / peso seco × 100
 */
export function calculateIdwg(input: unknown): CalculationOutcome {
  const parsed = idwgInputSchema.safeParse(input);
  if (!parsed.success) {
    return { calculator: "idwg", issues: toIssues(parsed.error), ok: false };
  }
  const { preWeightKg, previousPostWeightKg, dryWeightKg } = parsed.data;
  const gainKg = round(preWeightKg - previousPostWeightKg, 2);
  const percent = round((gainKg / dryWeightKg) * 100, 1);
  const band = classifyIdwg(percent);

  return {
    ok: true,
    result: {
      band,
      calculator: "idwg",
      details: [{ key: "gainKg", unit: "kg", value: gainKg }],
      disclaimerKey: DISCLAIMER_KEY,
      formula:
        "GID = peso_pre − peso_post_previo; GID % = GID / peso_seco × 100",
      interpretationKey: `idwg.${band}`,
      interpretationParams: { threshold: IDWG_ALERT_PERCENT },
      reference: REFERENCES.idwg,
      substitution: `(${preWeightKg} − ${previousPostWeightKg}) / ${dryWeightKg} × 100`,
      unit: "%",
      value: percent,
    },
  };
}
