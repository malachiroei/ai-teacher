"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Download, History, ScrollText, X } from "lucide-react";
import { MixedBidiText } from "@/components/MixedBidiText";
import { getCharacter } from "@/lib/characters";
import type { ArchivedChatSession } from "@/lib/chat-history";
import { smartSessionTitle } from "@/lib/learning-progress";
import { buildTranscriptText, groupMessagesByDayNewestFirst, messageTimestamp, sortMessagesNewestFirst } from "@/lib/exportTranscript";
import { getTimestamp } from "@/hooks/useChat";
import type { Message } from "@/types/chat";

interface TranscriptHistoryModalProps {
  messages: Message[];
  tutorName: string;
  childName?: string;
  sessions?: ArchivedChatSession[];
  sessionsLoading?: boolean;
  sessionsError?: string;
  restoringId?: string | null;
  onRestore?: (session: ArchivedChatSession) => void;
  onClose: () => void;
}

function formatClock(ts: number) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function TranscriptHistoryModal({
  messages,
  tutorName,
  childName = "You",
  sessions = [],
  sessionsLoading,
  sessionsError,
  restoringId,
  onRestore,
  onClose,
}: TranscriptHistoryModalProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  function downloadTxt() {
    const text = buildTranscriptText(messages, tutorName, childName);
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

  const groups = useMemo(() => groupMessagesByDayNewestFirst(messages), [messages]);
  const orderedSessions = useMemo(
    () => [...sessions].sort((a, b) => getTimestamp(b) - getTimestamp(a)),
    [sessions],
  );

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
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center text-white/50">
              <ScrollText className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-white">Chat & Transcript History</h2>
              <p className="text-xs text-white/45" dir="rtl">
                היסטוריית שיחה · חדש למעלה
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={downloadTxt}
              disabled={messages.length === 0}
              aria-label="Download transcript"
              className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-medium text-white/85 disabled:opacity-40"
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
          {sessions.length > 0 || sessionsLoading || sessionsError ? (
            <section className="mb-4">
              <div className="mb-2 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-white/40">
                <History className="h-3.5 w-3.5" />
                Past chats
              </div>
              {sessionsError ? <p className="px-1 pb-2 text-sm text-rose-300">{sessionsError}</p> : null}
              {sessionsLoading ? <p className="px-1 pb-2 text-sm text-white/45">Loading…</p> : null}
              <div className="space-y-2">
                {orderedSessions.map((session) => {
                    const tutor = getCharacter(session.characterId);
                    const title = smartSessionTitle(session.messages, session.title);
                    const open = expandedId === session.id;
                    const sessionTurns = sortMessagesNewestFirst(session.messages);
                    return (
                      <div key={session.id} className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.04]">
                        <button
                          type="button"
                          onClick={() => setExpandedId(open ? null : session.id)}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={tutor.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-semibold text-white">{title}</p>
                            <p className="mt-0.5 text-[11px] text-white/40">
                              {tutor.name} · {session.messages.length} messages · {new Date(session.archivedAt).toLocaleString()}
                            </p>
                          </div>
                        </button>
                        {open ? (
                          <div className="border-t border-white/8 px-3 py-2">
                            <ol className="max-h-48 space-y-2 overflow-y-auto">
                              {sessionTurns.map((message) => (
                                <li key={message.id} className="text-[13px] text-white/80">
                                  <span className="text-[11px] font-semibold text-white/45">
                                    {message.sender === "ai" ? tutor.name : childName}:
                                  </span>{" "}
                                  {message.text}
                                </li>
                              ))}
                            </ol>
                            <button
                              type="button"
                              disabled={Boolean(restoringId)}
                              onClick={() => {
                                onRestore?.(session);
                                onClose();
                              }}
                              className="mt-2 h-9 w-full rounded-full bg-amber-400/20 text-[12px] font-semibold text-amber-100 disabled:opacity-60"
                            >
                              {restoringId === session.id ? "Opening…" : "Continue this chat"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
              </div>
            </section>
          ) : null}

          <section>
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-white/40">This chat · newest first</p>
            {messages.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-white/45">No turns yet. Start talking to build a transcript.</p>
            ) : (
              groups.map((group) => (
                <div key={group.key} className="mb-3">
                  <p className="mb-1.5 px-1 text-[11px] font-medium text-emerald-200/70">{group.label}</p>
                  <ol className="space-y-2">
                    {group.messages.map((message) => (
                      <li key={message.id} className="rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2.5">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold tracking-wide text-white/55">
                            {message.sender === "ai" ? tutorName : childName}
                          </span>
                          <span className="text-[10px] text-white/35">{formatClock(messageTimestamp(message))}</span>
                        </div>
                        <p dir="ltr" className="text-[14px] leading-snug text-white/90">
                          {message.text}
                        </p>
                        {message.sender === "ai" && message.translation?.trim() ? (
                          <p dir="rtl" className="mt-1 text-[13px] leading-snug text-white/50">
                            <MixedBidiText text={message.translation} />
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </div>
              ))
            )}
          </section>
        </div>
      </motion.div>
    </div>
  );
}
