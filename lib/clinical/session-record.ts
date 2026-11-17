import { z } from "zod";
import { detectRedFlags, type RedFlagCategory } from "@/lib/safety/red-flags";
import { containsRedactionPlaceholder } from "@/lib/safety/redact";
import { calculateFluidBalance } from "./fluid-balance";
import { calculateIdwg } from "./idwg";
import { calculateKtv } from "./ktv";
import type { CalculationResult } from "./types";
import { calculateUfRate } from "./uf-rate";
import { calculateUrr } from "./urr";

/**
 * Hoja de sesión de hemodiálisis estructurada a partir de notas libres.
 *
 * Principio: el modelo EXTRAE, no completa. Todo campo ausente queda en null
 * y se lista en `missingFields`. Además, cada número propuesto por el modelo
 * se contrasta con los números que aparecen en las notas: si no está (ni en
 * una conversión de unidad evidente), se descarta y se lista como
 * `unverifiedFields`. Así un valor alucinado nunca llega a la hoja.
 */

const nullableNumber = (description: string) =>
  z.number().nullable().describe(description);
const nullableText = (description: string) =>
  z.string().nullable().describe(description);

export const sessionExtractionSchema = z.object({
  bunPostMgDl: nullableNumber("BUN/urea posdiálisis en mg/dL, o null."),
  bunPreMgDl: nullableNumber("BUN/urea prediálisis en mg/dL, o null."),
  dialyzer: nullableText("Dializador/filtro (modelo o superficie), o null."),
  dryWeightKg: nullableNumber("Peso seco prescrito en kg, o null."),
  durationHours: nullableNumber(
    "Duración real de la sesión en HORAS (240 min = 4), o null."
  ),
  events: z
    .array(
      z.object({
        description: z.string().describe("Incidencia tal como se describe."),
        time: nullableText("Hora (HH:MM) si se indica, o null."),
      })
    )
    .describe("Incidencias de la sesión (hipotensión, calambres...)."),
  fluidsAdministeredMl: nullableNumber(
    "Volumen total administrado (bolos de solución salina, etc.) en mL, o null."
  ),
  heparin: nullableText("Anticoagulación tal como se describe, o null."),
  machine: nullableText("Identificador de la máquina/monitor, o null."),
  notes: nullableText("Otras observaciones relevantes, o null."),
  patientAlias: nullableText(
    "SOLO iniciales o seudónimo del paciente (p. ej. 'J.P.'), nunca el nombre; null si no hay."
  ),
  postWeightKg: nullableNumber("Peso posdiálisis en kg, o null."),
  previousPostWeightKg: nullableNumber(
    "Peso posdiálisis de la sesión ANTERIOR en kg, o null."
  ),
  preWeightKg: nullableNumber("Peso prediálisis en kg, o null."),
  sessionDate: nullableText("Fecha de la sesión (AAAA-MM-DD), o null."),
  ufAchievedMl: nullableNumber("Ultrafiltración conseguida en mL, o null."),
  ufGoalMl: nullableNumber("Objetivo de ultrafiltración en mL, o null."),
  vascularAccess: nullableText(
    "Acceso vascular (FAV, injerto, catéter...) y localización, o null."
  ),
  vitals: z
    .array(
      z.object({
        diastolic: nullableNumber("PA diastólica en mmHg, o null."),
        heartRate: nullableNumber("Frecuencia cardiaca en lpm, o null."),
        systolic: nullableNumber("PA sistólica en mmHg, o null."),
        time: nullableText("Hora o momento (pre, 1h, post...), o null."),
      })
    )
    .describe("Controles de PA/FC en orden cronológico (el primero = pre)."),
});

export type SessionExtraction = z.infer<typeof sessionExtractionSchema>;

/** Campos escalares numéricos que se verifican contra las notas. */
export const NUMERIC_FIELDS = [
  "preWeightKg",
  "postWeightKg",
  "dryWeightKg",
  "previousPostWeightKg",
  "durationHours",
  "ufGoalMl",
  "ufAchievedMl",
  "fluidsAdministeredMl",
  "bunPreMgDl",
  "bunPostMgDl",
] as const;

type NumericField = (typeof NUMERIC_FIELDS)[number];

/** Campos que una hoja de sesión completa debería tener. */
export const EXPECTED_FIELDS = [
  "patientAlias",
  "sessionDate",
  "machine",
  "dialyzer",
  "vascularAccess",
  "preWeightKg",
  "postWeightKg",
  "dryWeightKg",
  "durationHours",
  "ufGoalMl",
  "ufAchievedMl",
  "heparin",
  "vitals",
] as const;

