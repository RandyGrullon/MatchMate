export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export function Avatar({ name, className = 'size-9 text-sm' }: { name: string; className?: string }) {
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent ${className}`}>
      {initials(name)}
    </div>
  );
}
