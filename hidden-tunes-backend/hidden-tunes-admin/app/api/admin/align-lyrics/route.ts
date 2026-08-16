import { NextRequest, NextResponse } from "next/server";

import {
  alignLyricsToWordTimestamps,
  type TimedTranscriptWord,
} from "@/lib/audioLyricAlignment";
import { requireUploadPermission } from "@/lib/requireUploadPermission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_LYRICS_CHARACTERS = 200_000;
const OPENAI_TRANSCRIPTION_URL =
  "https://api.openai.com/v1/audio/transcriptions";
const MAX_CONCURRENT_ALIGNMENTS = 2;
let activeAlignments = 0;
const alignmentWaiters: Array<() => void> = [];

type OpenAITranscriptionResponse = {
  words?: TimedTranscriptWord[];
  usage?: { type?: string; seconds?: number };
};

async function acquireAlignmentSlot() {
  if (activeAlignments >= MAX_CONCURRENT_ALIGNMENTS) {
    await new Promise<void>((resolve) => alignmentWaiters.push(resolve));
  }
  activeAlignments += 1;
  return () => {
    activeAlignments = Math.max(0, activeAlignments - 1);
    alignmentWaiters.shift()?.();
  };
}

function failure(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(request: NextRequest) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;
  if (process.env.ADMIN_AUDIO_LYRIC_ALIGNMENT_ENABLED !== "true") {
    return failure("Automatic lyric alignment is disabled.", 503);
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return failure("Automatic lyric alignment is unavailable.", 503);

  let body: FormData;
  try {
    body = await request.formData();
  } catch {
    return failure("Expected multipart audio and plain lyrics.", 400);
  }

  const audio = body.get("audio");
  const plainLyrics = String(body.get("plainLyrics") || "").trim();
  if (!(audio instanceof File) || !plainLyrics)
    return failure("Audio and plain lyrics are required.", 400);
  if (audio.size > MAX_AUDIO_BYTES)
    return failure("Audio exceeds the 25 MB alignment limit.", 413);
  if (plainLyrics.length > MAX_LYRICS_CHARACTERS)
    return failure("Plain lyrics exceed the alignment limit.", 413);

  const release = await acquireAlignmentSlot();
  try {
    const providerBody = new FormData();
    providerBody.set("file", audio, audio.name || "audio");
    providerBody.set("model", "whisper-1");
    providerBody.set("response_format", "verbose_json");
    providerBody.append("timestamp_granularities[]", "word");
    const response = await fetch(OPENAI_TRANSCRIPTION_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: providerBody,
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    if (!response.ok)
      return failure(
        "The transcription provider could not align this item.",
        502,
      );

    const transcription =
      (await response.json()) as OpenAITranscriptionResponse;
    const alignment = alignLyricsToWordTimestamps(
      plainLyrics,
      transcription.words || [],
    );
    const processedAudioSeconds =
      transcription.usage?.type === "duration"
        ? transcription.usage.seconds
        : undefined;
    if (!alignment.ok || !alignment.lrcText) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Alignment confidence was too low; plain lyrics were retained.",
          reason: alignment.reason,
          confidence: alignment.confidence,
          verified: false,
          processedAudioSeconds,
        },
        { status: 422 },
      );
    }
    return NextResponse.json({
      success: true,
      lrcText: alignment.lrcText,
      confidence: alignment.confidence,
      verified: false,
      source: "automatic",
      processedAudioSeconds,
    });
  } catch {
    return failure(
      "Automatic alignment failed; plain lyrics were retained.",
      502,
    );
  } finally {
    release();
  }
}
