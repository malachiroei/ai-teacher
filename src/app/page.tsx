"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AIBubble } from "@/components/AIBubble";
import { AuthModal } from "@/components/AuthModal";
import { CharacterSelectorModal } from "@/components/CharacterSelectorModal";
import { ChatHeader } from "@/components/ChatHeader";
import { InputBar } from "@/components/InputBar";
import { LoadingScreen } from "@/components/LoadingScreen";
import { OnboardingModal } from "@/components/OnboardingModal";
import { QuickActions } from "@/components/QuickActions";
import { SuggestedAnswers } from "@/components/SuggestedAnswers";
import { TypingIndicator } from "@/components/TypingIndicator";
import { UserBubble } from "@/components/UserBubble";
import { useSpeech } from "@/hooks/useSpeech";
import {
  clearChatHistory,
  describeProfileSaveError,
  fetchProfile,
  saveMessage,
  isProfileComplete,
  loadChatHistory,
  saveProfile,
  saveSelectedCharacter,
} from "@/lib/chat-history";
import { getCharacter, type CharacterId } from "@/lib/characters";
import { preferredSpeechLangFromText } from "@/lib/language";
import { buildWelcomeMessage, profilePayload } from "@/lib/learner";
import { createClient } from "@/lib/supabase/client";
import type { Profile, ProfileInput } from "@/lib/supabase/types";
import type { ChatApiResponse, GrammarFeedback, Message } from "@/types/chat";

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
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openTranslations, setOpenTranslations] = useState<Record<string, boolean>>({});
  const [suggestions, setSuggestions] = useState<string[]>(INITIAL_SUGGESTIONS);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [characterPickerOpen, setCharacterPickerOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const scrollerRef = useRef<HTMLDivElement>(null);
  const pendingTranscript = useRef("");
  const wasListening = useRef(false);
  const {
    speak,
    stopSpeaking,
    startListening,
    stopListening,
    isListening,
    transcript,
    speechSupported,
  } = useSpeech();

  const needsOnboarding = Boolean(user && authReady && !isProfileComplete(profile));
  const chatUnlocked = Boolean(user && isProfileComplete(profile));
  const character = getCharacter(profile?.selected_character);

  function openCharacterPicker() {
    setMenuOpen(false);
    setCharacterPickerOpen(true);
  }

  const flash = useCallback((text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(""), 2800);
  }, []);

  const bootstrapUser = useCallback(async (nextUser: User | null) => {
    setUser(nextUser);
    setProfile(null);
    setHistoryReady(false);
    setMessages([]);
    setProfileError("");

    if (!nextUser) {
      setAuthReady(true);
      return;
    }

    try {
      const supabase = createClient();
      const nextProfile = await fetchProfile(supabase, nextUser.id);
      setProfile(nextProfile);
      if (isProfileComplete(nextProfile)) {
        try {
          const history = await loadChatHistory(supabase, nextUser.id);
          setMessages(history.length > 0 ? history : [buildWelcomeMessage(nextProfile)]);
        } catch {
          setMessages([buildWelcomeMessage(nextProfile)]);
          flash("Couldn't load your chat history.");
        }
        setHistoryReady(true);
      }
    } catch {
      flash("Couldn't load your profile.");
    } finally {
      setAuthReady(true);
    }
  }, [flash]);

  useEffect(() => {
    const supabase = createClient();
    let handledInitial = false;

    void supabase.auth.getSession().then(({ data }) => {
      if (handledInitial) return;
      handledInitial = true;
      void bootstrapUser(data.session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED") return;
      if (event === "INITIAL_SESSION" && handledInitial) return;
      handledInitial = true;
      void bootstrapUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [bootstrapUser]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading, showSuggestions]);

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

  async function requestReply(payload: {
    userMessage?: string;
    action?: "chat" | "change_topic";
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
    setShowSuggestions(false);
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
    setShowSuggestions(false);
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

  function handleToggleMic() {
    if (isListening) {
      stopListening();
      return;
    }
    if (!speechSupported.stt) {
      flash("Voice input isn't supported in this browser. Try Chrome.");
      return;
    }
    const lastUserText = [...messages].reverse().find((message) => message.sender === "user")?.text ?? "";
    const started = startListening(
      preferredSpeechLangFromText(input) ?? preferredSpeechLangFromText(lastUserText),
    );
    if (!started) flash("Couldn't access the microphone.");
  }

  async function handleClearChat() {
    if (!user) return;
    stopSpeaking();
    setMenuOpen(false);
    setShowSuggestions(false);
    setOpenTranslations({});
    setIsLoading(true);
    try {
      const supabase = createClient();
      await clearChatHistory(supabase, user.id);
      const welcome = buildWelcomeMessage(profile);
      setMessages([welcome]);
      setSuggestions(INITIAL_SUGGESTIONS);
      await persistMessages(user.id, [
        { id: welcome.id, sender: "ai", text: welcome.text, translation: welcome.translation },
      ]);
    } catch {
      flash("Couldn't clear the chat.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSelectCharacter(characterId: CharacterId) {
    if (!user || !profile || isLoading) return;
    setCharacterPickerOpen(false);
    setMenuOpen(false);

    const nextCharacter = getCharacter(characterId);
    if (nextCharacter.id === character.id) return;

    stopSpeaking();
    setShowSuggestions(false);
    setOpenTranslations({});
    setIsLoading(true);

    const nextProfile = { ...profile, selected_character: nextCharacter.id };
    setProfile(nextProfile);

    try {
      const supabase = createClient();
      const saved = await saveSelectedCharacter(supabase, user.id, nextCharacter.id);
      await clearChatHistory(supabase, user.id);
      const welcome = buildWelcomeMessage(nextProfile);
      setMessages([welcome]);
      setSuggestions(INITIAL_SUGGESTIONS);
      await persistMessages(user.id, [
        { id: welcome.id, sender: "ai", text: welcome.text, translation: welcome.translation },
      ]);
      if (autoSpeak) speak(welcome.text);
      if (!saved.success) flash("Tutor switched, but saving the choice failed.");
    } catch {
      flash("Couldn't switch tutors right now.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSignOut() {
    setMenuOpen(false);
    setCharacterPickerOpen(false);
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

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#dbe7ff,_#e8edf5_42%)]">
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col overflow-hidden bg-white shadow-xl">
        {!authReady ? <LoadingScreen label="Getting things ready…" /> : null}
        {authReady && !user ? (
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

        {chatUnlocked && !historyReady ? <LoadingScreen label="Loading your chat…" /> : null}

        <ChatHeader
          character={character}
          autoSpeak={autoSpeak}
          onToggleSpeak={() => {
            setAutoSpeak((value) => {
              if (value) stopSpeaking();
              return !value;
            });
          }}
          onOpenCharacters={openCharacterPicker}
          menuOpen={menuOpen}
          onToggleMenu={() => setMenuOpen((value) => !value)}
          onClearChat={() => void handleClearChat()}
          onSignOut={() => void handleSignOut()}
        />

        <div ref={scrollerRef} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          {messages.map((message) =>
            message.sender === "ai" ? (
              <AIBubble
                key={message.id}
                message={message}
                showTranslation={Boolean(openTranslations[message.id])}
                onReplay={() => speak(message.text)}
                onToggleTranslation={() =>
                  setOpenTranslations((current) => ({
                    ...current,
                    [message.id]: !current[message.id],
                  }))
                }
              />
            ) : (
              <UserBubble key={message.id} message={message} />
            ),
          )}
          {isLoading ? <TypingIndicator /> : null}
        </div>

        {notice ? (
          <p className="px-4 pb-1 text-center text-xs text-amber-700">{notice}</p>
        ) : null}

        {showSuggestions ? (
          <SuggestedAnswers suggestions={suggestions} onSelect={(text) => void sendMessage(text)} />
        ) : null}

        <QuickActions
          disabled={isLoading || !chatUnlocked}
          onAnotherQuestion={() => void handleAnotherQuestion()}
          onSuggestAnswer={() => setShowSuggestions((value) => !value)}
        />

        <InputBar
          value={input}
          onChange={setInput}
          onSubmit={() => void sendMessage(input)}
          isRecording={isListening}
          onToggleMic={handleToggleMic}
          disabled={isLoading || !chatUnlocked}
        />

        {characterPickerOpen ? (
          <CharacterSelectorModal
            selectedId={character.id}
            onSelect={(id) => void handleSelectCharacter(id)}
            onClose={() => setCharacterPickerOpen(false)}
          />
        ) : null}
      </div>
    </main>
  );
}
