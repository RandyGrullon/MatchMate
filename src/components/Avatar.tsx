import { AVATAR_BUCKET, usePublicImage } from '../lib/publicImages';

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/**
 * La cara de una cuenta: su foto de perfil (`photo`, ruta en el bucket `avatars`) o, sin foto, mientras llega o si no
 * se pudo pedir, sus iniciales.
 */
export function Avatar({ name, photo, className = 'size-9 text-sm' }: { name: string; photo?: string | null; className?: string }) {
  const { url } = usePublicImage(AVATAR_BUCKET, photo);
  if (url) {
    return <img src={url} alt="" loading="lazy" decoding="async" className={`shrink-0 rounded-full bg-surface-2 object-cover ${className}`} />;
  }
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent ${className}`}>
      {initials(name)}
    </div>
  );
}
