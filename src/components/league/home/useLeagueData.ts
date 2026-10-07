import { useMemo, useRef } from 'react';
import { useAuth } from '../../../lib/auth';
import { rankingRows, seasonEvents, type RankingRow } from '../../../lib/bowlingSeason';
import { useEntriesOfEvents, useEvents, usePlayers, useSubmissions, type LeagueFeed } from '../../../lib/data';
import { pendingTotal, useLeaguePending } from '../../../lib/data/organizer';
import { useLeagueSeasons } from '../../../lib/data/seasons';
import { useLeagueCtx } from '../../../lib/league';
import { currentSeason } from '../../../lib/seasons';
import type { BowlingEvent } from '../../../lib/types';
import { usePendingClaimCount } from '../../claims/data';
import { useNotifications } from '../../Notifications';
import { pendingLine } from '../../organizer/logic';

/**
 * Lo que espera por quien organiza la liga (el número de la fila «Organizas esta liga» en Pro, el mismo que tenía la
 * pestaña Admin): los envíos por aprobar (boliche) y los reclamos en vivo, más los partidos reclamados o sin resultado,
 * las listas de espera y las notas nuevas del buzón, con su línea («3 por aprobar · 1 nota nueva en el buzón»).
 * `lid` = la liga, solo si organiza y se va a mostrar (null: no lee nada).
 */
export function useLeagueToDo(lid: string | null, bowling: boolean): { count: number; line: string } {
  const { user } = useAuth();
  const pending = useSubmissions(lid && bowling ? lid : undefined, 'pendiente').data.length;
  const newNotes = useNotifications().feeds.find((f) => f.lid === lid)?.suggestions.length ?? 0;
  const claims = usePendingClaimCount(lid, user?.uid);
  const p = useLeaguePending(lid).data;
  if (!lid) return { count: 0, line: '' };
  const count = pendingTotal(p, { submissions: bowling ? pending : undefined, claims }) + newNotes;
  const notes = newNotes ? `${newNotes} ${newNotes === 1 ? 'nota nueva' : 'notas nuevas'} en el buzón` : '';
  return { count, line: [pendingLine(p), notes].filter(Boolean).join(' · ') };
}

/**
 * Lo de la liga para su pantalla: los eventos (de todos: también los ve quien mira una liga pública) y, para un
 * miembro, lo suyo en la liga (LeagueFeed de la campana: su jugador, sus envíos). `feed` junta las dos cosas para el
 * calendario y la tarjeta «En juego ahora»; null mientras no hay eventos.
 */
export function useLeagueFeed(): { feed: LeagueFeed; events: BowlingEvent[]; loading: boolean; error: Error | null; mine: boolean } {
  const { lid, myPlayerId, isAdmin, isScorer } = useLeagueCtx();
  const { user } = useAuth();
  const events = useEvents(lid);
  const bell = useNotifications().feeds.find((f) => f.lid === lid) ?? null;
  const feed = useMemo<LeagueFeed>(
    () => ({
      lid,
      uid: user?.uid ?? '',
      playerId: myPlayerId,
      isAdmin,
      isScorer,
      mySubs: [],
      pending: [],
      reactions: [],
      comments: [],
      suggestions: [],
      ...bell,
      // Todos los eventos de la liga (la campana lee solo desde ayer, y solo los de sus ligas).
      events: events.data,
    }),
    [lid, user?.uid, myPlayerId, isAdmin, isScorer, bell, events.data],
  );
  return { feed, events: events.data, loading: events.loading && !events.data.length, error: events.error, mine: !!bell };
}

/**
 * La tabla de la temporada de ahora (como la Tabla: solo juegos aprobados), para los 3 de arriba. Si cambian los eventos
 * de la temporada (se creó la próxima práctica), sigue la tabla de antes mientras se leen los juegos: no parpadea.
 */
export function useSeasonTable(): { rows: RankingRow[]; loading: boolean } {
  const { lid } = useLeagueCtx();
  const events = useEvents(lid);
  const players = usePlayers(lid);
  const seasons = useLeagueSeasons(lid);
  const season = currentSeason(seasons.data);
  const ids = useMemo(() => seasonEvents(events.data, season).map((e) => e.id), [events.data, season]);
  const entries = useEntriesOfEvents(lid, ids);
  const rows = useMemo(() => {
    const inSeason = new Set(ids);
    return rankingRows(
      entries.data.filter((e) => inSeason.has(e.eventId)),
      players.data,
    );
  }, [ids, entries.data, players.data]);
  const loading = events.loading || players.loading || (seasons.loading && !seasons.data.length) || (entries.loading && !entries.data.length);
  const last = useRef<RankingRow[]>([]);
  if (rows.length || !loading) last.current = rows;
  return { rows: rows.length || !loading ? rows : last.current, loading };
}
