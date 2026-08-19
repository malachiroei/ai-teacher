"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { User } from "@supabase/supabase-js";
import type { Character } from "@/lib/characters";
import type { EnglishLevel, Profile } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { fetchProfile, loadUserMemories, saveExtractedFact, seedProfileMemories } from "@/lib/chat-history";
import { markKidsPlacementComplete } from "@/lib/placement";
import type { UserMemory } from "@/lib/memory";

type OnboardingPayload = { profile: Profile; memories: UserMemory[] };

interface InteractiveOnboardingProps {
  user: User;
  character: Character;
  initialProfile?: Profile | null;
  onComplete: (next: OnboardingPayload) => void | Promise<void>;
}

const nativeLanguageChips = [
  { id: "he", label: "🇮🇱 עברית", value: "עברית" },
  { id: "es", label: "🇪🇸 Español", value: "Español" },
  { id: "tr", label: "🇹🇷 Türkçe", value: "Türkçe" },
  { id: "ru", label: "🇷🇺 Русский", value: "Русский" },
  { id: "other", label: "עוד...", value: "__custom__" },
] as const;

const englishLevelChips: Array<{ id: EnglishLevel; label: string }> = [
  { id: "beginner", label: "🌱 מתחיל (Beginner)" },
  { id: "intermediate", label: "⚡ בינוני (Intermediate)" },
  { id: "advanced", label: "🚀 מתקדם (Advanced)" },
];

const interestChips = [
  { id: "travel", label: "✈️ טיולים", interests: ["Travel"] },
  { id: "career", label: "💼 קריירה", interests: ["Tech"] },
  { id: "gaming", label: "🎮 גיימינג וספורט", interests: ["Games", "Sports"] },
  { id: "friends", label: "👥 שיחה עם חברים", interests: ["Movies"] },
  { id: "school", label: "🎓 לימודים ובית ספר", interests: ["Tech"] },
] as const;

const goalChips = [
  { id: 5, label: "⏱️ 5 דקות ביום" },
  { id: 10, label: "⏱️ 10 דקות ביום" },
  { id: 15, label: "⏱️ 15 דקות ביום" },
] as const;

function ChipButton({
  selected,
  onClick,
  children,
}: {
  selected?: boolean;
  onClick: () => void;
  children: import("react").ReactNode;
}) {
  return (
    <button
      type="button"
      suppressHydrationWarning
      onClick={onClick}
      className={cn(
        "rounded-2xl border px-4 py-2 text-left text-[14px] font-semibold transition",
        selected ? "border-[#2f6bff] bg-blue-50 text-[#2f6bff]" : "border-slate-200 bg-white/70 text-slate-700 hover:bg-white",
      )}
    >
      {children}
    </button>
  );
}

