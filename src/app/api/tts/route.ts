import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { clampNeuralSpeed, resolveNeuralVoice } from "@/lib/tts-voices";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_CHARS = 2000;

type TtsInput = {
  text: string;
  voice: string;
  speed: number;
};

function etagFor(input: TtsInput) {
  return `"${createHash("sha1").update(`${input.voice}|${input.speed}|${input.text}`).digest("hex")}"`;
}

function parseInput(request: NextRequest, body?: Partial<TtsInput>): TtsInput | null {
  const fromBody = body?.text?.trim();
  const fromQuery = request.nextUrl.searchParams.get("text")?.trim();
  const text = (fromBody || fromQuery || "").slice(0, MAX_CHARS);
  if (!text) return null;

  const voice = resolveNeuralVoice(body?.voice ?? request.nextUrl.searchParams.get("voice"));
  const speedRaw = body?.speed ?? request.nextUrl.searchParams.get("speed");
  const speed = clampNeuralSpeed(typeof speedRaw === "number" ? speedRaw : Number(speedRaw));

  return { text, voice, speed };
}

async function synthesizeStream(input: TtsInput) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(input.voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(input.text, { rate: input.speed });

  audioStream.on("close", () => tts.close());
  audioStream.on("error", () => tts.close());

  return audioStream;
}

function ttsResponse(input: TtsInput, request: NextRequest) {
  const etag = etagFor(input);
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=3600",
      },
    });
  }

  return synthesizeStream(input)
    .then((audioStream) => {
      const webStream = Readable.toWeb(audioStream) as ReadableStream<Uint8Array>;
      return new Response(webStream, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=3600",
          ETag: etag,
        },
      });
    })
    .catch((error: unknown) => {
      console.error("[TTS API]", error instanceof Error ? error.message : error);
      return NextResponse.json({ error: "TTS synthesis failed" }, { status: 502 });
    });
}

export async function GET(request: NextRequest) {
  const input = parseInput(request);
  if (!input) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  return ttsResponse(input, request);
}

export async function POST(request: NextRequest) {
  let body: Partial<TtsInput> = {};
  try {
    body = (await request.json()) as Partial<TtsInput>;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const input = parseInput(request, body);
  if (!input) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  return ttsResponse(input, request);
}
