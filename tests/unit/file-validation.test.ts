import { describe, expect, it } from "vitest";
import {
  detectFileType,
  MAX_UPLOAD_BYTES,
  sanitizeFilename,
  validateUpload,
} from "@/lib/storage/file-validation";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31];
const WEBP = [
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
];

const bytes = (signature: number[], padding = 16) =>
  new Uint8Array([...signature, ...new Array(padding).fill(0)]);

describe("detectFileType", () => {
  it.each([
    ["image/png", PNG],
    ["image/jpeg", JPEG],
    ["image/gif", GIF],
    ["image/webp", WEBP],
    ["application/pdf", PDF],
  ])("detecta %s por su firma", (type, signature) => {
    expect(detectFileType(bytes(signature))).toBe(type);
  });

  it("rechaza contenido que no coincide con ninguna firma", () => {
    expect(
      detectFileType(new TextEncoder().encode("<?php echo 1;"))
    ).toBeNull();
    expect(detectFileType(new TextEncoder().encode("<svg></svg>"))).toBeNull();
  });

  it("rechaza buffers demasiado cortos", () => {
    expect(detectFileType(new Uint8Array([0x89, 0x50]))).toBeNull();
  });

  it("no acepta RIFF que no sea WEBP (p. ej. WAV)", () => {
    const wav = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45];
    expect(detectFileType(bytes(wav))).toBeNull();
  });
});

describe("validateUpload", () => {
  it("acepta un PNG válido y devuelve la extensión", () => {
    expect(validateUpload(bytes(PNG))).toEqual({
      contentType: "image/png",
      extension: "png",
      ok: true,
    });
  });

  it("rechaza archivos vacíos", () => {
    expect(validateUpload(new Uint8Array())).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("rechaza archivos de más de 5 MB", () => {
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    big.set(PNG);
    expect(validateUpload(big)).toEqual({ ok: false, reason: "too_large" });
  });

  it("acepta exactamente 5 MB", () => {
    const exact = new Uint8Array(MAX_UPLOAD_BYTES);
    exact.set(PDF);
    expect(validateUpload(exact).ok).toBe(true);
  });

  it("rechaza tipos no permitidos aunque se declaren como imagen", () => {
    expect(validateUpload(new TextEncoder().encode("MZ executable"))).toEqual({
      ok: false,
      reason: "invalid_type",
    });
  });
});

describe("sanitizeFilename", () => {
  it("elimina rutas y caracteres peligrosos", () => {
    expect(sanitizeFilename("../../etc/pass wd.png", "png")).toBe(
      "etc_pass_wd.png"
    );
  });

  it("usa un nombre por defecto si queda vacío", () => {
    expect(sanitizeFilename("....", "pdf")).toBe("archivo.pdf");
  });

  it("fuerza la extensión detectada, no la del cliente", () => {
    expect(sanitizeFilename("foto.exe", "jpg")).toBe("foto.jpg");
  });
});
