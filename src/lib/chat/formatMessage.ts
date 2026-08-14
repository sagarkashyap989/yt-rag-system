export type MessageSegment =
  | { type: "text"; value: string }
  | { type: "code"; value: string; language?: string }
  | { type: "inline-code"; value: string }

const FENCED_CODE_BLOCK = /```(\w*)\n?([\s\S]*?)```/g

export function parseMessageContent(content: string): MessageSegment[] {
  const segments: MessageSegment[] = []
  let lastIndex = 0

  for (const match of content.matchAll(FENCED_CODE_BLOCK)) {
    const matchIndex = match.index ?? 0

    if (matchIndex > lastIndex) {
      segments.push(
        ...parseInlineCode(content.slice(lastIndex, matchIndex)),
      )
    }

    const language = match[1]?.trim()
    const code = match[2]?.replace(/\n$/, "") ?? ""

    segments.push({
      type: "code",
      value: code,
      language: language || undefined,
    })

    lastIndex = matchIndex + match[0].length
  }

  if (lastIndex < content.length) {
    segments.push(...parseInlineCode(content.slice(lastIndex)))
  }

  return segments.length > 0 ? segments : parseInlineCode(content)
}

function parseInlineCode(text: string): MessageSegment[] {
  const segments: MessageSegment[] = []
  const inlineCodePattern = /`([^`\n]+)`/g
  let lastIndex = 0

  for (const match of text.matchAll(inlineCodePattern)) {
    const matchIndex = match.index ?? 0

    if (matchIndex > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, matchIndex) })
    }

    segments.push({ type: "inline-code", value: match[1] ?? "" })
    lastIndex = matchIndex + match[0].length
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) })
  }

  return segments
}
