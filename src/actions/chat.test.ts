import { beforeEach, describe, expect, it, vi } from "vitest"

const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockGetSession = vi.fn()
const mockSearchContentChunks = vi.fn()
const mockGenerateChatResponse = vi.fn()
const mockCheckChatRateLimit = vi.fn()

vi.mock("@/db/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
}))

vi.mock("@/lib/auth/config", () => ({
  auth: {
    api: {
      getSession: mockGetSession,
    },
  },
}))

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}))

vi.mock("@/lib/retrieval/searchContentChunks", () => ({
  searchContentChunks: mockSearchContentChunks,
}))

vi.mock("@/lib/ai/chat", () => ({
  buildChatSystemPrompt: vi.fn(() => "system prompt"),
  generateChatResponse: mockGenerateChatResponse,
}))

vi.mock("@/lib/rateLimit", () => ({
  checkChatRateLimit: mockCheckChatRateLimit,
  RateLimitError: class RateLimitError extends Error {
    name = "RateLimitError"
  },
}))

function createSelectChain(rows: unknown[], options?: { orderByResolves?: boolean }) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockImplementation(() =>
      options?.orderByResolves ? Promise.resolve(rows) : chain,
    ),
    limit: vi.fn().mockResolvedValue(rows),
  }
  return chain
}

function createInsertChain(returningRows: unknown[]) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returningRows),
  }
  return chain
}

describe("chat actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", name: "Test User" },
    })
    mockCheckChatRateLimit.mockResolvedValue(undefined)
  })

  it("creates a conversation for a content item", async () => {
    const { getOrCreateConversation } = await import("@/actions/chat")

    mockSelect
      .mockReturnValueOnce(
        createSelectChain([
          {
            id: "content-1",
            title: "React Rendering Explained",
            description: "Learn rendering",
            thumbnailUrl: "https://example.com/thumb.jpg",
            type: "video",
            url: "https://www.youtube.com/watch?v=abc",
          },
        ]),
      )
      .mockReturnValueOnce(createSelectChain([]))

    mockInsert.mockReturnValueOnce(
      createInsertChain([{ id: "conversation-1" }]),
    )

    const result = await getOrCreateConversation("content-1")

    expect(result).toEqual({
      conversationId: "conversation-1",
      content: expect.objectContaining({ id: "content-1" }),
    })
  })

  it("rejects access to another user's conversation", async () => {
    const { getConversationMessages } = await import("@/actions/chat")

    mockSelect.mockReturnValueOnce(createSelectChain([]))

    const result = await getConversationMessages("conversation-2")

    expect(result).toEqual({ error: "Conversation not found" })
  })

  it("handles empty retrieval without calling the LLM", async () => {
    const { sendChatMessage } = await import("@/actions/chat")

    mockSelect
      .mockReturnValueOnce(
        createSelectChain([
          {
            id: "conversation-1",
            userId: "user-1",
            contentId: "content-1",
          },
        ]),
      )
      .mockReturnValueOnce(
        createSelectChain([
          {
            id: "content-1",
            title: "React Rendering Explained",
            type: "video",
            url: "https://www.youtube.com/watch?v=abc",
          },
        ]),
      )

    mockInsert
      .mockReturnValueOnce(
        createInsertChain([
          {
            id: "message-1",
            role: "user",
            content: "Why does React re-render?",
            citations: [],
            createdAt: new Date(),
          },
        ]),
      )
      .mockReturnValueOnce(
        createInsertChain([
          {
            id: "message-2",
            role: "assistant",
            content:
              "I couldn't find enough information about that in this content. Try asking about another concept discussed in the video/article.",
            citations: [],
            createdAt: new Date(),
          },
        ]),
      )

    mockSearchContentChunks.mockResolvedValue([])
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    })

    const result = await sendChatMessage(
      "conversation-1",
      "Why does React re-render?",
    )

    expect(mockGenerateChatResponse).not.toHaveBeenCalled()
    expect(result).toHaveProperty("assistantMessage")
    if ("assistantMessage" in result) {
      expect(result.assistantMessage.content).toContain(
        "couldn't find enough information",
      )
    }
  })

  it("passes retrieved chunks to the LLM and returns citations", async () => {
    const { sendChatMessage } = await import("@/actions/chat")

    mockSelect
      .mockReturnValueOnce(
        createSelectChain([
          {
            id: "conversation-1",
            userId: "user-1",
            contentId: "content-1",
          },
        ]),
      )
      .mockReturnValueOnce(
        createSelectChain([
          {
            id: "content-1",
            title: "React Rendering Explained",
            type: "video",
            url: "https://www.youtube.com/watch?v=abc",
          },
        ]),
      )
      .mockReturnValueOnce(
        createSelectChain(
          [
            {
              role: "user",
              content: "Why does React re-render?",
            },
          ],
          { orderByResolves: true },
        ),
      )

    mockInsert
      .mockReturnValueOnce(
        createInsertChain([
          {
            id: "message-1",
            role: "user",
            content: "Why does React re-render?",
            citations: [],
            createdAt: new Date(),
          },
        ]),
      )
      .mockReturnValueOnce(
        createInsertChain([
          {
            id: "message-2",
            role: "assistant",
            content: "React re-renders when state or props change.",
            citations: [
              {
                chunkId: "chunk-1",
                excerpt: "React re-renders when state or props change.",
                sourceUrl: "https://www.youtube.com/watch?v=abc&t=763",
                label: "12:43",
              },
            ],
            createdAt: new Date(),
          },
        ]),
      )

    mockSearchContentChunks.mockResolvedValue([
      {
        chunkId: "chunk-1",
        text: "React re-renders when state or props change.",
        startPosition: 763000,
        similarity: 0.91,
        contentId: "content-1",
        contentTitle: "React Rendering Explained",
        contentUrl: "https://www.youtube.com/watch?v=abc",
        contentType: "video",
      },
    ])

    mockGenerateChatResponse.mockResolvedValue(
      "React re-renders when state or props change.",
    )

    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    })

    const result = await sendChatMessage(
      "conversation-1",
      "Why does React re-render?",
    )

    expect(mockSearchContentChunks).toHaveBeenCalledWith({
      contentId: "content-1",
      query: "Why does React re-render?",
    })
    expect(mockGenerateChatResponse).toHaveBeenCalled()
    expect(result).toHaveProperty("assistantMessage")
    if ("assistantMessage" in result) {
      expect(result.assistantMessage.citations?.[0]?.label).toBe("12:43")
    }
  })

  it("returns rate limit errors from chat rate limiting", async () => {
    const { sendChatMessage } = await import("@/actions/chat")
    const { RateLimitError } = await import("@/lib/rateLimit")

    mockSelect
      .mockReturnValueOnce(
        createSelectChain([
          {
            id: "conversation-1",
            userId: "user-1",
            contentId: "content-1",
          },
        ]),
      )
      .mockReturnValueOnce(
        createSelectChain([
          {
            id: "content-1",
            title: "React Rendering Explained",
            type: "video",
            url: "https://www.youtube.com/watch?v=abc",
          },
        ]),
      )

    mockCheckChatRateLimit.mockRejectedValue(
      new RateLimitError("Rate limit exceeded"),
    )

    const result = await sendChatMessage("conversation-1", "Hello")

    expect(result).toEqual({ error: "Rate limit exceeded" })
  })
})
