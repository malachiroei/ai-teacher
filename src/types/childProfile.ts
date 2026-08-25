export type MathSkillLevel = "basic_addition" | "multiplication" | "fractions";

export interface AfterSchoolClub {
  day: string;
  activity: string;
}

export interface SchoolDaySchedule {
  day: string;
  subjects: string[];
}

export interface LearnedTopic {
  subject: string;
  topic: string;
  date: string;
}

export interface ChildMemoryProfile {
  name?: string;
  age?: number;
  gradeLevel?: string;
  hobbies: string[];
  afterSchoolClubs: AfterSchoolClub[];
  schoolSchedule: SchoolDaySchedule[];
  learningInterests: string[];
  mathSkillLevel?: MathSkillLevel;
  recentTopicsLearned: LearnedTopic[];
  sports: string[];
  favoriteAthlete?: string;
  favoriteFood?: string;
  travelInterests?: string;
  musicPreference?: string;
  extraFacts: string[];
  updatedAt?: string;
}

export const EMPTY_CHILD_MEMORY: ChildMemoryProfile = {
  hobbies: [],
  afterSchoolClubs: [],
  schoolSchedule: [],
  learningInterests: [],
  recentTopicsLearned: [],
  sports: [],
  extraFacts: [],
};

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function weekdayName(date = new Date()) {
  return WEEKDAYS[date.getDay()];
}

export function emptyChildMemory(): ChildMemoryProfile {
  return {
    hobbies: [],
    afterSchoolClubs: [],
    schoolSchedule: [],
    learningInterests: [],
    recentTopicsLearned: [],
    sports: [],
    extraFacts: [],
  };
}
