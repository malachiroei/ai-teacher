export type DayPart = "morning" | "afternoon" | "evening";

export function dayPartFromHour(hour = new Date().getHours()): DayPart {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}

export function timeOfDayGreeting(name?: string | null, hour = new Date().getHours()) {
  const who = String(name ?? "").trim();
  const part = dayPartFromHour(hour);

  if (part === "morning") {
    return {
      part,
      en: who ? `Good morning, ${who}! How are you starting your day?` : "Good morning! How are you starting your day?",
      he: who ? `בוקר טוב, ${who}! איך אתה מתחיל את היום?` : "בוקר טוב! איך אתה מתחיל את היום?",
      suggestions: ["Good morning!", "I'm sleepy.", "I'm ready!"],
    };
  }

  if (part === "afternoon") {
    return {
      part,
      en: who ? `Hi ${who}! How is your day going so far?` : "Hi! How is your day going so far?",
      he: who ? `היי ${who}! איך היום שלך עד עכשיו?` : "היי! איך היום שלך עד עכשיו?",
      suggestions: ["It's going well!", "A bit busy.", "Pretty good!"],
    };
  }

  return {
    part,
    en: who ? `Good evening, ${who}! How was your day today?` : "Good evening! How was your day today?",
    he: who ? `ערב טוב, ${who}! איך היה היום שלך?` : "ערב טוב! איך היה היום שלך?",
    suggestions: ["It was good!", "A little tiring.", "Fun!"],
  };
}

export function timeOfDaySystemHint(hour = new Date().getHours()) {
  const part = dayPartFromHour(hour);
  if (part === "morning") {
    return "LOCAL TIME is MORNING (before noon). Greet with Good morning. Ask how they are starting their day. NEVER say afternoon, evening, or night.";
  }
  if (part === "afternoon") {
    return "LOCAL TIME is AFTERNOON. Greet with Hi / Good afternoon. Ask how their day is going so far. NEVER say good morning or good evening.";
  }
  return "LOCAL TIME is EVENING. Greet with Good evening. Ask how their day was. NEVER say good morning.";
}
