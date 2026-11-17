import type { InferUITool, UIMessage } from "ai";
import { z } from "zod";
import type { ArtifactKind } from "@/components/chat/artifact";
import type {
  calcularBalanceHidrico,
  calcularGananciaInterdialitica,
  calcularKtV,
  calcularTasaUltrafiltracion,
  calcularURR,
} from "./ai/tools/clinical-calculators";
import type { createDocument } from "./ai/tools/create-document";
import type { editDocument } from "./ai/tools/edit-document";
import type { requestSuggestions } from "./ai/tools/request-suggestions";
import type { buscarProtocolos } from "./ai/tools/search-protocols";
import type { crearHojaSesion } from "./ai/tools/session-record";
import type { updateDocument } from "./ai/tools/update-document";
import type { Suggestion } from "./db/schema";
import type { RedFlagCategory } from "./safety/red-flags";
import type { PiiType } from "./safety/redact";

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

type createDocumentTool = InferUITool<ReturnType<typeof createDocument>>;
type updateDocumentTool = InferUITool<ReturnType<typeof updateDocument>>;
type requestSuggestionsTool = InferUITool<
  ReturnType<typeof requestSuggestions>
>;

export type ChatTools = {
  calcularURR: InferUITool<typeof calcularURR>;
  calcularKtV: InferUITool<typeof calcularKtV>;
  calcularGananciaInterdialitica: InferUITool<
    typeof calcularGananciaInterdialitica
  >;
  calcularTasaUltrafiltracion: InferUITool<typeof calcularTasaUltrafiltracion>;
  calcularBalanceHidrico: InferUITool<typeof calcularBalanceHidrico>;
  buscarProtocolos: InferUITool<ReturnType<typeof buscarProtocolos>>;
  crearHojaSesion: InferUITool<ReturnType<typeof crearHojaSesion>>;
  createDocument: createDocumentTool;
  editDocument: InferUITool<ReturnType<typeof editDocument>>;
  updateDocument: updateDocumentTool;
  requestSuggestions: requestSuggestionsTool;
};

export type WaitingStatusData = {
  phase: "waiting" | "still-waiting" | "health" | "thinking";
  message: string;
  modelId: string;
  modelName: string;
};

export type CustomUIDataTypes = {
  textDelta: string;
  imageDelta: string;
  sheetDelta: string;
  codeDelta: string;
  suggestion: Suggestion;
  appendMessage: string;
  id: string;
  title: string;
  kind: ArtifactKind;
  clear: null;
  finish: null;
  "chat-title": string;
  "waiting-status": WaitingStatusData;
  /** Aviso persistente: datos personales ocultados antes de llamar al modelo. */
  redaction: { total: number; counts: Partial<Record<PiiType, number>> };
  /** Signos de alarma detectados en el mensaje del usuario. */
  "red-flags": { categories: RedFlagCategory[] };
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;

export type Attachment = {
  name: string;
  url: string;
  contentType: string;
};
