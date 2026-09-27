import { DUO_HEAD_R, DUO_HEADS, DUO_M, DUO_RX, DUO_STROKE } from './splash/brand';
import { cx } from './ui';

/**
 * Logo de MatchMate («Dúo»): dos compañeros tomados de la mano forman la M; las cabezas son los puntos.
 * Toma el color de la app (--accent) y el dibujo va en el color de texto sobre él (--accent-fg, calculado
 * por contraste en theme.ts), así se ve bien en claro, en oscuro y con cualquier color elegido.
 * Sin `title` es decorativo (aria-hidden).
 */
export function Logo({ className = 'size-7', title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <rect width="512" height="512" rx={DUO_RX} fill="var(--accent)" />
      <path d={DUO_M} fill="none" stroke="var(--accent-fg)" strokeWidth={DUO_STROKE} strokeLinecap="round" strokeLinejoin="round" />
      {DUO_HEADS.map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r={DUO_HEAD_R} fill="var(--accent-fg)" />
      ))}
    </svg>
  );
}

/** El nombre: «Match» en el color del texto y «Mate» en el color de la app. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx('font-extrabold tracking-tight', className)}>
      Match<span className="text-accent">Mate</span>
    </span>
  );
}

/** Logo y nombre juntos (encabezados, pantalla de entrada). */
export function LogoLockup({ className, markClassName = 'size-7' }: { className?: string; markClassName?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2', className)} role="img" aria-label="MatchMate">
      <Logo className={markClassName} />
      <Wordmark />
    </span>
  );
}
