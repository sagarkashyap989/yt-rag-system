"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  createNewConversation,
  getConversationMessages,
  getOrCreateConversation,
  sendChatMessage,
} from "@/actions/chat"
import { SUGGESTED_QUESTIONS } from "@/lib/chat/constants"
import Header from "@/components/Header"
import ChatMessageContent from "@/components/ChatMessageContent"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  citations: Array<{
    chunkId: string
    excerpt: string
    sourceUrl: string
    label: string
  }>
  createdAt: Date
}

type ContentInfo = {
  id: string
  title: string
  description: string
  thumbnailUrl: string
  type: "video" | "article"
  url: string
}

export default function ChatInterface({
  contentId,
  startNewConversation = false,
}: {
  contentId: string
  startNewConversation?: boolean
}) {
  const [content, setContent] = useState<ContentInfo | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(() => {
    async function loadConversation() {
      setIsLoading(true)
      setError(null)

      const result = startNewConversation
        ? await createNewConversation(contentId)
        : await getOrCreateConversation(contentId)
      if ("error" in result) {
        setError(result.error ?? "Unable to load this content")
        setIsLoading(false)
        return
      }

      setContent(result.content)
      setConversationId(result.conversationId)

      const conversation = await getConversationMessages(result.conversationId)
      if ("error" in conversation) {
        setError(conversation.error ?? "Unable to load conversation")
      } else {
        setMessages(conversation.messages)
      }

      setIsLoading(false)
    }

    void loadConversation()
  }, [contentId, startNewConversation])

  useEffect(() => {
    scrollToBottom()
  }, [messages, isSending, scrollToBottom])

  const handleSend = useCallback(
    async (messageText?: string) => {
      const text = (messageText ?? input).trim()
      if (!text || !conversationId || isSending) return

      setInput("")
      setIsSending(true)
      setError(null)

      const result = await sendChatMessage(conversationId, text)
      if ("error" in result) {
        setError(result.error ?? "Something went wrong")
        setInput(text)
        setIsSending(false)
        return
      }

      setMessages(prev => [...prev, result.userMessage, result.assistantMessage])
      setIsSending(false)
    },
    [conversationId, input, isSending],
  )

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
        <Header />
        <main className="flex flex-1 items-center justify-center">
          <p className="text-sm text-zinc-500">Loading chat…</p>
        </main>
      </div>
    )
  }

  if (!content || !conversationId) {
    return (
      <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
        <Header />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
          <p className="text-sm text-red-600 dark:text-red-400">
            {error ?? "Unable to load this content."}
          </p>
          <Link
            href="/"
            className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            Back to search
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <Header />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-6 pt-4 sm:px-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="text-sm text-zinc-500 transition-colors hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            ← Back to search
          </Link>
          <Link
            href={`/content/${content.id}/chat?new=true`}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            New conversation
          </Link>
        </div>

        <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Ask questions about this content
          </p>
          <div className="flex items-start gap-4">
            <img
              src={content.thumbnailUrl}
              alt={content.title}
              className="h-20 w-32 rounded-lg object-cover bg-zinc-100 dark:bg-zinc-800"
            />
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {content.title}
              </h1>
              <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                {content.description}
              </p>
              <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
                <span className="inline-flex items-center rounded-md bg-zinc-100 px-1.5 py-0.5 font-medium capitalize dark:bg-zinc-800">
                  {content.type}
                </span>
                <a
                  href={content.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  Open original
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="flex min-h-[420px] flex-1 flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 && !isSending && (
              <div className="space-y-4">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Ask a question and the assistant will answer using this{" "}
                  {content.type} as its source.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_QUESTIONS.map(question => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => void handleSend(question)}
                      className="rounded-full border border-zinc-200 px-3 py-1.5 text-left text-xs text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(message => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                    message.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                  }`}
                >
                  <ChatMessageContent
                    content={message.content}
                    variant={message.role === "user" ? "user" : "assistant"}
                  />

                  {message.role === "assistant" &&
                    message.citations &&
                    message.citations.length > 0 && (
                      <div className="mt-3 space-y-2 border-t border-zinc-200/70 pt-3 dark:border-zinc-700">
                        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                          Sources
                        </p>
                        {message.citations.map(citation => (
                          <div
                            key={citation.chunkId}
                            className="rounded-lg bg-white/70 p-2 text-xs dark:bg-zinc-900/60"
                          >
                            <a
                              href={citation.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                            >
                              {content.title} — {citation.label}
                            </a>
                            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                              {citation.excerpt}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              </div>
            ))}

            {isSending && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-zinc-100 px-4 py-3 text-sm text-zinc-500 dark:bg-zinc-800">
                  Thinking…
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {error && (
            <div className="border-t border-zinc-200 px-4 py-3 text-sm text-red-600 dark:border-zinc-800 dark:text-red-400">
              {error}
            </div>
          )}

          <form
            className="border-t border-zinc-200 p-4 dark:border-zinc-800"
            onSubmit={event => {
              event.preventDefault()
              void handleSend()
            }}
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={event => setInput(event.target.value)}
                placeholder="Ask a question about this content…"
                disabled={isSending}
                className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
              <button
                type="submit"
                disabled={isSending || !input.trim()}
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
