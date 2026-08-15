export function TypingIndicator() {
  return (
    <div className="msg-enter flex max-w-[86%] items-center gap-1 rounded-2xl rounded-tl-md bg-slate-100 px-4 py-3">
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
    </div>
  );
}
