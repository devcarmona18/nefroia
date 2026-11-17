import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { eq, sql } from "drizzle-orm";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { protocolChunk, protocolDocument, user } from "@/lib/db/schema";
import type { RagDb } from "@/lib/rag/db";
import { createHashEmbedder } from "@/lib/rag/embeddings/hash";
import { IngestError, ingestDocument } from "@/lib/rag/ingest";
import { hybridSearch } from "@/lib/rag/search";
import { createDocx } from "../support/docx";

/**
 * Ingesta + recuperación de extremo a extremo contra PostgreSQL real, con las
 * migraciones del repositorio:
 *  - PGlite (PostgreSQL 17 en WASM) con pgvector: ruta "pgvector" + HNSW.
 *  - Un PostgreSQL de verdad si se define INTEGRATION_POSTGRES_URL (en este
 *    entorno, un clúster local sin pgvector): ruta "array" (real[]).
 */

const MIGRATIONS = path.join(import.meta.dirname, "../../lib/db/migrations");
const DEMO = path.join(import.meta.dirname, "../../docs/protocolos-demo");
const embedder = createHashEmbedder();

type Mode = "pgvector" | "array";
type Backend = {
  name: string;
  setup: () => Promise<{ db: RagDb; close: () => Promise<void>; mode: Mode }>;
};

const backends: Backend[] = [
  {
    name: "PGlite + pgvector",
    setup: async () => {
      const client = await PGlite.create({ extensions: { vector } });
      const db = drizzlePglite(client);
      await migratePglite(db, { migrationsFolder: MIGRATIONS });
      return {
        close: () => client.close(),
        db: db as unknown as RagDb,
        mode: "pgvector",
      };
    },
  },
];

