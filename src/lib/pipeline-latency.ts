export type PipelineStreamStatus = "YES" | "NO";

export interface PipelineServerMetrics {
  t0ServerStart: number;
  t1PromptReady: number;
  t2GeminiCall: number;
  t3FirstToken: number | null;
  t4StreamComplete: number;
  model: string;
  userMessage: string;
  generatedText: string;
  textLength: number;
  streamComplete: PipelineStreamStatus;
  streamReason: string;
  usedFallback: boolean;
  clientSendAt?: number | null;
}

export interface PipelineClientMetrics {
  tClientSend: number;
  tClientFirstChunk: number | null;
  tTtsEnqueue: number | null;
  tTtsStart: number | null;
  tTranslateStart: number | null;
  tTranslateEnd: number | null;
  userMessage: string;
}

function ms(from: number | null | undefined, to: number | null | undefined) {
  if (from == null || to == null || !Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.max(0, Math.round(to - from));
}

function line(label: string, value: number | null | undefined, width = 36) {
  const pad = label.padEnd(width, " ");
  if (value == null) return `${pad} n/a`;
  return `${pad} ${value} ms`;
}

export function formatPipelineLatencyReport(
  server: PipelineServerMetrics | null | undefined,
  client: PipelineClientMetrics | null | undefined,
) {
  const userMessage = (client?.userMessage || server?.userMessage || "").trim() || "(empty)";
  const model = server?.model || "unknown";
  const generated = (server?.generatedText || "").trim() || "(empty)";
  const streamComplete = server?.streamComplete ?? "NO";
  const streamReason = server?.streamReason || "unknown";

  const clientPrep = ms(client?.tClientSend, server?.clientSendAt);
  const clientToServer = ms(server?.clientSendAt ?? client?.tClientSend, server?.t0ServerStart);
  const promptPrep = ms(server?.t0ServerStart, server?.t1PromptReady);
  const geminiTtft = ms(server?.t2GeminiCall, server?.t3FirstToken);
  const chunkToAudio = ms(client?.tClientFirstChunk, client?.tTtsStart);
  const totalVoice = ms(client?.tClientSend, client?.tTtsStart);
  const fullStream = ms(server?.t2GeminiCall, server?.t4StreamComplete);
  const translateMs = ms(client?.tTranslateStart, client?.tTranslateEnd);
  const enqueueToStart = ms(client?.tTtsEnqueue, client?.tTtsStart);

  return [
    "================ PIPELINE LATENCY REPORT ================",
    `User Message: "${userMessage.slice(0, 120)}${userMessage.length > 120 ? "…" : ""}"`,
    `Model Used:   ${model}${server?.usedFallback ? " (fallback)" : ""}`,
    "---------------------------------------------------------",
    line("0. Client Prep (Send -> Fetch):", clientPrep),
    line("1. Client Fetch -> Server Receive:", clientToServer),
    line("2. Prompt & Context Prep:", promptPrep),
    line("3. Gemini TTFT (Time To First Token):", geminiTtft),
    line("4. Client First Chunk -> TTS Playback:", chunkToAudio),
    line("   (TTS Enqueue -> Audio Start):", enqueueToStart),
    line("5. Parallel Translation:", translateMs),
    "---------------------------------------------------------",
    line("TOTAL VOICE LATENCY (Send -> Audio):", totalVoice),
    line("Full Stream Duration:", fullStream),
    `Generated Text: "${generated.slice(0, 180)}${generated.length > 180 ? "…" : ""}"`,
    `Text Length: ${server?.textLength ?? generated.length} chars`,
    `Stream Complete: ${streamComplete} (Reason: ${streamReason})`,
    "=========================================================",
  ].join("\n");
}

export function logPipelineLatencyReport(
  where: "server" | "client",
  server: PipelineServerMetrics | null | undefined,
  client: PipelineClientMetrics | null | undefined,
) {
  const report = formatPipelineLatencyReport(server, client);
  const stamp = new Date().toISOString();
  console.log(`\n[${where.toUpperCase()} ${stamp}]\n${report}\n`);
}
