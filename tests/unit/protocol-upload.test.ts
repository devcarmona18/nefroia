import { describe, expect, it } from "vitest";
import {
  DOCX_MAX_UNCOMPRESSED_BYTES,
  inspectZip,
  isPlainUtf8Text,
  PROTOCOL_UPLOAD_MAX_BYTES,
  validateProtocolUpload,
} from "@/lib/storage/file-validation";
import { createDocx, createZip } from "../support/docx";

const text = (value: string) => new TextEncoder().encode(value);

describe("validación de protocolos subidos", () => {
  it("acepta PDF por su firma, sin importar la extensión", () => {
    const result = validateProtocolUpload(text("%PDF-1.7\n..."), "x.txt");
    expect(result).toMatchObject({ extension: "pdf", kind: "pdf", ok: true });
  });

  it("acepta DOCX solo si el ZIP contiene un documento de Word", () => {
    expect(
      validateProtocolUpload(createDocx(["Hola"]), "a.docx")
    ).toMatchObject({ kind: "docx", ok: true });
    const otherZip = createZip([{ content: "x", name: "payload.exe" }]);
    expect(validateProtocolUpload(otherZip, "a.docx")).toEqual({
      ok: false,
      reason: "invalid_type",
    });
  });

  it("rechaza un DOCX que declara un tamaño descomprimido excesivo", () => {
    const bomb = createZip([
      { content: "<x/>", name: "[Content_Types].xml" },
      {
        content: "<x/>",
        declaredSize: DOCX_MAX_UNCOMPRESSED_BYTES + 1,
        name: "word/document.xml",
      },
    ]);
    expect(validateProtocolUpload(bomb, "a.docx")).toEqual({
      ok: false,
      reason: "unsafe_archive",
    });
  });

  it("lee el directorio central del ZIP", () => {
    const zip = inspectZip(createDocx(["# Título", "Texto"]));
    expect(zip?.names).toContain("word/document.xml");
    expect(inspectZip(text("no es un zip"))).toBeNull();
  });

  it("acepta Markdown y texto solo con extensión y contenido UTF-8 válidos", () => {
    expect(
      validateProtocolUpload(text("# Protocolo\nTexto"), "p.md")
    ).toMatchObject({ kind: "markdown", ok: true });
    expect(validateProtocolUpload(text("Texto plano"), "p.TXT")).toMatchObject({
      kind: "text",
      ok: true,
    });
    expect(validateProtocolUpload(text("Texto"), "p.html").ok).toBe(false);
    expect(
      validateProtocolUpload(new Uint8Array([0x4d, 0x5a, 0, 0, 1]), "virus.md")
        .ok
    ).toBe(false);
    expect(
      validateProtocolUpload(new Uint8Array([0xc3, 0x28]), "latin1.txt").ok
    ).toBe(false);
  });

  it("rechaza vacíos y archivos de más de 10 MB", () => {
    expect(validateProtocolUpload(new Uint8Array(), "a.md")).toEqual({
      ok: false,
      reason: "empty",
    });
    const big = new Uint8Array(PROTOCOL_UPLOAD_MAX_BYTES + 1);
    expect(validateProtocolUpload(big, "a.md")).toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("detecta texto binario", () => {
    expect(isPlainUtf8Text(text("Señal ñandú áéí"))).toBe(true);
    expect(isPlainUtf8Text(new Uint8Array([0x41, 0x00, 0x42]))).toBe(false);
  });
});
