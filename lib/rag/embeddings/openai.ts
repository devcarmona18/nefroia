import { createOpenAI } from "@ai-sdk/openai";
import { embedMany } from "ai";
import { EMBEDDING_DIMENSIONS } from "../constants";
import { type Embedder, l2Normalize } from "./types";

/**
 * Embeddings de OpenAI (`text-embedding-3-small`) reducidos a 384 dimensiones
 * con el parámetro `dimensions` (truncado Matryoshka que ofrece la API), para
 * compartir esquema e índice con el modelo local. Opcional: solo si hay
 * OPENAI_API_KEY y EMBEDDING_PROVIDER=openai. Implica enviar el texto de los
 * protocolos a OpenAI (no deben contener datos de pacientes).
 */
const MODEL = "text-embedding-3-small";

export function createOpenAIEmbedder(apiKey: string): Embedder {
  const model = createOpenAI({ apiKey }).embedding(MODEL);
  const embed = async (values: string[]) => {
    const { embeddings } = await embedMany({
      maxParallelCalls: 2,
      model,
      providerOptions: { openai: { dimensions: EMBEDDING_DIMENSIONS } },
      values,
    });
    return embeddings.map(l2Normalize);
  };
  return {
    dimensions: EMBEDDING_DIMENSIONS,
    embedPassages: embed,
    embedQuery: async (text) => (await embed([text]))[0],
    id: `openai/${MODEL}@${EMBEDDING_DIMENSIONS}`,
    maxInputTokens: 8000,
    minRelevantSimilarity: 0.3,
  };
}
