"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { BuddyAIMark } from "@/components/BuddyAIMark";
import { createClient } from "@/lib/supabase/client";

interface AuthModalProps {
  onAuthenticated: () => void;
}

export function AuthModal({ onAuthenticated }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    try {
      const supabase = createClient();
      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        onAuthenticated();
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) throw signUpError;
      if (data.session) {
        onAuthenticated();
        return;
      }
      setNotice("Check your email to confirm your account, then log in.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ambient-shell absolute inset-0 z-[60] flex flex-col px-6 pt-12 pb-8">
      <div className="mb-8 text-center">
        <BuddyAIMark className="mx-auto mb-4 h-16 w-16 rounded-2xl shadow-[0_8px_28px_rgba(61,255,138,0.28)]" />
        <h1 className="text-2xl font-bold text-slate-900">BuddyAI</h1>
        <p className="mt-1 text-sm text-slate-500">Your AI English best friend. Sign in to save chats and progress.</p>
      </div>

      <div className="mb-5 grid grid-cols-2 rounded-full bg-slate-100 p-1">
        <button
          type="button"
          suppressHydrationWarning
          onClick={() => setMode("login")}
          className={`rounded-full py-2 text-sm font-semibold transition ${
            mode === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
          }`}
        >
          Log in
        </button>
        <button
          type="button"
          suppressHydrationWarning
          onClick={() => setMode("signup")}
          className={`rounded-full py-2 text-sm font-semibold transition ${
            mode === "signup" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
          }`}
        >
          Sign up
        </button>
      </div>

      <form className="flex flex-1 flex-col" onSubmit={(event) => void handleSubmit(event)}>
        <label className="mb-3 block text-sm font-medium text-slate-600">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            suppressHydrationWarning
            autoComplete="email"
            className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] text-slate-900 outline-none focus:border-[#2f6bff] focus:bg-white"
            placeholder="you@email.com"
          />
        </label>
        <label className="mb-4 block text-sm font-medium text-slate-600">
          Password
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            suppressHydrationWarning
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] text-slate-900 outline-none focus:border-[#2f6bff] focus:bg-white"
            placeholder="At least 6 characters"
          />
        </label>

        {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
        {notice ? <p className="mb-3 text-sm text-emerald-600">{notice}</p> : null}

        <button
          type="submit"
          disabled={loading}
          suppressHydrationWarning
          className="mt-auto flex h-12 items-center justify-center rounded-full bg-[#2f6bff] text-[15px] font-semibold text-white shadow-lg shadow-blue-200 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
