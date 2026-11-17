import { describe, expect, it } from "vitest";
import {
  containsRedactionPlaceholder,
  redactMessageParts,
  redactPii,
} from "@/lib/safety/redact";

describe("redacción de datos personales (es-CO)", () => {
  it("oculta cédulas con palabra clave y en distintos formatos", () => {
    const cases = [
      "Paciente con CC 1.023.456.789 ingresa a sala",
      "cédula de ciudadanía No. 52345678",
      "C.C. 79.845.123",
      "identificado con 1023456789",
      "Documento: 1 023 456 789",
      "TI 1.098.765.432",
    ];
    for (const text of cases) {
      const result = redactPii(text);
      expect(result.text, text).toContain("[DOCUMENTO]");
      expect(result.text, text).not.toMatch(/\d{5,}|\d\.\d{3}\.\d{3}/);
      expect(result.counts.nationalId, text).toBe(1);
    }
  });

  it("oculta números sueltos con forma de cédula", () => {
    expect(redactPii("el 1.023.456.789 está en la máquina 4").text).toBe(
      "el [DOCUMENTO] está en la máquina 4"
    );
    expect(redactPii("usuario 52345678, turno tarde").text).toContain(
      "[DOCUMENTO]"
    );
  });

  it("no toca valores clínicos ni cifras cortas", () => {
    const text =
      "Peso pre 72,5 kg, post 70,2 kg, UF 2500 mL en 4 h, TA 130/80, FC 78, heparina 5000 UI, BUN 70 mg/dL, Qb 350, eritropoyetina 4.000.000 UI, máquina 12";
    const result = redactPii(text);
    expect(result.text).toBe(text);
    expect(result.total).toBe(0);
  });

  it("no confunde 'cc' como unidad de volumen", () => {
    const text = "Se administran 500 cc de solución salina y 2 cc de heparina";
    expect(redactPii(text).text).toBe(text);
  });

  it("oculta teléfonos colombianos", () => {
    const cases = [
      "llamar al 3001234567",
      "celular 310 555 1234",
      "cel: +57 320-555-1234",
      "fijo 6015551234",
      "Teléfono: 2 555 12 34",
    ];
    for (const text of cases) {
      const result = redactPii(text);
      expect(result.text, text).toContain("[TELEFONO]");
      expect(result.counts.phone, text).toBe(1);
      expect(result.text, text).not.toMatch(/\d{4}/);
    }
  });

  it("oculta correos electrónicos", () => {
    const result = redactPii("Escribir a maria.perez+hd@clinica.com.co hoy");
    expect(result.text).toBe("Escribir a [CORREO] hoy");
    expect(result.counts.email).toBe(1);
  });

  it("oculta nombres tras palabras clave y conserva la palabra clave", () => {
    expect(
      redactPii("La paciente María del Carmen Rodríguez Gómez refiere mareo")
        .text
    ).toBe("La paciente [NOMBRE] refiere mareo");
    expect(redactPii("Sr. Juan Pérez, 64 años").text).toBe(
      "Sr. [NOMBRE], 64 años"
    );
    expect(redactPii("la sra. Ana de la Torre llegó tarde").text).toBe(
      "la sra. [NOMBRE] llegó tarde"
    );
    expect(redactPii("Doña Rosa pregunta por su turno").text).toBe(
      "Doña [NOMBRE] pregunta por su turno"
    );
    expect(redactPii("PACIENTE JUAN CARLOS PEREZ en máquina 3").text).toBe(
      "PACIENTE [NOMBRE] en máquina 3"
    );
    expect(redactPii("Nombre: Luis Alberto Mora").text).toBe(
      "Nombre: [NOMBRE]"
    );
  });

  it("no oculta iniciales, seudónimos ni texto clínico tras 'paciente'", () => {
    const untouched = [
      "Paciente J.P. en máquina 3 con FAV",
      "paciente refiere calambres en la última hora",
      "Paciente Refiere cefalea intensa",
      "Paciente HD-014 tolera la sesión",
      "Paciente con FAV radiocefálica izquierda",
      "paciente masculino de 60 años",
      "El paciente presenta hipotensión",
    ];
    for (const text of untouched) {
      expect(redactPii(text).text, text).toBe(text);
    }
  });

  it("oculta fechas de nacimiento pero conserva otras fechas", () => {
    expect(redactPii("Fecha de nacimiento: 12/03/1961").text).toBe(
      "Fecha de nacimiento: [FECHA_NACIMIENTO]"
    );
    expect(redactPii("nacido el 5 de mayo de 1958 en Cali").text).toBe(
      "nacido el [FECHA_NACIMIENTO] en Cali"
    );
    expect(redactPii("FN 1961-03-12").text).toBe("FN [FECHA_NACIMIENTO]");
    const session = "Sesión del 14/11/2026, próxima el 16/11/2026";
    expect(redactPii(session).text).toBe(session);
  });

  it("oculta números de historia clínica", () => {
    expect(redactPii("Historia clínica N° 458912").text).toBe(
      "Historia clínica N° [HISTORIA_CLINICA]"
    );
    expect(redactPii("HC: A-2024-00123").text).toBe("HC: [HISTORIA_CLINICA]");
    expect(redactPii("MRN 00451234").text).toBe("MRN [HISTORIA_CLINICA]");
    const clinical = "historia de hipertensión de larga data";
    expect(redactPii(clinical).text).toBe(clinical);
  });

  it("redacta una nota completa y cuenta por tipo", () => {
    const note =
      "Paciente Carlos Andrés Mejía, CC 1.144.032.567, HC 778123, nacido el 03/07/1959, cel 315 444 8899, correo carlos.mejia@correo.co. Peso pre 81,4 kg, UF 3000 mL, TA 150/90.";
    const result = redactPii(note);
    expect(result.text).toBe(
      "Paciente [NOMBRE], CC [DOCUMENTO], HC [HISTORIA_CLINICA], nacido el [FECHA_NACIMIENTO], cel [TELEFONO], correo [CORREO]. Peso pre 81,4 kg, UF 3000 mL, TA 150/90."
    );
    expect(result.counts).toEqual({
      birthDate: 1,
      email: 1,
      medicalRecord: 1,
      name: 1,
      nationalId: 1,
      phone: 1,
    });
    expect(result.total).toBe(6);
  });

  it("es idempotente y reconoce sus propios marcadores", () => {
    const once = redactPii("Sra. Marta Ruiz, CC 52.345.678, tel 3005551234");
    const twice = redactPii(once.text);
    expect(twice.text).toBe(once.text);
    expect(twice.total).toBe(0);
    expect(containsRedactionPlaceholder(once.text)).toBe(true);
    expect(containsRedactionPlaceholder("Kt/V 1,3")).toBe(false);
  });

  it("también cubre claves en inglés", () => {
    expect(
      redactPii("Patient John Smith, DOB 03/12/1961, MRN 4455-22").text
    ).toBe("Patient [NOMBRE], DOB [FECHA_NACIMIENTO], MRN [HISTORIA_CLINICA]");
  });

  it("redacta solo las partes de texto de un mensaje", () => {
    const parts = [
      { text: "Paciente Juan Pérez con CC 1023456789", type: "text" },
      { mediaType: "image/png", type: "file", url: "/api/files/x" },
      { text: "UF 2500 mL", type: "text" },
    ];
    const result = redactMessageParts(parts);
    expect(result.total).toBe(2);
    expect(result.parts[0]).toEqual({
      text: "Paciente [NOMBRE] con CC [DOCUMENTO]",
      type: "text",
    });
    expect(result.parts[1]).toBe(parts[1]);
    expect(result.parts[2]).toBe(parts[2]);
    expect(parts[0].text).toContain("Juan");
  });
});
