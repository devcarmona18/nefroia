CREATE TABLE "protocol_chunk" (
	"content" text NOT NULL,
	"documentId" uuid NOT NULL,
	"embedding" real[] NOT NULL,
	"heading" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ordinal" integer NOT NULL,
	"page" integer,
	"searchText" text NOT NULL,
	"tokenCount" integer NOT NULL,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('spanish'::regconfig, "searchText")) STORED,
	"userId" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protocol_document" (
	"chunkCount" integer DEFAULT 0 NOT NULL,
	"contentType" varchar(128) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"embeddingModel" varchar(128),
	"error" varchar(64),
	"fileKey" text,
	"filename" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"isDemo" boolean DEFAULT false NOT NULL,
	"pages" integer,
	"sizeBytes" integer DEFAULT 0 NOT NULL,
	"status" varchar DEFAULT 'processing' NOT NULL,
	"title" text NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"userId" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_record" (
	"alerts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bunPostMgDl" real,
	"bunPreMgDl" real,
	"calculations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"chatId" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"dialyzer" text,
	"dryWeightKg" real,
	"durationHours" real,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fluidsAdministeredMl" real,
	"heparin" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"machine" text,
	"missingFields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"patientAlias" varchar(24),
	"postWeightKg" real,
	"preWeightKg" real,
	"previousPostWeightKg" real,
	"sessionDate" date,
	"sourceNotes" text NOT NULL,
	"ufAchievedMl" real,
	"ufGoalMl" real,
	"unverifiedFields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"userId" uuid NOT NULL,
	"vascularAccess" text,
	"vitals" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "protocol_chunk" ADD CONSTRAINT "protocol_chunk_documentId_protocol_document_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."protocol_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocol_chunk" ADD CONSTRAINT "protocol_chunk_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocol_document" ADD CONSTRAINT "protocol_document_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_record" ADD CONSTRAINT "session_record_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "protocol_chunk_documentId_ordinal_idx" ON "protocol_chunk" USING btree ("documentId","ordinal");--> statement-breakpoint
CREATE INDEX "protocol_chunk_tsv_idx" ON "protocol_chunk" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "protocol_chunk_userId_idx" ON "protocol_chunk" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "protocol_document_userId_createdAt_idx" ON "protocol_document" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "session_record_userId_createdAt_idx" ON "session_record" USING btree ("userId","createdAt");