export type SessionAlertSeverity = "critical" | "warning" | "info";

export type SessionAlert = {
  /** Clave en `sessionRecords.alerts.*`. */
  code: string;
  severity: SessionAlertSeverity;
  params: Record<string, number | string>;
};

export type SessionRecordDraft = SessionExtraction & {
  missingFields: string[];
  unverifiedFields: string[];
  calculations: CalculationResult[];
  alerts: SessionAlert[];
};

/** Números presentes en el texto ("72,5" y "72.5" valen igual). */
export function numbersInText(text: string): number[] {
  const matches = text.match(/\d+(?:[.,]\d+)?/g) ?? [];
  return matches.map((match) => Number(match.replace(",", ".")));
}

const close = (a: number, b: number) =>
  Math.abs(a - b) <= Math.max(0.011, Math.abs(b) * 0.001);

/**
 * ¿El valor aparece en las notas, directamente o tras una conversión de
 * unidad evidente (L↔mL, h↔min, "4 h 30 min" = 4,5 h)?
 */
export function isGroundedNumber(value: number, sourceNumbers: number[]) {
  const candidates = [
    value,
    value / 1000,
    value * 1000,
    value * 60,
    value / 60,
  ];
  if (
    candidates.some((candidate) =>
      sourceNumbers.some((source) => close(candidate, source))
    )
  ) {
    return true;
  }
  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);
  return (
    minutes > 0 &&
    sourceNumbers.some((n) => close(n, hours)) &&
    sourceNumbers.some((n) => close(n, minutes))
  );
}

const FULL_NAME_WORD = /^\p{Lu}\p{Ll}{2,}$/u;

/**
 * Deja solo iniciales o seudónimo. Un nombre completo ("Juan Pérez") se
 * convierte en iniciales ("J.P."); marcadores de redacción o cifras largas
 * (posible documento) se descartan.
 */
