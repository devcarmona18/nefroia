import { describe, expect, it } from "vitest";
import type { CalculationOutcome } from "@/lib/clinical";
import {
  calculateFluidBalance,
  calculateIdwg,
  calculateKtv,
  calculateUfRate,
  calculateUrr,
  DISCLAIMER_KEY,
} from "@/lib/clinical";

function ok(outcome: CalculationOutcome) {
  if (!outcome.ok) {
    throw new Error(`Se esperaba éxito: ${JSON.stringify(outcome.issues)}`);
  }
  return outcome.result;
}

function issues(outcome: CalculationOutcome) {
  if (outcome.ok) {
    throw new Error("Se esperaba un error de validación");
  }
  return outcome.issues;
}

describe("URR", () => {
  it("ejemplo resuelto: BUN 70 → 21 mg/dL = 70 %", () => {
    const result = ok(calculateUrr({ postBun: 21, preBun: 70 }));
    expect(result.value).toBe(70);
    expect(result.unit).toBe("%");
    expect(result.band).toBe("optimal");
    expect(result.disclaimerKey).toBe(DISCLAIMER_KEY);
    expect(result.reference.citation).toContain("KDOQI");
    expect(result.formula).toContain("BUN_pre");
  });

  it("65 % exacto cumple el mínimo; por debajo es alerta", () => {
    expect(ok(calculateUrr({ postBun: 28, preBun: 80 })).value).toBe(65);
    expect(ok(calculateUrr({ postBun: 28, preBun: 80 })).band).toBe("adequate");
    expect(ok(calculateUrr({ postBun: 24, preBun: 60 })).band).toBe("alert");
    expect(ok(calculateUrr({ postBun: 28.1, preBun: 80 })).band).toBe("alert");
  });

  it("acepta urea en mmol/L (el cociente no depende de la unidad)", () => {
    const result = ok(
      calculateUrr({ postBun: 7.5, preBun: 25, unit: "mmol/L" })
    );
    expect(result.value).toBe(70);
  });

  it("rechaza BUN post ≥ pre, valores fuera de rango y no numéricos", () => {
    expect(issues(calculateUrr({ postBun: 70, preBun: 70 }))).toEqual([
      { code: "post_bun_not_lower", field: "postBun" },
    ]);
    expect(issues(calculateUrr({ postBun: 20, preBun: 900 }))[0]).toEqual({
      code: "too_high",
      field: "preBun",
      max: 500,
      min: 1,
      unit: "mg/dL",
    });
    expect(issues(calculateUrr({ postBun: 0, preBun: 70 }))[0].code).toBe(
      "too_low"
    );
    expect(issues(calculateUrr({ postBun: "20", preBun: 70 }))[0].code).toBe(
      "not_a_number"
    );
    expect(issues(calculateUrr({ preBun: 70 }))[0]).toMatchObject({
      code: "required",
      field: "postBun",
    });
    expect(
      issues(calculateUrr({ postBun: Number.NaN, preBun: 70 }))[0].code
    ).toBe("not_a_number");
    expect(
      issues(calculateUrr({ postBun: 20, preBun: 70, unit: "g/L" }))[0].code
    ).toBe("invalid_unit");
    expect(issues(calculateUrr(null)).length).toBeGreaterThan(0);
  });
});

