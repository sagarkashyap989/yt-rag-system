import { db } from "@/db/db"
import { chunks, content } from "@/db/schema"
import { embedChunks } from "@/lib/embedding/embed-chunks"
import { and, cosineDistance, desc, eq, gt, isNotNull, sql } from "drizzle-orm"

export const DEFAULT_TOP_K = 5
export const MIN_SIMILARITY = 0.35

export type RetrievedChunk = {
  chunkId: string
  text: string
  startPosition: number | null
  similarity: number
  contentId: string
  contentTitle: string
  contentUrl: string
  contentType: "video" | "article"
}

export async function searchContentChunks({
  contentId,
  query,
  limit = DEFAULT_TOP_K,
}: {
  contentId: string
  query: string
  limit?: number
}): Promise<RetrievedChunk[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const [queryVector] = await embedChunks([trimmed.toLowerCase()])
  if (queryVector == null) return []

  const dbSimilarity = sql<number>`1 - (${cosineDistance(chunks.embedding, queryVector)})`

  const matchedChunks = await db
    .select({
      chunkId: chunks.id,
      text: chunks.text,
      startPosition: chunks.startPosition,
      similarity: dbSimilarity,
      contentId: content.id,
      contentTitle: content.title,
      contentUrl: content.url,
      contentType: content.type,
    })
    .from(chunks)
    .innerJoin(content, eq(content.id, chunks.contentId))
    .where(
      and(
        eq(chunks.contentId, contentId),
        isNotNull(chunks.embedding),
        gt(dbSimilarity, MIN_SIMILARITY),
      ),
    )
    .orderBy(desc(dbSimilarity))
    .limit(limit)

  return matchedChunks
}
