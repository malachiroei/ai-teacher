"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthModal } from "@/components/AuthModal";
import { CharacterSelectorModal } from "@/components/CharacterSelectorModal";
import { ChatTopBar } from "@/components/ChatTopBar";
import { PreviousChatsModal } from "@/components/PreviousChatsModal";
import { GoalCelebrationModal } from "@/components/GoalCelebrationModal";
import { LoadingScreen } from "@/components/LoadingScreen";
import { OnboardingModal } from "@/components/OnboardingModal";
import { SettingsModal } from "@/components/SettingsModal";
import { VoiceStage } from "@/components/VoiceStage";
import { useSpeech, SPEECH_UNAVAILABLE_MESSAGE } from "@/hooks/useSpeech";
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
  saveProfile,
  savePracticeSettings,
  saveSelectedCharacter,
  saveTutorNickname,
  startFreshChat,
  upsertUserMemories,
  type ArchivedChatSession,
} from "@/lib/chat-history";
import { getCharacter, type CharacterId } from "@/lib/characters";
import { useDailyPractice } from "@/hooks/useDailyPractice";
import { preferredSpeechLangFromText } from "@/lib/language";
import { buildWelcomeMessage, parseTutorNicknames, profilePayload, withTutorDisplayName } from "@/lib/learner";
import type { UserMemory } from "@/lib/memory";
import {
  buildParentWhatsAppMessage,
  countUserMessagesToday,
  extractPracticeTopics,
  normalizeWhatsAppPhone,
  practiceSettingsFromProfile,
  startOfLocalDay,
  whatsappShareUrl,
} from "@/lib/practice";
import { createClient } from "@/lib/supabase/client";
import type { Profile, ProfileInput } from "@/lib/supabase/types";
import type { ChatApiResponse, GrammarFeedback, Message } from "@/types/chat";
import type { SettingsSavePayload } from "@/components/SettingsModal";
import { withTimeout } from "@/lib/utils";

