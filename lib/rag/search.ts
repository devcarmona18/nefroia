import { sql } from "drizzle-orm";
import { hasVectorColumn, queryRows, type RagDb } from "./db";
import type { Embedder } from "./embeddings/types";
import { reciprocalRankFusion } from "./rrf";
import { toOrTsQuery } from "./text";

/**
 * Recuperación híbrida sobre los protocolos de UN usuario:
 *   1. Vectorial: pgvector (`<=>`, índice HNSW) si existe la columna
 *      `embeddingVec`; si no, producto escalar sobre real[] calculado en SQL
 *      (exacto, sin índice; suficiente para cientos/miles de fragmentos).
 *   2. Léxica: tsvector en español + ts_rank_cd con consulta OR.
 *   3. Fusión por Reciprocal Rank Fusion (k = 60).
 *   4. Umbral de relevancia: un fragmento sin coincidencia léxica y con
 *      similitud por debajo del mínimo del modelo se descarta. Si no queda
 *      nada, el asistente debe responder "no lo sé" (grounded = false).
 *
 * El filtro por `userId` se aplica en TODAS las consultas: un usuario nunca
 * recupera fragmentos de documentos ajenos.
 */

export type SearchHit = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  page: number | null;
  heading: string | null;
  content: string;
  score: number;
  similarity: number | null;
  vectorRank: number | null;
  lexicalRank: number | null;
};

export type SearchResponse = {
  hits: SearchHit[];
  grounded: boolean;
  mode: "pgvector" | "array";
};

export type SearchOptions = {
  userId: string;
  query: string;
  embedder: Embedder;
  limit?: number;
  candidates?: number;
};

type VectorRow = { id: string; similarity: number | string };
type LexicalRow = { id: string; rank: number | string };
type ChunkRow = {
  id: string;
  documentId: string;
  title: string;
  page: number | null;
  heading: string | null;
  content: string;
};

/** Literal de vector aceptado tanto por real[] ('{…}') como por pgvector. */
function arrayLiteral(vector: number[]) {
  return `{${vector.map((value) => value.toFixed(7)).join(",")}}`;
}

function vectorCandidates(
  db: RagDb,
  {
    userId,
    embedderId,
    vector,
    limit,
    usePgvector,
  }: {
    userId: string;
    embedderId: string;
    vector: number[];
    limit: number;
    usePgvector: boolean;
  }
): Promise<VectorRow[]> {
  const literal = arrayLiteral(vector);
  if (usePgvector) {
    return queryRows<VectorRow>(
      db,
      sql`SELECT c.id,
          1 - (c."embeddingVec" <=> (${literal}::real[])::vector(384)) AS similarity
        FROM protocol_chunk c
        JOIN protocol_document d ON d.id = c."documentId"
        WHERE c."userId" = ${userId}
          AND d.status = 'ready'
          AND d."embeddingModel" = ${embedderId}
        ORDER BY c."embeddingVec" <=> (${literal}::real[])::vector(384)
        LIMIT ${limit}`
    );
  }
  // Vectores normalizados en L2: el producto escalar es el coseno.
  return queryRows<VectorRow>(
    db,
    sql`SELECT c.id, s.similarity
      FROM protocol_chunk c
      JOIN protocol_document d ON d.id = c."documentId"
      CROSS JOIN LATERAL (
        SELECT sum(a * b) AS similarity
        FROM unnest(c.embedding, ${literal}::real[]) AS t(a, b)
      ) s
      WHERE c."userId" = ${userId}
        AND d.status = 'ready'
        AND d."embeddingModel" = ${embedderId}
      ORDER BY s.similarity DESC NULLS LAST
      LIMIT ${limit}`
  );
}

function lexicalCandidates(
  db: RagDb,
  { userId, tsQuery, limit }: { userId: string; tsQuery: string; limit: number }
): Promise<LexicalRow[]> {
  return queryRows<LexicalRow>(
    db,
    sql`SELECT c.id, ts_rank_cd(c.tsv, q) AS rank
      FROM protocol_chunk c
      JOIN protocol_document d ON d.id = c."documentId",
      to_tsquery('spanish'::regconfig, ${tsQuery}) q
      WHERE c."userId" = ${userId}
        AND d.status = 'ready'
        AND c.tsv @@ q
      ORDER BY rank DESC
      LIMIT ${limit}`
  );
}

export async function hybridSearch(
  db: RagDb,
  { userId, query, embedder, limit = 5, candidates = 20 }: SearchOptions
): Promise<SearchResponse> {
  const usePgvector = await hasVectorColumn(db);
  const mode = usePgvector ? "pgvector" : "array";
  const trimmed = query.trim();
  if (!trimmed) {
    return { grounded: false, hits: [], mode };
  }

  const tsQuery = toOrTsQuery(trimmed);
  const vector = await embedder.embedQuery(trimmed);
  const [vectorRows, lexicalRows] = await Promise.all([
    vectorCandidates(db, {
      embedderId: embedder.id,
      limit: candidates,
      usePgvector,
      userId,
      vector,
    }),
    tsQuery
      ? lexicalCandidates(db, { limit: candidates, tsQuery, userId })
      : Promise.resolve([]),
  ]);

  const similarityById = new Map(
    vectorRows.map((row) => [row.id, Number(row.similarity)])
  );
  const lexicalIds = new Set(lexicalRows.map((row) => row.id));

  // Solo entran a la fusión los candidatos vectoriales relevantes.
  const relevantVector = vectorRows
    .filter((row) => Number(row.similarity) >= embedder.minRelevantSimilarity)
    .map((row) => row.id);
  const fused = reciprocalRankFusion([
    relevantVector,
    lexicalRows.map((row) => row.id),
  ]).slice(0, limit);

  if (fused.length === 0) {
    return { grounded: false, hits: [], mode };
  }

  const ids = fused.map((item) => item.id);
  const rows = await queryRows<ChunkRow>(
    db,
    sql`SELECT c.id, c."documentId", d.title, c.page, c.heading, c.content
      FROM protocol_chunk c
      JOIN protocol_document d ON d.id = c."documentId"
      WHERE c."userId" = ${userId}
        AND c.id IN (${sql.join(
          ids.map((id) => sql`${id}::uuid`),
          sql`, `
        )})`
  );
  const rowById = new Map(rows.map((row) => [row.id, row]));

  const hits: SearchHit[] = [];
  for (const item of fused) {
    const row = rowById.get(item.id);
    if (!row) {
      continue;
    }
    hits.push({
      chunkId: row.id,
      content: row.content,
      documentId: row.documentId,
      documentTitle: row.title,
      heading: row.heading,
      lexicalRank: lexicalIds.has(row.id) ? item.ranks[1] : null,
      page: row.page,
      score: item.score,
      similarity: similarityById.get(row.id) ?? null,
      vectorRank: item.ranks[0],
    });
  }
  return { grounded: hits.length > 0, hits, mode };
}
