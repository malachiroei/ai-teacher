export type VocabCard = {
  en: string;
  he: string;
  emoji: string;
};

export const DEFAULT_VOCAB: VocabCard[] = [
  { en: "Hello", he: "שלום", emoji: "👋" },
  { en: "Pizza", he: "פיצה", emoji: "🍕" },
  { en: "Cat", he: "חתול", emoji: "🐱" },
  { en: "Friend", he: "חבר/ה", emoji: "🤝" },
  { en: "Thank you", he: "תודה", emoji: "🙏" },
];
