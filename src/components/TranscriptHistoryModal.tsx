"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDownUp, Download, ScrollText, X } from "lucide-react";
import { MixedBidiText } from "@/components/MixedBidiText";
import { getCharacter } from "@/lib/characters";
import type { ArchivedChatSession } from "@/lib/chat-history";
import {
  buildTranscriptText,
  messageTimestamp,
  sortMessagesByOrder,
  splitMessagesIntoSittings,
} from "@/lib/exportTranscript";
import { getTimestamp } from "@/hooks/useChat";
import type { Message } from "@/types/chat";

interface TranscriptHistoryModalProps {
  messages: Message[];
  tutorName: string;
  characterId?: string;
  childName?: string;
  sessions?: ArchivedChatSession[];
  sessionsLoading?: boolean;
  sessionsError?: string;
  restoringId?: string | null;
  onRestore?: (session: ArchivedChatSession) => void;
  onClose: () => void;
}

type HistoryCard = {
  id: string;
  characterId: string;
  when: number;
  messages: Message[];
  archived?: ArchivedChatSession;
  live?: boolean;
};

function formatWhen(ts: number) {
  try {
    return new Date(ts).toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function latestSnippet(messages: Message[]) {
  const last = [...messages].sort((a, b) => messageTimestamp(a) - messageTimestamp(b)).at(-1);
  return last?.text?.trim() || "";
}

export function TranscriptHistoryModal({
  messages,
  tutorName,
  characterId,
  childName = "You",
  sessions = [],
  sessionsLoading,
  sessionsError,
  restoringId,
  onRestore,
  onClose,
}: TranscriptHistoryModalProps) {
  const [newestFirst, setNewestFirst] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const cards = useMemo(() => {
    const live: HistoryCard[] = splitMessagesIntoSittings(messages).map((sitting) => {
      const when = sitting.reduce((max, message) => Math.max(max, messageTimestamp(message)), 0);
      return {
        id: `live-${sitting[0]?.id || when}`,
        characterId: characterId || "emma",
        when,
        messages: sitting,
        live: true,
      };
    });
    const archived: HistoryCard[] = sessions.map((session) => ({
      id: session.id,
      characterId: session.characterId,
      when: getTimestamp(session),
      messages: session.messages,
      archived: session,
    }));
    const seen = new Set<string>();
    const merged: HistoryCard[] = [];
    for (const card of [...live, ...archived]) {
      const key = `${card.when}-${card.messages.length}`;
      if (seen.has(key) && card.live) continue;
      seen.add(key);
      merged.push(card);
    }
    return merged.sort((a, b) => (newestFirst ? b.when - a.when : a.when - b.when));
  }, [messages, sessions, characterId, newestFirst]);

  function downloadTxt() {
    const text = buildTranscriptText(
      newestFirst ? sortMessagesByOrder(messages, true) : sortMessagesByOrder(messages, false),
      tutorName,
      childName,
    );
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `buddyai-transcript-${stamp}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  return (
    <div className="absolute inset-0 z-[60] flex items-end justify-center p-3 sm:items-center">
      <motion.button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="Close history"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      />
      <motion.div
        initial={{ y: 28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 28, stiffness: 340 }}
        className="relative flex max-h-[90%] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/12 bg-[#0c1410]/95 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex items-center justify-between gap-2 px-3 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center text-white/50">
              <ScrollText className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-white">Chat history</h2>
              <p className="text-xs text-white/45">Sessions by date & time</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setNewestFirst((value) => !value)}
              className="inline-flex max-w-[9.5rem] items-center gap-1 rounded-full bg-white/10 px-2.5 py-1.5 text-[11px] font-medium leading-tight text-white/90"
            >
              <ArrowDownUp className="h-3.5 w-3.5 shrink-0" />
              <span>{newestFirst ? "חדש למעלה (Newest)" : "ישן למעלה (Oldest)"}</span>
            </button>
            <button
              type="button"
              onClick={downloadTxt}
              disabled={messages.length === 0}
              aria-label="Download transcript"
              className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1.5 text-[12px] font-medium text-white/85 disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              .txt
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {sessionsError ? <p className="px-1 pb-2 text-sm text-rose-300">{sessionsError}</p> : null}
          {sessionsLoading ? <p className="px-1 pb-2 text-sm text-white/45">Loading…</p> : null}
          {cards.length === 0 && !sessionsLoading ? (
            <p className="px-2 py-8 text-center text-sm text-white/45">No chats yet. Start talking to build history.</p>
          ) : (
            <div className="space-y-2">
              {cards.map((card) => {
                const tutor = getCharacter(card.characterId);
                const open = expandedId === card.id;
                const turns = sortMessagesByOrder(card.messages, newestFirst);
                const snippet = latestSnippet(card.messages);
                return (
                  <div key={card.id} className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.04]">
                    <button
                      type="button"
                      onClick={() => setExpandedId(open ? null : card.id)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={tutor.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-white">{tutor.name}</p>
                        <p className="mt-0.5 text-[11px] text-white/45">{formatWhen(card.when)}</p>
                        <p className="mt-0.5 text-[11px] text-white/40">
                          {card.messages.length} messages
                          {card.live ? " · this device" : ""}
                        </p>
                        {snippet ? <p className="mt-0.5 truncate text-[12px] text-white/65">{snippet}</p> : null}
                      </div>
                    </button>
                    {open ? (
                      <div className="border-t border-white/8 px-3 py-2">
                        <ol className="max-h-56 space-y-2 overflow-y-auto">
                          {turns.map((message) => (
                            <li key={message.id} className="text-[13px] leading-relaxed text-white/80">
                              <span className="text-[11px] font-semibold text-white/45">
                                {message.sender === "ai" ? tutor.name : childName}:
                              </span>{" "}
                              {message.text}
                              {message.sender === "ai" && message.translation?.trim() ? (
                                <p dir="rtl" className="mt-0.5 pb-1 text-[12px] leading-relaxed text-white/45">
                                  <MixedBidiText text={message.translation} />
                                </p>
                              ) : null}
                            </li>
                          ))}
                        </ol>
                        {card.archived ? (
                          <button
                            type="button"
                            disabled={Boolean(restoringId)}
                            onClick={() => {
                              onRestore?.(card.archived as ArchivedChatSession);
                              onClose();
                            }}
                            className="mt-2 h-9 w-full rounded-full bg-amber-400/20 text-[12px] font-semibold text-amber-100 disabled:opacity-60"
                          >
                            {restoringId === card.archived.id ? "Opening…" : "Continue this chat"}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
