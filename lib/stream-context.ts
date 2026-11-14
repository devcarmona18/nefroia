import "server-only";

import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";

/**
 * Contexto de streams reanudables. Solo está disponible si `REDIS_URL` está
 * definida; sin Redis el chat funciona igual pero no se puede reanudar un
 * stream interrumpido (p. ej. tras recargar la página a mitad de respuesta).
 */
let context: ReturnType<typeof createResumableStreamContext> | null = null;

export function getStreamContext() {
  if (!process.env.REDIS_URL) {
    return null;
  }
  try {
    // Singleton: cada contexto abre sus propias conexiones a Redis.
    context ??= createResumableStreamContext({ waitUntil: after });
    return context;
  } catch {
    return null;
  }
}
