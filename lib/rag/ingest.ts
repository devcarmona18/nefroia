import { and, eq } from "drizzle-orm";
import { protocolChunk, protocolDocument } from "@/lib/db/schema";
import { type Chunk, chunkPages, DEFAULT_CHUNK_OPTIONS } from "./chunk";
import { cleanPages } from "./clean";
import type { RagDb } from "./db";
import type { Embedder } from "./embeddings/types";
import { extractDocument, type ProtocolKind } from "./extract";
import { normalizeForSearch } from "./text";

/**
 * Canal de ingesta: extracción → limpieza → troceado → embeddings → Postgres.
 * Idempotente por documento: reemplaza los fragmentos previos en una única
 * transacción, así que una búsqueda nunca ve un documento a medio indexar.
 */

export type IngestErrorCode =
  | "extraction_failed"
  | "empty_text"
  | "embedding_failed"
  | "storage_failed";

export class IngestError extends Error {
  readonly code: IngestErrorCode;
  constructor(code: IngestErrorCode, options?: { cause?: unknown }) {
    super(code, options);
    this.code = code;
  }
}

/** Texto que se vectoriza: título y sección dan contexto al fragmento. */
export function passageText(title: string, chunk: Chunk): string {
  const context = [title, chunk.heading].filter(Boolean).join(" — ");
  return `${context}\n${chunk.content}`;
}

/** Prepara los fragmentos de un documento (sin E/S de base de datos). */
export async function prepareChunks({
  bytes,
  kind,
  embedder,
}: {
  bytes: Uint8Array;
  kind: ProtocolKind;
  embedder: Embedder;
}): Promise<{ chunks: Chunk[]; pageCount: number | null }> {
  let extracted: Awaited<ReturnType<typeof extractDocument>>;
  try {
    extracted = await extractDocument(bytes, kind);
  } catch (error) {
    throw new IngestError("extraction_failed", { cause: error });
  }
  const pages = cleanPages(extracted.pages);
  // El fragmento debe caber en la ventana del modelo de embeddings (e5: 512).
  const maxTokens = Math.min(
    DEFAULT_CHUNK_OPTIONS.maxTokens,
    embedder.maxInputTokens - 40
  );
  const chunks = chunkPages(pages, {
    maxTokens,
    overlapTokens: Math.min(DEFAULT_CHUNK_OPTIONS.overlapTokens, maxTokens / 5),
  });
  if (chunks.length === 0) {
    // Típico de un PDF escaneado sin capa de texto (no hay OCR).
    throw new IngestError("empty_text");
  }
  return { chunks, pageCount: extracted.pageCount };
}

const INSERT_BATCH = 100;

export async function ingestDocument(
  db: RagDb,
  {
    documentId,
    userId,
    title,
    bytes,
    kind,
    embedder,
  }: {
    documentId: string;
    userId: string;
    title: string;
    bytes: Uint8Array;
    kind: ProtocolKind;
    embedder: Embedder;
  }
): Promise<{ chunkCount: number; pageCount: number | null }> {
  try {
    const { chunks, pageCount } = await prepareChunks({
      bytes,
      embedder,
      kind,
    });

    let embeddings: number[][];
    try {
      embeddings = await embedder.embedPassages(
        chunks.map((chunk) => passageText(title, chunk))
      );
    } catch (error) {
      throw new IngestError("embedding_failed", { cause: error });
    }

    const rows = chunks.map((chunk, index) => ({
      content: chunk.content,
      documentId,
      embedding: embeddings[index],
      heading: chunk.heading,
      ordinal: chunk.ordinal,
      page: chunk.page,
      searchText: normalizeForSearch(
        [title, chunk.heading, chunk.content].filter(Boolean).join("\n")
      ),
      tokenCount: chunk.tokenCount,
      userId,
    }));

    await db.transaction(async (tx) => {
      await tx
        .delete(protocolChunk)
        .where(eq(protocolChunk.documentId, documentId));
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        // biome-ignore lint/performance/noAwaitInLoops: lotes dentro de la misma transacción
        await tx.insert(protocolChunk).values(rows.slice(i, i + INSERT_BATCH));
      }
      await tx
        .update(protocolDocument)
        .set({
          chunkCount: rows.length,
          embeddingModel: embedder.id,
          error: null,
          pages: pageCount,
          status: "ready",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(protocolDocument.id, documentId),
            eq(protocolDocument.userId, userId)
          )
        );
    });
    return { chunkCount: rows.length, pageCount };
  } catch (error) {
    const code =
      error instanceof IngestError ? error.code : ("storage_failed" as const);
    await db
      .update(protocolDocument)
      .set({ error: code, status: "failed", updatedAt: new Date() })
      .where(eq(protocolDocument.id, documentId));
    throw error instanceof IngestError
      ? error
      : new IngestError("storage_failed", { cause: error });
  }
}
