/**
 * Utilidades para leer información del cliente desde las cabeceras HTTP.
 * Pensado para funcionar detrás de cualquier proxy inverso (nginx, Traefik,
 * Cloudflare, ALB...). Solo confía en estas cabeceras si tu proxy las
 * sobrescribe; nunca expongas la app directamente a internet sin proxy si
 * dependes de ellas para limitar peticiones.
 */

const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6_PATTERN = /^[0-9a-fA-F:]+$/;

function normalizeIp(raw: string | null | undefined): string | undefined {
  if (!raw) {
    return;
  }
  const value = raw.trim().replace(/^::ffff:/, "");
  if (
    IPV4_PATTERN.test(value) ||
    (value.includes(":") && IPV6_PATTERN.test(value))
  ) {
    return value;
  }
}

/** IP del cliente a partir de `x-forwarded-for` / `x-real-ip`. */
export function getClientIp(
  request: Pick<Request, "headers">
): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = normalizeIp(forwarded.split(",")[0]);
    if (first) {
      return first;
    }
  }
  return (
    normalizeIp(request.headers.get("x-real-ip")) ??
    normalizeIp(request.headers.get("cf-connecting-ip"))
  );
}

export type RequestGeo = {
  city?: string;
  country?: string;
};

/**
 * Ubicación aproximada si el proxy la provee (`x-geo-city`, `x-geo-country`
 * o `cf-ipcountry` de Cloudflare). Si no hay cabeceras devuelve un objeto vacío.
 */
export function getRequestGeo(request: Pick<Request, "headers">): RequestGeo {
  const decode = (value: string | null) => {
    if (!value) {
      return;
    }
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  const country =
    decode(request.headers.get("x-geo-country")) ??
    decode(request.headers.get("cf-ipcountry"));
  return {
    city: decode(request.headers.get("x-geo-city")),
    country: country && country !== "XX" ? country : undefined,
  };
}
