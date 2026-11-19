import { createHmac, timingSafeEqual } from "node:crypto";
import {
  SSO_AUDIENCE,
  SSO_CLOCK_SKEW_SECONDS,
  SSO_ISSUER,
  SSO_MAX_TTL_SECONDS,
  SSO_MIN_SECRET_LENGTH,
} from "./config";

/**
 * Token de SSO emitido por Hoja Diaria Renal: JWT compacto HS256.
 * Verificación deliberadamente estricta y sin dependencias: solo se acepta
 * `alg: HS256` (nunca `none` ni algoritmos elegidos por el emisor).
 */

export type SsoRole = "admin" | "demo";

export type SsoClaims = {
  sub: string;
  role: SsoRole;
  name: string;
  iat: number;
  exp: number;
  jti: string;
  iss: typeof SSO_ISSUER;
  aud: typeof SSO_AUDIENCE;
};

export type SsoErrorCode =
  | "not_configured"
  | "malformed"
  | "bad_algorithm"
  | "bad_signature"
  | "bad_issuer"
  | "bad_audience"
  | "expired"
  | "not_yet_valid"
  | "ttl_too_long"
  | "bad_claims";

export type SsoVerifyResult =
  | { ok: true; claims: SsoClaims }
  | { ok: false; code: SsoErrorCode };

/** `sub` se usa en el correo "hdr:<sub>" (varchar 64): formato acotado. */
const SUB_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,59}$/;
const JTI_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const MAX_TOKEN_LENGTH = 4096;

function base64UrlEncode(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function decodeJsonSegment(segment: string): unknown {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) {
    throw new Error("invalid base64url");
  }
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

function sign(input: string, secret: string) {
  return createHmac("sha256", secret).update(input).digest();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

/** Verifica firma y claims. No consume el `jti` (ver replay.ts). */
export function verifySsoToken(
  token: string | null | undefined,
  {
    secret,
    now = Date.now(),
  }: { secret: string | null | undefined; now?: number }
): SsoVerifyResult {
  if (!secret || secret.length < SSO_MIN_SECRET_LENGTH) {
    return { code: "not_configured", ok: false };
  }
  if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) {
    return { code: "malformed", ok: false };
  }
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) {
    return { code: "malformed", ok: false };
  }
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: unknown;
  let payload: unknown;
  try {
    header = decodeJsonSegment(headerB64);
    payload = decodeJsonSegment(payloadB64);
  } catch {
    return { code: "malformed", ok: false };
  }
  if (!(isRecord(header) && isRecord(payload))) {
    return { code: "malformed", ok: false };
  }
  if (header.alg !== "HS256" || ("crit" in header && header.crit)) {
    return { code: "bad_algorithm", ok: false };
  }

  // Firma en tiempo constante, antes de confiar en cualquier claim.
  const expected = sign(`${headerB64}.${payloadB64}`, secret);
  let received: Buffer;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(signatureB64)) {
      return { code: "bad_signature", ok: false };
    }
    received = Buffer.from(signatureB64, "base64url");
  } catch {
    return { code: "bad_signature", ok: false };
  }
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    return { code: "bad_signature", ok: false };
  }

  if (payload.iss !== SSO_ISSUER) {
    return { code: "bad_issuer", ok: false };
  }
  const { aud } = payload;
  const audOk = Array.isArray(aud)
    ? aud.length === 1 && aud[0] === SSO_AUDIENCE
    : aud === SSO_AUDIENCE;
  if (!audOk) {
    return { code: "bad_audience", ok: false };
  }

  const { iat, exp, nbf } = payload;
  if (!(isInt(iat) && isInt(exp))) {
    return { code: "bad_claims", ok: false };
  }
  const nowSeconds = Math.floor(now / 1000);
  if (exp <= nowSeconds - SSO_CLOCK_SKEW_SECONDS) {
    return { code: "expired", ok: false };
  }
  if (
    iat > nowSeconds + SSO_CLOCK_SKEW_SECONDS ||
    (nbf !== undefined &&
      (!isInt(nbf) || nbf > nowSeconds + SSO_CLOCK_SKEW_SECONDS))
  ) {
    return { code: "not_yet_valid", ok: false };
  }
  if (exp <= iat || exp - iat > SSO_MAX_TTL_SECONDS) {
    return { code: "ttl_too_long", ok: false };
  }

  const { sub, role, name, jti } = payload;
  if (
    typeof sub !== "string" ||
    !SUB_PATTERN.test(sub) ||
    (role !== "admin" && role !== "demo") ||
    typeof jti !== "string" ||
    !JTI_PATTERN.test(jti) ||
    (name !== undefined && typeof name !== "string")
  ) {
    return { code: "bad_claims", ok: false };
  }

  return {
    claims: {
      aud: SSO_AUDIENCE,
      exp,
      iat,
      iss: SSO_ISSUER,
      jti,
      name: (typeof name === "string" ? name : sub).trim().slice(0, 100) || sub,
      role,
      sub,
    },
    ok: true,
  };
}

/**
 * Firma un token con el mismo formato que Hoja Diaria. Solo para pruebas y
 * scripts de desarrollo: en producción el emisor es siempre Hoja Diaria.
 */
export function signSsoToken(
  claims: Record<string, unknown>,
  secret: string,
  header: Record<string, unknown> = { alg: "HS256", typ: "JWT" }
) {
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(claims));
  const signature = sign(`${headerB64}.${payloadB64}`, secret);
  return `${headerB64}.${payloadB64}.${base64UrlEncode(signature)}`;
}
