import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { guestRegex } from "./lib/constants";
import { isSecureRequest } from "./lib/secure-request";
import { frameAncestorsPolicy } from "./lib/sso/config";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Cabeceras de seguridad comunes. `frame-ancestors` permite enmarcar NefroIA
 * solo desde HOJA_DIARIA_ORIGIN (o desde nadie si no está configurado).
 */
function withSecurityHeaders(response: Response) {
  response.headers.set("Content-Security-Policy", frameAncestorsPolicy());
  response.headers.delete("X-Frame-Options");
  return response;
}

function allowedHosts(request: NextRequest) {
  const hosts = new Set<string>();
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0];
  const host = forwarded?.trim() || request.headers.get("host");
  if (host) {
    hosts.add(host.toLowerCase());
  }
  for (const value of [process.env.AUTH_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    try {
      if (value) {
        hosts.add(new URL(value).host.toLowerCase());
      }
    } catch {
      // URL mal formada: se ignora.
    }
  }
  return hosts;
}

/**
 * Con el modo integrado las cookies son SameSite=None, así que el navegador
 * las envía también en peticiones iniciadas por otros sitios. Toda petición
 * que modifica datos y declara un Origin distinto del propio se rechaza
 * (defensa CSRF independiente de SameSite).
 */
function isCrossOriginMutation(request: NextRequest) {
  if (!MUTATING_METHODS.has(request.method)) {
    return false;
  }
  const origin = request.headers.get("origin");
  if (!origin) {
    return false;
  }
  try {
    return !allowedHosts(request).has(new URL(origin).host.toLowerCase());
  } catch {
    return true;
  }
}

async function handle(request: NextRequest) {
  // nextUrl.pathname ya viene sin NEXT_PUBLIC_BASE_PATH.
  const { pathname: path } = request.nextUrl;
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  if (path.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  if (isCrossOriginMutation(request)) {
    return NextResponse.json({ code: "forbidden_origin" }, { status: 403 });
  }

  // SSO desde Hoja Diaria: no debe caer en el inicio de sesión de invitado.
  if (
    path.startsWith("/api/auth") ||
    path === "/sso" ||
    path === "/sso/check"
  ) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: isSecureRequest(request),
  });

  if (!token) {
    const redirectUrl = encodeURIComponent(new URL(request.url).pathname);

    return NextResponse.redirect(
      new URL(`${base}/api/auth/guest?redirectUrl=${redirectUrl}`, request.url)
    );
  }

  const isGuest = guestRegex.test(token?.email ?? "");

  if (token && !isGuest && ["/login", "/register"].includes(path)) {
    return NextResponse.redirect(new URL(`${base}/`, request.url));
  }

  return NextResponse.next();
}

export async function proxy(request: NextRequest) {
  return withSecurityHeaders(await handle(request));
}

// Archivos públicos (iconos, imágenes OG, manifest) no requieren sesión, para
// que los previsualizadores de enlaces y el navegador puedan leerlos.
// Nota: Next.js exige que el matcher sea un literal estático.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|opengraph-image.png|twitter-image.png|manifest.webmanifest|icon-192.png|icon-512.png|logo.svg|logo-icon.svg|sitemap.xml|robots.txt).*)",
  ],
};
