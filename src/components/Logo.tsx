export function Logo({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="28" fill="var(--accent)" />
      <circle cx="24" cy="22" r="4" fill="var(--surface)" />
      <circle cx="36" cy="20" r="4" fill="var(--surface)" />
      <circle cx="31" cy="31" r="4" fill="var(--surface)" />
    </svg>
  );
}
