"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useSession, signIn } from "@/lib/auth/client"
import Header from "@/components/Header"
import SearchResults from "@/components/SearchResults"
import { searchContent } from "@/actions/search"

export default function Home() {
  const { data: session, isPending } = useSession()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<
    Exclude<Awaited<ReturnType<typeof searchContent>>, { error: string }>
  >([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const doSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([])
      setError(null)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const searchResults = await searchContent(searchQuery)
      if (searchResults && "error" in searchResults) {
        setResults([])
        setError(searchResults.error)
      } else {
        setResults(searchResults)
      }
    } catch (err) {
      setResults([])
      setError(err instanceof Error ? err.message : "Search failed")
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleSearch = useCallback(() => {
    doSearch(query)
  }, [query, doSearch])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault()
        handleSearch()
      }
    },
    [handleSearch],
  )

  useEffect(() => {
    if (session && inputRef.current) {
      inputRef.current.focus()
    }
  }, [session])

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <Header />

      <main className="flex w-full flex-1 flex-col items-center">
        <div className="flex w-full flex-col items-center pt-16 sm:pt-24">
          <div className="w-full max-w-2xl px-4 sm:px-6">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <svg
                    className="h-5 w-5 text-zinc-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={handleChange}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    session
                      ? "Search for articles, videos, topics..."
                      : "Sign in to search"
                  }
                  disabled={!session}
                  className="block w-full rounded-xl border border-zinc-200 bg-white py-3.5 pl-11 pr-4 text-base text-zinc-900 placeholder-zinc-400 shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-blue-400 dark:focus:ring-blue-400/20"
                />
              </div>
              <button
                type="button"
                onClick={handleSearch}
                disabled={!session || !query.trim() || isLoading}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? "Searching" : "Search"}
              </button>
            </div>

            {!session && !isPending && (
              <div className="mt-6 flex flex-col items-center gap-3 text-center">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  You need to sign in to search our content
                </p>
                <button
                  onClick={() =>
                    signIn.social({ provider: "github", callbackURL: "/" })
                  }
                  className="flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  Sign in with GitHub
                </button>
              </div>
            )}

            {isLoading && (
              <div className="mt-8 flex items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
                Searching...
              </div>
            )}

            {error && (
              <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
                {error}
              </div>
            )}
          </div>
        </div>

        {results.length > 0 && (
          <div className="w-full pt-8 pb-16">
            <SearchResults results={results} />
          </div>
        )}
      </main>
    </div>
  )
}
