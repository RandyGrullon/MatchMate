/**
 * Paridad: los números de cada jugador tienen que salir idénticos en BowlingX y en MatchMate. Se calculan con
 * src/lib/stats.ts (lo mismo que usan las pantallas) de los dos lados y se comparan:
 *
 * - por jugador: juegos, pinos, promedio (truncado), promedio que se usa (fijo o calculado), mejor juego,
 *   mejor serie y juegos pendientes (PlayerPage, PlayersPage);
 * - ranking de promedio por liga y temporada (RankingPage, mínimo MIN_RANK_GAMES juegos);
 * - clasificación de cada evento con la regla oficial (StandingsTab): individual y por equipos;
 * - lo global de cada cuenta (GlobalStats): todas sus ligas juntas.
 *
 * Del lado de BowlingX los ids se pasan a uuid (ids.ts) antes de calcular, así se comparan uno a uno.
 */
import { effectiveAverage, entryLine, individualValue, MIN_RANK_GAMES, playerStats, rank, teamLines } from '../../src/lib/stats';
import type { BowlingEvent, Entry, Player } from '../../src/lib/types';
import { entryUuid, eventUuid, photoUuid, playerUuid, teamUuid } from './ids';
import type { FsBackup, MigrationPlan, Row } from './types';

/** Una liga ya en la forma de la app (ids de MatchMate). */
export interface AppLeague {
  id: string;
  players: Player[];
  events: BowlingEvent[];
  entries: Entry[];
}

/** Lo que se compara. Las claves son uuid de MatchMate. */
export interface Snapshot {
  players: Record<string, unknown>;
  seasons: Record<string, unknown>;
  events: Record<string, unknown>;
  global: Record<string, unknown>;
}

export interface ParityDiff {
  path: string;
  bowlingx: unknown;
  matchmate: unknown;
}

export interface ParityResult {
  ok: boolean;
  checked: { leagues: number; players: number; events: number; seasons: number; accounts: number };
  /** Diferencias (hasta `limit`); `total` las cuenta todas. */
  diffs: ParityDiff[];
  total: number;
  /** uuid → nombre (liga, jugador, evento, equipo, correo) para que el reporte se pueda leer. */
  labels: Record<string, string>;
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Lista → objeto por su id (ordenado), para que la diferencia diga de quién es. Repetidos: `id#2`. */
function keyed<T>(list: T[], key: (x: T) => string, strip: (x: T) => unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const x of [...list].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))) {
    let k = key(x);
    for (let i = 2; k in out; i++) k = `${key(x)}#${i}`;
    out[k] = strip(x);
  }
  return out;
}

