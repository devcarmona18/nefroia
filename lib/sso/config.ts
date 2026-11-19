/**
 * Configuración del inicio de sesión único (SSO) desde Hoja Diaria Renal y
 * del modo integrado (iframe). Ver docs/integracion-nefroia.md.
 *
 * - NEFROIA_SSO_SECRET: secreto HMAC compartido con Hoja Diaria. Sin él (o si
 *   es demasiado corto) el SSO rechaza TODO.
 * - HOJA_DIARIA_ORIGIN: único origen autorizado a enmarcar NefroIA
 *   (CSP frame-ancestors). Sin él, NefroIA no se puede enmarcar.
 */

export const SSO_ISSUER = "hoja-diaria-renal";
export const SSO_AUDIENCE = "nefroia";
/** Vida máxima aceptada de un token (exp − iat), en segundos. */
export const SSO_MAX_TTL_SECONDS = 120;
/** Tolerancia de reloj entre servidores, en segundos. */
export const SSO_CLOCK_SKEW_SECONDS = 5;
/** Longitud mínima del secreto compartido (HS256 exige ≥ 256 bits). */
export const SSO_MIN_SECRET_LENGTH = 32;
/** Duración de una sesión de NefroIA iniciada por SSO (igual que Hoja Diaria). */
export const SSO_SESSION_SECONDS = 8 * 60 * 60;
/** Prefijo de los usuarios de NefroIA vinculados a Hoja Diaria. */
export const SSO_USER_PREFIX = "hdr:";
/** Cookie que marca el modo integrado (diseño compacto). */
export const EMBED_COOKIE = "nefroia-embed";

/** Devuelve el secreto si es utilizable; `null` deja el SSO desactivado. */
export function getSsoSecret(
  env: Record<string, string | undefined> = process.env
): string | null {
  const secret = env.NEFROIA_SSO_SECRET?.trim() ?? "";
  return secret.length >= SSO_MIN_SECRET_LENGTH ? secret : null;
}

/**
 * Normaliza un origen (`esquema://host[:puerto]`). Rechaza comodines, rutas,
 * credenciales y cualquier carácter que permita inyectar directivas CSP.
 */
export function parseOrigin(value: string | undefined | null): string | null {
  const raw = value?.trim();
  if (!raw || /[\s;,'"*]/.test(raw)) {
    return null;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    if (url.username || url.password) {
      return null;
    }
    if ((url.pathname !== "/" && url.pathname !== "") || url.search) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function getHojaDiariaOrigin(
  env: Record<string, string | undefined> = process.env
): string | null {
  return parseOrigin(env.HOJA_DIARIA_ORIGIN);
}

/** El modo integrado requiere el secreto y el origen de Hoja Diaria. */
export function isEmbeddingEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return Boolean(getSsoSecret(env) && getHojaDiariaOrigin(env));
}

/**
 * Valor de la cabecera Content-Security-Policy para todas las respuestas:
 * solo Hoja Diaria puede enmarcar NefroIA; sin configuración, nadie.
 */
export function frameAncestorsPolicy(
  env: Record<string, string | undefined> = process.env
): string {
  const origin = isEmbeddingEnabled(env) ? getHojaDiariaOrigin(env) : null;
  return `frame-ancestors ${origin ?? "'none'"}`;
}

/**
 * Atributos de las cookies que deben viajar dentro del iframe (contexto de
 * terceros): SameSite=None exige Secure. Sin modo integrado se mantiene Lax.
 */
export function crossSiteCookieOptions(
  env: Record<string, string | undefined> = process.env
): { sameSite: "none" | "lax"; secure?: boolean } {
  return isEmbeddingEnabled(env)
    ? { sameSite: "none", secure: true }
    : { sameSite: "lax" };
}
