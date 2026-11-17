import type { SessionAlert } from "@/lib/clinical/session-record";
import type { CalculationResult } from "@/lib/clinical/types";
import type { SessionRecord } from "@/lib/db/schema";

/**
 * Exportación CSV de hojas de sesión (compatible con Excel en es-CO):
 *  - BOM UTF-8 para que Excel muestre bien las tildes.
 *  - Separador configurable (";" por defecto: Excel en español usa la coma
 *    como separador decimal).
 *  - Neutraliza la inyección de fórmulas (CWE-1236): una celda que empieza
 *    por = + - @ o tabulador se antepone con un apóstrofo.
 */

export const CSV_COLUMNS = [
  "createdAt",
  "sessionDate",
  "patientAlias",
  "machine",
  "dialyzer",
  "vascularAccess",
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
  "heparin",
  "vitals",
  "events",
  "idwg",
  "ufRate",
  "urr",
  "ktv",
  "fluidBalance",
  "alerts",
  "missingFields",
  "notes",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: string, separator: string): string {
  const safe = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  if (
    safe.includes(separator) ||
    safe.includes('"') ||
    safe.includes("\n") ||
    safe.includes("\r")
  ) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function formatNumber(value: number | null, decimalSeparator: string) {
  return value === null ? "" : String(value).replace(".", decimalSeparator);
}

function cellValue(
  record: SessionRecord,
  column: CsvColumn,
  decimalSeparator: string
): string {
  const calculations = record.calculations as CalculationResult[];
  const calc = (id: string) =>
    formatNumber(
      calculations.find((c) => c.calculator === id)?.value ?? null,
      decimalSeparator
    );
  switch (column) {
    case "createdAt":
      return record.createdAt.toISOString();
    case "vitals":
      return record.vitals
        .map(
          (v) =>
            `${v.time ?? "?"}: ${v.systolic ?? "?"}/${v.diastolic ?? "?"} FC ${v.heartRate ?? "?"}`
        )
        .join(" | ");
    case "events":
      return record.events
        .map((e) => (e.time ? `${e.time} ${e.description}` : e.description))
        .join(" | ");
    case "idwg":
    case "ufRate":
    case "urr":
    case "ktv":
    case "fluidBalance":
      return calc(column);
    case "alerts":
      return (record.alerts as SessionAlert[]).map((a) => a.code).join(" | ");
    case "missingFields":
      return record.missingFields.join(" | ");
    default: {
      const value = record[column];
      if (value === null || value === undefined) {
        return "";
      }
      return typeof value === "number"
        ? formatNumber(value, decimalSeparator)
        : String(value);
    }
  }
}

export function sessionRecordsToCsv(
  records: SessionRecord[],
  headers: Record<CsvColumn, string>,
  { separator = ";", decimalSeparator = "," } = {}
): string {
  const lines = [
    CSV_COLUMNS.map((c) => escapeCsvCell(headers[c], separator)).join(
      separator
    ),
    ...records.map((record) =>
      CSV_COLUMNS.map((column) =>
        escapeCsvCell(cellValue(record, column, decimalSeparator), separator)
      ).join(separator)
    ),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}
