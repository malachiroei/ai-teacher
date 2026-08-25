"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  extractChildMemoryPatch,
  loadChildMemoryLocal,
  mergeChildMemory,
  parseChildMemory,
  saveChildMemoryLocal,
  seedChildMemoryFromAccount,
} from "@/lib/child-memory";
import { emptyChildMemory, type ChildMemoryProfile } from "@/types/childProfile";

async function loadChildMemoryFromSupabase(userId: string): Promise<ChildMemoryProfile | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.from("profiles").select("child_memory").eq("id", userId).maybeSingle();
    if (error || !data) return null;
    return parseChildMemory((data as { child_memory?: unknown }).child_memory);
  } catch {
    return null;
  }
}

async function syncChildMemoryToSupabase(userId: string, profile: ChildMemoryProfile) {
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ child_memory: profile, updated_at: new Date().toISOString() } as never)
      .eq("id", userId);
    if (error) console.warn("Child memory sync skipped:", error.message);
  } catch (error) {
    console.warn("Child memory sync skipped:", error);
  }
}

export function useMemoryExtractor(userId?: string | null, account?: {
  nickname?: string | null;
  age?: number | string | null;
  interests?: string[] | string | null;
} | null) {
  const [childMemory, setChildMemory] = useState<ChildMemoryProfile>(emptyChildMemory);
  const memoryRef = useRef(childMemory);
  memoryRef.current = childMemory;

  useEffect(() => {
    let cancelled = false;
    const local = loadChildMemoryLocal(userId);
    const seeded = mergeChildMemory(local, seedChildMemoryFromAccount(account ?? {}));
    setChildMemory(seeded);
    saveChildMemoryLocal(seeded, userId);
    if (!userId) return;
    void loadChildMemoryFromSupabase(userId).then((remote) => {
      if (cancelled || !remote) return;
      const merged = mergeChildMemory(remote, seeded);
      setChildMemory(merged);
      saveChildMemoryLocal(merged, userId);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, account?.nickname, account?.age]);

  const ingestUtterance = useCallback(
    (text: string) => {
      const patch = extractChildMemoryPatch(text);
      if (!Object.keys(patch).length) return memoryRef.current;
      const next = mergeChildMemory(memoryRef.current, patch);
      memoryRef.current = next;
      setChildMemory(next);
      saveChildMemoryLocal(next, userId);
      if (userId) void syncChildMemoryToSupabase(userId, next);
      return next;
    },
    [userId],
  );

  return { childMemory, ingestUtterance };
}
