import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSelect = vi.fn()
const mockEmbedChunks = vi.fn()

vi.mock("@/db/db", () => ({
  db: {
    select: mockSelect,
  },
}))

vi.mock("@/lib/embedding/embed-chunks", () => ({
  embedChunks: mockEmbedChunks,
}))

function createSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  }
  return chain
}

describe("searchContentChunks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEmbedChunks.mockResolvedValue([[0.1, 0.2, 0.3]])
  })

  it("filters retrieval by contentId", async () => {
    const { searchContentChunks } = await import("./searchContentChunks")

    mockSelect.mockReturnValueOnce(
      createSelectChain([
        {
          chunkId: "chunk-1",
          text: "React re-renders when state changes.",
          startPosition: 12000,
          similarity: 0.88,
          contentId: "content-1",
          contentTitle: "React Rendering Explained",
          contentUrl: "https://www.youtube.com/watch?v=abc",
          contentType: "video",
        },
      ]),
    )

    const results = await searchContentChunks({
      contentId: "content-1",
      query: "Why does React re-render?",
      limit: 5,
    })

    expect(mockEmbedChunks).toHaveBeenCalledWith(["why does react re-render?"])
    expect(results).toHaveLength(1)
    expect(results[0]?.contentId).toBe("content-1")
  })
})
