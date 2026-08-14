import { index, jsonb, pgEnum, text, uuid, snakeCase } from "drizzle-orm/pg-core"
import { id, timestamps } from "../utils"
import { conversations } from "./conversations"

export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"])

export type ChatCitation = {
  chunkId: string
  excerpt: string
  sourceUrl: string
  label: string
}

export const messages = snakeCase.table(
  "messages",
  {
    id,
    conversationId: uuid()
      .references(() => conversations.id, { onDelete: "cascade" })
      .notNull(),
    role: messageRoleEnum().notNull(),
    content: text().notNull(),
    citations: jsonb().$type<ChatCitation[]>().notNull().default([]),
    createdAt: timestamps.createdAt,
  },
  table => [
    index("messages_conversationId_createdAt_idx").on(
      table.conversationId,
      table.createdAt,
    ),
  ],
)
