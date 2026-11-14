/**
 * Hook de arranque de Next.js. Valida la configuración mínima y, de forma
 * opcional, activa OpenTelemetry genérico (OTLP) si se define
 * `OTEL_EXPORTER_OTLP_ENDPOINT`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { validateEnv } = await import("./lib/env");
  validateEnv();

  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    const { registerTelemetry } = await import("ai");
    const { OpenTelemetry } = await import("@ai-sdk/otel");
    const { registerOtel } = await import("./lib/otel");
    registerOtel(process.env.OTEL_SERVICE_NAME ?? "nefroia");
    registerTelemetry(new OpenTelemetry());
  }
}
