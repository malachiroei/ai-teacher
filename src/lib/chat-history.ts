import type { SupabaseClient } from "@supabase/supabase-js";
import { getCharacter } from "@/lib/characters";
import { parseTutorNicknames, serializeTutorNicknames } from "@/lib/learner";
import { normalizeDailyGoal, normalizePracticeTime, normalizeVoiceSpeed } from "@/lib/practice";
import type { ChatMessageRow, ChatSessionRow, Profile, ProfileInput } from "@/lib/supabase/types";
import type { GrammarFeedback, Message } from "@/types/chat";
import type { NewMemory, UserMemory } from "@/lib/memory";
import {
  extractFactsFromUtterance,
  parseFavoriteThing,
  parseSpokenAge,
} from "@/lib/memory";
import { guessSpokenName } from "@/lib/placement";
import { normalizeProgression } from "@/lib/progression";

type AppSupabaseClient = SupabaseClient;

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

export function isIntroProfileComplete(profile: Partial<Profile> | null | undefined) {
  const nickname = String(profile?.nickname || profile?.full_name || "").trim();
  const interests = Array.isArray(profile?.interests)
    ? profile.interests.map((item) => String(item).trim()).filter(Boolean)
    : String(profile?.interests ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  const age = Number(profile?.age) || 0;
  return Boolean(nickname && profile?.english_level && interests.length > 0 && age > 0);
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

function missingColumn(error: unknown, columns: string[]) {
  const err = error as { message?: string; details?: string; hint?: string };
  const message = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return (
    columns.some((column) => message.includes(column.toLowerCase())) ||
    message.includes("schema cache") ||
    message.includes("could not find")
  );
}

function toInterestsText(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "string") return value;
  return "";
}

function normalizeProfile(row: Partial<Profile> & Record<string, unknown>, fallback: ProfileInput, id: string): Profile {
  const nickname = String(row.nickname || row.full_name || fallback.nickname || fallback.name || "").trim();
  const progression = normalizeProgression({
    xp: Number(row.xp ?? fallback.xp) || 0,
    level: Number(row.level ?? fallback.level) || 1,
    placement_completed: Boolean(row.placement_completed ?? fallback.placement_completed),
  });
  return {
    id,
    nickname,
    full_name: (row.full_name as string | null | undefined) ?? fallback.name ?? fallback.nickname ?? null,
    name_pronunciation: String(row.name_pronunciation ?? fallback.name_pronunciation ?? "").trim(),
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
    custom_tutor_name: String(row.custom_tutor_name ?? fallback.custom_tutor_name ?? "").trim() || null,
    tutor_nicknames: parseTutorNicknames(row.tutor_nicknames ?? fallback.tutor_nicknames),
    daily_goal_minutes: normalizeDailyGoal(row.daily_goal_minutes ?? fallback.daily_goal_minutes),
    preferred_practice_time: normalizePracticeTime(
      row.preferred_practice_time ?? fallback.preferred_practice_time,
    ),
    notifications_enabled: Boolean(row.notifications_enabled ?? fallback.notifications_enabled),
    parent_whatsapp: String(row.parent_whatsapp ?? fallback.parent_whatsapp ?? "").trim(),
    voice_speed: normalizeVoiceSpeed(row.voice_speed ?? fallback.voice_speed),
    preferred_voice: String(row.preferred_voice ?? fallback.preferred_voice ?? "").trim(),
    practice_date: (row.practice_date as string | null | undefined) ?? null,
    practice_seconds: Number(row.practice_seconds) || 0,
    placement_completed: progression.placement_completed,
    xp: progression.xp,
    level: progression.level,
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

export async function fetchProfile(supabase: AppSupabaseClient, userId: string) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, nickname, full_name, name_pronunciation, age, gender, english_level, interests, selected_character, custom_tutor_name, tutor_nicknames, daily_goal_minutes, preferred_practice_time, notifications_enabled, parent_whatsapp, voice_speed, preferred_voice, practice_date, practice_seconds, placement_completed, xp, level, created_at, updated_at",
      )
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.error("Supabase Profile Fetch Error:", error);
      return null;
    }
    if (!data) return null;
    return normalizeProfile(data as Profile & Record<string, unknown>, {}, userId);
  } catch (error) {
    console.error("Supabase Profile Fetch Error:", error);
    return null;
  }
}

