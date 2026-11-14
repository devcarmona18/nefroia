import "server-only";

/**
 * Validación de variables de entorno al arrancar el servidor. Solo registra
 * advertencias (no detiene el proceso) para no romper el build ni los
 * entornos de prueba.
 */
export function validateEnv() {
  const problems: string[] = [];

  if (!process.env.AUTH_SECRET) {
    problems.push("AUTH_SECRET no está definida (openssl rand -base64 32).");
  }
  if (!process.env.POSTGRES_URL) {
    problems.push("POSTGRES_URL no está definida.");
  }
  if (!(process.env.PLAYWRIGHT || process.env.ANTHROPIC_API_KEY)) {
    problems.push(
      "ANTHROPIC_API_KEY no está definida: el asistente no podrá responder."
    );
  }
  if (!process.env.S3_BUCKET) {
    problems.push(
      "S3_BUCKET no está definida: la subida de archivos estará deshabilitada."
    );
  }

  for (const problem of problems) {
    console.warn(`[nefroia] Configuración: ${problem}`);
  }
}
