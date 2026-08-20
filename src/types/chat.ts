import type { NewMemory } from "@/lib/memory";
import type { PipelineServerMetrics } from "@/lib/pipeline-latency";

export interface GrammarFeedback {
  hasError: boolean;
  explanation: string;
  correctedText: string;
}

export interface Message {
  id: string;
  sender: "ai" | "user";
  text: string;
  timestamp: number;
  translation?: string;
  grammarFeedback?: GrammarFeedback;
}

export type SuggestedResponse = string[];

export interface ChatApiResponse {
  aiResponse: string;
  translation: string;
  grammarAnalysis: GrammarFeedback;
  suggestedAnswers: SuggestedResponse;
  newMemories?: NewMemory[];
  latency?: PipelineServerMetrics;
}
