import {
  collapseRepeatedSpeech,
  englishSpeechLine,
  isRedundantSpeechChunk,
} from "@/lib/language";
import type { ChatApiResponse } from "@/types/chat";

export type ChatStreamEvent =
  | { type: "caption"; text: string; translation?: string }
  | { type: "sentence"; text: string }
  | { type: "done"; payload: ChatApiResponse }
  | { type: "metrics"; metrics: import("@/lib/pipeline-latency").PipelineServerMetrics };

export function extractJsonStringField(partialJson: string, field: string, requireClosed = false) {
  const key = `"${field}"`;
  const keyIndex = partialJson.indexOf(key);
  if (keyIndex < 0) return "";
  let index = keyIndex + key.length;
  while (index < partialJson.length && /[\s:]/.test(partialJson[index])) index += 1;
  if (partialJson[index] !== '"') return "";
  index += 1;

  let out = "";
  while (index < partialJson.length) {
    const char = partialJson[index];
    if (char === "\\") {
      const next = partialJson[index + 1];
      if (next == null) return requireClosed ? "" : out;
      const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", '"': '"', "\\": "\\", "/": "/" };
      out += escapes[next] ?? next;
      index += 2;
      continue;
    }
    if (char === '"') return out;
    out += char;
    index += 1;
  }
  // Unclosed string — still streaming. Callers that need a finished caption should skip.
  return requireClosed ? "" : out;
}

function hasSpeakableLetters(text: string) {
  return /[\p{L}\p{N}]/u.test(text);
}

export function pullEarlySpeakableChunk(text: string, alreadyConsumed: number, minWords = 2) {
  const pending = text.slice(alreadyConsumed);
  if (!pending.trim()) return { chunk: "", consumed: alreadyConsumed };

  // Prefer a finished clause (. ! ? ,) — otherwise wait for minWords for ultra-low latency.
  const punctuationIndex = pending.search(/[.!?…]/);
  if (punctuationIndex >= 0) {
    const clause = collapseRepeatedSpeech(pending.slice(0, punctuationIndex + 1).trim());
    if (clause && hasSpeakableLetters(clause)) {
      return { chunk: clause, consumed: alreadyConsumed + punctuationIndex + 1 };
    }
  }

  const words = [...pending.matchAll(/[\p{L}\p{N}'’]+/gu)];
  if (words.length < minWords) return { chunk: "", consumed: alreadyConsumed };

  const take = Math.min(4, words.length);
  const boundary = words[take - 1];
  const end = (boundary.index ?? 0) + boundary[0].length;
  const chunk = collapseRepeatedSpeech(pending.slice(0, end));
  if (!chunk || !hasSpeakableLetters(chunk)) return { chunk: "", consumed: alreadyConsumed };

  return { chunk, consumed: alreadyConsumed + end };
}

export function pullSpeakableChunks(text: string, alreadyConsumed: number) {
  const pending = text.slice(alreadyConsumed);
  const chunks: string[] = [];
  let consumed = alreadyConsumed;

  // Speak only when a full sentence ends — commas alone must not cut mid-thought.
  const pattern = /[.!?…](?:["')\]]+)?(?:\s+|$)/g;
  let match: RegExpExecArray | null;
  let last = 0;

  while ((match = pattern.exec(pending))) {
    const end = match.index + match[0].length;
    const piece = collapseRepeatedSpeech(pending.slice(last, end));
    consumed = alreadyConsumed + end;
    last = end;
    if (!piece || !hasSpeakableLetters(piece)) continue;
    if (chunks.some((prev) => isRedundantSpeechChunk(piece, prev))) continue;
    chunks.push(piece);
  }

  return { chunks, consumed };
}

export function leftoverSpeakable(text: string, alreadyConsumed: number) {
  return collapseRepeatedSpeech(text.slice(alreadyConsumed).trim());
}

export function speakableSentences(text: string) {
  const clean = collapseRepeatedSpeech(englishSpeechLine(text));
  const pulled = pullSpeakableChunks(clean, 0);
  const leftover = leftoverSpeakable(clean, pulled.consumed);
  const chunks = [...pulled.chunks];
  if (leftover && hasSpeakableLetters(leftover) && !chunks.some((prev) => isRedundantSpeechChunk(leftover, prev))) {
    chunks.push(leftover);
  }

  const out: string[] = [];
  let spoken = "";
  for (const chunk of chunks) {
    const piece = collapseRepeatedSpeech(chunk);
    if (!piece || isRedundantSpeechChunk(piece, spoken)) continue;
    out.push(piece);
    spoken = spoken ? `${spoken} ${piece}` : piece;
  }
  return out;
}

export function encodeSse(event: ChatStreamEvent) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function consumeChatStream(
  response: Response,
  live?: {
    onCaption?: (text: string, translation: string) => void;
    onSentence?: (text: string) => void;
    onFirstChunk?: () => void;
    onMetrics?: (metrics: import("@/lib/pipeline-latency").PipelineServerMetrics) => void;
  },
): Promise<ChatApiResponse> {
  if (!response.body) {
    throw new Error("Chat stream missing body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let payload: ChatApiResponse | null = null;
  let spoken = "";
  let lastCaption = "";
  let sawFirstChunk = false;

  const markFirst = () => {
    if (sawFirstChunk) return;
    sawFirstChunk = true;
    live?.onFirstChunk?.();
  };

  const handleEvent = (raw: string) => {
    const line = raw
      .split("\n")
      .map((item) => item.trim())
      .find((item) => item.startsWith("data:"));
    if (!line) return;
    try {
      const parsed = JSON.parse(line.slice(5).trim()) as ChatStreamEvent;
      if (parsed.type === "caption") {
        markFirst();
        lastCaption = collapseRepeatedSpeech(parsed.text);
        const translation = (parsed.translation ?? "").trim();
        live?.onCaption?.(lastCaption, translation);
      } else if (parsed.type === "sentence") {
        markFirst();
        const clean = collapseRepeatedSpeech(englishSpeechLine(parsed.text));
        if (!clean || isRedundantSpeechChunk(clean, spoken)) return;
        spoken = spoken ? `${spoken} ${clean}` : clean;
        live?.onSentence?.(clean);
      } else if (parsed.type === "metrics") {
        live?.onMetrics?.(parsed.metrics);
      } else if (parsed.type === "done") {
        markFirst();
        payload = parsed.payload;
        lastCaption = collapseRepeatedSpeech(parsed.payload.aiResponse);
        live?.onCaption?.(lastCaption, parsed.payload.translation ?? "");
        if (parsed.payload.latency) live?.onMetrics?.(parsed.payload.latency);
      }
    } catch {
      /* ignore a truncated SSE frame; the next read will complete it */
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      if (part.trim()) handleEvent(part);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) handleEvent(buffer);

  if (!payload) {
    if (!lastCaption && !spoken) throw new Error("Chat stream ended empty");
    payload = {
      aiResponse: lastCaption || spoken,
      translation: "",
      grammarAnalysis: { hasError: false, explanation: "", correctedText: "" },
      suggestedAnswers: [],
      newMemories: [],
    };
    live?.onCaption?.(payload.aiResponse, "");
  }
  return payload;
}
