import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { customProvider } from "ai";
import { isTestEnvironment } from "../constants";
import {
  type ChatModel,
  chatModels,
  DEFAULT_CHAT_MODEL,
  findModel,
  type ModelProvider,
  parseModelId,
  TITLE_MODEL_ID,
} from "./models";

/**
 * Proveedores de IA directos (sin gateway).
 * - Anthropic es el proveedor por defecto y siempre se lista.
 * - OpenAI y Google solo se habilitan si su API key está configurada.
 */
export function isProviderEnabled(provider: ModelProvider): boolean {
  if (isTestEnvironment) {
    return true;
  }
  switch (provider) {
    case "anthropic":
      return true;
    case "openai":
      return Boolean(process.env.OPENAI_API_KEY);
    case "google":
      return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
    default:
      return false;
  }
}

export function getEnabledModels(): ChatModel[] {
  return chatModels.filter((m) => isProviderEnabled(m.provider));
}

export function isModelAllowed(modelId: string): boolean {
  return getEnabledModels().some((m) => m.id === modelId);
}

/** Devuelve el id solicitado si está habilitado; si no, un modelo válido. */
export function resolveModelId(requested: string | undefined): string {
  if (requested && isModelAllowed(requested)) {
    return requested;
  }
  if (isModelAllowed(DEFAULT_CHAT_MODEL)) {
    return DEFAULT_CHAT_MODEL;
  }
  return getEnabledModels()[0]?.id ?? DEFAULT_CHAT_MODEL;
}

export const myProvider = isTestEnvironment
  ? (() => {
      const {
        chatModel,
        titleModel: mockTitleModel,
      } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "title-model": mockTitleModel,
        },
      });
    })()
  : null;

export function getLanguageModel(modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("chat-model");
  }

  const { provider, model } = parseModelId(modelId);

  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(model);
    case "openai":
      return createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(model);
    case "google":
      return createGoogleGenerativeAI({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      })(model);
    default:
      throw new Error(`Proveedor de IA no soportado: ${provider}`);
  }
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  const id = findModel(TITLE_MODEL_ID) ? TITLE_MODEL_ID : DEFAULT_CHAT_MODEL;
  return getLanguageModel(id);
}
