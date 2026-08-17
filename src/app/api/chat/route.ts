import { GoogleGenAI, Type } from "@google/genai";
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
import { buildLearnerContext } from "@/lib/learner";
import { normalizeNewMemories, type UserMemory } from "@/lib/memory";
import { polishHebrewTranslation } from "@/lib/hebrew";
import { guessSpokenName, isPlacementActive, placementFollowUp, placementUserTurns } from "@/lib/placement";
import {
  encodeSse,
  extractJsonStringField,
  pullSpeakableChunks,
  speakableSentences,
  type ChatStreamEvent,
} from "@/lib/chat-stream";
import { trustSystemCertificates } from "@/lib/tls";
import type { ProfileInput } from "@/lib/supabase/types";
import type { ChatApiResponse, GrammarFeedback, Message } from "@/types/chat";

export const dynamic = "force-dynamic";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

const FAST_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

type ChatAction = "chat" | "change_topic" | "daily_open";
type ChatTurn = Pick<Message, "sender" | "text">;

interface ChatRequestBody {
  messages?: Array<ChatTurn & { role?: string; content?: string }>;
  userMessage?: string;
  action?: ChatAction;
  profile?: ProfileInput | null;
  characterId?: string | null;
  memories?: UserMemory[];
  isFirstSessionToday?: boolean;
  placement?: boolean;
}

const BASE_TUTOR_RULES = `You are the child's caring, enthusiastic BEST FRIEND and companion for ages 6–13 (Hebrew at home, learning English).
Stay in CHARACTER, but these BEST-FRIEND rules always win.
Peer-like Disney/Pixar vibe. Never a strict teacher. Never a quiz machine.

LANGUAGE RULES (every reply):
- aiResponse is English only: 1 short friendly sentence + 1 simple question. Never more.
- translation is a clean, natural Hebrew version of that same reply, on its own. Never mix Hebrew into aiResponse.
- A1 / beginner words. Short. Clear. Energetic. Do not repeat the same phrase twice.
- Celebrate what they said, then ask the next easy question.
  Example: "Awesome! I love pizza too! 🍕 What pizza do you like?"
- React to THEIR words. If they say cats, talk about cats.

GREETINGS (hi, hey, hello, שלום, היי, הי):
- This is just a hello. NOT a grammar mistake. NOT a chance to teach a phrase.
- NEVER say "You can say", "In English you can say", or "בואי ננסה".
- If you do not know their name yet, reply exactly in this spirit:
  English: "Hey there! Great to see you! What is your name? 👋"
  Hebrew translation: "היי! איזה כיף לראות אותך! איך קוראים לך?"
- If you already know their name, greet them by name and ask how they are. Do not ask their name again.

"You can say: [phrase]" IS FORBIDDEN except when the child explicitly asks "how do I say…" / "איך אומרים" or is clearly stuck forming a sentence. Never inject it into greetings or normal chat.

MEMORY RULES:
- You remember every detail they have ever told you (pets, hobbies, favorite games, family, school plans, friends, mood).
- Use the COMPLETE KID PROFILE and BEST-FRIEND MEMORY BANK in the prompt. These are real facts.
- Proactively bring up past memories and follow up on plans.
- Do not invent facts. Do not ask their name if the profile already has it.

PLACEMENT ASSESSMENT (only if the session is still in the 3-step intro):
Ask ONE super-simple question per turn. Never skip ahead. A bare hi/שלום is NOT their name — greet warmly and ask their name again.
- Step 1: greet and ask their name.
- Step 2: after a real name, ask their age.
- Step 3: after an age, ask their favorite thing (a game, an animal, or a food).
Then continue as their best friend. Save what you learned.

IF THE CHILD SPEAKS HEBREW:
- Not an error. Reply warmly in simple English. Put the Hebrew meaning only in translation.
- grammarAnalysis.hasError MUST be false.

FIRST MESSAGE OF A NEW DAY:
If memories exist, greet them instantly. Reference their latest memory or ask about their day. Do not wait for them to start.

Return STRICT compact JSON only:
{"aiResponse":"1 short English sentence + 1 simple question","translation":"Natural Hebrew of that reply"}
No other fields. Keep aiResponse under 20 words so speech can start immediately.

HEBREW TRANSLATION RULES (strict):
- Speak like people in Israel. No word-for-word translation.
- NEVER slash forms: אוהב/ת, את/ה, שמח/ה, יכול/ה. Choose ONE form.
- Boy/male: אתה, אתה אוהב, אתה יכול, שלך.
- Girl/female: את, את אוהבת, את יכולה, שלך.
- Other: avoid gendered verbs (יש לך, אפשר, בואו נדבר).
- Topic nouns in Hebrew: Movies=סרטים, Cars=מכוניות, Travel=טיולים, Sports=ספורט, Tech=טכנולוגיה, Music=מוזיקה, Food=אוכל, Games=משחקים.
- Keep English names intact. Do not add teaching scaffolds in translation.`;

