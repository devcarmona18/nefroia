/** Prefijo de todas las subidas de un usuario. */
export function userUploadPrefix(userId: string) {
  return `uploads/${userId}/`;
}

/** Ruta pública (dentro de la app) para leer un archivo subido. */
export function appFileUrl(key: string, basePath = "") {
  return `${basePath}/api/files/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

/** Extrae la clave S3 de una URL generada por `appFileUrl`. */
export function keyFromAppFileUrl(url: string): string | null {
  let pathname = "";
  try {
    ({ pathname } = new URL(url, "http://localhost"));
  } catch {
    return null;
  }
  const marker = "/api/files/";
  const index = pathname.indexOf(marker);
  if (index === -1) {
    return null;
  }
  const rest = pathname.slice(index + marker.length);
  if (!rest || rest === "upload") {
    return null;
  }
  try {
    return rest.split("/").map(decodeURIComponent).join("/");
  } catch {
    return null;
  }
}

/** Una clave es válida para un usuario si está bajo su prefijo y sin `..`. */
export function isKeyOwnedBy(key: string, userId: string) {
  return key.startsWith(userUploadPrefix(userId)) && !key.includes("..");
}
