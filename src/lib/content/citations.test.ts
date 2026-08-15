import { describe, it, expect } from "vitest"
import {
  buildCitation,
  formatVideoTimestamp,
  getArticleSectionHeading,
  getChunkSourceUrl,
} from "./citations"

describe("citations", () => {
  it("builds a video citation with timestamp label and deep link", () => {
    const citation = buildCitation({
      chunkId: "chunk-1",
      type: "video",
      title: "React Rendering Explained",
      url: "https://www.youtube.com/watch?v=abc123",
      rawText: "React re-renders when state or props change.",
      startPosition: 763000,
    })

    expect(citation.label).toBe("12:43")
    expect(citation.sourceUrl).toBe(
      "https://www.youtube.com/watch?v=abc123&t=763",
    )
    expect(citation.excerpt).toContain("React re-renders")
  })

  it("builds an article citation with section heading", () => {
    const citation = buildCitation({
      chunkId: "chunk-2",
      type: "article",
      title: "React Rendering Explained",
      url: "https://blog.example.com/react",
      rawText: "Reconciliation\n\nReact compares the new tree with the old one.",
      startPosition: null,
    })

    expect(citation.label).toBe("Reconciliation")
    expect(citation.sourceUrl).toContain("#:~:text=")
  })

  it("formats video timestamps", () => {
    expect(formatVideoTimestamp(763000)).toBe("12:43")
    expect(formatVideoTimestamp(65000)).toBe("1:05")
  })

  it("extracts article section headings from chunk text", () => {
    expect(
      getArticleSectionHeading("Reconciliation\n\nSome explanation here."),
    ).toBe("Reconciliation")
  })

  it("creates article text fragment links", () => {
    const url = getChunkSourceUrl({
      type: "article",
      url: "https://blog.example.com/react",
      rawText: "First line\n\nLast line",
      startPosition: null,
    })

    expect(url).toContain("#:~:text=")
  })
})
