import { createEnv } from "@t3-oss/env-nextjs"
import * as z from "zod"

export const serverEnv = createEnv({
  server: {
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    GITHUB_CLIENT_ID: z.string(),
    GITHUB_CLIENT_SECRET: z.string(),
    // Ollama URL (can be base or a full path like /api/generate — we use the origin)
    LOCAL_AI_API_KEY: z.url(),
    // Must be an embedding-capable Ollama model (e.g. nomic-embed-text), not a chat model
    MODEL_NAME: z.string().min(1),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    GOOGLE_REFRESH_TOKEN: z.string().min(1),
    YOUTUBE_TRANSCRIPT_API_KEY: z.string().min(1),
    CHANNEL_ID: z.string().min(1),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive(),
    RATE_LIMIT_WINDOW_HOURS: z.coerce.number().positive(),
  },
  experimental__runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
