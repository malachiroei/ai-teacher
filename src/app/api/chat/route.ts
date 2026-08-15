import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { getCharacter } from "@/lib/characters";
import { detectUserLanguage, looksLikeAwkwardEnglish, looksLikeGibberishEnglish } from "@/lib/language";
import { buildLearnerContext } from "@/lib/learner";
import { polishHebrewTranslation } from "@/lib/hebrew";
import { trustSystemCertificates } from "@/lib/tls";
import type { ProfileInput } from "@/lib/supabase/types";
import type { ChatApiResponse, GrammarFeedback, Message } from "@/types/chat";

type ChatAction = "chat" | "change_topic";

interface ChatRequestBody {
  messages?: Pick<Message, "sender" | "text">[];
  userMessage?: string;
  action?: ChatAction;
  profile?: ProfileInput | null;
  characterId?: string | null;
}

const BASE_TUTOR_RULES = `You are an English conversation tutor for Hebrew-speaking learners aged 11-15.
Stay fully in the assigned CHARACTER PERSONA for tone, vocabulary, emojis, and interests.
Keep replies short (1-3 sentences) and always continue with a follow-up question in English.
Detect the language of the learner's LATEST message automatically.
Content must stay kind and age-appropriate.

If a LEARNER PROFILE is provided:
- Address the learner by name naturally.
- Match vocabulary and sentence length to their English level.
- Prefer topics connected to their interests.
- Use the correct gender when referring to them.

Return STRICT JSON with this exact shape:
{
  "aiResponse": string,
  "translation": string,
  "grammarAnalysis": {
    "hasError": boolean,
    "explanation": string,
    "correctedText": string
  },
  "suggestedAnswers": string[]
}

GLOBAL RULES:
- aiResponse is always primarily English (you may quote one English target sentence).
- translation: a natural, fluent, spoken-Israeli-Hebrew rendering of the FULL aiResponse (not the user's message).
- suggestedAnswers: 2-3 short English replies the learner could say next, matching their level and the follow-up question.

HEBREW TRANSLATION RULES (strict):
- Write the way people actually speak in Israel. Do not translate word-for-word.
- NEVER use slash forms such as אוהב/ת, את/ה, שמח/ה, יכול/ה. Choose ONE gendered form.
- If the learner is a boy/male: אתה, אתה אוהב, אתה יכול, שלך.
- If the learner is a girl/female: את, את אוהבת, את יכולה, שלך.
- If gender is other: avoid gendered verbs (יש לך, אפשר, בואו נדבר). Never use slashes.
- ALWAYS translate interest/topic nouns into Hebrew. Never leave English topic words in translation.
  Movies=סרטים, Cars=מכוניות, Travel=טיולים, Sports=ספורט, Tech=טכנולוגיה, Music=מוזיקה, Food=אוכל, Games=משחקים.
- Keep punctuation in Hebrew reading order. If you must include an English name or quoted phrase, keep that English phrase intact as one unit and do not mix letters inside Hebrew words.
- grammarAnalysis.explanation must also follow these same natural, gendered Hebrew rules.

IF THE USER WROTE/SPOKE HEBREW (Hebrew letters present):
- This is NOT a grammar error. Do not scold them.
- Acknowledge what they meant in a friendly way.
- Teach the natural English: include the exact line: In English, you can say: "..."
- Then ask a follow-up question in English so they practice.
- grammarAnalysis.hasError MUST be false.
- grammarAnalysis.correctedText = the natural English equivalent.
- grammarAnalysis.explanation = a short helpful Hebrew tip (translation/teaching), not an error.

IF THE USER WROTE/SPOKE ENGLISH:
- Continue the conversation naturally in English about THE SAME TOPIC they just mentioned.
- You MUST react to their specific words. If they talk about the beach, talk about the beach, sun, swimming, sand, or waves — never reply with a generic unrelated question.
- Do not use empty filler like "Thanks for sharing. Can you tell me a little more?" unless you also add a concrete follow-up about what they said.
- Treat phonetic / badly spelled English as English, not as nonsense. Infer the intended meaning and keep chatting about it.
  Examples you MUST catch (hasError true, gentle Hebrew explanation, correctedText is the natural English):
  - "i am goog tank you" → "I am good, thank you."
  - "i go tow bich today" → "I'm going to the beach today."
- Flag hasError true for: grammar mistakes, severe spelling, incomplete sentences (e.g. just "I am"), or awkward/nonsensical phrasing (e.g. "Bay car action").
- If hasError is true: explanation MUST be clear, gentle Hebrew; correctedText is the natural English fix. Then continue the conversation about what they meant.
- If the sentence is fine: hasError false, brief Hebrew praise, correctedText repeats the original (lightly cleaned).

If the user asks to change topic, pick a fresh everyday topic — preferably from their interests.`;

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
  tip: string;
  suggestions: string[];
}

