import { google, youtube_v3 } from "googleapis"
import { db } from "@/db/db"
import { content } from "@/db/schema/content"
import { chunks } from "@/db/schema/chunks"
import { serverEnv } from "@/data/serverEnv"
import { FatalError, sleep } from "workflow"
import { embedChunks } from "@/lib/embedding/embed-chunks"
import z from "zod"

const chunkSize = 15
const overlapSize = 3
const segmentStep = chunkSize - overlapSize

/** Transcript API allows 50 IDs per request; stay under 5 requests / 10s */
const transcriptBatchSize = 50
const transcriptRequestGapMs = 2500

const transcriptCueSchema = z.object({
  text: z.string(),
  start: z.union([z.string(), z.number()]),
  dur: z.union([z.string(), z.number()]).optional(),
})

const transcriptTrackSchema = z.object({
  language: z.string(),
  transcript: z.array(transcriptCueSchema),
})

const transcriptVideoSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  text: z.string().optional(),
  tracks: z.array(transcriptTrackSchema).default([]),
  microformat: z
    .object({
      playerMicroformatRenderer: z
        .object({
          description: z
            .object({
              simpleText: z.string().optional(),
            })
            .optional(),
          thumbnail: z
            .object({
              thumbnails: z
                .array(
                  z.object({
                    url: z.string(),
                  }),
                )
                .optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
})

const playlistVideoSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  publishedAt: z.coerce.date(),
  thumbnailUrl: z.url(),
})

type PlaylistVideo = z.infer<typeof playlistVideoSchema>

export async function ingestYouTubeVideosWorkflow() {
  "use workflow"

  const newVideos = await getNewVideosFromPlaylist()

  let succeeded = 0
  let failed = 0

  for (let i = 0; i < newVideos.length; i += transcriptBatchSize) {
    const batch = newVideos.slice(i, i + transcriptBatchSize)
    const result = await ingestVideoBatchStep(batch)
    succeeded += result.succeeded
    failed += result.failed

    if (i + transcriptBatchSize < newVideos.length) {
      await sleep(transcriptRequestGapMs)
    }
  }

  return { total: newVideos.length, succeeded, failed }
}

async function getNewVideosFromPlaylist() {
  "use step"

  const playlistItems = await getPlaylistItems()

  const existingUrls = await db.query.content
    .findMany({
      where: { type: "video" },
      columns: { url: true },
    })
    .then(data => data.map(r => r.url))

  const videos: PlaylistVideo[] = []

  for (const item of playlistItems) {
    const parsed = playlistVideoSchema.safeParse({
      id: item.contentDetails?.videoId,
      title: item.snippet?.title,
      description: item.snippet?.description ?? "",
      publishedAt: item.snippet?.publishedAt,
      thumbnailUrl: item.snippet?.thumbnails?.high?.url,
    })

    if (!parsed.success) continue

    const url = `https://www.youtube.com/watch?v=${parsed.data.id}`
    if (!existingUrls.includes(url)) {
      videos.push(parsed.data)
    }
  }

  return videos
}

async function getPlaylistItems() {
  const oauth2Client = createOAuth2Client()
  const youtube = google.youtube({ version: "v3", auth: oauth2Client })

  const channelDetails = await youtube.channels.list({
    part: ["contentDetails"],
    id: [serverEnv.CHANNEL_ID],
  })

  const uploadsPlaylistId =
    channelDetails.data?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads

  if (uploadsPlaylistId == null) {
    throw new FatalError(
      `Could not find uploads playlist for channel ${serverEnv.CHANNEL_ID}`,
    )
  }

  const allItems: youtube_v3.Schema$PlaylistItem[] = []
  let nextPageToken: string | undefined

  do {
    const response = await youtube.playlistItems.list({
      part: ["snippet", "contentDetails", "status"],
      playlistId: uploadsPlaylistId,
      maxResults: 50,
      pageToken: nextPageToken,
    })

    const items = response.data.items ?? []
    allItems.push(
      ...items.filter(item => {
        const status = item.status?.privacyStatus
        return status == null || status === "public"
      }),
    )

    nextPageToken = response.data.nextPageToken ?? undefined
  } while (nextPageToken != null)

  return allItems
}

function createOAuth2Client() {
  const oauth2Client = new google.auth.OAuth2(
    serverEnv.GOOGLE_CLIENT_ID,
    serverEnv.GOOGLE_CLIENT_SECRET,
    "http://localhost",
  )
  oauth2Client.setCredentials({
    refresh_token: serverEnv.GOOGLE_REFRESH_TOKEN,
  })
  return oauth2Client
}

async function ingestVideoBatchStep(videos: PlaylistVideo[]) {
  "use step"

  if (videos.length === 0) {
    return { succeeded: 0, failed: 0 }
  }

  const transcriptsById = await fetchTranscripts(videos.map(v => v.id))

  let succeeded = 0
  let failed = 0

  for (const video of videos) {
    try {
      await ingestOneVideo(video, transcriptsById.get(video.id))
      succeeded++
    } catch (error) {
      failed++
      console.error(`Failed to ingest video ${video.id}:`, error)
    }
  }

  return { succeeded, failed }
}

async function fetchTranscripts(ids: string[]) {
  const response = await fetch(
    "https://www.youtube-transcript.io/api/transcripts",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${serverEnv.YOUTUBE_TRANSCRIPT_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids }),
    },
  )

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("Retry-After") ?? "10")
    throw new Error(
      `Transcript API rate limited. Retry after ${retryAfter} seconds`,
    )
  }

  if (!response.ok) {
    const body = await response.text()
    throw new Error(
      `Transcript API failed (${response.status}): ${body || response.statusText}`,
    )
  }

  const raw = await response.json()
  const parsed = z.array(transcriptVideoSchema).safeParse(raw)

  if (!parsed.success) {
    throw new FatalError(
      `Unexpected transcript API response shape: ${parsed.error.message}`,
    )
  }

  return new Map(parsed.data.map(item => [item.id, item]))
}

