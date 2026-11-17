"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { resolveModelId } from "@/lib/ai/providers";
import {
  deleteSessionRecord,
  extractSessionRecord,
  MAX_SESSION_NOTES_CHARS,
  saveSessionRecord,
} from "@/lib/session-records/service";

export type CreateRecordState =
  | { status: "idle" }
  | { status: "error" }
  | { status: "created"; id: string; redacted: number };

const notesSchema = z.string().trim().min(10).max(MAX_SESSION_NOTES_CHARS);

export async function createSessionRecordAction(
  _previous: CreateRecordState,
  formData: FormData
): Promise<CreateRecordState> {
  const session = await auth();
  const parsed = notesSchema.safeParse(formData.get("notes"));
  if (!(session?.user?.id && parsed.success)) {
    return { status: "error" };
  }
  try {
    const { draft, sourceNotes, redacted } = await extractSessionRecord({
      modelId: resolveModelId(undefined),
      notes: parsed.data,
    });
    const saved = await saveSessionRecord({
      draft,
      sourceNotes,
      userId: session.user.id,
    });
    revalidatePath("/hojas");
    return { id: saved.id, redacted, status: "created" };
  } catch (error) {
    console.error("No se pudo crear la hoja de sesión:", error);
    return { status: "error" };
  }
}

export async function deleteSessionRecordAction(id: string) {
  const session = await auth();
  if (!(session?.user?.id && z.uuid().safeParse(id).success)) {
    return { ok: false };
  }
  const deleted = await deleteSessionRecord(session.user.id, id);
  revalidatePath("/hojas");
  return { ok: Boolean(deleted) };
}
