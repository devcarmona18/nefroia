import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  type ProtocolDocument,
  protocolChunk,
  protocolDocument,
} from "@/lib/db/schema";
import type { RagDb } from "@/lib/rag/db";
import { getEmbedder } from "@/lib/rag/embeddings";
import type { ProtocolKind } from "@/lib/rag/extract";
import { IngestError, ingestDocument } from "@/lib/rag/ingest";
import { hybridSearch, type SearchResponse } from "@/lib/rag/search";
import { deleteObject, isStorageConfigured, putObject } from "@/lib/storage/s3";

/**
 * Casos de uso de los protocolos para la app (rutas, herramientas, páginas).
 * Toda función recibe el `userId` de la sesión y filtra por él.
 */

const ragDb = db as unknown as RagDb;

export function protocolKey(userId: string, documentId: string, ext: string) {
  return `protocols/${userId}/${documentId}.${ext}`;
}

export function listProtocols(userId: string): Promise<ProtocolDocument[]> {
  return db
    .select()
    .from(protocolDocument)
    .where(eq(protocolDocument.userId, userId))
    .orderBy(desc(protocolDocument.createdAt));
}

export async function createProtocol({
  userId,
  title,
  filename,
  contentType,
  extension,
  bytes,
  isDemo = false,
}: {
  userId: string;
  title: string;
  filename: string;
  contentType: string;
  extension: string;
  bytes: Uint8Array;
  isDemo?: boolean;
}): Promise<ProtocolDocument> {
  const [doc] = await db
    .insert(protocolDocument)
    .values({
      contentType,
      filename,
      isDemo,
      sizeBytes: bytes.length,
      status: "processing",
      title,
      userId,
    })
    .returning();

  // El original se guarda en el bucket privado si hay S3; si no, solo se
  // indexa el texto (la cita apunta al fragmento, no al archivo).
  if (isStorageConfigured()) {
    const key = protocolKey(userId, doc.id, extension);
    try {
      await putObject({ body: bytes, contentType, key });
      await db
        .update(protocolDocument)
        .set({ fileKey: key })
        .where(eq(protocolDocument.id, doc.id));
      doc.fileKey = key;
    } catch (error) {
      console.error("No se pudo guardar el protocolo original en S3:", error);
    }
  }
  return doc;
}

/** Indexa un documento ya creado (se llama tras responder, con `after`). */
export async function ingestProtocol({
  doc,
  bytes,
  kind,
}: {
  doc: ProtocolDocument;
  bytes: Uint8Array;
  kind: ProtocolKind;
}) {
  try {
    await ingestDocument(ragDb, {
      bytes,
      documentId: doc.id,
      embedder: getEmbedder(),
      kind,
      title: doc.title,
      userId: doc.userId,
    });
  } catch (error) {
    const code = error instanceof IngestError ? error.code : "storage_failed";
    console.error(`Ingesta de protocolo fallida (${code}):`, error);
    if (!(error instanceof IngestError)) {
      await db
        .update(protocolDocument)
        .set({ error: code, status: "failed", updatedAt: new Date() })
        .where(eq(protocolDocument.id, doc.id));
    }
  }
}

export async function deleteProtocol(userId: string, documentId: string) {
  const [deleted] = await db
    .delete(protocolDocument)
    .where(
      and(
        eq(protocolDocument.id, documentId),
        eq(protocolDocument.userId, userId)
      )
    )
    .returning();
  if (deleted?.fileKey && isStorageConfigured()) {
    await deleteObject(deleted.fileKey).catch((error) => {
      console.error("No se pudo borrar el original del protocolo:", error);
    });
  }
  return deleted ?? null;
}

export async function getProtocolChunk(userId: string, chunkId: string) {
  const [row] = await db
    .select({
      content: protocolChunk.content,
      documentId: protocolChunk.documentId,
      documentTitle: protocolDocument.title,
      heading: protocolChunk.heading,
      id: protocolChunk.id,
      isDemo: protocolDocument.isDemo,
      ordinal: protocolChunk.ordinal,
      page: protocolChunk.page,
    })
    .from(protocolChunk)
    .innerJoin(
      protocolDocument,
      eq(protocolDocument.id, protocolChunk.documentId)
    )
    .where(
      and(eq(protocolChunk.id, chunkId), eq(protocolChunk.userId, userId))
    );
  return row ?? null;
}

export function searchProtocols(
  userId: string,
  query: string,
  limit = 5
): Promise<SearchResponse> {
  return hybridSearch(ragDb, {
    embedder: getEmbedder(),
    limit,
    query,
    userId,
  });
}
