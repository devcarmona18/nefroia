import { describe, expect, it } from "vitest";
import {
  finalizeSessionRecord,
  isGroundedNumber,
  numbersInText,
  type SessionExtraction,
  sanitizePatientAlias,
  sessionExtractionSchema,
} from "@/lib/clinical/session-record";

const NOTES = `Paciente J.P., máquina 7, dializador FX80, FAV radiocefálica izquierda.
Peso pre 72,5 kg, peso post anterior 70,1 kg, peso seco 70 kg. Sesión 4 h.
UF programada 2500 mL, conseguida 2,3 L. Heparina 5000 UI bolo inicial.
PA pre 140/80 FC 76; 2.ª hora 98/60 FC 88 con mareo, se dio SSN 200 mL; post 120/70 FC 80.
Peso post 70,4 kg. BUN pre 70, post 21.`;

function extraction(
  overrides: Partial<SessionExtraction> = {}
): SessionExtraction {
  return {
    bunPostMgDl: 21,
    bunPreMgDl: 70,
    dialyzer: "FX80",
    dryWeightKg: 70,
    durationHours: 4,
    events: [
      { description: "Mareo con PA 98/60, SSN 200 mL", time: "2.ª hora" },
    ],
    fluidsAdministeredMl: 200,
    heparin: "5000 UI bolo inicial",
    machine: "7",
    notes: null,
    patientAlias: "J.P.",
    postWeightKg: 70.4,
    previousPostWeightKg: 70.1,
    preWeightKg: 72.5,
    sessionDate: null,
    ufAchievedMl: 2300,
    ufGoalMl: 2500,
    vascularAccess: "FAV radiocefálica izquierda",
    vitals: [
      { diastolic: 80, heartRate: 76, systolic: 140, time: "pre" },
      { diastolic: 60, heartRate: 88, systolic: 98, time: "2.ª hora" },
      { diastolic: 70, heartRate: 80, systolic: 120, time: "post" },
    ],
    ...overrides,
  };
}

describe("verificación de números contra las notas", () => {
  it("lee decimales con coma o punto", () => {
    expect(numbersInText("72,5 kg y 2.3 L, 140/80")).toEqual([
      72.5, 2.3, 140, 80,
    ]);
  });

  it("acepta conversiones de unidad evidentes", () => {
    const source = numbersInText("UF 2,3 L en 240 min; otra de 4 h 30 min");
    expect(isGroundedNumber(2300, source)).toBe(true); // L → mL
    expect(isGroundedNumber(4, source)).toBe(true); // 240 min → 4 h
    expect(isGroundedNumber(4.5, source)).toBe(true); // 4 h 30 min
    expect(isGroundedNumber(3100, source)).toBe(false);
  });
});

describe("alias del paciente", () => {
  it("conserva iniciales y seudónimos", () => {
    expect(sanitizePatientAlias("J.P.")).toBe("J.P.");
    expect(sanitizePatientAlias("Cama 4")).toBe("Cama 4");
  });

  it("convierte un nombre completo en iniciales y descarta documentos", () => {
    expect(sanitizePatientAlias("Juan Pérez")).toBe("J.P.");
    expect(sanitizePatientAlias("María del Carmen")).toBe("María del Carmen");
    expect(sanitizePatientAlias("CC 1023456789")).toBeNull();
    expect(sanitizePatientAlias("[NOMBRE]")).toBeNull();
    expect(sanitizePatientAlias("  ")).toBeNull();
  });
});

