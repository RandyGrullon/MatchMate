/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): los equipos del boliche de las ligas ficticias
 * (demoLeague.ts). Organizar › Equipos (los equipos fijos: dos en «Liga de Ejemplo») y Torneo › Equipos. Contesta las
 * RPC de src/lib/data/bowlingTeams.ts (set_bowling_teams, save_bowling_team, delete_bowling_team, apply_league_teams),
 * de src/lib/data/teams.ts (add_team, rename_team, apply_teams, delete_team) y update_entry con `team_id`, con la misma
 * forma que la base (20261013000100_boliche_equipos_practicas_bolas.sql y 20260926000500_rpc.sql), y pone lo cambiado
 * encima de las filas de la liga: `teams`, `team_players` y el `team_id` de `entries`. Se guarda en sessionStorage y se
 * borra al salir de la demostración (forgetDemoTeams). Todos los datos son ficticios.
 */
import { BackendError, type BackendErrorKind } from '@mm/lib/backend/types';
import { uuidv7 } from '@mm/lib/db/ids';
import { DEMO_LEAGUE } from './demoLeague';

type Row = Record<string, unknown>;
type Filter = { col: string; op: string; value: unknown };
/** Las filas de una tabla de las ligas ficticias, sin filtrar (null si no es de ellas). */
type Read = (table: string) => Row[] | null;

const KEY = 'mm-demo-equipos';

// Los jugadores de «Liga de Ejemplo» (demoLeague.ts): Juan Pérez (la cuenta de prueba), Jugador Uno y Jugadora Dos.
const ME_PLAYER = '00000000-0000-7000-8000-00000000f101';
const OTHER = '00000000-0000-7000-8000-00000000f102';
const THIRD = '00000000-0000-7000-8000-00000000f103';
const FIXED = (n: number) => `00000000-0000-7000-8000-00000000f7b${n}`;

/** Los dos equipos fijos de fábrica (distintos de los del «Torneo de Ejemplo», así «Usar los equipos fijos» cambia algo). */
const SEED_TEAMS: Row[] = [
  { id: FIXED(1), league_id: DEMO_LEAGUE, event_id: null, name: 'Equipo Azul', sort_order: 1, color: '#2563eb', season_id: null, league_team_id: null },
  { id: FIXED(2), league_id: DEMO_LEAGUE, event_id: null, name: 'Equipo Rojo', sort_order: 2, color: '#dc2626', season_id: null, league_team_id: null },
];
const SEED_ROSTER: Row[] = [
  { team_id: FIXED(1), player_id: ME_PLAYER, league_id: DEMO_LEAGUE },
  { team_id: FIXED(1), player_id: THIRD, league_id: DEMO_LEAGUE },
  { team_id: FIXED(2), player_id: OTHER, league_id: DEMO_LEAGUE },
];

interface State {
  /** Los equipos de las ligas de boliche ficticias como quedaron (fijos y de los torneos); null = los de fábrica. */
  teams: Row[] | null;
  /** Las plantillas de esos equipos como quedaron; null = las de fábrica. */
  roster: Row[] | null;
  /** El equipo de cada inscripción que cambió (id de la inscripción → team_id). */
  entryTeam: Record<string, string | null>;
}

const empty = (): State => ({ teams: null, roster: null, entryTeam: {} });

function load(): State {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return { ...empty(), ...(JSON.parse(raw) as Partial<State>) };
  } catch {
    // sin sessionStorage: nada cambiado
  }
  return empty();
}

function save(s: State) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // sin sessionStorage: sigue en memoria hasta recargar
  }
}

export function forgetDemoTeams() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

const fail = (message: string, kind: BackendErrorKind, code: string | null = null): never => {
  throw new BackendError(message, kind, code);
};
const invalid = () => fail('invalido', 'validation', 'invalido');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** private.clean_name: de 1 a 60 letras (sin los espacios de los lados). */
function cleanName(v: unknown): string {
  const name = typeof v === 'string' ? v.trim() : '';
  if (name.length < 1 || name.length > 60) invalid();
  return name;
}

