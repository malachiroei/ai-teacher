"use client";

import { motion } from "framer-motion";
import { Download, History, ScrollText, X } from "lucide-react";
import { MixedBidiText } from "@/components/MixedBidiText";
import { getCharacter } from "@/lib/characters";
import type { ArchivedChatSession } from "@/lib/chat-history";
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

function formatDay(ts: number) {
  try {
    return new Date(ts).toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function dayKey(ts: number) {
  const date = new Date(ts);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function groupByDay(messages: Message[]) {
  const groups: Array<{ key: string; label: string; messages: Message[] }> = [];
  for (const message of messages) {
    const key = dayKey(message.timestamp);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.messages.push(message);
    else groups.push({ key, label: formatDay(message.timestamp), messages: [message] });
  }
  return groups;
}

export function buildTranscriptText(messages: Message[], tutorName: string, childName = "You") {
  const header = `BuddyAI transcript\n${new Date().toLocaleString()}\n`;
  const body = groupByDay(messages)
    .map((group) => {
      const lines = group.messages.map((message) => {
        const who = message.sender === "ai" ? tutorName : childName;
        const time = formatClock(message.timestamp);
        const block = [`[${group.label} ${time}] ${who}: ${message.text.trim()}`];
        if (message.sender === "ai" && message.translation?.trim()) {
          block.push(`  HE: ${message.translation.trim()}`);
        }
        return block.join("\n");
      });
      return lines.join("\n\n");
    })
    .join("\n\n");
  return `${header}\n${body}\n`;
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

  const groups = groupByDay(messages);

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
                היסטוריית שיחה
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
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    disabled={Boolean(restoringId)}
                    onClick={() => {
                      onRestore?.(session);
                      onClose();
                    }}
                    className="pointer-events-auto w-full cursor-pointer rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2.5 text-left hover:bg-white/[0.07] disabled:opacity-60"
                  >
                    <p className="truncate text-[14px] font-semibold text-white">{session.title}</p>
                    <p className="mt-0.5 truncate text-[12px] text-white/50">
                      {getCharacter(session.characterId).name}
                      {session.preview ? ` · ${session.preview}` : ""}
                    </p>
                    <p className="mt-1 text-[11px] text-white/35">
                      {restoringId === session.id
                        ? "Opening…"
                        : `${session.messages.length} messages · ${new Date(session.archivedAt).toLocaleString()}`}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-white/40">This chat</p>
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
                          <span className="text-[10px] text-white/35">{formatClock(message.timestamp)}</span>
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
