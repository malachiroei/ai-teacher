import type { CharacterId } from "@/lib/characters";
import type { GrammarFeedback } from "@/types/chat";

export type Gender = "boy" | "girl" | "other";
export type EnglishLevel = "beginner" | "intermediate" | "advanced";
export type DailyGoalMinutes = 5 | 10 | 15 | 20;

export interface Profile {
  id: string;
  nickname: string;
  full_name?: string | null;
  name_pronunciation?: string | null;
  age: number;
  gender: Gender;
  english_level: EnglishLevel;
  interests: string[];
  selected_character?: CharacterId | string | null;
  custom_tutor_name?: string | null;
  tutor_nicknames?: Record<string, string> | string | null;
  daily_goal_minutes?: DailyGoalMinutes | number | null;
  preferred_practice_time?: string | null;
  notifications_enabled?: boolean | null;
  parent_whatsapp?: string | null;
  voice_speed?: number | null;
  preferred_voice?: string | null;
  practice_date?: string | null;
  practice_seconds?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProfileInput {
  nickname?: string;
  name?: string;
  name_pronunciation?: string | null;
  age?: number | string | null;
  gender?: Gender | string | null;
  english_level?: EnglishLevel | string;
  englishLevel?: EnglishLevel | string;
  interests?: string[] | string | null;
  selected_character?: CharacterId | string | null;
  custom_tutor_name?: string | null;
  tutor_nicknames?: Record<string, string> | string | null;
  daily_goal_minutes?: DailyGoalMinutes | number | null;
  preferred_practice_time?: string | null;
  notifications_enabled?: boolean | null;
  parent_whatsapp?: string | null;
  voice_speed?: number | null;
  preferred_voice?: string | null;
}

export interface ChatMessageRow {
  id: string;
  user_id: string;
  sender: "ai" | "user";
  text: string;
  translation: string | null;
  grammar_feedback: GrammarFeedback | null;
  created_at: string;
}

export interface ChatSessionRow {
  id: string;
  user_id: string;
  character_id: string;
  title: string;
  preview: string;
  messages: unknown;
  created_at: string;
  archived_at: string;
}

export type { Database, UserMemoryRow } from "@/lib/database.types";
export type { Database as PublicDatabase } from "@/lib/database.types";
