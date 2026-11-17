import { describe, expect, it } from "vitest";
import { mockToolCallFor } from "@/lib/ai/models.mock";
import {
  regularPrompt,
  systemPrompt,
  turnSafetyPrompt,
} from "@/lib/ai/prompts";

const hints = { locale: "es" };

describe("prompt de seguridad", () => {
  it("fija el rol de apoyo a la decisión y sus límites", () => {
    expect(regularPrompt).toMatch(/decision-SUPPORT/);
    expect(regularPrompt).toMatch(/Never diagnose, never prescribe/);
    expect(regularPrompt).toMatch(/buscarProtocolos/);
    expect(regularPrompt).toMatch(/\[P1\]/);
    expect(regularPrompt).toMatch(/No lo sé/);
    expect(regularPrompt).toMatch(/\[NOMBRE\]/);
  });

  it("añade instrucciones de turno solo cuando hay alarmas o redacción", () => {
    expect(turnSafetyPrompt({ redactedCount: 0, redFlags: [] })).toBe("");
    const turn = turnSafetyPrompt({
      redactedCount: 2,
      redFlags: ["chestPain"],
    });
    expect(turn).toContain("RED FLAG detected");
    expect(turn).toContain("chestPain");
    expect(turn).toContain("2 personal data item(s)");
  });

  it("el prompt completo incluye el idioma y los avisos del turno", () => {
    const prompt = systemPrompt({
      redFlags: ["seizure"],
      requestHints: hints,
      supportsTools: true,
    });
    expect(prompt).toContain("interface language: es");
    expect(prompt).toContain("seizure");
    expect(prompt).toContain("Artifacts");
    expect(
      systemPrompt({ requestHints: hints, supportsTools: false })
    ).not.toContain("Artifacts");
  });
});

describe("modelo simulado (e2e)", () => {
  it("dispara las herramientas clínicas esperadas", () => {
    expect(mockToolCallFor("Calcula la URR")?.toolName).toBe("calcularURR");
    expect(mockToolCallFor("¿Qué ocurre?")).toBeNull();
    expect(mockToolCallFor("kt/v con 240 minutos")?.input.durationHours).toBe(
      240
    );
    expect(mockToolCallFor("Crea la hoja de sesión: ...")?.toolName).toBe(
      "crearHojaSesion"
    );
    expect(mockToolCallFor("según el protocolo")?.toolName).toBe(
      "buscarProtocolos"
    );
  });
});
