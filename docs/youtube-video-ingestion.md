# YouTube Video Ingestion — What Was Built & Why

This guide explains YouTube video ingest using **Vercel Workflows**, a **channel ID**, and the **youtube-transcript.io** API for captions. It pairs with [`blog-article-ingestion.md`](./blog-article-ingestion.md).

---

## Big picture

1. Load `CHANNEL_ID` from env  
2. Use YouTube Data API to list that channel’s **uploads** playlist  
3. Skip videos already in the DB (`type: "video"`)  
4. Send video IDs to `youtube-transcript.io` (up to 50 per request)  
5. Prefer the **English** track → chunk (15 segments, overlap 3) → embed via Ollama → save  

```
CHANNEL_ID → uploads playlist → new video IDs
  → transcript API (batches of ≤50)
  → English cues → chunks + embeddings → content/chunks tables
```

---

## How the channel is chosen

Not `mine: true` anymore. The code uses your env channel:

```ts
youtube.channels.list({
  part: ["contentDetails"],
  id: [serverEnv.CHANNEL_ID],
})
```

Set in `.env`:

```env
CHANNEL_ID=UCFbNIlppjAuEX4znoulh0Cw
```

Google OAuth (`GOOGLE_CLIENT_ID` / `SECRET` / `REFRESH_TOKEN`) is still used only to **list** public playlist items via `googleapis`. Captions do **not** come from YouTube’s owner-only `captions.download`.

---

## Transcript API

| Item | Value |
|------|--------|
| URL | `POST https://www.youtube-transcript.io/api/transcripts` |
| Auth | `Authorization: Basic <YOUTUBE_TRANSCRIPT_API_KEY>` |
| Body | `{ "ids": ["videoId1", ...] }` — max **50** IDs |
| Rate limit | **5 requests / 10 seconds** (honor `Retry-After` on 429) |

### Response (simplified)

Each item includes `id`, `title`, `tracks[]`, and optional `microformat` (description, thumbnail).

Each track has:

```json
{
  "language": "English",
  "transcript": [
    { "text": "...", "start": "1.2", "dur": "2.16" }
  ]
}
```

`start` is in **seconds** (string or number). We convert to **milliseconds** for `chunks.startPosition` so search deep-links stay `Math.floor(ms / 1000)`.

English is preferred (`language === "English"` or starts with `en`); otherwise the first track is used.

---

## Chunking (same idea as before)

- **Chunk size:** 15 transcript cues  
- **Overlap:** 3 cues  
- **Step:** 12  

Each chunk stores:

- `text` — joined cue text  
- `startPosition` — first cue’s start time in ms  
- `embedding` — Ollama vector  

Raw English transcript JSON is stored on `content.content`.

---

## Workflow steps

### Orchestrator

1. `getNewVideosFromPlaylist` (step) — list channel uploads, filter existing URLs  
2. Loop batches of ≤50 videos:  
   - `ingestVideoBatchStep` (step) — one transcript API call, then embed/save each video  
   - `sleep(2500)` between batches to stay under the rate limit  

### Why not 10 parallel + 9 hour wait?

That delay was for YouTube’s owner caption API. With transcript.io, one request can cover many IDs; we only need a short gap between requests.

---

## Env vars

| Var | Role |
|-----|------|
| `CHANNEL_ID` | YouTube channel to ingest |
| `YOUTUBE_TRANSCRIPT_API_KEY` | Basic token for transcript.io |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` | List public uploads via Data API |
| `LOCAL_AI_API_KEY` / `MODEL_NAME` | Ollama embeddings |

---

## Files

| File | Role |
|------|------|
| `src/workflows/ingestYouTubeVideos.ts` | Workflow (channel ID + transcript API) |
| `src/app/api/workflows/ingest-youtube-videos/route.ts` | `GET` starts the workflow |
| `src/data/serverEnv.ts` | Validates new env vars |
| `workflows.rest` | Local trigger |

---

## How to run

1. Set `CHANNEL_ID` and `YOUTUBE_TRANSCRIPT_API_KEY` in `.env`  
2. Start Ollama + `npm run dev` (restart after env changes)  
3. `GET http://localhost:3000/api/workflows/ingest-youtube-videos`  
4. Check Drizzle Studio for `content.type = video` and chunks with `startPosition` + embeddings  

Re-runs only process videos **not already** in the DB.

---

## Mental model

```
Hit ingest-youtube-videos
        ↓
Step 1: CHANNEL_ID uploads − existing video URLs
        ↓
For each batch of ≤50 IDs:
   Step: transcript.io → English cues → chunk → embed → save
   Wait ~2.5s if more batches remain
        ↓
Done
```
