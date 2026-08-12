"use server"

import { db } from "@/db/db"
import { chunks, content, userSearches } from "@/db/schema"
import { and, eq, sql, gt, desc, cosineDistance, isNotNull } from "drizzle-orm"
import { embedChunks } from "@/lib/embedding/embed-chunks"
import { auth } from "@/lib/auth/config"
import { headers } from "next/headers"
import { checkRateLimit, RateLimitError } from "@/lib/rateLimit"

export async function searchContent(query: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return []

  const trimmed = query.trim()
  if (!trimmed) return []

  try {
    await checkRateLimit(session.user.id)
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { error: error.message }
    }
    return { error: "Rate limit exceeded" }
  }

  const [queryVector] = await embedChunks([trimmed.toLowerCase()])
  if (queryVector == null) return []

  const dbSimilarity = sql<number>`1 - (${cosineDistance(chunks.embedding, queryVector)})`

  const matchedChunks = await db
    .selectDistinctOn([content.id], {
      id: content.id,
      title: content.title,
      description: content.description,
      thumbnailUrl: content.thumbnailUrl,
      url: content.url,
      publishDate: content.publishDate,
      type: content.type,
      similarity: dbSimilarity,
      startPosition: chunks.startPosition,
      rawText: chunks.text,
    })
    .from(chunks)
    .innerJoin(content, eq(content.id, chunks.contentId))
    .where(and(isNotNull(chunks.embedding), gt(dbSimilarity, 0.5)))
    .orderBy(content.id, desc(dbSimilarity))

  const sortedResults = matchedChunks
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 20)

  await db.insert(userSearches).values({
    queryText: trimmed,
    userId: session.user.id,
    resultContentIds: sortedResults.map(r => r.id),
  })

  return sortedResults
}
