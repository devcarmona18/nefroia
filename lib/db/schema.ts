import { type InferSelectModel, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  foreignKey,
  index,
  integer,
  json,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const user = pgTable(
  "User",
  {
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    email: varchar("email", { length: 64 }).notNull(),
    emailVerified: boolean("emailVerified").notNull().default(false),
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    image: text("image"),
    isAnonymous: boolean("isAnonymous").notNull().default(false),
    name: text("name"),
    password: varchar("password", { length: 64 }),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    emailUnique: uniqueIndex("User_email_unique").on(table.email),
  })
);

export type User = InferSelectModel<typeof user>;

export const chat = pgTable(
  "Chat",
  {
    createdAt: timestamp("createdAt").notNull(),
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    title: text("title").notNull(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    visibility: varchar("visibility", { enum: ["public", "private"] })
      .notNull()
      .default("private"),
  },
  (table) => ({
    userCreatedIdx: index("Chat_userId_createdAt_idx").on(
      table.userId,
      table.createdAt
    ),
  })
);

export type Chat = InferSelectModel<typeof chat>;

export const message = pgTable(
  "Message_v2",
  {
    attachments: json("attachments").notNull(),
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    createdAt: timestamp("createdAt").notNull(),
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    parts: json("parts").notNull(),
    role: varchar("role").notNull(),
  },
  (table) => ({
    chatCreatedIdx: index("Message_v2_chatId_createdAt_idx").on(
      table.chatId,
      table.createdAt
    ),
  })
);

export type DBMessage = InferSelectModel<typeof message>;

export const vote = pgTable(
  "Vote_v2",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    isUpvoted: boolean("isUpvoted").notNull(),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id),
  },
  (table) => ({
    messageIdx: index("Vote_v2_messageId_idx").on(table.messageId),
    pk: primaryKey({ columns: [table.chatId, table.messageId] }),
  })
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  "Document",
  {
    content: text("content"),
    createdAt: timestamp("createdAt").notNull(),
    id: uuid("id").notNull().defaultRandom(),
    kind: varchar("text", { enum: ["text", "code", "image", "sheet"] })
      .notNull()
      .default("text"),
    title: text("title").notNull(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.createdAt] }),
    userIdx: index("Document_userId_idx").on(table.userId),
  })
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  "Suggestion",
  {
    createdAt: timestamp("createdAt").notNull(),
    description: text("description"),
    documentCreatedAt: timestamp("documentCreatedAt").notNull(),
    documentId: uuid("documentId").notNull(),
    id: uuid("id").notNull().defaultRandom(),
    isResolved: boolean("isResolved").notNull().default(false),
    originalText: text("originalText").notNull(),
    suggestedText: text("suggestedText").notNull(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
  },
  (table) => ({
    documentIdx: index("Suggestion_documentId_documentCreatedAt_idx").on(
      table.documentId,
      table.documentCreatedAt
    ),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
    pk: primaryKey({ columns: [table.id] }),
    userIdx: index("Suggestion_userId_idx").on(table.userId),
  })
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = pgTable(
  "Stream",
  {
    chatId: uuid("chatId").notNull(),
    createdAt: timestamp("createdAt").notNull(),
    id: uuid("id").notNull().defaultRandom(),
  },
  (table) => ({
    chatCreatedIdx: index("Stream_chatId_createdAt_idx").on(
      table.chatId,
      table.createdAt
    ),
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
    pk: primaryKey({ columns: [table.id] }),
  })
);

export type Stream = InferSelectModel<typeof stream>;

// ---------------------------------------------------------------------------
// Protocolos de la unidad (RAG)
// ---------------------------------------------------------------------------

/** tsvector de PostgreSQL (solo lectura: columna generada). */
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const PROTOCOL_STATUSES = ["processing", "ready", "failed"] as const;
export type ProtocolStatus = (typeof PROTOCOL_STATUSES)[number];

export const protocolDocument = pgTable(
  "protocol_document",
  {
    chunkCount: integer("chunkCount").notNull().default(0),
    contentType: varchar("contentType", { length: 128 }).notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    /** Modelo de embeddings con el que se indexó (no se mezclan modelos). */
    embeddingModel: varchar("embeddingModel", { length: 128 }),
    /** Código de error traducible (`protocols.errors.*`) si status = failed. */
    error: varchar("error", { length: 64 }),
    /** Clave del original en el bucket privado (null si no hay S3). */
    fileKey: text("fileKey"),
    filename: text("filename").notNull(),
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    isDemo: boolean("isDemo").notNull().default(false),
    pages: integer("pages"),
    sizeBytes: integer("sizeBytes").notNull().default(0),
    status: varchar("status", { enum: PROTOCOL_STATUSES })
      .notNull()
      .default("processing"),
    title: text("title").notNull(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => ({
    userCreatedIdx: index("protocol_document_userId_createdAt_idx").on(
      table.userId,
      table.createdAt
    ),
  })
);

export type ProtocolDocument = InferSelectModel<typeof protocolDocument>;

export const EMBEDDING_DIMENSIONS = 384;

export const protocolChunk = pgTable(
  "protocol_chunk",
  {
    content: text("content").notNull(),
    documentId: uuid("documentId")
      .notNull()
      .references(() => protocolDocument.id, { onDelete: "cascade" }),
    /**
     * Vector normalizado (L2) de 384 dimensiones como real[]: funciona en
     * cualquier PostgreSQL. Donde exista pgvector, la migración 0003 añade la
     * columna generada `embeddingVec vector(384)` con índice HNSW (coseno).
     */
    embedding: real("embedding").array().notNull(),
    heading: text("heading"),
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    ordinal: integer("ordinal").notNull(),
    page: integer("page"),
    /** Texto en minúsculas y sin tildes para la búsqueda léxica. */
    searchText: text("searchText").notNull(),
    tokenCount: integer("tokenCount").notNull(),
    tsv: tsvector("tsv").generatedAlwaysAs(
      sql`to_tsvector('spanish'::regconfig, "searchText")`
    ),
    /** Desnormalizado para filtrar por propietario antes de ordenar. */
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => ({
    documentOrdinalIdx: uniqueIndex("protocol_chunk_documentId_ordinal_idx").on(
      table.documentId,
      table.ordinal
    ),
    tsvIdx: index("protocol_chunk_tsv_idx").using("gin", table.tsv),
    userIdx: index("protocol_chunk_userId_idx").on(table.userId),
  })
);

export type ProtocolChunk = InferSelectModel<typeof protocolChunk>;

// ---------------------------------------------------------------------------
// Hojas de sesión de hemodiálisis
// ---------------------------------------------------------------------------

export type VitalSignReading = {
  time: string | null;
  systolic: number | null;
  diastolic: number | null;
  heartRate: number | null;
};

export type SessionEvent = { time: string | null; description: string };

export const sessionRecord = pgTable(
  "session_record",
  {
    alerts: jsonb("alerts").notNull().default(sql`'[]'::jsonb`),
    bunPostMgDl: real("bunPostMgDl"),
    bunPreMgDl: real("bunPreMgDl"),
    calculations: jsonb("calculations").notNull().default(sql`'[]'::jsonb`),
    chatId: uuid("chatId"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    dialyzer: text("dialyzer"),
    dryWeightKg: real("dryWeightKg"),
    durationHours: real("durationHours"),
    events: jsonb("events")
      .$type<SessionEvent[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    fluidsAdministeredMl: real("fluidsAdministeredMl"),
    heparin: text("heparin"),
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    machine: text("machine"),
    missingFields: jsonb("missingFields")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    notes: text("notes"),
    /** Iniciales o seudónimo; nunca el nombre completo. */
    patientAlias: varchar("patientAlias", { length: 24 }),
    postWeightKg: real("postWeightKg"),
    previousPostWeightKg: real("previousPostWeightKg"),
    preWeightKg: real("preWeightKg"),
    sessionDate: date("sessionDate"),
    /** Notas originales ya redactadas (sin datos personales). */
    sourceNotes: text("sourceNotes").notNull(),
    ufAchievedMl: real("ufAchievedMl"),
    ufGoalMl: real("ufGoalMl"),
    /** Campos que el modelo propuso pero no aparecían en las notas. */
    unverifiedFields: jsonb("unverifiedFields")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    vascularAccess: text("vascularAccess"),
    vitals: jsonb("vitals")
      .$type<VitalSignReading[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
  },
  (table) => ({
    userCreatedIdx: index("session_record_userId_createdAt_idx").on(
      table.userId,
      table.createdAt
    ),
  })
);

export type SessionRecord = InferSelectModel<typeof sessionRecord>;
