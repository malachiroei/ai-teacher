"use client";

import { useEffect, useRef } from "react";

export type VoiceWaveMode = "idle" | "listening" | "speaking" | "thinking";

interface VoiceWaveProps {
  mode: VoiceWaveMode;
  color?: string;
  levelRef?: { current: number };
}

export function VoiceWave({ mode, color = "#3DFF8A", levelRef }: VoiceWaveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode);
  const levelHolder = useRef(levelRef);
  modeRef.current = mode;
  levelHolder.current = levelRef;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let time = 0;
    let amplitude = 0.03;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const draw = () => {
      const { width: w, height: h } = canvas.getBoundingClientRect();
      const current = modeRef.current;
      const liveLevel = Math.max(0, Math.min(1, levelHolder.current?.current ?? 0));
      const listeningLoud = current === "listening" && liveLevel >= 0.05;
      const speakingLoud = current === "speaking";
      const active = speakingLoud || listeningLoud || current === "thinking";
      const target =
        current === "speaking"
          ? 0.38 + liveLevel * 0.82
          : current === "listening"
            ? liveLevel < 0.05
              ? 0.018
              : 0.32 + liveLevel * 0.9
            : current === "thinking"
              ? 0.22
              : 0.016;
      amplitude += (target - amplitude) * (active ? 0.18 : 0.28);
      time += active ? 0.05 + liveLevel * 0.04 : 0.003;

      ctx.clearRect(0, 0, w, h);

      if (active) {
        const wash = ctx.createLinearGradient(0, 0, w, 0);
        wash.addColorStop(0, "transparent");
        wash.addColorStop(0.5, `${color}55`);
        wash.addColorStop(1, "transparent");
        ctx.fillStyle = wash;
        ctx.fillRect(0, h * 0.2, w, h * 0.6);
      }

      const layers = active
        ? [
            { gain: 1, freq: 1.35 + liveLevel * 0.7, speed: 1, width: 2.4, alpha: 0.95 },
            { gain: 0.58, freq: 2.2 + liveLevel * 0.9, speed: 1.4, width: 1.5, alpha: 0.42 },
            { gain: 0.32, freq: 3.1, speed: 0.72, width: 1.15, alpha: 0.26 },
          ]
        : [{ gain: 1, freq: 1, speed: 0.12, width: 1.5, alpha: 0.45 }];

      for (const layer of layers) {
        ctx.beginPath();
        ctx.lineWidth = layer.width;
        ctx.strokeStyle = color;
        ctx.globalAlpha = layer.alpha;
        ctx.shadowColor = color;
        ctx.shadowBlur = active ? 26 : 4;
        const mid = h / 2;
        for (let x = 0; x <= w; x += 2) {
          const nx = x / w;
          const envelope = Math.sin(Math.PI * nx) ** 1.15;
          const wave =
            Math.sin(nx * Math.PI * 2 * layer.freq + time * layer.speed) *
              amplitude *
              layer.gain *
              h *
              (active ? 0.42 : 0.08) *
              envelope +
            (active ? Math.sin(nx * Math.PI * 7 + time * 1.7) * amplitude * 0.12 * h * envelope : 0);
          const y = mid + wave;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [color]);

  return <canvas ref={canvasRef} className="h-[3rem] w-full" aria-hidden />;
}