async function ingestOneVideo(
  video: PlaylistVideo,
  transcriptResult: z.infer<typeof transcriptVideoSchema> | undefined,
) {
  const videoUrl = `https://www.youtube.com/watch?v=${video.id}`

  if (transcriptResult == null) {
    throw new FatalError(`No transcript returned for ${videoUrl}`)
  }

  const englishTrack =
    transcriptResult.tracks.find(
      track => track.language.toLowerCase() === "english",
    ) ??
    transcriptResult.tracks.find(track =>
      track.language.toLowerCase().startsWith("en"),
    ) ??
    transcriptResult.tracks[0]

  if (englishTrack == null || englishTrack.transcript.length === 0) {
    throw new FatalError(`No caption track available for ${videoUrl}`)
  }

  const segments = englishTrack.transcript
    .map(cue => ({
      text: cue.text.replace(/\n/g, " ").trim(),
      // API start is seconds; store ms for search deep-links (&t=ms/1000)
      startTime: Math.round(Number(cue.start) * 1000),
    }))
    .filter(seg => seg.text.length > 0)

  if (segments.length === 0) {
    throw new FatalError(`No valid caption segments for ${videoUrl}`)
  }

  const videoChunks: { text: string; startPosition: number }[] = []
  for (let i = 0; i < segments.length; i += segmentStep) {
    const end = Math.min(i + chunkSize, segments.length)
    if (end - i < 1) continue

    const chunkSegments = segments.slice(i, end)
    videoChunks.push({
      text: chunkSegments.map(seg => seg.text).join(" "),
      startPosition: chunkSegments[0].startTime,
    })
  }

  const embeddings = await embedChunks(videoChunks.map(chunk => chunk.text))

  const micro = transcriptResult.microformat?.playerMicroformatRenderer
  const thumbnailUrl =
    micro?.thumbnail?.thumbnails?.at(-1)?.url ?? video.thumbnailUrl
  const description =
    micro?.description?.simpleText ?? video.description
  const title = transcriptResult.title ?? video.title

  const [contentRow] = await db
    .insert(content)
    .values({
      type: "video",
      title,
      description,
      publishDate: video.publishedAt,
      url: videoUrl,
      thumbnailUrl,
      content: JSON.stringify(englishTrack.transcript),
    })
    .onConflictDoNothing()
    .returning({ id: content.id })

  if (contentRow?.id == null) {
    throw new FatalError(
      `Duplicate detected and failed to insert - ${videoUrl}`,
    )
  }

  if (videoChunks.length > 0) {
    await db.insert(chunks).values(
      videoChunks.map((chunk, i) => ({
        contentId: contentRow.id,
        startPosition: chunk.startPosition,
        embedding: embeddings[i],
        text: chunk.text,
      })),
    )
  }
}
