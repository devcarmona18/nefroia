import { describe, expect, it } from "vitest";
import { detectRedFlags } from "@/lib/safety/red-flags";

describe("signos de alarma", () => {
  it("detecta urgencias descritas en español", () => {
    const cases: [string, string][] = [
      ["El paciente refiere dolor en el pecho opresivo", "chestPain"],
      ["dolor torácico irradiado al brazo", "chestPain"],
      ["perdió la conciencia en la máquina 3", "consciousness"],
      ["está inconsciente y no responde", "consciousness"],
      ["hipotensión que no responde a solución salina", "severeHypotension"],
      ["TA 70/40 tras la segunda hora", "severeHypotension"],
      ["sangrado abundante por la fístula", "bleeding"],
      ["hubo salida accidental de la aguja venosa", "bleeding"],
      ["sospecha de embolia aérea", "airEmbolism"],
      ["reacción al dializador con prurito y disnea", "anaphylaxis"],
      ["presenta convulsiones", "seizure"],
      ["no tiene pulso", "cardiacArrest"],
      ["potasio de 6,8 antes de conectar", "hyperkalemia"],
      ["no puede respirar", "breathing"],
      ["sangre color vino en el circuito, posible hemólisis", "hemolysis"],
    ];
    for (const [text, category] of cases) {
      expect(detectRedFlags(text), text).toContain(category);
    }
  });

  it("detecta urgencias descritas en inglés", () => {
    expect(detectRedFlags("patient has chest pain")).toContain("chestPain");
    expect(detectRedFlags("He is unresponsive")).toContain("consciousness");
    expect(detectRedFlags("suspected air embolism")).toContain("airEmbolism");
  });

  it("no se activa con consultas rutinarias", () => {
    const routine = [
      "Calcula el Kt/V con BUN pre 70 y post 21",
      "¿Cuáles son los cuidados de la fístula?",
      "TA 130/80, FC 78, sin novedades",
      "dolor de cabeza leve al final de la sesión",
      "potasio de 4,8",
      "calambres en la última hora",
      "no responde al tratamiento con eritropoyetina",
      "Redacta la nota de entrega de turno",
    ];
    for (const text of routine) {
      expect(detectRedFlags(text), text).toEqual([]);
    }
  });
});
