/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): los premios del torneo (docs/premios-torneo.md)
 * en las ligas ficticias (demoLeague.ts). Contesta las RPC de src/lib/data/prizes.ts (set_tournament_prizes,
 * tournament_podium, deliver_tournament_prizes y close_tournament_prizes) y, para «Crear “Tercer lugar”» de «Elegir
 * premios», save_league_badge al crear un diseño (src/lib/data/leagueBadges.ts), con la misma forma y los mismos
 * errores que la base (20260929001200_premios_torneo.sql). Lee y pone encima las tablas que leen las pantallas:
 * tournament_prizes y tournament_prize_slots (solo de aquí), league_badges y league_badge_awards (las de abajo más las
 * de aquí).
 *
 * De fábrica:
 * - «Liga de Ejemplo» (boliche): la Copa de Ejemplo (hace 3 días) con el 1.er lugar de «Equipos (scratch)» ya
 *   entregado a Equipo Uno (Juan Pérez y Jugador Uno, hace 2 días) y el de «Individual (scratch)» por dar (va ganando
 *   Jugadora Dos). Los diseños «Buen compañero», «Campeones» y «Subcampeón» (los ids de «Buen compañero», «Campeones»,
 *   el lugar entregado y la insignia de Juan son los de demoBadges.ts); «Tercer lugar» falta, para probar «Crear».
 * - «Golf de Ejemplo»: la ronda cerrada de hace 6 días con el 1.er lugar ya entregado a Juan Pérez (el mejor neto) y el
 *   2.º por dar (Golfista Uno). El podio lo arma el teléfono (`telefono`), como en la base.
 * Se guarda en sessionStorage y se borra al salir de la demostración (forgetDemoPrizes). Todos los datos son ficticios.
 */
import { BackendError, type BackendErrorKind } from '@mm/lib/backend/types';
import { uuidv7 } from '@mm/lib/db/ids';
import { toEntry, toEvent, type EntryRow, type EventRow, type TeamRow } from '@mm/lib/data/rows';
import type { PrizeCategory, PrizePlace } from '@mm/lib/data/prizes';
import { toIsoDate } from '@mm/lib/format';
import type { BowlingEvent } from '@mm/lib/types';
import { todayIn } from '@mm/badges/rules/periods';
import { bowlingRules, defaultLabel, defaultPeriod, prizeCategories, type PrizeComp } from '@mm/prizes/catalog';
import { bowlingPodium } from '@mm/prizes/providers';
import { bowlingReady } from '@mm/prizes/ready';
import { templateDescription, templateName } from '@mm/components/badges/maker/templates';

type Row = Record<string, unknown>;
type Filter = { col: string; op: string; value: unknown };
/** Las filas de una tabla por debajo de esta capa, sin filtrar (null si no es de las ligas ficticias). */
type Read = (table: string) => Row[] | null;

const KEY = 'mm-demo-premios';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const EDIT_DAYS = 14;
const TZ = 'America/Santo_Domingo';

// Lo de las ligas ficticias (demoLeague.ts): la de boliche con sus jugadores, la Copa de Ejemplo y sus equipos, y la
// de golf con su ronda cerrada.
const DEMO_LEAGUE = '00000000-0000-7000-8000-00000000f001';
const ME_PLAYER = '00000000-0000-7000-8000-00000000f101';
const OTHER = '00000000-0000-7000-8000-00000000f102';
const COPA = '00000000-0000-7000-8000-00000000f0e6';
const TEAM_ONE = '00000000-0000-7000-8000-00000000f7a1';
const DEMO_GOLF = '00000000-0000-7000-8000-00000000a001';
const GOLF_PAST = '00000000-0000-7000-8000-00000000a0e2';
const G_ME = '00000000-0000-7000-8000-00000000a101';
// Los de demoBadges.ts: «Buen compañero», «Campeones», el lugar de la Copa y la insignia de Juan (su vitrina).
const BID = (n: number) => `00000000-0000-7000-8000-0000000b${String(n).padStart(4, '0')}`;
const COMPANION = BID(201);
const CHAMPIONS = BID(202);
const COPA_TEAM_SLOT = BID(301);
const JUAN_COPA_AWARD = BID(102);
// Los de aquí.
const PID = (n: number) => `00000000-0000-7000-8000-00000009${String(n).padStart(4, '0')}`;
const RUNNER_UP = PID(1);
const GOLF_CHAMPION = PID(2);
const GOLF_RUNNER_UP = PID(3);
const COPA_PRIZE = PID(10);
const COPA_IND_SLOT = PID(11);
const OTHER_COPA_AWARD = PID(12);
const GOLF_PRIZE = PID(20);
const GOLF_FIRST = PID(21);
const GOLF_SECOND = PID(22);
const JUAN_GOLF_AWARD = PID(23);