export function sanitizePatientAlias(alias: string | null): string | null {
  const trimmed = alias?.trim();
  if (!trimmed || containsRedactionPlaceholder(trimmed)) {
    return null;
  }
  if (/\d{5,}/.test(trimmed)) {
    return null;
  }
  const words = trimmed.split(/\s+/);
  if (words.length >= 2 && words.every((word) => FULL_NAME_WORD.test(word))) {
    return words.map((word) => `${word[0]}.`).join("");
  }
  return trimmed.slice(0, 24);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function runCalculations(record: SessionExtraction): CalculationResult[] {
  const results: CalculationResult[] = [];
  const push = (outcome: ReturnType<typeof calculateUrr>) => {
    if (outcome.ok) {
      results.push(outcome.result);
    }
  };
  const {
    preWeightKg: pre,
    postWeightKg: post,
    dryWeightKg: dry,
    previousPostWeightKg: previousPost,
    durationHours: hours,
    ufAchievedMl,
    ufGoalMl,
    bunPreMgDl,
    bunPostMgDl,
    fluidsAdministeredMl,
  } = record;

  if (pre !== null && previousPost !== null && dry !== null) {
    push(
      calculateIdwg({
        dryWeightKg: dry,
        previousPostWeightKg: previousPost,
        preWeightKg: pre,
      })
    );
  }
  const ufMl = ufAchievedMl ?? ufGoalMl;
  const weight = post ?? dry;
  if (ufMl !== null && weight !== null && hours !== null) {
    push(
      calculateUfRate({
        durationHours: hours,
        ufVolumeMl: ufMl,
        weightKg: weight,
      })
    );
  }
  if (bunPreMgDl !== null && bunPostMgDl !== null) {
    push(calculateUrr({ postBun: bunPostMgDl, preBun: bunPreMgDl }));
    const ufLiters =
      ufAchievedMl === null
        ? pre !== null && post !== null
          ? Math.max(0, pre - post)
          : null
        : ufAchievedMl / 1000;
    if (hours !== null && post !== null && ufLiters !== null) {
      push(
        calculateKtv({
          durationHours: hours,
          postBun: bunPostMgDl,
          postWeightKg: post,
          preBun: bunPreMgDl,
          ufLiters,
        })
      );
    }
  }
  if (ufAchievedMl !== null) {
    push(
      calculateFluidBalance({
        ivFluidsMl: fluidsAdministeredMl ?? undefined,
        ultrafiltrationMl: ufAchievedMl,
      })
    );
  }
  return results;
}

function vitalAlerts(record: SessionExtraction): SessionAlert[] {
  const alerts: SessionAlert[] = [];
  const systolics = record.vitals
    .map((vital) => vital.systolic)
    .filter((value): value is number => value !== null);
  if (systolics.length > 0) {
    const nadir = Math.min(...systolics);
    // Hipotensión intradiálisis: PAS nadir < 90 mmHg (Flythe, JASN 2015).
    if (nadir < 90) {
      alerts.push({
        code: "hypotensionNadir",
        params: { nadir },
        severity: "warning",
      });
    }
    // Caída ≥ 20 mmHg respecto a la PAS previa (KDOQI 2005, con síntomas).
    const drop = systolics[0] - nadir;
    if (drop >= 20) {
      alerts.push({
        code: "systolicDrop",
        params: { drop },
        severity: "warning",
      });
    }
  }
  for (const vital of record.vitals) {
    const rate = vital.heartRate;
    if (rate !== null && (rate < 50 || rate > 120)) {
      alerts.push({
        code: "heartRate",
        params: { rate, time: vital.time ? `(${vital.time})` : "" },
        severity: "warning",
      });
    }
  }
  return alerts;
}

function buildAlerts(
  record: SessionExtraction,
  calculations: CalculationResult[]
): SessionAlert[] {
  const alerts: SessionAlert[] = [];
  const text = [
    ...record.events.map((event) => event.description),
    record.notes ?? "",
  ].join("\n");
  const flags: RedFlagCategory[] = detectRedFlags(text);
  if (flags.length > 0) {
    alerts.push({
      code: "redFlag",
      params: { categories: flags.join(",") },
      severity: "critical",
    });
  }
  for (const result of calculations) {
    if (result.band === "alert") {
      alerts.push({
        code: `calc.${result.calculator}`,
        params: { unit: result.unit, value: result.value },
        severity: "warning",
      });
    }
  }
  alerts.push(...vitalAlerts(record));
  const { postWeightKg: post, dryWeightKg: dry } = record;
  if (post !== null && dry !== null && post - dry > 1) {
    alerts.push({
      code: "aboveDryWeight",
      params: { difference: Math.round((post - dry) * 10) / 10 },
      severity: "info",
    });
  }
  const { ufAchievedMl: achieved, ufGoalMl: goal } = record;
  if (achieved !== null && goal !== null && goal > 0 && achieved < goal * 0.9) {
    alerts.push({
      code: "ufNotAchieved",
      params: { achieved, goal },
      severity: "info",
    });
  }
  return alerts;
}

/**
 * Convierte la extracción del modelo en una hoja verificada: descarta números
 * no presentes en las notas, sanea el alias, lista lo que falta y calcula.
 */
export function finalizeSessionRecord(
  extraction: SessionExtraction,
  sourceNotes: string
): SessionRecordDraft {
  const sourceNumbers = numbersInText(sourceNotes);
  const unverifiedFields: string[] = [];
  const record: SessionExtraction = {
    ...extraction,
    events: extraction.events.filter((event) => event.description.trim()),
    patientAlias: sanitizePatientAlias(extraction.patientAlias),
    sessionDate:
      extraction.sessionDate && ISO_DATE.test(extraction.sessionDate)
        ? extraction.sessionDate
        : null,
  };

  for (const field of NUMERIC_FIELDS as readonly NumericField[]) {
    const value = record[field];
    if (value === null) {
      continue;
    }
    if (!(Number.isFinite(value) && isGroundedNumber(value, sourceNumbers))) {
      record[field] = null;
      unverifiedFields.push(field);
    }
  }

  let vitalsUnverified = false;
  record.vitals = record.vitals
    .map((vital) => {
      const check = (value: number | null) => {
        if (value === null || isGroundedNumber(value, sourceNumbers)) {
          return value;
        }
        vitalsUnverified = true;
        return null;
      };
      return {
        diastolic: check(vital.diastolic),
        heartRate: check(vital.heartRate),
        systolic: check(vital.systolic),
        time: vital.time,
      };
    })
    .filter(
      (vital) =>
        vital.systolic !== null ||
        vital.diastolic !== null ||
        vital.heartRate !== null
    );
  if (vitalsUnverified) {
    unverifiedFields.push("vitals");
  }

  const missingFields = EXPECTED_FIELDS.filter((field) => {
    const value = record[field];
    return value === null || (Array.isArray(value) && value.length === 0);
  });
  const calculations = runCalculations(record);
  return {
    ...record,
    alerts: buildAlerts(record, calculations),
    calculations,
    missingFields,
    unverifiedFields,
  };
}