describe("spKt/V (Daugirdas 2.ª generación)", () => {
  const base = {
    durationHours: 4,
    postBun: 21,
    postWeightKg: 70,
    preBun: 70,
    ufLiters: 3,
  };

  it("ejemplo resuelto a mano: R 0,30, t 4 h, UF 3 L, 70 kg → 1,44", () => {
    // −ln(0,30 − 0,032) = 1,3168; (4 − 1,05)·3/70 = 0,1264; suma 1,4432
    const result = ok(calculateKtv(base));
    expect(result.value).toBe(1.44);
    expect(result.band).toBe("optimal");
    expect(result.unit).toBe("");
    expect(result.details).toContainEqual({
      key: "urr",
      unit: "%",
      value: 70,
    });
  });

  it("ejemplo resuelto a mano: R 0,35, t 3,5 h, UF 2 L, 70 kg → 1,21", () => {
    // −ln(0,35 − 0,028) = 1,1332; (4 − 1,225)·2/70 = 0,0793; suma 1,2125
    const result = ok(
      calculateKtv({
        ...base,
        durationHours: 3.5,
        postBun: 35,
        preBun: 100,
        ufLiters: 2,
      })
    );
    expect(result.value).toBe(1.21);
    expect(result.band).toBe("adequate");
  });

  it("coincide con la fórmula evaluada de forma independiente", () => {
    const cases = [
      {
        durationHours: 4,
        postBun: 30,
        postWeightKg: 58.5,
        preBun: 82,
        ufLiters: 2.4,
      },
      {
        durationHours: 3,
        postBun: 40,
        postWeightKg: 91,
        preBun: 95,
        ufLiters: 0.5,
      },
      {
        durationHours: 5,
        postBun: 12,
        postWeightKg: 45,
        preBun: 60,
        ufLiters: 4.2,
      },
    ];
    for (const c of cases) {
      const r = c.postBun / c.preBun;
      const expected =
        -Math.log(r - 0.008 * c.durationHours) +
        ((4 - 3.5 * r) * c.ufLiters) / c.postWeightKg;
      expect(ok(calculateKtv(c)).value).toBeCloseTo(expected, 2);
    }
  });

  it("sin ultrafiltración solo queda el término logarítmico", () => {
    const result = ok(
      calculateKtv({ ...base, postBun: 40, preBun: 100, ufLiters: 0 })
    );
    expect(result.value).toBe(1);
    expect(result.band).toBe("alert");
  });

  it("equivalencia conocida: URR 65 % ≈ spKt/V 1,2", () => {
    const result = ok(
      calculateKtv({
        ...base,
        durationHours: 3.5,
        postBun: 35,
        preBun: 100,
        ufLiters: 2,
      })
    );
    expect(result.value).toBeGreaterThanOrEqual(1.15);
    expect(result.value).toBeLessThanOrEqual(1.3);
  });

  it("los objetivos 1,2/1,4 solo se aplican a tres sesiones semanales", () => {
    expect(ok(calculateKtv({ ...base, sessionsPerWeek: 2 })).band).toBe("info");
    expect(ok(calculateKtv({ ...base, sessionsPerWeek: 3 })).band).toBe(
      "optimal"
    );
  });

  it("rechaza errores de unidad e incoherencias", () => {
    // 240 "horas" en lugar de minutos
    expect(
      issues(calculateKtv({ ...base, durationHours: 240 }))[0]
    ).toMatchObject({ code: "too_high", field: "durationHours", max: 10 });
    // UF en mL en lugar de litros
    expect(issues(calculateKtv({ ...base, ufLiters: 3000 }))[0]).toMatchObject({
      code: "too_high",
      field: "ufLiters",
    });
    expect(issues(calculateKtv({ ...base, postBun: 80 }))[0].code).toBe(
      "post_bun_not_lower"
    );
    expect(issues(calculateKtv({ ...base, postWeightKg: 0 }))[0].code).toBe(
      "too_low"
    );
    // Dominio del logaritmo: R − 0,008·t ≤ 0
    expect(
      issues(
        calculateKtv({ ...base, durationHours: 10, postBun: 4, preBun: 100 })
      )[0].code
    ).toBe("ktv_out_of_domain");
  });
});

describe("Ganancia de peso interdialítica", () => {
  it("calcula kg y % del peso seco", () => {
    const result = ok(
      calculateIdwg({
        dryWeightKg: 70,
        previousPostWeightKg: 70.2,
        preWeightKg: 72.5,
      })
    );
    expect(result.value).toBe(3.3);
    expect(result.details[0]).toEqual({
      key: "gainKg",
      unit: "kg",
      value: 2.3,
    });
    expect(result.band).toBe("adequate");
  });

  it("alerta solo por encima del 4 %", () => {
    const at4 = ok(
      calculateIdwg({
        dryWeightKg: 70,
        previousPostWeightKg: 70,
        preWeightKg: 72.8,
      })
    );
    expect(at4.value).toBe(4);
    expect(at4.band).toBe("adequate");
    const above = ok(
      calculateIdwg({
        dryWeightKg: 70,
        previousPostWeightKg: 70,
        preWeightKg: 73.5,
      })
    );
    expect(above.value).toBe(5);
    expect(above.band).toBe("alert");
    expect(above.reference.citation).toContain("uso habitual");
  });

  it("una pérdida de peso se informa sin alerta", () => {
    const result = ok(
      calculateIdwg({
        dryWeightKg: 70,
        previousPostWeightKg: 70,
        preWeightKg: 69.5,
      })
    );
    expect(result.value).toBe(-0.7);
    expect(result.band).toBe("info");
  });

  it("rechaza diferencias de peso imposibles y pesos fuera de rango", () => {
    expect(
      issues(
        calculateIdwg({
          dryWeightKg: 70,
          previousPostWeightKg: 70,
          preWeightKg: 95,
        })
      )[0].code
    ).toBe("implausible_weight_change");
    expect(
      issues(
        calculateIdwg({
          dryWeightKg: 7,
          previousPostWeightKg: 70,
          preWeightKg: 72,
        })
      )[0]
    ).toMatchObject({ code: "too_low", field: "dryWeightKg" });
  });
});