const HEBREW_LESSONS: HebrewLesson[] = [
  {
    test: /שלום|היי|הי\b|בוקר טוב|ערב טוב/,
    english: "Hello!",
    ack: "Nice to hear from you!",
    followUp: "How are you doing today?",
    translation: 'נחמד לשמוע ממך! באנגלית אפשר להגיד: "Hello!" מה שלומך היום?',
    tip: 'באנגלית ברכה טבעית היא "Hello!" או "Hi!"',
    suggestions: ["I'm doing great!", "I'm a bit tired.", "Pretty good, thanks."],
  },
  {
    test: /מה שלומך|מה נשמע|איך אתה|איך את\b/,
    english: "How are you?",
    ack: "That's a great question.",
    followUp: "I'm doing well — how about you?",
    translation: 'שאלה מצוינת. באנגלית אפשר להגיד: "How are you?" אני בסדר — ומה איתך?',
    tip: 'כדי לשאול מה שלומך אומרים "How are you?"',
    suggestions: ["I'm fine, thanks.", "I'm great today.", "A little tired."],
  },
  {
    test: /אני בסדר|הכל טוב|הכול טוב|סבבה/,
    english: "I'm fine.",
    ack: "Glad to hear that!",
    followUp: "What did you do today?",
    translation: 'שמחה לשמוע! באנגלית אפשר להגיד: "I\'m fine." מה עשית היום?',
    tip: 'באנגלית אומרים "I\'m fine" או "I\'m good."',
    suggestions: ["I worked from home.", "I met a friend.", "Not much, just relaxing."],
  },
  {
    test: /עייף|עייפה|לא ישנתי/,
    english: "I'm tired.",
    ack: "I hear you — long day?",
    followUp: "Did you sleep well last night?",
    translation: 'אני שומעת אותך — יום ארוך? באנגלית אפשר להגיד: "I\'m tired." ישנת טוב בלילה?',
    tip: 'כדי להגיד שאתה עייף: "I\'m tired."',
    suggestions: ["Not really.", "Yes, I slept well.", "I went to bed late."],
  },
  {
    test: /שמח|שמחה|מצוין|כיף/,
    english: "I'm happy.",
    ack: "That's wonderful!",
    followUp: "What made you feel that way?",
    translation: 'זה נפלא! באנגלית אפשר להגיד: "I\'m happy." מה גרם לך להרגיש ככה?',
    tip: 'אומרים "I\'m happy" או "I feel great."',
    suggestions: ["I got good news.", "The weather is nice.", "I spent time with friends."],
  },
  {
    test: /רעב|רעבה|אוכל|לאכול/,
    english: "I'm hungry.",
    ack: "Food is always a good topic!",
    followUp: "What do you feel like eating?",
    translation: 'אוכל תמיד נושא טוב! באנגלית אפשר להגיד: "I\'m hungry." מה בא לך לאכול?',
    tip: 'כדי להגיד שאתה רעב: "I\'m hungry."',
    suggestions: ["I want pizza.", "Something healthy.", "Maybe just a snack."],
  },
  {
    test: /רוצה ללמוד|ללמוד אנגלית|אנגלית/,
    english: "I want to learn English.",
    ack: "I love that goal.",
    followUp: "Which skill do you want to practice most — speaking, listening, or writing?",
    translation: 'מטרה נהדרת. באנגלית אפשר להגיד: "I want to learn English." מה הכי חשוב לך לתרגל — דיבור, האזנה או כתיבה?',
    tip: 'אומרים "I want to learn English."',
    suggestions: ["Speaking, please.", "I want better listening.", "A bit of everything."],
  },
  {
    test: /אוהב|אוהבת/,
    english: "I like it.",
    ack: "Nice!",
    followUp: "Can you tell me what you like, in English?",
    translation: 'נחמד! באנגלית אפשר להגיד: "I like it." תוכל להגיד מה אתה אוהב, באנגלית?',
    tip: 'אומרים "I like …" ואז את הדבר שאוהבים.',
    suggestions: ["I like music.", "I like sports.", "I like cooking."],
  },
  {
    test: /עובד|עבודה|עובדת/,
    english: "I work.",
    ack: "Got it — work is a useful topic.",
    followUp: "What do you do for work?",
    translation: 'הבנתי — עבודה זה נושא שימושי. באנגלית אפשר להגיד: "I work." במה אתה עובד?',
    tip: 'אפשר להגיד "I work" או "I have a job."',
    suggestions: ["I work in an office.", "I'm a student.", "I work from home."],
  },
  {
    test: /תודה|תודה רבה/,
    english: "Thank you.",
    ack: "You're very welcome!",
    followUp: "What would you like to talk about next?",
    translation: 'על לא דבר! באנגלית אפשר להגיד: "Thank you." על מה תרצה לדבר עכשיו?',
    tip: 'תודה באנגלית: "Thank you" או "Thanks."',
    suggestions: ["Let's talk about hobbies.", "Tell me about your day.", "I want to practice food words."],
  },
  {
    test: /נעים להכיר/,
    english: "Nice to meet you.",
    ack: "Nice to meet you too!",
    followUp: "Where are you from?",
    translation: 'גם לי נעים להכיר! באנגלית אפשר להגיד: "Nice to meet you." מאיפה אתה?',
    tip: 'כשנפגשים אומרים "Nice to meet you."',
    suggestions: ["I'm from Israel.", "I live in Tel Aviv.", "I live in a small town."],
  },
];

