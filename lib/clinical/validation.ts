import { z } from "zod";
import type { CalculationIssue } from "./types";

type RangeSpec = { min: number; max: number; unit: string };

/**
 * Límites de plausibilidad de cada magnitud. No son rangos "normales": solo
 * descartan valores imposibles o errores de unidad (p. ej. 2500 L de UF o
 * 240 h de sesión). Ámbito: pacientes adultos en hemodiálisis.
 */
export const RANGES = {
  dryWeightKg: { max: 300, min: 20, unit: "kg" },
  durationHours: { max: 10, min: 0.5, unit: "h" },
  fluidMl: { max: 10_000, min: 0, unit: "mL" },
  sessionsPerWeek: { max: 7, min: 1, unit: "" },
  ufLiters: { max: 10, min: 0, unit: "L" },
  ufMl: { max: 10_000, min: 0, unit: "mL" },
  ureaMgDl: { max: 500, min: 1, unit: "mg/dL" },
  ureaMmolL: { max: 100, min: 0.5, unit: "mmol/L" },
  weightKg: { max: 300, min: 20, unit: "kg" },
} as const satisfies Record<string, RangeSpec>;

export type RangeName = keyof typeof RANGES;

type IssueParams = { code: string; min?: number; max?: number; unit?: string };

function issueParams(code: string, range: RangeSpec): { params: IssueParams } {
  return {
    params: { code, max: range.max, min: range.min, unit: range.unit },
  };
}

function checkRange(
  value: unknown,
  ctx: z.RefinementCtx,
  range: RangeSpec,
  allowMissing: boolean
) {
  if (value === undefined || value === null || value === "") {
    if (!allowMissing) {
      ctx.addIssue({ code: "custom", ...issueParams("required", range) });
    }
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    ctx.addIssue({ code: "custom", ...issueParams("not_a_number", range) });
    return;
  }
  if (value < range.min) {
    ctx.addIssue({ code: "custom", ...issueParams("too_low", range) });
    return;
  }
  if (value > range.max) {
    ctx.addIssue({ code: "custom", ...issueParams("too_high", range) });
  }
}

/**
 * Número finito dentro de un rango de plausibilidad. Los errores llevan un
 * código (traducible en `clinical.errors.*`) y el rango permitido. Se valida
 * sobre `unknown` para devolver siempre nuestros códigos, no los de zod.
 */
export function ranged(name: RangeName) {
  const range: RangeSpec = RANGES[name];
  return z
    .unknown()
    .superRefine((value, ctx) =>
      checkRange(value, ctx, range, false)
    ) as unknown as z.ZodType<number>;
}

/**
 * Igual que `ranged`, pero admite ausencia. El valor por defecto se aplica
 * después de validar (ver `orZero` / `??` en cada calculadora).
 */
export function rangedOptional(name: RangeName) {
  const range: RangeSpec = RANGES[name];
  return z
    .unknown()
    .superRefine((value, ctx) => checkRange(value, ctx, range, true))
    .optional() as unknown as z.ZodOptional<z.ZodType<number | null>>;
}

/** Error de coherencia entre campos (p. ej. BUN post ≥ BUN pre). */
export function crossFieldIssue(
  ctx: z.RefinementCtx,
  field: string,
  code: string
) {
  ctx.addIssue({ code: "custom", params: { code }, path: [field] });
}

/** Convierte los errores de zod en incidencias traducibles. */
export function toIssues(error: z.ZodError): CalculationIssue[] {
  return error.issues.map((issue) => {
    const { params } = issue as { params?: IssueParams };
    return {
      code: params?.code ?? "invalid",
      field: issue.path.map(String).join("."),
      ...(params?.min === undefined ? {} : { min: params.min }),
      ...(params?.max === undefined ? {} : { max: params.max }),
      ...(params?.unit ? { unit: params.unit } : {}),
    };
  });
}
