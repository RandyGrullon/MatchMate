import type { MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router';
import { Avatar } from '../Avatar';
import { cx } from '../ui';

/** Ruta del perfil público de una cuenta. */
export const userPath = (userId: string) => `/u/${encodeURIComponent(userId)}`;

/**
 * Nombre (y foto con las iniciales) de alguien: si tiene cuenta, lleva a su perfil (`/u/:userId`); si no (un jugador
 * que anota el admin, un menor), es solo texto. Dentro de una tarjeta que se toca, el toque del nombre no abre la
 * tarjeta.
 */
export function UserLink({
  userId,
  name,
  avatar = true,
  hideName,
  avatarClassName,
  className,
  children,
}: {
  userId?: string | null;
  name: string;
  /** Mostrar las iniciales al lado del nombre. */
  avatar?: boolean;
  /** Solo las iniciales (con el nombre para lectores de pantalla). */
  hideName?: boolean;
  avatarClassName?: string;
  className?: string;
  /** Algo más dentro del link, debajo del nombre (p. ej. la liga). */
  children?: ReactNode;
}) {
  const shown = name.trim() || 'Jugador';
  const inner = (
    <>
      {avatar && <Avatar name={shown} className={avatarClassName} />}
      {!hideName && (
        <span className="min-w-0">
          <span className={cx('block truncate font-semibold', userId && 'group-hover/user:underline')}>{shown}</span>
          {children}
        </span>
      )}
    </>
  );
  const base = cx('flex min-w-0 items-center gap-2.5', className);
  if (!userId) {
    return (
      <span className={base} aria-label={hideName ? shown : undefined}>
        {inner}
      </span>
    );
  }
  return (
    <Link
      to={userPath(userId)}
      onClick={(e: MouseEvent) => e.stopPropagation()}
      aria-label={hideName ? `Perfil de ${shown}` : undefined}
      title={`Ver el perfil de ${shown}`}
      className={cx(base, 'group/user -m-1 min-h-11 rounded-xl p-1 transition focus-visible:outline-2 focus-visible:outline-accent active:opacity-80')}
    >
      {inner}
    </Link>
  );
}
