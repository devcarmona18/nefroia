import "server-only";

import { generateText, Output } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { getLanguageModel } from "@/lib/ai/providers";
import {
  finalizeSessionRecord,
  type SessionRecordDraft,
  sessionExtractionSchema,
} from "@/lib/clinical/session-record";
import { db } from "@/lib/db/client";
import { type SessionRecord, sessionRecord } from "@/lib/db/schema";
import { redactPii } from "@/lib/safety/redact";

export const SESSION_EXTRACTION_PROMPT = `Extract a hemodialysis session record from the nurse's notes.

Rules:
- Copy values ONLY from the notes. Never estimate, infer or complete a value. If a value is not written, return null (or an empty list).
- Convert units only when explicit: minutes to hours (240 min = 4), litres to millilitres (2.3 L = 2300).
- The patient must only be identified by initials or a pseudonym exactly as written. Never output a full name or an ID number.
- Text fields (machine, dialyzer, access, heparin, events, notes) keep the language of the notes.
- vitals: one entry per blood pressure / heart rate check, in chronological order; the first one is the pre-dialysis reading.`;

export const MAX_SESSION_NOTES_CHARS = 6000;

/** Notas libres → hoja verificada (sin guardar). */
export async function extractSessionRecord({
  notes,
  modelId,
}: {
  notes: string;
  modelId: string;
}): Promise<{
  draft: SessionRecordDraft;
  sourceNotes: string;
  redacted: number;
}> {
  // Defensa en profundidad: aunque el chat ya redacta, se repite aquí (la
  // página /hojas envía notas directamente).
  const { text: sourceNotes, total } = redactPii(
    notes.slice(0, MAX_SESSION_NOTES_CHARS)
  );
  const { output } = await generateText({
    instructions: SESSION_EXTRACTION_PROMPT,
    model: getLanguageModel(modelId),
    output: Output.object({ schema: sessionExtractionSchema }),
    prompt: sourceNotes,
    temperature: 0,
  });
  return {
    draft: finalizeSessionRecord(output, sourceNotes),
    redacted: total,
    sourceNotes,
  };
}

export async function saveSessionRecord({
  userId,
  chatId,
  draft,
  sourceNotes,
}: {
  userId: string;
  chatId?: string | null;
  draft: SessionRecordDraft;
  sourceNotes: string;
}): Promise<SessionRecord> {
  const [row] = await db
    .insert(sessionRecord)
    .values({
      alerts: draft.alerts,
      bunPostMgDl: draft.bunPostMgDl,
      bunPreMgDl: draft.bunPreMgDl,
      calculations: draft.calculations,
      chatId: chatId ?? null,
      dialyzer: draft.dialyzer,
      dryWeightKg: draft.dryWeightKg,
      durationHours: draft.durationHours,
      events: draft.events,
      fluidsAdministeredMl: draft.fluidsAdministeredMl,
      heparin: draft.heparin,
      machine: draft.machine,
      missingFields: draft.missingFields,
      notes: draft.notes,
      patientAlias: draft.patientAlias,
      postWeightKg: draft.postWeightKg,
      previousPostWeightKg: draft.previousPostWeightKg,
      preWeightKg: draft.preWeightKg,
      sessionDate: draft.sessionDate,
      sourceNotes,
      ufAchievedMl: draft.ufAchievedMl,
      ufGoalMl: draft.ufGoalMl,
      unverifiedFields: draft.unverifiedFields,
      userId,
      vascularAccess: draft.vascularAccess,
      vitals: draft.vitals,
    })
    .returning();
  return row;
}

export function listSessionRecords(userId: string, limit = 200) {
  return db
    .select()
    .from(sessionRecord)
    .where(eq(sessionRecord.userId, userId))
    .orderBy(desc(sessionRecord.createdAt))
    .limit(limit);
}

export async function getSessionRecord(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(sessionRecord)
    .where(and(eq(sessionRecord.id, id), eq(sessionRecord.userId, userId)));
  return row ?? null;
}

export async function deleteSessionRecord(userId: string, id: string) {
  const [row] = await db
    .delete(sessionRecord)
    .where(and(eq(sessionRecord.id, id), eq(sessionRecord.userId, userId)))
    .returning({ id: sessionRecord.id });
  return row ?? null;
}
