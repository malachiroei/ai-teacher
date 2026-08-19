"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { User } from "@supabase/supabase-js";
import type { Character } from "@/lib/characters";
import type { Profile } from "@/lib/supabase/types";
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

// ── Step definitions ──────────────────────────────────────────────────────────
const SCHOOL_STAGE_CHIPS = [
  { id: "elem-low",  label: "🎒 כיתות א׳–ג׳",      ageRange: "6-9"  },
  { id: "elem-high", label: "🚀 כיתות ד׳–ו׳",       ageRange: "10-12" },
  { id: "middle",    label: "⚡ חטיבת ביניים",       ageRange: "13-15" },
  { id: "high",      label: "🎓 תיכון / בוגר",      ageRange: "16-20" },
] as const;
type SchoolStageId = (typeof SCHOOL_STAGE_CHIPS)[number]["id"];

const PASSION_CHIPS = [
  { id: "gaming",   label: "🎮 גיימינג ומיינקראפט", interests: ["Games", "Minecraft"] },
  { id: "sports",   label: "⚽ ספורט וכדורגל",      interests: ["Sports"] },
  { id: "media",    label: "🎬 סרטים ויוטיוב",       interests: ["Movies"] },
  { id: "science",  label: "🚀 מדע וחלל",            interests: ["Science", "Tech"] },
  { id: "art",      label: "🎨 יצירה וציור",         interests: ["Art"] },
  { id: "animals",  label: "🐾 חיות וטבע",           interests: ["Animals"] },
] as const;
type PassionId = (typeof PASSION_CHIPS)[number]["id"];

const LEARNING_STYLE_CHIPS = [
  { id: "challenges", label: "🎯 אתגרים וחידונים" },
  { id: "chat",       label: "💬 שיחות זורמות וכיף" },
  { id: "stories",    label: "📖 סיפורים והרפתקאות" },
] as const;
type LearningStyleId = (typeof LEARNING_STYLE_CHIPS)[number]["id"];

const CONFIDENCE_CHIPS = [
  { id: "beginner",      label: "🐣 מילים בסיסיות",                  level: "beginner" as const },
  { id: "intermediate",  label: "🗣️ מבין קצת אבל מתבייש לדבר",      level: "intermediate" as const },
  { id: "advanced",      label: "🚀 מבין מצוין ורוצה שוטף",         level: "advanced" as const },
] as const;
type ConfidenceId = (typeof CONFIDENCE_CHIPS)[number]["id"];

const GOAL_CHIPS = [
  { id: 5,  label: "⚡ 5 דקות זריזות" },
  { id: 10, label: "🔥 10 דקות יומיות" },
  { id: 15, label: "🏆 15 דקות אלופים" },
] as const;

// ── Bot messages per step ─────────────────────────────────────────────────────
const BOT_MESSAGES = [
  "שלום! אני המורה הקיברנטי שלך ב-BuddyAI. כדי לכוון את האימון בדיוק אליך — מה שמך?",
  (name: string) => `נעים מאוד, ${name}! 🤝 באיזו שלב בית-ספר אתה נמצא?`,
  "מגניב! מה הכי מדליק אותך? (אפשר לבחור כמה)",
  "איך אתה אוהב ללמוד הכי טוב?",
  "מה רמת הביטחון שלך באנגלית?",
  "ולבסוף — כמה זמן ביום תרצה להתאמן?",
];

// ── Reusable styled chip ──────────────────────────────────────────────────────
function CyberChip({
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
        "relative flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-left text-[14px] font-semibold transition-all duration-150",
        selected
          ? "border-cyan-400/80 bg-cyan-500/15 text-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.35)]"
          : "border-white/12 bg-white/5 text-white/75 hover:border-white/22 hover:bg-white/10 hover:text-white",
      )}
    >
      {selected && (
        <span className="absolute inset-0 rounded-2xl bg-cyan-400/6 blur-[1px] pointer-events-none" />
      )}
      {children}
    </button>
  );
}

