import "server-only";

import { cookies } from "next/headers";
import { EMBED_COOKIE, isEmbeddingEnabled } from "./config";

/**
 * `true` si la sesión se abrió desde el iframe de Hoja Diaria (`embed=1`):
 * diseño compacto, barra lateral plegada y sin logotipo duplicado. El aviso
 * de apoyo a la decisión se mantiene siempre.
 */
export async function isEmbeddedRequest() {
  if (!isEmbeddingEnabled()) {
    return false;
  }
  const cookieStore = await cookies();
  return cookieStore.get(EMBED_COOKIE)?.value === "1";
}
