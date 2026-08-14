"use server"

import { db } from "@/db/db"
import {
  content,
  conversations,
  messages,
  type ChatCitation,
} from "@/db/schema"
import { auth } from "@/lib/auth/config"
import {
  buildChatSystemPrompt,
  generateChatResponse,
} from "@/lib/ai/chat"
import { buildCitation } from "@/lib/content/citations"
import { searchContentChunks } from "@/lib/retrieval/searchContentChunks"
import { checkChatRateLimit, RateLimitError } from "@/lib/rateLimit"
import { and, asc, desc, eq } from "drizzle-orm"
import { headers } from "next/headers"

const MAX_MESSAGE_LENGTH = 2000
const MAX_HISTORY_MESSAGES = 12

type ActionError = { error: string }

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return null
  }
  return session
}

async function getOwnedConversation(conversationId: string, userId: string) {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId),
      ),
    )
    .limit(1)

  return conversation ?? null
}

export async function getContentById(contentId: string) {
  const session = await requireSession()
  if (!session) return { error: "Unauthorized" } satisfies ActionError

  const [item] = await db
    .select({
      id: content.id,
      title: content.title,
      description: content.description,
      thumbnailUrl: content.thumbnailUrl,
      type: content.type,
      url: content.url,
    })
    .from(content)
    .where(eq(content.id, contentId))
    .limit(1)

  if (!item) {
    return { error: "Content not found" } satisfies ActionError
  }

  return item
}

export async function createNewConversation(contentId: string) {
  const session = await requireSession()
  if (!session) return { error: "Unauthorized" } satisfies ActionError

  const contentItem = await getContentById(contentId)
  if ("error" in contentItem) {
    return contentItem
  }

  const [createdConversation] = await db
    .insert(conversations)
    .values({
      userId: session.user.id,
      contentId,
    })
    .returning({ id: conversations.id })

  return {
    conversationId: createdConversation.id,
    content: contentItem,
  }
}

export async function getOrCreateConversation(contentId: string) {
  const session = await requireSession()
  if (!session) return { error: "Unauthorized" } satisfies ActionError

  const contentItem = await getContentById(contentId)
  if ("error" in contentItem) {
    return contentItem
  }

  const [existingConversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.userId, session.user.id),
        eq(conversations.contentId, contentId),
      ),
    )
    .orderBy(desc(conversations.updatedAt))
    .limit(1)

  if (existingConversation) {
    return { conversationId: existingConversation.id, content: contentItem }
  }

  const [createdConversation] = await db
    .insert(conversations)
    .values({
      userId: session.user.id,
      contentId,
    })
    .returning({ id: conversations.id })

  return {
    conversationId: createdConversation.id,
    content: contentItem,
  }
}

export async function getConversationMessages(conversationId: string) {
  const session = await requireSession()
  if (!session) return { error: "Unauthorized" } satisfies ActionError

  const conversation = await getOwnedConversation(
    conversationId,
    session.user.id,
  )
  if (!conversation) {
    return { error: "Conversation not found" } satisfies ActionError
  }

  const [contentItem] = await db
    .select({
      id: content.id,
      title: content.title,
      description: content.description,
      thumbnailUrl: content.thumbnailUrl,
      type: content.type,
      url: content.url,
    })
    .from(content)
    .where(eq(content.id, conversation.contentId))
    .limit(1)

  if (!contentItem) {
    return { error: "Content not found" } satisfies ActionError
  }

  const conversationMessages = await db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      citations: messages.citations,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))

  return {
    conversationId,
    content: contentItem,
    messages: conversationMessages,
  }
}

export async function sendChatMessage(conversationId: string, message: string) {
  const session = await requireSession()
  if (!session) return { error: "Unauthorized" } satisfies ActionError

  const trimmed = message.trim()
  if (!trimmed) {
    return { error: "Message cannot be empty" } satisfies ActionError
  }

  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return {
      error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer`,
    } satisfies ActionError
  }

  const conversation = await getOwnedConversation(
    conversationId,
    session.user.id,
  )
  if (!conversation) {
    return { error: "Conversation not found" } satisfies ActionError
  }

  const [contentItem] = await db
    .select({
      id: content.id,
      title: content.title,
      type: content.type,
      url: content.url,
    })
    .from(content)
    .where(eq(content.id, conversation.contentId))
    .limit(1)

  if (!contentItem) {
    return { error: "Content not found" } satisfies ActionError
  }

  try {
    await checkChatRateLimit(session.user.id)
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { error: error.message } satisfies ActionError
    }
    return { error: "Rate limit exceeded" } satisfies ActionError
  }

  const [userMessage] = await db
    .insert(messages)
    .values({
      conversationId,
      role: "user",
      content: trimmed,
    })
    .returning({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      citations: messages.citations,
      createdAt: messages.createdAt,
    })

  const retrievedChunks = await searchContentChunks({
    contentId: conversation.contentId,
    query: trimmed,
  })

  if (retrievedChunks.length === 0) {
    const fallbackContent =
      "I couldn't find enough information about that in this content. Try asking about another concept discussed in the video/article."

    const [assistantMessage] = await db
      .insert(messages)
      .values({
        conversationId,
        role: "assistant",
        content: fallbackContent,
        citations: [],
      })
      .returning({
        id: messages.id,
        role: messages.role,
        content: messages.content,
        citations: messages.citations,
        createdAt: messages.createdAt,
      })

    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId))

    return {
      userMessage,
      assistantMessage,
    }
  }

  const citations: ChatCitation[] = retrievedChunks.map(chunk =>
    buildCitation({
      chunkId: chunk.chunkId,
      type: chunk.contentType,
      title: chunk.contentTitle,
      url: chunk.contentUrl,
      rawText: chunk.text,
      startPosition: chunk.startPosition,
    }),
  )

  const previousMessages = await db
    .select({
      role: messages.role,
      content: messages.content,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))

  const history = previousMessages
    .filter(messageRow => messageRow.role === "user" || messageRow.role === "assistant")
    .slice(-MAX_HISTORY_MESSAGES)
    .map(messageRow => ({
      role: messageRow.role,
      content: messageRow.content,
    }))

  const systemPrompt = buildChatSystemPrompt({
    contentTitle: contentItem.title,
    contentType: contentItem.type,
    contextChunks: retrievedChunks.map((chunk, index) => ({
      label: citations[index]?.label ?? `Source ${index + 1}`,
      text: chunk.text,
    })),
  })

  let assistantContent: string
  try {
    assistantContent = await generateChatResponse({
      systemPrompt,
      messages: history,
    })
  } catch {
    return {
      error: "The AI assistant is temporarily unavailable. Please try again.",
    } satisfies ActionError
  }

  const [assistantMessage] = await db
    .insert(messages)
    .values({
      conversationId,
      role: "assistant",
      content: assistantContent,
      citations,
    })
    .returning({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      citations: messages.citations,
      createdAt: messages.createdAt,
    })

  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId))

  return {
    userMessage,
    assistantMessage,
  }
}
