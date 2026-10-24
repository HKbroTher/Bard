/** Bard mark: an envelope sealed with brass wax, on post-office green. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="bard-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#11805C" />
          <stop offset="1" stopColor="#0A5C42" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#bard-bg)" />
      <rect x="13" y="19" width="38" height="27" rx="4.5" fill="none" stroke="#FAF8F3" strokeWidth="3.4" />
      <path d="M15 21.5 32 34.5 49 21.5" fill="none" stroke="#FAF8F3" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="35" r="6.6" fill="#C8A24A" stroke="#0B6E4F" strokeWidth="2" />
      <circle cx="32" cy="35" r="3" fill="none" stroke="#9C7B2E" strokeWidth="1.4" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <LogoMark size={26} />
      <span>Bard</span>
    </span>
  );
}
