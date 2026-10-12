import { Link } from 'react-router';
import type { LeagueCtx } from '../../lib/league';
import { useLeagueStreams, streamFor, type LiveStream } from '../../lib/data/streams';
import { PLATFORM_LABEL, type StreamPlatform } from '../../lib/streams';
import { leagueSport } from '../../sports/registry';
import { cx } from '../ui';

/**
 * Piezas de las transmisiones en vivo (docs/equipos-y-en-vivo.md §2) que comparten la franja «EN VIVO» de la liga, la
 * página En vivo (`/l/:lid/vivo`), los partidos y eventos y Hoy: quién puede transmitir, el título de una transmisión,
 * su link en la app, el punto rojo, la marca de cada plataforma y la píldora «Ver en vivo».
 */

/**
 * ¿Puede transmitir en esta liga (la gemela del permiso de start_stream)? Los admins y los anotadores; en el boliche,
 * solo los admins. Que la liga las tenga activadas es aparte (`canStartStream`).
 */
export function isStreamOfficial(ctx: Pick<LeagueCtx, 'isAdmin' | 'member' | 'league'>): boolean {
  if (ctx.isAdmin) return true;
  return ctx.member?.scorer === true && leagueSport(ctx.league) !== 'bowling';
}

/** Puede empezar una transmisión ahora: es de los que transmiten y la liga tiene activadas las transmisiones. */
export const canStartStream = (ctx: Pick<LeagueCtx, 'isAdmin' | 'member' | 'league'>): boolean =>
  ctx.league.liveEnabled === true && isStreamOfficial(ctx);

/** El link de la transmisión dentro de la app (la página En vivo de la liga, con esa transmisión elegida). */
export const liveHref = (lid: string, streamId?: string | null) => `/l/${lid}/vivo${streamId ? `?s=${encodeURIComponent(streamId)}` : ''}`;

/** Lo que se lee de una transmisión: su título, si no «Tigres vs Leones» (o el evento), si no «Transmisión de la liga». */
export const streamTitle = (s: Pick<LiveStream, 'title' | 'label'>): string => s.title?.trim() || s.label?.trim() || 'Transmisión de la liga';

/** Para comparar títulos sin que cuenten mayúsculas, puntos ni espacios («Tigres vs. Leones» = «tigres vs leones»). */
const same = (a: string, b: string) => {
  const norm = (x: string) => x.toLowerCase().replace(/[.\s]+/g, ' ').trim();
  return norm(a) === norm(b);
};

/** La línea de abajo: el partido (si el título es otro) y la plataforma. */
export function streamLine(s: Pick<LiveStream, 'title' | 'label' | 'platform'>, extra?: string | null): string {
  const label = s.label?.trim();
  const title = s.title?.trim();
  const showLabel = !!label && !!title && !same(label, title);
  return [extra, showLabel ? label : null, PLATFORM_LABEL[s.platform]].filter(Boolean).join(' · ');
}

/** El punto rojo que late de «EN VIVO». */
export function LiveDot({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cx('live-dot shrink-0', className)} />;
}

/** «● EN VIVO» chico, en rojo. */
export function LiveTag({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] text-danger', className)}>
      <LiveDot />
      EN VIVO
    </span>
  );
}

/**
 * La marca de la plataforma, simplificada y en su color (decorativa: al lado siempre va su nombre). TikTok va en el
 * color del texto para que se vea en claro y en oscuro.
 */
export function PlatformMark({ platform, className }: { platform: StreamPlatform; className?: string }) {
  const cls = cx('shrink-0', className ?? 'size-5');
  switch (platform) {
    case 'youtube':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={cls}>
          <rect x="1.5" y="5" width="21" height="14" rx="4.5" fill="#FF0000" />
          <path d="M10 9v6l5.2-3z" fill="#fff" />
        </svg>
      );
    case 'twitch':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={cls}>
          <path d="M4.5 2 3 5.8V20h4.8v2.5h2.7l2.6-2.5h3.8L21 15V2z" fill="#9146FF" />
          <path d="M5.8 3.8h13.4v10.4l-3 3h-4l-2.7 2.6v-2.6H5.8z" fill="#fff" />
          <path d="M11 7.2h1.9v5H11zm5 0h1.9v5H16z" fill="#9146FF" />
        </svg>
      );
    case 'facebook':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={cls}>
          <circle cx="12" cy="12" r="10.5" fill="#1877F2" />
          <path d="M13.4 22.4v-7.1h2.4l.4-2.8h-2.8v-1.8c0-.8.3-1.4 1.4-1.4h1.5V6.8a19 19 0 0 0-2.2-.1c-2.2 0-3.6 1.3-3.6 3.7v2.1H8.1v2.8h2.4v7.1z" fill="#fff" />
        </svg>
      );
    case 'kick':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={cls}>
          <rect x="2" y="2" width="20" height="20" rx="4.5" fill="#53FC18" />
          <path d="M7 6h3.2v4.2h1.2V8.1h2.1V6h3.2v4.2h-2.1v1.1h-1.1v1.4h1.1v1.1h2.1V18h-3.2v-2.1h-2.1v-2.1h-1.2V18H7z" fill="#0b0e0f" />
        </svg>
      );
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={cls} fill="none" stroke="#E1306C" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="5.5" />
          <circle cx="12" cy="12" r="4.2" />
          <circle cx="17.4" cy="6.6" r="1" fill="#E1306C" stroke="none" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={cls}>
          <path
            d="M13.6 2.5h3.1a4.6 4.6 0 0 0 4.1 4.1v3.2a7.6 7.6 0 0 1-4.1-1.3v6.6a6.3 6.3 0 1 1-6.3-6.3h.6v3.3h-.6a3 3 0 1 0 3.2 3z"
            fill="currentColor"
          />
        </svg>
      );
  }
}

/** «● Ver en vivo»: la píldora roja que abre la transmisión en la página En vivo de la liga. */
export function LivePill({ stream, className }: { stream: Pick<LiveStream, 'id' | 'leagueId' | 'platform'>; className?: string }) {
  return (
    <Link
      to={liveHref(stream.leagueId, stream.id)}
      aria-label={`Ver en vivo en ${PLATFORM_LABEL[stream.platform]}`}
      className={cx(
        'inline-flex min-h-9 items-center gap-2 self-start rounded-full bg-danger px-3.5 text-[14px] font-bold text-on-danger shadow-sm transition active:scale-[0.97]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger',
        className,
      )}
    >
      <LiveDot />
      Ver en vivo
    </Link>
  );
}

/**
 * «Ver en vivo» de un partido o un evento: la píldora roja si tiene una transmisión activa (de las de la liga); si no,
 * nada.
 */
export function LiveWatchPill({ lid, matchId, eventId, className }: { lid: string; matchId?: string | null; eventId?: string | null; className?: string }) {
  const streams = useLeagueStreams(lid).data;
  const stream = streamFor(streams, { matchId, eventId });
  return stream ? <LivePill stream={stream} className={className} /> : null;
}
