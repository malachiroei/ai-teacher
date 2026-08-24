"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Square, Trophy } from "lucide-react";
import { uniqueEnglishWords } from "@/lib/learning-progress";
import type { Message } from "@/types/chat";
import { cn } from "@/lib/utils";

interface PracticeMomentsRecorderProps {
  active: boolean;
  listening: boolean;
  childName: string;
  tutorName: string;
  minutes: number;
  xp: number;
  messages: Message[];
  parentPhone?: string;
  trophyTick?: number;
  onError?: (message: string) => void;
}

function videoMime() {
  if (typeof MediaRecorder === "undefined") return "";
  return ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  ) ?? "";
}

export function PracticeMomentsRecorder({
  active,
  listening,
  childName,
  tutorName,
  minutes,
  xp,
  messages,
  parentPhone,
  trophyTick = 0,
  onError,
}: PracticeMomentsRecorderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [clipUrl, setClipUrl] = useState("");
  const [clipBlob, setClipBlob] = useState<Blob | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [trophyOpen, setTrophyOpen] = useState(false);
  const autoStarted = useRef(false);

  useEffect(() => {
    if (trophyTick) setTrophyOpen(true);
  }, [trophyTick]);

  const stopCamera = useCallback(() => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setCapturing(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (streamRef.current) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      return true;
    } catch {
      onError?.("Couldn't open the camera. Check permission.");
      return false;
    }
  }, [onError]);

  const captureSnippet = useCallback(async () => {
    if (capturing) return;
    const ok = await startCamera();
    if (!ok || !streamRef.current) return;
    const mimeType = videoMime();
    chunksRef.current = [];
    try {
      const recorder = mimeType ? new MediaRecorder(streamRef.current, { mimeType }) : new MediaRecorder(streamRef.current);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
        if (blob.size > 0) {
          setClipBlob(blob);
          setClipUrl((current) => {
            if (current) URL.revokeObjectURL(current);
            return URL.createObjectURL(blob);
          });
        }
        setCapturing(false);
      };
      recorder.start();
      setCapturing(true);
      window.setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, 8000);
    } catch {
      onError?.("Couldn't capture a practice moment.");
    }
  }, [capturing, onError, startCamera]);

  useEffect(() => {
    if (!active) {
      stopCamera();
      autoStarted.current = false;
      return;
    }
    void startCamera();
  }, [active, startCamera, stopCamera]);

  useEffect(() => {
    if (!active || !listening || autoStarted.current || capturing) return;
    autoStarted.current = true;
    void captureSnippet();
  }, [active, listening, capturing, captureSnippet]);

  useEffect(() => () => {
    stopCamera();
    if (clipUrl) URL.revokeObjectURL(clipUrl);
  }, [clipUrl, stopCamera]);

  if (!active && !trophyOpen) return null;

  const vocab = uniqueEnglishWords(messages).slice(0, 6);
  const shareText = `🏆 ${childName || "My kid"} just practiced English with ${tutorName} on BuddyAI!\n⏱️ ${minutes} min · ⭐ ${xp} XP${vocab.length ? `\n📝 New words: ${vocab.join(", ")}` : ""}\nLet's keep the streak going!`;

  async function shareWithParents() {
    setTrophyOpen(true);
    const phone = String(parentPhone || "").replace(/\D/g, "");
    try {
      if (clipBlob && navigator.canShare) {
        const ext = clipBlob.type.includes("mp4") ? "mp4" : "webm";
        const file = new File([clipBlob], `buddyai-practice.${ext}`, { type: clipBlob.type });
        if (navigator.canShare({ files: [file], text: shareText })) {
          await navigator.share({ files: [file], text: shareText, title: "BuddyAI Practice Moment" });
          return;
        }
      }
    } catch {
      /* fall through to WhatsApp */
    }
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(shareText)}`
      : `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      {active ? (
        <div className="pointer-events-none absolute top-[4.6rem] right-3 z-40 flex flex-col items-end gap-2">
          <div className="relative h-20 w-20 overflow-hidden rounded-full border-2 border-amber-300/70 bg-black/50 shadow-[0_0_18px_rgba(251,191,36,0.35)]">
            <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
            {capturing ? <span className="absolute inset-x-0 bottom-1 text-center text-[9px] font-bold text-red-300">REC</span> : null}
          </div>
          <div className="pointer-events-auto flex gap-1">
            <button
              type="button"
              onClick={() => void captureSnippet()}
              className="flex h-8 items-center gap-1 rounded-full bg-black/55 px-2 text-[10px] font-semibold text-white"
            >
              <Camera className="h-3 w-3" />
              Clip
            </button>
            <button
              type="button"
              onClick={() => setTrophyOpen(true)}
              className="flex h-8 items-center gap-1 rounded-full bg-amber-400/90 px-2 text-[10px] font-semibold text-slate-900"
            >
              <Trophy className="h-3 w-3" />
              Card
            </button>
          </div>
        </div>
      ) : null}

      {trophyOpen ? (
        <div className="absolute inset-0 z-[75] flex items-end justify-center p-3 sm:items-center">
          <button type="button" className="absolute inset-0 bg-black/55" aria-label="Close trophy" onClick={() => setTrophyOpen(false)} />
          <div className="relative w-full max-w-sm rounded-3xl border border-amber-300/25 bg-[#10140f] p-4 text-white shadow-2xl">
            <p className="text-[12px] font-semibold tracking-wide text-amber-200 uppercase">Practice Trophy Card</p>
            <h3 className="mt-1 text-lg font-bold">You practiced with {tutorName}! 🏆</h3>
            <p className="mt-2 text-sm text-white/70">
              {minutes} min · {xp} XP
            </p>
            {vocab.length ? <p className="mt-1 text-sm text-amber-100/80">New words: {vocab.join(", ")}</p> : null}
            {clipUrl ? (
              <video src={clipUrl} controls playsInline className="mt-3 w-full rounded-2xl bg-black" />
            ) : (
              <p className="mt-3 text-xs text-white/40">Capture a 5–10s clip while speaking to attach a moment.</p>
            )}
            <button
              type="button"
              onClick={() => void shareWithParents()}
              className="mt-3 flex h-11 w-full items-center justify-center rounded-full bg-[#25D366] text-sm font-semibold text-white"
            >
              Send to Parents on WhatsApp
            </button>
            <button type="button" onClick={() => setTrophyOpen(false)} className="mt-2 flex h-9 w-full items-center justify-center gap-1 text-xs text-white/50">
              <Square className="h-3 w-3" /> Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function PracticeMomentsMenuButton({
  active,
  onToggle,
  onOpenTrophy,
}: {
  active: boolean;
  onToggle: () => void;
  onOpenTrophy: () => void;
}) {
  return (
    <button type="button" onClick={onToggle} className={cn("w-full text-left", active && "text-amber-200")}>
      {active ? "Stop Practice Moments camera" : "Practice Moments camera"}
    </button>
  );
}
