"use client";

import { useState } from "react";
import { Bell, BellOff, Loader2, X } from "lucide-react";
import {
  DAILY_GOAL_OPTIONS,
  normalizeWhatsAppPhone,
  requestNotificationPermission,
  type PracticeSettings,
} from "@/lib/practice";
import { cn } from "@/lib/utils";

interface SettingsModalProps {
  settings: PracticeSettings;
  saving?: boolean;
  error?: string;
  onSave: (settings: PracticeSettings) => void;
  onClose: () => void;
}

export function SettingsModal({ settings, saving, error, onSave, onClose }: SettingsModalProps) {
  const [goal, setGoal] = useState(settings.daily_goal_minutes);
  const [time, setTime] = useState(settings.preferred_practice_time);
  const [notify, setNotify] = useState(settings.notifications_enabled);
  const [phone, setPhone] = useState(settings.parent_whatsapp);
  const [localError, setLocalError] = useState("");

  async function handleToggleNotify() {
    setLocalError("");
    if (notify) {
      setNotify(false);
      return;
    }

    const permission = await requestNotificationPermission();
    if (permission === "unsupported") {
      setLocalError("Browser notifications aren't supported here.");
      return;
    }
    if (permission !== "granted") {
      setLocalError("Allow notifications in your browser to get a daily reminder.");
      return;
    }
    setNotify(true);
  }

  function handleSave() {
    setLocalError("");
    const trimmed = phone.trim();
    if (trimmed && normalizeWhatsAppPhone(trimmed).length < 8) {
      setLocalError("Enter a parent phone number with country code, like +972501234567.");
      return;
    }
    onSave({
      daily_goal_minutes: goal,
      preferred_practice_time: time,
      notifications_enabled: notify,
      parent_whatsapp: trimmed,
    });
  }

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center">
      <button type="button" className="absolute inset-0" aria-label="Close settings" onClick={onClose} />
      <div className="relative flex max-h-[90%] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Practice settings</h2>
            <p className="text-xs text-slate-500">Daily goal, reminders, and parent updates</p>
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

        <div className="space-y-5 overflow-y-auto px-4 pb-5">
          <section>
            <p className="mb-2 text-[13px] font-semibold text-slate-800">Daily goal</p>
            <div className="grid grid-cols-4 gap-2">
              {DAILY_GOAL_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setGoal(option)}
                  className={cn(
                    "rounded-2xl border py-2.5 text-sm font-semibold transition",
                    goal === option
                      ? "border-[#2f6bff] bg-blue-50 text-[#2f6bff]"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white",
                  )}
                >
                  {option} min
                </button>
              ))}
            </div>
          </section>

          <section>
            <label htmlFor="practice-time" className="mb-2 block text-[13px] font-semibold text-slate-800">
              Preferred practice time
            </label>
            <input
              id="practice-time"
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] outline-none focus:border-[#2f6bff] focus:bg-white"
            />
          </section>

          <section className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-[13px] font-semibold text-slate-800">Browser reminders</p>
              <p className="text-[12px] text-slate-500">Get a ping at your practice time</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notify}
              onClick={() => void handleToggleNotify()}
              className={cn(
                "flex h-9 w-16 items-center justify-center gap-1 rounded-full text-white transition",
                notify ? "bg-emerald-500" : "bg-slate-300",
              )}
            >
              {notify ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            </button>
          </section>

          <section>
            <label htmlFor="parent-phone" className="mb-2 block text-[13px] font-semibold text-slate-800">
              Parent WhatsApp number
            </label>
            <input
              id="parent-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+972501234567"
              dir="ltr"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] outline-none focus:border-[#2f6bff] focus:bg-white"
            />
            <p className="mt-1.5 text-[12px] text-slate-500">Include the country code so WhatsApp can open the chat.</p>
          </section>

          {localError || error ? (
            <p className="text-sm leading-relaxed text-red-600">{localError || error}</p>
          ) : null}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex h-12 w-full items-center justify-center rounded-full bg-[#2f6bff] text-[15px] font-semibold text-white shadow-lg shadow-blue-200 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
