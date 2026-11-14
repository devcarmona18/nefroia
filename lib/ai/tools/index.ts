import type { UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import type { ChatMessage } from "@/lib/types";
import { createDocument } from "./create-document";
import { editDocument } from "./edit-document";
import { getWeather } from "./get-weather";
import { requestSuggestions } from "./request-suggestions";
import { updateDocument } from "./update-document";

type ChatToolsContext = {
  dataStream: UIMessageStreamWriter<ChatMessage>;
  modelId: string;
  session: Session;
};

/**
 * Registro central de herramientas (tools) disponibles para el modelo.
 *
 * PUNTO DE EXTENSIÓN: para añadir una herramienta de dominio (p. ej. cálculo
 * de Kt/V, balance hídrico, consulta de protocolos) crea el archivo en
 * `lib/ai/tools/`, regístralo aquí y añade su tipo en `lib/types.ts`
 * (`ChatTools`). El nombre de la clave es el nombre que ve el modelo.
 *
 * `getWeather` se conserva como herramienta de ejemplo con aprobación del
 * usuario (`needsApproval`); sustitúyela cuando existan herramientas reales.
 */
export function getChatTools({
  dataStream,
  modelId,
  session,
}: ChatToolsContext) {
  return {
    createDocument: createDocument({ dataStream, modelId, session }),
    editDocument: editDocument({ dataStream, session }),
    getWeather,
    requestSuggestions: requestSuggestions({ dataStream, modelId, session }),
    updateDocument: updateDocument({ dataStream, modelId, session }),
  };
}

export type ChatToolName = keyof ReturnType<typeof getChatTools>;

export const CHAT_TOOL_NAMES: ChatToolName[] = [
  "getWeather",
  "createDocument",
  "editDocument",
  "updateDocument",
  "requestSuggestions",
];
