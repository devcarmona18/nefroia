import type { LanguageModel } from "ai";

/**
 * Modelos simulados para Playwright (PLAYWRIGHT=True). Son deterministas y
 * no usan red. Además de texto, emiten llamadas a herramientas para probar de
 * extremo a extremo las tarjetas clínicas, el RAG y la hoja de sesión:
 *
 *   mensaje del usuario contiene…        → herramienta
 *   "urr"                                → calcularURR (BUN 70 → 21)
 *   "kt/v" + "minutos"                   → calcularKtV con 240 "horas" (error)
 *   "kt/v"                               → calcularKtV
 *   "hoja de sesión" / "session record"  → crearHojaSesion (notas literales)
 *   "protocolo" / "protocol"             → buscarProtocolos
 *
 * Tras el resultado de la herramienta, el siguiente paso responde con texto.
 * La extracción estructurada de la hoja (generateText + Output.object) recibe
 * un JSON fijo coherente con las notas de las pruebas e2e.
 */

const mockResponses: Record<string, string> = {
  default: "This is a mock response for testing.",
  greeting: "Hello! How can I help you today?",
};

const mockUsage = {
  inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 10, total: 10 },
  outputTokens: { reasoning: 0, text: 20, total: 20 },
};

const finish = (unified: "stop" | "tool-calls") => ({ raw: unified, unified });

type PromptMessage = {
  role: string;
  content: string | { type: string; text?: string; toolName?: string }[];
};

function textOf(message: PromptMessage | undefined): string {
  if (!message) {
    return "";
  }
  if (typeof message.content === "string") {
    return message.content;
  }
  return message.content
    .map((part) => (part.type === "text" ? (part.text ?? "") : ""))
    .join(" ");
}

function getResponseForPrompt(prompt: unknown): string {
  const promptStr = JSON.stringify(prompt).toLowerCase();
  if (
    promptStr.includes("hello") ||
    promptStr.includes("hi") ||
    promptStr.includes("hey")
  ) {
    return mockResponses.greeting;
  }
  return mockResponses.default;
}

type ToolCall = { toolName: string; input: Record<string, unknown> };

/** Decide si el último mensaje del usuario dispara una herramienta. */
export function mockToolCallFor(userText: string): ToolCall | null {
  const text = userText.toLowerCase();
  if (text.includes("hoja de sesión") || text.includes("session record")) {
    return { input: { notas: userText }, toolName: "crearHojaSesion" };
  }
  if (/\burr\b/.test(text)) {
    return { input: { postBun: 21, preBun: 70 }, toolName: "calcularURR" };
  }
  if (text.includes("kt/v")) {
    return {
      input: {
        durationHours: text.includes("minutos") ? 240 : 4,
        postBun: 21,
        postWeightKg: 70,
        preBun: 70,
        ufLiters: 3,
      },
      toolName: "calcularKtV",
    };
  }
  if (text.includes("protocolo") || text.includes("protocol")) {
    return { input: { consulta: userText }, toolName: "buscarProtocolos" };
  }
  return null;
}

const FINAL_TEXT: Record<string, string> = {
  buscarProtocolos:
    "Según el protocolo de la unidad [P1], coloca al paciente en Trendelenburg, reduce la ultrafiltración y avisa al médico si no responde.",
  calcularKtV: "Resultado calculado. Los objetivos los fija la prescripción.",
  calcularURR: "Resultado calculado. Los objetivos los fija la prescripción.",
  crearHojaSesion:
    "Hoja de sesión guardada. Revisa los campos faltantes y las alertas.",
};

/** Extracción fija para las notas de las pruebas e2e. */
export const MOCK_SESSION_EXTRACTION = {
  bunPostMgDl: null,
  bunPreMgDl: null,
  dialyzer: null,
  dryWeightKg: 70,
  durationHours: 4,
  events: [{ description: "Mareo, PA 85/50", time: "2h" }],
  fluidsAdministeredMl: null,
  heparin: null,
  machine: "7",
  notes: null,
  patientAlias: "J.P.",
  postWeightKg: 70.4,
  previousPostWeightKg: 69.8,
  preWeightKg: 72.5,
  sessionDate: null,
  ufAchievedMl: 2100,
  ufGoalMl: 2500,
  vascularAccess: "FAV izquierda",
  vitals: [
    { diastolic: 80, heartRate: 76, systolic: 140, time: "pre" },
    { diastolic: 50, heartRate: 92, systolic: 85, time: "2h" },
  ],
};