/** Los números de un conjunto de ligas (y de las cuentas: `links` = cuenta → sus jugadores). */
export function snapshot(leagues: AppLeague[], links: Map<string, { leagueId: string; playerId: string }[]>): Snapshot {
  const out: Snapshot = { players: {}, seasons: {}, events: {}, global: {} };
  const eventsOf = new Map<string, Map<string, BowlingEvent>>();
  for (const l of leagues) {
    const events = new Map(l.events.map((e) => [e.id, e]));
    eventsOf.set(l.id, events);
    const names = new Map(l.players.map((p) => [p.id, p.name]));

    // Jugadores.
    for (const p of [...l.players].sort(byId)) {
      const stats = playerStats(l.entries.filter((e) => e.playerId === p.id));
      out.players[`${l.id}/${p.id}`] = { name: p.name, ...stats, average: effectiveAverage(p, stats) };
    }

    // Ranking de promedio por temporada (año).
    const years = [...new Set(l.events.map((e) => e.date.slice(0, 4)))].sort();
    for (const year of years) {
      const ids = new Set(l.events.filter((e) => e.date.startsWith(year)).map((e) => e.id));
      const byPlayer = new Map<string, Entry[]>();
      for (const e of l.entries) if (ids.has(e.eventId)) byPlayer.set(e.playerId, [...(byPlayer.get(e.playerId) ?? []), e]);
      const rows = [...byPlayer.entries()]
        .filter(([id]) => names.has(id))
        .map(([id, list]) => {
          const s = playerStats(list);
          const events = list.filter((e) => e.scores?.some((sc, i) => sc != null && e.photos?.[i])).length;
          return { playerId: id, average: s.autoAverage ?? 0, games: s.games, high: s.high, series: s.highSeries, events };
        })
        .filter((r) => r.games > 0);
      const pos = new Map(rank(rows.filter((r) => r.games >= MIN_RANK_GAMES), (r) => r.average).map((r) => [r.row.playerId, r.pos]));
      out.seasons[`${l.id}/${year}`] = keyed(
        rows,
        (r) => r.playerId,
        ({ playerId, ...r }) => ({ ...r, pos: pos.get(playerId) ?? null }),
      );
    }

    // Clasificación oficial de cada evento.
    for (const ev of [...l.events].sort(byId)) {
      const lines = l.entries.filter((e) => e.eventId === ev.id).map((e) => entryLine(e, ev)).filter((x) => x.games > 0);
      const value = individualValue(ev);
      const individual = keyed(
        rank(lines, value),
        (r) => r.row.entry.playerId,
        (r) => ({ pos: r.pos, value: value(r.row), scratch: r.row.scratch, total: r.row.total, games: r.row.games, hcp: r.row.hcp }),
      );
      let teams: Record<string, unknown> = {};
      if (ev.type === 'torneo') {
        const teamHcp = ev.hcpPercent > 0 && (ev.teamRankBy ?? 'scratch') === 'hcp';
        teams = keyed(
          rank(
            teamLines(ev, lines).filter((t) => t.members.length),
            (t) => (teamHcp ? t.total : t.scratch),
          ),
          (r) => r.row.teamId,
          (r) => ({ name: r.row.name, pos: r.pos, scratch: r.row.scratch, total: r.row.total, perGame: r.row.perGame }),
        );
      }
      out.events[`${l.id}/${ev.id}`] = { date: ev.date, games: ev.games, individual, teams };
    }
  }

  // Global de cada cuenta: sus jugadores de todas las ligas (solo juegos de eventos que existen).
  for (const [user, list] of [...links.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const entries = list.flatMap(({ leagueId, playerId }) => {
      const l = leagues.find((x) => x.id === leagueId);
      const events = eventsOf.get(leagueId);
      return l && events ? l.entries.filter((e) => e.playerId === playerId && events.has(e.eventId)) : [];
    });
    out.global[user] = playerStats(entries);
  }
  return out;
}

// ---------- Lado BowlingX ----------

/** Las ligas del respaldo que se migraron, con los ids ya en uuid (los datos tal cual, sin las correcciones). */
export function fromBackup(
  backup: FsBackup,
  plan: Pick<MigrationPlan, 'map'>,
): { leagues: AppLeague[]; links: Map<string, { leagueId: string; playerId: string }[]>; labels: Record<string, string> } {
  const leagues: AppLeague[] = [];
  const links = new Map<string, { leagueId: string; playerId: string }[]>();
  const labels: Record<string, string> = {};
  for (const u of backup.users) if (plan.map.users[u.id] && u.email) labels[plan.map.users[u.id]] = u.email;
  for (const l of backup.leagues) {
    const lid = plan.map.leagues[l.id];
    if (!lid) continue;
    labels[lid] = `«${l.name ?? l.id}»`;
    for (const p of l.players ?? []) labels[playerUuid(l.id, p.id)] = `${p.name ?? p.id}`;
    for (const e of l.events ?? []) {
      labels[eventUuid(l.id, e.id)] = `${e.name || e.type || 'evento'} ${e.date ?? ''}`.trim();
      for (const [tid, t] of Object.entries(e.teams ?? {})) labels[teamUuid(l.id, e.id, tid)] = `equipo «${t?.name ?? tid}»`;
    }
    // Participaciones de jugadores borrados: el uuid del jugador no tiene nombre.
    for (const x of l.entries ?? []) labels[playerUuid(l.id, x.playerId)] ??= `jugador borrado ${x.playerId}`;
    const players = (l.players ?? []).map((p) => ({ id: playerUuid(l.id, p.id), name: String(p.name ?? '').trim(), averageOverride: p.averageOverride ?? null }) as Player);
    const events = (l.events ?? []).map(
      (e) =>
        ({
          id: eventUuid(l.id, e.id),
          type: e.type,
          name: e.name ?? '',
          date: String(e.date ?? ''),
          games: e.games ?? 3,
          hcpBase: e.hcpBase ?? 0,
          hcpPercent: e.hcpPercent ?? 0,
          teams: Object.fromEntries(
            Object.entries(e.teams ?? {})
              .filter(([, t]) => t && typeof t === 'object')
              .map(([tid, t], i) => [teamUuid(l.id, e.id, tid), { name: String(t!.name ?? ''), order: t!.order ?? i + 1 }]),
          ),
          playerCount: e.playerCount ?? 0,
          individualRankBy: e.individualRankBy ?? undefined,
          teamRankBy: e.teamRankBy ?? undefined,
          categoryCuts: e.categoryCuts ?? undefined,
          teamSize: e.teamSize ?? undefined,
        }) as BowlingEvent,
    );
    const entries = (l.entries ?? []).map(
      (x) =>
        ({
          id: entryUuid(l.id, x.eventId, x.playerId),
          eventId: eventUuid(l.id, x.eventId),
          playerId: playerUuid(l.id, x.playerId),
          teamId: x.teamId ? teamUuid(l.id, x.eventId, x.teamId) : null,
          average: x.average ?? 0,
          handicapOverride: x.handicapOverride ?? null,
          scores: x.scores ?? [],
          photos: (x.photos ?? []).map((m) => (m == null || m === 'importado' || m === 'sin-foto' || typeof m !== 'string' || m.includes('/') ? m : photoUuid(l.id, m))),
        }) as Entry,
    );
    leagues.push({ id: lid, players, events, entries });
    // Como GlobalStats: las membresías con jugador.
    const playerIds = new Set((l.players ?? []).map((p) => p.id));
    for (const m of l.members ?? []) {
      const user = m?.uid ? plan.map.users[m.uid] : undefined;
      if (!user || !m.playerId || !playerIds.has(m.playerId)) continue;
      links.set(user, [...(links.get(user) ?? []), { leagueId: lid, playerId: playerUuid(l.id, m.playerId) }]);
    }
  }
  return { leagues, links, labels };
}

// ---------- Lado MatchMate ----------

/** Filas leídas de la base (como las da PostgREST: fechas en texto, arreglos y jsonb tal cual). */
export interface TargetRows {
  players: Row[];
  events: Row[];
  teams: Row[];
  entries: Row[];
}

/** Las ligas `leagueIds` en la forma de la app, como las arma src/lib/data/rows.ts. */
export function fromTarget(data: TargetRows, leagueIds: string[]): { leagues: AppLeague[]; links: Map<string, { leagueId: string; playerId: string }[]> } {
  const leagues: AppLeague[] = [];
  const links = new Map<string, { leagueId: string; playerId: string }[]>();
  const of = (rows: Row[], lid: string) => rows.filter((r) => r.league_id === lid);
  for (const lid of leagueIds) {
    const players = of(data.players, lid).map((r) => ({ id: r.id, name: r.name, averageOverride: r.average_override ?? null, uid: r.user_id ?? null }) as Player);
    const teams = of(data.teams, lid);
    const events = of(data.events, lid).map((r) => {
      const teamMap: Record<string, { name: string; order: number }> = {};
      for (const t of teams) if (t.event_id === r.id) teamMap[t.id as string] = { name: t.name as string, order: t.sort_order as number };
      const cuts = r.category_cuts as number[] | null;
      return {
        id: r.id,
        type: r.type,
        name: r.name ?? '',
        date: String(r.date).slice(0, 10),
        games: r.games,
        hcpBase: r.hcp_base,
        hcpPercent: r.hcp_percent,
        teams: teamMap,
        playerCount: r.player_count ?? 0,
        individualRankBy: r.individual_rank_by ?? undefined,
        teamRankBy: r.team_rank_by ?? undefined,
        categoryCuts: cuts && cuts.length === 3 ? cuts : undefined,
        teamSize: r.team_size,
      } as BowlingEvent;
    });
    const entries = of(data.entries, lid).map(
      (r) =>
        ({
          id: r.id,
          eventId: r.event_id,
          playerId: r.player_id,
          teamId: r.team_id ?? null,
          average: r.average ?? 0,
          handicapOverride: r.handicap_override ?? null,
          scores: r.scores ?? [],
          photos: r.photos ?? [],
        }) as Entry,
    );
    leagues.push({ id: lid, players, events, entries });
    for (const p of players) {
      if (!p.uid) continue;
      links.set(p.uid, [...(links.get(p.uid) ?? []), { leagueId: lid, playerId: p.id }]);
    }
  }
  return { leagues, links };
}

// ---------- Comparación ----------

function walk(path: string, a: unknown, b: unknown, out: ParityDiff[]): void {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  const isObj = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (isObj(a) && isObj(b)) {
    const keys = [...new Set([...Object.keys(a as object), ...Object.keys(b as object)])].sort();
    for (const k of keys) walk(path ? `${path}.${k}` : k, (a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], out);
    return;
  }
  // Listas del mismo largo (clasificaciones): se dice qué fila cambió.
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.some(isObj)) {
    a.forEach((x, i) => walk(`${path}[${i}]`, x, b[i], out));
    return;
  }
  out.push({ path, bowlingx: a, matchmate: b });
}

/** Compara BowlingX (el respaldo) con lo que quedó en MatchMate. */
export function compareParity(backup: FsBackup, plan: Pick<MigrationPlan, 'map'>, target: TargetRows, limit = 200): ParityResult {
  const src = fromBackup(backup, plan);
  const dst = fromTarget(target, Object.values(plan.map.leagues));
  const a = snapshot(src.leagues, src.links);
  const b = snapshot(dst.leagues, dst.links);
  const diffs: ParityDiff[] = [];
  walk('', a, b, diffs);
  return {
    ok: diffs.length === 0,
    checked: {
      leagues: src.leagues.length,
      players: Object.keys(a.players).length,
      events: Object.keys(a.events).length,
      seasons: Object.keys(a.seasons).length,
      accounts: Object.keys(a.global).length,
    },
    diffs: diffs.slice(0, limit),
    total: diffs.length,
    labels: src.labels,
  };
}
