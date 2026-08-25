"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthModal } from "@/components/AuthModal";
import { CharacterSelectorModal } from "@/components/CharacterSelectorModal";
import { ChatTopBar } from "@/components/ChatTopBar";
import { TranscriptHistoryModal } from "@/components/TranscriptHistoryModal";
import { DocumentTitle } from "@/components/DocumentTitle";
import { GoalCelebrationModal } from "@/components/GoalCelebrationModal";
import { LevelUpBurst } from "@/components/LevelUpBurst";
import { LoadingScreen } from "@/components/LoadingScreen";
import { OnboardingModal } from "@/components/OnboardingModal";
import { InteractiveOnboarding } from "@/components/InteractiveOnboarding";
import { ProfileEditModal, type ProfileEditPayload } from "@/components/ProfileEditModal";
import { SettingsModal } from "@/components/SettingsModal";
import { ProgressModal } from "@/components/ProgressModal";
import { PracticeMomentsRecorder } from "@/components/PracticeMomentsRecorder";
import { ChatGameCard } from "@/components/ChatGameCard";
import { VoiceStage } from "@/components/VoiceStage";
import { useSpeech, SPEECH_UNAVAILABLE_MESSAGE, MIC_PERMISSION_MESSAGE } from "@/hooks/useSpeech";
import { useVisualViewport } from "@/hooks/useVisualViewport";
import { useNotifications, playReminderSound } from "@/hooks/useNotifications";
import { loadWeekMinutes, loadTutorsMet, rememberTutorMet } from "@/lib/learning-progress";
import {
  archiveCurrentChat,
  describeProfileSaveError,
  fetchProfile,
  listChatSessions,
  loadUserMemories,
  restoreChatSession,
  saveMessage,
  isProfileComplete,
  isIntroProfileComplete,
  loadChatHistory,
  rememberKidTurn,
  saveProfile,
  savePracticeSettings,
  saveProgression,
  saveSelectedCharacter,
  saveTutorNickname,
  seedProfileMemories,
  startFreshChat,
  writeIntroLearningGoals,
  type ArchivedChatSession,
} from "@/lib/chat-history";
import { getCharacter, isCharacterId, readStoredTutorId, writeStoredTutorId, type CharacterId } from "@/lib/characters";
import { useDailyPractice } from "@/hooks/useDailyPractice";
import { quickHebrewSubtitle, shouldSkipLlmTranslate, isCleanHebrewSubtitle } from "@/lib/hebrew";
import { logConversationPedagogyReport } from "@/lib/conversation-pedagogy";
import { parseTutorNicknames, profilePayload, withTutorDisplayName } from "@/lib/learner";
import { consumeChatStream, speakableSentences } from "@/lib/chat-stream";
import { createQuickGameRound, expandToGameRound, extractGameFromText, GAME_XP_REWARD, stripGameTag, type ChatGame } from "@/lib/chat-games";
import {
  logPipelineLatencyReport,
  type PipelineClientMetrics,
  type PipelineServerMetrics,
} from "@/lib/pipeline-latency";
import { timeOfDayGreeting } from "@/lib/daypart";
import { mergeTranscriptMessages, readTranscriptCache, writeTranscriptCache } from "@/lib/transcript-cache";
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
  useNotifications();
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
  const [progressOpen, setProgressOpen] = useState(false);
  const [practiceMomentsOn, setPracticeMomentsOn] = useState(false);
  const [trophyTick, setTrophyTick] = useState(0);
  const [sessions, setSessions] = useState<ArchivedChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [profileQuizOpen, setProfileQuizOpen] = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [savingProfileDetails, setSavingProfileDetails] = useState(false);
  const [profileEditError, setProfileEditError] = useState("");
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [notice, setNotice] = useState("");
  const [levelUp, setLevelUp] = useState<LevelInfo | null>(null);

  const sendingRef = useRef(false);
  const sendSpokenRef = useRef<(text: string) => void>(() => {});
  const startListeningRef = useRef<(lang?: "en-US" | "he-IL") => boolean>(() => false);
  const spokenOpenerRef = useRef("");
  const forcePlacementRef = useRef(false);
  const dailyGreetedRef = useRef("");
  const canAutoListenRef = useRef(false);
  const latencyClientRef = useRef<PipelineClientMetrics | null>(null);
  const latencyServerRef = useRef<PipelineServerMetrics | null>(null);
  const latencyReportPrintedRef = useRef(false);
  const [spokenReply, setSpokenReply] = useState("");
  const [spokenTranslation, setSpokenTranslation] = useState("");
  const [gameRound, setGameRound] = useState<ChatGame[] | null>(null);
  const gameActiveRef = useRef(false);
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

  useEffect(() => {
    if (user?.id) rememberTutorMet(user.id, character.id);
  }, [user?.id, character.id]);

  useEffect(() => {
    gameActiveRef.current = Boolean(gameRound);
  }, [gameRound]);

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
    onFinalTranscript: (text) => {
      if (gameActiveRef.current) return;
      sendSpokenRef.current(text);
    },
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
    onSpeakEnd: () => {
      if (gameActiveRef.current || !canAutoListenRef.current) return;
      window.setTimeout(() => {
        if (gameActiveRef.current || !canAutoListenRef.current) return;
        startListeningRef.current("en-US");
      }, 140);
    },
  });
  const recorderSupported = typeof MediaRecorder !== "undefined";
  startListeningRef.current = startListening;
  canAutoListenRef.current =
    chatUnlocked && !isLoading && !awaitingGreeting && !sendingRef.current && speechSupported.stt && !gameRound;
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
    characterId: character.id,
    kidName: profile?.nickname ?? "",
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

  function openHistoryHub() {
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

  useEffect(() => {
    if (!user?.id || messages.length === 0) return;
    writeTranscriptCache(user.id, messages);
  }, [user?.id, messages]);

  const flash = useCallback((text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(""), 2800);
  }, []);

  const applyLiveCaption = useCallback((caption: string, translation: string) => {
    const { spoken, game } = extractGameFromText(caption);
    if (game) setGameRound(expandToGameRound(game));
    setSpokenReply(spoken);
    const next = translation.trim();
    if (next) setSpokenTranslation(next);
  }, []);

  const ingestTutorReply = useCallback((raw: string) => {
    const { spoken, game } = extractGameFromText(raw);
    if (game) setGameRound(expandToGameRound(game));
    return spoken;
  }, []);

  const awardGameXp = useCallback(() => {
    if (!user || !profile) return;
    const progressed = applyXp(Number(profile.xp) || 0, GAME_XP_REWARD);
    const next = { ...profile, xp: progressed.xp, level: progressed.level };
    writeProgressionLocal(user.id, {
      xp: progressed.xp,
      level: progressed.level,
      placement_completed: Boolean(next.placement_completed),
    });
    void saveProgression(createClient(), user.id, {
      xp: progressed.xp,
      level: progressed.level,
      placement_completed: Boolean(next.placement_completed),
    });
    if (progressed.leveledUp) setLevelUp(progressed.info);
    setProfile(next);
  }, [profile, user]);

  const fetchHebrewTranslation = useCallback((english: string, gender?: Profile["gender"] | null, userInput = "") => {
    const text = stripGameTag(english).trim();
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
          if (isCleanHebrewSubtitle(next) || /[\u0590-\u05FF]/.test(next)) {
            hebrew = next;
            setSpokenTranslation(next);
            setMessages((current) => {
              for (let i = current.length - 1; i >= 0; i -= 1) {
                if (current[i].sender === "ai") {
                  if (current[i].translation === next) return current;
                  const copy = current.slice();
                  copy[i] = { ...copy[i], translation: next };
                  return copy;
                }
              }
              return current;
            });
          } else if (!hebrew) {
            /* keep any Hebrew already on screen */
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
          const cached = readTranscriptCache(nextUser.id);
          const mergedHistory = mergeTranscriptMessages(history, cached);
          const placementDone = hasCompletedKidsPlacement(nextUser.id, mergedHistory, mergedProfile);
          if (placementDone && mergedHistory.length > 0) {
            setMessages(mergedHistory);
            writeTranscriptCache(nextUser.id, mergedHistory);
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
      const result = await saveMessage(supabase, userId, {
        id: entry.id,
        sender: entry.sender,
        text: entry.text,
        translation: entry.translation,
        grammarFeedback: entry.grammarFeedback,
        createdAt: entry.createdAt ?? Date.now(),
      });
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
        localHour: new Date().getHours(),
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

    // Clear prior mic/TTS, then arm the stream queue before network work.
    stopListening();
    stopSpeaking();
    beginSpeakStream();

    // CRITICAL: initiate HTTP immediately on this tick — no state/XP after this.
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
          enqueueSpeak(stripGameTag(sentence));
        },
      },
    );

    // Everything below runs after fetch() has already been invoked.
    unlockSpeech();
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
      const spoken = ingestTutorReply(data.aiResponse);
      const grammar: GrammarFeedback = data.grammarAnalysis;
      const aiMessage: Message = {
        id: createId(),
        sender: "ai",
        text: spoken,
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
      setSpokenReply(spoken);
      if (data.translation?.trim()) setSpokenTranslation(data.translation);
      setIsLoading(false);
      sendingRef.current = false;
      if (autoSpeak && !streamedSpeech) {
        speak(spoken);
      }

      void persistMemories(data.newMemories, text, history, placementTurn);
      void persistMessages(user.id, [
        { id: userMessage.id, sender: "user", text, grammarFeedback: grammar, createdAt: userMessage.timestamp },
        {
          id: aiMessage.id,
          sender: "ai",
          text: spoken,
          translation: data.translation,
          createdAt: aiMessage.timestamp,
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
    stopListening();
    stopSpeaking();
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
          enqueueSpeak(stripGameTag(sentence));
        },
      });
      if (data.latency) latencyServerRef.current = data.latency;
      if (!autoSpeak) maybePrintLatencyReport();
      fetchHebrewTranslation(data.aiResponse, profile?.gender, "(change topic)");
      const spoken = ingestTutorReply(data.aiResponse);
      const aiMessage: Message = {
        id: createId(),
        sender: "ai",
        text: spoken,
        timestamp: Date.now(),
        translation: data.translation,
      };
      setMessages((current) => [...current, aiMessage]);
      setSuggestions(data.suggestedAnswers ?? []);
      setSpokenReply(spoken);
      if (data.translation?.trim()) setSpokenTranslation(data.translation);
      if (autoSpeak && !streamedSpeech) speak(spoken);
      void persistMemories(data.newMemories);
      void persistMessages(user.id, [{ id: aiMessage.id, sender: "ai", text: spoken, translation: data.translation, createdAt: aiMessage.timestamp }]);
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
        { id: opener.id, sender: "ai", text: opener.text, translation: opener.translation, createdAt: opener.timestamp },
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
    if (!user) return;
    setHistoryOpen(false);
    setRestoringId(session.id);
    const nextCharacter = getCharacter(session.characterId);
    setSelectedTutorId(nextCharacter.id);
    writeStoredTutorId(nextCharacter.id);
    const thread = session.messages?.length ? session.messages : [];
    setMessages(thread);
    writeTranscriptCache(user.id, thread);
    setOpenTranslations({});
    if (profile) {
      setProfile({ ...profile, selected_character: nextCharacter.id });
    }
    try {
      const supabase = createClient();
      const restored = await restoreChatSession(supabase, user.id, session, {
        messages,
        characterId: character.id,
        tutorName: character.name,
      });
      if (restored.length > 0) {
        setMessages(restored);
        writeTranscriptCache(user.id, restored);
      }
      void saveSelectedCharacter(supabase, user.id, nextCharacter.id);
    } catch {
      flash("Opened locally — couldn't sync that chat to the server.");
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
            if (autoSpeak) enqueueSpeak(stripGameTag(sentence));
          },
        });
        if (data.latency) latencyServerRef.current = data.latency;
        if (!autoSpeak) maybePrintLatencyReport();
        fetchHebrewTranslation(data.aiResponse, profile?.gender, "(daily open)");
        const spoken = ingestTutorReply(data.aiResponse);
        const opener: Message = {
          id: createId(),
          sender: "ai",
          text: spoken,
          timestamp: Date.now(),
          translation: data.translation,
        };
        setMessages((current) => [...current, opener]);
        setSpokenReply(spoken);
        if (data.translation?.trim()) setSpokenTranslation(data.translation);
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
          { id: opener.id, sender: "ai", text: opener.text, translation: opener.translation, createdAt: opener.timestamp },
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

  async function handleInteractiveOnboardingComplete(
    next: { profile: Profile; memories: UserMemory[] },
    options?: { keepChat?: boolean },
  ) {
    if (!user) return;
    setSavingProfile(true);
    setProfileError("");

    try {
      setProfile(next.profile);
      setMemories(next.memories);
      setHistoryReady(true);
      forcePlacementRef.current = false;
      if (options?.keepChat) return;

      // Personalised first greeting — keep BEGINNER ultra-simple (matches onboarding choice).
      const kidName = (next.profile.full_name ?? next.profile.nickname ?? "").trim() || "friend";
      const tutorNameStr = character.name;
      const tod = timeOfDayGreeting(kidName);
      const greetingText = `${tod.en.slice(0, tod.en.indexOf("!") + 1)} I'm ${tutorNameStr}. ${tod.en.slice(tod.en.indexOf("!") + 1).trim()}`;
      const greetingTranslation = tod.he;

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
      setSuggestions(tod.suggestions);

      unlockSpeech();
      if (autoSpeak) speak(opener.text);

      try {
        await persistMessages(user.id, [
          { id: opener.id, sender: "ai", text: opener.text, translation: opener.translation, createdAt: opener.timestamp },
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

  async function handleSaveProfileDetails(next: ProfileEditPayload) {
    if (!user || !profile) return;
    setSavingProfileDetails(true);
    setProfileEditError("");
    try {
      const result = await saveProfile(createClient(), user.id, {
        nickname: next.nickname,
        name: next.nickname,
        age: next.age,
        gender: profile.gender,
        english_level: next.english_level,
        interests: next.interests,
        selected_character: profile.selected_character,
        name_pronunciation: profile.name_pronunciation,
      });
      if (!result.success) {
        setProfileEditError(result.error);
        return;
      }
      writeIntroLearningGoals(next.learning_goal);
      setProfile(result.profile);
      setProfileEditOpen(false);
      flash("Profile saved / הפרופיל נשמר");
    } catch (error) {
      setProfileEditError(describeProfileSaveError(error));
    } finally {
      setSavingProfileDetails(false);
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
            initialProfile={profile}
            onComplete={(next) => void handleOnboarding(next)}
          />
        ) : profileQuizOpen && user ? (
          <InteractiveOnboarding
            user={user}
            character={character}
            initialProfile={profile}
            onComplete={async (next) => {
              setProfileQuizOpen(false);
              await handleInteractiveOnboardingComplete(next, { keepChat: true });
            }}
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
          onOpenHistory={openHistoryHub}
          onOpenTranscript={openHistoryHub}
          recording={practiceMomentsOn}
          recorderSupported={recorderSupported}
          hasRecordingClip
          onToggleRecording={() => {
            setMenuOpen(false);
            setPracticeMomentsOn((value) => !value);
          }}
          onDownloadRecording={() => {
            setMenuOpen(false);
            setTrophyTick((value) => value + 1);
          }}
          menuOpen={menuOpen}
          onToggleMenu={() => setMenuOpen((value) => !value)}
          onClearChat={handleClearChat}
          onOpenSettings={() => openSettings(false)}
          onOpenProgress={() => {
            setMenuOpen(false);
            setProgressOpen(true);
          }}
          onEditProfile={() => {
            setMenuOpen(false);
            setSettingsOpen(false);
            setProfileEditOpen(true);
          }}
          onSignOut={() => void handleSignOut()}
          practicedMinutes={practicedMinutes}
          dailyGoalMinutes={practiceSettings.daily_goal_minutes}
          xp={Number(profile?.xp) || 0}
          level={Number(profile?.level) || 1}
          showProfileReminder={
            Boolean(
              chatUnlocked &&
                !needsInteractiveOnboarding &&
                profile &&
                !isIntroProfileComplete(profile),
            )
          }
          onOpenProfileReminder={() => setProfileQuizOpen(true)}
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
          onChangeTopic={() => void handleAnotherQuestion()}
          onStartQuickGame={() => setGameRound(createQuickGameRound())}
          gameOverlay={
            gameRound ? (
              <ChatGameCard
                games={gameRound}
                liveTranscript={transcript}
                listening={isListening}
                isSpeaking={isSpeaking}
                audioLevel={audioLevel}
                onRequestListen={() => {
                  if (isSpeaking) return;
                  unlockSpeech();
                  startListening("en-US");
                }}
                onStopListen={() => stopListening()}
                onStopSpeaking={() => stopSpeaking()}
                onSpeakPrompt={(word) => {
                  unlockSpeech();
                  stopListening();
                  speak(word);
                }}
                onClose={() => setGameRound(null)}
                onQuestionCorrect={() => {
                  awardGameXp();
                  void playReminderSound("pop");
                }}
                onRoundComplete={(answers) => {
                  setGameRound(null);
                  void playReminderSound("fanfare");
                  void sendMessage(
                    `I finished the 3-question game! My answers were ${answers.join(", ")}.`,
                  );
                }}
              />
            ) : null
          }
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
          offsetForBanner={Boolean(
            chatUnlocked && !needsInteractiveOnboarding && profile && !isIntroProfileComplete(profile),
          )}
        />

        <PracticeMomentsRecorder
          active={practiceMomentsOn}
          listening={isListening}
          childName={profile?.nickname || "Buddy"}
          tutorName={character.name}
          minutes={practicedMinutes}
          xp={Number(profile?.xp) || 0}
          messages={messages}
          parentPhone={practiceSettings.parent_whatsapp}
          trophyTick={trophyTick}
          onError={(message) => flash(message)}
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
            characterId={character.id}
            voices={voices}
            saving={savingSettings}
            error={settingsError}
            focusVoice={settingsFocusVoice}
            autoSpeak={autoSpeak}
            onToggleSpeak={() => {
              unlockSpeech();
              setAutoSpeak((value) => {
                if (value) stopSpeaking();
                return !value;
              });
            }}
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
            onEditIntro={() => {
              setSettingsOpen(false);
              setMenuOpen(false);
              setProfileEditOpen(true);
            }}
            onClose={() => setSettingsOpen(false)}
          />
        ) : null}

        {profileEditOpen && profile ? (
          <ProfileEditModal
            profile={profile}
            saving={savingProfileDetails}
            error={profileEditError}
            onSave={(next) => void handleSaveProfileDetails(next)}
            onClose={() => {
              setProfileEditOpen(false);
              setProfileEditError("");
            }}
          />
        ) : null}

        {progressOpen ? (
          <ProgressModal
            xp={Number(profile?.xp) || 0}
            messages={messages}
            sessions={sessions}
            weekMinutes={user?.id ? loadWeekMinutes(user.id) : {}}
            tutorsMet={user?.id ? loadTutorsMet(user.id) : []}
            currentTutorId={character.id}
            goalMinutes={practiceSettings.daily_goal_minutes}
            practicedMinutesToday={practicedMinutes}
            onClose={() => setProgressOpen(false)}
          />
        ) : null}

        {historyOpen ? (
          <TranscriptHistoryModal
            messages={messages}
            tutorName={character.name}
            childName={profile?.nickname || "You"}
            sessions={sessions}
            sessionsLoading={sessionsLoading}
            sessionsError={sessionsError}
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