export function InteractiveOnboarding({ user, character, initialProfile, onComplete }: InteractiveOnboardingProps) {
  const initialName = String(initialProfile?.full_name ?? initialProfile?.nickname ?? "").trim();

  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);
  const [name, setName] = useState(initialName);

  const [nativeLanguageId, setNativeLanguageId] = useState<(typeof nativeLanguageChips)[number]["id"]>("he");
  const [nativeLanguageCustom, setNativeLanguageCustom] = useState("");

  const [englishLevel, setEnglishLevel] = useState<EnglishLevel | null>(null);
  const [selectedInterestChipIds, setSelectedInterestChipIds] = useState<string[]>(["travel"]);
  const [dailyGoal, setDailyGoal] = useState<(typeof goalChips)[number]["id"] | null>(10);

  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string>("");

  const nativeLanguage = useMemo(() => {
    if (nativeLanguageId === "other") return nativeLanguageCustom.trim();
    return nativeLanguageChips.find((c) => c.id === nativeLanguageId)?.value ?? "";
  }, [nativeLanguageCustom, nativeLanguageId]);

  const selectedInterests = useMemo(() => {
    const interests: string[] = [];
    for (const chipId of selectedInterestChipIds) {
      const chip = interestChips.find((c) => c.id === chipId);
      if (chip) interests.push(...chip.interests);
    }
    return Array.from(new Set(interests));
  }, [selectedInterestChipIds]);

  const avatarSrc = character.portraitUrl ?? character.avatarUrl;
  const titleByStep = useMemo(() => {
    return step === 0
      ? "שלום!"
      : step === 1
        ? "נעים להכיר"
        : step === 2
          ? "רמת אנגלית"
          : step === 3
            ? "תחומי עניין"
            : step === 4
              ? "יעד יומי"
              : "מסיים…";
  }, [step]);

  function toggleInterestChip(id: string) {
    setSelectedInterestChipIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  async function handleNext() {
    setError("");
    if (closing) return;

    if (step === 0) {
      const trimmed = name.trim();
      if (trimmed.length < 2) {
        setError("נא להזין שם (לפחות 2 תווים).");
        return;
      }
      setName(trimmed);
      setStep(1);
      return;
    }

    if (step === 1) {
      if (!nativeLanguage) {
        setError("נא לבחור שפת אם.");
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!englishLevel) {
        setError("נא לבחור רמת אנגלית.");
        return;
      }
      setStep(3);
      return;
    }

    if (step === 3) {
      if (selectedInterests.length === 0) {
        setError("נא לבחור לפחות תחום עניין אחד.");
        return;
      }
      setStep(4);
      return;
    }

    if (step === 4) {
      if (!dailyGoal) {
        setError("נא לבחור יעד יומי.");
        return;
      }
      setStep(5);
      return;
    }
  }

  async function handleFinish() {
    if (!name.trim() || !englishLevel || !dailyGoal || !nativeLanguage || selectedInterests.length === 0) return;
    setSaving(true);
    setError("");

    try {
      const supabase = createClient();

      // Save according to the onboarding contract.
      await supabase
        .from("profiles")
        .update({
          full_name: name.trim(),
          native_language: nativeLanguage,
          english_level: englishLevel,
          interests: selectedInterests,
          daily_goal_minutes: dailyGoal,
          onboarding_completed: true,
        } as any)
        .eq("id", user.id);

      // Ensure the app skips kids-placement quiz next.
      markKidsPlacementComplete(user.id);

      // Persist onboarding state for routing.
      try {
        window.localStorage.setItem("onboarding_done", "1");
      } catch {
        /* ignore */
      }

      const nextProfile = await fetchProfile(supabase, user.id);
      if (!nextProfile) throw new Error("Profile not found after onboarding.");

      // Seed starter memories: level + interests (and also name/age via the helper).
      await seedProfileMemories(supabase, user.id, nextProfile);

      await saveExtractedFact(supabase, user.id, `Level: ${englishLevel}`, "personal");
      await saveExtractedFact(supabase, user.id, `Interests: ${selectedInterests.join(", ")}`, "preference");

      const memories = await loadUserMemories(supabase, user.id);

      // Fade out, then hand control to the main VoiceStage.
      setClosing(true);
      window.setTimeout(() => {
        void onComplete({ profile: nextProfile, memories });
      }, 350);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't finish onboarding. Please try again.");
      setSaving(false);
      setClosing(false);
      setStep(4);
    }
  }

  const botText = useMemo(() => {
    if (step === 0) return "שלום! אני המורה האישי שלך ב-AI. אשמח להכיר אותך כדי להתאים לך את הלמידה. מה שמך?";
    if (step === 1) return `נעים להכיר, ${name || "!"}! מהי שפת האם שלך?`;
    if (step === 2) return "מה רמת האנגלית שלך כרגע?";
    if (step === 3) return "באילו תחומים תרצה לשפר את האנגלית שלך? (אפשר לבחור כמה)";
    if (step === 4) return "כמה זמן תרצה לתרגל בכל יום?";
    return "כמעט שם…";
  }, [name, step]);

  const stepIndex = step;
  const progress = [0, 1, 2, 3, 4].map((i) => i <= stepIndex - 1);

  return (
    <AnimatePresence>
      <motion.div
        key="interactive-onboarding"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ duration: 0.22 }}
        className="ambient-shell absolute inset-0 z-[70] flex flex-col px-5 pt-10 pb-6"
      >
        <div className="mb-6 flex items-center gap-2">
          <span className="w-9" />
          <div className="flex flex-1 justify-center gap-1.5">
            {progress.map((done, idx) => (
              <span key={idx} className={cn("h-1.5 rounded-full transition-all", done ? "w-6 bg-[#2f6bff]" : "w-4 bg-slate-200")} />
            ))}
          </div>
          <span className="w-9 text-right text-xs font-medium text-slate-400">{step === 5 ? "5/5" : `${step + 1}/5`}</span>
        </div>

        <div className="flex-1 overflow-hidden">
          <div className="mx-auto flex max-w-md flex-col items-center">
            <motion.div
              className="flex flex-col items-center gap-4"
              animate={{ opacity: closing ? 0.6 : 1 }}
              transition={{ duration: 0.18 }}
            >
              <img
                src={avatarSrc}
                alt={`${character.name} avatar`}
                className="h-28 w-28 rounded-full border border-white/40 shadow-[0_0_0_1px_rgba(47,107,255,0.12)]"
              />

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className="w-full rounded-3xl border border-white/60 bg-white/92 p-4 shadow-2xl shadow-blue-200/40"
              >
                <p className="text-center text-[16px] font-semibold leading-snug text-slate-900">{botText}</p>
              </motion.div>
            </motion.div>

            <div className="mt-5 w-full">
              <AnimatePresence mode="wait">
                {step === 0 ? (
                  <motion.div key="s0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      suppressHydrationWarning
                      autoFocus
                      placeholder="לדוגמה: יואב"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-lg outline-none focus:border-[#2f6bff] focus:bg-white"
                    />
                  </motion.div>
                ) : null}

                {step === 1 ? (
                  <motion.div key="s1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="flex flex-wrap gap-2">
                      {nativeLanguageChips.map((chip) => (
                        <ChipButton key={chip.id} selected={nativeLanguageId === chip.id} onClick={() => setNativeLanguageId(chip.id)}>
                          {chip.label}
                        </ChipButton>
                      ))}
                    </div>

                    {nativeLanguageId === "other" ? (
                      <input
                        value={nativeLanguageCustom}
                        onChange={(event) => setNativeLanguageCustom(event.target.value)}
                        suppressHydrationWarning
                        placeholder="כתוב/כתבי שפת אם…"
                        className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] outline-none focus:border-[#2f6bff] focus:bg-white"
                      />
                    ) : null}
                  </motion.div>
                ) : null}

                {step === 2 ? (
                  <motion.div key="s2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="grid gap-2">
                      {englishLevelChips.map((chip) => (
                        <ChipButton key={chip.id} selected={englishLevel === chip.id} onClick={() => setEnglishLevel(chip.id)}>
                          {chip.label}
                        </ChipButton>
                      ))}
                    </div>
                  </motion.div>
                ) : null}

                {step === 3 ? (
                  <motion.div key="s3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="flex flex-wrap gap-2">
                      {interestChips.map((chip) => (
                        <ChipButton key={chip.id} selected={selectedInterestChipIds.includes(chip.id)} onClick={() => toggleInterestChip(chip.id)}>
                          {chip.label}
                        </ChipButton>
                      ))}
                    </div>
                    <p className="mt-3 text-center text-xs text-slate-500">
                      נבחרו: <span className="font-semibold text-slate-700">{selectedInterests.length ? selectedInterests.join(", ") : "-"}</span>
                    </p>
                  </motion.div>
                ) : null}

                {step === 4 ? (
                  <motion.div key="s4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="grid grid-cols-1 gap-2">
                      {goalChips.map((chip) => (
                        <ChipButton key={chip.id} selected={dailyGoal === chip.id} onClick={() => setDailyGoal(chip.id)}>
                          {chip.label}
                        </ChipButton>
                      ))}
                    </div>
                  </motion.div>
                ) : null}

                {step === 5 ? (
                  <motion.div key="s5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="rounded-3xl border border-white/60 bg-white/92 p-4 text-center shadow-2xl shadow-blue-200/40">
                      <p className="text-[16px] font-semibold text-slate-900">מכין לך את המורה…</p>
                      <p className="mt-1 text-sm text-slate-500">זה לוקח רגע, ואז נתחיל לתרגל.</p>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {error ? <p className="mt-3 text-center text-sm font-semibold text-red-600">{error}</p> : null}

              <div className="mt-5">
                {step <= 4 ? (
                  <button
                    type="button"
                    onClick={() => void handleNext()}
                    disabled={saving}
                    className="flex h-12 w-full items-center justify-center rounded-full bg-[#2f6bff] text-[15px] font-semibold text-white shadow-lg shadow-blue-200 disabled:opacity-60"
                  >
                    המשך
                  </button>
                ) : null}

                {step === 5 ? (
                  <button
                    type="button"
                    onClick={() => void handleFinish()}
                    disabled={saving}
                    className="flex h-12 w-full items-center justify-center rounded-full bg-[#2f6bff] text-[15px] font-semibold text-white shadow-lg shadow-blue-200 disabled:opacity-60"
                  >
                    {saving ? "שומר נתונים…" : "התחל עכשיו"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

