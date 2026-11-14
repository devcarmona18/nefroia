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
    .slice(0, 60);
  return `${base || "archivo"}.${extension}`;
}
