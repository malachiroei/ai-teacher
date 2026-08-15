import type { SupabaseClient } from "@supabase/supabase-js";
import { getCharacter } from "@/lib/characters";
import { normalizeDailyGoal, normalizePracticeTime } from "@/lib/practice";
import type { ChatMessageRow, Profile, ProfileInput } from "@/lib/supabase/types";
import type { GrammarFeedback, Message } from "@/types/chat";

export function parseInterests(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function isProfileComplete(profile: Partial<Profile> | null | undefined): profile is Profile {
  const nickname = profile?.nickname || profile?.full_name;
  return Boolean(profile && profile.id && nickname?.toString().trim() && profile.english_level);
}

export function describeProfileSaveError(error: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "You're offline. Check your connection and try again.";
  }

  if (error && typeof error === "object") {
    const err = error as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [err.message, err.details, err.hint].filter(Boolean);
    if (parts.length > 0) return parts.join(" — ");
  }

  if (error instanceof Error && error.message) return error.message;
  return "Couldn't save your profile. Please try again.";
}

export type SaveProfileResult =
  | { success: true; profile: Profile }
  | { success: false; error: string };

function toInterestsText(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "string") return value;
  return "";
}

function normalizeProfile(row: Partial<Profile> & Record<string, unknown>, fallback: ProfileInput, id: string): Profile {
  const nickname = String(row.nickname || row.full_name || fallback.nickname || fallback.name || "").trim();
  return {
    id,
    nickname,
    full_name: (row.full_name as string | null | undefined) ?? fallback.name ?? fallback.nickname ?? null,
    age: Number(row.age) || Number(fallback.age) || 0,
    gender: (row.gender || fallback.gender || "other") as Profile["gender"],
    english_level: (row.english_level ||
      fallback.english_level ||
      fallback.englishLevel ||
      "beginner") as Profile["english_level"],
    interests: parseInterests(row.interests).length > 0 ? parseInterests(row.interests) : parseInterests(fallback.interests),
    selected_character: getCharacter(
      (row.selected_character as string | undefined) || fallback.selected_character,
    ).id,
    daily_goal_minutes: normalizeDailyGoal(row.daily_goal_minutes ?? fallback.daily_goal_minutes),
    preferred_practice_time: normalizePracticeTime(
      row.preferred_practice_time ?? fallback.preferred_practice_time,
    ),
    notifications_enabled: Boolean(row.notifications_enabled ?? fallback.notifications_enabled),
    parent_whatsapp: String(row.parent_whatsapp ?? fallback.parent_whatsapp ?? "").trim(),
    practice_date: (row.practice_date as string | null | undefined) ?? null,
    practice_seconds: Number(row.practice_seconds) || 0,
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

export async function fetchProfile(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) {
    console.error("Supabase Profile Fetch Error:", error);
    return null;
  }
  if (!data) return null;
  return normalizeProfile(data as Profile & Record<string, unknown>, {}, userId);
}

export async function saveProfile(
  supabase: SupabaseClient,
  userId: string,
  onboardingData: ProfileInput,
): Promise<SaveProfileResult> {
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { success: false, error: "You're offline. Check your connection and try again." };
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getUser();
    if (sessionError) {
      console.error("Supabase Profile Save Error:", sessionError);
      return { success: false, error: describeProfileSaveError(sessionError) };
    }

    const id = sessionData.user?.id ?? userId;
    if (!id) {
      const missing = { message: "You're not signed in. Please log in again." };
      console.error("Supabase Profile Save Error:", missing);
      return { success: false, error: missing.message };
    }

    const payload = {
      id,
      nickname: onboardingData.nickname || onboardingData.name || null,
      full_name: onboardingData.name || onboardingData.nickname || null,
      age: Number(onboardingData.age) || null,
      gender: onboardingData.gender || null,
      english_level: onboardingData.englishLevel || onboardingData.english_level || "beginner",
      interests: toInterestsText(onboardingData.interests) || (onboardingData.interests as string | null),
      selected_character: getCharacter(onboardingData.selected_character).id,
      updated_at: new Date().toISOString(),
    };

    const { full_name: _fullName, selected_character: _selectedCharacter, ...core } = payload;
    const attempts: Array<Record<string, unknown>> = [
      payload,
      { ...core, selected_character: payload.selected_character },
      { ...core, full_name: payload.full_name },
      core,
    ];

    let lastError: unknown;
    for (const body of attempts) {
      const { data, error } = await supabase.from("profiles").upsert(body, { onConflict: "id" }).select().maybeSingle();

      if (!error) {
        return {
          success: true,
          profile: normalizeProfile((data ?? body) as Profile & Record<string, unknown>, onboardingData, id),
        };
      }

      console.error("Supabase Profile Save Error:", error);
      lastError = error;
      const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
      if (
        !message.includes("full_name") &&
        !message.includes("selected_character") &&
        !message.includes("schema cache") &&
        !message.includes("could not find")
      ) {
        break;
      }
    }

    return { success: false, error: describeProfileSaveError(lastError) };
  } catch (error) {
    console.error("Supabase Profile Save Error:", error);
    return { success: false, error: describeProfileSaveError(error) };
  }
}

