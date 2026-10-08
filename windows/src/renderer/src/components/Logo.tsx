/** The Nest Egg mark: an egg resting in a nest line, on the accent colour. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="16" fill="var(--accent)" />
      <path d="M32 13c-8.3 0-14.5 11.4-14.5 20.6C17.5 42.4 24 48 32 48s14.5-5.6 14.5-14.4C46.5 24.4 40.3 13 32 13z" fill="#fbf7ef" />
      <path d="M14 42.5c5.2 6 11.2 8.5 18 8.5s12.8-2.5 18-8.5" fill="none" stroke="#fbf7ef" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M26 35.5l4.2-4.4 3.6 3 5.6-6.1" fill="none" stroke="var(--accent)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
