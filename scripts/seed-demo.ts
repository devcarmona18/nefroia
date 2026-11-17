/**
 * Datos de demostración: usuario demo, los tres protocolos ORIGINALES de
 * docs/protocolos-demo (marcados "Documento de demostración, no usar
 * clínicamente") y dos hojas de sesión ficticias.
 *
 *   pnpm db:seed
 *
 * Idempotente: borra y recrea los datos del usuario demo. Usa el proveedor de
 * embeddings configurado (EMBEDDING_PROVIDER); sin acceso a huggingface.co,
 * define EMBEDDING_PROVIDER=hash.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  finalizeSessionRecord,
  type SessionExtraction,
} from "../lib/clinical/session-record";
import { protocolDocument, sessionRecord, user } from "../lib/db/schema";
import { generateHashedPassword } from "../lib/db/utils";
import type { RagDb } from "../lib/rag/db";
import { getEmbedder } from "../lib/rag/embeddings";
import { ingestDocument } from "../lib/rag/ingest";

config({ path: ".env.local" });
config();

export const DEMO_EMAIL = process.env.DEMO_USER_EMAIL ?? "demo@nefroia.app";
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD ?? "NefroIA-demo-2026";

const DEMO_PROTOCOLS = [
  [
    "hipotension-intradialisis.md",
    "Protocolo de hipotensión intradiálisis (DEMO)",
  ],
  ["cuidado-acceso-vascular.md", "Cuidado del acceso vascular (DEMO)"],
  ["toma-muestras-pre-post.md", "Toma de muestras pre/posdiálisis (DEMO)"],
] as const;

const DEMO_SESSIONS: { notes: string; extraction: SessionExtraction }[] = [
  {
    extraction: {
      bunPostMgDl: 21,
      bunPreMgDl: 70,
      dialyzer: "FX80",
      dryWeightKg: 70,
      durationHours: 4,
      events: [
        {
          description:
            "Mareo y bostezos; Trendelenburg, UF en pausa y SSN 200 mL",
          time: "10:40",
        },
      ],
      fluidsAdministeredMl: 200,
      heparin: "5000 UI en bolo inicial",
      machine: "7",
      notes: null,
      patientAlias: "J.P.",
      postWeightKg: 70.4,
      previousPostWeightKg: 70.1,
      preWeightKg: 72.5,
      sessionDate: "2026-11-16",
      ufAchievedMl: 2300,
      ufGoalMl: 2500,
      vascularAccess: "FAV radiocefálica izquierda",
      vitals: [
        { diastolic: 80, heartRate: 76, systolic: 140, time: "pre" },
        { diastolic: 60, heartRate: 88, systolic: 98, time: "10:40" },
        { diastolic: 70, heartRate: 80, systolic: 120, time: "post" },
      ],
    },
    notes:
      "Paciente J.P. (DEMO), 16/11/2026, máquina 7, dializador FX80, FAV radiocefálica izquierda. Peso pre 72,5 kg, post anterior 70,1 kg, seco 70 kg. Sesión 4 h. UF programada 2500 mL, conseguida 2300 mL. Heparina 5000 UI bolo inicial. PA pre 140/80 FC 76. 10:40 mareo y bostezos, PA 98/60 FC 88: Trendelenburg, UF en pausa y SSN 200 mL. PA post 120/70 FC 80. Peso post 70,4 kg. BUN pre 70, post 21.",
  },
  {
    extraction: {
      bunPostMgDl: null,
      bunPreMgDl: null,
      dialyzer: null,
      dryWeightKg: 58,
      durationHours: 3.5,
      events: [],
      fluidsAdministeredMl: null,
      heparin: null,
      machine: "3",
      notes: "Catéter yugular derecho sin signos de infección",
      patientAlias: "M.R.",
      postWeightKg: 59.1,
      previousPostWeightKg: 59.5,
      preWeightKg: 62.4,
      sessionDate: "2026-11-16",
      ufAchievedMl: 3200,
      ufGoalMl: 3300,
      vascularAccess: "Catéter yugular derecho",
      vitals: [
        { diastolic: 90, heartRate: 82, systolic: 150, time: "pre" },
        { diastolic: 78, heartRate: 90, systolic: 128, time: "post" },
      ],
    },
    notes:
      "M.R. (DEMO) máquina 3, catéter yugular derecho sin signos de infección. Peso pre 62,4, post anterior 59,5, seco 58. 3,5 h. UF objetivo 3300 mL, conseguida 3200 mL. PA pre 150/90 FC 82, post 128/78 FC 90. Peso post 59,1.",
  },
];

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    throw new Error("POSTGRES_URL no está definida.");
  }
  const client = postgres(url, { max: 1, onnotice: () => null });
  const db = drizzle(client);
  const embedder = getEmbedder();
  console.log(`Embeddings: ${embedder.id}`);

  // Usuario demo (se recrea: sus chats, protocolos y hojas se borran en cascada
  // salvo los chats, que se eliminan antes por sus claves foráneas).
  const [existing] = await db
    .select()
    .from(user)
    .where(eq(user.email, DEMO_EMAIL));
  let userId: string;
  if (existing) {
    userId = existing.id;
    await db
      .delete(protocolDocument)
      .where(eq(protocolDocument.userId, userId));
    await db.delete(sessionRecord).where(eq(sessionRecord.userId, userId));
    await db
      .update(user)
      .set({ password: generateHashedPassword(DEMO_PASSWORD) })
      .where(eq(user.id, userId));
  } else {
    const [created] = await db
      .insert(user)
      .values({
        email: DEMO_EMAIL,
        password: generateHashedPassword(DEMO_PASSWORD),
      })
      .returning({ id: user.id });
    userId = created.id;
  }

  // Ingesta secuencial a propósito: acota la memoria del modelo de embeddings.
  for (const [file, title] of DEMO_PROTOCOLS) {
    const bytes = readFileSync(path.join("docs/protocolos-demo", file));
    // biome-ignore lint/performance/noAwaitInLoops: ingesta secuencial
    const [doc] = await db
      .insert(protocolDocument)
      .values({
        contentType: "text/markdown; charset=utf-8",
        filename: file,
        isDemo: true,
        sizeBytes: bytes.length,
        title,
        userId,
      })
      .returning({ id: protocolDocument.id });
    const { chunkCount } = await ingestDocument(db as unknown as RagDb, {
      bytes,
      documentId: doc.id,
      embedder,
      kind: "markdown",
      title,
      userId,
    });
    console.log(`  ✓ ${title}: ${chunkCount} fragmentos`);
  }

  await db.insert(sessionRecord).values(
    DEMO_SESSIONS.map(({ notes, extraction }) => ({
      ...finalizeSessionRecord(extraction, notes),
      sourceNotes: notes,
      userId,
    }))
  );
  console.log(`  ✓ ${DEMO_SESSIONS.length} hojas de sesión`);
  console.log(`\nUsuario demo: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  await client.end();
}

main().catch((error) => {
  console.error("Seed fallido:", error);
  process.exit(1);
});
