"use client";

import { useEffect, useState } from "react";

interface VisualViewportFrame {
  height: number;
  offsetTop: number;
  keyboardOpen: boolean;
}

const INITIAL: VisualViewportFrame = { height: 0, offsetTop: 0, keyboardOpen: false };

export function useVisualViewport() {
  const [frame, setFrame] = useState<VisualViewportFrame>(INITIAL);

  useEffect(() => {
    const sync = () => {
      const vv = window.visualViewport;
      const height = Math.round(vv?.height ?? window.innerHeight);
      const offsetTop = Math.round(vv?.offsetTop ?? 0);
      const keyboardOpen = Math.max(0, window.innerHeight - height - offsetTop) > 80;
      setFrame({ height, offsetTop, keyboardOpen });
    };

    sync();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  return frame;
}
