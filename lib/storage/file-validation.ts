/**
 * Validación de archivos subidos por "magic bytes" (firma real del contenido).
 * No se confía en `file.type` ni en la extensión, que el cliente controla.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const ALLOWED_UPLOAD_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
] as const;

export type AllowedUploadType = (typeof ALLOWED_UPLOAD_TYPES)[number];

const EXTENSION_BY_TYPE: Record<AllowedUploadType, string> = {
  "application/pdf": "pdf",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  if (bytes.length < offset + signature.length) {
    return false;
  }
  return signature.every((value, index) => bytes[offset + index] === value);
}

/** Detecta el tipo real a partir de los primeros bytes. */
export function detectFileType(bytes: Uint8Array): AllowedUploadType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  // GIF87a / GIF89a
  if (
    startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }
  // RIFF....WEBP
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  // %PDF-
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return "application/pdf";
  }
  return null;
}

export type UploadValidation =
  | { ok: true; contentType: AllowedUploadType; extension: string }
  | { ok: false; reason: "empty" | "too_large" | "invalid_type" };

export function validateUpload(bytes: Uint8Array): UploadValidation {
  if (bytes.length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (bytes.length > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: "too_large" };
  }
  const contentType = detectFileType(bytes);
  if (!contentType) {
    return { ok: false, reason: "invalid_type" };
  }
  return { contentType, extension: EXTENSION_BY_TYPE[contentType], ok: true };
}

/** Nombre de archivo seguro para mostrar y para la clave del objeto. */
export function sanitizeFilename(name: string, extension: string): string {
  const base = name
    .replace(/\.[^./\\]*$/, "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return `${base || "archivo"}.${extension}`;
}

// ---------------------------------------------------------------------------
// Protocolos de la unidad: PDF, DOCX, Markdown y texto plano
// ---------------------------------------------------------------------------

export const PROTOCOL_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
/** Límite de tamaño descomprimido de un DOCX (defensa ante "zip bombs"). */
export const DOCX_MAX_UNCOMPRESSED_BYTES = 60 * 1024 * 1024;

export type ProtocolFileKind = "pdf" | "docx" | "markdown" | "text";

export const PROTOCOL_CONTENT_TYPES: Record<ProtocolFileKind, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  markdown: "text/markdown; charset=utf-8",
  pdf: "application/pdf",
  text: "text/plain; charset=utf-8",
};

const PROTOCOL_EXTENSIONS: Record<ProtocolFileKind, string> = {
  docx: "docx",
  markdown: "md",
  pdf: "pdf",
  text: "txt",
};

function readUint16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

export type ZipInspection = { names: string[]; uncompressedBytes: number };

/**
 * Lee el directorio central de un ZIP (sin descomprimir nada) para conocer
 * los nombres de las entradas y el tamaño descomprimido declarado.
 */
export function inspectZip(bytes: Uint8Array): ZipInspection | null {
  const eocdSignature = 0x06_05_4b_50;
  const minEocd = 22;
  const maxComment = 0xff_ff;
  const start = Math.max(0, bytes.length - minEocd - maxComment);
  let eocd = -1;
  for (let i = bytes.length - minEocd; i >= start; i -= 1) {
    if (readUint32(bytes, i) === eocdSignature) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    return null;
  }
  const entries = readUint16(bytes, eocd + 10);
  let offset = readUint32(bytes, eocd + 16);
  const names: string[] = [];
  let uncompressedBytes = 0;
  const decoder = new TextDecoder();
  for (let i = 0; i < entries; i += 1) {
    if (
      offset + 46 > bytes.length ||
      readUint32(bytes, offset) !== 0x02_01_4b_50
    ) {
      return null;
    }
    uncompressedBytes += readUint32(bytes, offset + 24);
    const nameLength = readUint16(bytes, offset + 28);
    const extraLength = readUint16(bytes, offset + 30);
    const commentLength = readUint16(bytes, offset + 32);
    names.push(
      decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
    );
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return { names, uncompressedBytes };
}

/** Texto UTF-8 válido, sin bytes nulos ni exceso de caracteres de control. */
export function isPlainUtf8Text(bytes: Uint8Array): boolean {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return false;
  }
  if (text.includes("\u0000")) {
    return false;
  }
  // Caracteres de control (categoría Unicode Cc) distintos de \t, \n y \r.
  const control =
    text.match(/\p{Cc}/gu)?.filter((char) => !"\t\n\r".includes(char)).length ??
    0;
  return control <= text.length * 0.01;
}

export type ProtocolUploadValidation =
  | {
      ok: true;
      kind: ProtocolFileKind;
      contentType: string;
      extension: string;
    }
  | {
      ok: false;
      reason: "empty" | "too_large" | "invalid_type" | "unsafe_archive";
    };

/**
 * Valida un protocolo por su contenido real. PDF y DOCX se reconocen por
 * firma; Markdown y texto no tienen firma, así que se exige la extensión
 * declarada (.md/.markdown/.txt) Y que el contenido sea texto UTF-8 válido.
 */
export function validateProtocolUpload(
  bytes: Uint8Array,
  filename: string
): ProtocolUploadValidation {
  if (bytes.length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (bytes.length > PROTOCOL_UPLOAD_MAX_BYTES) {
    return { ok: false, reason: "too_large" };
  }
  const accept = (kind: ProtocolFileKind): ProtocolUploadValidation => ({
    contentType: PROTOCOL_CONTENT_TYPES[kind],
    extension: PROTOCOL_EXTENSIONS[kind],
    kind,
    ok: true,
  });

  if (detectFileType(bytes) === "application/pdf") {
    return accept("pdf");
  }
  // PK\x03\x04: ZIP. Solo se acepta si es un documento de Word.
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    const zip = inspectZip(bytes);
    if (
      !(
        zip?.names.includes("[Content_Types].xml") &&
        zip.names.includes("word/document.xml")
      )
    ) {
      return { ok: false, reason: "invalid_type" };
    }
    if (zip.uncompressedBytes > DOCX_MAX_UNCOMPRESSED_BYTES) {
      return { ok: false, reason: "unsafe_archive" };
    }
    return accept("docx");
  }
  const extension = filename.toLowerCase().split(".").pop() ?? "";
  if (["md", "markdown", "txt"].includes(extension) && isPlainUtf8Text(bytes)) {
    return accept(extension === "txt" ? "text" : "markdown");
  }
  return { ok: false, reason: "invalid_type" };
}