interface State {
  prizes: Row[];
  slots: Row[];
  awards: Row[];
  /** Los diseños de fábrica y los creados con «Crear “Tercer lugar”». */
  designs: Row[];
}

const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();
const dayAgo = (n: number) => toIsoDate(new Date(Date.now() - n * DAY));

const design = (uid: string, id: string, league: string, name: string, over: Row = {}): Row => ({
  id,
  league_id: league,
  template: null,
  name,
  description: '',
  shape: 'shield',
  palette: 'oro',
  color: null,
  icon: 'trophy',
  top_text: 'TORNEO',
  period_text: '',
  limit_kind: 'unica',
  by_team: false,
  status: 'activa',
  created_by: uid,
  created_at: iso(-30 * DAY),
  updated_at: iso(-30 * DAY),
  ...over,
});

const award = (id: string, league: string, badge: string, player: string, team: string | null, period: string, slot: string, at: string): Row => ({
  id,
  badge_id: badge,
  league_id: league,
  player_id: player,
  team_id: team,
  period,
  division: '',
  awarded_at: at,
  revoked_at: null,
  hidden: false,
  prize_slot_id: slot,
});

const prizeRow = (id: string, league: string, eventId: string, period: string): Row => ({
  id,
  league_id: league,
  scope: 'evento',
  event_id: eventId,
  golf_tournament_id: null,
  playoff_id: null,
  period,
  closed_at: null,
  closed_by: null,
  created_at: iso(-5 * DAY),
  updated_at: iso(-2 * DAY),
});

const slotRow = (id: string, prize: string, category: string, place: number, badge: string, over: Row = {}): Row => ({
  id,
  prize_id: prize,
  category,
  division: '',
  label: '',
  place,
  badge_id: badge,
  winners: [],
  verified: false,
  delivered_at: null,
  delivered_by: null,
  updated_at: iso(-5 * DAY),
  ...over,
});

