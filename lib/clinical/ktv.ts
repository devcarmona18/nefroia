import { z } from "zod";
import { REFERENCES } from "./references";
import {
  type Band,
  type CalculationOutcome,
  DISCLAIMER_KEY,
  round,
} from "./types";
import {
  crossFieldIssue,
  ranged,
  rangedOptional,
  toIssues,
} from "./validation";

export const KTV_MINIMUM = 1.2;
export const KTV_TARGET = 1.4;

export const ktvInputSchema = z
  .object({
    durationHours: ranged("durationHours"),
    postBun: ranged("ureaMgDl"),
    postWeightKg: ranged("weightKg"),
    preBun: ranged("ureaMgDl"),
    sessionsPerWeek: rangedOptional("sessionsPerWeek"),
    ufLiters: ranged("ufLiters"),
  })
  .superRefine((input, ctx) => {
    if (input.postBun >= input.preBun) {
      crossFieldIssue(ctx, "postBun", "post_bun_not_lower");
      return;
    }
    // El argumento del logaritmo debe ser positivo: R − 0,008·t > 0.
    if (input.postBun / input.preBun - 0.008 * input.durationHours <= 0) {
      crossFieldIssue(ctx, "durationHours", "ktv_out_of_domain");
    }
  });

export type KtvInput = {
  preBun: number;
  postBun: number;
  durationHours: number;
  ufLiters: number;
  postWeightKg: number;
  sessionsPerWeek?: number;
};

export function classifyKtv(ktv: number, sessionsPerWeek = 3): Band {
  // Los objetivos 1,2 / 1,4 solo aplican a tres sesiones semanales.
  if (sessionsPerWeek !== 3) {
    return "info";
  }
  if (ktv < KTV_MINIMUM) {
    return "alert";
  }
  return ktv < KTV_TARGET ? "adequate" : "optimal";
}

/**
 * spKt/V de Daugirdas (2.ª generación):
 *   Kt/V = −ln(R − 0,008·t) + (4 − 3,5·R) · UF / W
 * R = BUN_post / BUN_pre; t en horas; UF en litros; W = peso posdiálisis (kg).
 */
export function calculateKtv(input: unknown): CalculationOutcome {
  const parsed = ktvInputSchema.safeParse(input);
  if (!parsed.success) {
    return { calculator: "ktv", issues: toIssues(parsed.error), ok: false };
  }
  const { preBun, postBun, durationHours, ufLiters, postWeightKg } =
    parsed.data;
  const sessionsPerWeek = parsed.data.sessionsPerWeek ?? 3;

  const ratio = postBun / preBun;
  const raw =
    -Math.log(ratio - 0.008 * durationHours) +
    ((4 - 3.5 * ratio) * ufLiters) / postWeightKg;
  const value = round(raw, 2);
  const band = classifyKtv(value, sessionsPerWeek);

  return {
    ok: true,
    result: {
      band,
      calculator: "ktv",
      details: [
        { key: "ratio", unit: "", value: round(ratio, 3) },
        {
          key: "urr",
          unit: "%",
          value: round((1 - ratio) * 100, 1),
        },
      ],
      disclaimerKey: DISCLAIMER_KEY,
      formula: "Kt/V = −ln(R − 0,008·t) + (4 − 3,5·R) · UF / W",
      interpretationKey: `ktv.${band}`,
      interpretationParams: {
        minimum: KTV_MINIMUM,
        sessionsPerWeek,
        target: KTV_TARGET,
      },
      reference: REFERENCES.daugirdas1993,
      substitution: `−ln(${round(ratio, 3)} − 0,008·${durationHours}) + (4 − 3,5·${round(ratio, 3)}) · ${ufLiters} / ${postWeightKg}`,
      unit: "",
      value,
    },
  };
}
