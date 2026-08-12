import { serverEnv } from "@/data/serverEnv"

function getOllamaBaseUrl(localAiUrl: string) {
  return new URL(localAiUrl).origin
}

export async function embedChunks(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  const baseUrl = getOllamaBaseUrl(serverEnv.LOCAL_AI_API_KEY)
  const response = await fetch(`${baseUrl}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: serverEnv.MODEL_NAME,
      input: texts,
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(
      `Ollama embed failed (${response.status}): ${errorBody || response.statusText}`,
    )
  }

  const data = (await response.json()) as { embeddings?: number[][] }

  if (!data.embeddings || data.embeddings.length !== texts.length) {
    throw new Error(
      `Ollama embed returned ${data.embeddings?.length ?? 0} vectors for ${texts.length} texts`,
    )
  }

  return data.embeddings
}