const postgresUrl = process.env.INTEGRATION_POSTGRES_URL;
if (postgresUrl) {
  backends.push({
    name: "PostgreSQL (INTEGRATION_POSTGRES_URL)",
    setup: async () => {
      const client = postgres(postgresUrl, { max: 1, onnotice: () => null });
      // Base de datos de pruebas desechable: se recrea desde cero.
      await client.unsafe(
        "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;"
      );
      const db = drizzlePostgres(client);
      await migratePostgres(db, { migrationsFolder: MIGRATIONS });
      // La migración 0003 activa pgvector solo si el servidor lo ofrece.
      const [{ available }] = await client<{ available: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM pg_available_extensions WHERE name = 'vector'
        ) AS available`;
      return {
        close: () => client.end(),
        db: db as unknown as RagDb,
        mode: available ? "pgvector" : "array",
      };
    },
  });
}

async function createUser(db: RagDb, email: string) {
  const [row] = await db
    .insert(user)
    .values({ email })
    .returning({ id: user.id });
  return row.id;
}

async function addDocument(
  db: RagDb,
  {
    userId,
    title,
    bytes,
    kind,
  }: {
    userId: string;
    title: string;
    bytes: Uint8Array;
    kind: "markdown" | "docx" | "text";
  }
) {
  const [doc] = await db
    .insert(protocolDocument)
    .values({
      contentType: "text/markdown",
      filename: `${title}.md`,
      sizeBytes: bytes.length,
      title,
      userId,
    })
    .returning({ id: protocolDocument.id });
  await ingestDocument(db, {
    bytes,
    documentId: doc.id,
    embedder,
    kind,
    title,
    userId,
  });
  return doc.id;
}

describe.each(backends)("RAG de protocolos sobre $name", (backend) => {
  let db: RagDb;
  let close: () => Promise<void>;
  let expectedMode: Mode;
  let nurseA: string;
  let nurseB: string;
  const docs: Record<string, string> = {};

  beforeAll(async () => {
    ({ db, close, mode: expectedMode } = await backend.setup());
    nurseA = await createUser(db, "a@nefroia.test");
    nurseB = await createUser(db, "b@nefroia.test");
    for (const [key, file, title] of [
      ["hipo", "hipotension-intradialisis.md", "Hipotensión intradiálisis"],
      ["acceso", "cuidado-acceso-vascular.md", "Cuidado del acceso vascular"],
      ["muestras", "toma-muestras-pre-post.md", "Toma de muestras pre/post"],
    ] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: orden de inserción determinista
      docs[key] = await addDocument(db, {
        bytes: readFileSync(path.join(DEMO, file)),
        kind: "markdown",
        title,
        userId: nurseA,
      });
    }
    docs.docx = await addDocument(db, {
      bytes: createDocx([
        "# Cambio de turno",
        "La entrega de turno se realiza a pie de máquina con la hoja de sesión.",
      ]),
      kind: "docx",
      title: "Entrega de turno",
      userId: nurseA,
    });
    docs.otherUser = await addDocument(db, {
      bytes: new TextEncoder().encode(
        "Protocolo privado de otra unidad sobre hipotensión intradiálisis y suero."
      ),
      kind: "text",
      title: "Documento ajeno",
      userId: nurseB,
    });
  }, 120_000);

  afterAll(async () => {
    await close?.();
  });

  it("indexa con la ruta vectorial esperada", async () => {
    const result = await hybridSearch(db, {
      embedder,
      query: "hipotensión",
      userId: nurseA,
    });
    expect(result.mode).toBe(expectedMode);
  });

  it("guarda fragmentos con metadatos de sección y estado ready", async () => {
    const [doc] = await db
      .select()
      .from(protocolDocument)
      .where(eq(protocolDocument.id, docs.hipo));
    expect(doc.status).toBe("ready");
    expect(doc.embeddingModel).toBe(embedder.id);
    expect(doc.chunkCount).toBeGreaterThanOrEqual(3);
    const chunks = await db
      .select({
        embedding: protocolChunk.embedding,
        heading: protocolChunk.heading,
      })
      .from(protocolChunk)
      .where(eq(protocolChunk.documentId, docs.hipo));
    expect(chunks).toHaveLength(doc.chunkCount);
    expect(chunks[0].embedding).toHaveLength(384);
    expect(chunks.some((c) => c.heading?.includes("Actuación"))).toBe(true);
  });

  it("recupera el protocolo pertinente con su sección", async () => {
    const result = await hybridSearch(db, {
      embedder,
      query: "¿Qué hago si el paciente presenta hipotensión durante la sesión?",
      userId: nurseA,
    });
    expect(result.grounded).toBe(true);
    expect(result.hits[0].documentId).toBe(docs.hipo);
    expect(result.hits[0].heading).toBeTruthy();
    expect(result.hits.length).toBeLessThanOrEqual(5);
  });

  it("encuentra la técnica de flujo lento aunque se escriba sin tildes", async () => {
    const result = await hybridSearch(db, {
      embedder,
      query: "muestra posdialisis flujo lento recirculacion",
      userId: nurseA,
    });
    expect(result.hits[0].documentId).toBe(docs.muestras);
    expect(result.hits[0].lexicalRank).toBe(1);
    expect(result.hits[0].content).toContain("100 mL/min");
  });

  it("indexa documentos Word", async () => {
    const result = await hybridSearch(db, {
      embedder,
      query: "entrega de turno",
      userId: nurseA,
    });
    expect(result.hits[0].documentId).toBe(docs.docx);
    expect(result.hits[0].heading).toBe("Cambio de turno");
    expect(result.hits[0].page).toBeNull();
  });

  it("nunca devuelve fragmentos de otro usuario", async () => {
    const forA = await hybridSearch(db, {
      embedder,
      limit: 20,
      query: "protocolo privado de otra unidad hipotensión suero",
      userId: nurseA,
    });
    expect(forA.hits.map((h) => h.documentId)).not.toContain(docs.otherUser);
    const forB = await hybridSearch(db, {
      embedder,
      limit: 20,
      query: "hipotensión",
      userId: nurseB,
    });
    expect(new Set(forB.hits.map((h) => h.documentId))).toEqual(
      new Set([docs.otherUser])
    );
  });

  it("no inventa contexto: una consulta ajena queda sin fundamento", async () => {
    const result = await hybridSearch(db, {
      embedder,
      query: "receta de paella valenciana",
      userId: nurseA,
    });
    expect(result).toMatchObject({ grounded: false, hits: [] });
  });

  it("reindexar es idempotente", async () => {
    const before = await db.execute(
      sql`SELECT count(*)::int AS n FROM protocol_chunk WHERE "documentId" = ${docs.acceso}`
    );
    await ingestDocument(db, {
      bytes: readFileSync(path.join(DEMO, "cuidado-acceso-vascular.md")),
      documentId: docs.acceso,
      embedder,
      kind: "markdown",
      title: "Cuidado del acceso vascular",
      userId: nurseA,
    });
    const after = await db.execute(
      sql`SELECT count(*)::int AS n FROM protocol_chunk WHERE "documentId" = ${docs.acceso}`
    );
    expect(after).toEqual(before);
  });

  it("marca como fallido un documento sin texto", async () => {
    const [doc] = await db
      .insert(protocolDocument)
      .values({
        contentType: "text/plain",
        filename: "vacio.txt",
        title: "Vacío",
        userId: nurseA,
      })
      .returning({ id: protocolDocument.id });
    await expect(
      ingestDocument(db, {
        bytes: new TextEncoder().encode("   \n  "),
        documentId: doc.id,
        embedder,
        kind: "text",
        title: "Vacío",
        userId: nurseA,
      })
    ).rejects.toBeInstanceOf(IngestError);
    const [row] = await db
      .select()
      .from(protocolDocument)
      .where(eq(protocolDocument.id, doc.id));
    expect(row).toMatchObject({ error: "empty_text", status: "failed" });
  });
});
