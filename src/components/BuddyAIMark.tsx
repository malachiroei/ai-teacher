export function BuddyAIMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#0d1117" />
      <rect x="0.7" y="0.7" width="30.6" height="30.6" rx="8.3" stroke="url(#buddyai-ring)" strokeOpacity="0.85" strokeWidth="1.1" />
      <path
        d="M8.2 15.2c0-5.1 3.4-8.4 7.8-8.4s7.8 3.3 7.8 8.4"
        stroke="url(#buddyai-band)"
        strokeWidth="2.15"
        strokeLinecap="round"
      />
      <rect x="5.1" y="13.1" width="4.4" height="7.4" rx="2.2" fill="url(#buddyai-cup)" />
      <rect x="22.5" y="13.1" width="4.4" height="7.4" rx="2.2" fill="url(#buddyai-cup)" />
      <circle cx="16" cy="17.1" r="7.05" fill="#121821" />
      <circle cx="16" cy="17.1" r="7.05" stroke="url(#buddyai-face)" strokeWidth="1.05" />
      <rect x="9.6" y="14.35" width="12.8" height="5.5" rx="2.75" fill="url(#buddyai-visor)" />
      <path d="M12.15 16.05c.55-.7 1.15-.7 1.7 0" stroke="#041018" strokeWidth="1.15" strokeLinecap="round" />
      <path d="M18.15 16.05c.55-.7 1.15-.7 1.7 0" stroke="#041018" strokeWidth="1.15" strokeLinecap="round" />
      <path d="M14.15 18.15c.55.55 1.15.8 1.85.8s1.3-.25 1.85-.8" stroke="#041018" strokeWidth="1.05" strokeLinecap="round" />
      <path d="M11.2 24.6c1.45.7 3.05 1.05 4.8 1.05s3.35-.35 4.8-1.05" stroke="#3DFFD0" strokeOpacity="0.55" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M7.4 10.4c.15-1.15.7-2 .95-2.15" stroke="#3DFF8A" strokeOpacity="0.7" strokeWidth="1.05" strokeLinecap="round" />
      <path d="M24.6 10.4c-.15-1.15-.7-2-.95-2.15" stroke="#3DFFD0" strokeOpacity="0.7" strokeWidth="1.05" strokeLinecap="round" />
      <defs>
        <linearGradient id="buddyai-ring" x1="4" y1="2" x2="28" y2="30">
          <stop stopColor="#5CFFE0" />
          <stop offset="1" stopColor="#3DFF8A" />
        </linearGradient>
        <linearGradient id="buddyai-band" x1="8" y1="7" x2="24" y2="16">
          <stop stopColor="#7AFFF0" />
          <stop offset="1" stopColor="#3DFF8A" />
        </linearGradient>
        <linearGradient id="buddyai-cup" x1="5" y1="13" x2="27" y2="21">
          <stop stopColor="#5CFFE0" />
          <stop offset="1" stopColor="#2EE59A" />
        </linearGradient>
        <linearGradient id="buddyai-face" x1="10" y1="11" x2="22" y2="24">
          <stop stopColor="#3DFFD0" />
          <stop offset="1" stopColor="#3DFF8A" />
        </linearGradient>
        <linearGradient id="buddyai-visor" x1="10" y1="14" x2="22" y2="20">
          <stop stopColor="#7AFFF0" />
          <stop offset="1" stopColor="#3DFF8A" />
        </linearGradient>
      </defs>
    </svg>
  );
}
