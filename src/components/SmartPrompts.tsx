"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";

interface SmartPromptsProps {
  suggestions: string[];
  lastAiText: string;
  disabled?: boolean;
  onReply: (text: string) => void;
  onNewTopic: () => void;
}

const CONTEXT_ACTIONS: Array<{ re: RegExp; label: string; send: string }> = [
  { re: /\bbeach\b|\bsand\b|\bswim|\bocean\b|\bwaves\b|\bsea\b/i, label: "Ask about the beach", send: "What do you like most about the beach?" },
  { re: /\bmusic\b|\bsong\b|\bplaylist\b|\bconcert\b/i, label: "Talk about music", send: "What's a song you can't stop playing?" },
  { re: /\bsport\b|\bsoccer\b|\bbasketball\b|\bfootball\b|\btennis\b/i, label: "Talk about sports", send: "What's your favorite sport to play or watch?" },
  { re: /\bfood\b|\bcook\b|\beat\b|\bpizza\b|\brestaurant\b/i, label: "Ask about food", send: "What's your favorite food?" },
  { re: /\banime\b|\bmanga\b|\bdraw/i, label: "Talk about anime", send: "What anime or manga are you into right now?" },
  { re: /\bpet\b|\bdog\b|\bcat\b|\banimal/i, label: "Ask about animals", send: "Do you have a pet, or a favorite animal?" },
  { re: /\bweekend\b|\bsaturday\b|\bsunday\b/i, label: "Plan the weekend", send: "What are you doing this weekend?" },
  { re: /\bmovie\b|\bfilm\b|\bshow\b|\bseries\b/i, label: "Talk about movies", send: "What movie or show should I watch?" },
  { re: /\btravel\b|\btrip\b|\bjapan\b|\bitaly\b/i, label: "Plan a trip", send: "If we could travel anywhere, where should we go?" },
];

const GAME_SEND = "Let's play a short English game!";

interface Chip {
  id: string;
  label: string;
  run: () => void;
}

export function SmartPrompts({ suggestions, lastAiText, disabled, onReply, onNewTopic }: SmartPromptsProps) {
  const chips: Chip[] = [];
  const seen = new Set<string>();

  function push(chip: Chip) {
    const key = chip.label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    chips.push(chip);
  }

  const contextual = CONTEXT_ACTIONS.find((item) => item.re.test(lastAiText));
  if (contextual) {
    push({ id: "context", label: contextual.label, run: () => onReply(contextual.send) });
  }

  suggestions.slice(0, 3).forEach((suggestion, index) => {
    push({ id: `reply-${index}`, label: suggestion, run: () => onReply(suggestion) });
  });

  if (!/game|play a/i.test(lastAiText)) {
    push({ id: "game", label: "Let's play a game", run: () => onReply(GAME_SEND) });
  }

  push({ id: "topic", label: "New topic", run: onNewTopic });

  if (chips.length === 0) return null;

  return (
    <div className="shrink-0 px-3 pb-2">
      <AnimatePresence mode="popLayout">
        <motion.div
          key={chips.map((chip) => chip.label).join("|")}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {chips.map((chip, index) => (
            <motion.button
              key={chip.id}
              type="button"
              disabled={disabled}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.04, duration: 0.2 }}
              onClick={chip.run}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/70 bg-white/55 px-3.5 py-2 text-[13px] font-medium text-slate-700 shadow-sm backdrop-blur-xl transition hover:bg-white/85 disabled:opacity-50"
            >
              {index === 0 ? <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" /> : null}
              {chip.label}
            </motion.button>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