const INITIAL_SUGGESTIONS = [
  "I'm doing great, thanks!",
  "A little tired, but okay.",
  "Excited to practice English.",
];

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const [profileChecked, setProfileChecked] = useState(false);
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

  const pendingTranscript = useRef("");
  const wasListening = useRef(false);
  const dailyOpenRef = useRef("");
  const viewport = useVisualViewport();
  const needsOnboarding = Boolean(user && profileChecked && !isProfileComplete(profile));
  const chatUnlocked = Boolean(user && isProfileComplete(profile));
  const character = withTutorDisplayName(getCharacter(profile?.selected_character), profile);
  const practiceSettings = practiceSettingsFromProfile(profile);
  const {
    speak,
    stopSpeaking,
    startListening,
    stopListening,
    isListening,
    transcript,
    speechSupported,
    voices,
    isSpeaking,
  } = useSpeech({
    character,
    rateMultiplier: practiceSettings.voice_speed,
    preferredVoiceUri: practiceSettings.preferred_voice,
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
    engaged: isListening || isSpeaking || isLoading,
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

  const flash = useCallback((text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(""), 2800);
  }, []);

  const bootstrapUser = useCallback(async (nextUser: User | null) => {
    setUser(nextUser);
    setProfile(null);
    setHistoryReady(false);
    setProfileChecked(false);
    setMessages([]);
    setMemories([]);
    dailyOpenRef.current = "";
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
      setProfile(nextProfile);
      setProfileChecked(true);

      if (isProfileComplete(nextProfile)) {
        try {
          const history = await withTimeout(loadChatHistory(supabase, nextUser.id), 2000, [] as Message[]);
          setMessages(history.length > 0 ? history : [buildWelcomeMessage(nextProfile)]);
        } catch {
          setMessages([buildWelcomeMessage(nextProfile)]);
          flash("Couldn't load your chat history.");
        }
        void loadUserMemories(supabase, nextUser.id)
          .then((nextMemories) => setMemories(nextMemories))
          .catch(() => setMemories([]));
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

  useEffect(() => {
    if (isListening) {
      wasListening.current = true;
      if (transcript) {
        setInput(transcript);
        pendingTranscript.current = transcript;
      }
      return;
    }

    if (!wasListening.current) return;
    wasListening.current = false;
    const spoken = (pendingTranscript.current || transcript).trim();
    pendingTranscript.current = "";
    if (spoken) void sendMessage(spoken);
  }, [isListening, transcript]);

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

  async function persistMemories(incoming?: ChatApiResponse["newMemories"]) {
    if (!user || !incoming?.length) return;
    try {
      const next = await upsertUserMemories(createClient(), user.id, memories, incoming);
      setMemories(next);
    } catch {
      /* memory save is best-effort */
    }
  }

  async function requestReply(payload: {
    userMessage?: string;
    action?: "chat" | "change_topic" | "daily_open";
    history: Message[];
  }): Promise<ChatApiResponse> {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userMessage: payload.userMessage ?? "",
        action: payload.action ?? "chat",
        messages: payload.history.map(({ sender, text }) => ({ sender, text })),
        profile: profilePayload(profile),
        characterId: character.id,
        memories,
        isFirstSessionToday: !payload.history.some(
          (message) => message.sender === "user" && message.timestamp >= startOfLocalDay(),
        ),
      }),
    });

    if (!response.ok) {
      throw new Error("Chat request failed");
    }

    return (await response.json()) as ChatApiResponse;
  }

  async function sendMessage(rawText: string) {
    const text = rawText.trim();
    if (!text || isLoading || !chatUnlocked || !user) return;

    stopListening();
    setMenuOpen(false);
    setInput("");

    const userMessage: Message = {
      id: createId(),
      sender: "user",
      text,
      timestamp: Date.now(),
    };

    const history = [...messages, userMessage];
    setMessages(history);
    setIsLoading(true);

    try {
      const data = await requestReply({ userMessage: text, history });
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
      if (autoSpeak) speak(data.aiResponse);

      void persistMemories(data.newMemories);

      const saved = await persistMessages(user.id, [
          { id: userMessage.id, sender: "user", text, grammarFeedback: grammar },
          {
            id: aiMessage.id,
            sender: "ai",
            text: data.aiResponse,
            translation: data.translation,
          },
        ]);
      if (!saved) flash("Reply sent, but saving the chat failed.");
    } catch {
      flash(`Couldn't reach ${character.name}. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAnotherQuestion() {
    if (isLoading || !chatUnlocked || !user) return;
    setIsLoading(true);
    try {
      const data = await requestReply({ action: "change_topic", history: messages });
      const aiMessage: Message = {
        id: createId(),
        sender: "ai",
        text: data.aiResponse,
        timestamp: Date.now(),
        translation: data.translation,
      };
      setMessages((current) => [...current, aiMessage]);
      setSuggestions(data.suggestedAnswers ?? []);
      if (autoSpeak) speak(data.aiResponse);
      void persistMemories(data.newMemories);
      try {
        await persistMessages(user.id, [
          { id: aiMessage.id, sender: "ai", text: data.aiResponse, translation: data.translation },
        ]);
      } catch {
        flash("Couldn't save the new topic.");
      }
    } catch {
      flash("Couldn't switch topics right now.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleToggleMic() {
    if (isListening) {
      stopListening();
      return;
    }
    if (!speechSupported.stt) {
      flash(SPEECH_UNAVAILABLE_MESSAGE);
      return;
    }
    const lastUserText = [...messages].reverse().find((message) => message.sender === "user")?.text ?? "";
    try {
      const started = await startListening(
        preferredSpeechLangFromText(input) ?? preferredSpeechLangFromText(lastUserText),
      );
      if (!started) flash(SPEECH_UNAVAILABLE_MESSAGE);
    } catch {
      flash(SPEECH_UNAVAILABLE_MESSAGE);
    }
  }

  async function beginNewChat(nextProfile = profile) {
    if (!user) return;
    stopSpeaking();
    setMenuOpen(false);
    setOpenTranslations({});
    const snapshot = messages;
    const welcome = buildWelcomeMessage(nextProfile);
    setMessages([welcome]);
    setSuggestions(INITIAL_SUGGESTIONS);

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
        { id: welcome.id, sender: "ai", text: welcome.text, translation: welcome.translation },
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
    setProfile({ ...profile, selected_character: nextCharacter.id });
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
      setProfile({ ...profile, selected_character: nextCharacter.id });
      setMessages(restored.length > 0 ? restored : [buildWelcomeMessage(profile)]);
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
    if (!chatUnlocked || !user || !historyReady || memories.length === 0 || isLoading) return;
    const dayKey = `${user.id}:${new Date().toDateString()}`;
    if (dailyOpenRef.current === dayKey) return;
    const hasUserToday = messages.some(
      (message) => message.sender === "user" && message.timestamp >= startOfLocalDay(),
    );
    if (hasUserToday) {
      dailyOpenRef.current = dayKey;
      return;
    }
    const welcomeOnly = messages.length > 0 && messages.every((message) => message.sender === "ai") && messages.length <= 2;
    if (!welcomeOnly) {
      dailyOpenRef.current = dayKey;
      return;
    }

    dailyOpenRef.current = dayKey;
    void (async () => {
      try {
        const data = await requestReply({ action: "daily_open", history: messages });
        const opener: Message = {
          id: createId(),
          sender: "ai",
          text: data.aiResponse,
          timestamp: Date.now(),
          translation: data.translation,
        };
        setMessages([opener]);
        setSuggestions(data.suggestedAnswers ?? []);
        const supabase = createClient();
        await startFreshChat(supabase, user.id);
        await persistMessages(user.id, [
          { id: opener.id, sender: "ai", text: opener.text, translation: opener.translation },
        ]);
        if (autoSpeak) speak(data.aiResponse);
      } catch {
        /* keep the regular welcome if the memory greeting fails */
      }
    })();
  }, [chatUnlocked, historyReady, memories.length, user, messages, isLoading]);

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
      const welcome = buildWelcomeMessage(result.profile);
      setMessages([welcome]);
      try {
        await persistMessages(user.id, [
          { id: welcome.id, sender: "ai", text: welcome.text, translation: welcome.translation },
        ]);
      } catch {
        /* welcome can stay local if history insert fails */
      }
    } catch (error) {
      console.error("Supabase Profile Save Error:", error);
      setProfileError(describeProfileSaveError(error));
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
        {authReady && !user && profileChecked ? (
          <AuthModal
            onAuthenticated={() => {
              void createClient()
                .auth.getUser()
                .then(({ data }) => bootstrapUser(data.user ?? null));
            }}
          />
        ) : null}
        {needsOnboarding ? (
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
        />

        <VoiceStage
          character={character}
          tutorName={character.name}
          thinking={isLoading}
          speaking={isSpeaking}
          listening={isListening}
          autoSpeak={autoSpeak}
          disabled={isLoading || !chatUnlocked}
          onToggleMic={() => void handleToggleMic()}
          onToggleSpeak={() => {
            setAutoSpeak((value) => {
              if (value) stopSpeaking();
              return !value;
            });
          }}
          onOpenCharacters={openCharacterPicker}
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
