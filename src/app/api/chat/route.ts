import { NextResponse } from "next/server";
import { getCharacter } from "@/lib/characters";
import {
  collapseRepeatedSpeech,
  detectUserLanguage,
  englishSpeechLine,
  isRedundantSpeechChunk,
  isSimpleGreeting,
  looksLikeAwkwardEnglish,
  looksLikeGibberishEnglish,
  shouldOfferSayHint,
  stripUnsolicitedScaffold,
} from "@/lib/language";
import { buildLearnerContext, profilePayload } from "@/lib/learner";
import { buildChildMemoryPrompt, buildSystemPromptSections } from "@/lib/systemPromptBuilder";
import type { ChildMemoryProfile } from "@/types/childProfile";
import { parseChildMemory } from "@/lib/child-memory";
import { normalizeNewMemories, parseFavoriteThing, extractFactsFromUtterance, type UserMemory } from "@/lib/memory";
import { guessSpokenName, isPlacementActive, placementAnswerTurns, placementFollowUp } from "@/lib/placement";
import {
  encodeSse,
  pullSpeakableChunks,
  speakableSentences,
  type ChatStreamEvent,
} from "@/lib/chat-stream";
import { dayPartFromHour, timeOfDayGreeting, timeOfDaySystemHint } from "@/lib/daypart";
import { fetchProfile } from "@/lib/chat-history";
import { createClient } from "@/lib/supabase/server";
import { trustSystemCertificates } from "@/lib/tls";
import { logPipelineLatencyReport, type PipelineServerMetrics } from "@/lib/pipeline-latency";
import type { ProfileInput } from "@/lib/supabase/types";
import type { ChatApiResponse, GrammarFeedback, Message } from "@/types/chat";

export const dynamic = "force-dynamic";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

const FAST_MODELS = ["gemini-2.5-flash"];
/** Only wait this long for Gemini response headers — never abort an in-flight stream. */
const GEMINI_CONNECT_TIMEOUT_MS = 12_000;
const VOICE_LATENCY_RULE =
  "OUTPUT FORMAT (CRITICAL): Pure spoken English plaintext ONLY. No JSON. No Hebrew. No markdown. No labels. Energetic spoken English. Under 30 words total (beginner: under 12, A1 only). Always end with punctuation (. ! or ?). Never leave a thought incomplete.";

const BASE_TUTOR_RULES = `You are BuddyAI — a cool older sibling / supportive teammate for kids aged 6–13 (Hebrew at home).
Stay in CHARACTER. Peer-like Disney/Pixar vibe. Never a strict teacher. Never a quiz machine.

NATURAL NAMING (CRITICAL):
- Do NOT say the child's name in every message. That feels robotic.
- Use their name sparingly: greetings, once every 5–6 turns at most, or when celebrating something big.
- Most turns: talk like a real friend with no name at all.

TOPIC FLEXIBILITY (CRITICAL):
- If the child mentions or hints at ANY new topic (gaming, pizza, pets, space, school, superpowers, etc.), DROP the previous topic instantly.
- Never force the conversation back to old questions. Match their energy and jump into their world.

PERSONAL CONTEXT:
- Weave known interests and memories naturally (e.g. "Since you love basketball, would you rather…").
- Reference shared details like a real friend — not a checklist.

DYNAMIC VARIETY (anti-repetition):
- Rotate formats: Would You Rather, superhero dilemmas, amusement-park builds, spaceship naming, mini-mysteries.
- Start with a tiny funny 1-sentence anecdote about YOU, then one question.
- NEVER ask two generic "Do you like X?" questions in a row.
- NEVER default to "What movie/song/game do you like?"
- Prefer concrete, fun choices over vague "tell me more".
- 1–2 sentences max.

MICRO-GAMES (optional, about 1 in 8 turns after placement, or when they ask to play):
- Speak the fun line first. Then you MAY append exactly one tag the child never hears:
  <<<GAME: {"type":"picture_match"|"fill_missing"|"listen_pick","data":{...}}>>>
- picture_match data: prompt, emoji, options (3–4 words), answer
- fill_missing data: prompt, emoji, pattern (e.g. "P _ Z Z A"), options (letters), answer
- listen_pick data: prompt, speak (target word), options [{emoji,label}], answer
- math_match data: prompt, equation (e.g. "TWO + THREE = ?"), options like "5 — FIVE", answer
- If they talk about math/times tables, prefer a math_match game on that turn.
- Never put the GAME tag in spoken English. Never mention JSON.

MICRO-COACHING (when needed — still one short spoken reply):
1) Gentle grammar/spelling: if they misspell, mix grammar, or pick the wrong word, start with a tiny warm model of the natural phrase (e.g. "Quick tip: you can say 'ride camels'…") then continue the fun. Never say "that's wrong" or lecture.
2) Fact check: if they state something inaccurate (e.g. riding camels in Thailand), warmly share the real-world fact and invite them back in (e.g. "Thailand is famous for elephants, while camels live in deserts! Did you mean elephants?").
3) Keep the whole reply energetic, educational, and under 30 words.

INVISIBLE ENGLISH COACHING (recasting):
- If they mix in Hebrew, model the correct English phrase naturally inside your reply.
- NEVER say "that's wrong", "incorrect", or scold.

Always respond dynamically to what they just said (English or Hebrew).
If they say "I don't understand", "what?", "לא הבנתי", or "מה", explain in simpler English. NEVER say "that's awesome" to confusion.

BANNED PHRASES (never say these):
- "Cool! Tell me more about that"
- "What happened next?"
- "What do you like to do?"
- "That's interesting. Tell me more"
- "you said ... that's awesome! What do you like most about it?"
Never use a generic template. Every reply MUST react to specific words they used — except when confused, then explain.

3-STAGE FLOW:
Stage 1 — Initial connection (first 3–4 real answers ONLY if facts are unknown):
  1) Warm greeting (name OK here once).
  2) Grade / age.
  3) Favorite subject or hobby.
Stage 2 — Deep curiosity (default after Stage 1): follow THEIR lead with varied formats above.
Stage 3 — Memory: use ### USER PROFILE & MEMORIES. Answer memory questions directly. Store new personal facts.

LANGUAGE / OUTPUT:
- Default: ONE punchy sentence + ONE open question. Under 25 words. Max 2 sentences.
- If grammar/fact coaching is needed: still under 30 words total, energetic, then a question.
- If grammar/fact coaching is needed: still under 30 words total, energetic, then a question.
- beginner: max ~8 words before the question, A1 only (hi, like, play, fun, yes, no, good).
- intermediate: max ~12 words before the question.
- advanced: still kid-friendly, under 30 words total.
- English plaintext ONLY. Never Hebrew in the spoken reply. Never JSON. Never markdown fences.
- If they speak Hebrew: not an error. Reply in simple English. Recast their idea in correct English naturally.

GREETINGS (hi, hey, hello, שלום, היי):
- Warm hello; name allowed once. Never teach a phrase. Never "You can say".
- Do NOT default to sports (or any one hobby) every time they say hi.
- Vary the opener: how their day is going, a Would You Rather, a superpower, a tiny mystery.
- Examples: "Hey! I almost named my cereal bowl Mission Control. Fly or invisible for one day?" / "Hey there! What's something fun you did today?"
Do not ask their name again if you already know it.`;

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

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
    Accept: "text/event-stream, application/json",
  };
  // AQ. and AIzaSy keys must use x-goog-api-key. Sending them as Bearer makes Google expect OAuth and return 401.
  if (/^ya29[.-]/i.test(apiKey)) {
    headers.Authorization = `Bearer ${apiKey}`;
  } else {
    headers["x-goog-api-key"] = apiKey;
  }
  return headers;
}