function seed(uid: string): State {
  const copaPeriod = defaultPeriod(dayAgo(3));
  const golfPeriod = defaultPeriod(dayAgo(6));
  const copaAt = iso(-2 * DAY - HOUR);
  const golfAt = iso(-5 * DAY);
  return {
    designs: [
      design(uid, COMPANION, DEMO_LEAGUE, 'Buen compañero', {
        description: 'Siempre con la mejor actitud en la bolera.',
        shape: 'circle',
        palette: 'liga',
        icon: 'heart-handshake',
        top_text: '',
        limit_kind: 'abierta',
        created_at: iso(-40 * DAY),
      }),
      design(uid, CHAMPIONS, DEMO_LEAGUE, 'Campeones', { template: 'champion', description: 'Primer lugar de la Copa de Ejemplo.', top_text: 'CAMPEÓN' }),
      design(uid, RUNNER_UP, DEMO_LEAGUE, templateName('runner_up', 'bowling', true), {
        template: 'runner_up',
        description: templateDescription('runner_up', 'bowling', true),
        palette: 'plata',
        icon: 'medal',
      }),
      design(uid, GOLF_CHAMPION, DEMO_GOLF, templateName('champion', 'golf', true), { template: 'champion', description: templateDescription('champion', 'golf', true) }),
      design(uid, GOLF_RUNNER_UP, DEMO_GOLF, templateName('runner_up', 'golf', true), {
        template: 'runner_up',
        description: templateDescription('runner_up', 'golf', true),
        palette: 'plata',
        icon: 'medal',
      }),
    ],
    prizes: [prizeRow(COPA_PRIZE, DEMO_LEAGUE, COPA, copaPeriod), prizeRow(GOLF_PRIZE, DEMO_GOLF, GOLF_PAST, golfPeriod)],
    slots: [
      slotRow(COPA_TEAM_SLOT, COPA_PRIZE, 'equipo', 1, CHAMPIONS, {
        winners: [{ ref: `t:${TEAM_ONE}`, name: 'Equipo Uno', teamId: TEAM_ONE, players: [ME_PLAYER, OTHER] }],
        verified: true,
        delivered_at: copaAt,
        delivered_by: uid,
        updated_at: copaAt,
      }),
      slotRow(COPA_IND_SLOT, COPA_PRIZE, 'individual', 1, CHAMPIONS),
      slotRow(GOLF_FIRST, GOLF_PRIZE, 'individual', 1, GOLF_CHAMPION, {
        winners: [{ ref: `p:${G_ME}`, name: 'Juan Pérez', teamId: null, players: [G_ME] }],
        delivered_at: golfAt,
        delivered_by: uid,
        updated_at: golfAt,
      }),
      slotRow(GOLF_SECOND, GOLF_PRIZE, 'individual', 2, GOLF_RUNNER_UP),
    ],
    awards: [
      award(JUAN_COPA_AWARD, DEMO_LEAGUE, CHAMPIONS, ME_PLAYER, TEAM_ONE, copaPeriod, COPA_TEAM_SLOT, copaAt),
      award(OTHER_COPA_AWARD, DEMO_LEAGUE, CHAMPIONS, OTHER, TEAM_ONE, copaPeriod, COPA_TEAM_SLOT, copaAt),
      award(JUAN_GOLF_AWARD, DEMO_GOLF, GOLF_CHAMPION, G_ME, null, golfPeriod, GOLF_FIRST, golfAt),
    ],
  };
}

function load(uid: string): State {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    // sin sessionStorage: lo de fábrica
  }
  return seed(uid);
}

function save(s: State) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // sin sessionStorage: sigue en memoria hasta recargar
  }
}

export function forgetDemoPrizes() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

/** Como la base: `private.fail` (P0001 con el código) y `private.deny` (42501 'no_permitido'). */
const fail = (code: string, kind: BackendErrorKind = 'validation'): never => {
  throw new BackendError(code, kind, 'P0001');
};
const deny = (): never => {
  throw new BackendError('no_permitido', 'permission', '42501');
};

const matches = (r: Row, filters: readonly Filter[]) =>
  filters.every((f) => {
    if (f.op === 'eq') return r[f.col] === f.value;
    if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(r[f.col]);
    if (f.op === 'gt') return typeof r[f.col] === 'number' && (r[f.col] as number) > (f.value as number);
    return true;
  });

const TABLES = ['tournament_prizes', 'tournament_prize_slots', 'league_badges', 'league_badge_awards'];

/**
 * Las filas de `table` con lo de los premios y los filtros (eq, in y gt); null si la tabla no es de las de aquí.
 * `read`: la capa de abajo sin filtrar (league_badges y league_badge_awards suman lo de abajo y lo de aquí).
 */
export function demoPrizesSelect(uid: string, table: string, filters: readonly Filter[] = [], read: Read): Row[] | null {
  if (!TABLES.includes(table)) return null;
  const s = load(uid);
  const over = (mine: Row[]) => [...(read(table) ?? []).filter((r) => !mine.some((m) => m.id === r.id)), ...mine];
  const rows = table === 'tournament_prizes' ? s.prizes : table === 'tournament_prize_slots' ? s.slots : table === 'league_badges' ? over(s.designs) : over(s.awards);
  return rows.filter((r) => matches(r, filters)).map((r) => structuredClone(r));
}

// ---------- Ayudas ----------

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const keyOf = (s: { category?: unknown; division?: unknown; place?: unknown }) => `${String(s.category)}|${String(s.division ?? '')}|${Number(s.place)}`;
const winnersOf = (slot: Row): Row[] => (Array.isArray(slot.winners) ? (slot.winners as Row[]) : []);
const isDelivered = (slot: Row) => !!slot.delivered_at && winnersOf(slot).length > 0;
const editableUntil = (slot: Row) => (typeof slot.delivered_at === 'string' ? new Date(Date.parse(slot.delivered_at) + EDIT_DAYS * DAY).toISOString() : null);

