import { useEffect } from 'react';
import { uuidv7 } from '../../../lib/db/ids';
import type { Backend, RealtimeMessage } from '../../../lib/backend/types';
import { watchTopic } from '../../../lib/db/query';
import { backend, getUserId, invalidate, rpc, select, useLive, type Live } from '../../../lib/data/client';
import { tags } from '../../../lib/data/keys';

/**
 * Sanciones del comité del fútbol y la sala (tabla football_sanctions de 20260927000900_futbol.sql): partidos de
 * suspensión que pone el admin a un jugador de un equipo, a partir de un partido de ese equipo. Se suman a las
 * automáticas que calcula el teléfono con las actas (season.ts). Lecturas por la caché (se ven sin señal con lo
 * último que llegó); escrituras del admin con señal. Tiempo real: `league:<liga>` avisa 'football_sanctions'
 * ({op, ids}); sin canal, se consulta cada 15–20 s.
 */

export interface FootballSanction {
  id: string;
  leagueId: string;
  teamId: string;
  playerId: string;
  /** Partido desde el que cuenta. */
  matchId: string;
  matches: number;
  note: string;
  createdBy: string | null;
  /** Cuándo (ISO del servidor). No se llama createdAt para que la caché no la vuelva `Stamp`. */
  at: string | null;
}

interface SanctionRow {
  id: string;
  league_id: string;
  team_id: string;
  player_id: string;
  match_id: string;
  matches: number;
  note: string | null;
  created_by: string | null;
  created_at: string | null;
}

export const toSanction = (r: SanctionRow): FootballSanction => ({
  id: r.id,
  leagueId: r.league_id,
  teamId: r.team_id,
  playerId: r.player_id,
  matchId: r.match_id,
  matches: Number(r.matches) || 1,
  note: r.note ?? '',
  createdBy: r.created_by ?? null,
  at: typeof r.created_at === 'string' ? r.created_at : null,
});

export const sanctionKeys = { league: (lid: string) => `fbsanctions:${lid}` };
export const sanctionTag = (lid: string) => `fbsanctions:${lid}`;

// ---------- Tiempo real ----------

export function handleSanctionMessage(topic: string, msg: RealtimeMessage) {
  if (!topic.startsWith('league:') || msg.event !== 'football_sanctions') return;
  invalidate(sanctionTag(topic.slice('league:'.length)));
}

const watching = new Map<string, { count: number; stop: () => void }>();

function acquire(topic: string): () => void {
  let w = watching.get(topic);
  if (!w) {
    let b: Backend | null = null;
    try {
      b = backend();
    } catch {
      // sin backend: solo consultas
    }
    const lid = topic.slice('league:'.length);
    const watch = watchTopic(b, topic, (msg) => handleSanctionMessage(topic, msg), {
      onPoll: () => invalidate(sanctionTag(lid)),
      pollOnly: !getUserId(),
    });
    w = { count: 0, stop: () => watch.stop() };
    watching.set(topic, w);
  }
  const mine = w;
  mine.count++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--mine.count <= 0) {
      mine.stop();
      if (watching.get(topic) === mine) watching.delete(topic);
    }
  };
}

// ---------- Lecturas ----------

export async function fetchFootballSanctions(lid: string): Promise<FootballSanction[]> {
  const rows = await select<SanctionRow>({
    table: 'football_sanctions',
    columns: 'id,league_id,team_id,player_id,match_id,matches,note,created_by,created_at',
    filters: [{ col: 'league_id', op: 'eq', value: lid }],
  });
  return rows.map(toSanction).sort((a, b) => (a.at ?? '').localeCompare(b.at ?? '') || a.id.localeCompare(b.id));
}

/** Sanciones del comité de la liga (en vivo mientras la pantalla está abierta). */
export function useFootballSanctions(lid: string | undefined): Live<FootballSanction[]> {
  useEffect(() => {
    if (!lid) return;
    return acquire(`league:${lid}`);
  }, [lid]);
  return useLive<FootballSanction[]>(lid ? sanctionKeys.league(lid) : null, lid ? { kind: 'footballSanctions', lid } : null, () => fetchFootballSanctions(lid!), {
    initial: [],
    tags: lid ? [tags.league(lid), sanctionTag(lid)] : [],
  });
}

// ---------- Escrituras (admin, con señal) ----------

export interface SanctionDraft {
  /** Para cambiar una que ya existe (si no, se genera). */
  id?: string;
  matchId: string;
  teamId: string;
  playerId: string;
  matches: number;
  note?: string;
}

/** Admin: pone o cambia una sanción del comité. Devuelve el id. */
export async function saveFootballSanction(lid: string, s: SanctionDraft): Promise<string> {
  const id = s.id ?? uuidv7();
  const out = await rpc<string>('save_football_sanction', {
    p_id: id,
    p_match: s.matchId,
    p_team: s.teamId,
    p_player: s.playerId,
    p_matches: s.matches,
    p_note: s.note?.trim() || null,
  });
  invalidate(sanctionTag(lid));
  return out ?? id;
}

/** Admin: quita una sanción del comité (false si ya no estaba). */
export async function deleteFootballSanction(lid: string, id: string): Promise<boolean> {
  const out = await rpc<boolean>('delete_football_sanction', { p_id: id });
  invalidate(sanctionTag(lid));
  return !!out;
}
