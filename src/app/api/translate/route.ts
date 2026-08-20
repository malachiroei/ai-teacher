import { NextResponse } from "next/server";
import {
  polishHebrewTranslation,
  quickHebrewSubtitle,
  shouldSkipLlmTranslate,
  isCleanHebrewSubtitle,
  isCompleteHebrewSubtitle,
} from "@/lib/hebrew";
import { trustSystemCertificates } from "@/lib/tls";

export const dynamic = "force-dynamic";

const MODEL = "gemini-2.5-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const TIMEOUT_MS = 12000;

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

function cleanHebrewOutput(text: string) {
  return text
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^(Hebrew|Translation|תרגום)\s*[:\-–]\s*/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
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
            text: `Translate the COMPLETE English tutor reply below into one natural Israeli Hebrew subtitle for a child.
Rules:
- Translate EVERY sentence to the end — never stop mid-phrase.
- Natural spoken Hebrew for the FULL reply, not word-by-word.
- No slash forms (אוהב/ת). ${genderHint}
- Keep English personal names intact (Roei, Emma, Alex).
- Return Hebrew only — no quotes, labels, JSON, or English leftover.

English:
${english}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1024,
      // Thinking tokens otherwise eat the budget and truncate the Hebrew mid-sentence.
      thinkingConfig: { thinkingBudget: 0 },
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
    const text = cleanHebrewOutput(textFromGeminiResponse(await response.json()));
    if (!text || !/[\u0590-\u05FF]/.test(text)) return "";
    const polished = polishHebrewTranslation(
      text,
      gender === "girl" || gender === "boy" || gender === "other" ? gender : null,
    );
    if (!isCompleteHebrewSubtitle(polished, english)) return "";
    return polished;
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

    const localRaw = quickHebrewSubtitle(text, body.gender);
    const local = isCleanHebrewSubtitle(localRaw) ? localRaw : "";
    if (shouldSkipLlmTranslate(text, local)) {
      return NextResponse.json({ translation: local, source: "local" });
    }

    const apiKey = geminiApiKey();
    if (!apiKey) {
      return NextResponse.json({ translation: local, source: "local" });
    }

    try {
      const translationRaw = await translateWithGemini(apiKey, text, body.gender);
      const translation = isCompleteHebrewSubtitle(translationRaw, text) ? translationRaw : "";
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
