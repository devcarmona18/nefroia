/**
 * Interfaz de proveedor de embeddings. Todas las implementaciones devuelven
 * vectores de `EMBEDDING_DIMENSIONS` (384) normalizados en L2, de modo que el
 * producto escalar es la similitud coseno y el esquema de la base de datos no
 * cambia al cambiar de proveedor. Los documentos guardan `id` del modelo y la
 * búsqueda solo compara vectores del mismo modelo.
 */
export interface Embedder {
  readonly dimensions: number;
  embedPassages: (texts: string[]) => Promise<number[][]>;
  embedQuery: (text: string) => Promise<number[]>;
  /** Identificador estable del modelo, p. ej. "local/multilingual-e5-small". */
  readonly id: string;
  /** Longitud máxima de entrada del modelo (para dimensionar fragmentos). */
  readonly maxInputTokens: number;
  /**
   * Similitud coseno mínima para considerar un fragmento relevante cuando no
   * hay coincidencia léxica. Depende del modelo: e5 concentra las similitudes
   * en 0,7–0,9; OpenAI y el hash, mucho más abajo.
   */
  readonly minRelevantSimilarity: number;
}

export function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm === 0 ? vector : vector.map((value) => value / norm);
}

export function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    sum += a[i] * b[i];
  }
  return sum;
}
