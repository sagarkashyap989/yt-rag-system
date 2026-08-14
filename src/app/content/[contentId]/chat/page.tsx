import ChatInterface from "@/components/ChatInterface"

export default async function ContentChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ contentId: string }>
  searchParams: Promise<{ new?: string }>
}) {
  const { contentId } = await params
  const { new: startNew } = await searchParams
  return (
    <ChatInterface contentId={contentId} startNewConversation={startNew === "true"} />
  )
}
