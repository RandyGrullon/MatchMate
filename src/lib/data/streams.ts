import { useMemo } from 'react';
import { BackendError } from '../backend/types';
import { normalizeStreamUrl, type StreamPlatform } from '../streams';
import { getUserId, invalidate, queryClient, remember, rpc, type Live } from './client';
import { tags } from './keys';

/**
 * Transmisiones en vivo (docs/equipos-y-en-vivo.md §2, 20261011000100_equipos_en_vivo.sql): una liga las activa, sus
 * admins y anotadores ponen el link de un partido, un evento o de la liga, y se ve arriba en la liga y en Hoy.
 *
 * RPC: set_league_live, start_stream, end_stream, league_streams, live_now.
 */

export interface LiveStream {
  id: string;
  leagueId: string;
  leagueName: string;
  sport: string;
  matchId: string | null;
  eventId: string | null;
  url: string;
  platform: StreamPlatform;
  title: string | null;
  /** «Tigres vs Leones» o el nombre del evento (null si es de la liga). */
  label: string | null;
  startedAt: string;
  startedBy: { id: string; name: string };
  canEnd: boolean;
}

export const STREAM_TITLE_MAX = 80;

export const streamTags = {
  all: 'streams',
  league: (lid: string) => `streams:${lid}`,
  now: 'streams:now',
};

const keys = {
  league: (lid: string) => `streams:league:${lid}`,
  now: 'streams:now',
};

/** Las transmisiones activas de una liga (también sin sesión si la liga es pública). */
export function useLeagueStreams(lid: string | null | undefined): Live<LiveStream[]> {
  const key = lid ? keys.league(lid) : null;
  if (key) remember(key, { kind: 'streams', lid: lid! });
  const st = queryClient.useQuery<LiveStream[]>(key, () => rpc<LiveStream[]>('league_streams', { p_league: lid }), {
    initial: [],
    tags: lid ? [streamTags.all, streamTags.league(lid), tags.league(lid)] : [],
    staleMs: 30_000,
    pollMs: 60_000,
    persist: false,
  });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

/** En vivo ahora (Hoy): las de mis ligas y de las ligas y equipos que sigo. */
export function useLiveNow(): Live<LiveStream[]> {
  const key = getUserId() ? keys.now : null;
  if (key) remember(key, { kind: 'streams', status: 'now' });
  const st = queryClient.useQuery<LiveStream[]>(key, () => rpc<LiveStream[]>('live_now', { p_limit: 10 }), {
    initial: [],
    tags: [streamTags.all, streamTags.now],
    staleMs: 30_000,
    pollMs: 60_000,
    persist: false,
  });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

/** La transmisión de un partido o evento entre las activas de la liga (null si no tiene). */
export const streamFor = (streams: readonly LiveStream[], target: { matchId?: string | null; eventId?: string | null }) =>
  streams.find((s) => (target.matchId && s.matchId === target.matchId) || (target.eventId && s.eventId === target.eventId)) ?? null;

export interface NewStream {
  leagueId: string;
  url: string;
  title?: string | null;
  matchId?: string | null;
  eventId?: string | null;
}

/** Qué le falta para empezar (null = lista). */
export function streamProblem(input: Pick<NewStream, 'url' | 'title'>): string | null {
  if (!input.url.trim()) return 'Pega el link de la transmisión.';
  if (!normalizeStreamUrl(input.url)) return 'Usa un link de YouTube, Twitch, Facebook, Kick, Instagram o TikTok.';
  if ((input.title ?? '').trim().length > STREAM_TITLE_MAX) return `Usa ${STREAM_TITLE_MAX} caracteres o menos en el título.`;
  return null;
}

/** Empieza una transmisión (admins y anotadores, con la liga en vivo activada). Avisa a miembros y seguidores. */
export async function startStream(input: NewStream): Promise<LiveStream> {
  if (!getUserId()) throw new BackendError('Entra a tu cuenta.', 'auth', 'session_not_found');
  const problem = streamProblem(input);
  if (problem) throw new BackendError(problem, 'validation', 'invalido');
  try {
    return await rpc<LiveStream>('start_stream', {
      p_league: input.leagueId,
      p_url: normalizeStreamUrl(input.url),
      p_title: input.title?.trim() || null,
      p_match: input.matchId ?? null,
      p_event: input.eventId ?? null,
    });
  } finally {
    invalidate(streamTags.league(input.leagueId), streamTags.now);
  }
}

/** Termina una transmisión. */
export async function endStream(stream: Pick<LiveStream, 'id' | 'leagueId'>): Promise<void> {
  try {
    await rpc('end_stream', { p_stream: stream.id });
  } finally {
    invalidate(streamTags.league(stream.leagueId), streamTags.now);
  }
}

/** Activa o apaga las transmisiones en vivo de la liga (admins). */
export async function setLeagueLive(lid: string, enabled: boolean): Promise<void> {
  await rpc('set_league_live', { p_league: lid, p_enabled: enabled });
  invalidate(tags.league(lid), tags.leagues, streamTags.league(lid));
}

/** El link para compartir la transmisión de la liga. */
export const streamShareUrl = (lid: string, origin = typeof location === 'undefined' ? 'https://matchmate-oficial.vercel.app' : location.origin) =>
  `${origin}/l/${lid}/vivo`;

/** El mensaje para un error al transmitir. */
export function streamErrorText(e: unknown): string {
  const kind = e && typeof e === 'object' ? (e as { kind?: unknown }).kind : undefined;
  const message = e instanceof Error ? e.message : '';
  if (kind === 'rate_limited') return 'Ya se empezaron muchas transmisiones hoy en esta liga. Prueba mañana.';
  if (kind === 'permission') return 'Solo los admins y anotadores de la liga pueden transmitir.';
  if (kind === 'network') return 'Sin conexión. Revisa tu señal y vuelve a intentar.';
  if (/^cerrado/.test(message)) return 'La liga no tiene activadas las transmisiones en vivo.';
  if (/^duplicado/.test(message) || kind === 'conflict') return 'Ese partido ya tiene una transmisión en vivo.';
  if (/^limite/.test(message)) return 'La liga ya tiene 5 transmisiones en vivo. Termina una primero.';
  if (kind === 'validation' && message && !/^[a-z_]+(:|$)/.test(message)) return message;
  if (/^invalido/.test(message)) return 'Ese link no se puede usar. Usa uno de YouTube, Twitch, Facebook, Kick, Instagram o TikTok.';
  return 'No se pudo. Inténtalo otra vez.';
}
