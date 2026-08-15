export type CitationInput = {
  type: "video" | "article"
  title: string
  url: string
  rawText: string
  startPosition: number | null
}

export function getChunkSourceUrl(input: {
  type: "video" | "article"
  url: string
  rawText: string
  startPosition: number | null
}): string {
  switch (input.type) {
    case "article": {
      const splitText = input.rawText.split("\n").filter(Boolean)
      if (splitText.length <= 1) {
        return `${input.url}#:~:text=${encodeURIComponent(splitText[0] ?? "")}`
      }
      return `${input.url}#:~:text=${encodeURIComponent(splitText[0])},${encodeURIComponent(splitText.at(-1) ?? "")}`
    }
    case "video":
      return `${input.url}&t=${Math.floor((input.startPosition ?? 0) / 1000)}`
    default:
      throw new Error(`Unsupported content type ${input.type satisfies never}`)
  }
}

export function formatVideoTimestamp(startPositionMs: number): string {
  const totalSeconds = Math.floor(startPositionMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

export function getArticleSectionHeading(rawText: string): string | null {
  const firstLine = rawText.split("\n").filter(Boolean)[0]
  if (!firstLine) return null
  if (firstLine.length > 120) return null
  return firstLine
}

export function buildCitationLabel(input: CitationInput): string {
  if (input.type === "video" && input.startPosition != null) {
    return formatVideoTimestamp(input.startPosition)
  }

  const heading = getArticleSectionHeading(input.rawText)
  if (heading) return heading

  const excerpt = input.rawText.trim().slice(0, 60)
  return excerpt.length < input.rawText.trim().length ? `${excerpt}…` : excerpt
}

export function buildCitation(input: CitationInput & { chunkId: string }) {
  const excerpt = input.rawText.trim().slice(0, 160)
  const label = buildCitationLabel(input)

  return {
    chunkId: input.chunkId,
    excerpt: excerpt.length < input.rawText.trim().length ? `${excerpt}…` : excerpt,
    sourceUrl: getChunkSourceUrl(input),
    label,
  }
}
