"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AudioLines, History, LogOut, Settings2, Sparkles, Users, Volume2, VolumeX, X } from "lucide-react";
import { BuddyAIMark } from "@/components/BuddyAIMark";
import type { Character } from "@/lib/characters";
import { cn } from "@/lib/utils";

interface SideDrawerProps {
  open: boolean;
  character: Character;
  autoSpeak: boolean;
  practicedMinutes: number;
  dailyGoalMinutes: number;
  onClose: () => void;
  onToggleSpeak: () => void;
  onOpenCharacters: () => void;
  onOpenSettings: () => void;
  onOpenVoiceSettings: () => void;
  onOpenHistory: () => void;
  onClearChat: () => void;
  onSignOut?: () => void;
}

export function SideDrawer({
  open,
  character,
  autoSpeak,
  practicedMinutes,
  dailyGoalMinutes,
  onClose,
  onToggleSpeak,
  onOpenCharacters,
  onOpenSettings,
  onOpenVoiceSettings,
  onOpenHistory,
  onClearChat,
  onSignOut,
}: SideDrawerProps) {
  const goal = Math.max(1, dailyGoalMinutes);
  const done = Math.min(practicedMinutes, goal);
  const percent = Math.min(100, Math.round((practicedMinutes / goal) * 100));
  const reached = practicedMinutes >= goal;

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 z-[70] bg-slate-950/35 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="absolute inset-y-0 right-0 z-[80] flex w-[min(20rem,86%)] flex-col border-l border-white/10 bg-[#0b120e]/88 shadow-[-24px_0_60px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 340 }}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <BuddyAIMark className="h-7 w-7 rounded-lg" />
                <p className="text-[13px] font-semibold tracking-wide text-white/70">BuddyAI</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={onOpenSettings}
              aria-label={`Daily goal ${done} of ${goal} minutes`}
              className="mx-4 mb-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-left"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-semibold text-white/50">Today’s practice</span>
                <span className="text-[12px] font-semibold text-white/80">
                  {done}/{goal} min {reached ? "🎉" : ""}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full"
                  initial={false}
                  animate={{ width: `${percent}%` }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                  style={{ backgroundColor: reached ? "#22c55e" : character.accentColor }}
                />
              </div>
            </button>

            <nav className="flex flex-1 flex-col gap-0.5 px-2">
              <DrawerItem icon={Users} label="Switch tutor" onClick={onOpenCharacters} />
              <DrawerItem icon={Settings2} label="Practice settings" onClick={onOpenSettings} />
              <DrawerItem icon={AudioLines} label="Voice settings" onClick={onOpenVoiceSettings} />
              <DrawerItem
                icon={autoSpeak ? Volume2 : VolumeX}
                label={autoSpeak ? "Voice replies on" : "Voice replies off"}
                onClick={onToggleSpeak}
              />
              <DrawerItem icon={History} label="Previous chats" onClick={onOpenHistory} />
              <DrawerItem icon={Sparkles} label="Start Fresh / Assessment" onClick={onClearChat} />
            </nav>

            {onSignOut ? (
              <div className="border-t border-white/10 p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <DrawerItem icon={LogOut} label="Sign out" tone="danger" onClick={onSignOut} />
              </div>
            ) : null}
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function DrawerItem({
  icon: Icon,
  label,
  onClick,
  tone = "default",
}: {
  icon: typeof Users;
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] font-medium transition hover:bg-white/8",
        tone === "danger" ? "text-red-400" : "text-white/85",
      )}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-70" />
      {label}
    </button>
  );
}