const TOPIC_STARTERS: ChatApiResponse[] = [
  {
    aiResponse: "Let's switch it up! Do you enjoy cooking at home, or do you prefer eating out?",
    translation: "בואו נחליף נושא! אתה אוהב לבשל בבית, או שאתה מעדיף לאכול בחוץ?",
    grammarAnalysis: {
      hasError: false,
      explanation: "אין כאן שגיאת דקדוק — פשוט מחליפים נושא.",
      correctedText: "",
    },
    suggestedAnswers: ["I love cooking at home.", "I usually eat out.", "It depends on the day."],
  },
  {
    aiResponse: "New topic! If you could travel anywhere next month, where would you go?",
    translation: "נושא חדש! אם היית יכול לנסוע לאן שתרצה בחודש הבא, לאן היית הולך?",
    grammarAnalysis: {
      hasError: false,
      explanation: "אין כאן שגיאת דקדוק — פשוט מחליפים נושא.",
      correctedText: "",
    },
    suggestedAnswers: ["I would go to Italy.", "I'd stay close to home.", "I want to visit Japan."],
  },
  {
    aiResponse: "Let's talk about weekends. What does a perfect Saturday look like for you?",
    translation: "בואו נדבר על סופי שבוע. איך נראה שבת מושלם עבורך?",
    grammarAnalysis: {
      hasError: false,
      explanation: "אין כאן שגיאת דקדוק — פשוט מחליפים נושא.",
      correctedText: "",
    },
    suggestedAnswers: ["I sleep in and watch movies.", "I meet friends outdoors.", "I like a quiet morning."],
  },
  {
    aiResponse: "How about movies and shows? Have you watched anything interesting recently?",
    translation: "מה לגבי סרטים וסדרות? ראית משהו מעניין לאחרונה?",
    grammarAnalysis: {
      hasError: false,
      explanation: "אין כאן שגיאת דקדוק — פשוט מחליפים נושא.",
      correctedText: "",
    },
    suggestedAnswers: ["Yes, I watched a comedy.", "I prefer documentaries.", "I haven't had time lately."],
  },
];