// Retardo entre fragmentos: deja ver el estado "generando" (botón detener)
// incluso contra el build de producción, donde todo lo demás es inmediato.
const CHUNK_DELAY_MS = 40;

function streamChunks(chunks: unknown[]) {
  return new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
        // biome-ignore lint/performance/noAwaitInLoops: simula streaming
        await new Promise((resolve) => {
          setTimeout(resolve, CHUNK_DELAY_MS);
        });
      }
      controller.close();
    },
  });
}

function textChunks(response: string) {
  return [
    { id: "t1", type: "text-start" },
    ...response
      .split(" ")
      .map((word) => ({ delta: `${word} `, id: "t1", type: "text-delta" })),
    { id: "t1", type: "text-end" },
    { finishReason: finish("stop"), type: "finish", usage: mockUsage },
  ];
}

const createMockModel = (): LanguageModel =>
  ({
    defaultObjectGenerationMode: "tool",
    doGenerate: ({ prompt }: { prompt: unknown }) => {
      const promptStr = JSON.stringify(prompt);
      const text = promptStr.includes("Extract a hemodialysis session record")
        ? JSON.stringify(MOCK_SESSION_EXTRACTION)
        : getResponseForPrompt(prompt);
      return Promise.resolve({
        content: [{ text, type: "text" }],
        finishReason: finish("stop"),
        usage: mockUsage,
        warnings: [],
      });
    },
    doStream: ({ prompt }: { prompt: PromptMessage[] }) => {
      const last = prompt.at(-1);
      // Paso 2: ya hay resultado de herramienta → respuesta en texto.
      if (last?.role === "tool") {
        const toolName =
          typeof last.content === "string"
            ? ""
            : (last.content.find((part) => part.toolName)?.toolName ?? "");
        return {
          stream: streamChunks(
            textChunks(FINAL_TEXT[toolName] ?? mockResponses.default)
          ),
        };
      }
      const lastUser = [...prompt].reverse().find((m) => m.role === "user");
      const call = mockToolCallFor(textOf(lastUser));
      if (call) {
        return {
          stream: streamChunks([
            {
              input: JSON.stringify(call.input),
              toolCallId: `call-${Date.now()}`,
              toolName: call.toolName,
              type: "tool-call",
            },
            {
              finishReason: finish("tool-calls"),
              type: "finish",
              usage: mockUsage,
            },
          ]),
        };
      }
      return {
        stream: streamChunks(textChunks(getResponseForPrompt(prompt))),
      };
    },
    modelId: "mock-model",
    provider: "mock",
    specificationVersion: "v3",
    supportedUrls: {},
  }) as unknown as LanguageModel;

const titleUsage = {
  inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 5, total: 5 },
  outputTokens: { reasoning: 0, text: 5, total: 5 },
};

const createMockTitleModel = (): LanguageModel =>
  ({
    defaultObjectGenerationMode: "tool",
    doGenerate: () =>
      Promise.resolve({
        content: [{ text: "Test Conversation", type: "text" }],
        finishReason: finish("stop"),
        usage: titleUsage,
        warnings: [],
      }),
    doStream: () => ({
      stream: streamChunks([
        { id: "t1", type: "text-start" },
        { delta: "Test Conversation", id: "t1", type: "text-delta" },
        { id: "t1", type: "text-end" },
        { finishReason: finish("stop"), type: "finish", usage: titleUsage },
      ]),
    }),
    modelId: "mock-title-model",
    provider: "mock",
    specificationVersion: "v3",
    supportedUrls: {},
  }) as unknown as LanguageModel;

export const chatModel = createMockModel();
export const titleModel = createMockTitleModel();
