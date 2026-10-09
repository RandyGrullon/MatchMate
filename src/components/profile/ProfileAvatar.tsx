import { AVATAR_BUCKET, usePublicImage } from '../../lib/publicImages';
import { initials } from '../Avatar';
import { cx } from '../ui';

/**
 * La cara grande de una cuenta arriba de Yo, de su perfil y de Configuración: su foto de perfil (`photo`, ruta en el
 * bucket `avatars`) o, sin foto (o mientras llega), sus iniciales sobre el color del deporte, como siempre. El tamaño y
 * la letra van en `className`.
 */
export function ProfileAvatar({ name, photo, className }: { name: string; photo?: string | null; className?: string }) {
  const { url } = usePublicImage(AVATAR_BUCKET, photo);
  if (url) {
    return <img src={url} alt="" decoding="async" className={cx('shrink-0 rounded-full bg-surface-2 object-cover', className)} />;
  }
  return (
    <span aria-hidden="true" className={cx('grid shrink-0 place-items-center rounded-full bg-accent font-[650] text-accent-fg', className)}>
      {initials(name)}
    </span>
  );
}
