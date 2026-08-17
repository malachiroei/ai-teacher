"use client";

import { useEffect, useRef } from "react";

export type VoiceWaveMode = "idle" | "listening" | "speaking" | "thinking";

interface VoiceWaveProps {
  mode: VoiceWaveMode;
  color?: string;
}

export function VoiceWave({ mode, color = "#3DFF8A" }: VoiceWaveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let time = 0;
    let amplitude = 0.16;

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
      const target =
        current === "speaking" ? 0.95 : current === "listening" ? 0.8 : current === "thinking" ? 0.46 : 0.15;
      amplitude += (target - amplitude) * 0.07;
      time += current === "idle" ? 0.016 : current === "thinking" ? 0.03 : 0.054;

      ctx.clearRect(0, 0, w, h);

      if (current !== "idle") {
        const wash = ctx.createLinearGradient(0, 0, w, 0);
        wash.addColorStop(0, "transparent");
        wash.addColorStop(0.5, `${color}55`);
        wash.addColorStop(1, "transparent");
        ctx.fillStyle = wash;
        ctx.fillRect(0, h * 0.2, w, h * 0.6);
      }

      const layers = [
        { gain: 1, freq: 1.55, speed: 1, width: 2.4, alpha: 0.95 },
        { gain: 0.58, freq: 2.45, speed: 1.4, width: 1.5, alpha: 0.42 },
        { gain: 0.32, freq: 3.3, speed: 0.72, width: 1.15, alpha: 0.26 },
      ];

      for (const layer of layers) {
        ctx.beginPath();
        ctx.lineWidth = layer.width;
        ctx.strokeStyle = color;
        ctx.globalAlpha = layer.alpha;
        ctx.shadowColor = color;
        ctx.shadowBlur = current === "idle" ? 10 : 26;
        const mid = h / 2;
        for (let x = 0; x <= w; x += 2) {
          const nx = x / w;
          const envelope = Math.sin(Math.PI * nx) ** 1.15;
          const y =
            mid +
            Math.sin(nx * Math.PI * 2 * layer.freq + time * layer.speed) *
              amplitude *
              layer.gain *
              h *
              0.42 *
              envelope +
            Math.sin(nx * Math.PI * 7 + time * 1.7) * amplitude * 0.12 * h * envelope;
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

  return <canvas ref={canvasRef} className="h-[4.25rem] w-full" aria-hidden />;
}
