import { z } from "zod";
import { REFERENCES } from "./references";
import {
  type Band,
  type CalculationOutcome,
  DISCLAIMER_KEY,
  round,
} from "./types";
import { ranged, toIssues } from "./validation";

export const UF_RATE_CAUTION = 10;
export const UF_RATE_ALERT = 13;

export const ufRateInputSchema = z.object({
  durationHours: ranged("durationHours"),
  ufVolumeMl: ranged("ufMl"),
  /** Peso posdiálisis o peso seco/objetivo, en kg. */
  weightKg: ranged("weightKg"),
});

export type UfRateInput = {
  ufVolumeMl: number;
  weightKg: number;
  durationHours: number;
};

export function classifyUfRate(rate: number): Band {
  if (rate > UF_RATE_ALERT) {
    return "alert";
  }
  return rate > UF_RATE_CAUTION ? "caution" : "optimal";
}

/**
 * Tasa de ultrafiltración normalizada:
 *   TUF (mL/kg/h) = volumen UF (mL) / (peso (kg) × duración (h))
 */
export function calculateUfRate(input: unknown): CalculationOutcome {
  const parsed = ufRateInputSchema.safeParse(input);
  if (!parsed.success) {
    return { calculator: "ufRate", issues: toIssues(parsed.error), ok: false };
  }
  const { ufVolumeMl, weightKg, durationHours } = parsed.data;
  const value = round(ufVolumeMl / (weightKg * durationHours), 1);
  const band = classifyUfRate(value);

  return {
    ok: true,
    result: {
      band,
      calculator: "ufRate",
      details: [
        {
          key: "ufPerHour",
          unit: "mL/h",
          value: round(ufVolumeMl / durationHours, 0),
        },
      ],
      disclaimerKey: DISCLAIMER_KEY,
      formula: "TUF = UF (mL) / (peso (kg) × tiempo (h))",
      interpretationKey: `ufRate.${band}`,
      interpretationParams: {
        alert: UF_RATE_ALERT,
        caution: UF_RATE_CAUTION,
      },
      reference: REFERENCES.ufRate,
      substitution: `${ufVolumeMl} / (${weightKg} × ${durationHours})`,
      unit: "mL/kg/h",
      value,
    },
  };
}
