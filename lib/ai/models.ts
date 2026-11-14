/**
 * Catálogo de modelos de NefroIA.
 *
 * Este archivo es seguro para el cliente (no lee secretos ni variables de
 * servidor). La disponibilidad real de cada modelo (según las API keys
 * configuradas) se resuelve en `lib/ai/providers.ts` y se expone al cliente
 * mediante `GET /api/models`.
 *
 * Para añadir un modelo: agrégalo a `chatModels` con el id
 * `<proveedor>/<id-del-modelo-en-el-proveedor>`.
 */

export type ModelProvider = "anthropic" | "openai" | "google";

export type ModelCapabilities = {
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
};

export type ChatModel = {
  id: string;
  name: string;
  provider: ModelProvider;
  capabilities: ModelCapabilities;
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
};

export const PROVIDER_NAMES: Record<ModelProvider, string> = {
  anthropic: "Anthropic",
  google: "Google",
  openai: "OpenAI",
};

export const chatModels: ChatModel[] = [
  {
    capabilities: { reasoning: false, tools: true, vision: true },
    id: "anthropic/claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    provider: "anthropic",
  },
  {
    capabilities: { reasoning: false, tools: true, vision: true },
    id: "anthropic/claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
  },
  {
    capabilities: { reasoning: false, tools: true, vision: true },
    id: "anthropic/claude-opus-4-5",
    name: "Claude Opus 4.5",
    provider: "anthropic",
  },
  {
    capabilities: { reasoning: true, tools: true, vision: true },
    id: "openai/gpt-5",
    name: "GPT-5",
    provider: "openai",
    reasoningEffort: "low",
  },
  {
    capabilities: { reasoning: true, tools: true, vision: true },
    id: "openai/gpt-5-mini",
    name: "GPT-5 mini",
    provider: "openai",
    reasoningEffort: "low",
  },
  {
    capabilities: { reasoning: true, tools: true, vision: true },
    id: "google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "google",
  },
  {
    capabilities: { reasoning: false, tools: true, vision: true },
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
  },
];

const FALLBACK_DEFAULT_MODEL = "anthropic/claude-sonnet-4-5";
const FALLBACK_TITLE_MODEL = "anthropic/claude-haiku-4-5";

/** Modelo por defecto (configurable con `AI_DEFAULT_MODEL`). */
export const DEFAULT_CHAT_MODEL =
  process.env.AI_DEFAULT_MODEL &&
  chatModels.some((m) => m.id === process.env.AI_DEFAULT_MODEL)
    ? process.env.AI_DEFAULT_MODEL
    : FALLBACK_DEFAULT_MODEL;

/** Modelo barato/rápido para generar títulos (configurable con `AI_TITLE_MODEL`). */
export const TITLE_MODEL_ID =
  process.env.AI_TITLE_MODEL &&
  chatModels.some((m) => m.id === process.env.AI_TITLE_MODEL)
    ? process.env.AI_TITLE_MODEL
    : FALLBACK_TITLE_MODEL;

export function parseModelId(id: string): {
  provider: string;
  model: string;
} {
  const index = id.indexOf("/");
  if (index === -1) {
    return { model: id, provider: "" };
  }
  return { model: id.slice(index + 1), provider: id.slice(0, index) };
}

export function findModel(id: string): ChatModel | undefined {
  return chatModels.find((m) => m.id === id);
}

export function getCapabilities(
  models: ChatModel[] = chatModels
): Record<string, ModelCapabilities> {
  return Object.fromEntries(models.map((m) => [m.id, m.capabilities]));
}