const INTEREST_TOPICS: Record<string, ChatApiResponse> = {
  Movies: {
    aiResponse: "Let's talk movies! What's the last film or series you really enjoyed?",
    translation: "בואו נדבר על סרטים! מה הסרט או הסדרה האחרונים שממש נהנית מהם?",
    grammarAnalysis: { hasError: false, explanation: "אין כאן שגיאת דקדוק — פשוט מחליפים נושא.", correctedText: "" },
    suggestedAnswers: ["I watched a superhero movie.", "I love comedies.", "I prefer TV series."],
  },
  Cars: {
    aiResponse: "You like cars — nice! If you could drive any car tomorrow, which one would you pick?",
    translation: "אתה אוהב מכוניות — מגניב! אם היית יכול לנהוג בכל רכב מחר, מה היית בוחר?",
    grammarAnalysis: { hasError: false, explanation: "אין כאן שגיאת דקדוק — פשוט מחליפים נושא.", correctedText: "" },
    suggestedAnswers: ["A fast sports car.", "Something electric.", "A classic old car."],
  },
  Travel: {
    aiResponse: "Travel time! If you could visit any country this year, where would you go?",
    translation: "זמן טיולים! אם היית יכול לבקר בכל מדינה השנה, לאן היית נוסע?",
    grammarAnalysis: { hasError: false, explanation: "אין כאן שגיאת דקדוק — פשוט מחליפים נושא.", correctedText: "" },
    suggestedAnswers: ["I would go to Japan.", "I'd visit Italy.", "I want a beach holiday."],
  },
  Sports: {
    aiResponse: "Let's talk sports. Do you like playing, watching, or both?",
    translation: "בואו נדבר על ספורט. אתה אוהב לשחק, לצפות, או גם וגם?",
    grammarAnalysis: { hasError: false, explanation: "אין כאן שגיאת דקדוק — פשוט מחליפים נושא.", correctedText: "" },
    suggestedAnswers: ["I love playing soccer.", "I mostly watch games.", "I like going to the gym."],
  },
  Tech: {
    aiResponse: "Tech is a great topic. What app or gadget do you use the most every day?",
    translation: "טכנולוגיה זה נושא מעולה. באיזו אפליקציה או גאדג'ט אתה הכי משתמש כל יום?",
    grammarAnalysis: { hasError: false, explanation: "אין כאן שגיאת דקדוק — פשוט מחליפים נושא.", correctedText: "" },
    suggestedAnswers: ["My phone, all day.", "I like gaming PCs.", "I use AI tools a lot."],
  },
  Music: {
    aiResponse: "Music time! What kind of music do you listen to when you want to feel good?",
    translation: "זמן מוזיקה! לאיזה סוג מוזיקה אתה שומע כשאתה רוצה להרגיש טוב?",
    grammarAnalysis: { hasError: false, explanation: "אין כאן שגיאת דקדוק — פשוט מחליפים נושא.", correctedText: "" },
    suggestedAnswers: ["I love pop music.", "Mostly hip-hop.", "I like calm songs."],
  },
  Food: {
    aiResponse: "Let's talk food. What's your favorite meal at the moment?",
    translation: "בואו נדבר על אוכל. מה הארוחה האהובה עליך עכשיו?",
    grammarAnalysis: { hasError: false, explanation: "אין כאן שגיאת דקדוק — פשוט מחליפים נושא.", correctedText: "" },
    suggestedAnswers: ["I love pizza.", "Anything homemade.", "Sushi is my favorite."],
  },
  Games: {
    aiResponse: "Gaming! Are you more into phone games, console, or PC?",
    translation: "גיימינג! אתה יותר במשחקי טלפון, קונסולה או מחשב?",
    grammarAnalysis: { hasError: false, explanation: "אין כאן שגיאת דקדוק — פשוט מחליפים נושא.", correctedText: "" },
    suggestedAnswers: ["Mostly phone games.", "I play on a console.", "PC gaming all the way."],
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
    if (match) return personalizeReply(match, profile);
  }
  return personalizeReply(TOPIC_STARTERS[turn % TOPIC_STARTERS.length], profile);
}

function personalizeReply(reply: ChatApiResponse, profile?: ProfileInput | null): ChatApiResponse {
  if (!profile?.nickname) return reply;
  if (reply.aiResponse.includes(profile.nickname)) return reply;
  const rest = reply.aiResponse.charAt(0).toLowerCase() + reply.aiResponse.slice(1);
  return { ...reply, aiResponse: `${profile.nickname}, ${rest}` };
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
    followUp: "What do you like?",
    translation: "נחמד! מה אתה אוהב?",
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
    followUp: "What is your favorite thing?",
    translation: "גם לי נעים להכיר! מה הדבר האהוב עליך?",
    suggestions: ["I like pizza.", "I like dogs.", "I like soccer."],
  },
];

function emptyGrammar(correctedText = ""): GrammarFeedback {
  return { hasError: false, explanation: "", correctedText };
}