// ── Progress dots ─────────────────────────────────────────────────────────────
function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "block rounded-full transition-all duration-300",
            i < current
              ? "h-1.5 w-5 bg-cyan-400"
              : i === current
                ? "h-1.5 w-5 bg-white/80"
                : "h-1.5 w-3 bg-white/22",
          )}
        />
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function InteractiveOnboarding({ user, character, initialProfile, onComplete }: InteractiveOnboardingProps) {
  const initialName = String(initialProfile?.full_name ?? initialProfile?.nickname ?? "").trim();

  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName);
  const [schoolStage, setSchoolStage] = useState<SchoolStageId | null>(null);
  const [passionIds, setPassionIds] = useState<PassionId[]>([]);
  const [learningStyle, setLearningStyle] = useState<LearningStyleId | null>(null);
  const [confidenceId, setConfidenceId] = useState<ConfidenceId | null>(null);
  const [dailyGoal, setDailyGoal] = useState<5 | 10 | 15 | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const avatarSrc = character.portraitUrl ?? character.avatarUrl;
  const accentColor = character.accentColor;

  const selectedInterests = useMemo(() => {
    const out: string[] = [];
    for (const id of passionIds) {
      const chip = PASSION_CHIPS.find((c) => c.id === id);
      if (chip) out.push(...chip.interests);
    }
    return Array.from(new Set(out));
  }, [passionIds]);

  const englishLevel = useMemo(() => {
    return CONFIDENCE_CHIPS.find((c) => c.id === confidenceId)?.level ?? null;
  }, [confidenceId]);

  const ageApprox = useMemo(() => {
    const stage = SCHOOL_STAGE_CHIPS.find((c) => c.id === schoolStage);
    if (!stage) return 12;
    const [lo] = stage.ageRange.split("-").map(Number);
    return lo + 1;
  }, [schoolStage]);

  const botText = useMemo(() => {
    const msg = BOT_MESSAGES[step];
    if (typeof msg === "function") return msg(name || "חבר");
    return msg;
  }, [step, name]);

  function togglePassion(id: PassionId) {
    setPassionIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function validateAndNext() {
    setError("");
    if (step === 0) {
      if (name.trim().length < 2) { setError("נא להזין שם (לפחות 2 תווים)."); return; }
      setName(name.trim());
    }
    if (step === 1 && !schoolStage) { setError("נא לבחור שלב בית-ספר."); return; }
    if (step === 2 && passionIds.length === 0) { setError("נא לבחור לפחות תחום עניין אחד."); return; }
    if (step === 3 && !learningStyle) { setError("נא לבחור סגנון למידה."); return; }
    if (step === 4 && !confidenceId) { setError("נא לבחור רמת ביטחון."); return; }
    if (step === 5) { void handleFinish(); return; }
    setStep((s) => s + 1);
  }

  async function handleFinish() {
    if (!dailyGoal) { setError("נא לבחור יעד יומי."); return; }
    if (!englishLevel) { setError("נא לבחור רמת אנגלית."); return; }
    setSaving(true);
    setError("");

    try {
      const supabase = createClient();

      await supabase.from("profiles").update({
        full_name: name.trim(),
        nickname: name.trim(),
        english_level: englishLevel,
        interests: selectedInterests,
        age: ageApprox,
        daily_goal_minutes: dailyGoal,
        onboarding_completed: true,
      } as never).eq("id", user.id);

      markKidsPlacementComplete(user.id);
      try { window.localStorage.setItem("onboarding_done", "1"); } catch { /* ignore */ }

      const nextProfile = await fetchProfile(supabase, user.id);
      if (!nextProfile) throw new Error("Profile not found after onboarding.");

      await seedProfileMemories(supabase, user.id, nextProfile);
      await saveExtractedFact(supabase, user.id, `Level: ${englishLevel}`, "personal");
      await saveExtractedFact(supabase, user.id, `Interests: ${selectedInterests.join(", ")}`, "preference");
      await saveExtractedFact(supabase, user.id, `Learning style: ${learningStyle ?? "chat"}`, "preference");
      if (schoolStage) {
        const stageLabel = SCHOOL_STAGE_CHIPS.find((c) => c.id === schoolStage)?.label ?? schoolStage;
        await saveExtractedFact(supabase, user.id, `School stage: ${stageLabel}`, "personal");
      }

      const memories = await loadUserMemories(supabase, user.id);
      void onComplete({ profile: nextProfile, memories });
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בשמירה, נסה שוב.");
      setSaving(false);
    }
  }

  const TOTAL_STEPS = 6;

  return (
    <motion.div
      key="interactive-onboarding"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="absolute inset-0 z-[70] flex flex-col overflow-hidden bg-[#050c10]"
      style={{
        background: `radial-gradient(ellipse 160% 60% at 50% -10%, color-mix(in srgb, ${accentColor} 22%, transparent), transparent 60%),
                     radial-gradient(ellipse 100% 50% at 80% 100%, rgba(0,200,255,0.06), transparent 55%),
                     linear-gradient(180deg, #040c12 0%, #060e15 100%)`,
      }}
    >
      {/* Scanline overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          background: "repeating-linear-gradient(to bottom,rgba(120,255,214,0.8) 0px,rgba(120,255,214,0.8) 1px,transparent 1px,transparent 3px)",
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-3">
        <div className="flex items-center gap-2">
          <span
            className="rounded-full border border-cyan-400/40 px-2.5 py-0.5 text-[10px] font-bold tracking-widest text-cyan-400/80 uppercase"
            style={{ boxShadow: "0 0 8px rgba(34,211,238,0.2)" }}
          >
            BuddyAI
          </span>
          <span className="text-[11px] font-medium tracking-widest text-white/35 uppercase">Cyber Academy</span>
        </div>
        <span className="text-xs font-semibold text-white/40">{step + 1} / {TOTAL_STEPS}</span>
      </div>

      {/* Progress */}
      <div className="px-5 pb-4">
        <StepDots total={TOTAL_STEPS} current={step} />
      </div>

      {/* Scrollable body */}
      <div className="flex flex-1 flex-col items-center overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="w-full max-w-sm">

          {/* Avatar + bubble */}
          <div className="mb-5 flex flex-col items-center gap-3">
            <div
              className="relative h-24 w-24 rounded-full border-2 border-cyan-400/50"
              style={{ boxShadow: `0 0 28px color-mix(in srgb, ${accentColor} 45%, rgba(34,211,238,0.3))` }}
            >
              <img
                src={avatarSrc}
                alt={character.name}
                className="h-full w-full rounded-full object-cover object-[center_18%]"
                draggable={false}
              />
              {/* Neon ring */}
              <span
                className="absolute inset-[-3px] rounded-full border border-cyan-300/20 pointer-events-none"
                style={{ boxShadow: "inset 0 0 12px rgba(34,211,238,0.15)" }}
              />
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="w-full rounded-2xl border border-white/12 bg-white/6 px-4 py-3 backdrop-blur-md"
                style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.35)" }}
              >
                <p className="text-center text-[15px] font-semibold leading-snug text-white/92" dir="rtl">
                  {botText}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Step content */}
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div key="s0" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") validateAndNext(); }}
                  suppressHydrationWarning
                  autoFocus
                  placeholder="השם שלי הוא…"
                  className="w-full rounded-2xl border border-white/14 bg-white/7 px-4 py-3.5 text-[16px] text-white placeholder:text-white/28 outline-none focus:border-cyan-400/50 focus:bg-white/10 transition"
                  dir="rtl"
                />
              </motion.div>
            )}

            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <div className="grid grid-cols-1 gap-2.5">
                  {SCHOOL_STAGE_CHIPS.map((chip) => (
                    <CyberChip key={chip.id} selected={schoolStage === chip.id} onClick={() => setSchoolStage(chip.id)}>
                      {chip.label}
                    </CyberChip>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <div className="flex flex-wrap gap-2">
                  {PASSION_CHIPS.map((chip) => (
                    <CyberChip key={chip.id} selected={passionIds.includes(chip.id)} onClick={() => togglePassion(chip.id)}>
                      {chip.label}
                    </CyberChip>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="s3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <div className="grid grid-cols-1 gap-2.5">
                  {LEARNING_STYLE_CHIPS.map((chip) => (
                    <CyberChip key={chip.id} selected={learningStyle === chip.id} onClick={() => setLearningStyle(chip.id)}>
                      {chip.label}
                    </CyberChip>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div key="s4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <div className="grid grid-cols-1 gap-2.5">
                  {CONFIDENCE_CHIPS.map((chip) => (
                    <CyberChip key={chip.id} selected={confidenceId === chip.id} onClick={() => setConfidenceId(chip.id)}>
                      {chip.label}
                    </CyberChip>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 5 && (
              <motion.div key="s5" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <div className="grid grid-cols-1 gap-2.5">
                  {GOAL_CHIPS.map((chip) => (
                    <CyberChip key={chip.id} selected={dailyGoal === chip.id} onClick={() => setDailyGoal(chip.id as 5 | 10 | 15)}>
                      {chip.label}
                    </CyberChip>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <p className="mt-3 text-center text-sm font-semibold text-red-400">{error}</p>
          )}

          <div className="mt-6">
            <button
              type="button"
              onClick={validateAndNext}
              disabled={saving}
              className={cn(
                "relative flex h-13 w-full items-center justify-center overflow-hidden rounded-2xl text-[15px] font-bold tracking-wide text-white transition-all disabled:opacity-50",
              )}
              style={{
                background: `linear-gradient(135deg, color-mix(in srgb, ${accentColor} 80%, cyan), color-mix(in srgb, ${accentColor} 60%, rgba(0,200,255,0.9)))`,
                boxShadow: `0 0 28px color-mix(in srgb, ${accentColor} 45%, rgba(34,211,238,0.4))`,
              }}
            >
              <span className="relative z-10">
                {saving ? "מעבד…" : step === 5 ? "🚀 כניסה לאקדמיה!" : "המשך ←"}
              </span>
              {/* shimmer sweep */}
              <span className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/12 to-transparent pointer-events-none" />
            </button>

            {step > 0 && (
              <button
                type="button"
                onClick={() => { setError(""); setStep((s) => Math.max(0, s - 1) as typeof step); }}
                disabled={saving}
                className="mt-2 w-full py-2 text-center text-sm font-medium text-white/38 hover:text-white/60 transition"
              >
                ← חזרה
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