function hebrewLessonReply(userMessage: string): ChatApiResponse {
  const lesson = HEBREW_LESSONS.find((item) => item.test.test(userMessage));
  if (lesson) {
    return {
      aiResponse: `${lesson.ack} In English, you can say: "${lesson.english}" ${lesson.followUp}`,
      translation: lesson.translation,
      grammarAnalysis: {
        hasError: false,
        explanation: lesson.tip,
        correctedText: lesson.english,
      },
      suggestedAnswers: lesson.suggestions,
    };
  }

  return {
    aiResponse:
      'Thanks for sharing that in Hebrew — I understood you. In English, you can say the same idea in a short sentence. How would you say it in English?',
    translation:
      "תודה ששיתפת בעברית — הבנתי אותך. עכשיו נסה להגיד את אותו רעיון במשפט קצר באנגלית. איך היית אומר את זה באנגלית?",
    grammarAnalysis: {
      hasError: false,
      explanation: "דיברת בעברית — זה מצוין. אין כאן שגיאה; זה טיפ תרגום. נסה עכשיו באנגלית.",
      correctedText: "I want to say this in English.",
    },
    suggestedAnswers: ["I want to say this in English.", "Can you help me translate?", "Let me try in English."],
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
    return {
      aiResponse: name
        ? `Hi ${name}! It's great to chat with you. How has your day been so far?`
        : "Hi there! It's great to meet you. How has your day been so far?",
      translation: name
        ? `היי ${name}! כיף לשוחח איתך. איך עבר עליך היום עד עכשיו?`
        : "היי! כיף להכיר אותך. איך עבר עליך היום עד עכשיו?",
      grammarAnalysis,
      suggestedAnswers: ["It's been a good day.", "A bit tiring, actually.", "Pretty quiet so far."],
    };
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
    aiResponse: "Thanks for sharing that. Can you tell me a little more, or give me an example?",
    translation: "תודה ששיתפת. תוכל לספר לי קצת יותר, או לתת דוגמה?",
    grammarAnalysis,
    suggestedAnswers: ["Sure, for example...", "Let me think about that.", "Can you ask it another way?"],
  };
}

function mockReply(
  userMessage: string,
  action: ChatAction,
  turn: number,
  profile?: ProfileInput | null,
): ChatApiResponse {
  if (action === "change_topic") {
    return pickTopic(turn, profile);
  }

  if (detectUserLanguage(userMessage) === "he") {
    return hebrewLessonReply(userMessage);
  }

  return mockEnglishReply(userMessage, analyzeGrammar(userMessage), profile);
}

function polishReply(reply: ChatApiResponse, profile?: ProfileInput | null): ChatApiResponse {
  return {
    ...reply,
    translation: polishHebrewTranslation(reply.translation, profile?.gender),
    grammarAnalysis: {
      ...reply.grammarAnalysis,
      explanation: polishHebrewTranslation(reply.grammarAnalysis.explanation, profile?.gender),
    },
  };
}

