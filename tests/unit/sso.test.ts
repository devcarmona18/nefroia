import { describe, expect, it } from "vitest";
import { getEntitlements } from "@/lib/ai/entitlements";
import {
  crossSiteCookieOptions,
  frameAncestorsPolicy,
  getSsoSecret,
  isEmbeddingEnabled,
  parseOrigin,
} from "@/lib/sso/config";
import { createMemoryReplayStore } from "@/lib/sso/replay";
import { signSsoToken, verifySsoToken } from "@/lib/sso/token";

const SECRET = `${"s".repeat(24)}-secreto-de-prueba-sso-0123456789`;
const NOW = Date.UTC(2026, 11, 1, 12, 0, 0);
const NOW_S = Math.floor(NOW / 1000);

function claims(overrides: Record<string, unknown> = {}) {
  return {
    aud: "nefroia",
    exp: NOW_S + 60,
    iat: NOW_S,
    iss: "hoja-diaria-renal",
    jti: "AbCdEfGhIjKlMnOpQrSt",
    name: "Administrador",
    role: "admin",
    sub: "admin",
    ...overrides,
  };
}

function verify(token: string, secret: string | null = SECRET, now = NOW) {
  return verifySsoToken(token, { now, secret });
}

describe("verifySsoToken", () => {
  it("acepta un token válido y devuelve los claims normalizados", () => {
    const result = verify(signSsoToken(claims(), SECRET));
    expect(result).toEqual({
      claims: expect.objectContaining({
        jti: "AbCdEfGhIjKlMnOpQrSt",
        name: "Administrador",
        role: "admin",
        sub: "admin",
      }),
      ok: true,
    });
  });

  it("acepta el rol demo y aud como arreglo de un elemento", () => {
    const result = verify(
      signSsoToken(
        claims({ aud: ["nefroia"], role: "demo", sub: "demo-1a2b" }),
        SECRET
      )
    );
    expect(result.ok && result.claims.role).toBe("demo");
  });

  it("rechaza todo si el secreto no está configurado o es corto", () => {
    const token = signSsoToken(claims(), SECRET);
    expect(verify(token, null)).toEqual({ code: "not_configured", ok: false });
    expect(verify(token, "")).toEqual({ code: "not_configured", ok: false });
    expect(verify(token, "corto")).toEqual({
      code: "not_configured",
      ok: false,
    });
  });

  it("rechaza una firma incorrecta (otro secreto o payload alterado)", () => {
    const other = signSsoToken(claims(), `${SECRET}-otro`);
    expect(verify(other)).toEqual({ code: "bad_signature", ok: false });

    const [h, , s] = signSsoToken(claims(), SECRET).split(".");
    const forged = Buffer.from(
      JSON.stringify(claims({ role: "admin", sub: "otro" }))
    ).toString("base64url");
    expect(verify(`${h}.${forged}.${s}`)).toEqual({
      code: "bad_signature",
      ok: false,
    });
    expect(verify(`${h}.${forged}.`)).toEqual({ code: "malformed", ok: false });
  });

  it("rechaza alg none y cualquier algoritmo distinto de HS256", () => {
    const none = signSsoToken(claims(), SECRET, { alg: "none" });
    expect(verify(none)).toEqual({ code: "bad_algorithm", ok: false });
    const hs512 = signSsoToken(claims(), SECRET, { alg: "HS512" });
    expect(verify(hs512)).toEqual({ code: "bad_algorithm", ok: false });
  });

  it("rechaza un token vencido (con 5 s de tolerancia)", () => {
    const token = signSsoToken(
      claims({ exp: NOW_S - 10, iat: NOW_S - 70 }),
      SECRET
    );
    expect(verify(token)).toEqual({ code: "expired", ok: false });
    const justExpired = signSsoToken(
      claims({ exp: NOW_S - 2, iat: NOW_S - 62 }),
      SECRET
    );
    expect(verify(justExpired).ok).toBe(true);
  });

  it("rechaza tokens con vida mayor a 2 minutos o emitidos en el futuro", () => {
    expect(verify(signSsoToken(claims({ exp: NOW_S + 600 }), SECRET))).toEqual({
      code: "ttl_too_long",
      ok: false,
    });
    expect(
      verify(
        signSsoToken(claims({ exp: NOW_S + 120, iat: NOW_S + 60 }), SECRET)
      )
    ).toEqual({ code: "not_yet_valid", ok: false });
  });

  it("rechaza emisor o audiencia incorrectos", () => {
    expect(verify(signSsoToken(claims({ iss: "otra-app" }), SECRET))).toEqual({
      code: "bad_issuer",
      ok: false,
    });
    expect(verify(signSsoToken(claims({ aud: "otra-app" }), SECRET))).toEqual({
      code: "bad_audience",
      ok: false,
    });
    expect(
      verify(signSsoToken(claims({ aud: ["nefroia", "otra"] }), SECRET))
    ).toEqual({ code: "bad_audience", ok: false });
  });

  it("rechaza claims mal formados (rol, sub, jti)", () => {
    for (const bad of [
      { role: "superadmin" },
      { sub: "" },
      { sub: "a b" },
      { sub: "x".repeat(61) },
      { jti: "corto" },
      { jti: undefined },
      { iat: "ayer" },
    ]) {
      expect(verify(signSsoToken(claims(bad), SECRET)).ok).toBe(false);
    }
  });

  it("rechaza basura", () => {
    for (const token of [
      "",
      "a.b",
      "a.b.c.d",
      "%%%.%%%.%%%",
      "x".repeat(5000),
    ]) {
      expect(verify(token).ok).toBe(false);
    }
  });
});

