// Auth.js usa cookies "seguras" solo cuando la petición llega por HTTPS (también
// detrás de un proxy inverso). Así la app funciona en http://localhost con Docker.
export function isSecureRequest(request: Request) {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0];
  const protocol = forwarded?.trim() ?? new URL(request.url).protocol;
  return protocol.replace(":", "") === "https";
}
