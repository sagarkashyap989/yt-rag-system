import { describe, it, expect } from "vitest"
import { parseMessageContent } from "./formatMessage"

describe("parseMessageContent", () => {
  it("parses fenced code blocks with language", () => {
    const content = `Here is an example:

\`\`\`jsx
function TextComponent(props) {
  return <div>{props.children}</div>;
}
\`\`\`

And some explanation.`

    const segments = parseMessageContent(content)

    expect(segments).toEqual([
      { type: "text", value: "Here is an example:\n\n" },
      {
        type: "code",
        language: "jsx",
        value: "function TextComponent(props) {\n  return <div>{props.children}</div>;\n}",
      },
      { type: "text", value: "\n\nAnd some explanation." },
    ])
  })

  it("parses inline code", () => {
    const segments = parseMessageContent(
      "Use the `TextComponent` prop called `children`.",
    )

    expect(segments).toEqual([
      { type: "text", value: "Use the " },
      { type: "inline-code", value: "TextComponent" },
      { type: "text", value: " prop called " },
      { type: "inline-code", value: "children" },
      { type: "text", value: "." },
    ])
  })
})
