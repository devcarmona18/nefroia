import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth, isSsoUserType } from "@/app/(auth)/auth";
import { LOCALE_COOKIE, resolveLocale } from "@/i18n/config";
import { renderSsoPage } from "@/lib/sso/pages";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Paso final del SSO: si la cookie de sesión llegó, entra al chat; si no
 * (cookies de terceros bloqueadas en el iframe), explica cómo seguir en vez
 * de caer en un bucle de redirecciones o en una sesión de invitado.
 */
export async function GET(request: Request) {
  const [session, cookieStore] = await Promise.all([auth(), cookies()]);
  if (session?.user && isSsoUserType(session.user.type)) {
    return NextResponse.redirect(new URL(`${BASE_PATH}/`, request.url), 303);
  }
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  return renderSsoPage("cookies_blocked", locale, 200);
}
