# Blog Article Ingestion — What Was Built & Why

This guide explains the work that was added to ingest blog posts from [Web Dev Simplified](https://blog.webdevsimplified.com) into your database using **Vercel Workflows**. It’s written for someone who knows a little about databases/migrations and nothing (yet) about workflows.

---

## Big picture

Your app needs to:

1. Read the list of all blog posts from an RSS feed  
2. Figure out which ones are **new** (not already in the database)  
3. For each new post: download the HTML, extract the article body + thumbnail, split the text into chunks, and save everything  

That work can take a long time and can fail halfway through (network errors, timeouts, etc.). A normal API request is a bad place for that. **Workflows** are designed for long, multi-step background jobs that can pause, retry, and resume.

```
RSS feed → Step 1: find new articles → Step 2 (× each article, batches of 10): fetch, chunk, save
```

---

## What is a Vercel Workflow?

Think of a workflow as a **durable script** that can run for a long time:

| Concept | What it means in plain English |
|--------|---------------------------------|
| `"use workflow"` | Marks the **orchestrator** — the function that decides *what happens next*. It should stay simple and predictable. |
| `"use step"` | Marks a **unit of real work** — fetch a URL, talk to the database, parse HTML. Steps can be retried if they fail. |
| `start(...)` from `workflow/api` | Kicks off the workflow from an API route (or cron) without waiting for the whole job to finish. |

**Why two directives?**

- The **workflow** body coordinates steps (like a recipe).
- Each **step** does one job and can be retried safely if the network or DB blips.

In this project:

- **Step 1** = get the list of articles not already in the DB  
- **Step 2** = ingest one article (fetch HTML → extract content → chunk → insert rows)

Step 2 is run many times, in **batches of 10**, so we don’t hammer the blog server.

---

## What is a migration / schema? (quick refresher)

| Term | Meaning |
|------|---------|
| **Schema** | TypeScript that *describes* your tables (columns, types, relationships). Lives under `src/db/schema/`. |
| **Migration** | SQL files that *apply* those table changes to a real database. Lives under `src/db/migrations/`. |
| **`db:push`** | Shortcut: sync your schema straight to the DB (handy in local/dev). |
| **`db:generate` / `db:migrate`** | Generate SQL from schema changes, then run those SQL files (better for production / shared teams). |

We also enabled the Postgres **`vector`** extension. That lets a column store embedding vectors later. For now that column is **nullable** and unused — embeddings are a future task.

### Tables added

**`content`** — one row per article (or later, video):

- `id`, `title`, `description`, `publishDate`, `url` (unique), `thumbnailUrl`
- `type`: `"article"` or `"video"`
- `content`: raw HTML from the article’s main body
- `createdAt` / `updatedAt`

**`chunks`** — pieces of an article used later for search:

- `id`, `contentId` (foreign key → `content`)
- `startPosition`: unused for articles (nullable; useful for videos later)
- `embedding`: vector, **nullable for now** (no embedding yet)
- `text`: plain text of the chunk
- `createdAt` / `updatedAt`

Relationship: one content row → many chunk rows.

---

## Files that were added / changed

### Database

| File | Role |
|------|------|
| `src/db/schema/content.ts` | Defines the `content` table |
| `src/db/schema/chunks.ts` | Defines the `chunks` table (`embedding` nullable) |
| `src/db/utils.ts` | Shared `id` + `createdAt`/`updatedAt` helpers |
| `src/db/schema.ts` | Re-exports auth + content + chunks schemas |
| `src/db/relations.ts` | Tells Drizzle that content ↔ chunks are related |
| `src/db/migrations/.../migration.sql` | SQL to create enum/tables/indexes/FK (+ enable `vector`) |

### Chunking (no AI, just text splitting)

| File | Role |
|------|------|
| `src/lib/chunking/chunkArticles.ts` | Splits article HTML into plain-text chunks by `<h2>` |
| `src/lib/chunking/chunkArticles.test.ts` | Unit tests for that splitter |

**Chunking rules:**

1. Only **text** is kept — no HTML tags in the saved chunk.  
2. Text `<h2>` starts a new chunk; the heading text is the start of that chunk.  
3. Everything **before the first `<h2>`** becomes its own intro chunk (most posts start that way).  
4. Text between one `<h2>` and the next goes in that section’s chunk.

### Workflow

| File | Role |
|------|------|
| `src/workflows/ingestBlogArticles.ts` | The 2-step workflow (RSS → per-article ingest) |
| `src/workflows/utils/batchExec.ts` | Runs work in batches of 10 (default) |
| `src/app/api/workflows/ingest-blog-articles/route.ts` | HTTP endpoint that **starts** the workflow |

### Wiring / tooling

| File | Role |
|------|------|
| `next.config.ts` | Wrapped with `withWorkflow()` so `"use workflow"` / `"use step"` work |
| `tsconfig.json` | Adds the `workflow` TypeScript plugin |
| `package.json` | Adds `workflow`, `cheerio`, `rss-parser`, `vitest`, test scripts |
| `vercel.json` | Cron: hit the ingest route weekly (Tuesdays at midnight UTC) |
| `workflows.rest` | Easy local request to trigger ingest |
| `.gitignore` | Ignores `/.swc` (used by the workflow toolchain) |

---

## What the workflow code does (step by step)

### Entry: API route

`GET /api/workflows/ingest-blog-articles` calls:

```ts
start(ingestBlogArticlesWorkflow)
```

That returns quickly with a `runId`. The real work continues in the background as a workflow run.

### Workflow orchestrator

```ts
export async function ingestBlogArticlesWorkflow() {
  "use workflow"
  const newArticles = await getNewArticlesFromRssFeed() // Step 1
  return await batchExec(newArticles, ingestArticleStep) // Step 2 × N, batches of 10
}
```

### Step 1 — `getNewArticlesFromRssFeed`

1. Download and parse `https://blog.webdevsimplified.com/rss.xml`  
2. Load existing article URLs from the `content` table (`type = "article"`)  
3. Return only feed items whose `link` is **not** already stored  

### Step 2 — `ingestArticleStep` (one article)

1. Validate title, description, link, publish date  
2. `fetch` the article HTML  
3. With Cheerio:
   - body: contents of `article main`
   - thumbnail: Open Graph image (`og:image`, fallback `twitter:image`)  
4. Run `chunkArticles(mainHtml)` → array of plain-text strings  
5. Insert one `content` row (`type: "article"`, raw HTML in `content`)  
6. Insert one `chunks` row per chunk (`embedding: null`, `startPosition: null`)  

If the URL was somehow inserted already, insert is skipped (`onConflictDoNothing`) and the step fails fatally as a duplicate — so retries don’t create messy duplicates.

### Batching — `batchExec`

- Takes the list of new articles  
- Processes them **10 at a time** with `Promise.allSettled`  
- Counts succeeded vs failed  
- Optional delay between batches (not used for blogs; YouTube ingest may use a long delay later)

---

## Process used to build this

1. **Understood the goal**  
   Two durable steps, RSS discovery, HTML extraction, h2 chunking, **no embeddings**, save to `content` + `chunks`.

2. **Looked at the existing app**  
   Auth + Drizzle + Neon were already set up on the `dev` branch. Schema only had auth tables so far.

3. **Modeled the database**  
   Added TypeScript schema for `content` and `chunks`, relations, shared id/timestamp helpers. Kept `embedding` nullable on purpose.

4. **Enabled pgvector + applied schema**  
   Neon needed `CREATE EXTENSION vector` before a `vector(...)` column could exist. Then `drizzle-kit push` created the tables. A SQL migration was generated (and the extension line was added so future migrates work on a fresh DB).

5. **Built chunking in isolation**  
   Wrote `chunkArticles` + Vitest tests first so heading/intro edge cases were correct before wiring the network/DB workflow.

6. **Built the workflow**  
   Step 1 (RSS + DB filter) → Step 2 (fetch/parse/save) → `batchExec` for concurrency control.

7. **Exposed a trigger**  
   Simple GET route + `workflows.rest` + weekly Vercel cron entry.

8. **Wired the Workflow SDK**  
   Installed `workflow`, wrapped Next config with `withWorkflow`, added the TS plugin.

9. **Verified**  
   Ran unit tests (16 passing) and typecheck; confirmed schema push succeeded.

---

## How to run it yourself

1. Make sure `.env` has a valid `DATABASE_URL` (and your other existing auth vars).  
2. Restart the Next.js server after the workflow config change:
   ```bash
   npm run dev
   ```
3. Trigger ingest:
   - Open `workflows.rest` and send the GET, **or**
   - Visit / request: `http://localhost:3000/api/workflows/ingest-blog-articles`
4. Inspect rows in the DB (e.g. `npm run db:studio`) — you should see `content` articles and related `chunks` with empty embeddings.
5. Optional: re-run chunking tests anytime:
   ```bash
   npm test
   ```

---

## What was intentionally *not* done

- **No YouTube ingest** — same workflow pattern can be reused later for videos.  
- **No cron auth secret yet** — the route starts the workflow on GET; you can lock it down later with something like `CRON_SECRET` before production.

---

## Embeddings (added later)

During article ingest, each chunk’s text is sent to **local Ollama** via `POST /api/embed`.

| Env var | Meaning |
|--------|---------|
| `LOCAL_AI_API_KEY` | Your Ollama URL (even if it ends in `/api/generate`, the app uses only the origin, e.g. `http://localhost:11434`) |
| `MODEL_NAME` | Embedding model name in Ollama — must support embeddings |

**Important:** `qwen2.5` is a **chat** model (`/api/generate`). It cannot produce embeddings. This project uses `nomic-embed-text` (768 dimensions), which you already had installed in Ollama.

Flow inside Step 2:

```
chunk texts → embedChunks() → Ollama /api/embed → save vectors on chunks.embedding
```

---

## Mental model cheat sheet

```
You hit the API route
        ↓
Workflow starts (durable job)
        ↓
Step 1: RSS − already-saved URLs = work list
        ↓
For each batch of 10 articles:
   Step 2: fetch HTML → extract main + thumbnail → chunk by h2
           → embed chunks via Ollama → save content + chunks
        ↓
Done
```

If something fails mid-way, steps can retry; articles already saved are skipped next time because Step 1 filters by existing URLs.
