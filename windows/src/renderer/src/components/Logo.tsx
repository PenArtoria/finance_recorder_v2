/** The Moneta mark: a coin with an M whose strokes read as a rising line, on the accent colour. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="16" fill="var(--accent)" />
      <circle cx="32" cy="32" r="20" fill="#fbf7ef" />
      <circle cx="32" cy="32" r="16" fill="none" stroke="var(--accent)" strokeOpacity="0.3" strokeWidth="1.5" />
      <path d="M23.5 40.5V24.5l8.5 9.5 8.5-9.5v16" fill="none" stroke="var(--accent)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
