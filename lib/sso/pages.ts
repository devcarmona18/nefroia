/**
 * Páginas mínimas (HTML estático, sin datos del usuario) que muestra /sso
 * cuando no se puede iniciar sesión. Se ven dentro del iframe de Hoja Diaria.
 */
export type SsoPageKind =
  | "not_configured"
  | "invalid"
  | "expired"
  | "replayed"
  | "cookies_blocked";

const TEXTS: Record<
  "es" | "en",
  Record<SsoPageKind, { title: string; body: string }>
> = {
  en: {
    cookies_blocked: {
      body: "Your browser blocked NefroIA's session cookie inside Hoja Diaria (third-party cookies). Use the “Open in new tab” button in Hoja Diaria.",
      title: "Could not keep the session",
    },
    expired: {
      body: "The access link expired (it lasts less than two minutes). Open the IA section of Hoja Diaria again.",
      title: "Access link expired",
    },
    invalid: {
      body: "The access link is not valid. Open the IA section of Hoja Diaria again.",
      title: "Invalid access link",
    },
    not_configured: {
      body: "Single sign-on with Hoja Diaria is not configured on this server.",
      title: "Single sign-on unavailable",
    },
    replayed: {
      body: "This access link was already used. Open the IA section of Hoja Diaria again to get a new one.",
      title: "Access link already used",
    },
  },
  es: {
    cookies_blocked: {
      body: "Tu navegador bloqueó la cookie de sesión de NefroIA dentro de Hoja Diaria (cookies de terceros). Usa el botón «Abrir en pestaña nueva» de Hoja Diaria.",
      title: "No se pudo mantener la sesión",
    },
    expired: {
      body: "El enlace de acceso venció (dura menos de dos minutos). Vuelve a abrir el apartado IA de Hoja Diaria.",
      title: "Enlace de acceso vencido",
    },
    invalid: {
      body: "El enlace de acceso no es válido. Vuelve a abrir el apartado IA de Hoja Diaria.",
      title: "Enlace de acceso no válido",
    },
    not_configured: {
      body: "El inicio de sesión con Hoja Diaria no está configurado en este servidor.",
      title: "Inicio de sesión único no disponible",
    },
    replayed: {
      body: "Este enlace de acceso ya se usó. Vuelve a abrir el apartado IA de Hoja Diaria para obtener uno nuevo.",
      title: "Enlace de acceso ya usado",
    },
  },
};

const DISCLAIMER = {
  en: "NefroIA is a decision-support tool: it does not diagnose or prescribe.",
  es: "NefroIA es una herramienta de apoyo a la decisión: no diagnostica ni prescribe.",
};

export function renderSsoPage(
  kind: SsoPageKind,
  locale: "es" | "en",
  status: number
) {
  const { title, body } = TEXTS[locale][kind];
  const html = `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} · NefroIA</title>
<style>
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;color:#0f172a}
main{max-width:28rem;margin:1.5rem;padding:1.5rem;border:1px solid #e2e8f0;border-radius:.75rem;background:#fff}
h1{font-size:1.125rem;margin:0 0 .5rem}p{margin:0 0 .75rem;line-height:1.5}small{color:#475569}
</style>
</head>
<body>
<main role="alert" data-sso-error="${kind}">
<h1>${title}</h1>
<p>${body}</p>
<small>${DISCLAIMER[locale]}</small>
</main>
</body>
</html>`;
  return new Response(html, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
    },
    status,
  });
}
