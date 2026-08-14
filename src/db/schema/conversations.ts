import { index, uuid, snakeCase } from "drizzle-orm/pg-core"
import { id, timestamps } from "../utils"
import { user } from "../schemas/auth"
import { content } from "./content"

export const conversations = snakeCase.table(
  "conversations",
  {
    id,
    userId: uuid()
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
    contentId: uuid()
      .references(() => content.id, { onDelete: "cascade" })
      .notNull(),
    ...timestamps,
  },
  table => [
    index("conversations_userId_idx").on(table.userId),
    index("conversations_contentId_idx").on(table.contentId),
    index("conversations_userId_contentId_idx").on(
      table.userId,
      table.contentId,
    ),
  ],
)
