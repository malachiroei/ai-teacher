"use client";

import { useEffect } from "react";

const DEFAULT_TITLE = "BuddyAI – Your AI English Best Friend";

export function DocumentTitle({ tutorName }: { tutorName?: string | null }) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = tutorName?.trim() ? `${tutorName.trim()} · BuddyAI` : DEFAULT_TITLE;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [tutorName]);

  return null;
}
