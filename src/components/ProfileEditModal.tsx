"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { readIntroLearningGoals } from "@/lib/chat-history";
import type { EnglishLevel, Profile } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

export interface ProfileEditPayload {
  nickname: string;
  age: number;
  english_level: EnglishLevel;
  interests: string[];
  learning_goal: string;
}

interface ProfileEditModalProps {
  profile: Profile;
  saving?: boolean;
  error?: string;
  onSave: (next: ProfileEditPayload) => void;
  onClose: () => void;
}

const INTEREST_TAGS = [
  { id: "Sports", label: "Sports / ספורט" },
  { id: "Tech", label: "Tech / טכנולוגיה" },
  { id: "Music", label: "Music / מוזיקה" },
  { id: "Games", label: "Gaming / גיימינג" },
  { id: "Travel", label: "Travel / טיולים" },
  { id: "Art", label: "Art / אמנות" },
  { id: "Science", label: "Science / מדע" },
  { id: "Movies", label: "Movies / סרטים" },
  { id: "Animals", label: "Animals / חיות" },
] as const;

const LEVEL_OPTIONS: Array<{ id: EnglishLevel; label: string }> = [
  { id: "beginner", label: "Beginner / מתחיל" },
  { id: "intermediate", label: "Intermediate / בינוני" },
  { id: "advanced", label: "Advanced / מתקדם" },
];

const LEARNING_GOALS = [
  { id: "challenges", label: "אתגרים וחידונים" },
  { id: "chat", label: "שיחות זורמות" },
  { id: "stories", label: "סיפורים והרפתקאות" },
] as const;

export function ProfileEditModal({ profile, saving, error, onSave, onClose }: ProfileEditModalProps) {
  const [nickname, setNickname] = useState(() => String(profile.nickname || profile.full_name || "").trim());
  const [age, setAge] = useState(() => {
    const value = Number(profile.age);
    return value > 0 ? String(value) : "";
  });
  const [level, setLevel] = useState<EnglishLevel>(() => {
    const value = String(profile.english_level || "").toLowerCase();
    return value === "intermediate" || value === "advanced" ? value : "beginner";
  });
  const [interests, setInterests] = useState<string[]>(() =>
    (profile.interests ?? []).map((item) => String(item).trim()).filter(Boolean),
  );
  const [learningGoal, setLearningGoal] = useState(() => readIntroLearningGoals(profile) || "chat");
  const [localError, setLocalError] = useState("");

  function toggleInterest(tag: string) {
    setInterests((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  }

  function handleSave() {
    setLocalError("");
    if (nickname.trim().length < 2) {
      setLocalError("Enter a nickname / הזן שם.");
      return;
    }
    const ageValue = Number(age);
    if (!Number.isInteger(ageValue) || ageValue < 5 || ageValue > 99) {
      setLocalError("Enter an age between 5 and 99 / הזן גיל.");
      return;
    }
    if (interests.length === 0) {
      setLocalError("Pick at least one interest / בחר תחום עניין.");
      return;
    }
    onSave({
      nickname: nickname.trim(),
      age: ageValue,
      english_level: level,
      interests,
      learning_goal: learningGoal,
    });
  }

  return (
    <div className="absolute inset-0 z-[70] flex items-end justify-center p-3 sm:items-center">
      <motion.button
        type="button"
        className="absolute inset-0 bg-slate-900/45"
        aria-label="Close profile editor"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      />
      <motion.div
        initial={{ y: 28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 28, stiffness: 340 }}
        className="relative flex max-h-[92%] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/70 bg-white/95 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Edit Personal Profile</h2>
            <p className="text-xs text-slate-500">עריכת פרופיל / עריכת פרטים אישיים</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-4 pb-5">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-slate-800">Nickname / שם</span>
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] outline-none focus:border-[#2f6bff] focus:bg-white"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-slate-800">Age / Stage / גיל</span>
            <input
              type="number"
              min={5}
              max={99}
              value={age}
              onChange={(event) => setAge(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] outline-none focus:border-[#2f6bff] focus:bg-white"
            />
          </label>

          <div>
            <p className="mb-1.5 text-[13px] font-semibold text-slate-800">English Level / רמת אנגלית</p>
            <div className="grid grid-cols-1 gap-2">
              {LEVEL_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setLevel(option.id)}
                  className={cn(
                    "rounded-2xl border px-4 py-2.5 text-left text-[14px] font-medium",
                    level === option.id
                      ? "border-[#2f6bff] bg-blue-50 text-[#2f6bff]"
                      : "border-slate-200 bg-slate-50 text-slate-700",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[13px] font-semibold text-slate-800">Interests / תחומי עניין</p>
            <div className="flex flex-wrap gap-2">
              {INTEREST_TAGS.map((tag) => {
                const selected = interests.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleInterest(tag.id)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[13px] font-medium",
                      selected ? "border-[#2f6bff] bg-blue-50 text-[#2f6bff]" : "border-slate-200 bg-white text-slate-700",
                    )}
                  >
                    {tag.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[13px] font-semibold text-slate-800">Learning Goals / מטרות למידה</p>
            <div className="grid grid-cols-1 gap-2">
              {LEARNING_GOALS.map((goal) => (
                <button
                  key={goal.id}
                  type="button"
                  onClick={() => setLearningGoal(goal.id)}
                  className={cn(
                    "rounded-2xl border px-4 py-2.5 text-left text-[14px] font-medium",
                    learningGoal === goal.id
                      ? "border-amber-400 bg-amber-50 text-amber-800"
                      : "border-slate-200 bg-slate-50 text-slate-700",
                  )}
                >
                  {goal.label}
                </button>
              ))}
            </div>
          </div>

          {localError || error ? (
            <p className="text-sm text-red-600">{localError || error}</p>
          ) : null}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex h-12 w-full items-center justify-center rounded-full bg-[#2f6bff] text-[15px] font-semibold text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Save Changes / שמור שינויים"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
