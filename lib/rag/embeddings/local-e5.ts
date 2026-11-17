import { EMBEDDING_DIMENSIONS } from "../constants";
import { type Embedder, l2Normalize } from "./types";

/**
 * Embeddings locales con `@huggingface/transformers` (ONNX Runtime en Node):
 * `Xenova/multilingual-e5-small`, 384 dimensiones, multilingüe (es/en).
 *
 * - Sin coste por llamada y sin enviar los protocolos a terceros.
 * - e5 exige prefijos: "query: " para la pregunta y "passage: " para el texto
 *   indexado; sin ellos la calidad cae de forma notable.
 * - Entrada máxima de 512 tokens: los fragmentos se dimensionan por debajo.
 * - El modelo (~120 MB cuantizado) se descarga de huggingface.co la primera
 *   vez y se cachea en `EMBEDDING_CACHE_DIR` (o en la caché por defecto).
 */

const MODEL_ID = "Xenova/multilingual-e5-small";
const BATCH_SIZE = 16;

type FeatureExtractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: boolean }
) => Promise<{ tolist: () => number[][] }>;

let extractorPromise: Promise<FeatureExtractor> | null = null;

async function loadExtractor(): Promise<FeatureExtractor> {
  const transformers = await import("@huggingface/transformers");
  if (process.env.EMBEDDING_CACHE_DIR) {
    transformers.env.cacheDir = process.env.EMBEDDING_CACHE_DIR;
  }
  const extractor = await transformers.pipeline(
    "feature-extraction",
    MODEL_ID,
    {
      dtype: "q8",
    }
  );
  return extractor as unknown as FeatureExtractor;
}

function getExtractor() {
  extractorPromise ??= loadExtractor().catch((error) => {
    // Permite reintentar si la descarga falló (red caída, proxy...).
    extractorPromise = null;
    throw error;
  });
  return extractorPromise;
}

async function embed(texts: string[]): Promise<number[][]> {
  const extractor = await getExtractor();
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    // Lotes secuenciales a propósito: acotan la memoria de ONNX Runtime.
    // biome-ignore lint/performance/noAwaitInLoops: procesamiento por lotes
    const output = await extractor(texts.slice(i, i + BATCH_SIZE), {
      normalize: true,
      pooling: "mean",
    });
    vectors.push(...output.tolist().map(l2Normalize));
  }
  return vectors;
}

export function createLocalE5Embedder(): Embedder {
  return {
    dimensions: EMBEDDING_DIMENSIONS,
    embedPassages: (texts) => embed(texts.map((text) => `passage: ${text}`)),
    embedQuery: async (text) => (await embed([`query: ${text}`]))[0],
    id: "local/multilingual-e5-small",
    // 512 del modelo menos margen para el prefijo y tokens especiales.
    maxInputTokens: 480,
    minRelevantSimilarity: 0.8,
  };
}