function naturalGreetingReply(profile?: ProfileInput | null, askName = false): ChatApiResponse {
  const name = String(profile?.nickname ?? "").trim();
  if (!askName && name) {
    return {
      aiResponse: `Hey ${name}! Great to see you! How are you today? 👋`,
      translation: `היי ${name}! איזה כיף לראות אותך! מה שלומך היום?`,
      grammarAnalysis: emptyGrammar(),
      suggestedAnswers: ["I'm great!", "I am happy.", "A little tired."],
    };
  }

  return {
    aiResponse: "Hey there! Great to see you! What is your name? 👋",
    translation: "היי! איזה כיף לראות אותך! איך קוראים לך?",
    grammarAnalysis: emptyGrammar(),
    suggestedAnswers: ["My name is Tom.", "I'm Maya.", "I am Alex."],
  };
}

function maybeGreetingReply(
  userMessage: string,
  action: ChatAction,
  history: ChatTurn[],
  profile?: ProfileInput | null,
  placement?: boolean,
): ChatApiResponse | null {
  if (action !== "chat") return null;
  if (!isSimpleGreeting(userMessage)) return null;
  const inPlacement = Boolean(placement || isPlacementActive(history));
  return naturalGreetingReply(profile, inPlacement || !String(profile?.nickname ?? "").trim());
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

  if (allowScaffold) {
    return {
      aiResponse: "You can say: I like that! What do you like?",
      translation: "אפשר להגיד: I like that! מה אתה אוהב?",
      grammarAnalysis: emptyGrammar("I like that."),
      suggestedAnswers: ["I like dogs.", "I like pizza.", "I am happy."],
    };
  }

  return {
    aiResponse: "Cool! What do you like to do?",
    translation: "מגניב! מה אתה אוהב לעשות?",
    grammarAnalysis: emptyGrammar(),
    suggestedAnswers: ["I like pizza.", "I like games.", "I like dogs."],
  };
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

function mockEnglishReply(
  userMessage: string,
  grammarAnalysis: GrammarFeedback,
  profile?: ProfileInput | null,
): ChatApiResponse {
  const lower = userMessage.toLowerCase();
  const name = profile?.nickname;

  if (/\b(beach|bich|swim|swimming|sand|sun)\b/i.test(lower)) {
    return {
      aiResponse: name
        ? `${name}, the beach sounds lovely! Do you like swimming, or just sitting in the sun?`
        : "The beach sounds lovely! Do you like swimming, or just sitting in the sun?",
      translation: name
        ? `${name}, החוף נשמע מקסים! אתה אוהב לשחות, או סתם לשבת בשמש?`
        : "החוף נשמע מקסים! אתה אוהב לשחות, או סתם לשבת בשמש?",
      grammarAnalysis,
      suggestedAnswers: ["I love swimming.", "I just want to sit in the sun.", "The water is warm today."],
    };
  }

  if (
    grammarAnalysis.hasError &&
    looksLikeGibberishEnglish(userMessage) &&
    !/^(i am|i'm)\.?$/i.test(userMessage) &&
    !/goog|tank you|bich/i.test(userMessage)
  ) {
    return {
      aiResponse:
        "Hmm, I didn't quite catch that. Could you say it another way? You can also write it in Hebrew and I'll teach you the English.",
      translation: "הממ, לא לגמרי הבנתי. תוכל להגיד את זה אחרת? אפשר גם לכתוב בעברית, ואלמד אותך את האנגלית.",
      grammarAnalysis,
      suggestedAnswers: ["Let me try again.", "I'll write it in Hebrew.", "I meant: I am fine."],
    };
  }

  if (/\b(hi|hello|hey|good morning|good evening)\b/.test(lower)) {
    return naturalGreetingReply(profile);
  }

  if (/\b(hobby|hobbies|free time|weekend)\b/.test(lower)) {
    return {
      aiResponse: "That sounds fun. How often do you get to do that in a normal week?",
      translation: "זה נשמע כיף. כמה פעמים בשבוע רגיל אתה מצליח לעשות את זה?",
      grammarAnalysis,
      suggestedAnswers: ["A few times a week.", "Only on weekends.", "Almost every evening."],
    };
  }

  if (/\b(food|cook|eat|restaurant|coffee|hungry|pizza)\b/.test(lower)) {
    return {
      aiResponse: "Yum! What kind of food do you enjoy the most?",
      translation: "מממ! איזה סוג אוכל אתה הכי אוהב?",
      grammarAnalysis,
      suggestedAnswers: ["I love Italian food.", "I'm more into healthy meals.", "Anything spicy!"],
    };
  }

  if (/\b(travel|trip|vacation|holiday|flight)\b/.test(lower)) {
    return {
      aiResponse: "Travel is such a great topic. Do you prefer cities or nature when you go away?",
      translation: "טיולים הם נושא מעולה. כשאתה נוסע, אתה מעדיף ערים או טבע?",
      grammarAnalysis,
      suggestedAnswers: ["I prefer big cities.", "Nature, for sure.", "A mix of both."],
    };
  }

  if (/\b(work|job|study|school|english)\b/.test(lower)) {
    return {
      aiResponse: "That's interesting. What do you find most challenging about it right now?",
      translation: "זה מעניין. מה הכי מאתגר עבורך בזה עכשיו?",
      grammarAnalysis,
      suggestedAnswers: ["Managing my time.", "Speaking confidently.", "Staying motivated."],
    };
  }

  if (/\b(movie|film|show|series|music)\b/.test(lower)) {
    return {
      aiResponse: "Nice pick! Would you recommend it to a friend? Why or why not?",
      translation: "בחירה נחמדה! היית ממליץ על זה לחבר? למה כן או למה לא?",
      grammarAnalysis,
      suggestedAnswers: ["Yes, it's really good.", "It's okay, not my favorite.", "Only if they like comedy."],
    };
  }

  if (grammarAnalysis.hasError) {
    return {
      aiResponse: `Good try — a more natural way is: "${grammarAnalysis.correctedText}" Can you tell me a bit more?`,
      translation: `ניסיון טוב — ניסוח טבעי יותר: "${grammarAnalysis.correctedText}" תוכל לספר לי קצת יותר?`,
      grammarAnalysis,
      suggestedAnswers: [grammarAnalysis.correctedText, "Let me try again.", "Can you ask me another question?"],
    };
  }

  return {
    aiResponse: "Awesome! Let's talk more. What is your favorite color?",
    translation: "מעולה! בואו נדבר עוד. מה הצבע האהוב עליך?",
    grammarAnalysis: {
      hasError: false,
      explanation: "תשובה קצרה זה בסדר גמור.",
      correctedText: userMessage.trim(),
    },
    suggestedAnswers: ["I like blue.", "I like red.", "My favorite is green."],
  };
}

function mockPlacementReply(
  userMessage: string,
  history: ChatTurn[],
  profile?: ProfileInput | null,
): ChatApiResponse {
  const greeting = isSimpleGreeting(userMessage);
  const turns = Math.max(0, placementUserTurns(history) - (greeting ? 1 : 0));
  if (greeting || turns <= 0) {
    return naturalGreetingReply(profile, true);
  }

  const name = guessSpokenName(userMessage) || String(profile?.nickname ?? "").trim();
  const next = placementFollowUp(turns, name, profile?.gender);
  const text = turns >= 3 ? `Awesome! I love that too! What color do you like?` : next.text;

  return {
    aiResponse: text,
    translation: next.translation,
    grammarAnalysis: emptyGrammar(userMessage.trim()),
    suggestedAnswers: next.suggestions,
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

function mockDailyGreeting(profile?: ProfileInput | null, memories: UserMemory[] = []): ChatApiResponse {
  const name = String(profile?.nickname || profile?.name || "friend").trim() || "friend";
  const latest = memories[0];
  const fact = latest?.fact ?? "your day";
  const shortFact = fact.replace(/^Child's name is /i, "").slice(0, 40);
  return {
    aiResponse: `Hey ${name}! ${latest ? `I still remember ${shortFact.toLowerCase()}.` : "I missed you!"} How are you today?`,
    translation: `היי ${name}! ${latest ? "אני זוכר אותך." : "התגעגעתי אליך!"} מה שלומך היום?`,
    grammarAnalysis: {
      hasError: false,
      explanation: "ברוכים השבים! אין כאן שגיאה.",
      correctedText: "",
    },
    suggestedAnswers: ["I'm great!", "I am happy.", "I played a game."],
  };
}

function mockReply(
  userMessage: string,
  action: ChatAction,
  history: ChatTurn[],
  profile?: ProfileInput | null,
  placement?: boolean,
  memories: UserMemory[] = [],
): ChatApiResponse {
  if (action === "daily_open") {
    return mockDailyGreeting(profile, memories);
  }

  const greeting = maybeGreetingReply(userMessage, action, history, profile, placement);
  if (greeting) return greeting;

  if (placement || isPlacementActive(history)) {
    return mockPlacementReply(userMessage, history, profile);
  }

  if (action === "change_topic") {
    return pickTopic(history.length, profile);
  }

  if (detectUserLanguage(userMessage) === "he") {
    return hebrewLessonReply(userMessage, shouldOfferSayHint(userMessage));
  }

  return mockEnglishReply(userMessage, analyzeGrammar(userMessage), profile);
}

function polishReply(reply: ChatApiResponse, profile?: ProfileInput | null, userMessage = ""): ChatApiResponse {
  const allowScaffold = shouldOfferSayHint(userMessage);
  let aiResponse = collapseRepeatedSpeech(englishSpeechLine(reply.aiResponse));
  if (!allowScaffold) aiResponse = stripUnsolicitedScaffold(aiResponse);
  aiResponse = collapseRepeatedSpeech(aiResponse);

  let translation = reply.translation;
  if (!allowScaffold) {
    translation = translation
      .replace(/באנגלית אפשר להגיד:\s*["']?[^"']*["']?\s*/g, "")
      .replace(/בואי ננסה:\s*[^.!?]*/g, "")
      .replace(/אפשר להגיד:\s*["']?[^"']*["']?\s*/g, "");
  }

  return {
    ...reply,
    aiResponse,
    translation: polishHebrewTranslation(translation, profile?.gender),
    grammarAnalysis: {
      ...reply.grammarAnalysis,
      explanation: polishHebrewTranslation(reply.grammarAnalysis.explanation, profile?.gender),
    },
  };
}

function extractJson(content: string): ChatApiResponse {
  try {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    const raw = start >= 0 && end > start ? content.slice(start, end + 1) : content;
    const parsed = JSON.parse(raw) as ChatApiResponse;
    const aiResponse = collapseRepeatedSpeech(englishSpeechLine(String(parsed.aiResponse ?? "").trim()));
    if (!aiResponse) throw new Error("Missing aiResponse");
    return {
      aiResponse,
      translation: parsed.translation ?? "",
      grammarAnalysis: {
        hasError: Boolean(parsed.grammarAnalysis?.hasError),
        explanation: parsed.grammarAnalysis?.explanation ?? "",
        correctedText: parsed.grammarAnalysis?.correctedText ?? "",
      },
      suggestedAnswers: Array.isArray(parsed.suggestedAnswers)
        ? parsed.suggestedAnswers.slice(0, 3).map(String)
        : [],
      newMemories: normalizeNewMemories(parsed.newMemories),
    };
  } catch {
    const aiResponse = collapseRepeatedSpeech(englishSpeechLine(extractJsonStringField(content, "aiResponse").trim()));
    if (!aiResponse) throw new Error("Empty Gemini response");
    return {
      aiResponse,
      translation: extractJsonStringField(content, "translation"),
      grammarAnalysis: { hasError: false, explanation: "", correctedText: "" },
      suggestedAnswers: [],
      newMemories: [],
    };
  }
}

function logGeminiError(label: string, error: unknown) {
  console.error(label, error);
  if (error instanceof Error) {
    console.error(`${label} message:`, error.message);
    console.error(`${label} stack:`, error.stack);
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause) {
      console.error(`${label} cause:`, cause);
      if (cause instanceof Error) console.error(`${label} cause stack:`, cause.stack);
    }
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

function progressFromPartial(
  accumulated: string,
  spoken: number,
  lastCaption: string,
  spokenText: string,
  allowScaffold: boolean,
) {
  const events: ChatStreamEvent[] = [];
  const raw = extractJsonStringField(accumulated, "aiResponse");
  const translation = extractJsonStringField(accumulated, "translation");
  let nextCaption = lastCaption;
  const caption = collapseRepeatedSpeech(allowScaffold ? raw : stripUnsolicitedScaffold(raw));
  if (caption && caption !== lastCaption) {
    events.push({ type: "caption", text: caption, translation });
    nextCaption = caption;
  }
  const pulled = pullSpeakableChunks(raw, spoken);
  let nextSpokenText = spokenText;
  for (const chunk of pulled.chunks) {
    let clean = collapseRepeatedSpeech(englishSpeechLine(chunk));
    if (!allowScaffold) clean = collapseRepeatedSpeech(stripUnsolicitedScaffold(clean));
    if (!clean || isRedundantSpeechChunk(clean, nextSpokenText)) continue;
    nextSpokenText = nextSpokenText ? `${nextSpokenText} ${clean}` : clean;
    events.push({ type: "sentence", text: clean });
  }
  return { spoken: pulled.consumed, lastCaption: nextCaption, spokenText: nextSpokenText, events };
}

function eventsForCompleteReply(reply: ChatApiResponse): ChatStreamEvent[] {
  const events: ChatStreamEvent[] = [{ type: "caption", text: reply.aiResponse, translation: reply.translation }];
  for (const chunk of speakableSentences(reply.aiResponse)) {
    events.push({ type: "sentence", text: chunk });
  }
  events.push({ type: "done", payload: reply });
  return events;
}

async function streamGemini(
  history: ChatTurn[],
  userMessage: string,
  action: ChatAction,
  profile: ProfileInput | null | undefined,
  characterId: string | null | undefined,
  extras: { memories?: UserMemory[]; isFirstSessionToday?: boolean; placement?: boolean } | undefined,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<ChatApiResponse> {
  trustSystemCertificates();

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const detected = userMessage ? detectUserLanguage(userMessage) : "en";
  const placement = Boolean(extras?.placement || isPlacementActive(history));
  const userTurns = placementUserTurns(history);
  const allowScaffold = shouldOfferSayHint(userMessage);
  const greeting = maybeGreetingReply(userMessage, action, history, profile, placement);
  if (greeting) {
    const payload = polishReply(greeting, profile, userMessage);
    for (const event of eventsForCompleteReply(payload)) onEvent(event);
    return payload;
  }

  const languageHint =
    action === "daily_open" || extras?.isFirstSessionToday
      ? "FIRST MESSAGE TODAY. Memories exist. Greet them by name like a best friend. Follow up on their latest plan, pet, game, or day. 1-2 short sentences, then a fun question. Do NOT ask their name again. Do NOT restart placement."
      : placement
        ? `PLACEMENT MODE is ON. Child turns so far: ${userTurns}. Ask only the next missing step (name, then age, then favorite thing). One short question. If they only said hi/hello/שלום/היי, that is NOT their name — greet warmly and ask their name again.`
        : action === "change_topic"
          ? "The child asked for a new topic. Pick animals, colors, food, games, or sports. Keep it A1."
          : allowScaffold
            ? 'The child asked how to say something, or is stuck. You may give one "You can say: …" hint, then one simple question. English in aiResponse, Hebrew only in translation.'
            : detected === "he"
              ? "The child used Hebrew. Reply warmly in simple English. Hebrew meaning only in translation. Do NOT say You can say / בואי ננסה."
              : "The child used English. Stay on their topic. One-word answers are great. If a memory fits, mention it.";

  const learnerContext = buildLearnerContext(profile, {
    memories: extras?.memories,
    isFirstSessionToday: Boolean(extras?.isFirstSessionToday || action === "daily_open"),
  });
  const character = getCharacter(characterId ?? profile?.selected_character);
  const system = [
    BASE_TUTOR_RULES,
    character.systemPrompt,
    learnerContext,
    languageHint,
    'The "translation" field must be natural spoken Hebrew, fully gendered for this learner, with topic nouns in Hebrew. No slash forms like אוהב/ת.',
    "Keep the FULL conversation history. Never drop earlier turns or memories.",
    `Never break character. You are ${character.name} (${character.title}).`,
    profile?.custom_tutor_name && profile.custom_tutor_name !== character.name
      ? `The learner calls you "${profile.custom_tutor_name}". Introduce and refer to yourself as ${profile.custom_tutor_name} while keeping this persona.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const latestText =
    action === "daily_open"
      ? "The child just opened the app. Give an instant warm greeting that references their latest memory or asks about their day."
      : action === "change_topic"
        ? "Please start a new easy topic for a young beginner."
        : userMessage;

  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = history.map((message) => ({
    role: (message.sender === "ai" ? "model" : "user") as "user" | "model",
    parts: [{ text: message.text }],
  }));

  if (contents[0]?.role === "model") {
    contents.unshift({
      role: "user",
      parts: [{ text: "(Full conversation starts now. Remember every line. Continue as the tutor.)" }],
    });
  }

  const last = contents[contents.length - 1];
  if (!(last?.role === "user" && last.parts[0]?.text === latestText)) {
    contents.push({ role: "user", parts: [{ text: latestText }] });
  }

  if (contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: latestText }] });
  }

  const ai = new GoogleGenAI({ apiKey });
  const config = {
    temperature: 0.7,
    maxOutputTokens: 120,
    responseMimeType: "application/json",
    systemInstruction: system,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        aiResponse: { type: Type.STRING },
        translation: { type: Type.STRING },
      },
      required: ["aiResponse", "translation"],
    },
  };

  let lastError: unknown;

  for (const model of FAST_MODELS) {
    try {
      const stream = await ai.models.generateContentStream({
        model,
        contents,
        config,
      });
      let accumulated = "";
      let spoken = 0;
      let lastCaption = "";
      let spokenText = "";
      for await (const chunk of stream) {
        accumulated += chunk.text ?? "";
        const progress = progressFromPartial(accumulated, spoken, lastCaption, spokenText, allowScaffold);
        spoken = progress.spoken;
        lastCaption = progress.lastCaption;
        spokenText = progress.spokenText;
        for (const event of progress.events) onEvent(event);
      }
      if (!accumulated.trim()) throw new Error("Empty Gemini stream");
      const payload = polishReply(extractJson(accumulated), profile, userMessage);
      for (const chunk of speakableSentences(payload.aiResponse)) {
        if (isRedundantSpeechChunk(chunk, spokenText)) continue;
        spokenText = spokenText ? `${spokenText} ${chunk}` : chunk;
        onEvent({ type: "sentence", text: chunk });
      }
      onEvent({ type: "caption", text: payload.aiResponse, translation: payload.translation });
      onEvent({ type: "done", payload });
      return payload;
    } catch (error) {
      lastError = error;
      logGeminiError(`Gemini stream ${model} failed`, error);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Gemini stream failed");
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequestBody;
    const action: ChatAction =
      body.action === "change_topic" ? "change_topic" : body.action === "daily_open" ? "daily_open" : "chat";
    const userMessage = (body.userMessage ?? "").trim();
    const history = normalizeHistory(body.messages);
    const profile = body.profile ?? null;
    const characterId = body.characterId ?? profile?.selected_character ?? null;
    const memories = Array.isArray(body.memories) ? body.memories : [];
    const isFirstSessionToday = Boolean(body.isFirstSessionToday);
    const placement =
      action !== "daily_open" && (Boolean(body.placement) || isPlacementActive(history));

    if (action === "chat" && !userMessage) {
      return NextResponse.json({ error: "userMessage is required" }, { status: 400 });
    }

    const extras = { memories, isFirstSessionToday, placement };
    const apiKey = process.env.GEMINI_API_KEY?.trim();

    return sseResponse(async (send) => {
      const greeting = maybeGreetingReply(userMessage, action, history, profile, placement);
      if (greeting) {
        for (const event of eventsForCompleteReply(polishReply(greeting, profile, userMessage))) send(event);
        return;
      }

      if (apiKey) {
        try {
          await streamGemini(history, userMessage, action, profile, characterId, extras, send);
          return;
        } catch (error) {
          logGeminiError("Gemini fallback", error);
        }
      } else {
        console.warn("GEMINI_API_KEY is missing from the environment. Using mock replies.");
      }

      const payload = polishReply(mockReply(userMessage, action, history, profile, placement, memories), profile, userMessage);
      for (const event of eventsForCompleteReply(payload)) send(event);
    });
  } catch (error) {
    logGeminiError("Chat POST failed", error);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