export async function saveSelectedCharacter(
  supabase: SupabaseClient,
  userId: string,
  characterId: string,
): Promise<SaveProfileResult> {
  try {
    const selected_character = getCharacter(characterId).id;
    const { data, error } = await supabase
      .from("profiles")
      .update({ selected_character, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select()
      .maybeSingle();

    if (error) {
      console.error("Supabase Character Save Error:", error);
      return { success: false, error: describeProfileSaveError(error) };
    }

    const profile = data
      ? normalizeProfile(data as Profile & Record<string, unknown>, { selected_character }, userId)
      : normalizeProfile({ selected_character }, { selected_character }, userId);

    return { success: true, profile };
  } catch (error) {
    console.error("Supabase Character Save Error:", error);
    return { success: false, error: describeProfileSaveError(error) };
  }
}

export async function savePracticeSettings(
  supabase: SupabaseClient,
  userId: string,
  settings: {
    daily_goal_minutes: number;
    preferred_practice_time: string;
    notifications_enabled: boolean;
    parent_whatsapp: string;
  },
): Promise<SaveProfileResult> {
  try {
    const payload = {
      daily_goal_minutes: normalizeDailyGoal(settings.daily_goal_minutes),
      preferred_practice_time: normalizePracticeTime(settings.preferred_practice_time),
      notifications_enabled: Boolean(settings.notifications_enabled),
      parent_whatsapp: settings.parent_whatsapp.trim(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from("profiles").update(payload).eq("id", userId).select().maybeSingle();
    if (error) {
      console.error("Supabase Practice Settings Error:", error);
      return { success: false, error: describeProfileSaveError(error) };
    }

    return {
      success: true,
      profile: normalizeProfile((data ?? payload) as Profile & Record<string, unknown>, payload, userId),
    };
  } catch (error) {
    console.error("Supabase Practice Settings Error:", error);
    return { success: false, error: describeProfileSaveError(error) };
  }
}

export async function savePracticeProgress(
  supabase: SupabaseClient,
  userId: string,
  progress: { practice_date: string; practice_seconds: number },
) {
  const { error } = await supabase
    .from("profiles")
    .update({
      practice_date: progress.practice_date,
      practice_seconds: progress.practice_seconds,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    console.error("Supabase Practice Progress Error:", error);
    return { success: false as const, error };
  }
  return { success: true as const };
}

export function rowToMessage(row: ChatMessageRow): Message {
  return {
    id: row.id,
    sender: row.sender,
    text: row.text,
    timestamp: new Date(row.created_at).getTime(),
    translation: row.translation ?? undefined,
    grammarFeedback: row.grammar_feedback ?? undefined,
  };
}

export async function loadChatHistory(supabase: SupabaseClient, userId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as ChatMessageRow[]).map(rowToMessage);
}

export async function saveMessage(
  supabase: SupabaseClient,
  userId: string,
  message: {
    id?: string;
    sender: "ai" | "user";
    text: string;
    translation?: string | null;
    grammarFeedback?: GrammarFeedback | null;
  },
) {
  const id =
    message.id ||
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

  const payload = {
    id,
    user_id: userId,
    sender: message.sender,
    text: message.text,
    translation: message.translation ?? null,
    grammar_feedback: message.grammarFeedback ?? null,
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("chat_messages").insert(payload);
  if (error) {
    console.error("Chat Save Error:", error);
    return { success: false as const, error };
  }
  return { success: true as const, id };
}

export async function insertChatMessage(
  supabase: SupabaseClient,
  userId: string,
  message: {
    id?: string;
    sender: "ai" | "user";
    text: string;
    translation?: string | null;
    grammarFeedback?: GrammarFeedback | null;
  },
) {
  const result = await saveMessage(supabase, userId, message);
  if (!result.success) throw result.error;
}

export async function clearChatHistory(supabase: SupabaseClient, userId: string) {
  const { error } = await supabase.from("chat_messages").delete().eq("user_id", userId);
  if (error) throw error;
}
