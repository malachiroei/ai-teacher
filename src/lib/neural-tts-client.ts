"use client";

import { clampNeuralSpeed, resolveNeuralVoice, type NeuralTtsVoice } from "@/lib/tts-voices";

const MAX_CACHE_ENTRIES = 24;
const GET_URL_TEXT_LIMIT = 1200;

const audioCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function cacheKey(text: string, voice: NeuralTtsVoice, speed: number) {
  return `${voice}|${speed.toFixed(2)}|${text}`;
}

function trimCache() {
  while (audioCache.size > MAX_CACHE_ENTRIES) {
    const oldest = audioCache.keys().next().value;
    if (!oldest) break;
    const url = audioCache.get(oldest);
    if (url) URL.revokeObjectURL(url);
    audioCache.delete(oldest);
  }
}

export function buildNeuralTtsRequest(text: string, voice: string, speed: number) {
  const resolvedVoice = resolveNeuralVoice(voice);
  const resolvedSpeed = clampNeuralSpeed(speed);
  const trimmed = text.trim();
  if (!trimmed) throw new Error("empty text");

  if (trimmed.length <= GET_URL_TEXT_LIMIT) {
    const params = new URLSearchParams({
      text: trimmed,
      voice: resolvedVoice,
      speed: String(resolvedSpeed),
    });
    return { url: `/api/tts?${params.toString()}`, method: "GET" as const, body: undefined };
  }

  return {
    url: "/api/tts",
    method: "POST" as const,
    body: JSON.stringify({ text: trimmed, voice: resolvedVoice, speed: resolvedSpeed }),
  };
}

export async function fetchNeuralAudioUrl(
  text: string,
  voice: string,
  speed: number,
  signal?: AbortSignal,
): Promise<string> {
  const resolvedVoice = resolveNeuralVoice(voice);
  const resolvedSpeed = clampNeuralSpeed(speed);
  const trimmed = text.trim();
  if (!trimmed) throw new Error("empty text");

  const key = cacheKey(trimmed, resolvedVoice, resolvedSpeed);
  const cached = audioCache.get(key);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = buildNeuralTtsRequest(trimmed, resolvedVoice, resolvedSpeed);
  const task = (async () => {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.body ? { "Content-Type": "application/json" } : undefined,
      body: request.body,
      signal,
      cache: "force-cache",
    });
    if (!response.ok) {
      throw new Error(`Neural TTS ${response.status}`);
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error("Neural TTS empty audio");
    const objectUrl = URL.createObjectURL(blob);
    audioCache.set(key, objectUrl);
    trimCache();
    return objectUrl;
  })();

  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}

export function preloadNeuralAudio(text: string, voice: string, speed: number) {
  const trimmed = text.trim();
  if (!trimmed) return;
  void fetchNeuralAudioUrl(trimmed, voice, speed).catch(() => {
    /* warm cache in background */
  });
}

export function clearNeuralAudioCache() {
  for (const url of audioCache.values()) {
    URL.revokeObjectURL(url);
  }
  audioCache.clear();
  inflight.clear();
}
