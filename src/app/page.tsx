"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthModal } from "@/components/AuthModal";
import { CharacterSelectorModal } from "@/components/CharacterSelectorModal";
import { ChatTopBar } from "@/components/ChatTopBar";
import { PreviousChatsModal } from "@/components/PreviousChatsModal";
import { DocumentTitle } from "@/components/DocumentTitle";
import { GoalCelebrationModal } from "@/components/GoalCelebrationModal";
import { LevelUpBurst } from "@/components/LevelUpBurst";
import { LoadingScreen } from "@/components/LoadingScreen";
import { OnboardingModal } from "@/components/OnboardingModal";
import { InteractiveOnboarding } from "@/components/InteractiveOnboarding";
import { SettingsModal } from "@/components/SettingsModal";
import { VoiceStage } from "@/components/VoiceStage";
import { useSpeech, SPEECH_UNAVAILABLE_MESSAGE, MIC_PERMISSION_MESSAGE } from "@/hooks/useSpeech";
import { useVisualViewport } from "@/hooks/useVisualViewport";
import {
  archiveCurrentChat,
  describeProfileSaveError,
  fetchProfile,
  listChatSessions,
  loadUserMemories,
  restoreChatSession,
  saveMessage,
  isProfileComplete,
  loadChatHistory,
  rememberKidTurn,
  saveProfile,
  savePracticeSettings,
  saveProgression,
  saveSelectedCharacter,
  saveTutorNickname,
  seedProfileMemories,
  startFreshChat,
  type ArchivedChatSession,
} from "@/lib/chat-history";
import { getCharacter, isCharacterId, readStoredTutorId, writeStoredTutorId, type CharacterId } from "@/lib/characters";
import { useDailyPractice } from "@/hooks/useDailyPractice";
import { quickHebrewSubtitle, shouldSkipLlmTranslate, isCleanHebrewSubtitle } from "@/lib/hebrew";
import { logConversationPedagogyReport } from "@/lib/conversation-pedagogy";
import { parseTutorNicknames, profilePayload, withTutorDisplayName } from "@/lib/learner";
import { consumeChatStream, speakableSentences } from "@/lib/chat-stream";
import {
  logPipelineLatencyReport,
  type PipelineClientMetrics,
  type PipelineServerMetrics,
} from "@/lib/pipeline-latency";
import {
  buildFriendshipOpener,
  buildPlacementOpener,
  hasCompletedKidsPlacement,
  isKidsPlacementSession,
  isPlacementActive,
  isPlacementOpener,
  markKidsPlacementComplete,
  placementAnswerTurns,
  PLACEMENT_SUGGESTIONS,
} from "@/lib/placement";
import type { UserMemory } from "@/lib/memory";
import {
  applyXp,
  levelCheer,
  levelFromXp,
  readProgressionLocal,
  writeProgressionLocal,
  type LevelInfo,
  xpForUtterance,
} from "@/lib/progression";
import {
  buildParentWhatsAppMessage,
  countUserMessagesToday,
  extractPracticeTopics,
  formatVoiceSpeed,
  nextVoiceSpeed,
  normalizeWhatsAppPhone,
  practiceSettingsFromProfile,
  readStoredVoiceSpeed,
  startOfLocalDay,
  whatsappShareUrl,
  writeStoredVoiceSpeed,
  type VoiceSpeed,
} from "@/lib/practice";
import { createClient } from "@/lib/supabase/client";
import type { Profile, ProfileInput } from "@/lib/supabase/types";
import type { ChatApiResponse, GrammarFeedback, Message } from "@/types/chat";
import type { SettingsSavePayload } from "@/components/SettingsModal";
import { withTimeout } from "@/lib/utils";

const INITIAL_SUGGESTIONS = [...PLACEMENT_SUGGESTIONS[0]];

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function placementMessage(nextProfile?: Profile | null) {
  const tutor = withTutorDisplayName(getCharacter(nextProfile?.selected_character), nextProfile);
  return buildPlacementOpener(tutor.name, nextProfile?.gender);
}

function friendshipMessage(nextProfile?: Profile | null) {
  const tutor = withTutorDisplayName(getCharacter(nextProfile?.selected_character), nextProfile);
  return buildFriendshipOpener(
    tutor.name,
    nextProfile?.nickname ?? "",
    nextProfile?.interests?.[0],
    nextProfile?.gender,
  );
}

