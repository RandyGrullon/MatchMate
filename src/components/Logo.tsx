import { DUO_HEAD_R, DUO_HEADS, DUO_M, DUO_RX, DUO_STROKE } from './splash/brand';

// Sin importar ./ui: ui.tsx usa LogoSpinner para su Loading (así no hay importación circular).
const join = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

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

/**
 * Animación de carga: el logo con las dos cabezas saltando una después de la otra (dos compañeros listos para
 * jugar). Sirve para cualquier deporte y toma el color de la app o el del deporte de la liga. Con movimiento
 * reducido queda quieto (index.css apaga las animaciones).
 */
export const LOGO_SPIN_CSS = [
  '.mm-spin .mm-head{transform-box:fill-box;transform-origin:50% 100%;animation:mm-spin-hop 1.1s cubic-bezier(.33,.66,.66,1) infinite}',
  '.mm-spin .mm-head-2{animation-delay:.18s}',
  '@keyframes mm-spin-hop{0%,58%,100%{transform:none}26%{transform:translateY(-58%) scale(1.06)}}',
].join('\n');

export function LogoSpinner({ className = 'size-10' }: { className?: string }) {
  return (
    <>
      {/* React lo pone una sola vez en el <head> aunque haya varias cargas en pantalla. */}
      <style href="mm-logo-spin" precedence="default">
        {LOGO_SPIN_CSS}
      </style>
      <svg viewBox="0 0 512 512" className={join('mm-spin', className)} aria-hidden="true">
        <rect width="512" height="512" rx={DUO_RX} fill="var(--accent)" />
        <path d={DUO_M} fill="none" stroke="var(--accent-fg)" strokeWidth={DUO_STROKE} strokeLinecap="round" strokeLinejoin="round" />
        {DUO_HEADS.map(([x, y], i) => (
          <circle key={x} className={`mm-head mm-head-${i + 1}`} cx={x} cy={y} r={DUO_HEAD_R} fill="var(--accent-fg)" />
        ))}
      </svg>
    </>
  );
}

/** El nombre: «Match» en el color del texto y «Mate» en el color de la app. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={join('font-extrabold tracking-tight', className)}>
      Match<span className="text-accent">Mate</span>
    </span>
  );
}

/** Logo y nombre juntos (encabezados, pantalla de entrada). */
export function LogoLockup({ className, markClassName = 'size-7' }: { className?: string; markClassName?: string }) {
  return (
    <span className={join('inline-flex items-center gap-2', className)} role="img" aria-label="MatchMate">
      <Logo className={markClassName} />
      <Wordmark />
    </span>
  );
}