describe("almacén anti-reutilización (jti)", () => {
  it("acepta el primer uso y rechaza la repetición mientras está vigente", async () => {
    let now = NOW;
    const store = createMemoryReplayStore(() => now);
    expect(await store.consume("jti-1", NOW + 60_000)).toBe(true);
    expect(await store.consume("jti-1", NOW + 60_000)).toBe(false);
    expect(await store.consume("jti-2", NOW + 60_000)).toBe(true);
    // Tras caducar ya no importa: el token también está vencido.
    now = NOW + 61_000;
    expect(await store.consume("jti-1", NOW + 120_000)).toBe(true);
  });
});

describe("configuración del modo integrado", () => {
  const env = {
    HOJA_DIARIA_ORIGIN: "https://hoja-diaria-renal.onrender.com/",
    NEFROIA_SSO_SECRET: SECRET,
  };

  it("normaliza y valida HOJA_DIARIA_ORIGIN", () => {
    expect(parseOrigin("https://hoja.example.org/")).toBe(
      "https://hoja.example.org"
    );
    expect(parseOrigin("http://127.0.0.1:8790")).toBe("http://127.0.0.1:8790");
    for (const bad of [
      "",
      "*",
      "https://*.example.org",
      "https://a.org https://b.org",
      "https://a.org; script-src *",
      "javascript:alert(1)",
      "https://a.org/ruta",
      "https://user:pw@a.org",
    ]) {
      expect(parseOrigin(bad)).toBeNull();
    }
  });

  it("frame-ancestors solo permite Hoja Diaria; sin configuración, nadie", () => {
    expect(frameAncestorsPolicy(env)).toBe(
      "frame-ancestors https://hoja-diaria-renal.onrender.com"
    );
    expect(frameAncestorsPolicy({})).toBe("frame-ancestors 'none'");
    expect(
      frameAncestorsPolicy({ HOJA_DIARIA_ORIGIN: env.HOJA_DIARIA_ORIGIN })
    ).toBe("frame-ancestors 'none'");
  });

  it("cookies SameSite=None; Secure solo con el modo integrado", () => {
    expect(isEmbeddingEnabled(env)).toBe(true);
    expect(crossSiteCookieOptions(env)).toEqual({
      sameSite: "none",
      secure: true,
    });
    expect(crossSiteCookieOptions({})).toEqual({ sameSite: "lax" });
    expect(getSsoSecret({ NEFROIA_SSO_SECRET: "  corto " })).toBeNull();
  });
});

describe("límites del rol demo de Hoja Diaria", () => {
  it("hdr-demo: pocos mensajes y sin subir protocolos ni archivos", () => {
    const demo = getEntitlements("hdr-demo");
    expect(demo).toEqual({
      canManageProtocols: false,
      canUploadFiles: false,
      maxMessagesPerHour: 5,
    });
    const admin = getEntitlements("hdr");
    expect(admin.canManageProtocols).toBe(true);
    expect(admin.maxMessagesPerHour).toBe(60);
  });
});