type ChatAction = "chat" | "change_topic" | "daily_open";
type ChatTurn = Pick<Message, "sender" | "text">;

interface ChatRequestBody {
  messages?: Array<ChatTurn & { role?: string; content?: string }>;
  userMessage?: string;
  action?: ChatAction;
  profile?: ProfileInput | null;
  characterId?: string | null;
  memories?: UserMemory[];
  childMemory?: ChildMemoryProfile | null;
  isFirstSessionToday?: boolean;
  placement?: boolean;
  placementCompleted?: boolean;
  clientSendAt?: number | null;
  localHour?: number | null;
}

function formatStructuredUserProfile(profile?: ProfileInput | null) {
  if (!profile) return "";
  const fullName = String(profile.name ?? profile.nickname ?? "").trim() || "friend";
  const level = String(profile.english_level ?? (profile as any).englishLevel ?? "beginner").trim().toLowerCase() || "beginner";
  const interestsList = Array.isArray(profile.interests) ? profile.interests : [];
  const interests = interestsList.join(", ") || "none";
  const targetDaily = Number((profile as any).daily_goal_minutes ?? 10) || 10;
  const age = Number(profile.age) || 0;

  return `### PERMANENT USER PROFILE (anchor — never ignore or forget):
- Name: ${fullName} — know it, spell it right, but do NOT say it every turn (greetings / every 5–6 turns max).
- Age: ${age > 0 ? age : "unknown"}.
- English Level: ${level} — STRICT calibration:
  ${
    level === "beginner"
      ? "BEGINNER ONLY: very short A1 sentences (max ~8 words + a tiny question). Words like hi/like/play/fun/good. No fancy words."
      : level === "intermediate"
        ? "INTERMEDIATE: short everyday sentences, one idea at a time."
        : "Keep it kid-simple and under 25 words total."
  }
- Passions / Interests: ${interests} — weave naturally when relevant; follow THEIR lead if they pivot.
- Daily Practice Target: ${targetDaily} min/day.
Use Level and Interests. Never re-ask for facts already stored here. Never force their name into every reply.`;
}

const TOPIC_STARTERS: ChatApiResponse[] = [
  {
    aiResponse: "Sure thing! What do you feel like talking about right now?",
    translation: "בשמחה! על מה בא לך לדבר עכשיו?",
    grammarAnalysis: {
      hasError: false,
      explanation: "אין כאן שגיאת דקדוק — פשוט מחליפים נושא.",
      correctedText: "",
    },
    suggestedAnswers: ["Let's talk about games.", "I want to talk about sports.", "Animals!"],
  },
  {
    aiResponse: "Totally! What's on your mind — games, food, space, or something else?",
    translation: "בטח! מה בראש שלך — משחקים, אוכל, חלל, או משהו אחר?",
    grammarAnalysis: {
      hasError: false,
      explanation: "אין כאן שגיאת דקדוק — פשוט מחליפים נושא.",
      correctedText: "",
    },
    suggestedAnswers: ["Games!", "Food!", "Something else."],
  },
  {
    aiResponse: "Fresh start! What sounds fun to chat about today?",
    translation: "התחלה חדשה! על מה כיף לדבר היום?",
    grammarAnalysis: {
      hasError: false,
      explanation: "אין כאן שגיאת דקדוק — פשוט מחליפים נושא.",
      correctedText: "",
    },
    suggestedAnswers: ["Pets!", "School!", "Superpowers!"],
  },
  {
    aiResponse: "I'm in! Tell me — what do you feel like talking about?",
    translation: "אני בפנים! תגיד — על מה בא לך לדבר?",
    grammarAnalysis: {
      hasError: false,
      explanation: "אין כאן שגיאת דקדוק — פשוט מחליפים נושא.",
      correctedText: "",
    },
    suggestedAnswers: ["Movies!", "Sports!", "Whatever is cool."],
  },
];

const INTEREST_TOPICS: Record<string, ChatApiResponse> = {
  Movies: {
    aiResponse: "Sure! What do you feel like talking about — movies, or something brand new?",
    translation: "בשמחה! על מה בא לך לדבר — סרטים, או משהו חדש לגמרי?",
    grammarAnalysis: { hasError: false, explanation: "אין כאן שגיאת דקדוק — פשוט מחליפים נושא.", correctedText: "" },
    suggestedAnswers: ["Movies!", "Something new.", "Games instead."],
  },
  Cars: {
    aiResponse: "Let's switch! What do you feel like talking about right now?",
    translation: "בואו נחליף! על מה בא לך לדבר עכשיו?",
    grammarAnalysis: { hasError: false, explanation: "אין כאן שגיאת דקדוק — פשוט מחליפים נושא.", correctedText: "" },
    suggestedAnswers: ["Cars!", "Something else.", "Games!"],
  },
  Travel: {
    aiResponse: "Fresh topic time! What do you feel like chatting about?",
    translation: "זמן לנושא חדש! על מה בא לך לדבר?",
    grammarAnalysis: { hasError: false, explanation: "אין כאן שגיאת דקדוק — פשוט מחליפים נושא.", correctedText: "" },
    suggestedAnswers: ["Travel!", "Food!", "Animals!"],
  },
  Sports: {
    aiResponse: "Sure thing! What do you feel like talking about right now?",
    translation: "בשמחה! על מה בא לך לדבר עכשיו?",
    grammarAnalysis: { hasError: false, explanation: "אין כאן שגיאת דקדוק — פשוט מחליפים נושא.", correctedText: "" },
    suggestedAnswers: ["Sports!", "Games!", "Something fun."],
  },
  Tech: {
    aiResponse: "I'm ready! What do you feel like talking about?",
    translation: "אני מוכן! על מה בא לך לדבר?",
    grammarAnalysis: { hasError: false, explanation: "אין כאן שגיאת דקדוק — פשוט מחליפים נושא.", correctedText: "" },
    suggestedAnswers: ["Tech!", "Games!", "Something else."],
  },
  Music: {
    aiResponse: "Cool switch! What do you feel like talking about right now?",
    translation: "החלפה מגניבה! על מה בא לך לדבר עכשיו?",
    grammarAnalysis: { hasError: false, explanation: "אין כאן שגיאת דקדוק — פשוט מחליפים נושא.", correctedText: "" },
    suggestedAnswers: ["Music!", "Movies!", "Games!"],
  },
  Food: {
    aiResponse: "Yum energy! What do you feel like talking about?",
    translation: "אנרגיית אוכל! על מה בא לך לדבר?",
    grammarAnalysis: { hasError: false, explanation: "אין כאן שגיאת דקדוק — פשוט מחליפים נושא.", correctedText: "" },
    suggestedAnswers: ["Food!", "Pizza!", "Something else."],
  },
  Games: {
    aiResponse: "Game on — or new vibe? What do you feel like talking about?",
    translation: "משחקים — או וייב חדש? על מה בא לך לדבר?",
    grammarAnalysis: { hasError: false, explanation: "אין כאן שגיאת דקדוק — פשוט מחליפים נושא.", correctedText: "" },
    suggestedAnswers: ["Games!", "Sports!", "Something new."],
  },
};

