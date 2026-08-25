import { weekdayName, type ChildMemoryProfile } from "@/types/childProfile";

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

  return `CURRENT DAY: ${day}
CHILD PROFILE MEMORY:
- Name: ${profile.name || "unknown"}
- Age / Grade: ${[profile.age ? `${profile.age}` : "", profile.gradeLevel].filter(Boolean).join(" / ") || "unknown"}
- Hobbies: ${listOrNone(profile.hobbies)}
- Known ${day} Schedule: ${listOrNone(tuesdayBits)}
- After-school clubs: ${
    profile.afterSchoolClubs.length
      ? profile.afterSchoolClubs.map((item) => `${item.day} ${item.activity}`).join("; ")
      : "unknown yet"
  }
- School subjects by day: ${
    profile.schoolSchedule.length
      ? profile.schoolSchedule.map((item) => `${item.day}: ${item.subjects.join(", ")}`).join("; ")
      : "unknown yet"
  }
- Learning interests: ${listOrNone(profile.learningInterests)}
- Recent Learning: ${recent || "none stored yet"}
- Math Level: ${profile.mathSkillLevel || "unknown"}

PROACTIVE ENGAGEMENT RULES:
1. Natural Routine Check-in: If today matches a known school subject or club, naturally ask about it (e.g. "Hey, did you have Math class today? What cool numbers did you work on?"). Do this at most once near the start of a session — never every turn.
2. Follow-up Progression: If the child mentions what they learned, pivot into a fun English mini-game practicing that exact concept (math in English words, vocab from their hobby). You MAY append one GAME tag:
   <<<GAME: {"type":"math_match","data":{"prompt":"What is TWO + THREE?","equation":"TWO + THREE = ?","options":["4 — FOUR","5 — FIVE","6 — SIX"],"answer":"5 — FIVE"}}>>>
3. Organic Inquiry: Every few turns, weave ONE friendly question to discover new interests (e.g. "What do you like to do after school on Wednesdays?"). Never interrogate.
4. Remember facts listed here. Never claim you forgot a hobby, club, or math topic that is stored.`;
}

export function buildSystemPromptSections(parts: Array<string | undefined | null>) {
  return parts.filter((part) => Boolean(part && String(part).trim())).join("\n\n");
}
