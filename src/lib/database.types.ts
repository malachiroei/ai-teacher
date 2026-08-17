export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          nickname: string | null;
          full_name: string | null;
          name_pronunciation: string | null;
          age: number | null;
          gender: string | null;
          english_level: string | null;
          interests: string | string[] | null;
          selected_character: string | null;
          custom_tutor_name: string | null;
          tutor_nicknames: string | null;
          daily_goal_minutes: number | null;
          preferred_practice_time: string | null;
          notifications_enabled: boolean | null;
          parent_whatsapp: string | null;
          voice_speed: number | null;
          preferred_voice: string | null;
          practice_date: string | null;
          practice_seconds: number | null;
          placement_completed: boolean | null;
          xp: number | null;
          level: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          nickname?: string | null;
          full_name?: string | null;
          name_pronunciation?: string | null;
          age?: number | null;
          gender?: string | null;
          english_level?: string | null;
          interests?: string | string[] | null;
          selected_character?: string | null;
          custom_tutor_name?: string | null;
          tutor_nicknames?: string | null;
          daily_goal_minutes?: number | null;
          preferred_practice_time?: string | null;
          notifications_enabled?: boolean | null;
          parent_whatsapp?: string | null;
          voice_speed?: number | null;
          preferred_voice?: string | null;
          practice_date?: string | null;
          practice_seconds?: number | null;
          placement_completed?: boolean | null;
          xp?: number | null;
          level?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nickname?: string | null;
          full_name?: string | null;
          name_pronunciation?: string | null;
          age?: number | null;
          gender?: string | null;
          english_level?: string | null;
          interests?: string | string[] | null;
          selected_character?: string | null;
          custom_tutor_name?: string | null;
          tutor_nicknames?: string | null;
          daily_goal_minutes?: number | null;
          preferred_practice_time?: string | null;
          notifications_enabled?: boolean | null;
          parent_whatsapp?: string | null;
          voice_speed?: number | null;
          preferred_voice?: string | null;
          practice_date?: string | null;
          practice_seconds?: number | null;
          placement_completed?: boolean | null;
          xp?: number | null;
          level?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          user_id: string;
          sender: "ai" | "user";
          text: string;
          translation: string | null;
          grammar_feedback: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          sender: "ai" | "user";
          text: string;
          translation?: string | null;
          grammar_feedback?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          sender?: "ai" | "user";
          text?: string;
          translation?: string | null;
          grammar_feedback?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      chat_sessions: {
        Row: {
          id: string;
          user_id: string;
          character_id: string | null;
          title: string;
          preview: string | null;
          messages: Json;
          created_at: string;
          archived_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          character_id?: string | null;
          title?: string;
          preview?: string | null;
          messages?: Json;
          created_at?: string;
          archived_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          character_id?: string | null;
          title?: string;
          preview?: string | null;
          messages?: Json;
          created_at?: string;
          archived_at?: string;
        };
        Relationships: [];
      };
      user_memories: {
        Row: {
          id: string;
          user_id: string;
          fact: string;
          kind: string;
          event_on: string | null;
          created_at: string;
          last_mentioned_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          fact: string;
          kind?: string;
          event_on?: string | null;
          created_at?: string;
          last_mentioned_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          fact?: string;
          kind?: string;
          event_on?: string | null;
          created_at?: string;
          last_mentioned_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type PublicTables = Database["public"]["Tables"];
export type UserMemoryRow = PublicTables["user_memories"]["Row"];
export type UserMemoryInsert = PublicTables["user_memories"]["Insert"];
export type UserMemoryUpdate = PublicTables["user_memories"]["Update"];
