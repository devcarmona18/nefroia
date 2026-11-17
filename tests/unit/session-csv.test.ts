import { describe, expect, it } from "vitest";
import {
  finalizeSessionRecord,
  type SessionExtraction,
} from "@/lib/clinical/session-record";
import type { SessionRecord } from "@/lib/db/schema";
import {
  CSV_COLUMNS,
  type CsvColumn,
  escapeCsvCell,
  sessionRecordsToCsv,
} from "@/lib/session-records/csv";

const headers = Object.fromEntries(
  CSV_COLUMNS.map((column) => [column, column.toUpperCase()])
) as Record<CsvColumn, string>;

function record(overrides: Partial<SessionExtraction> = {}): SessionRecord {
  const extraction: SessionExtraction = {
    bunPostMgDl: null,
    bunPreMgDl: null,
    dialyzer: "FX80",
    dryWeightKg: 70,
    durationHours: 4,
    events: [{ description: "Calambres; se pausa UF", time: "11:00" }],
    fluidsAdministeredMl: null,
    heparin: null,
    machine: "7",
    notes: null,
    patientAlias: "J.P.",
    postWeightKg: 70.4,
    previousPostWeightKg: 70.1,
    preWeightKg: 72.5,
    sessionDate: "2026-11-16",
    ufAchievedMl: 2300,
    ufGoalMl: 2500,
    vascularAccess: "FAV",
    vitals: [{ diastolic: 80, heartRate: 76, systolic: 140, time: "pre" }],
    ...overrides,
  };
  const notes =
    "72,5 70,1 70 70,4 4 h 2300 2500 140/80 76 FX80 máquina 7 11:00";
  return {
    ...finalizeSessionRecord(extraction, notes),
    chatId: null,
    createdAt: new Date("2026-11-16T15:00:00Z"),
    id: "00000000-0000-0000-0000-000000000001",
    sourceNotes: notes,
    userId: "00000000-0000-0000-0000-000000000002",
  } as SessionRecord;
}

describe("exportación CSV de hojas de sesión", () => {
  it("incluye BOM, cabeceras traducidas y CRLF", () => {
    const csv = sessionRecordsToCsv([record()], headers);
    expect(csv.startsWith("﻿CREATEDAT;SESSIONDATE;PATIENTALIAS")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.split("\r\n")).toHaveLength(3);
  });

  it("usa coma decimal y añade los cálculos", () => {
    // Sin incidencias: ninguna celda entrecomillada, se puede partir por ";".
    const [, row] = sessionRecordsToCsv(
      [record({ events: [] })],
      headers
    ).split("\r\n");
    const cells = row.split(";");
    const at = (column: CsvColumn) => cells[CSV_COLUMNS.indexOf(column)];
    expect(at("preWeightKg")).toBe("72,5");
    expect(at("idwg")).toBe("3,4");
    expect(at("ufRate")).toBe("8,2");
    expect(at("patientAlias")).toBe("J.P.");
    expect(at("vitals")).toBe("pre: 140/80 FC 76");
  });

  it("entrecomilla separadores y comillas", () => {
    expect(escapeCsvCell('dice "hola"; adiós', ";")).toBe(
      '"dice ""hola""; adiós"'
    );
    expect(escapeCsvCell("línea\nnueva", ";")).toBe('"línea\nnueva"');
    expect(escapeCsvCell("simple", ";")).toBe("simple");
  });

  it("neutraliza la inyección de fórmulas", () => {
    for (const payload of ['=HYPERLINK("x")', "+1", "-2+3", "@SUM(A1)"]) {
      expect(escapeCsvCell(payload, ";").replace(/^"/, "")).toMatch(/^'/);
    }
    const csv = sessionRecordsToCsv(
      [record({ machine: "=cmd|' /C calc'!A0" })],
      headers
    );
    expect(csv).toContain("'=cmd");
  });
});
