import { start } from "workflow/api"
import { ingestYouTubeVideosWorkflow } from "@/workflows/ingestYouTubeVideos"
import { NextResponse } from "next/server"

export async function GET() {
  const run = await start(ingestYouTubeVideosWorkflow)

  return NextResponse.json({
    message: "YouTube video ingestion workflow started",
    runId: run.runId,
  })
}
