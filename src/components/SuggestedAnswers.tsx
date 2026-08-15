"use client";

interface SuggestedAnswersProps {
  suggestions: string[];
  onSelect: (text: string) => void;
}

export function SuggestedAnswers({ suggestions, onSelect }: SuggestedAnswersProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-3 pb-2">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          onClick={() => onSelect(suggestion)}
          className="rounded-2xl bg-blue-50 px-3 py-2 text-left text-[13px] font-medium text-[#2f6bff] transition hover:bg-blue-100"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
