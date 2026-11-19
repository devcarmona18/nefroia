CREATE TABLE "sso_token_use" (
	"expiresAt" timestamp with time zone NOT NULL,
	"jti" varchar(128) PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sso_token_use_expiresAt_idx" ON "sso_token_use" USING btree ("expiresAt");