/** private.bowling_team_color: '#rrggbb' en minúsculas, o null (vacío). */
function cleanColor(v: unknown): string | null {
  const color = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (!color) return null;
  if (!/^#[0-9a-f]{6}$/.test(color)) invalid();
  return color;
}

const matches = (r: Row, filters: readonly Filter[]) =>
  filters.every((f) => {
    if (f.op === 'eq') return r[f.col] === f.value;
    if (f.op === 'is') return f.value === null ? r[f.col] == null : r[f.col] === f.value;
    if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(r[f.col]);
    if (f.op === 'gt') return typeof r[f.col] === 'number' && (r[f.col] as number) > (f.value as number);
    return true;
  });

/** Las ligas de boliche ficticias (las de los equipos de aquí). */
const bowlingLeagues = (read: Read) => new Set((read('leagues') ?? []).filter((l) => l.sport === 'bowling').map((l) => l.id));

/** Los equipos de las ligas de boliche, como quedaron. */
function teamsOf(s: State, read: Read, leagues: Set<unknown>): Row[] {
  if (s.teams) return s.teams;
  return [...(read('teams') ?? []).filter((t) => leagues.has(t.league_id)), ...SEED_TEAMS.filter((t) => leagues.has(t.league_id))];
}

/** Las plantillas de los equipos de las ligas de boliche, como quedaron. */
function rosterOf(s: State, read: Read, leagues: Set<unknown>): Row[] {
  if (s.roster) return s.roster;
  return [...(read('team_players') ?? []).filter((r) => leagues.has(r.league_id)), ...SEED_ROSTER.filter((r) => leagues.has(r.league_id))];
}

/** El equipo de una inscripción con lo cambiado aquí. */
const teamNowOf = (s: State, e: Row): unknown => {
  const id = String(e.id);
  return id in s.entryTeam ? s.entryTeam[id] : e.team_id;
};

/** Una tabla de la liga ficticia con lo cambiado encima (sin filtrar); null si no es de las que tocan los equipos. */
function overlay(s: State, table: string, read: Read): Row[] | null {
  if (table !== 'teams' && table !== 'team_players' && table !== 'entries') return null;
  const leagues = bowlingLeagues(read);
  if (table === 'teams') return [...(read('teams') ?? []).filter((t) => !leagues.has(t.league_id)), ...teamsOf(s, read, leagues)];
  if (table === 'team_players') return [...(read('team_players') ?? []).filter((r) => !leagues.has(r.league_id)), ...rosterOf(s, read, leagues)];
  const base = read('entries');
  if (!base) return null;
  // Un equipo que ya no está deja a los suyos sin equipo (on delete set null).
  const ids = new Set(teamsOf(s, read, leagues).map((t) => t.id));
  return base.map((e) => {
    const team = teamNowOf(s, e);
    const kept = team != null && leagues.has(e.league_id) && !ids.has(team) ? null : team;
    return kept === e.team_id ? e : { ...e, team_id: kept };
  });
}

/**
 * Las filas de `table` con lo cambiado en los equipos y los filtros (eq, is, in y gt); null si la tabla no es de las
 * que tocan los equipos (teams, team_players, entries). `read`: las filas de la liga ficticia sin filtrar.
 */
export function demoTeamsSelect(table: string, filters: readonly Filter[] = [], read: Read): Row[] | null {
  const rows = overlay(load(), table, read);
  return rows ? rows.filter((r) => matches(r, filters)) : null;
}

const FNS = ['set_bowling_teams', 'save_bowling_team', 'delete_bowling_team', 'apply_league_teams', 'add_team', 'rename_team', 'apply_teams', 'delete_team', 'update_entry'];

/**
 * Las RPC de los equipos del boliche en las ligas ficticias. `read`: las filas de una tabla como están ahora (con lo
 * cambiado en Jugadores; sin filtrar). undefined si no es de los equipos o lo pedido no es de una liga de boliche
 * ficticia (sigue demoBackend como siempre).
 */
export function teamsRpc(uid: string, fn: string, a: Record<string, unknown>, read: (table: string) => Row[]): unknown {
  if (!FNS.includes(fn)) return undefined;
  const s = load();
  const leagues = bowlingLeagues(read);
  let teams = [...teamsOf(s, read, leagues)].map((t) => ({ ...t }));
  let roster = [...rosterOf(s, read, leagues)];
  const entries = overlay(s, 'entries', read) ?? [];
  const events = read('events');
  const isAdmin = (league: unknown) => read('memberships').some((m) => m.league_id === league && m.user_id === uid && (m.role === 'owner' || m.role === 'admin'));
  const requireAdmin = (league: unknown) => {
    if (!isAdmin(league)) fail('no_permitido', 'permission', 'no_permitido');
  };
  const leaguePlayers = (league: unknown) => new Set(read('players').filter((p) => p.league_id === league).map((p) => p.id));
  const fixedOf = (league: unknown) =>
    teams.filter((t) => t.league_id === league && t.event_id == null).sort((x, y) => Number(x.sort_order) - Number(y.sort_order) || String(x.id).localeCompare(String(y.id)));
  const maxOrder = (rows: Row[]) => rows.reduce((m, t) => Math.max(m, Number(t.sort_order) || 0), 0);
  /** Un equipo que se va: su plantilla con él, sus copias sin el vínculo y los suyos sin equipo. */
  const dropTeams = (ids: ReadonlySet<unknown>) => {
    if (!ids.size) return;
    teams = teams.filter((t) => !ids.has(t.id)).map((t) => (ids.has(t.league_team_id) ? { ...t, league_team_id: null } : t));
    roster = roster.filter((r) => !ids.has(r.team_id));
    for (const e of entries) if (ids.has(teamNowOf(s, e))) s.entryTeam[e.id as string] = null;
  };
  const commit = <T,>(out: T): T => {
    s.teams = teams;
    s.roster = roster;
    save(s);
    return out;
  };
  /** Los jugadores de una plantilla: ids distintos y de la liga. */
  const playerList = (v: unknown, league: unknown): string[] => {
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !UUID.test(x))) invalid();
    const list = v as string[];
    const inLeague = leaguePlayers(league);
    if (new Set(list).size !== list.length || list.some((x) => !inLeague.has(x))) invalid();
    return list;
  };

  // ---------- Los equipos fijos de la liga ----------

  if (fn === 'set_bowling_teams') {
    const lid = a.p_league;
    if (!leagues.has(lid)) return undefined;
    requireAdmin(lid);
    const list = a.p_teams;
    if (!Array.isArray(list) || list.length > 40) invalid();
    const drafts = (list as unknown[]).map((g) => {
      if (!g || typeof g !== 'object' || Array.isArray(g)) invalid();
      const d = g as Row;
      if (d.id != null && typeof d.id !== 'string') invalid();
      const id = d.id ? (UUID.test(d.id as string) ? (d.id as string) : invalid()) : uuidv7();
      return { id, name: cleanName(d.name), color: cleanColor(d.color), players: d.players == null ? [] : playerList(d.players, lid) };
    });
    const ids = drafts.map((d) => d.id);
    const all = drafts.flatMap((d) => d.players);
    if (new Set(ids).size !== ids.length || new Set(all).size !== all.length) invalid();
    if (teams.some((t) => ids.includes(t.id as string) && (t.league_id !== lid || t.event_id != null))) invalid();
    dropTeams(new Set(fixedOf(lid).filter((t) => !ids.includes(t.id as string)).map((t) => t.id)));
    drafts.forEach((d, i) => {
      const t = teams.find((x) => x.id === d.id);
      if (t) Object.assign(t, { name: d.name, color: d.color, sort_order: i + 1 });
      else teams.push({ id: d.id, league_id: lid, event_id: null, name: d.name, sort_order: i + 1, color: d.color, season_id: null, league_team_id: null });
    });
    const fixed = new Set(ids);
    roster = [...roster.filter((r) => !fixed.has(r.team_id as string)), ...drafts.flatMap((d) => d.players.map((p) => ({ team_id: d.id, player_id: p, league_id: lid })))];
    return commit(ids);
  }

  if (fn === 'save_bowling_team') {
    const lid = a.p_league;
    if (!leagues.has(lid)) return undefined;
    requireAdmin(lid);
    const name = cleanName(a.p_name);
    const color = cleanColor(a.p_color);
    const players = a.p_players == null ? null : playerList(a.p_players, lid);
    const id = typeof a.p_id === 'string' && a.p_id ? a.p_id : uuidv7();
    const t = teams.find((x) => x.id === id);
    if (t && (t.league_id !== lid || t.event_id != null)) invalid();
    if (!t) {
      const fixed = fixedOf(lid);
      if (fixed.length >= 40) invalid();
      teams.push({ id, league_id: lid, event_id: null, name, sort_order: maxOrder(fixed) + 1, color, season_id: null, league_team_id: null });
    } else Object.assign(t, { name, color });
    if (players) {
      // La plantilla completa; quien estaba en otro equipo fijo de la liga sale de ese.
      const fixed = new Set(fixedOf(lid).map((x) => x.id));
      roster = roster.filter((r) => (r.team_id === id ? players.includes(r.player_id as string) : !(fixed.has(r.team_id) && players.includes(r.player_id as string))));
      for (const p of players) if (!roster.some((r) => r.team_id === id && r.player_id === p)) roster.push({ team_id: id, player_id: p, league_id: lid });
    }
    return commit(id);
  }

  if (fn === 'delete_bowling_team') {
    const t = teams.find((x) => x.id === a.p_team && x.event_id == null);
    if (!t) return undefined;
    requireAdmin(t.league_id);
    dropTeams(new Set([t.id]));
    return commit(null);
  }

  if (fn === 'apply_league_teams') {
    const ev = events.find((e) => e.id === a.p_event);
    if (!ev || !leagues.has(ev.league_id)) return undefined;
    requireAdmin(ev.league_id);
    if (ev.type !== 'torneo') invalid();
    const lid = ev.league_id;
    const fixed = fixedOf(lid);
    const fixedTeamOf = (player: unknown) => fixed.find((f) => roster.some((r) => r.team_id === f.id && r.player_id === player)) ?? null;
    // Las copias toman el nombre y el color de hoy de su equipo fijo.
    for (const c of teams) {
      const f = c.event_id === ev.id && c.league_team_id ? fixed.find((x) => x.id === c.league_team_id) : undefined;
      if (f) Object.assign(c, { name: f.name, color: f.color });
    }
    const mine = entries.filter((e) => e.event_id === ev.id);
    const copyOf = (f: Row) => {
      const found = teams.find((c) => c.event_id === ev.id && c.league_team_id === f.id);
      if (found) return found;
      const copy: Row = { id: uuidv7(), league_id: lid, event_id: ev.id, name: f.name, sort_order: maxOrder(teams.filter((c) => c.event_id === ev.id)) + 1, color: f.color, season_id: null, league_team_id: f.id };
      teams.push(copy);
      return copy;
    };
    // Las copias que hacen falta, en el orden de los equipos fijos.
    for (const f of fixed) if (mine.some((e) => fixedTeamOf(e.player_id)?.id === f.id)) copyOf(f);
    const teamNow = new Map(mine.map((e) => [e.id, e.team_id ?? null]));
    for (const e of mine) {
      const f = fixedTeamOf(e.player_id);
      const team = f ? (copyOf(f).id as string) : null;
      const cur = teamNow.get(e.id);
      if (cur !== team && (team != null || teams.some((c) => c.id === cur && c.league_team_id))) {
        s.entryTeam[e.id as string] = team;
        teamNow.set(e.id, team);
      }
    }
    // Las copias que quedan vacías se borran.
    const used = new Set(teamNow.values());
    teams = teams.filter((c) => !(c.event_id === ev.id && c.league_team_id && !used.has(c.id as string)));
    return commit([...teamNow.values()].filter((t) => t != null).length);
  }

  // ---------- Los equipos de un torneo ----------

  if (fn === 'add_team') {
    const ev = events.find((e) => e.id === a.p_event);
    if (!ev || !leagues.has(ev.league_id)) return undefined;
    requireAdmin(ev.league_id);
    const id = typeof a.p_id === 'string' && a.p_id ? a.p_id : uuidv7();
    if (teams.some((t) => t.id === id)) fail('duplicado', 'conflict', 'duplicado');
    teams.push({ id, league_id: ev.league_id, event_id: ev.id, name: cleanName(a.p_name), sort_order: maxOrder(teams.filter((t) => t.event_id === ev.id)) + 1, color: null, season_id: null, league_team_id: null });
    return commit(id);
  }

  if (fn === 'rename_team' || fn === 'delete_team') {
    const t = teams.find((x) => x.id === a.p_team);
    if (!t) return undefined;
    requireAdmin(t.league_id);
    if (fn === 'rename_team') t.name = cleanName(a.p_name);
    else dropTeams(new Set([t.id]));
    return commit(null);
  }

  if (fn === 'apply_teams') {
    const ev = events.find((e) => e.id === a.p_event);
    if (!ev || !leagues.has(ev.league_id)) return undefined;
    requireAdmin(ev.league_id);
    if (!Array.isArray(a.p_groups)) invalid();
    const base = maxOrder(teams.filter((t) => t.event_id === ev.id));
    const used: string[] = [];
    (a.p_groups as Row[]).forEach((g, i) => {
      const name = cleanName(g?.name);
      const given = typeof g?.team_id === 'string' && g.team_id ? g.team_id : null;
      let team: string;
      if (given) {
        const t = teams.find((x) => x.id === given && x.event_id === ev.id) ?? invalid();
        t.name = name;
        team = given;
      } else {
        team = uuidv7();
        teams.push({ id: team, league_id: ev.league_id, event_id: ev.id, name, sort_order: base + i + 1, color: null, season_id: null, league_team_id: null });
      }
      used.push(team);
      const ids = Array.isArray(g?.entry_ids) ? (g.entry_ids as unknown[]) : [];
      for (const e of entries) if (e.event_id === ev.id && ids.includes(e.id)) s.entryTeam[e.id as string] = team;
    });
    dropTeams(new Set(teams.filter((t) => t.event_id === ev.id && !used.includes(t.id as string)).map((t) => t.id)));
    return commit(used);
  }

  // update_entry: aquí solo el equipo de la inscripción (Torneo › Equipos); lo demás sigue como siempre.
  const patch = (a.p_patch ?? {}) as Row;
  if (!('team_id' in patch)) return undefined;
  const entry = entries.find((e) => e.id === a.p_entry);
  if (!entry || !leagues.has(entry.league_id)) return undefined;
  requireAdmin(entry.league_id);
  const team = patch.team_id ?? null;
  if (team !== null && !teams.some((t) => t.id === team && t.event_id === entry.event_id)) invalid();
  s.entryTeam[entry.id as string] = team as string | null;
  return commit(null);
}