function mergeLocalProgression(userId: string, nextProfile: Profile): Profile {
  const local = readProgressionLocal(userId);
  const xp = Math.max(Number(nextProfile.xp) || 0, local.xp);
  const completed =
    Boolean(nextProfile.placement_completed) || local.placement_completed || hasCompletedKidsPlacement(userId);
  if (completed) markKidsPlacementComplete(userId);
  const merged: Profile = {
    ...nextProfile,
    xp,
    level: Math.max(Number(nextProfile.level) || 1, local.level, levelFromXp(xp).level),
    placement_completed: completed,
  };
  writeProgressionLocal(userId, {
    xp: merged.xp ?? 0,
    level: merged.level ?? 1,
    placement_completed: Boolean(merged.placement_completed),
  });
  return merged;
}

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [selectedTutorId, setSelectedTutorId] = useState<CharacterId | null>(null);
  const [voiceSpeed, setVoiceSpeed] = useState<VoiceSpeed>(0.9);
  const [authReady, setAuthReady] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const [profileChecked, setProfileChecked] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [onboardingDoneChecked, setOnboardingDoneChecked] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openTranslations, setOpenTranslations] = useState<Record<string, boolean>>({});
  const [suggestions, setSuggestions] = useState<string[]>(INITIAL_SUGGESTIONS);
  const [characterPickerOpen, setCharacterPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsFocusVoice, setSettingsFocusVoice] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState<ArchivedChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [notice, setNotice] = useState("");
  const [levelUp, setLevelUp] = useState<LevelInfo | null>(null);

  const sendingRef = useRef(false);
  const sendSpokenRef = useRef<(text: string) => void>(() => {});
  const spokenOpenerRef = useRef("");
  const forcePlacementRef = useRef(false);
  const dailyGreetedRef = useRef("");
  const latencyClientRef = useRef<PipelineClientMetrics | null>(null);
  const latencyServerRef = useRef<PipelineServerMetrics | null>(null);
  const latencyReportPrintedRef = useRef(false);
  const [spokenReply, setSpokenReply] = useState("");
  const [spokenTranslation, setSpokenTranslation] = useState("");
  const [awaitingGreeting, setAwaitingGreeting] = useState(false);
  const viewport = useVisualViewport();
  const needsOnboarding = Boolean(user && profileChecked && !isProfileComplete(profile));
  const needsInteractiveOnboarding = Boolean(user && profileChecked && onboardingDoneChecked && !onboardingDone);
  const chatUnlocked = Boolean(user && isProfileComplete(profile));
  const resolvedTutorId =
    profile?.selected_character && isCharacterId(profile.selected_character)
      ? profile.selected_character
      : selectedTutorId;
  const character = withTutorDisplayName(getCharacter(resolvedTutorId), profile);
  const practiceSettings = {
    ...practiceSettingsFromProfile(profile),
    voice_speed: voiceSpeed,
  };

  const maybePrintLatencyReport = useCallback(() => {
    if (latencyReportPrintedRef.current) return;
    const client = latencyClientRef.current;
    const server = latencyServerRef.current;
    if (!client || !server) return;
    if (autoSpeak && client.tTtsStart == null) {
      window.setTimeout(() => {
        if (latencyReportPrintedRef.current) return;
        if (!latencyClientRef.current || !latencyServerRef.current) return;
        latencyReportPrintedRef.current = true;
        logPipelineLatencyReport("client", latencyServerRef.current, latencyClientRef.current);
      }, 2500);
      return;
    }
    latencyReportPrintedRef.current = true;
    logPipelineLatencyReport("client", server, client);
  }, [autoSpeak]);

  const beginLatencyTurn = useCallback((userMessage: string) => {
    const tClientSend = Date.now();
    latencyReportPrintedRef.current = false;
    latencyServerRef.current = null;
    latencyClientRef.current = {
      tClientSend,
      tClientFirstChunk: null,
      tTtsEnqueue: null,
      tTtsStart: null,
      tTranslateStart: null,
      tTranslateEnd: null,
      userMessage,
    };
    console.log(`[latency] T_CLIENT_SEND ${tClientSend} msg="${userMessage.slice(0, 60)}"`);
    return {
      tClientSend,
      live: {
        onFirstChunk: () => {
          const turn = latencyClientRef.current;
          if (!turn || turn.tClientFirstChunk != null) return;
          turn.tClientFirstChunk = Date.now();
          console.log(`[latency] T_CLIENT_FIRST_CHUNK +${turn.tClientFirstChunk - turn.tClientSend}ms`);
        },
        onMetrics: (metrics: PipelineServerMetrics) => {
          latencyServerRef.current = metrics;
          maybePrintLatencyReport();
        },
      },
    };
  }, [maybePrintLatencyReport]);

  const { speak, enqueueSpeak, beginSpeakStream, unlockSpeech, stopSpeaking, setVolume, startListening, stopListening, isListening, transcript, speechSupported, voices, isSpeaking, audioLevel, audioLevelRef, speakingText } = useSpeech({
    character,
    rateMultiplier: voiceSpeed,
    preferredVoiceUri: practiceSettings.preferred_voice,
    onFinalTranscript: (text) => sendSpokenRef.current(text),
    onListenError: (reason) => {
      const text = reason === "not-allowed" ? MIC_PERMISSION_MESSAGE : SPEECH_UNAVAILABLE_MESSAGE;
      setNotice(text);
      window.setTimeout(() => setNotice(""), 2800);
    },
    onUtteranceEnqueue: () => {
      const turn = latencyClientRef.current;
      if (!turn || turn.tTtsEnqueue != null) return;
      turn.tTtsEnqueue = Date.now();
      console.log(`[latency] T_TTS_ENQUEUE +${turn.tTtsEnqueue - turn.tClientSend}ms`);
    },
    onUtteranceStart: () => {
      const turn = latencyClientRef.current;
      if (!turn || turn.tTtsStart != null) return;
      turn.tTtsStart = Date.now();
      console.log(`[latency] T_TTS_START +${turn.tTtsStart - turn.tClientSend}ms`);
      maybePrintLatencyReport();
    },
  });
  const userMessageCountToday = countUserMessagesToday(messages);
  const lastUserMessageAt = [...messages].reverse().find((message) => message.sender === "user")?.timestamp ?? 0;
  const {
    minutes: practicedMinutes,
    celebrationOpen,
    dismissCelebration,
  } = useDailyPractice({
    userId: user?.id ?? null,
    enabled: chatUnlocked,
    profile,
    goalMinutes: practiceSettings.daily_goal_minutes,
    reminderTime: practiceSettings.preferred_practice_time,
    remindersEnabled: practiceSettings.notifications_enabled,
    characterName: character.name,
    engaged: isListening || isSpeaking || isLoading || awaitingGreeting,
    lastUserMessageAt,
    userMessageCount: userMessageCountToday,
  });

  function openCharacterPicker() {
    setMenuOpen(false);
    setCharacterPickerOpen(true);
  }

  function openSettings(focusVoice = false) {
    setMenuOpen(false);
    setCharacterPickerOpen(false);
    setHistoryOpen(false);
    setSettingsError("");
    setSettingsFocusVoice(focusVoice);
    setSettingsOpen(true);
  }

  function openHistory() {
    setMenuOpen(false);
    setCharacterPickerOpen(false);
    setSettingsOpen(false);
    setHistoryOpen(true);
    if (!user) return;
    setSessionsLoading(true);
    setSessionsError("");
    void listChatSessions(createClient(), user.id)
      .then((next) => setSessions(next))
      .catch(() => setSessionsError("Couldn't load previous chats."))
      .finally(() => setSessionsLoading(false));
  }

  useLayoutEffect(() => {
    const stored = readStoredTutorId();
    setSelectedTutorId(stored);
    writeStoredTutorId(stored);
    const speed = readStoredVoiceSpeed();
    setVoiceSpeed(speed);
    writeStoredVoiceSpeed(speed);
  }, []);

  useEffect(() => {
    if (profile?.voice_speed == null) return;
    setVoiceSpeed((current) => {
      try {
        if (window.localStorage.getItem("voice_speed") != null) return current;
      } catch {
        /* keep current */
      }
      const next = readStoredVoiceSpeed(profile.voice_speed);
      writeStoredVoiceSpeed(next);
      return next;
    });
  }, [profile?.voice_speed]);

  useEffect(() => {
    if (!profile?.selected_character || !isCharacterId(profile.selected_character)) return;
    const next = getCharacter(profile.selected_character).id;
    setSelectedTutorId(next);
    writeStoredTutorId(next);
  }, [profile?.selected_character]);

  const flash = useCallback((text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(""), 2800);
  }, []);

  const applyLiveCaption = useCallback((caption: string, translation: string) => {
    setSpokenReply(caption);
    if (translation.trim()) setSpokenTranslation(translation);
  }, []);

  const fetchHebrewTranslation = useCallback((english: string, gender?: Profile["gender"] | null, userInput = "") => {
    const text = english.trim();
    if (!text) return;

    const finishPedagogy = (hebrew: string) => {
      logConversationPedagogyReport({
        userInput,
        tutorResponse: text,
        hebrewSubtitle: hebrew,
      });
    };

    const local = quickHebrewSubtitle(text, gender);
    if (local && isCleanHebrewSubtitle(local)) {
      setSpokenTranslation(local);
      if (shouldSkipLlmTranslate(text, local)) {
        const turn = latencyClientRef.current;
        if (turn) {
          turn.tTranslateStart = Date.now();
          turn.tTranslateEnd = turn.tTranslateStart;
          console.log(`[latency] T_TRANSLATE_LOCAL 0ms`);
          maybePrintLatencyReport();
        }
        finishPedagogy(local);
        return;
      }
    }

    void (async () => {
      const turn = latencyClientRef.current;
      if (turn) {
        turn.tTranslateStart = Date.now();
        console.log(`[latency] T_TRANSLATE_START +${turn.tTranslateStart - turn.tClientSend}ms`);
      }
      let hebrew = local && isCleanHebrewSubtitle(local) ? local : "";
      try {
        const response = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, gender: gender ?? null }),
        });
        if (response.ok) {
          const data = (await response.json()) as { translation?: string };
          const next = String(data.translation ?? "").trim();
          if (isCleanHebrewSubtitle(next)) {
            hebrew = next;
            setSpokenTranslation(next);
          }
        }
      } catch {
        /* translation is decorative — never block speech */
      } finally {
        if (turn) {
          turn.tTranslateEnd = Date.now();
          console.log(`[latency] T_TRANSLATE_END +${turn.tTranslateEnd - turn.tClientSend}ms`);
          maybePrintLatencyReport();
        }
        finishPedagogy(hebrew);
      }
    })();
  }, [maybePrintLatencyReport]);

  const bootstrapUser = useCallback(async (nextUser: User | null) => {
    setUser(nextUser);
    setProfile(null);
    setHistoryReady(false);
    setProfileChecked(false);
    setMessages([]);
    setMemories([]);
    setSpokenReply("");
    setSpokenTranslation("");
    spokenOpenerRef.current = "";
    setProfileError("");
    setAuthReady(true);

    if (!nextUser) {
      setProfileChecked(true);
      setHistoryReady(true);
      return;
    }

    try {
      const supabase = createClient();
      const nextProfile = await withTimeout(fetchProfile(supabase, nextUser.id), 2000, null);
      const mergedProfile = nextProfile ? mergeLocalProgression(nextUser.id, nextProfile) : null;
      setProfile(mergedProfile);
      setProfileChecked(true);

      if (isProfileComplete(mergedProfile)) {
        try {
          const [history, nextMemories] = await Promise.all([
            withTimeout(loadChatHistory(supabase, nextUser.id), 2000, [] as Message[]),
            withTimeout(loadUserMemories(supabase, nextUser.id), 2000, [] as UserMemory[]),
          ]);
          setMemories(nextMemories);
          const placementDone = hasCompletedKidsPlacement(nextUser.id, history, mergedProfile);
          if (placementDone && history.length > 0) {
            setMessages(history);
          } else if (placementDone) {
            setMessages([]);
          } else {
            spokenOpenerRef.current = "";
            forcePlacementRef.current = true;
            setMessages([placementMessage(mergedProfile)]);
          }
          if (placementDone && !mergedProfile.placement_completed) {
            void saveProgression(supabase, nextUser.id, {
              placement_completed: true,
              xp: Number(mergedProfile.xp) || 0,
              level: Number(mergedProfile.level) || 1,
            });
            setProfile({ ...mergedProfile, placement_completed: true });
          }
        } catch {
          setMessages([placementMessage(mergedProfile)]);
          flash("Couldn't load your chat history.");
        }
      }
    } catch {
      flash("Couldn't load your profile.");
      setProfileChecked(true);
    } finally {
      setHistoryReady(true);
      setAuthReady(true);
    }
  }, [flash]);

  useEffect(() => {
    if (!profileChecked) return;

    if (!user) {
      setOnboardingDone(false);
      setOnboardingDoneChecked(true);
      return;
    }

    try {
      const fromLocal = window.localStorage.getItem("onboarding_done") === "1";
      const fromProfile = Boolean((profile as any)?.onboarding_completed);
      setOnboardingDone(fromLocal || fromProfile);
      setOnboardingDoneChecked(true);
    } catch {
      setOnboardingDone(Boolean((profile as any)?.onboarding_completed));
      setOnboardingDoneChecked(true);
    }
  }, [profile, profileChecked, user]);

  useEffect(() => {
    let cancelled = false;
    let handledInitial = false;
    const watchdog = window.setTimeout(() => {
      if (!cancelled) setAuthReady(true);
    }, 1500);

    function start(nextUser: User | null) {
      if (handledInitial || cancelled) return;
      handledInitial = true;
      void bootstrapUser(nextUser);
    }

    try {
      const supabase = createClient();
      void supabase.auth
        .getSession()
        .then(({ data }) => start(data.session?.user ?? null))
        .catch(() => {
          if (!handledInitial && !cancelled) setAuthReady(true);
        });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "TOKEN_REFRESHED") return;
        if (event === "INITIAL_SESSION" && handledInitial) return;
        if (cancelled) return;
        handledInitial = true;
        void bootstrapUser(session?.user ?? null);
      });

      return () => {
        cancelled = true;
        window.clearTimeout(watchdog);
        subscription.unsubscribe();
      };
    } catch {
      start(null);
      return () => {
        cancelled = true;
        window.clearTimeout(watchdog);
      };
    }
  }, [bootstrapUser]);

  async function persistMessages(
    userId: string,
    entries: Array<{
      id?: string;
      sender: "ai" | "user";
      text: string;
      translation?: string | null;
      grammarFeedback?: GrammarFeedback | null;
      createdAt?: number | string | null;
    }>,
  ) {
    const supabase = createClient();
    let ok = true;
    for (const entry of entries) {
      const result = await saveMessage(supabase, userId, entry);
      if (!result.success) {
        console.error("Chat Save Error:", result.error);
        ok = false;
      }
    }
    return ok;
  }

  async function persistMemories(
    incoming?: ChatApiResponse["newMemories"],
    spokenText = "",
    history: Message[] = messages,
    placementTurn?: number,
  ) {
    if (!user) return;
    try {
      const result = await rememberKidTurn(createClient(), user.id, memories, spokenText, incoming ?? [], {
        profile,
        placementTurn:
          placementTurn ??
          (isKidsPlacementSession(history, Boolean(profile?.placement_completed))
            ? placementAnswerTurns(history)
            : undefined),
      });
      setMemories(result.memories);
      if (result.profile) {
        setProfile((current) => ({
          ...result.profile!,
          xp: Math.max(Number(current?.xp) || 0, Number(result.profile?.xp) || 0),
          level: Math.max(Number(current?.level) || 1, Number(result.profile?.level) || 1),
          placement_completed: Boolean(current?.placement_completed || result.profile?.placement_completed),
        }));
      }
    } catch {
      /* memories are optional; never interrupt speech */
    }
  }

  async function requestReply(
    payload: {
      userMessage?: string;
      action?: "chat" | "change_topic" | "daily_open";
      history: Message[];
      activeProfile?: Profile | null;
      clientSendAt?: number;
    },
    live?: {
      onCaption?: (text: string, translation: string) => void;
      onSentence?: (text: string) => void;
      onFirstChunk?: () => void;
      onMetrics?: (metrics: PipelineServerMetrics) => void;
    },
  ): Promise<ChatApiResponse> {
    const activeProfile = payload.activeProfile ?? profile;
    const placementCompleted = Boolean(activeProfile?.placement_completed);
    // Stamp + fire fetch with zero awaits beforehand.
    const clientSendAt = Date.now();
    console.log(`[latency] T_CLIENT_FETCH ${clientSendAt}`);
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userMessage: payload.userMessage ?? "",
        action: payload.action ?? "chat",
        messages: payload.history.slice(-12).map(({ sender, text }) => ({
          role: sender === "ai" ? "assistant" : "user",
          content: text,
        })),
        profile: profilePayload(activeProfile),
        characterId: character.id,
        memories: memories.slice(0, 20),
        placement: !placementCompleted && isPlacementActive(payload.history, placementCompleted),
        placementCompleted,
        isFirstSessionToday: !payload.history.some(
          (message) => message.sender === "user" && message.timestamp >= startOfLocalDay(),
        ),
        clientSendAt,
      }),
    });

    if (!response.ok) {
      throw new Error("Chat request failed");
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream")) {
      return consumeChatStream(response, live);
    }

    live?.onFirstChunk?.();
    const data = (await response.json()) as ChatApiResponse;
    live?.onCaption?.(data.aiResponse, data.translation ?? "");
    for (const sentence of speakableSentences(data.aiResponse)) {
      live?.onSentence?.(sentence);
    }
    if (data.latency) live?.onMetrics?.(data.latency);
    return data;
  }

  async function sendMessage(rawText: string) {
    const text = rawText.trim();
    if (!text || sendingRef.current || isLoading || !chatUnlocked || !user) return;

    sendingRef.current = true;
    const { live: latencyLive } = beginLatencyTurn(text);

    const userMessage: Message = {
      id: createId(),
      sender: "user",
      text,
      timestamp: Date.now(),
    };
    const history = [...messages, userMessage];
    const profileSnapshot = profile;
    let streamedSpeech = false;

    // Prepare speak queue before network — must not include setState / XP / Supabase.
    beginSpeakStream();

    // CRITICAL: initiate HTTP immediately on this tick — no state/XP/speech teardown first.
    const replyPromise = requestReply(
      { userMessage: text, history, activeProfile: profileSnapshot },
      {
        ...latencyLive,
        onCaption: (caption, translation) => {
          applyLiveCaption(caption, translation);
          setIsLoading(false);
        },
        onSentence: (sentence) => {
          setIsLoading(false);
          if (!autoSpeak) return;
          streamedSpeech = true;
          enqueueSpeak(sentence);
        },
      },
    );

    // Everything below runs after fetch() has already been invoked.
    unlockSpeech();
    stopListening();
    stopSpeaking();
    setMenuOpen(false);
    setInput("");
    setSpokenReply("");
    setSpokenTranslation("");
    setMessages(history);
    setIsLoading(true);

    const placementDoneBefore = hasCompletedKidsPlacement(user.id, messages, profileSnapshot);
    const placementTurn = isKidsPlacementSession(history, placementDoneBefore)
      ? placementAnswerTurns(history)
      : undefined;

    // XP / placement persistence — never await before/during the chat request.
    void (async () => {
      let activeProfile = profileSnapshot;
      if (!placementDoneBefore && placementAnswerTurns(history) >= 3 && isKidsPlacementSession(history, false)) {
        markKidsPlacementComplete(user.id);
        forcePlacementRef.current = false;
        activeProfile = profileSnapshot
          ? { ...profileSnapshot, placement_completed: true }
          : profileSnapshot;
        if (activeProfile) {
          writeProgressionLocal(user.id, {
            placement_completed: true,
            xp: Number(activeProfile.xp) || 0,
            level: Number(activeProfile.level) || 1,
          });
          void saveProgression(createClient(), user.id, {
            placement_completed: true,
            xp: Number(activeProfile.xp) || 0,
            level: Number(activeProfile.level) || 1,
          });
        }
      }

      if (activeProfile) {
        const gained = xpForUtterance(text);
        const progressed = applyXp(Number(activeProfile.xp) || 0, gained);
        activeProfile = {
          ...activeProfile,
          xp: progressed.xp,
          level: progressed.level,
        };
        writeProgressionLocal(user.id, {
          xp: progressed.xp,
          level: progressed.level,
          placement_completed: Boolean(activeProfile.placement_completed),
        });
        void saveProgression(createClient(), user.id, {
          xp: progressed.xp,
          level: progressed.level,
          placement_completed: Boolean(activeProfile.placement_completed),
        });
        if (progressed.leveledUp) setLevelUp(progressed.info);
        setProfile(activeProfile);
      }
    })();

    try {
      const data = await replyPromise;
      if (data.latency) latencyServerRef.current = data.latency;
      if (!autoSpeak) maybePrintLatencyReport();
      fetchHebrewTranslation(data.aiResponse, profileSnapshot?.gender ?? profile?.gender, text);
      const grammar: GrammarFeedback = data.grammarAnalysis;
      const aiMessage: Message = {
        id: createId(),
        sender: "ai",
        text: data.aiResponse,
        timestamp: Date.now(),
        translation: data.translation,
      };

      setMessages((current) =>
        current
          .map((message) =>
            message.id === userMessage.id ? { ...message, grammarFeedback: grammar } : message,
          )
          .concat(aiMessage),
      );
      setSuggestions(data.suggestedAnswers ?? []);
      setSpokenReply(data.aiResponse);
      setSpokenTranslation(data.translation ?? "");
      setIsLoading(false);
      sendingRef.current = false;
      if (autoSpeak && !streamedSpeech) {
        speak(data.aiResponse);
      }

      void persistMemories(data.newMemories, text, history, placementTurn);
      void persistMessages(user.id, [
        { id: userMessage.id, sender: "user", text, grammarFeedback: grammar },
        {
          id: aiMessage.id,
          sender: "ai",
          text: data.aiResponse,
          translation: data.translation,
        },
      ]);
    } catch {
      flash(`Couldn't reach ${character.name}. Please try again.`);
    } finally {
      sendingRef.current = false;
      setIsLoading(false);
    }
  }

  sendSpokenRef.current = (text) => {
    void sendMessage(text);
  };

  async function handleAnotherQuestion() {
    if (isLoading || !chatUnlocked || !user) return;
    setIsLoading(true);
    beginSpeakStream();
    const { tClientSend, live: latencyLive } = beginLatencyTurn("(change topic)");
    let streamedSpeech = false;
    try {
      const data = await requestReply({ action: "change_topic", history: messages, clientSendAt: tClientSend }, {
        ...latencyLive,
        onCaption: applyLiveCaption,
        onSentence: (sentence) => {
          setIsLoading(false);
          if (!autoSpeak) return;
          streamedSpeech = true;
          enqueueSpeak(sentence);
        },
      });
      if (data.latency) latencyServerRef.current = data.latency;
      if (!autoSpeak) maybePrintLatencyReport();
      fetchHebrewTranslation(data.aiResponse, profile?.gender, "(change topic)");
      const aiMessage: Message = {
        id: createId(),
        sender: "ai",
        text: data.aiResponse,
        timestamp: Date.now(),
        translation: data.translation,
      };
      setMessages((current) => [...current, aiMessage]);
      setSuggestions(data.suggestedAnswers ?? []);
      setSpokenReply(data.aiResponse);
      setSpokenTranslation(data.translation ?? "");
      if (autoSpeak && !streamedSpeech) speak(data.aiResponse);
      void persistMemories(data.newMemories);
      // Fire-and-forget so switching topics doesn't delay TTS.
      void persistMessages(user.id, [{ id: aiMessage.id, sender: "ai", text: data.aiResponse, translation: data.translation }]);
    } catch {
      flash("Couldn't switch topics right now.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleToggleMic() {
    if (isListening) {
      stopListening();
      return;
    }
    if (isLoading || sendingRef.current) return;
    if (!speechSupported.stt) {
      flash(SPEECH_UNAVAILABLE_MESSAGE);
      return;
    }
    unlockSpeech();
    stopSpeaking();
    setSpokenReply("");
    setSpokenTranslation("");
    const started = startListening("en-US");
    if (!started) flash(SPEECH_UNAVAILABLE_MESSAGE);
  }

  async function beginNewChat(nextProfile = profile) {
    if (!user) return;
    stopSpeaking();
    setMenuOpen(false);
    setOpenTranslations({});
    const placementDone = hasCompletedKidsPlacement(user.id, messages, nextProfile);
    forcePlacementRef.current = !placementDone;
    dailyGreetedRef.current = `${user.id}:${new Date().toDateString()}`;
    const snapshot = messages;
    const opener = placementDone ? friendshipMessage(nextProfile) : placementMessage(nextProfile);
    spokenOpenerRef.current = opener.id;
    setMessages([opener]);
    setSpokenReply(opener.text);
    setSpokenTranslation(opener.translation ?? "");
    setSuggestions(placementDone ? ["I played a game!", "It was fun!", "I like that!"] : [...PLACEMENT_SUGGESTIONS[0]]);
    unlockSpeech();
    if (autoSpeak) {
      speak(opener.text);
    }

    const supabase = createClient();
    try {
      const archived = await archiveCurrentChat(supabase, user.id, {
        messages: snapshot,
        characterId: character.id,
        tutorName: character.name,
      });
      if (!archived.success) flash("Started a new chat, but the previous one couldn't be archived.");
      await startFreshChat(supabase, user.id);
      await persistMessages(user.id, [
        { id: opener.id, sender: "ai", text: opener.text, translation: opener.translation },
      ]);
    } catch {
      flash("Started a new chat, but saving it failed.");
    }
  }

  function handleClearChat() {
    void beginNewChat();
  }

  function handleSelectCharacter(characterId: CharacterId) {
    if (!user || !profile) return;
    setCharacterPickerOpen(false);
    setMenuOpen(false);

    const nextCharacter = getCharacter(characterId);
    if (nextCharacter.id === getCharacter(profile.selected_character).id) return;

    stopSpeaking();
    setSelectedTutorId(nextCharacter.id);
    writeStoredTutorId(nextCharacter.id);
    const nextProfile = { ...profile, selected_character: nextCharacter.id };
    setProfile(nextProfile);
    if (messages.length <= 1 && (!messages[0] || isPlacementOpener(messages[0].text))) {
      const opener = placementMessage(nextProfile);
      spokenOpenerRef.current = opener.id;
      setMessages([opener]);
      setSpokenReply(opener.text);
      setSpokenTranslation(opener.translation ?? "");
      unlockSpeech();
      if (autoSpeak) {
        speak(opener.text);
      }
    }
    void saveSelectedCharacter(createClient(), user.id, nextCharacter.id).then((saved) => {
      if (!saved.success) flash("Tutor switched, but saving the choice failed.");
    });
  }

  function handleSaveTutorName(name: string) {
    if (!user || !profile) return;
    const trimmed = name.trim() || getCharacter(profile.selected_character).name;
    const map = { ...parseTutorNicknames(profile.tutor_nicknames), [character.id]: trimmed };
    setProfile({ ...profile, tutor_nicknames: map, custom_tutor_name: trimmed });
    void saveTutorNickname(createClient(), user.id, character.id, trimmed, profile.tutor_nicknames).then((result) => {
      if (!result.success) flash("Couldn't save the tutor nickname.");
    });
  }

  async function handleRestoreSession(session: ArchivedChatSession) {
    if (!user || !profile) return;
    setRestoringId(session.id);
    try {
      const supabase = createClient();
      const restored = await restoreChatSession(supabase, user.id, session, {
        messages,
        characterId: character.id,
        tutorName: character.name,
      });
      const nextCharacter = getCharacter(session.characterId);
      setSelectedTutorId(nextCharacter.id);
      writeStoredTutorId(nextCharacter.id);
      setProfile({ ...profile, selected_character: nextCharacter.id });
      setMessages(restored.length > 0 ? restored : hasCompletedKidsPlacement(user.id, [], profile) ? [friendshipMessage(profile)] : [placementMessage(profile)]);
      setOpenTranslations({});
      setHistoryOpen(false);
      void saveSelectedCharacter(supabase, user.id, nextCharacter.id);
    } catch {
      flash("Couldn't open that chat.");
    } finally {
      setRestoringId(null);
    }
  }

  useEffect(() => {
    if (!chatUnlocked || !historyReady || !autoSpeak) return;
    const first = messages[0];
    if (!first || messages.length !== 1 || first.sender !== "ai" || !isPlacementOpener(first.text)) return;
    if (spokenOpenerRef.current === first.id) return;
    spokenOpenerRef.current = first.id;
    setSpokenReply(first.text);
    setSpokenTranslation(first.translation ?? "");
    speak(first.text);
  }, [autoSpeak, chatUnlocked, historyReady, messages, practiceSettings.voice_speed, speak]);

  useEffect(() => {
    if (!chatUnlocked || !historyReady || !user || isLoading || awaitingGreeting) return;
    if (forcePlacementRef.current) return;
    if (!hasCompletedKidsPlacement(user.id, messages, profile) || isPlacementActive(messages, Boolean(profile?.placement_completed))) return;
    const dayKey = `${user.id}:${new Date().toDateString()}`;
    if (dailyGreetedRef.current === dayKey) return;

    const hasUserToday = messages.some(
      (message) => message.sender === "user" && message.timestamp >= startOfLocalDay(),
    );
    if (hasUserToday) {
      dailyGreetedRef.current = dayKey;
      return;
    }

    const unansweredPlacement =
      messages.length <= 1 &&
      Boolean(messages[0] && isPlacementOpener(messages[0].text)) &&
      placementAnswerTurns(messages) === 0;
    if (unansweredPlacement) return;
    if (memories.length === 0) return;

    dailyGreetedRef.current = dayKey;
    setAwaitingGreeting(true);
    beginSpeakStream();
    void (async () => {
      const { tClientSend, live: latencyLive } = beginLatencyTurn("(daily open)");
      try {
        const data = await requestReply({ action: "daily_open", history: messages, clientSendAt: tClientSend }, {
          ...latencyLive,
          onCaption: applyLiveCaption,
          onSentence: (sentence) => {
            setIsLoading(false);
            if (autoSpeak) enqueueSpeak(sentence);
          },
        });
        if (data.latency) latencyServerRef.current = data.latency;
        if (!autoSpeak) maybePrintLatencyReport();
        fetchHebrewTranslation(data.aiResponse, profile?.gender, "(daily open)");
        const opener: Message = {
          id: createId(),
          sender: "ai",
          text: data.aiResponse,
          timestamp: Date.now(),
          translation: data.translation,
        };
        setMessages((current) => [...current, opener]);
        setSpokenReply(data.aiResponse);
        setSpokenTranslation(data.translation ?? "");
        // Fire-and-forget so greeting audio isn't blocked by chat persistence.
        void persistMessages(user.id, [{ id: opener.id, sender: "ai", text: opener.text, translation: opener.translation }]);
      } catch {
        if (messages.length === 0) {
          setMessages([
            hasCompletedKidsPlacement(user.id, [], profile) ? friendshipMessage(profile) : placementMessage(profile),
          ]);
        }
      } finally {
        setAwaitingGreeting(false);
      }
    })();
  }, [awaitingGreeting, chatUnlocked, historyReady, isLoading, memories.length, messages, user]);

  async function handleSignOut() {
    setMenuOpen(false);
    setCharacterPickerOpen(false);
    setSettingsOpen(false);
    stopSpeaking();
    const supabase = createClient();
    await supabase.auth.signOut();
  }

  async function handleOnboarding(onboardingData: ProfileInput) {
    if (!user) {
      setProfileError("You're not signed in. Please log in again.");
      return;
    }
    setSavingProfile(true);
    setProfileError("");
    try {
      const supabase = createClient();
      const result = await saveProfile(supabase, user.id, onboardingData);
      if (!result.success) {
        setProfileError(result.error);
        return;
      }

      setProfile(result.profile);
      setHistoryReady(true);
      forcePlacementRef.current = true;
      const opener = placementMessage(result.profile);
      spokenOpenerRef.current = opener.id;
      setMessages([opener]);
      setSpokenReply(opener.text);
      setSpokenTranslation(opener.translation ?? "");
      setSuggestions([...PLACEMENT_SUGGESTIONS[0]]);
      unlockSpeech();
      if (autoSpeak) {
        speak(opener.text);
      }
      try {
        await persistMessages(user.id, [
          { id: opener.id, sender: "ai", text: opener.text, translation: opener.translation },
        ]);
        const seeded = await seedProfileMemories(supabase, user.id, result.profile);
        if (seeded.length > 0) setMemories(seeded);
      } catch {
        /* opener can stay local if history insert fails */
      }
    } catch (error) {
      console.error("Supabase Profile Save Error:", error);
      setProfileError(describeProfileSaveError(error));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleInteractiveOnboardingComplete(next: { profile: Profile; memories: UserMemory[] }) {
    if (!user) return;
    setSavingProfile(true);
    setProfileError("");

    try {
      setProfile(next.profile);
      setMemories(next.memories);
      setHistoryReady(true);
      forcePlacementRef.current = false;

      // Personalised first greeting — keep BEGINNER ultra-simple (matches onboarding choice).
      const kidName = (next.profile.full_name ?? next.profile.nickname ?? "").trim() || "friend";
      const kidInterest = next.profile.interests?.[0] ?? "";
      const tutorNameStr = character.name;
      const level = String(next.profile.english_level || "beginner").toLowerCase();
      const isBeginner = level === "beginner" || level.includes("begin");
      const greetingText = isBeginner
        ? kidInterest
          ? `Hi ${kidName}! I am ${tutorNameStr}. Do you like ${kidInterest}?`
          : `Hi ${kidName}! I am ${tutorNameStr}. How are you?`
        : kidInterest
          ? `Hey ${kidName}! I'm ${tutorNameStr}. You like ${kidInterest} — cool! What do you want to talk about?`
          : `Hey ${kidName}! I'm ${tutorNameStr}. What do you want to talk about today?`;
      const greetingTranslation = isBeginner
        ? kidInterest
          ? `היי ${kidName}! אני ${tutorNameStr}. אתה אוהב ${kidInterest}?`
          : `היי ${kidName}! אני ${tutorNameStr}. מה שלומך?`
        : kidInterest
          ? `היי ${kidName}! אני ${tutorNameStr}. אתה אוהב ${kidInterest} — מגניב! על מה בא לך לדבר?`
          : `היי ${kidName}! אני ${tutorNameStr}. על מה בא לך לדבר היום?`;

      const opener = {
        id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`,
        sender: "ai" as const,
        text: greetingText,
        timestamp: Date.now(),
        translation: greetingTranslation,
      };

      spokenOpenerRef.current = opener.id;
      setMessages([opener]);
      setSpokenReply(opener.text);
      setSpokenTranslation(opener.translation);
      setSuggestions(
        isBeginner
          ? ["Yes!", "I like it!", "Hi!"]
          : ["That sounds fun!", "Let's play!", "Tell me more!"],
      );

      unlockSpeech();
      if (autoSpeak) speak(opener.text);

      try {
        await persistMessages(user.id, [
          { id: opener.id, sender: "ai", text: opener.text, translation: opener.translation },
        ]);
      } catch {
        /* opener can stay local if history insert fails */
      }
    } catch (e) {
      console.error(e);
      setProfileError("Couldn't start the onboarding chat. Please try again.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSaveSettings(next: SettingsSavePayload) {
    if (!user || !profile) return;
    setSavingSettings(true);
    setSettingsError("");
    setProfile((current) =>
      current
        ? {
            ...current,
            nickname: next.nickname,
            name_pronunciation: next.name_pronunciation,
            daily_goal_minutes: next.daily_goal_minutes,
            preferred_practice_time: next.preferred_practice_time,
            notifications_enabled: next.notifications_enabled,
            parent_whatsapp: next.parent_whatsapp,
            voice_speed: next.voice_speed,
            preferred_voice: next.preferred_voice,
          }
        : current,
    );
    setVoiceSpeed(next.voice_speed);
    writeStoredVoiceSpeed(next.voice_speed);

    try {
      const result = await savePracticeSettings(createClient(), user.id, next);
      if (!result.success) {
        setSettingsError(result.error);
        return;
      }
      setSettingsOpen(false);
      flash("Practice settings saved.");
    } catch (error) {
      setSettingsError(describeProfileSaveError(error));
    } finally {
      setSavingSettings(false);
    }
  }

  function handleShareWhatsApp() {
    const phone = practiceSettings.parent_whatsapp;
    if (!normalizeWhatsAppPhone(phone)) {
      dismissCelebration();
      openSettings();
      flash("Add a parent WhatsApp number first.");
      return;
    }

    const text = buildParentWhatsAppMessage({
      childName: profile?.nickname ?? "",
      gender: profile?.gender,
      minutes: Math.max(practicedMinutes, practiceSettings.daily_goal_minutes),
      characterName: character.name,
      topics: extractPracticeTopics(messages, profile?.interests ?? []),
    });
    const url = whatsappShareUrl(phone, text);
    if (!url) {
      flash("Couldn't open WhatsApp. Check the phone number.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <main className="h-dvh overflow-hidden bg-[#050805]">
      <div
        className="relative mx-auto flex max-w-md flex-col overflow-hidden bg-[#050805]"
        data-chat-layout="voice-being"
        style={{
          ["--accent" as string]: character.accentColor,
          height: viewport.height ? `${viewport.height}px` : "100dvh",
          transform: viewport.offsetTop ? `translateY(${viewport.offsetTop}px)` : undefined,
        }}
      >
        {!authReady ? <LoadingScreen label="Getting things ready…" /> : null}
        <DocumentTitle tutorName={chatUnlocked ? character.name : ""} />
        {authReady && !user && profileChecked ? (
          <AuthModal
            onAuthenticated={() => {
              void createClient()
                .auth.getUser()
                .then(({ data }) => bootstrapUser(data.user ?? null));
            }}
          />
        ) : null}
        {needsInteractiveOnboarding && user ? (
          <InteractiveOnboarding
            user={user}
            character={character}
            initialProfile={profile}
            onComplete={(next) => void handleInteractiveOnboardingComplete(next)}
          />
        ) : needsOnboarding && onboardingDone ? (
          <OnboardingModal
            saving={savingProfile}
            error={profileError}
            onComplete={(next) => void handleOnboarding(next)}
          />
        ) : null}

        <ChatTopBar
          character={character}
          autoSpeak={autoSpeak}
          onToggleSpeak={() => {
            unlockSpeech();
            setAutoSpeak((value) => {
              if (value) stopSpeaking();
              return !value;
            });
          }}
          onOpenCharacters={openCharacterPicker}
          onOpenVoiceSettings={() => openSettings(true)}
          onOpenHistory={openHistory}
          menuOpen={menuOpen}
          onToggleMenu={() => setMenuOpen((value) => !value)}
          onClearChat={handleClearChat}
          onOpenSettings={() => openSettings(false)}
          onSignOut={() => void handleSignOut()}
          practicedMinutes={practicedMinutes}
          dailyGoalMinutes={practiceSettings.daily_goal_minutes}
          xp={Number(profile?.xp) || 0}
          level={Number(profile?.level) || 1}
        />

        <VoiceStage
          character={character}
          tutorName={character.name}
          thinking={isLoading || awaitingGreeting}
          speaking={isSpeaking}
          listening={isListening}
          transcript={transcript}
          audioLevel={audioLevel}
          audioLevelRef={audioLevelRef}
          speakingText={speakingText}
          aiCaption={spokenReply}
          aiTranslation={spokenTranslation}
          autoSpeak={autoSpeak}
          voiceSpeed={formatVoiceSpeed(voiceSpeed)}
          disabled={isLoading || awaitingGreeting || !chatUnlocked}
          onToggleMic={handleToggleMic}
          onSendText={(text) => {
            unlockSpeech();
            void sendMessage(text);
          }}
          onToggleSpeak={() => {
            unlockSpeech();
            setAutoSpeak((value) => {
              if (value) stopSpeaking();
              return !value;
            });
          }}
          onCycleVoiceSpeed={() => {
            const next = nextVoiceSpeed(voiceSpeed);
            setVoiceSpeed(next);
            writeStoredVoiceSpeed(next);
          }}
          onOpenCharacters={openCharacterPicker}
          onSetVolume={setVolume}
        />

        {notice ? (
          <p className="pointer-events-none absolute inset-x-0 bottom-40 z-40 px-6 text-center text-xs font-medium text-amber-100/90">
            {notice}
          </p>
        ) : null}

        {characterPickerOpen ? (
          <CharacterSelectorModal
            selectedId={character.id}
            nicknames={parseTutorNicknames(profile?.tutor_nicknames)}
            onSelect={handleSelectCharacter}
            onClose={() => setCharacterPickerOpen(false)}
          />
        ) : null}

        {settingsOpen ? (
          <SettingsModal
            key={`${practiceSettings.daily_goal_minutes}-${practiceSettings.preferred_practice_time}-${practiceSettings.parent_whatsapp}-${practiceSettings.notifications_enabled}-${practiceSettings.voice_speed}-${practiceSettings.preferred_voice}-${profile?.nickname ?? ""}-${profile?.name_pronunciation ?? ""}`}
            settings={practiceSettings}
            nickname={profile?.nickname ?? ""}
            namePronunciation={profile?.name_pronunciation ?? ""}
            characterName={character.name}
            voices={voices}
            saving={savingSettings}
            error={settingsError}
            focusVoice={settingsFocusVoice}
            onSave={(next) => void handleSaveSettings(next)}
            onPreviewVoice={(speed, voiceUri) =>
              speak(
                `Hi ${profile?.nickname?.trim() || "there"}! I'm ${character.name}. Let's practice English together.`,
                {
                  rateMultiplier: speed,
                  voiceUri,
                },
              )
            }
            onClose={() => setSettingsOpen(false)}
          />
        ) : null}

        {historyOpen ? (
          <PreviousChatsModal
            sessions={sessions}
            loading={sessionsLoading}
            error={sessionsError}
            restoringId={restoringId}
            onRestore={(session) => void handleRestoreSession(session)}
            onClose={() => setHistoryOpen(false)}
          />
        ) : null}

        {levelUp ? <LevelUpBurst info={levelUp} onDone={() => setLevelUp(null)} /> : null}

        {celebrationOpen && userMessageCountToday >= 2 ? (
          <GoalCelebrationModal
            character={character}
            minutes={practicedMinutes}
            goalMinutes={practiceSettings.daily_goal_minutes}
            messageCount={countUserMessagesToday(messages)}
            topics={extractPracticeTopics(messages, profile?.interests ?? [])}
            canShareWhatsApp={Boolean(normalizeWhatsAppPhone(practiceSettings.parent_whatsapp))}
            onShareWhatsApp={handleShareWhatsApp}
            onClose={dismissCelebration}
          />
        ) : null}
      </div>
    </main>
  );
}
