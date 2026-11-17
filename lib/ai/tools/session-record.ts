import { tool } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import type { SessionAlert } from "@/lib/clinical/session-record";
import type { CalculationResult } from "@/lib/clinical/types";
import {
  extractSessionRecord,
  MAX_SESSION_NOTES_CHARS,
  saveSessionRecord,
} from "@/lib/session-records/service";

export type SessionRecordToolOutput =
  | {
      ok: true;
      recordId: string;
      patientAlias: string | null;
      missingFields: string[];
      unverifiedFields: string[];
      calculations: CalculationResult[];
      alerts: SessionAlert[];
    }
  | { ok: false; error: "unauthorized" | "extraction_failed" };

/**
 * Convierte notas libres en una hoja de sesión estructurada y la guarda.
 * Usa salida estructurada (zod) con el mismo modelo del chat y una
 * verificación posterior determinista (ver lib/clinical/session-record.ts).
 */
export const crearHojaSesion = ({
  session,
  modelId,
  chatId,
}: {
  session: Session;
  modelId: string;
  chatId: string;
}) =>
  tool({
    description:
      "Crea y guarda una hoja de sesión de hemodiálisis a partir de las notas libres de la enfermera (pesos, PA/FC, UF, heparina, incidencias). Pasa las notas TAL CUAL las escribió el usuario, sin completar ni corregir datos. Después, resume en 2-3 frases los campos que faltan y las alertas; la tarjeta muestra el detalle.",
    execute: async ({ notas }): Promise<SessionRecordToolOutput> => {
      const userId = session.user?.id;
      if (!userId) {
        return { error: "unauthorized", ok: false };
      }
      try {
        const { draft, sourceNotes } = await extractSessionRecord({
          modelId,
          notes: notas,
        });
        const saved = await saveSessionRecord({
          chatId,
          draft,
          sourceNotes,
          userId,
        });
        return {
          alerts: draft.alerts,
          calculations: draft.calculations,
          missingFields: draft.missingFields,
          ok: true,
          patientAlias: draft.patientAlias,
          recordId: saved.id,
          unverifiedFields: draft.unverifiedFields,
        };
      } catch (error) {
        console.error("No se pudo crear la hoja de sesión:", error);
        return { error: "extraction_failed", ok: false };
      }
    },
    inputSchema: z.object({
      notas: z
        .string()
        .min(10)
        .max(MAX_SESSION_NOTES_CHARS)
        .describe("Notas de la sesión, copiadas literalmente del usuario."),
    }),
  });
