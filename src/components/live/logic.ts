/**
 * Lo de las transmisiones en vivo (docs/equipos-y-en-vivo.md §2) sin React ni navegador, para la web (LiveParts.tsx,
 * StartStreamSheet.tsx, LiveStreamPage.tsx) y la app del teléfono: quién puede transmitir, el título y la línea de una
 * transmisión, su link en la app, cuál se ve en la página En vivo, lo que se dice del link al pegarlo y los textos de la
 * página.
 */
import type { LeagueCtx } from '../../lib/league';
import { streamProblem, type LiveStream } from '../../lib/data/streams';
import { PLATFORM_LABEL, embedUrl, streamPlatform, type StreamPlatform } from '../../lib/streams';
import { leagueSport } from '../../sports/registry';

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

/** La que se ve en la página En vivo (`?s=<id>`, si no la primera) y las otras de la liga. */
export function pickStream<T extends Pick<LiveStream, 'id'>>(streams: readonly T[], wanted: string | null | undefined): { current: T | null; others: T[] } {
  const current = streams.find((s) => s.id === wanted) ?? streams[0] ?? null;
  return { current, others: streams.filter((s) => s.id !== current?.id) };
}

/**
 * Lo que dice debajo del link mientras se escribe o se pega: la plataforma que se reconoce (y si se ve dentro de la
 * app o se abre afuera), el problema si no se puede usar, o qué links sirven. `checked`: ya tocó «Empezar» (sin link,
 * se le pide).
 */
export function linkHint(url: string, checked: boolean): { tone: 'ok' | 'error' | 'muted'; text: string; platform: StreamPlatform | null } {
  const platform = streamPlatform(url);
  if (platform) {
    const inside = embedUrl(url, 'matchmate.app') !== null;
    return { tone: 'ok', platform, text: inside ? `${PLATFORM_LABEL[platform]} · Se ve dentro de MatchMate` : `${PLATFORM_LABEL[platform]} · Se abre en ${PLATFORM_LABEL[platform]}` };
  }
  const problem = url.trim() || checked ? streamProblem({ url, title: null }) : null;
  if (problem) return { tone: 'error', platform: null, text: problem };
  return { tone: 'muted', platform: null, text: 'De YouTube, Twitch, Facebook, Kick, Instagram o TikTok.' };
}

/** El título de entrada (el del partido o el evento) ya lo pone la base como `label`: solo se manda si lo cambió. */
export const ownStreamTitle = (title: string, defaultTitle: string | null | undefined): string | null =>
  title.trim() && title.trim() !== (defaultTitle ?? '').trim() ? title.trim() : null;

// ---------- Los textos de la página En vivo y de «Transmitir en vivo» ----------

/** «Liga» o «torneo», para los textos. */
type Kind = { kind?: string | null };

/** Debajo de «No hay nada en vivo ahora». */
export const noLiveText = (league: Kind & { liveEnabled?: boolean | null }): string => {
  const torneo = league.kind === 'torneo';
  return league.liveEnabled
    ? `Cuando ${torneo ? 'el torneo' : 'la liga'} transmita un partido, se ve aquí.`
    : `${torneo ? 'Este torneo' : 'Esta liga'} no tiene activadas las transmisiones en vivo.`;
};

/** El link al admin de una liga sin las transmisiones activadas. */
export const activateLiveText = (league: Kind): string => `Actívalas en Ajustes ${league.kind === 'torneo' ? 'del torneo' : 'de la liga'}`;

/** Lo que acompaña al link al compartir una transmisión. */
export const streamShareText = (s: Pick<LiveStream, 'title' | 'label'>): string => `🔴 En vivo: ${streamTitle(s)}`;

/** La plataforma no deja ver la transmisión dentro de otra app (Instagram, TikTok). */
export const notEmbeddableText = (platform: StreamPlatform): string => `${PLATFORM_LABEL[platform]} no deja ver la transmisión dentro de otra app: se abre allá.`;

/** Antes de terminar una transmisión. */
export const endStreamConfirm = (platform: StreamPlatform) => ({
  title: '¿Terminar la transmisión?',
  message: `Deja de salir en la liga y en Hoy. El video sigue en ${PLATFORM_LABEL[platform]}.`,
  confirmText: 'Terminar',
  danger: true,
});

/** «Ya estás en vivo»: lo de abajo. */
export const startedText = (s: Pick<LiveStream, 'title' | 'label'>): string =>
  `«${streamTitle(s)}» sale arriba en la liga y avisamos a los miembros y seguidores. Comparte el link para que lo vean más.`;

/** Si no se pudo compartir desde «Ya estás en vivo». */
export const START_SHARE_ERROR = 'No se pudo compartir. Copia el link desde la página En vivo.';
