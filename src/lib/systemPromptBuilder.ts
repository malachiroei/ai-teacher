import { weekdayName, type ChildMemoryProfile } from "@/types/childProfile";
import { childMemoryKnownFacts } from "@/lib/child-memory";

function listOrNone(items: string[]) {
  return items.filter(Boolean).join(", ") || "unknown yet";
}

export function buildChildMemoryPrompt(memory?: ChildMemoryProfile | null, now = new Date()) {
  const day = weekdayName(now);
  const profile = memory ?? {
    hobbies: [],
    afterSchoolClubs: [],
    schoolSchedule: [],
    learningInterests: [],
    recentTopicsLearned: [],
    sports: [],
    extraFacts: [],
  };
  const todaySchedule = profile.schoolSchedule.find((item) => item.day.toLowerCase() === day.toLowerCase());
  const todayClub = profile.afterSchoolClubs.find((item) => item.day.toLowerCase() === day.toLowerCase());
  const tuesdayBits = [
    ...(todaySchedule?.subjects ?? []),
    todayClub ? `${todayClub.activity} club` : "",
  ].filter(Boolean);
  const recent = profile.recentTopicsLearned
    .slice(0, 5)
    .map((item) => `${item.subject}: ${item.topic}`)
    .join("; ");
  const known = childMemoryKnownFacts(profile);
  const knownJson = JSON.stringify(known, null, 2);

  return `CURRENT DAY: ${day}
KNOWN FACTS ABOUT THIS CHILD:
${knownJson}

CHILD PROFILE MEMORY:
- Name: ${profile.name || "unknown"}
- Age / Grade: ${[profile.age ? `${profile.age}` : "", profile.gradeLevel].filter(Boolean).join(" / ") || "unknown"}
- Sports: ${listOrNone(profile.sports)}
- Favorite athlete: ${profile.favoriteAthlete || "unknown yet"}
- Favorite food: ${profile.favoriteFood || "unknown yet"}
- Travel: ${profile.travelInterests || "unknown yet"}
- Music: ${profile.musicPreference || "unknown yet"}
- Hobbies: ${listOrNone(profile.hobbies)}
- Known ${day} Schedule: ${listOrNone(tuesdayBits)}
- After-school clubs: ${
    profile.afterSchoolClubs.length
      ? profile.afterSchoolClubs.map((item) => `${item.day} ${item.activity}`).join("; ")
      : "unknown yet"
  }
- Extra facts: ${listOrNone(profile.extraFacts)}
- Recent Learning: ${recent || "none stored yet"}
- Math Level: ${profile.mathSkillLevel || "unknown"}

MEMORY RECALL (CRITICAL):
When asked "what do you know about me", "מה את יודעת עלי", or similar, summarize the REAL specific details in KNOWN FACTS (e.g. basketball team / point guard, LeBron James, tennis, Thailand jungles and elephants, Margherita pizza with olives). Do NOT answer with only generic onboarding tags like "sports and movies" if richer facts exist.

PROACTIVE ENGAGEMENT RULES:
1. Natural Routine Check-in: If today matches a known school subject or club, naturally ask about it once near the start of a session.
2. Follow-up Progression: If they mention what they learned, pivot into a fun English mini-game. You MAY append one GAME tag:
   <<<GAME: {"type":"math_match","data":{"prompt":"What is TWO + THREE?","equation":"TWO + THREE = ?","options":["4 — FOUR","5 — FIVE","6 — SIX"],"answer":"5 — FIVE"}}>>>
3. Organic Inquiry: Every few turns, weave ONE friendly question to discover new interests. Never interrogate.
4. Remember facts listed here. Never claim you forgot a hobby, sport, food, or trip that is stored.`;
}

export function buildSystemPromptSections(parts: Array<string | undefined | null>) {
  return parts.filter((part) => Boolean(part && String(part).trim())).join("\n\n");
}