describe("hoja de sesión", () => {
  it("el esquema exige null explícito para lo ausente", () => {
    expect(sessionExtractionSchema.safeParse(extraction()).success).toBe(true);
    const { machine: _machine, ...withoutMachine } = extraction();
    expect(sessionExtractionSchema.safeParse(withoutMachine).success).toBe(
      false
    );
  });

  it("calcula automáticamente y no marca como faltante lo presente", () => {
    const record = finalizeSessionRecord(extraction(), NOTES);
    expect(record.unverifiedFields).toEqual([]);
    expect(record.missingFields).toEqual(["sessionDate"]);
    const byId = Object.fromEntries(
      record.calculations.map((c) => [c.calculator, c])
    );
    expect(byId.idwg.value).toBe(3.4); // (72,5 − 70,1) / 70
    expect(byId.ufRate.value).toBe(8.2); // 2300 / (70,4 × 4)
    expect(byId.urr.value).toBe(70);
    // −ln(0,30 − 0,032) + (4 − 1,05) · 2,3 / 70,4 = 1,3168 + 0,0964
    expect(byId.ktv.value).toBe(1.41);
    expect(byId.fluidBalance.value).toBe(-2100);
  });

  it("genera alertas de signos vitales e intradiálisis", () => {
    const record = finalizeSessionRecord(extraction(), NOTES);
    const codes = record.alerts.map((a) => a.code);
    expect(codes).toContain("systolicDrop"); // 140 → 98
    expect(codes).not.toContain("ufNotAchieved"); // 2300 ≥ 90 % de 2500
    expect(codes).not.toContain("hypotensionNadir"); // 98 ≥ 90
    expect(codes).not.toContain("aboveDryWeight"); // 70,4 − 70 ≤ 1
  });

  it("avisa si la UF conseguida queda por debajo del 90 % del objetivo", () => {
    const record = finalizeSessionRecord(
      extraction({ ufAchievedMl: 2000 }),
      `${NOTES} UF final 2000 mL`
    );
    expect(record.alerts).toContainEqual({
      code: "ufNotAchieved",
      params: { achieved: 2000, goal: 2500 },
      severity: "info",
    });
  });

  it("descarta números inventados por el modelo y lo indica", () => {
    const record = finalizeSessionRecord(
      extraction({
        dryWeightKg: 68,
        vitals: [{ diastolic: 50, heartRate: 130, systolic: 85, time: "3h" }],
      }),
      NOTES
    );
    expect(record.dryWeightKg).toBeNull();
    expect(record.unverifiedFields).toEqual(["dryWeightKg", "vitals"]);
    expect(record.vitals).toEqual([]);
    expect(record.missingFields).toContain("dryWeightKg");
    // Sin peso seco no hay ganancia interdialítica.
    expect(record.calculations.map((c) => c.calculator)).not.toContain("idwg");
  });

  it("deja en null lo que las notas no dicen", () => {
    const empty = finalizeSessionRecord(
      {
        ...Object.fromEntries(
          Object.keys(extraction()).map((key) => [key, null])
        ),
        events: [],
        vitals: [],
      } as unknown as SessionExtraction,
      "Sin novedades."
    );
    expect(empty.calculations).toEqual([]);
    expect(empty.alerts).toEqual([]);
    expect(empty.missingFields).toHaveLength(13);
  });

  it("eleva a crítico un signo de alarma en las incidencias", () => {
    const record = finalizeSessionRecord(
      extraction({
        events: [
          { description: "Dolor torácico opresivo a las 10:40", time: "10:40" },
        ],
        vitals: [{ diastolic: 50, heartRate: 130, systolic: 82, time: "1h" }],
      }),
      `${NOTES} 1h PA 82/50 FC 130`
    );
    const [first] = record.alerts;
    expect(first).toMatchObject({ code: "redFlag", severity: "critical" });
    expect(String(first.params.categories)).toContain("chestPain");
    expect(record.alerts.map((a) => a.code)).toEqual(
      expect.arrayContaining(["hypotensionNadir", "heartRate"])
    );
  });

  it("valida la fecha ISO y descarta formatos ambiguos", () => {
    expect(
      finalizeSessionRecord(extraction({ sessionDate: "2026-11-17" }), NOTES)
        .sessionDate
    ).toBe("2026-11-17");
    expect(
      finalizeSessionRecord(extraction({ sessionDate: "17/11" }), NOTES)
        .sessionDate
    ).toBeNull();
  });
});
