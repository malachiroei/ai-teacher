import type { CharacterId } from "@/lib/characters";
import type { GrammarFeedback } from "@/types/chat";

export type Gender = "boy" | "girl" | "other";
export type EnglishLevel = "beginner" | "intermediate" | "advanced";
export type DailyGoalMinutes = 5 | 10 | 15 | 20;

export interface Profile {
  id: string;
  nickname: string;
  full_name?: string | null;
  age: number;
  gender: Gender;
  english_level: EnglishLevel;
  interests: string[];
  selected_character?: CharacterId | string | null;
  daily_goal_minutes?: DailyGoalMinutes | number | null;
  preferred_practice_time?: string | null;
  notifications_enabled?: boolean | null;
  parent_whatsapp?: string | null;
  voice_speed?: number | null;
  practice_date?: string | null;
  practice_seconds?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProfileInput {
  nickname?: string;
  name?: string;
  age?: number | string | null;
  gender?: Gender | string | null;
  english_level?: EnglishLevel | string;
  englishLevel?: EnglishLevel | string;
  interests?: string[] | string | null;
  selected_character?: CharacterId | string | null;
  daily_goal_minutes?: DailyGoalMinutes | number | null;
  preferred_practice_time?: string | null;
  notifications_enabled?: boolean | null;
  parent_whatsapp?: string | null;
  voice_speed?: number | null;
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

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          nickname: string;
          age: number;
          gender: Gender;
          english_level: EnglishLevel;
          interests?: string[];
          selected_character?: string | null;
          daily_goal_minutes?: number | null;
          preferred_practice_time?: string | null;
          notifications_enabled?: boolean | null;
          parent_whatsapp?: string | null;
          voice_speed?: number | null;
          practice_date?: string | null;
          practice_seconds?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Profile, "id">>;
        Relationships: [];
      };
      chat_messages: {
        Row: ChatMessageRow;
        Insert: {
          id?: string;
          user_id: string;
          sender: "ai" | "user";
          text: string;
          translation?: string | null;
          grammar_feedback?: GrammarFeedback | null;
          created_at?: string;
        };
        Update: Partial<Omit<ChatMessageRow, "id" | "user_id">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
