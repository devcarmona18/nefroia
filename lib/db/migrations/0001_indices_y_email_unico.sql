CREATE INDEX "Chat_userId_createdAt_idx" ON "Chat" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "Document_userId_idx" ON "Document" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "Message_v2_chatId_createdAt_idx" ON "Message_v2" USING btree ("chatId","createdAt");--> statement-breakpoint
CREATE INDEX "Stream_chatId_createdAt_idx" ON "Stream" USING btree ("chatId","createdAt");--> statement-breakpoint
CREATE INDEX "Suggestion_documentId_documentCreatedAt_idx" ON "Suggestion" USING btree ("documentId","documentCreatedAt");--> statement-breakpoint
CREATE INDEX "Suggestion_userId_idx" ON "Suggestion" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "User_email_unique" ON "User" USING btree ("email");--> statement-breakpoint
CREATE INDEX "Vote_v2_messageId_idx" ON "Vote_v2" USING btree ("messageId");