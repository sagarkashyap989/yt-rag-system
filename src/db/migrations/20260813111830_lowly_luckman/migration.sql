CREATE TYPE "message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TABLE "user_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"query_text" text NOT NULL,
	"user_id" uuid NOT NULL,
	"result_content_ids" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"conversation_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"citations" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "user_searches_userId_createdAt_idx" ON "user_searches" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "conversations_userId_idx" ON "conversations" ("user_id");--> statement-breakpoint
CREATE INDEX "conversations_contentId_idx" ON "conversations" ("content_id");--> statement-breakpoint
CREATE INDEX "conversations_userId_contentId_idx" ON "conversations" ("user_id","content_id");--> statement-breakpoint
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages" ("conversation_id","created_at");--> statement-breakpoint
ALTER TABLE "user_searches" ADD CONSTRAINT "user_searches_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_content_id_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "content"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE;