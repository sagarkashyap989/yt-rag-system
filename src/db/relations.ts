import { defineRelations } from "drizzle-orm"
import * as schema from "./schema"

export const relations = defineRelations(schema, r => ({
  content: {
    chunks: r.many.chunks({
      from: r.content.id,
      to: r.chunks.contentId,
    }),
  },
  chunks: {
    content: r.one.content({
      from: r.chunks.contentId,
      to: r.content.id,
    }),
  },
  user: {
    searches: r.many.userSearches({
      from: r.user.id,
      to: r.userSearches.userId,
    }),
    conversations: r.many.conversations({
      from: r.user.id,
      to: r.conversations.userId,
    }),
  },
  userSearches: {
    user: r.one.user({
      from: r.userSearches.userId,
      to: r.user.id,
    }),
  },
  conversations: {
    user: r.one.user({
      from: r.conversations.userId,
      to: r.user.id,
    }),
    content: r.one.content({
      from: r.conversations.contentId,
      to: r.content.id,
    }),
    messages: r.many.messages({
      from: r.conversations.id,
      to: r.messages.conversationId,
    }),
  },
  messages: {
    conversation: r.one.conversations({
      from: r.messages.conversationId,
      to: r.conversations.id,
    }),
  },
}))
