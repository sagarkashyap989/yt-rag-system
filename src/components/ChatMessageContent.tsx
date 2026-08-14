import { parseMessageContent, type MessageSegment } from "@/lib/chat/formatMessage"

function groupSegments(segments: MessageSegment[]) {
  const groups: Array<
    | { type: "block"; segments: Array<Extract<MessageSegment, { type: "text" | "inline-code" }>> }
    | Extract<MessageSegment, { type: "code" }>
  > = []

  let currentInlineGroup: Array<
    Extract<MessageSegment, { type: "text" | "inline-code" }>
  > = []

  const flushInlineGroup = () => {
    if (currentInlineGroup.length === 0) return
    groups.push({ type: "block", segments: currentInlineGroup })
    currentInlineGroup = []
  }

  for (const segment of segments) {
    if (segment.type === "code") {
      flushInlineGroup()
      groups.push(segment)
      continue
    }

    currentInlineGroup.push(segment)
  }

  flushInlineGroup()
  return groups
}

export default function ChatMessageContent({
  content,
  variant = "assistant",
}: {
  content: string
  variant?: "assistant" | "user"
}) {
  if (variant === "user") {
    return <p className="whitespace-pre-wrap">{content}</p>
  }

  const groups = groupSegments(parseMessageContent(content))

  return (
    <div className="space-y-3">
      {groups.map((group, index) => {
        if (group.type === "code") {
          return (
            <div
              key={index}
              className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700"
            >
              {group.language && (
                <div className="border-b border-zinc-200 bg-zinc-200/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-400">
                  {group.language}
                </div>
              )}
              <pre className="overflow-x-auto bg-zinc-900 p-3 text-xs leading-relaxed text-zinc-100">
                <code>{group.value}</code>
              </pre>
            </div>
          )
        }

        const textContent = group.segments.map(segment => segment.value).join("")
        if (!textContent.trim()) return null

        return (
          <p key={index} className="whitespace-pre-wrap">
            {group.segments.map((segment, segmentIndex) =>
              segment.type === "inline-code" ? (
                <code
                  key={segmentIndex}
                  className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-[0.85em] text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                >
                  {segment.value}
                </code>
              ) : (
                <span key={segmentIndex}>{segment.value}</span>
              ),
            )}
          </p>
        )
      })}
    </div>
  )
}
