import { describe, it, expect } from "vitest"
import { buildChatSystemPrompt } from "./chat"

describe("buildChatSystemPrompt", () => {
  it("instructs the model to stay grounded in provided excerpts", () => {
    const prompt = buildChatSystemPrompt({
      contentTitle: "React Rendering Explained",
      contentType: "video",
      contextChunks: [
        {
          label: "12:43",
          text: "React re-renders when state or props change.",
        },
      ],
    })

    expect(prompt).toContain("React Rendering Explained")
    expect(prompt).toContain("Do not invent facts")
    expect(prompt).toContain("[Source 1 — 12:43]")
    expect(prompt).toContain("React re-renders when state or props change.")
  })

  it("handles empty retrieval safely", () => {
    const prompt = buildChatSystemPrompt({
      contentTitle: "React Rendering Explained",
      contentType: "article",
      contextChunks: [],
    })

    expect(prompt).toContain("No relevant excerpts were retrieved")
  })
})
