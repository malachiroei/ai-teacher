"use client";

import { useState } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { INTEREST_OPTIONS } from "@/lib/learner";
import type { EnglishLevel, Gender, ProfileInput } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

interface OnboardingModalProps {
  saving?: boolean;
  error?: string;
  onComplete: (profile: ProfileInput) => void;
}

const STEPS = ["Name", "Age", "Gender", "Level", "Interests"] as const;

export function OnboardingModal({ saving, error, onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState(0);
  const [nickname, setNickname] = useState("");
  const [pronunciation, setPronunciation] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [level, setLevel] = useState<EnglishLevel | "">("");
  const [interests, setInterests] = useState<string[]>([]);
  const [localError, setLocalError] = useState("");

  function next() {
    setLocalError("");
    if (step === 0 && nickname.trim().length < 2) {
      setLocalError("Please enter a name or nickname.");
      return;
    }
    if (step === 1) {
      const value = Number(age);
      if (!Number.isInteger(value) || value < 5 || value > 99) {
        setLocalError("Enter an age between 5 and 99.");
        return;
      }
    }
    if (step === 2 && !gender) {
      setLocalError("Pick the option that fits you.");
      return;
    }
    if (step === 3 && !level) {
      setLocalError("Choose your English level.");
      return;
    }
    if (step === 4) {
      if (interests.length === 0) {
        setLocalError("Pick at least one topic you like.");
        return;
      }
      onComplete({
        nickname: nickname.trim(),
        name_pronunciation: pronunciation.trim(),
        age: Number(age),
        gender: gender as Gender,
        english_level: level as EnglishLevel,
        interests,
      });
      return;
    }
    setStep((value) => value + 1);
  }

  return (
    <div className="ambient-shell absolute inset-0 z-[60] flex flex-col px-5 pt-10 pb-6">
      <div className="mb-6 flex items-center gap-2">
        {step > 0 ? (
          <button
            type="button"
            suppressHydrationWarning
            onClick={() => setStep((value) => value - 1)}
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ) : (
          <span className="w-9" />
        )}
        <div className="flex flex-1 justify-center gap-1.5">
          {STEPS.map((label, index) => (
            <span
              key={label}
              className={cn(
                "h-1.5 rounded-full transition-all",
                index === step ? "w-6 bg-[#2f6bff]" : index < step ? "w-4 bg-blue-200" : "w-4 bg-slate-200",
              )}
            />
          ))}
        </div>
        <span className="w-9 text-right text-xs font-medium text-slate-400">{step + 1}/5</span>
      </div>

      <div className="flex-1">
        {step === 0 ? (
          <Step title="What should we call you in English?" hint="This is the name your tutor will always use">
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              suppressHydrationWarning
              autoFocus
              placeholder="Your name"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-lg outline-none focus:border-[#2f6bff] focus:bg-white"
            />
            <input
              value={pronunciation}
              onChange={(event) => setPronunciation(event.target.value)}
              suppressHydrationWarning
              placeholder="How it sounds (optional)"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] outline-none focus:border-[#2f6bff] focus:bg-white"
            />
            <p className="mt-2 text-[12px] text-slate-500">Optional: how it sounds, so the tutor never mispronounces it.</p>
          </Step>
        ) : null}

        {step === 1 ? (
          <Step title="How old are you?" hint="This helps BuddyAI pick the right topics">
            <input
              type="number"
              inputMode="numeric"
              min={5}
              max={99}
              value={age}
              onChange={(event) => setAge(event.target.value)}
              suppressHydrationWarning
              autoFocus
              placeholder="16"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-lg outline-none focus:border-[#2f6bff] focus:bg-white"
            />
          </Step>
        ) : null}

        {step === 2 ? (
          <Step title="How should BuddyAI address you?" hint="Used for he/she and Hebrew grammar">
            <div className="grid gap-2">
              {(
                [
                  ["boy", "Boy"],
                  ["girl", "Girl"],
                  ["other", "Other"],
                ] as const
              ).map(([value, label]) => (
                <Choice key={value} selected={gender === value} onClick={() => setGender(value)}>
                  {label}
                </Choice>
              ))}
            </div>
          </Step>
        ) : null}

        {step === 3 ? (
          <Step title="What's your English level?" hint="BuddyAI will match vocabulary to you">
            <div className="grid gap-2">
              {(
                [
                  ["beginner", "Beginner", "Simple words, short sentences"],
                  ["intermediate", "Intermediate", "Everyday conversation"],
                  ["advanced", "Advanced", "Natural, richer English"],
                ] as const
              ).map(([value, label, hintText]) => (
                <Choice key={value} selected={level === value} onClick={() => setLevel(value)}>
                  <span className="block font-semibold">{label}</span>
                  <span className="text-xs font-normal text-slate-500">{hintText}</span>
                </Choice>
              ))}
            </div>
          </Step>
        ) : null}

        {step === 4 ? (
          <Step title="What do you like to talk about?" hint="Pick one or more">
            <div className="flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map((topic) => {
                const selected = interests.includes(topic);
                return (
                  <button
                    key={topic}
                    type="button"
                    suppressHydrationWarning
                    onClick={() =>
                      setInterests((current) =>
                        selected ? current.filter((item) => item !== topic) : [...current, topic],
                      )
                    }
                    className={cn(
                      "rounded-full border px-3.5 py-2 text-sm font-medium transition",
                      selected
                        ? "border-[#2f6bff] bg-blue-50 text-[#2f6bff]"
                        : "border-slate-200 bg-white text-slate-700",
                    )}
                  >
                    {topic}
                  </button>
                );
              })}
            </div>
          </Step>
        ) : null}
      </div>

      {localError || error ? (
        <p className="mb-3 break-words text-sm leading-relaxed text-red-600">{localError || error}</p>
      ) : null}

      <button
        type="button"
        suppressHydrationWarning
        onClick={next}
        disabled={saving}
        className="flex h-12 items-center justify-center rounded-full bg-[#2f6bff] text-[15px] font-semibold text-white shadow-lg shadow-blue-200 disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : step === 4 ? "Start chatting" : "Continue"}
      </button>
    </div>
  );
}

function Step({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-2xl font-bold leading-tight text-slate-900">{title}</h2>
      <p className="mt-1 mb-6 text-sm text-slate-500">{hint}</p>
      {children}
    </div>
  );
}

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      suppressHydrationWarning
      onClick={onClick}
      className={cn(
        "rounded-2xl border px-4 py-3 text-left text-[15px] font-medium transition",
        selected ? "border-[#2f6bff] bg-blue-50 text-[#2f6bff]" : "border-slate-200 bg-slate-50 text-slate-800",
      )}
    >
      {children}
    </button>
  );
}