function extractJson(content: string): ChatApiResponse {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  const raw = start >= 0 && end > start ? content.slice(start, end + 1) : content;
  const parsed = JSON.parse(raw) as ChatApiResponse;

  return {
    aiResponse: parsed.aiResponse ?? "",
    translation: parsed.translation ?? "",
    grammarAnalysis: {
      hasError: Boolean(parsed.grammarAnalysis?.hasError),
      explanation: parsed.grammarAnalysis?.explanation ?? "",
      correctedText: parsed.grammarAnalysis?.correctedText ?? "",
    },
    suggestedAnswers: Array.isArray(parsed.suggestedAnswers)
      ? parsed.suggestedAnswers.slice(0, 3).map(String)
      : [],
  };
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

async function callGemini(
  history: Pick<Message, "sender" | "text">[],
  userMessage: string,
  action: ChatAction,
  profile?: ProfileInput | null,
  characterId?: string | null,
): Promise<ChatApiResponse> {
  trustSystemCertificates();

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.warn("GEMINI_API_KEY is missing. The tutor will use mock replies until you add it to .env.local.");
    throw new Error("Missing GEMINI_API_KEY");
  }

  const detected = userMessage ? detectUserLanguage(userMessage) : "en";
  const languageHint =
    action === "change_topic"
      ? "The user asked to change the topic. Prefer a topic from their interests if listed."
      : detected === "he"
        ? "DETECTED LANGUAGE: Hebrew. Follow the Hebrew-input rules (teach English, hasError false)."
        : "DETECTED LANGUAGE: English. Follow the English-input rules (strict grammar, Hebrew explanations if error). Reply about THIS message's topic.";

  const learnerContext = buildLearnerContext(profile);
  const character = getCharacter(characterId ?? profile?.selected_character);
  const system = [
    character.systemPrompt,
    BASE_TUTOR_RULES,
    learnerContext,
    languageHint,
    'The "translation" field must be natural spoken Hebrew, fully gendered for this learner, with topic nouns in Hebrew. No slash forms like אוהב/ת.',
    "Stay on the learner's latest topic. If they mention the beach, talk about the beach.",
    `Never break character. You are ${character.name} (${character.title}).`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const latestText =
    action === "change_topic"
      ? "Please change the topic and start a new conversation thread."
      : userMessage;

  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = history
    .slice(-12)
    .map((message) => ({
      role: (message.sender === "ai" ? "model" : "user") as "user" | "model",
      parts: [{ text: message.text }],
    }));

  while (contents.length > 0 && contents[0].role === "model") {
    contents.shift();
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
    temperature: 0.8,
    responseMimeType: "application/json",
    systemInstruction: system,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        aiResponse: { type: Type.STRING },
        translation: { type: Type.STRING },
        grammarAnalysis: {
          type: Type.OBJECT,
          properties: {
            hasError: { type: Type.BOOLEAN },
            explanation: { type: Type.STRING },
            correctedText: { type: Type.STRING },
          },
          required: ["hasError", "explanation", "correctedText"],
        },
        suggestedAnswers: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
      required: ["aiResponse", "translation", "grammarAnalysis", "suggestedAnswers"],
    },
  };

  const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
  let lastError: unknown;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config,
      });
      const content = response.text;
      if (!content) throw new Error("Empty Gemini response");
      return polishReply(extractJson(content), profile);
    } catch (error) {
      lastError = error;
      logGeminiError(`Gemini ${model} failed`, error);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Gemini request failed");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequestBody;
    const action: ChatAction = body.action === "change_topic" ? "change_topic" : "chat";
    const userMessage = (body.userMessage ?? "").trim();
    const history = Array.isArray(body.messages) ? body.messages : [];
    const profile = body.profile ?? null;
    const characterId = body.characterId ?? profile?.selected_character ?? null;

    if (action === "chat" && !userMessage) {
      return NextResponse.json({ error: "userMessage is required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is missing from the environment. Using mock replies.");
    } else {
      try {
        const payload = await callGemini(history, userMessage, action, profile, characterId);
        return NextResponse.json(payload);
      } catch (error) {
        logGeminiError("Gemini fallback", error);
      }
    }

    const payload = mockReply(userMessage, action, history.length, profile);
    return NextResponse.json(polishReply(payload, profile));
  } catch (error) {
    logGeminiError("Chat POST failed", error);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
