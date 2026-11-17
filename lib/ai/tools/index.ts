import type { UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import type { ChatMessage } from "@/lib/types";
import {
  CALCULATOR_TOOL_NAMES,
  calcularBalanceHidrico,
  calcularGananciaInterdialitica,
  calcularKtV,
  calcularTasaUltrafiltracion,
  calcularURR,
} from "./clinical-calculators";
import { createDocument } from "./create-document";
import { editDocument } from "./edit-document";
import { requestSuggestions } from "./request-suggestions";
import { buscarProtocolos } from "./search-protocols";
import { crearHojaSesion } from "./session-record";
import { updateDocument } from "./update-document";

type ChatToolsContext = {
  chatId: string;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  modelId: string;
  session: Session;
};

/**
 * Registro central de herramientas (tools) disponibles para el modelo.
 *
 * Herramientas de dominio:
 *  - Calculadoras clínicas (URR, spKt/V, ganancia interdialítica, tasa de UF,
 *    balance hídrico): funciones puras de `lib/clinical`.
 *  - `buscarProtocolos`: RAG sobre los protocolos del usuario.
 *  - `crearHojaSesion`: notas libres → hoja de sesión estructurada.
 *
 * Para añadir una: crea el archivo en `lib/ai/tools/`, regístrala aquí, añade
 * su tipo en `lib/types.ts` (`ChatTools`) y su nombre visible en
 * `messages/{es,en}.json` (`tool.names.*`).
 */
export function getChatTools({
  chatId,
  dataStream,
  modelId,
  session,
}: ChatToolsContext) {
  return {
    buscarProtocolos: buscarProtocolos({ session }),
    calcularBalanceHidrico,
    calcularGananciaInterdialitica,
    calcularKtV,
    calcularTasaUltrafiltracion,
    calcularURR,
    crearHojaSesion: crearHojaSesion({ chatId, modelId, session }),
    createDocument: createDocument({ dataStream, modelId, session }),
    editDocument: editDocument({ dataStream, session }),
    requestSuggestions: requestSuggestions({ dataStream, modelId, session }),
    updateDocument: updateDocument({ dataStream, modelId, session }),
  };
}

export type ChatToolName = keyof ReturnType<typeof getChatTools>;

export const CHAT_TOOL_NAMES: ChatToolName[] = [
  ...CALCULATOR_TOOL_NAMES,
  "buscarProtocolos",
  "crearHojaSesion",
  "createDocument",
  "editDocument",
  "updateDocument",
  "requestSuggestions",
];