describe("Tasa de ultrafiltración", () => {
  it("calcula mL/kg/h y clasifica por 10 y 13", () => {
    const low = ok(
      calculateUfRate({ durationHours: 4, ufVolumeMl: 2500, weightKg: 70 })
    );
    expect(low.value).toBe(8.9);
    expect(low.band).toBe("optimal");
    expect(low.details[0]).toEqual({
      key: "ufPerHour",
      unit: "mL/h",
      value: 625,
    });

    const mid = ok(
      calculateUfRate({ durationHours: 4, ufVolumeMl: 3200, weightKg: 70 })
    );
    expect(mid.value).toBe(11.4);
    expect(mid.band).toBe("caution");

    const high = ok(
      calculateUfRate({ durationHours: 4, ufVolumeMl: 4000, weightKg: 70 })
    );
    expect(high.value).toBe(14.3);
    expect(high.band).toBe("alert");
    expect(high.reference.citation).toContain("Flythe");
  });

  it("13,0 exacto no es alerta (el umbral es > 13)", () => {
    const result = ok(
      calculateUfRate({ durationHours: 4, ufVolumeMl: 3640, weightKg: 70 })
    );
    expect(result.value).toBe(13);
    expect(result.band).toBe("caution");
  });

  it("rechaza duración cero, minutos por horas y litros por mL negativos", () => {
    expect(
      issues(
        calculateUfRate({ durationHours: 0, ufVolumeMl: 2000, weightKg: 70 })
      )[0].code
    ).toBe("too_low");
    expect(
      issues(
        calculateUfRate({ durationHours: 240, ufVolumeMl: 2000, weightKg: 70 })
      )[0].code
    ).toBe("too_high");
    expect(
      issues(
        calculateUfRate({ durationHours: 4, ufVolumeMl: -1, weightKg: 70 })
      )[0].code
    ).toBe("too_low");
  });
});

describe("Balance hídrico", () => {
  it("ingresos − egresos con UF incluida", () => {
    const result = ok(
      calculateFluidBalance({
        ivFluidsMl: 200,
        oralIntakeMl: 250,
        primingRinsebackMl: 300,
        ultrafiltrationMl: 2800,
        urineMl: 100,
      })
    );
    expect(result.value).toBe(-2150);
    expect(result.unit).toBe("mL");
    expect(result.interpretationKey).toBe("fluidBalance.negative");
    expect(result.details).toEqual([
      { key: "totalIntake", unit: "mL", value: 750 },
      { key: "totalOutput", unit: "mL", value: 2900 },
    ]);
  });

  it("un cero explícito es un dato válido (no 'sin datos')", () => {
    const result = ok(
      calculateFluidBalance({ oralIntakeMl: 0, ultrafiltrationMl: 0 })
    );
    expect(result.value).toBe(0);
    expect(result.band).toBe("info");
  });

  it("balance positivo y neutro", () => {
    expect(
      ok(calculateFluidBalance({ oralIntakeMl: 500, urineMl: 200 }))
        .interpretationKey
    ).toBe("fluidBalance.positive");
    expect(
      ok(calculateFluidBalance({ oralIntakeMl: 500, ultrafiltrationMl: 500 }))
        .interpretationKey
    ).toBe("fluidBalance.neutral");
  });

  it("rechaza un balance sin datos, negativos y volúmenes imposibles", () => {
    expect(issues(calculateFluidBalance({}))[0].code).toBe("no_fluid_data");
    expect(issues(calculateFluidBalance({ oralIntakeMl: null }))[0].code).toBe(
      "no_fluid_data"
    );
    expect(
      issues(calculateFluidBalance({ oralIntakeMl: -50 }))[0]
    ).toMatchObject({ code: "too_low", field: "oralIntakeMl" });
    expect(
      issues(calculateFluidBalance({ ultrafiltrationMl: 50_000 }))[0].code
    ).toBe("too_high");
  });
});
