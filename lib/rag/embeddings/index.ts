import { createHashEmbedder } from "./hash";
import { createLocalE5Embedder } from "./local-e5";
import { createOpenAIEmbedder } from "./openai";
import type { Embedder } from "./types";

export type EmbeddingProviderName = "local" | "openai" | "hash";

export function resolveEmbeddingProvider(
  env: Record<string, string | undefined> = process.env
): EmbeddingProviderName {
  const requested = env.EMBEDDING_PROVIDER?.trim().toLowerCase();
  if (requested === "local" || requested === "openai" || requested === "hash") {
    return requested;
  }
  // En pruebas (Playwright/CI) no hay red: embedder determinista.
  if (env.PLAYWRIGHT || env.CI_PLAYWRIGHT || env.PLAYWRIGHT_TEST_BASE_URL) {
    return "hash";
  }
  return "local";
}

let cached: { name: EmbeddingProviderName; embedder: Embedder } | null = null;

/** Embedder configurado (singleton por proceso). */
export function getEmbedder(): Embedder {
  const name = resolveEmbeddingProvider();
  if (cached?.name === name) {
    return cached.embedder;
  }
  let embedder: Embedder;
  switch (name) {
    case "openai": {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error(
          "EMBEDDING_PROVIDER=openai requiere OPENAI_API_KEY configurada."
        );
      }
      embedder = createOpenAIEmbedder(apiKey);
      break;
    }
    case "hash":
      embedder = createHashEmbedder();
      break;
    default:
      embedder = createLocalE5Embedder();
  }
  cached = { embedder, name };
  return embedder;
}

export { createHashEmbedder } from "./hash";
export type { Embedder } from "./types";