/** Lo que la base sabe de una competencia: su clase, su evento, su liga y si ya terminó. */
interface Comp {
  kind: 'bowling' | 'golf' | 'swim';
  league: Row;
  event: Row;
  /** Para prizeCategories y defaultLabel. */
  def: Pick<PrizeComp, 'kind' | 'bowling'>;
}

function compOf(eventId: unknown, leagueId: unknown, read: (t: string) => Row[]): Comp | null {
  const league = read('leagues').find((l) => l.id === leagueId);
  const event = read('events').find((e) => e.id === eventId && e.league_id === leagueId);
  if (!league || !event) return null;
  if (league.sport === 'bowling' && event.type === 'torneo') {
    const ev = bowlingEvent(event, read);
    return { kind: 'bowling', league, event, def: { kind: 'bowling', bowling: bowlingRules(ev) } };
  }
  if (league.sport === 'golf') return { kind: 'golf', league, event, def: { kind: 'golf' } };
  if (league.sport === 'swimming' && event.type !== 'control') return { kind: 'swim', league, event, def: { kind: 'swim' } };
  return null;
}

const bowlingEvent = (event: Row, read: (t: string) => Row[]): BowlingEvent =>
  toEvent(event as unknown as EventRow, read('teams') as unknown as TeamRow[]) as unknown as BowlingEvent;

const bowlingEntries = (eventId: unknown, read: (t: string) => Row[]) =>
  read('entries')
    .filter((e) => e.event_id === eventId)
    .map((e) => toEntry(e as unknown as EntryRow));

/** Ya terminó (private.prize_finished): boliche desde su día con algo verificado; golf con la ronda cerrada; natación finalizada. */
function finished(comp: Comp, read: (t: string) => Row[]): boolean {
  if (comp.kind === 'bowling') {
    const ev = bowlingEvent(comp.event, read);
    return bowlingReady(ev, bowlingEntries(ev.id, read), todayIn(Date.now(), text(comp.league.tz) || TZ)).ready;
  }
  if (comp.kind === 'golf') return read('golf_rounds').some((r) => r.event_id === comp.event.id && r.status === 'cerrada');
  return read('swim_meets').some((m) => m.event_id === comp.event.id && !!m.finalized_at);
}

/** El podio del servidor de un lugar del boliche (lo mismo que cuenta el teléfono). */
function bowlingSlotPodium(comp: Comp, slot: Row, read: (t: string) => Row[]): { status: string; units: Row[] } {
  const ev = bowlingEvent(comp.event, read);
  const entries = bowlingEntries(ev.id, read);
  const ready = bowlingReady(ev, entries, todayIn(Date.now(), text(comp.league.tz) || TZ)).ready;
  const players = read('players');
  const nameOf = (id: string) => String(players.find((p) => p.id === id)?.name ?? '(jugador borrado)');
  const r = bowlingPodium(ev, entries, nameOf, { ready })({ category: slot.category as PrizeCategory, division: String(slot.division ?? ''), place: Number(slot.place) as PrizePlace });
  if (!r) return { status: 'sin_resultado', units: [] };
  // La base no manda el «1 158 pinos» (es solo del teléfono).
  return { status: r.status, units: r.units.map((u) => ({ ref: u.ref, name: u.name, teamId: u.teamId, players: u.players })) };
}

function prizeJson(s: State, p: Row): Row {
  return {
    id: p.id,
    leagueId: p.league_id,
    scope: p.scope,
    refId: p.event_id ?? p.golf_tournament_id ?? p.playoff_id,
    period: p.period,
    closedAt: p.closed_at,
    closedBy: p.closed_by,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    slots: s.slots
      .filter((x) => x.prize_id === p.id)
      .map((x) => ({
        id: x.id,
        category: x.category,
        division: x.division,
        label: x.label,
        place: x.place,
        badgeId: x.badge_id,
        title: '',
        winners: x.winners,
        verified: x.verified,
        deliveredAt: x.delivered_at,
        deliveredBy: x.delivered_by,
        editableUntil: editableUntil(x),
        updatedAt: x.updated_at,
      })),
  };
}

