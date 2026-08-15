"use client";

import { useState } from "react";
import { ChevronLeft, History, X } from "lucide-react";
import { getCharacter } from "@/lib/characters";
import type { ArchivedChatSession } from "@/lib/chat-history";
import { cn } from "@/lib/utils";

interface ChatHistoryDrawerProps {
  sessions: ArchivedChatSession[];
  loading?: boolean;
  error?: string;
  onClose: () => void;
}

export function ChatHistoryDrawer({ sessions, loading, error, onClose }: ChatHistoryDrawerProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const selected = sessions.find((session) => session.id === openId) ?? null;

  return (
    <div className="absolute inset-0 z-[60] flex items-end justify-center bg-slate-900/40 p-3 sm:items-center">
      <button type="button" className="absolute inset-0" aria-label="Close history" onClick={onClose} />
      <div className="relative flex max-h-[90%] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {selected ? (
              <button
                type="button"
                onClick={() => setOpenId(null)}
                aria-label="Back to list"
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            ) : (
              <span className="flex h-8 w-8 items-center justify-center text-slate-400">
                <History className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-slate-900">
                {selected ? selected.title : "Previous chats"}
              </h2>
              <p className="text-xs text-slate-500">
                {selected
                  ? getCharacter(selected.characterId).name
                  : loading
                    ? "Loading…"
                    : `${sessions.length} archived session${sessions.length === 1 ? "" : "s"}`}
              </p>
            </div>
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

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {error ? <p className="px-1 pb-3 text-sm text-red-600">{error}</p> : null}

          {selected ? (
            <div className="space-y-2">
              {selected.messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "max-w-[90%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed",
                    message.sender === "ai"
                      ? "rounded-tl-md bg-slate-100 text-slate-800"
                      : "ml-auto rounded-tr-md bg-[#2f6bff] text-white",
                  )}
                >
                  {message.text}
                </div>
              ))}
            </div>
          ) : sessions.length === 0 && !loading ? (
            <p className="px-2 py-8 text-center text-sm text-slate-500">
              New chats you start will show up here. Current conversations are archived instead of deleted.
            </p>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => setOpenId(session.id)}
                  className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-left transition hover:bg-white"
                >
                  <p className="truncate text-[14px] font-semibold text-slate-900">{session.title}</p>
                  <p className="mt-0.5 truncate text-[12px] text-slate-500">
                    {getCharacter(session.characterId).name}
                    {session.preview ? ` · ${session.preview}` : ""}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {new Date(session.archivedAt).toLocaleString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
