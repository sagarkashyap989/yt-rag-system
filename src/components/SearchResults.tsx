"use client"

import Link from "next/link"
import { searchContent } from "@/actions/search"
import { getChunkSourceUrl } from "@/lib/content/citations"

type Result = Exclude<
  Awaited<ReturnType<typeof searchContent>>,
  { error: string }
>

export default function SearchResults({ results }: { results: Result }) {
  if (results.length === 0) return null

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 px-4 sm:px-6">
      <p className="text-sm text-zinc-500">
        {results.length} result{results.length !== 1 ? "s" : ""} found
      </p>
      {results.map(result => (
        <div
          key={result.id}
          className="group flex items-start gap-4 rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
        >
          <a
            href={getChunkSourceUrl(result)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0"
          >
            <img
              src={result.thumbnailUrl}
              alt={result.title}
              className="h-24 w-40 rounded-lg object-cover bg-zinc-100 dark:bg-zinc-800"
              loading="lazy"
            />
          </a>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-4">
              <a
                href={getChunkSourceUrl(result)}
                target="_blank"
                rel="noopener noreferrer"
                className="line-clamp-2 text-sm font-medium text-zinc-900 group-hover:text-blue-600 dark:text-zinc-100 dark:group-hover:text-blue-400"
              >
                {result.title}
              </a>
              <span className="flex-shrink-0 text-sm font-semibold text-green-600 dark:text-green-400">
                {Math.round(result.similarity * 100)}% match
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
              {result.description}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
              <span className="inline-flex items-center rounded-md bg-zinc-100 px-1.5 py-0.5 font-medium capitalize dark:bg-zinc-800">
                {result.type}
              </span>
              <span>
                {result.publishDate.toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={getChunkSourceUrl(result)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Open source
              </a>
              <Link
                href={`/content/${result.id}/chat`}
                className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
              >
                Ask about this
              </Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
