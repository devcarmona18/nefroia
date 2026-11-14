import "server-only";

import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";

let sdk: NodeSDK | null = null;

/**
 * OpenTelemetry genérico (OTLP/HTTP). Se activa solo si se define
 * `OTEL_EXPORTER_OTLP_ENDPOINT`; funciona con cualquier colector
 * (Jaeger, Tempo, Grafana, Datadog Agent, etc.).
 */
export function registerOtel(serviceName: string) {
  if (sdk) {
    return;
  }
  process.env.OTEL_SERVICE_NAME ??= serviceName;
  sdk = new NodeSDK({ traceExporter: new OTLPTraceExporter() });
  sdk.start();
}
