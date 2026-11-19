import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { signIn } from "@/app/(auth)/auth";
import { LOCALE_COOKIE, resolveLocale } from "@/i18n/config";
import {
  crossSiteCookieOptions,
  EMBED_COOKIE,
  getSsoSecret,
  SSO_SESSION_SECONDS,
} from "@/lib/sso/config";
import { renderSsoPage, type SsoPageKind } from "@/lib/sso/pages";
import { verifySsoToken } from "@/lib/sso/token";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Entrada de SSO desde Hoja Diaria Renal:
 *   GET /sso?token=<JWT HS256>&embed=1&lang=es
 * Valida el token (firma, exp, iss/aud, un solo uso), inicia la sesión de
 * Auth.js y redirige a /sso/check, que quita el token de la URL y comprueba
 * que la cookie de sesión llegó (en un iframe puede estar bloqueada).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const locale = resolveLocale(url.searchParams.get("lang"));
  const embed = url.searchParams.get("embed") === "1";

  if (!getSsoSecret()) {
    return renderSsoPage("not_configured", locale, 404);
  }

  const token = url.searchParams.get("token");
  // Comprobación previa (sin consumir el jti) para dar un mensaje preciso.
  const precheck = verifySsoToken(token, { secret: getSsoSecret() });
  if (!precheck.ok) {
    const kind: SsoPageKind =
      precheck.code === "expired" ? "expired" : "invalid";
    return renderSsoPage(kind, locale, 401);
  }

  try {
    const redirectUrl = await signIn("hoja-diaria", {
      redirect: false,
      redirectTo: `${BASE_PATH}/`,
      token,
    });
    if (typeof redirectUrl === "string" && redirectUrl.includes("error=")) {
      return renderSsoPage("replayed", locale, 401);
    }
  } catch {
    // La firma ya se validó: el fallo es un jti reutilizado (o la BD).
    return renderSsoPage("replayed", locale, 401);
  }

  const cookieStore = await cookies();
  const sameSite = crossSiteCookieOptions();
  cookieStore.set(LOCALE_COOKIE, locale, {
    ...sameSite,
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
  });
  if (embed) {
    cookieStore.set(EMBED_COOKIE, "1", {
      ...sameSite,
      httpOnly: true,
      maxAge: SSO_SESSION_SECONDS,
      path: "/",
    });
  } else {
    cookieStore.delete(EMBED_COOKIE);
  }

  const response = NextResponse.redirect(
    new URL(`${BASE_PATH}/sso/check`, request.url),
    303
  );
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