// ---------- Las RPC ----------

const FNS = ['set_tournament_prizes', 'tournament_podium', 'deliver_tournament_prizes', 'close_tournament_prizes', 'save_league_badge'];

/**
 * Las RPC de los premios del torneo en las ligas ficticias. `read`: todas las capas de abajo sin filtrar. undefined si
 * no es de aquí (otra liga, otra premiación o cambiar un diseño que ya existe): sigue demoBackend como siempre.
 */
export function prizesRpc(uid: string, fn: string, a: Record<string, unknown>, read: (table: string) => Row[]): unknown {
  if (!FNS.includes(fn)) return undefined;
  const s = load(uid);
  const member = (league: unknown) => read('memberships').find((m) => m.league_id === league && m.user_id === uid) ?? null;
  const leagueRow = (league: unknown) => read('leagues').find((l) => l.id === league) ?? null;
  const isOwner = (league: unknown) => leagueRow(league)?.owner_id === uid || member(league)?.role === 'owner';
  const isAdmin = (league: unknown) => isOwner(league) || member(league)?.role === 'admin';
  // private.can_badges: el dueño, los admins con 'admins' y los marcados con 'chosen'.
  const canBadges = (league: unknown) => {
    if (isOwner(league)) return true;
    const m = member(league);
    const policy = leagueRow(league)?.badge_makers ?? 'admins';
    return (policy === 'admins' && m?.role === 'admin') || (policy === 'chosen' && m?.badge_maker === true);
  };
  const designs = () => [...read('league_badges').filter((d) => !s.designs.some((x) => x.id === d.id)), ...s.designs];

  if (fn === 'save_league_badge') {
    if (!leagueRow(a.p_league) || designs().some((d) => d.id === a.p_id)) return undefined;
    if (!canBadges(a.p_league)) deny();
    const d = (a.p_design ?? {}) as Row;
    const name = text(d.name).slice(0, 40);
    if (!name) fail('invalido');
    const row: Row = {
      id: typeof a.p_id === 'string' ? a.p_id : uuidv7(),
      league_id: a.p_league,
      template: d.template ?? null,
      name,
      description: text(d.description),
      shape: text(d.shape) || 'shield',
      palette: text(d.palette) || 'oro',
      color: d.color ?? null,
      icon: text(d.icon) || 'trophy',
      top_text: text(d.top_text),
      period_text: text(d.period_text),
      limit_kind: text(d.limit_kind) || 'unica',
      by_team: d.by_team === true,
      status: 'activa',
      created_by: uid,
      created_at: iso(),
      updated_at: iso(),
    };
    s.designs.push(row);
    save(s);
    return row;
  }

  if (fn === 'set_tournament_prizes') {
    if (!leagueRow(a.p_league)) return undefined;
    if (!canBadges(a.p_league)) deny();
    if (a.p_scope !== 'evento') fail('invalido');
    const comp = compOf(a.p_ref, a.p_league, read) ?? fail('invalido');
    const input = Array.isArray(a.p_slots) ? (a.p_slots as Row[]) : fail('invalido');
    if (input.length > 24) fail('invalido');
    let prize = s.prizes.find((p) => p.league_id === a.p_league && p.event_id === a.p_ref) ?? null;
    const before = prize ? s.slots.filter((x) => x.prize_id === prize!.id) : [];
    const delivered = before.filter(isDelivered);
    // La cinta: la que tiene (o el mes de la competencia); no cambia si ya se entregó algo.
    let period = prize ? String(prize.period) : defaultPeriod(String(comp.event.date));
    if (a.p_period != null) {
      const next = text(a.p_period).toUpperCase();
      if ([...next].length > 10) fail('invalido');
      if (prize && next !== period && delivered.length) fail('ya_entregado');
      period = next;
    }
    const allowed = new Set(prizeCategories(comp.def).map((c) => `${c.category}|${c.division}`));
    const pool = designs();
    const seen = new Set<string>();
    for (const x of input) {
      const place = Number(x.place);
      if (!allowed.has(`${String(x.category)}|${String(x.division ?? '')}`) || !(place >= 1 && place <= 3)) fail('invalido');
      const key = keyOf(x);
      if (seen.has(key)) fail('invalido');
      seen.add(key);
      const d = pool.find((b) => b.id === x.badge_id && b.league_id === a.p_league) ?? fail('no_existe', 'not_found');
      const old = before.find((y) => keyOf(y) === key);
      // Un lugar entregado no cambia de insignia (primero se quita en «Entregar»).
      if (old && isDelivered(old) && old.badge_id !== x.badge_id) fail('ya_entregado');
      if (d.status !== 'activa' && !(old && old.badge_id === x.badge_id && isDelivered(old))) fail('no_activa');
    }
    // Un lugar entregado no se borra.
    if (delivered.some((y) => !seen.has(keyOf(y)))) fail('ya_entregado');
    if (!input.length) {
      if (prize) {
        s.prizes = s.prizes.filter((p) => p.id !== prize!.id);
        s.slots = s.slots.filter((x) => x.prize_id !== prize!.id);
        save(s);
      }
      return null;
    }
    if (!prize) {
      prize = prizeRow(uuidv7(), String(a.p_league), String(a.p_ref), period);
      prize.created_at = iso();
      s.prizes.push(prize);
    }
    prize.period = period;
    prize.updated_at = iso();
    const pid = String(prize.id);
    const kept: Row[] = [];
    for (const x of input) {
      const key = keyOf(x);
      const old = before.find((y) => keyOf(y) === key);
      const division = String(x.division ?? '');
      const label = x.label != null ? text(x.label).slice(0, 16) : old ? String(old.label) : defaultLabel(comp.def, division);
      kept.push(old ? { ...old, badge_id: x.badge_id, label, updated_at: iso() } : slotRow(uuidv7(), pid, String(x.category), Number(x.place), String(x.badge_id), { division, label, updated_at: iso() }));
    }
    s.slots = [...s.slots.filter((y) => y.prize_id !== pid), ...kept];
    save(s);
    return prizeJson(s, prize);
  }

  // Las demás: la premiación tiene que ser de aquí.
  const prize = s.prizes.find((p) => p.id === a.p_prize);
  if (!prize) return undefined;
  const lid = prize.league_id;
  if (!isAdmin(lid) && !canBadges(lid)) deny();
  const comp = compOf(prize.event_id, lid, read);
  const slots = s.slots.filter((x) => x.prize_id === prize.id);
  const holdersOf = (slotId: unknown) => s.awards.filter((x) => x.prize_slot_id === slotId && !x.revoked_at);

  if (fn === 'close_tournament_prizes') {
    if (!prize.closed_at) {
      prize.closed_at = iso();
      prize.closed_by = uid;
      save(s);
    }
    return null;
  }

  const done = comp ? finished(comp, read) : false;
  const serverPodium = (slot: Row) => (comp?.kind === 'bowling' ? bowlingSlotPodium(comp, slot, read) : { status: 'telefono', units: [] as Row[] });

  if (fn === 'tournament_podium') {
    return {
      prizeId: prize.id,
      kind: comp?.kind ?? null,
      verified: comp?.kind === 'bowling',
      slots: slots.map((x) => {
        const pod = comp ? serverPodium(x) : { status: 'sin_resultado', units: [] };
        return {
          slotId: x.id,
          verified: comp?.kind === 'bowling',
          status: pod.status,
          finished: done,
          units: pod.units,
          holders: holdersOf(x.id).map((h) => ({ awardId: h.id, playerId: h.player_id, teamId: h.team_id })),
          withdrawn: [],
        };
      }),
    };
  }

  // ---------- deliver_tournament_prizes ----------
  const list = Array.isArray(a.p_podium) ? (a.p_podium as Row[]) : fail('invalido');
  const owner = isOwner(lid);
  const players = read('players');
  const myPlayer = member(lid)?.player_id ?? null;
  const pool = designs();
  const out = { added: 0, revoked: 0, unchanged: 0, notified: 0 };
  const now = iso();
  for (const item of list) {
    const slot = slots.find((x) => x.id === item.slot_id) ?? fail('invalido');
    const expired = typeof slot.delivered_at === 'string' && Date.parse(slot.delivered_at) + EDIT_DAYS * DAY < Date.now();
    if (!owner && (prize.closed_at || expired)) fail('cerrado');
    const units = Array.isArray(item.units) ? (item.units as Row[]) : fail('invalido');
    if (units.length > 3) fail('invalido');
    const ids = (u: Row) => (Array.isArray(u.players) ? [...new Set((u.players as unknown[]).map(String))] : []);
    const current = holdersOf(slot.id);
    const desired = [...new Set(units.flatMap(ids))];
    const nameOfUnit = (u: Row): string => {
      const ref = String(u.ref ?? '');
      if (ref.startsWith('t:')) return String(read('teams').find((t) => t.id === ref.slice(2))?.name ?? '');
      if (ref.startsWith('p:')) return String(players.find((p) => p.id === ref.slice(2))?.name ?? '');
      if (ref.startsWith('c:')) return String(read('swim_clubs').find((c) => c.id === ref.slice(2))?.name ?? '');
      return '';
    };
    if (units.length) {
      if (!comp || !done) fail('sin_resultado');
      for (const u of units) {
        const n = ids(u).length;
        if (n < 1 || n > 30 || ids(u).some((id) => !players.some((p) => p.id === id && p.league_id === lid))) fail('invalido');
      }
      if (comp!.kind === 'bowling') {
        // Orden verificado: las mismas unidades del servidor y, de cada una, solo jugadores suyos (se puede desmarcar).
        const pod = serverPodium(slot);
        const refs = (xs: Row[]) => xs.map((u) => String(u.ref)).sort();
        if (pod.status !== 'listo' || refs(pod.units).join(',') !== refs(units).join(',')) fail('podio_cambio');
        for (const u of units) {
          const srv = pod.units.find((x) => x.ref === u.ref);
          const allowedIds = ((srv?.players ?? []) as Row[]).map((p) => String(p.id));
          if (ids(u).some((id) => !allowedIds.includes(id))) fail('podio_cambio');
        }
      } else {
        // Sin orden verificado: `p:<id>` solo con ese jugador, y quien entrega no se lo da a sí mismo.
        for (const u of units) {
          const ref = String(u.ref ?? '');
          if (ref.startsWith('p:') && (ids(u).length !== 1 || ids(u)[0] !== ref.slice(2))) fail('invalido');
          if (comp!.kind === 'golf' && ids(u).some((id) => !read('golf_cards').some((c) => c.event_id === comp!.event.id && c.player_id === id))) fail('invalido');
        }
        if (myPlayer && desired.includes(String(myPlayer)) && !current.some((h) => h.player_id === myPlayer)) fail('a_si_mismo');
      }
      const toAdd = desired.filter((id) => !current.some((h) => h.player_id === id));
      const d = pool.find((b) => b.id === slot.badge_id);
      if (toAdd.length && d?.status !== 'activa') fail('no_activa');
    }
    // Aplicar: a quien sobra se le quita, a quien falta se le da.
    for (const h of current) {
      if (desired.includes(String(h.player_id))) continue;
      h.revoked_at = now;
      out.revoked++;
    }
    for (const u of units) {
      const ref = String(u.ref ?? '');
      for (const id of ids(u)) {
        if (current.some((h) => h.player_id === id)) {
          out.unchanged++;
          continue;
        }
        s.awards.push(award(uuidv7(), String(lid), String(slot.badge_id), id, ref.startsWith('t:') ? ref.slice(2) : null, String(prize.period), String(slot.id), now));
        out.added++;
        // El aviso le llega a quien tiene cuenta (y nunca en una liga con menores).
        if (a.p_notify !== false && !comp?.league.has_minors && players.some((p) => p.id === id && p.user_id)) out.notified++;
      }
    }
    slot.winners = units.map((u) => ({ ref: u.ref, name: nameOfUnit(u), teamId: String(u.ref ?? '').startsWith('t:') ? String(u.ref).slice(2) : null, players: ids(u) }));
    slot.verified = comp?.kind === 'bowling';
    slot.updated_at = now;
    if (units.length && !slot.delivered_at) {
      slot.delivered_at = now;
      slot.delivered_by = uid;
    }
  }
  prize.updated_at = now;
  save(s);
  return { ...out, prize: prizeJson(s, prize) };
}
