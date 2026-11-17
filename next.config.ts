import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Subruta opcional (p. ej. "/nefroia") si la app se sirve detrás de un proxy.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  devIndicators: false,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  experimental: {
    appNewScrollHandler: true,
    inlineCss: true,
    turbopackFileSystemCacheForDev: true,
  },
  logging: {
    fetches: {
      fullUrl: false,
    },
    incomingRequests: false,
  },
  // Imagen Docker mínima: genera .next/standalone con solo lo necesario.
  output: "standalone",
  poweredByHeader: false,
  reactCompiler: true,
  // Binarios nativos de ONNX Runtime (embeddings locales): no se empaquetan.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
};

export default withNextIntl(nextConfig);
