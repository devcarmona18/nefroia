import { tool } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import { searchProtocols } from "@/lib/protocols/service";

/** Longitud máxima del extracto que recibe el modelo por fragmento. */
const EXCERPT_CHARS = 1800;

export type ProtocolCitation = {
  /** Etiqueta corta que el modelo usa en el texto: [P1], [P2]... */
  ref: string;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  page: number | null;
  heading: string | null;
  excerpt: string;
};

export type ProtocolSearchOutput = {
  query: string;
  grounded: boolean;
  results: ProtocolCitation[];
};

/**
 * Búsqueda en los protocolos subidos por el usuario (RAG). La sesión se toma
 * del servidor, nunca de la entrada del modelo: el alcance por usuario no se
 * puede manipular con una instrucción en el chat.
 */
export const buscarProtocolos = ({ session }: { session: Session }) =>
  tool({
    description:
      "Busca en los protocolos de la unidad que el usuario ha subido (PDF, Word, Markdown). Úsala SIEMPRE antes de responder sobre procedimientos, cuidados o actuación de enfermería. Devuelve fragmentos con referencia [P1], [P2]... Si grounded es false, di claramente que no encuentras la información en los protocolos y no la completes con conocimiento general sin advertirlo.",
    execute: async ({ consulta }): Promise<ProtocolSearchOutput> => {
      const userId = session.user?.id;
      if (!userId) {
        return { grounded: false, query: consulta, results: [] };
      }
      const { grounded, hits } = await searchProtocols(userId, consulta, 5);
      return {
        grounded,
        query: consulta,
        results: hits.map((hit, index) => ({
          chunkId: hit.chunkId,
          documentId: hit.documentId,
          documentTitle: hit.documentTitle,
          excerpt:
            hit.content.length > EXCERPT_CHARS
              ? `${hit.content.slice(0, EXCERPT_CHARS)}…`
              : hit.content,
          heading: hit.heading,
          page: hit.page,
          ref: `P${index + 1}`,
        })),
      };
    },
    inputSchema: z.object({
      consulta: z
        .string()
        .min(2)
        .max(300)
        .describe(
          "Consulta de búsqueda en español con los términos clave (p. ej. 'hipotensión intradiálisis actuación enfermería')."
        ),
    }),
  });
