-- Las tablas clínicas pasan a timestamptz: defaultNow() guardaba la hora local
-- del servidor en columnas sin zona y la app la leía como UTC. La conversión
-- usa la zona de la sesión, la misma con la que se escribieron los valores.
ALTER TABLE "protocol_document" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "protocol_document" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "protocol_document" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "protocol_document" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "session_record" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session_record" ALTER COLUMN "createdAt" SET DEFAULT now();