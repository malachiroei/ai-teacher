"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function recorderMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function useSessionRecorder() {
  const [recording, setRecording] = useState(false);
  const [supported, setSupported] = useState(false);
  const [hasClip, setHasClip] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia));
    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const stop = useCallback(() => {
    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    } catch {
      /* ignore */
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(false);
  }, []);

  const start = useCallback(async () => {
    if (!supported || recording) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = recorderMime();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        setHasClip(chunksRef.current.length > 0);
      };
      recorder.start(1000);
      setRecording(true);
      setHasClip(false);
      return true;
    } catch {
      stop();
      return false;
    }
  }, [recording, stop, supported]);

  const toggle = useCallback(async () => {
    if (recording) {
      stop();
      return false;
    }
    return start();
  }, [recording, start, stop]);

  const download = useCallback(() => {
    const type = recorderMime() || "audio/webm";
    const blob = new Blob(chunksRef.current, { type });
    if (blob.size === 0) return false;
    const ext = type.includes("mp4") ? "m4a" : "webm";
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    link.href = url;
    link.download = `buddyai-conversation-${stamp}.${ext}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
  }, []);

  return { recording, supported, hasClip, start, stop, toggle, download };
}
