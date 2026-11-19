import "server-only";

import { eq, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { ssoTokenUse, user } from "@/lib/db/schema";
import { generateHashedPassword } from "@/lib/db/utils";
import { getRedis } from "@/lib/ratelimit";
import { generateUUID } from "@/lib/utils";
import { getSsoSecret, SSO_USER_PREFIX } from "./config";
import { createMemoryReplayStore, type ReplayStore } from "./replay";
import { type SsoClaims, type SsoErrorCode, verifySsoToken } from "./token";

const memoryStore = createMemoryReplayStore();

/** Redis (SET NX PX) si está disponible. */
async function consumeWithRedis(jti: string, expiresAtMs: number) {
  const redis = getRedis();
  if (!redis?.isReady) {
    return null;
  }
  try {
    const ttl = Math.max(1000, expiresAtMs - Date.now());
    const result = await redis.set(`sso:jti:${jti}`, "1", {
      condition: "NX",
      expiration: { type: "PX", value: ttl },
    });
    return result === "OK";
  } catch {
    return null;
  }
}

/** Tabla sso_token_use (INSERT … ON CONFLICT DO NOTHING). */
async function consumeWithDb(jti: string, expiresAtMs: number) {
  try {
    await db.delete(ssoTokenUse).where(lt(ssoTokenUse.expiresAt, sql`now()`));
    const inserted = await db
      .insert(ssoTokenUse)
      .values({ expiresAt: new Date(expiresAtMs), jti })
      .onConflictDoNothing()
      .returning({ jti: ssoTokenUse.jti });
    return inserted.length === 1;
  } catch {
    return null;
  }
}

/**
 * Orden: Redis → PostgreSQL → memoria del proceso. Si Redis responde, se usa
 * su resultado; si falla, se cae al siguiente almacén.
 */
export const replayStore: ReplayStore = {
  async consume(jti, expiresAtMs) {
    const fromRedis = await consumeWithRedis(jti, expiresAtMs);
    if (fromRedis !== null) {
      return fromRedis;
    }
    const fromDb = await consumeWithDb(jti, expiresAtMs);
    if (fromDb !== null) {
      return fromDb;
    }
    return memoryStore.consume(jti, expiresAtMs);
  },
};

/** Crea o actualiza el usuario de NefroIA vinculado ("hdr:<sub>"). */
export async function upsertSsoUser(claims: SsoClaims) {
  const email = `${SSO_USER_PREFIX}${claims.sub}`.toLowerCase();
  // Contraseña aleatoria nunca revelada: la cuenta solo entra por SSO.
  await db
    .insert(user)
    .values({
      email,
      name: claims.name,
      password: generateHashedPassword(generateUUID()),
    })
    .onConflictDoNothing();
  const [row] = await db
    .update(user)
    .set({ name: claims.name, updatedAt: new Date() })
    .where(eq(user.email, email))
    .returning({ email: user.email, id: user.id, name: user.name });
  return row;
}

export type SsoAuthResult =
  | {
      ok: true;
      user: { id: string; email: string; name: string | null };
      claims: SsoClaims;
    }
  | { ok: false; code: SsoErrorCode | "replayed" };

/**
 * Verifica el token, consume su `jti` (un solo uso) y vincula el usuario.
 * Lo usa el proveedor "hoja-diaria" de Auth.js.
 */
export async function authenticateSsoToken(
  token: unknown
): Promise<SsoAuthResult> {
  const result = verifySsoToken(typeof token === "string" ? token : null, {
    secret: getSsoSecret(),
  });
  if (!result.ok) {
    return result;
  }
  const firstUse = await replayStore.consume(
    result.claims.jti,
    result.claims.exp * 1000 + 60_000
  );
  if (!firstUse) {
    return { code: "replayed", ok: false };
  }
  const row = await upsertSsoUser(result.claims);
  if (!row) {
    return { code: "bad_claims", ok: false };
  }
  return { claims: result.claims, ok: true, user: row };
}