export async function saveProfile(
  supabase: AppSupabaseClient,
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
      name_pronunciation: String(onboardingData.name_pronunciation ?? "").trim(),
      age: Number(onboardingData.age) || null,
      gender: onboardingData.gender || null,
      english_level: onboardingData.englishLevel || onboardingData.english_level || "beginner",
      interests: toInterestsText(onboardingData.interests) || (onboardingData.interests as string | null),
      selected_character: getCharacter(onboardingData.selected_character).id,
      updated_at: new Date().toISOString(),
    };

    const { full_name: _fullName, selected_character: _selectedCharacter, name_pronunciation: _pronunciation, ...core } =
      payload;
    const attempts: Array<Record<string, unknown>> = [
      payload,
      { ...core, selected_character: payload.selected_character, name_pronunciation: payload.name_pronunciation },
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
      if (!missingColumn(error, ["full_name", "selected_character", "name_pronunciation"])) {
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
  supabase: AppSupabaseClient,
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
  supabase: AppSupabaseClient,
  userId: string,
  settings: {
    daily_goal_minutes: number;
    preferred_practice_time: string;
    notifications_enabled: boolean;
    parent_whatsapp: string;
    voice_speed: number;
    preferred_voice?: string;
    nickname?: string;
    name_pronunciation?: string;
  },
): Promise<SaveProfileResult> {
  try {
    const payload: Record<string, unknown> = {
      daily_goal_minutes: normalizeDailyGoal(settings.daily_goal_minutes),
      preferred_practice_time: normalizePracticeTime(settings.preferred_practice_time),
      notifications_enabled: Boolean(settings.notifications_enabled),
      parent_whatsapp: settings.parent_whatsapp.trim(),
      voice_speed: normalizeVoiceSpeed(settings.voice_speed),
      preferred_voice: String(settings.preferred_voice ?? "").trim(),
      updated_at: new Date().toISOString(),
    };
    if (typeof settings.nickname === "string" && settings.nickname.trim()) {
      payload.nickname = settings.nickname.trim();
    }
    if (typeof settings.name_pronunciation === "string") {
      payload.name_pronunciation = settings.name_pronunciation.trim();
    }

    const attempts: Array<Record<string, unknown>> = [
      payload,
      omitKeys(payload, ["preferred_voice", "name_pronunciation", "nickname"]),
      omitKeys(payload, ["preferred_voice", "name_pronunciation"]),
      omitKeys(payload, ["preferred_voice"]),
    ];

    let lastError: unknown;
    for (const body of attempts) {
      const { data, error } = await supabase.from("profiles").update(body).eq("id", userId).select().maybeSingle();
      if (!error) {
        return {
          success: true,
          profile: normalizeProfile((data ?? body) as Profile & Record<string, unknown>, body, userId),
        };
      }
      console.error("Supabase Practice Settings Error:", error);
      lastError = error;
      if (!missingColumn(error, ["preferred_voice", "name_pronunciation", "nickname"])) break;
    }

    return { success: false, error: describeProfileSaveError(lastError) };
  } catch (error) {
    console.error("Supabase Practice Settings Error:", error);
    return { success: false, error: describeProfileSaveError(error) };
  }
}

export async function saveProgression(
  supabase: AppSupabaseClient,
  userId: string,
  patch: { xp?: number; level?: number; placement_completed?: boolean },
): Promise<SaveProfileResult> {
  try {
    const body: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (typeof patch.xp === "number") body.xp = Math.max(0, patch.xp);
    if (typeof patch.level === "number") body.level = Math.min(4, Math.max(1, patch.level));
    if (typeof patch.placement_completed === "boolean") body.placement_completed = patch.placement_completed;

    const attempts = [
      body,
      omitKeys(body, ["placement_completed"]),
      omitKeys(body, ["xp", "level"]),
      omitKeys(body, ["xp", "level", "placement_completed"]),
    ].filter((attempt) => Object.keys(attempt).length > 1);

    let lastError: unknown;
    for (const attempt of attempts) {
      const { data, error } = await supabase.from("profiles").update(attempt).eq("id", userId).select("*").maybeSingle();
      if (!error) {
        return {
          success: true,
          profile: normalizeProfile((data ?? attempt) as Profile & Record<string, unknown>, attempt, userId),
        };
      }
      lastError = error;
      if (!missingColumn(error, ["xp", "level", "placement_completed"])) break;
    }
    return { success: false, error: describeProfileSaveError(lastError) };
  } catch (error) {
    return { success: false, error: describeProfileSaveError(error) };
  }
}

function omitKeys(payload: Record<string, unknown>, keys: string[]) {
  const next = { ...payload };
  for (const key of keys) delete next[key];
  return next;
}

export async function saveTutorNickname(
  supabase: AppSupabaseClient,
  userId: string,
  characterId: string,
  nickname: string,
  currentNicknames?: unknown,
): Promise<SaveProfileResult> {
  const id = getCharacter(characterId).id;
  const trimmed = nickname.trim();
  const map = parseTutorNicknames(currentNicknames);
  if (trimmed) map[id] = trimmed;
  else delete map[id];

  const payload = {
    tutor_nicknames: serializeTutorNicknames(map),
    custom_tutor_name: trimmed,
    updated_at: new Date().toISOString(),
  };

  try {
    const attempts: Array<Record<string, unknown>> = [
      payload,
      { custom_tutor_name: payload.custom_tutor_name, updated_at: payload.updated_at },
      { updated_at: payload.updated_at },
    ];
    let lastError: unknown;
    for (const body of attempts) {
      const { data, error } = await supabase.from("profiles").update(body).eq("id", userId).select().maybeSingle();
      if (!error) {
        return {
          success: true,
          profile: normalizeProfile((data ?? { ...map, ...body }) as Profile & Record<string, unknown>, {
            tutor_nicknames: map,
            custom_tutor_name: trimmed,
          }, userId),
        };
      }
      lastError = error;
      if (!missingColumn(error, ["tutor_nicknames", "custom_tutor_name"])) break;
    }
    return { success: false, error: describeProfileSaveError(lastError) };
  } catch (error) {
    return { success: false, error: describeProfileSaveError(error) };
  }
}

export async function savePracticeProgress(
  supabase: AppSupabaseClient,
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

export async function loadChatHistory(supabase: AppSupabaseClient, userId: string): Promise<Message[]> {
  try {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, sender, text, translation, grammar_feedback, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("chat_messages load skipped:", error.message ?? error);
      return [];
    }
    return ((data ?? []) as ChatMessageRow[]).map(rowToMessage);
  } catch (error) {
    console.warn("chat_messages load skipped:", error);
    return [];
  }
}

export async function saveMessage(
  supabase: AppSupabaseClient,
  userId: string,
  message: {
    id?: string;
    sender: "ai" | "user";
    text: string;
    translation?: string | null;
    grammarFeedback?: GrammarFeedback | null;
    createdAt?: number | string | null;
  },
) {
  const id =
    message.id ||
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

  const createdAt = message.createdAt
    ? new Date(message.createdAt).toISOString()
    : new Date().toISOString();

  const payload = {
    id,
    user_id: userId,
    sender: message.sender,
    text: message.text,
    translation: message.translation ?? null,
    grammar_feedback: message.grammarFeedback ?? null,
    created_at: createdAt,
  };

  try {
    let { error } = await supabase.from("chat_messages").insert(payload);
    if (error) {
      // Retry without grammar_feedback if column/type is missing.
      const minimal = {
        id,
        user_id: userId,
        sender: message.sender,
        text: message.text,
        translation: message.translation ?? null,
        created_at: createdAt,
      };
      ({ error } = await supabase.from("chat_messages").insert(minimal));
    }
    if (error) {
      console.error("Chat Save Error:", error);
      return { success: false as const, error };
    }
    return { success: true as const, id };
  } catch (error) {
    console.error("Chat Save Error:", error);
    return { success: false as const, error };
  }
}

export async function insertChatMessage(
  supabase: AppSupabaseClient,
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

export interface ArchivedChatSession {
  id: string;
  characterId: string;
  title: string;
  preview: string;
  messages: Message[];
  createdAt: number;
  archivedAt: number;
}

function sessionTitle(messages: Message[], tutorName: string) {
  const firstUser = messages.find((message) => message.sender === "user")?.text.trim();
  if (firstUser) return firstUser.slice(0, 48);
  return `Chat with ${tutorName}`;
}

function toSessionMessage(message: Message) {
  return {
    id: message.id,
    sender: message.sender,
    text: message.text,
    timestamp: message.timestamp,
    translation: message.translation ?? null,
    grammarFeedback: message.grammarFeedback ?? null,
  };
}

function fromSessionMessages(value: unknown): Message[] {
  if (!Array.isArray(value)) return [];
  const messages: Message[] = [];
  for (const item of value) {
    const row = item as Partial<Message> & {
      grammar_feedback?: GrammarFeedback | null;
      role?: string;
      content?: string;
      created_at?: string | number;
    };
    const role = String(row.sender || row.role || "").toLowerCase();
    const sender: Message["sender"] | null =
      role === "ai" || role === "assistant" || role === "model"
        ? "ai"
        : role === "user"
          ? "user"
          : null;
    const text = String(row.text || row.content || "").trim();
    if (!sender || !text) continue;
    const ts = Number(row.timestamp) || (row.created_at ? new Date(row.created_at).getTime() : Date.now());
    messages.push({
      id: String(row.id || `${ts}-${messages.length}`),
      sender,
      text,
      timestamp: Number.isFinite(ts) ? ts : Date.now(),
      translation: row.translation ?? undefined,
      grammarFeedback: row.grammarFeedback ?? row.grammar_feedback ?? undefined,
    });
  }
  return messages;
}

export function rowToSession(row: ChatSessionRow): ArchivedChatSession {
  const archivedAt = new Date(row.archived_at || row.created_at).getTime();
  return {
    id: row.id,
    characterId: row.character_id || "emma",
    title: row.title || "Previous chat",
    preview: row.preview || "",
    messages: fromSessionMessages(row.messages),
    createdAt: new Date(row.created_at).getTime(),
    archivedAt,
  };
}

export function shouldArchiveMessages(messages: Message[]) {
  return messages.some((message) => message.sender === "user" && message.text.trim());
}

export async function archiveCurrentChat(
  supabase: AppSupabaseClient,
  userId: string,
  input: { messages: Message[]; characterId?: string | null; tutorName?: string },
) {
  const messages = input.messages.filter((message) => message.text.trim());
  if (!shouldArchiveMessages(messages)) {
    return { success: true as const, archived: false };
  }

  const tutorName = input.tutorName || getCharacter(input.characterId).name;
  const firstUser = messages.find((message) => message.sender === "user")?.text.trim() ?? "";
  const payload = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    user_id: userId,
    character_id: getCharacter(input.characterId).id,
    title: sessionTitle(messages, tutorName),
    preview: firstUser.slice(0, 80),
    messages: messages.map(toSessionMessage),
    archived_at: new Date().toISOString(),
    created_at: new Date(messages[0]?.timestamp || Date.now()).toISOString(),
  };

  const { error } = await supabase.from("chat_sessions").insert(payload);
  if (error) {
    console.error("Chat Archive Error:", error);
    return { success: false as const, archived: false, error };
  }
  return { success: true as const, archived: true };
}

export async function startFreshChat(supabase: AppSupabaseClient, userId: string) {
  const { error } = await supabase.from("chat_messages").delete().eq("user_id", userId);
  if (error) throw error;
}

export async function listChatSessions(supabase: AppSupabaseClient, userId: string): Promise<ArchivedChatSession[]> {
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("archived_at", { ascending: false })
    .limit(40);

  if (error) {
    console.error("Chat Sessions Load Error:", error);
    throw error;
  }
  return ((data ?? []) as ChatSessionRow[]).map(rowToSession);
}

export async function restoreChatSession(
  supabase: AppSupabaseClient,
  userId: string,
  session: ArchivedChatSession,
  current: { messages: Message[]; characterId?: string | null; tutorName?: string },
) {
  const sameThread =
    current.messages.length === session.messages.length &&
    current.messages[0]?.id === session.messages[0]?.id &&
    current.messages[current.messages.length - 1]?.id === session.messages[session.messages.length - 1]?.id;
  if (!sameThread) {
    await archiveCurrentChat(supabase, userId, current);
  }
  await startFreshChat(supabase, userId);
  for (const message of session.messages) {
    const result = await saveMessage(supabase, userId, {
      id: message.id,
      sender: message.sender,
      text: message.text,
      translation: message.translation,
      grammarFeedback: message.grammarFeedback,
      createdAt: message.timestamp,
    });
    if (!result.success) {
      console.error("Chat Restore Error:", result.error);
    }
  }
  return session.messages;
}

/**
 * user_memories is disabled until DB migrations add the expected columns
 * (e.g. `fact`). Real queries caused multi-second 400 roundtrips that blocked
 * the chat voice pipeline (~6.5s Client→Server lag).
 */
const MEMORIES_DISABLED = true;

export async function saveExtractedFact(
  _supabase: AppSupabaseClient,
  _userId: string,
  _fact: string,
  _category: string,
  _eventDate?: string | null,
): Promise<UserMemory | null> {
  return null;
}

export async function patchKidProfile(
  supabase: AppSupabaseClient,
  userId: string,
  current: Profile | null | undefined,
  patch: { nickname?: string; age?: number; interests?: string[]; english_level?: string },
): Promise<Profile | null> {
  if (!userId || !current) return current ?? null;
  try {
    const interests = Array.from(
      new Set([...(current.interests ?? []), ...(patch.interests ?? [])].map((item) => item.trim()).filter(Boolean)),
    );
    const body: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (patch.nickname?.trim()) {
      body.nickname = patch.nickname.trim();
      body.full_name = patch.nickname.trim();
    }
    if (typeof patch.age === "number" && patch.age > 0) body.age = patch.age;
    if (patch.interests?.length) body.interests = interests.join(", ");
    if (patch.english_level) body.english_level = patch.english_level;
    if (Object.keys(body).length <= 1) return current;

    const attempts = [body, omitKeys(body, ["full_name"]), omitKeys(body, ["full_name", "interests"])];
    for (const attempt of attempts) {
      const { data, error } = await supabase.from("profiles").update(attempt).eq("id", userId).select("*").maybeSingle();
      if (error) {
        console.warn("Kid profile patch skipped:", error.message ?? error);
        continue;
      }
      return normalizeProfile((data ?? { ...current, ...attempt }) as Profile & Record<string, unknown>, current, userId);
    }
    return {
      ...current,
      nickname: String(body.nickname ?? current.nickname),
      age: Number(body.age ?? current.age) || current.age,
      interests: patch.interests?.length ? interests : current.interests,
      english_level: (patch.english_level as Profile["english_level"]) || current.english_level,
    };
  } catch {
    return current;
  }
}

export async function rememberKidTurn(
  supabase: AppSupabaseClient,
  userId: string,
  existing: UserMemory[],
  spokenText: string,
  incoming: NewMemory[] = [],
  extras?: { profile?: Profile | null; placementTurn?: number },
): Promise<{ memories: UserMemory[]; profile: Profile | null }> {
  let profile = extras?.profile ?? null;
  const extracted = extractFactsFromUtterance(spokenText, {
    placementTurn: extras?.placementTurn,
    childName: extras?.placementTurn === 1 ? guessSpokenName(spokenText) : undefined,
  });
  const incomingFacts = [...incoming, ...extracted];

  if (extras?.placementTurn === 1) {
    const name = guessSpokenName(spokenText);
    if (name) {
      profile = await patchKidProfile(supabase, userId, profile, { nickname: name });
      incomingFacts.unshift({ fact: `Child's name is ${name}`, kind: "personal", eventOn: null });
    }
  }
  if (extras?.placementTurn === 2) {
    const age = parseSpokenAge(spokenText);
    if (age) {
      profile = await patchKidProfile(supabase, userId, profile, { age });
    }
  }
  if (extras?.placementTurn === 3) {
    const thing = parseFavoriteThing(spokenText);
    if (thing) {
      profile = await patchKidProfile(supabase, userId, profile, { interests: [thing] });
    }
  }

  const next = await upsertUserMemories(supabase, userId, existing, incomingFacts);
  return { memories: next, profile };
}

export async function seedProfileMemories(
  _supabase: AppSupabaseClient,
  _userId: string,
  _profile: Profile | null | undefined,
): Promise<UserMemory[]> {
  return [];
}

export async function loadUserMemories(
  _supabase?: AppSupabaseClient,
  _userId?: string,
): Promise<UserMemory[]> {
  return [];
}

export async function upsertUserMemories(
  _supabase: AppSupabaseClient,
  _userId: string,
  existing: UserMemory[],
  incoming: NewMemory[],
): Promise<UserMemory[]> {
  if (MEMORIES_DISABLED || incoming.length === 0) return existing;
  return existing;
}

export async function clearChatHistory(supabase: AppSupabaseClient, userId: string) {
  await startFreshChat(supabase, userId);
}