function pickTopic(turn: number, profile?: ProfileInput | null): ChatApiResponse {
  const interests = Array.isArray(profile?.interests)
    ? profile.interests
    : String(profile?.interests ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  if (interests.length > 0) {
    const topic = interests[turn % interests.length];
    const match = INTEREST_TOPICS[topic];
    if (match) return match;
  }
  return TOPIC_STARTERS[turn % TOPIC_STARTERS.length];
}

function turnsSinceNameUsed(history: ChatTurn[], name: string) {
  const trimmed = name.trim();
  if (!trimmed) return 99;
  const aiTurns = history.filter((turn) => turn.sender === "ai");
  for (let i = aiTurns.length - 1; i >= 0; i -= 1) {
    if (new RegExp(`\\b${trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(aiTurns[i].text)) {
      return aiTurns.length - 1 - i;
    }
  }
  return 99;
}

function namingHint(history: ChatTurn[], profile?: ProfileInput | null) {
  const name = String(profile?.nickname ?? profile?.name ?? "").trim();
  if (!name) return "NAMING: No known name yet. Do not invent one.";
  const since = turnsSinceNameUsed(history, name);
  if (since < 5) {
    return `NAMING: Their name is ${name}. You used it recently (${since} AI turn(s) ago). Do NOT use their name this turn.`;
  }
  return `NAMING: Their name is ${name}. Optional this turn (not required). Prefer no name unless it feels natural.`;
}

const GRAMMAR_PATTERNS: { re: RegExp; explanation: string; replace: [RegExp, string] }[] = [
  {
    re: /\bi is\b/i,
    explanation: 'עם "I" משתמשים ב-"am". אומרים "I am", לא "I is".',
    replace: [/\bi is\b/i, "I am"],
  },
  {
    re: /\bi has\b/i,
    explanation: 'עם "I" משתמשים ב-"have". אומרים "I have", לא "I has".',
    replace: [/\bi has\b/i, "I have"],
  },
  {
    re: /\bhe don't\b/i,
    explanation: 'עם he/she/it אומרים "doesn\'t", לא "don\'t".',
    replace: [/\bhe don't\b/i, "he doesn't"],
  },
  {
    re: /\bshe don't\b/i,
    explanation: 'עם he/she/it אומרים "doesn\'t", לא "don\'t".',
    replace: [/\bshe don't\b/i, "she doesn't"],
  },
  {
    re: /\bgoed\b/i,
    explanation: 'צורת העבר של "go" היא "went", לא "goed".',
    replace: [/\bgoed\b/i, "went"],
  },
  {
    re: /\bi am agree\b/i,
    explanation: 'אומרים "I agree", בלי "am".',
    replace: [/\bi am agree\b/i, "I agree"],
  },
  {
    re: /\bmore better\b/i,
    explanation: '"Better" כבר בצורת השוואה. אומרים "better", לא "more better".',
    replace: [/\bmore better\b/i, "better"],
  },
  {
    re: /\bshe have\b/i,
    explanation: 'עם she/he/it אומרים "has". לדוגמה: "she has".',
    replace: [/\bshe have\b/i, "she has"],
  },
  {
    re: /\bhe have\b/i,
    explanation: 'עם she/he/it אומרים "has". לדוגמה: "he has".',
    replace: [/\bhe have\b/i, "he has"],
  },
  {
    re: /\bi can to\b/i,
    explanation: 'אחרי "can" בא הפועל הבסיסי: "I can go", לא "I can to go".',
    replace: [/\bi can to\b/i, "I can"],
  },
  {
    re: /\bdid you went\b/i,
    explanation: 'אחרי "did" משתמשים בפועל הבסיסי: "Did you go?", לא "Did you went?"',
    replace: [/\bdid you went\b/i, "did you go"],
  },
  {
    re: /\bi very like\b/i,
    explanation: 'אומרים "I really like" או "I like … very much".',
    replace: [/\bi very like\b/i, "I really like"],
  },
];

interface HebrewLesson {
  test: RegExp;
  english: string;
  ack: string;
  followUp: string;
  translation: string;
  suggestions: string[];
}

const HEBREW_LESSONS: HebrewLesson[] = [
  {
    test: /כדורגל|football|soccer/,
    english: "I play football.",
    ack: "You play football? That's awesome!",
    followUp: "Are you a striker or a goalkeeper?",
    translation: "אתה משחק כדורגל? איזה כיף! אתה חלוץ או שוער?",
    suggestions: ["I am a striker!", "I am a goalkeeper.", "I play with friends."],
  },
  {
    test: /כיתה|\d+(?:st|nd|rd|th)?\s*grade|grade\s*\d+/,
    english: "I am in 4th grade.",
    ack: "You're in that grade? Nice!",
    followUp: "What's your favorite subject at school?",
    translation: "אתה בכיתה הזאת? מגניב! מה המקצוע האהוב עליך בבית הספר?",
    suggestions: ["I like math.", "I like sport.", "I like English."],
  },
  {
    test: /לים|הים|לחוף|החוף|לשחות|שחייה|sandcastle|beach/,
    english: "I love the beach!",
    ack: "I love the beach!",
    followUp: "Do you like swimming in the sea or making sandcastles?",
    translation: "אני אוהב את החוף! אתה אוהב לשחות בים או לבנות ארמונות חול?",
    suggestions: ["I like swimming.", "I make sandcastles.", "The water is fun!"],
  },
  {
    test: /שלום|היי|הי\b|בוקר טוב|ערב טוב/,
    english: "Hello!",
    ack: "Hey there! Great to see you!",
    followUp: "What is your name?",
    translation: "היי! איזה כיף לראות אותך! איך קוראים לך?",
    suggestions: ["My name is Tom.", "I'm Maya.", "I am Alex."],
  },
  {
    test: /מה שלומך|מה נשמע|איך אתה|איך את\b/,
    english: "How are you?",
    ack: "I'm great!",
    followUp: "How are you today?",
    translation: "אני מעולה! מה שלומך היום?",
    suggestions: ["I'm fine, thanks.", "I'm great today.", "A little tired."],
  },
  {
    test: /אני בסדר|הכל טוב|הכול טוב|סבבה/,
    english: "I'm fine.",
    ack: "Glad to hear that!",
    followUp: "What did you do today?",
    translation: "שמח לשמוע! מה עשית היום?",
    suggestions: ["I played a game.", "I met a friend.", "Not much, just relaxing."],
  },
  {
    test: /עייף|עייפה|לא ישנתי/,
    english: "I'm tired.",
    ack: "Aw, rest sounds nice.",
    followUp: "Did you sleep well last night?",
    translation: "אוי, מנוחה זה כיף. ישנת טוב בלילה?",
    suggestions: ["Not really.", "Yes, I slept well.", "I went to bed late."],
  },
  {
    test: /שמח|שמחה|מצוין|כיף/,
    english: "I'm happy.",
    ack: "That's wonderful!",
    followUp: "What made you feel that way?",
    translation: "איזה כיף! מה גרם לך להרגיש ככה?",
    suggestions: ["I got good news.", "The weather is nice.", "I played with friends."],
  },
  {
    test: /רעב|רעבה|אוכל|לאכול/,
    english: "I'm hungry.",
    ack: "Yum, food is fun!",
    followUp: "What do you want to eat?",
    translation: "מממ, אוכל זה כיף! מה בא לך לאכול?",
    suggestions: ["I want pizza.", "I like fruit.", "Maybe just a snack."],
  },
  {
    test: /רוצה ללמוד|ללמוד אנגלית|אנגלית/,
    english: "I want to learn English.",
    ack: "I love that!",
    followUp: "What do you want to talk about?",
    translation: "איזה כיף! על מה בא לך לדבר?",
    suggestions: ["Animals!", "Food!", "Games!"],
  },
  {
    test: /אוהב|אוהבת/,
    english: "I like it.",
    ack: "Nice!",
    followUp: "What made it so fun?",
    translation: "נחמד! מה הכי כיף בזה?",
    suggestions: ["I like music.", "I like sports.", "I like pizza."],
  },
  {
    test: /עובד|עבודה|עובדת|בית ספר|כיתה/,
    english: "I go to school.",
    ack: "School is a great topic!",
    followUp: "What class do you like?",
    translation: "בית ספר זה נושא מעולה! איזה שיעור אתה אוהב?",
    suggestions: ["I like art.", "I like sport.", "I like English."],
  },
  {
    test: /תודה|תודה רבה/,
    english: "Thank you.",
    ack: "You're welcome!",
    followUp: "What should we talk about next?",
    translation: "על לא דבר! על מה נדבר עכשיו?",
    suggestions: ["Let's talk about hobbies.", "Tell me about your day.", "I like games."],
  },
  {
    test: /נעים להכיר/,
    english: "Nice to meet you.",
    ack: "Nice to meet you too!",
    followUp: "What is your favorite thing to learn or play?",
    translation: "גם לי נעים להכיר! מה הדבר האהוב עליך ללמוד או לשחק?",
    suggestions: ["I like pizza.", "I like dogs.", "I like soccer."],
  },
];

function emptyGrammar(correctedText = ""): GrammarFeedback {
  return { hasError: false, explanation: "", correctedText };
}

function naturalGreetingReply(profile?: ProfileInput | null, askName = false, hour = new Date().getHours()): ChatApiResponse {
  const name = String(profile?.nickname ?? "").trim();
  if (askName && !name) {
    return {
      aiResponse: "Hey there! Great to see you! What is your name? 👋",
      translation: "היי! איזה כיף לראות אותך! איך קוראים לך?",
      grammarAnalysis: emptyGrammar(),
      suggestedAnswers: ["My name is Tom.", "I'm Maya.", "I am Alex."],
    };
  }

  const pick = timeOfDayGreeting(name || undefined, hour);
  return {
    aiResponse: pick.en,
    translation: pick.he,
    grammarAnalysis: emptyGrammar(),
    suggestedAnswers: pick.suggestions,
  };
}

function maybeGreetingReply(
  userMessage: string,
  action: ChatAction,
  history: ChatTurn[],
  profile?: ProfileInput | null,
  placement?: boolean,
  placementCompleted = false,
  hour = new Date().getHours(),
): ChatApiResponse | null {
  if (action !== "chat") return null;
  if (!isSimpleGreeting(userMessage)) return null;
  const knownName = String(profile?.nickname ?? "").trim();
  const inPlacement = Boolean(placement || isPlacementActive(history, placementCompleted)) && !placementCompleted && !knownName;
  return naturalGreetingReply(profile, inPlacement, hour);
}

function hebrewLessonReply(userMessage: string, allowScaffold: boolean): ChatApiResponse {
  const lesson = HEBREW_LESSONS.find((item) => item.test.test(userMessage));
  if (lesson) {
    return {
      aiResponse: allowScaffold
        ? `You can say: ${lesson.english} ${lesson.followUp}`
        : `${lesson.ack} ${lesson.followUp}`,
      translation: lesson.translation,
      grammarAnalysis: emptyGrammar(allowScaffold ? lesson.english : ""),
      suggestedAnswers: lesson.suggestions,
    };
  }

  return contextualReply(userMessage);
}

function analyzeGrammar(text: string): GrammarFeedback {
  const trimmed = text.trim();
  if (!trimmed) {
    return { hasError: false, explanation: "עדיין אין משפט לבדיקה.", correctedText: "" };
  }

  if (/goog|tank you/i.test(trimmed)) {
    return {
      hasError: true,
      explanation: 'כמעט! מתכוונים ל־"I am good, thank you." — "good" ולא "goog", ו־"thank you" ולא "tank you".',
      correctedText: "I am good, thank you.",
    };
  }

  if (/\bbich\b|\btow bich\b|\btow beach\b/i.test(trimmed)) {
    return {
      hasError: true,
      explanation: 'התכוונת לחוף. באנגלית אומרים "I\'m going to the beach today." — "to" ולא "tow", ו־"beach" ולא "bich".',
      correctedText: "I'm going to the beach today.",
    };
  }

  if (/^(i am|i'm)\.?$/i.test(trimmed)) {
    return {
      hasError: true,
      explanation: 'המשפט חסר. אחרי "I am" צריך להוסיף מילה, למשל "I am happy" או "I am fine".',
      correctedText: "I am fine.",
    };
  }

  if (looksLikeAwkwardEnglish(trimmed)) {
    return {
      hasError: true,
      explanation: "המשפט לא נשמע טבעי באנגלית. נסה לנסח שוב, או כתוב בעברית ואלמד אותך איך להגיד את זה.",
      correctedText: "Could you say that another way?",
    };
  }

  let corrected = trimmed;
  let explanation = "";

  for (const pattern of GRAMMAR_PATTERNS) {
    if (pattern.re.test(corrected)) {
      corrected = corrected.replace(pattern.replace[0], pattern.replace[1]);
      explanation = pattern.explanation;
    }
  }

  if (corrected.length > 0) {
    corrected = corrected.charAt(0).toUpperCase() + corrected.slice(1);
  }

  if (explanation) {
    return { hasError: true, explanation, correctedText: corrected };
  }

  return {
    hasError: false,
    explanation: "כל הכבוד — המשפט נשמע תקין דקדוקית.",
    correctedText: corrected,
  };
}

function capReply(text: string) {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isBannedGenericReply(text: string) {
  const n = text.replace(/\s+/g, " ").trim().toLowerCase();
  return (
    /cool!?\s*tell me more/.test(n) ||
    /what happened next\?/.test(n) ||
    /what do you like to do\?/.test(n) ||
    /tell me more about that/.test(n) ||
    /that's interesting\.?\s*tell me more/.test(n) ||
    /you said .+that'?s awesome/.test(n) ||
    /what (movie|song|game) do you like/.test(n) ||
    /favorite (movie|song|game)/.test(n)
  );
}

function looksConfused(text: string) {
  const n = text.replace(/\s+/g, " ").trim().toLowerCase();
  return (
    /^(i\s+)?(don't|dont|do not)\s+understand\b/.test(n) ||
    /^(what|huh|hmm+)\??$/.test(n) ||
    /לא מבין|לא מבינה|לא הבנתי|^מה\??$|^מה זה/.test(text)
  );
}

function contextualReply(userMessage: string, profile?: ProfileInput | null): ChatApiResponse {
  const spoken = userMessage.replace(/\s+/g, " ").trim();
  const quoted = spoken.slice(0, 42);

  if (looksConfused(spoken)) {
    return {
      aiResponse: capReply(
        `No problem — I will make it simpler. Want me to say it in Hebrew, or try a smaller English sentence?`,
      ),
      translation: `אין בעיה — נעשה את זה יותר פשוט. רוצה שאגיד בעברית, או ננסה משפט קטן באנגלית?`,
      grammarAnalysis: emptyGrammar(spoken),
      suggestedAnswers: ["Say it in Hebrew.", "A smaller sentence, please.", "I understand now."],
      newMemories: [],
    };
  }

  if (/football|soccer|כדורגל/i.test(spoken)) {
    return {
      aiResponse: capReply(`You play football? That's awesome! Are you a striker or a goalkeeper? ⚽`),
      translation: `אתה משחק כדורגל? איזה כיף! אתה חלוץ או שוער?`,
      grammarAnalysis: emptyGrammar(spoken),
      suggestedAnswers: ["I am a striker!", "I am a goalkeeper.", "I play with friends."],
      newMemories: [{ fact: "Plays football", kind: "preference", eventOn: null }],
    };
  }

  if (/\d+(?:st|nd|rd|th)?\s*grade|grade\s*\d+|כיתה/i.test(spoken)) {
    const grade = spoken.match(/\b(\d+)(?:st|nd|rd|th)?\s*grade\b/i)?.[1] || spoken.match(/grade\s*(\d+)/i)?.[1];
    const gradeHe = spoken.match(/כיתה\s*([א-ו1-9])/)?.[1];
    const gradeBit = grade ? `${grade}th grade` : gradeHe ? `grade ${gradeHe}` : "that grade";
    return {
      aiResponse: capReply(`You're in ${gradeBit}? Nice! What's your favorite subject at school? 🏫`),
      translation: `אתה בכיתה הזאת? מגניב! מה המקצוע האהוב עליך בבית הספר?`,
      grammarAnalysis: emptyGrammar(spoken),
      suggestedAnswers: ["I like math.", "I like sport.", "I like English."],
      newMemories: grade
        ? [{ fact: `In grade ${grade}`, kind: "personal", eventOn: null }]
        : gradeHe
          ? [{ fact: `In grade ${gradeHe}`, kind: "personal", eventOn: null }]
          : [{ fact: "Shared their school grade", kind: "personal", eventOn: null }],
    };
  }

  if (/לים|הים|לחוף|החוף|beach|swim/i.test(spoken)) {
    return {
      aiResponse: capReply(`I love the beach! Do you like swimming in the sea or making sandcastles? 🏖️`),
      translation: `אני אוהב את החוף! אתה אוהב לשחות בים או לבנות ארמונות חול?`,
      grammarAnalysis: emptyGrammar(spoken),
      suggestedAnswers: ["I like swimming.", "I make sandcastles.", "The water is fun!"],
      newMemories: [{ fact: "Likes the beach", kind: "preference", eventOn: null }],
    };
  }

  if (/\b(roblox|minecraft|fortnite)\b/i.test(spoken)) {
    const game = spoken.match(/\b(roblox|minecraft|fortnite)\b/i)?.[1] ?? "that game";
    return {
      aiResponse: capReply(`You play ${game}? That's a W! What did you build or win today? 🎮`),
      translation: `אתה משחק ${game}? איזה כיף! מה בנית או ניצחת היום?`,
      grammarAnalysis: emptyGrammar(spoken),
      suggestedAnswers: ["I built a house.", "I won a game.", "I play with friends."],
      newMemories: [{ fact: `Likes playing ${game}`, kind: "preference", eventOn: null }],
    };
  }

  const detail = quoted || "that";
  return {
    aiResponse: capReply(`I heard you — ${detail}? Want a would-you-rather about it, or a wild hypothetical?`),
    translation: `שמעתי אותך — ${detail}? רוצה would-you-rather על זה, או תרחיש משוגע?`,
    grammarAnalysis: emptyGrammar(spoken),
    suggestedAnswers: ["Would you rather!", "A wild hypothetical!", "I love it!"],
    newMemories: extractFactsFromUtterance(spoken),
  };
}

function mockPlacementReply(
  userMessage: string,
  history: ChatTurn[],
  profile?: ProfileInput | null,
): ChatApiResponse {
  const greeting = isSimpleGreeting(userMessage);
  const turns = Math.max(0, placementAnswerTurns(history) - (greeting ? 1 : 0));
  if (greeting || turns <= 0) {
    return naturalGreetingReply(profile, true);
  }

  const name = guessSpokenName(userMessage) || String(profile?.nickname ?? "").trim();
  const next = placementFollowUp(turns, name, profile?.gender);
  const thing = parseFavoriteThing(userMessage) || "that";
  const text =
    turns >= 3
      ? `Awesome! ${thing} is so cool! What do you like about it?`
      : next.text;

  return {
    aiResponse: text,
    translation:
      turns >= 3
        ? `איזה כיף! ${thing} זה מגניב! מה אתה אוהב בזה?`
        : next.translation,
    grammarAnalysis: emptyGrammar(userMessage.trim()),
    suggestedAnswers: turns >= 3 ? ["It is fun!", "I play it a lot.", "I love it!"] : next.suggestions,
    newMemories:
      turns === 1 && name
        ? [{ fact: `Name is ${name}`, kind: "personal" as const, eventOn: null }]
        : turns === 2
          ? [{ fact: `Age is ${userMessage.trim()}`, kind: "personal" as const, eventOn: null }]
          : turns >= 3
            ? [{ fact: `Likes ${userMessage.trim()}`, kind: "preference" as const, eventOn: null }]
            : [],
  };
}

function mockDailyGreeting(profile?: ProfileInput | null, memories: UserMemory[] = [], hour = new Date().getHours()): ChatApiResponse {
  const name = String(profile?.nickname || profile?.name || "").trim();
  const greeting = timeOfDayGreeting(name || undefined, hour);
  const latest = memories[0];
  const fact = latest?.fact ?? "";
  const shortFact = fact.replace(/^Child's name is /i, "").slice(0, 40);
  const remember = latest ? ` I still remember ${shortFact.toLowerCase()}.` : "";
  return {
    aiResponse: `${greeting.en.slice(0, greeting.en.indexOf("!") + 1)}${remember} ${greeting.en.slice(greeting.en.indexOf("!") + 1).trim()}`.replace(/\s+/g, " ").trim(),
    translation: greeting.he,
    grammarAnalysis: {
      hasError: false,
      explanation: "ברוכים השבים! אין כאן שגיאה.",
      correctedText: "",
    },
    suggestedAnswers: greeting.suggestions,
  };
}

function mockReply(
  userMessage: string,
  action: ChatAction,
  history: ChatTurn[],
  profile?: ProfileInput | null,
  placement?: boolean,
  memories: UserMemory[] = [],
  placementCompleted = false,
  hour = new Date().getHours(),
): ChatApiResponse {
  if (action === "daily_open") {
    return mockDailyGreeting(profile, memories, hour);
  }

  const greeting = maybeGreetingReply(userMessage, action, history, profile, placement, placementCompleted, hour);
  if (greeting) return greeting;

  if (!placementCompleted && (placement || isPlacementActive(history, placementCompleted))) {
    return mockPlacementReply(userMessage, history, profile);
  }

  if (action === "change_topic") {
    return pickTopic(history.length, profile);
  }

  if (detectUserLanguage(userMessage) === "he") {
    const lesson = HEBREW_LESSONS.find((item) => item.test.test(userMessage));
    if (lesson && !shouldOfferSayHint(userMessage)) {
      return hebrewLessonReply(userMessage, false);
    }
    return contextualReply(userMessage, profile);
  }

  return contextualReply(userMessage, profile);
}

function polishPlainReply(rawText: string, profile?: ProfileInput | null, userMessage = ""): ChatApiResponse {
  const allowScaffold = shouldOfferSayHint(userMessage);
  let aiResponse = collapseRepeatedSpeech(englishSpeechLine(rawText));
  if (!allowScaffold) aiResponse = stripUnsolicitedScaffold(aiResponse);
  aiResponse = collapseRepeatedSpeech(aiResponse);
  if (isBannedGenericReply(aiResponse)) {
    console.error("[Gemini API Call Error]:", "Banned generic template from model", aiResponse);
  }

  return {
    aiResponse,
    translation: "",
    grammarAnalysis: { hasError: false, explanation: "", correctedText: "" },
    suggestedAnswers: [],
    newMemories: normalizeNewMemories(extractFactsFromUtterance(userMessage)),
  };
}

function progressFromPlaintext(
  accumulated: string,
  spoken: number,
  lastCaption: string,
  spokenText: string,
  allowScaffold: boolean,
) {
  const events: ChatStreamEvent[] = [];
  let raw = collapseRepeatedSpeech(englishSpeechLine(accumulated));
  if (!allowScaffold) raw = collapseRepeatedSpeech(stripUnsolicitedScaffold(raw));
  let nextCaption = lastCaption;
  let nextSpokenText = spokenText;

  // Speak only on complete clauses ending in . ! ? — never mid-phrase fragments.
  const pulled = pullSpeakableChunks(raw, spoken);
  for (const chunk of pulled.chunks) {
    const clean = collapseRepeatedSpeech(englishSpeechLine(chunk));
    if (!clean || isRedundantSpeechChunk(clean, nextSpokenText)) continue;
    nextSpokenText = nextSpokenText ? `${nextSpokenText} ${clean}` : clean;
    events.push({ type: "sentence", text: clean });
  }

  const caption = raw.trim();
  if (caption && caption !== lastCaption) {
    events.push({ type: "caption", text: caption });
    nextCaption = caption;
  }

  return { spoken: pulled.consumed, lastCaption: nextCaption, spokenText: nextSpokenText, events };
}

function logGeminiError(label: string, error: unknown) {
  console.error("[Gemini API Call Error]:", label, error);
  if (error instanceof Error) {
    console.error("[Gemini API Call Error]:", error.message);
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause) console.error("[Gemini API Call Error]:", cause);
  }
}

function normalizeHistory(messages: ChatRequestBody["messages"]): ChatTurn[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((message) => {
      const role = String(message.role ?? message.sender ?? "").toLowerCase();
      const sender: ChatTurn["sender"] =
        role === "assistant" || role === "model" || role === "ai" ? "ai" : "user";
      const text = String(message.content ?? message.text ?? "").trim();
      return { sender, text };
    })
    .filter((message) => message.text.length > 0);
}

function eventsForCompleteReply(reply: ChatApiResponse): ChatStreamEvent[] {
  const events: ChatStreamEvent[] = [{ type: "caption", text: reply.aiResponse, translation: reply.translation }];
  for (const chunk of speakableSentences(reply.aiResponse)) {
    events.push({ type: "sentence", text: chunk });
  }
  events.push({ type: "done", payload: reply });
  return events;
}

function formatSessionHistory(history: ChatTurn[]) {
  if (history.length === 0) return "";
  const lines = history
    .map((message) => `${message.sender === "user" ? "Child" : "You"}: ${message.text}`)
    .join("\n");
  return `FULL SESSION TRANSCRIPT (never forget these lines; never restart the intro quiz):\n${lines}`;
}

function buildGeminiContents(history: ChatTurn[], latestText: string, action: ChatAction) {
  const turns: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = history
    .slice(-12)
    .map((message) => ({
      role: (message.sender === "ai" ? "model" : "user") as "user" | "model",
      parts: [{ text: message.text }],
    }))
    .filter((turn) => turn.parts[0]?.text.trim());

  if (
    action === "chat" &&
    latestText &&
    turns[turns.length - 1]?.role === "user" &&
    turns[turns.length - 1]?.parts[0]?.text.trim() === latestText.trim()
  ) {
    turns.pop();
  }

  if (turns[0]?.role === "model") {
    turns.unshift({
      role: "user",
      parts: [{ text: "Hi! Let's talk." }],
    });
  }

  const anchored =
    action === "chat" && latestText
      ? `The child just said: "${latestText}"
This is their answer to your last question (Hebrew or simple English). You MUST react to these exact words and move the conversation forward. Never repeat a generic question.`
      : latestText;

  if (!(turns[turns.length - 1]?.role === "user" && turns[turns.length - 1]?.parts[0]?.text === anchored)) {
    turns.push({ role: "user", parts: [{ text: anchored }] });
  }

  if (turns.length === 0) {
    turns.push({ role: "user", parts: [{ text: latestText }] });
  }

  return turns;
}

type GeminiPart = { text?: string };
type GeminiContent = { role?: string; parts?: GeminiPart[] };
type GeminiResponse = {
  candidates?: Array<{ content?: GeminiContent }>;
  error?: { message?: string };
};

function textFromGeminiResponse(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const data = payload as GeminiResponse;
  if (data.error?.message) throw new Error(data.error.message);
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => part.text ?? "").join("");
}

async function readSseGeminiText(response: Response, onDelta: (accumulated: string) => void) {
  if (!response.body) throw new Error("Gemini stream missing body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";

  const consumeFrame = (frame: string) => {
    for (const line of frame.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const raw = trimmed.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        accumulated += textFromGeminiResponse(JSON.parse(raw) as unknown);
        onDelta(accumulated);
      } catch (error) {
        if (error instanceof SyntaxError) continue;
        throw error;
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      if (frame.trim()) consumeFrame(frame);
    }
  }
  if (buffer.trim()) {
    try {
      consumeFrame(buffer);
    } catch {
      /* ignore a truncated trailing SSE frame */
    }
  }
  return accumulated;
}

async function geminiGenerate(
  apiKey: string,
  model: string,
  body: unknown,
  stream: boolean,
  onDelta: (text: string) => void,
) {
  const method = stream ? "streamGenerateContent?alt=sse" : "generateContent";
  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:${method}`;
  const controller = new AbortController();
  // Abort only if headers never arrive — clear as soon as the response starts so
  // a long stream is never cut mid-sentence (was causing "What kind of…" truncations).
  const timer = setTimeout(() => controller.abort(), GEMINI_CONNECT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: geminiAuthHeaders(apiKey),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Gemini ${model} ${response.status}: ${details.slice(0, 600)}`);
    }
    if (stream) {
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("text/event-stream") || contentType.includes("text/plain")) {
        return readSseGeminiText(response, onDelta);
      }
      const json = (await response.json()) as unknown;
      const chunks = Array.isArray(json) ? json : [json];
      let accumulated = "";
      for (const chunk of chunks) {
        accumulated += textFromGeminiResponse(chunk);
        if (accumulated) onDelta(accumulated);
      }
      return accumulated;
    }
    const text = textFromGeminiResponse(await response.json());
    if (text) onDelta(text);
    return text;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Gemini ${model} connect timed out after ${GEMINI_CONNECT_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function streamGemini(
  history: ChatTurn[],
  userMessage: string,
  action: ChatAction,
  profile: ProfileInput | null | undefined,
  characterId: string | null | undefined,
  extras: {
    memories?: UserMemory[];
    childMemory?: ChildMemoryProfile | null;
    isFirstSessionToday?: boolean;
    placement?: boolean;
    placementCompleted?: boolean;
    clientSendAt?: number | null;
    t0ServerStart?: number;
    localHour?: number;
  } | undefined,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<ChatApiResponse> {
  trustSystemCertificates();

  const t0ServerStart = extras?.t0ServerStart ?? Date.now();
  console.log(`[latency] T0_SERVER_START ${t0ServerStart}`);

  const apiKey = geminiApiKey();
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const detected = userMessage ? detectUserLanguage(userMessage) : "en";
  const placementCompleted = Boolean(extras?.placementCompleted || profile?.placement_completed);
  const placement = !placementCompleted && Boolean(extras?.placement || isPlacementActive(history, placementCompleted));
  const userTurns = placementAnswerTurns(history);
  const allowScaffold = shouldOfferSayHint(userMessage);
  const simpleHi = isSimpleGreeting(userMessage);

  const localHour =
    typeof extras?.localHour === "number" && extras.localHour >= 0 && extras.localHour <= 23
      ? extras.localHour
      : new Date().getHours();
  const timeHint = timeOfDaySystemHint(localHour);
  const part = dayPartFromHour(localHour);

  const languageHint =
    action === "daily_open" || extras?.isFirstSessionToday
      ? `${timeHint} FIRST MESSAGE TODAY. Memories exist. Greet with the matching time-of-day opener (morning / afternoon / evening). Follow up on their latest plan, pet, or day — not a random evening line in the morning. One punchy sentence + one fun question under 25 words. Do NOT ask their name again. Do NOT restart placement. Do NOT default to sports.`
      : simpleHi && !placement
        ? `${timeHint} SIMPLE GREETING only (hi/hello/hey). Use the ${part} greeting. Ask only how they are / how the day is going for this time of day. Do NOT ask about games, movies, sports, or a specific hobby yet. One short sentence + one easy check-in question, under 20 words.`
        : placement
        ? `PLACEMENT MODE is ON. Real answers so far: ${userTurns} of 3 (name, grade/age, favorite thing to learn or play). Ask only the next missing step. One short question. If they only said hi/hello/שלום/היי, that is NOT their name — greet warmly and ask their name again.`
        : action === "change_topic"
          ? "CHANGE TOPIC: Drop the previous subject completely. Warmly ask what they feel like talking about right now (e.g. \"Sure thing! What do you feel like talking about right now?\"). Do NOT pick a topic for them. Do NOT use their name. Do NOT ask name/age/favorite color."
          : allowScaffold
            ? 'The child asked how to say something, or is stuck. You may give one "You can say: …" hint, then one simple question. English only.'
            : `PLACEMENT IS COMPLETE. Never ask name, age, or "what is your favorite color?". The child just said: "${userMessage}".
TOPIC RULE: If they hint at a new topic, abandon the old one instantly and dive in.
FORMAT: Rotate styles (Would You Rather / hypothetical / playful challenge). Never two generic "Do you like X?" in a row.
RECAST: If their English/Hebrew is imperfect, warmly model the correct phrase first. If a fact is inaccurate, correct it kindly with real-world knowledge. Never scold. Under 30 words.
Use memories when relevant. One punchy sentence + one open question. Under 25 words.${
                detected === "he"
                  ? " The child used Hebrew. Reply warmly in simple English only. Do NOT say You can say / בואי ננסה."
                  : " The child used English. One-word answers are great."
              }`;

  const learnerContext = buildLearnerContext(profile, {
    memories: extras?.memories,
    isFirstSessionToday: Boolean(extras?.isFirstSessionToday || action === "daily_open"),
  });
  const character = getCharacter(characterId ?? profile?.selected_character);
  const system = buildSystemPromptSections([
    BASE_TUTOR_RULES,
    VOICE_LATENCY_RULE,
    character.systemPrompt,
    learnerContext,
    formatStructuredUserProfile(profile),
    buildChildMemoryPrompt(extras?.childMemory ?? null),
    formatSessionHistory(history),
    namingHint(history, profile),
    languageHint,
    "When asked about past facts, age, grade, or preferences, consult ### USER PROFILE & MEMORIES and KNOWN FACTS ABOUT THIS CHILD. If they ask what you know about them, list the specific sports, foods, travel, and people stored there — never only generic onboarding interests.",
    "Keep the FULL conversation history. Never drop earlier turns or memories.",
    `Never break character. You are ${character.name} (${character.title}).`,
    profile?.custom_tutor_name && profile.custom_tutor_name !== character.name
      ? `The learner calls you "${profile.custom_tutor_name}". Introduce and refer to yourself as ${profile.custom_tutor_name} while keeping this persona.`
      : "",
  ]);

  const latestText =
    action === "daily_open"
      ? "The child just opened the app. Give an instant warm greeting that references their latest memory or asks about their day."
      : action === "change_topic"
        ? "The child tapped Change Topic. Immediately and warmly ask what they feel like talking about right now. Do not invent a topic for them."
        : userMessage;

  const contents = buildGeminiContents(history, latestText, action);
  const t1PromptReady = Date.now();
  console.log(`[latency] T1_PROMPT_READY +${t1PromptReady - t0ServerStart}ms`);

  const requestBody = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 600,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const model = FAST_MODELS[0];
  let spoken = 0;
  let lastCaption = "";
  let spokenText = "";
  let t2GeminiCall = 0;
  let t3FirstToken: number | null = null;
  let usedFallback = false;
  let streamComplete: PipelineServerMetrics["streamComplete"] = "NO";
  let streamReason = "not started";

  const pushProgress = (accumulated: string) => {
    if (t3FirstToken == null && accumulated.trim()) {
      t3FirstToken = Date.now();
      console.log(`[latency] T3_FIRST_TOKEN +${t3FirstToken - t2GeminiCall}ms (TTFT) model=${model}`);
    }
    const progress = progressFromPlaintext(accumulated, spoken, lastCaption, spokenText, allowScaffold);
    spoken = progress.spoken;
    lastCaption = progress.lastCaption;
    spokenText = progress.spokenText;
    for (const event of progress.events) onEvent(event);
  };

  const buildLatency = (generatedText: string, complete: PipelineServerMetrics["streamComplete"], reason: string): PipelineServerMetrics => ({
    t0ServerStart,
    t1PromptReady,
    t2GeminiCall: t2GeminiCall || Date.now(),
    t3FirstToken,
    t4StreamComplete: Date.now(),
    model,
    userMessage,
    generatedText,
    textLength: generatedText.length,
    streamComplete: complete,
    streamReason: reason,
    usedFallback,
    clientSendAt: extras?.clientSendAt ?? null,
  });

  const finish = (accumulated: string, complete: PipelineServerMetrics["streamComplete"], reason: string) => {
    const payload = polishPlainReply(accumulated, profile, userMessage);
    for (const chunk of speakableSentences(payload.aiResponse)) {
      if (isRedundantSpeechChunk(chunk, spokenText)) continue;
      spokenText = spokenText ? `${spokenText} ${chunk}` : chunk;
      onEvent({ type: "sentence", text: chunk });
    }
    onEvent({ type: "caption", text: payload.aiResponse });
    const latency = buildLatency(payload.aiResponse, complete, reason);
    payload.latency = latency;
    onEvent({ type: "metrics", metrics: latency });
    onEvent({ type: "done", payload });
    console.log(`[latency] T4_STREAM_COMPLETE +${latency.t4StreamComplete - (t2GeminiCall || t0ServerStart)}ms len=${latency.textLength}`);
    logPipelineLatencyReport("server", latency, null);
    return payload;
  };

  try {
    t2GeminiCall = Date.now();
    console.log(`[latency] T2_GEMINI_CALL model=${model}`);
    const accumulated = await geminiGenerate(apiKey, model, requestBody, true, pushProgress);
    if (!accumulated.trim()) throw new Error(`Empty Gemini stream from ${model}`);
    streamComplete = "YES";
    streamReason = "gemini stream completed";
    return finish(accumulated, streamComplete, streamReason);
  } catch (streamError) {
    usedFallback = true;
    const errMsg = streamError instanceof Error ? streamError.message : String(streamError);
    logGeminiError(`Gemini stream ${model} failed — using fast fallback`, streamError);
    console.log(`[latency] FALLBACK triggered: ${errMsg}`);
    if (spokenText.trim() || lastCaption.trim()) {
      streamComplete = "NO";
      streamReason = `partial stream then error: ${errMsg}`;
      return finish(lastCaption || spokenText, streamComplete, streamReason);
    }
    const fallback = mockReply(
      userMessage,
      action,
      history,
      profile,
      placement,
      extras?.memories ?? [],
      placementCompleted,
      localHour,
    );
    streamComplete = "NO";
    streamReason = `fallback reply: ${errMsg}`;
    const latency = buildLatency(fallback.aiResponse, streamComplete, streamReason);
    fallback.latency = latency;
    for (const event of eventsForCompleteReply(fallback)) onEvent(event);
    onEvent({ type: "metrics", metrics: latency });
    logPipelineLatencyReport("server", latency, null);
    return fallback;
  }
}

function sseResponse(write: (send: (event: ChatStreamEvent) => void) => Promise<void>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ChatStreamEvent) => {
        controller.enqueue(encoder.encode(encodeSse(event)));
      };
      try {
        await write(send);
      } catch (error) {
        logGeminiError("Chat SSE failed", error);
        controller.error(error);
        return;
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

async function loadStoredLearner(bodyProfile: ProfileInput | null, bodyMemories: UserMemory[]) {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return { profile: bodyProfile, memories: bodyMemories };
    // user_memories queries are disabled — never block the chat route on them.
    const storedProfile = await fetchProfile(supabase, data.user.id);
    const profile = storedProfile
      ? { ...profilePayload(storedProfile), ...bodyProfile }
      : bodyProfile;
    return { profile, memories: bodyMemories };
  } catch (error) {
    console.error("[Gemini API Call Error]:", "memory load failed", error);
    return { profile: bodyProfile, memories: bodyMemories };
  }
}

export async function POST(request: Request) {
  const t0ServerStart = Date.now();
  try {
    const body = (await request.json()) as ChatRequestBody;
    const action: ChatAction =
      body.action === "change_topic" ? "change_topic" : body.action === "daily_open" ? "daily_open" : "chat";
    const userMessage = (body.userMessage ?? "").trim();
    const history = normalizeHistory(body.messages);
    const bodyProfile = body.profile ?? null;
    const bodyMemories = Array.isArray(body.memories) ? body.memories : [];
    const clientSendAt = typeof body.clientSendAt === "number" ? body.clientSendAt : null;
    const localHour =
      typeof body.localHour === "number" && body.localHour >= 0 && body.localHour <= 23
        ? Math.floor(body.localHour)
        : new Date().getHours();

    // Never block the SSE stream on Supabase when the client already sent a profile.
    let profile = bodyProfile;
    let memories = bodyMemories;
    if (!profile) {
      const stored = await loadStoredLearner(bodyProfile, bodyMemories);
      profile = stored.profile;
      memories = stored.memories;
    }
    const characterId = body.characterId ?? profile?.selected_character ?? null;
    const isFirstSessionToday = Boolean(body.isFirstSessionToday);
    const placementCompleted = Boolean(body.placementCompleted || profile?.placement_completed);
    const placement =
      !placementCompleted &&
      action !== "daily_open" &&
      (Boolean(body.placement) || isPlacementActive(history, placementCompleted));

    if (action === "chat" && !userMessage) {
      return NextResponse.json({ error: "userMessage is required" }, { status: 400 });
    }

    const extras = {
      memories,
      childMemory: parseChildMemory(body.childMemory),
      isFirstSessionToday,
      placement,
      placementCompleted,
      clientSendAt,
      t0ServerStart,
      localHour,
    };
    const apiKey = geminiApiKey();
    if (!apiKey) {
      console.error("[Gemini API Call Error]:", "Missing GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY");
      return NextResponse.json({ error: "Missing GEMINI_API_KEY" }, { status: 500 });
    }

    return sseResponse(async (send) => {
      await streamGemini(history, userMessage, action, profile, characterId, extras, send);
    });
  } catch (error) {
    logGeminiError("Chat POST failed", error);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
