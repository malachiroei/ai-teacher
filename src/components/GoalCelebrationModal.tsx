"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { CharacterAvatar } from "@/components/CharacterAvatar";
import type { Character } from "@/lib/characters";
import { goalCheer } from "@/lib/practice";

interface GoalCelebrationModalProps {
  character: Character;
  minutes: number;
  goalMinutes: number;
  messageCount: number;
  topics: string[];
  canShareWhatsApp: boolean;
  onShareWhatsApp: () => void;
  onClose: () => void;
}

export function GoalCelebrationModal({
  character,
  minutes,
  goalMinutes,
  messageCount,
  topics,
  canShareWhatsApp,
  onShareWhatsApp,
  onClose,
}: GoalCelebrationModalProps) {
  const displayMinutes = Math.max(minutes, goalMinutes);

  return (
    <div className="absolute inset-0 z-[60] flex items-end justify-center bg-slate-900/45 p-3 sm:items-center">
      <button type="button" className="absolute inset-0" aria-label="Close celebration" onClick={onClose} />
      <ConfettiBurst color={character.accentColor} />
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="px-5 pt-6 pb-5 text-center">
          <CharacterAvatar character={character} className="mx-auto h-24 w-24" eager />
          <p className="mt-3 text-xs font-semibold tracking-wide uppercase" style={{ color: character.accentColor }}>
            Daily goal complete
          </p>
          <h2 className="mt-1 text-xl font-bold leading-snug text-slate-900">
            {goalCheer(character, displayMinutes)}
          </h2>

          <div className="mt-4 grid grid-cols-2 gap-2 text-left">
            <Stat label="Minutes" value={`${displayMinutes}`} />
            <Stat label="Messages" value={`${messageCount}`} />
          </div>

          <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-3 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Practiced today</p>
            <p className="mt-1 text-[14px] leading-relaxed text-slate-700">
              {topics.length > 0 ? topics.join(" · ") : "Free conversation in English"}
            </p>
          </div>

          <button
            type="button"
            onClick={onShareWhatsApp}
            disabled={!canShareWhatsApp}
            className="mt-4 flex h-12 w-full items-center justify-center rounded-full bg-[#25D366] px-3 text-[14px] font-semibold text-white shadow-lg shadow-emerald-200 disabled:opacity-50"
          >
            שלח עדכון להורים בוואטסאפ 📲
          </button>
          {!canShareWhatsApp ? (
            <p className="mt-2 text-[12px] text-slate-500">Add a parent WhatsApp number in Settings first.</p>
          ) : (
            <p className="mt-2 text-[12px] text-slate-500">Send WhatsApp update to parents</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function ConfettiBurst({ color }: { color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const parent = canvas.parentElement;
    const width = parent?.clientWidth ?? 360;
    const height = parent?.clientHeight ?? 640;
    canvas.width = width;
    canvas.height = height;

    const colors = [color, "#f59e0b", "#22c55e", "#38bdf8", "#f472b6", "#ffffff"];
    const pieces = Array.from({ length: 70 }, () => ({
      x: Math.random() * width,
      y: -20 - Math.random() * 80,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      vy: 2.4 + Math.random() * 3.2,
      vx: -1.4 + Math.random() * 2.8,
      rot: Math.random() * Math.PI,
      vr: -0.12 + Math.random() * 0.24,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));

    let frame = 0;
    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (const piece of pieces) {
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.rot += piece.vr;
        ctx.save();
        ctx.translate(piece.x, piece.y);
        ctx.rotate(piece.rot);
        ctx.fillStyle = piece.color;
        ctx.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
        ctx.restore();
      }
      frame += 1;
      if (frame < 180) raf = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, width, height);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [color]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-0" />;
}
