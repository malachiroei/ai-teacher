import { NextResponse } from "next/server";
import { polishHebrewTranslation, quickHebrewSubtitle, shouldSkipLlmTranslate } from "@/lib/hebrew";
import { trustSystemCertificates } from "@/lib/tls";

export const dynamic = "force-dynamic";

const MODEL = "gemini-2.5-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const TIMEOUT_MS = 2500;

function geminiApiKey() {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    ""
  );
}

function geminiAuthHeaders(apiKey: string): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (/^ya29[.-]/i.test(apiKey)) {
    headers.Authorization = `Bearer ${apiKey}`;
  } else {
    headers["x-goog-api-key"] = apiKey;
  }
  return headers;
}

function textFromGeminiResponse(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const data = payload as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };
  if (data.error?.message) throw new Error(data.error.message);
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => part.text ?? "").join("").trim();
}

async function translateWithGemini(apiKey: string, english: string, gender?: string | null) {
  trustSystemCertificates();
  const genderHint =
    gender === "girl"
      ? "Use feminine Hebrew forms (את, את אוהבת)."
      : gender === "other"
        ? "Avoid gendered verbs when possible."
        : "Use masculine Hebrew forms (אתה, אתה אוהב).";

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Translate this spoken English tutor reply into natural Israeli Hebrew subtitles for a child.
Rules: natural spoken Hebrew, not word-for-word. No slash forms. ${genderHint}
Keep English names intact. Return Hebrew only — no quotes, no labels, no English.

English:
${english}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 200,
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${GEMINI_API_BASE}/models/${encodeURIComponent(MODEL)}:generateContent`, {
      method: "POST",
      headers: geminiAuthHeaders(apiKey),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Gemini ${MODEL} ${response.status}: ${details.slice(0, 400)}`);
    }
    const text = textFromGeminiResponse(await response.json());
    if (!text) return "";
    return polishHebrewTranslation(
      text,
      gender === "girl" || gender === "boy" || gender === "other" ? gender : null,
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: string; gender?: string | null };
    const text = String(body.text ?? "").trim();
    if (!text) {
      return NextResponse.json({ translation: "", source: "empty" });
    }

    const local = quickHebrewSubtitle(text, body.gender);
    if (shouldSkipLlmTranslate(text, local)) {
      return NextResponse.json({ translation: local, source: "local" });
    }

    const apiKey = geminiApiKey();
    if (!apiKey) {
      return NextResponse.json({ translation: local, source: "local" });
    }

    try {
      const translation = await translateWithGemini(apiKey, text, body.gender);
      return NextResponse.json({
        translation: translation || local,
        source: translation ? "gemini" : "local",
      });
    } catch (error) {
      console.warn("[Translate API] Gemini skipped:", error instanceof Error ? error.message : error);
      return NextResponse.json({ translation: local, source: "local" });
    }
  } catch (error) {
    console.error("[Translate API Error]:", error);
    return NextResponse.json({ translation: "" }, { status: 200 });
  }
}
