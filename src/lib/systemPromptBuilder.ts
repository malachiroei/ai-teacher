import { weekdayName, type ChildMemoryProfile } from "@/types/childProfile";

function listOrNone(items: string[] | undefined, fallback = "unknown yet") {
  const text = (items ?? []).filter(Boolean).join(", ");
  return text || fallback;
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

  return `=== PERSISTENT CHILD MEMORY PROFILE ===
CURRENT DAY: ${day}
- Full Name: ${profile.name || "unknown"}
- Age / Grade: ${[profile.age ? String(profile.age) : "", profile.gradeLevel].filter(Boolean).join(" / ") || "unknown"}
- Sports & Position: ${listOrNone(profile.sports, "unknown yet")} (e.g. Basketball Point Guard / רכז, Tennis)
- Favorite Athletes: ${profile.favoriteAthlete || "unknown yet"} (e.g. LeBron James)
- Food Preferences: ${profile.favoriteFood || "unknown yet"} (e.g. Margherita pizza with olives)
- Travel & Adventure: ${profile.travelInterests || "unknown yet"} (e.g. Thailand trip, elephants, jungle)
- Music: ${profile.musicPreference || "unknown yet"} (Pop)
- Extra learned facts: ${listOrNone(profile.extraFacts)}
- Hobbies (secondary): ${listOrNone(profile.hobbies)}

CRITICAL MEMORY INSTRUCTION:
When the child asks what you know about them ("מה אתה יודע עלי?", "מה את יודעת עלי", "what do you know about me"), you MUST specifically mention their actual real details stored above (Playing basketball as point guard, LeBron James, Tennis, Thailand elephants, Pizza with olives) IF those fields are not "unknown yet". NEVER give generic questionnaire answers like "you're 11 and love sports and movies" when richer facts exist. The onboarding interests list is weaker than this profile — this profile wins.`;
}

export function buildSystemPromptSections(parts: Array<string | undefined | null>) {
  return parts.filter((part) => Boolean(part && String(part).trim())).join("\n\n");
}
