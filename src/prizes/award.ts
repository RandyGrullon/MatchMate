/**
 * «Entregar premios» sin pantalla (docs/premios-torneo.md §6.3): de la vista previa del servidor (`tournament_podium`)
 * y del podio del teléfono (donde el servidor no calcula) a lo que se ve en cada lugar, lo que se marca por defecto, lo
 * que se manda a `deliver_tournament_prizes` (estado deseado) y cómo se cuenta al final. Funciones puras con pruebas en
 * award.test.ts; las usan todos los deportes.
 */
import { MAX_PODIUM_UNITS, MAX_UNIT_PLAYERS, type DeliverResult, type DeliverSlot, type PodiumUnit, type PrizeSlot, type TournamentPodium, type TournamentPrize } from '../lib/data/prizes';
import { PLACE_LABEL, prizeTitle, type PrizeComp } from './catalog';
import type { PodiumProvider } from './providers';

export type PlanStatus = 'listo' | 'vacio' | 'sin_resultado' | 'empate_multiple';

/** Un lugar en «Entregar premios». */
export interface SlotPlan {
  slot: PrizeSlot;
  /** «Individual (handicap)». */
  title: string;
  status: PlanStatus;
  /** El orden lo comprobó el servidor (boliche, cuadros, relámpago, playoffs); si no, lo armó el teléfono. */
  verified: boolean;
  /** La competencia (o esa final) ya terminó. */
  finished: boolean;
  /** Empatados en ese lugar (hasta 3 se entregan). */
  units: PodiumUnit[];
  /** Jugadores que lo tienen hoy. */
  holders: string[];
  /** A quién se lo quitaron a mano: sale desmarcado. */
  withdrawn: string[];
  /** Quien entrega está en un podio que armó el teléfono y no lo tenía: lo entrega otro admin o el dueño. */
  selfBlocked: boolean;
  /** Cerrado para quien entrega (premios cerrados o pasaron los 14 días): solo el dueño lo cambia. */
  locked: boolean;
  /** Una unidad pasa del tope de jugadores de la base (100): no se puede entregar. */
  tooMany: boolean;
  /**
   * El lugar sale de un cuadro (cuadro de raqueta, relámpago, playoff): dos unidades en el 3.º son los dos
   * semifinalistas, no un empate.
   */
  bracket: boolean;
  /** Se puede dar ahora. */
  deliverable: boolean;
}

/** Lo marcado en un lugar: si se entrega y, por unidad (ref), qué jugadores. */
export interface SlotPick {
  on: boolean;
  players: Record<string, string[]>;
}

export type Picks = Record<string, SlotPick>;

const unique = <T>(xs: readonly T[]): T[] => [...new Set(xs)];

/** Los podios que salen de un cuadro (ahí varias unidades en un lugar no son un empate). */
const BRACKET_KINDS: readonly string[] = ['racket_tourney', 'team_ko', 'playoff'];

/**
 * Los jugadores que se marcan por defecto en una unidad (docs/premios-torneo.md §5.3): con alineaciones (alguien con
 * `played`), solo quienes jugaron; sin alineaciones (o donde no aplica: boliche, golf…), todos.
 */
export function defaultPlayers(unit: Pick<PodiumUnit, 'players'>): string[] {
  const lineup = unit.players.some((p) => p.played === true);
  return unit.players.filter((p) => !lineup || p.played === true).map((p) => p.id);
}

/**
 * Cada lugar de la premiación con su podio: el del servidor, o el del teléfono (`phone`) en los lugares 'telefono'.
 * `myPlayers`: los jugadores de quien entrega (en un podio sin orden verificado no se lo da a sí mismo). `owner`: el
 * dueño corrige siempre; los demás, mientras la premiación esté abierta y el lugar tenga menos de 14 días (a `now`).
 */
export function planDelivery(
  prize: Pick<TournamentPrize, 'slots' | 'closedAt'>,
  podium: TournamentPodium,
  opts: {
    comp: Pick<PrizeComp, 'kind' | 'bowling' | 'racket'>;
    phone?: PodiumProvider | null;
    myPlayers?: readonly string[];
    owner?: boolean;
    now?: number;
  },
): SlotPlan[] {
  const bySlot = new Map(podium.slots.map((s) => [s.slotId, s] as const));
  const mine = new Set(opts.myPlayers ?? []);
  const now = opts.now ?? Date.now();
  const lockedSlot = (slot: PrizeSlot) => {
    if (opts.owner) return false;
    if (prize.closedAt) return true;
    const until = slot.editableUntil ? Date.parse(slot.editableUntil) : NaN;
    return Number.isFinite(until) && until < now;
  };
  return prize.slots.map((slot) => {
    const srv = bySlot.get(slot.id);
    const verified = srv ? srv.verified : podium.verified;
    let status: PlanStatus = 'sin_resultado';
    let units: PodiumUnit[] = [];
    if (srv?.status === 'telefono') {
      const r = opts.phone?.(slot) ?? null;
      if (r) {
        status = r.status;
        units = r.units;
      }
    } else if (srv) {
      status = srv.status as PlanStatus;
      units = srv.units;
    }
    const finished = !!srv?.finished;
    const holders = unique((srv?.holders ?? []).map((h) => h.playerId));
    const selfBlocked = !verified && units.some((u) => u.players.some((p) => mine.has(p.id) && !holders.includes(p.id)));
    const locked = lockedSlot(slot);
    const tooMany = units.some((u) => u.players.length > MAX_UNIT_PLAYERS);
    return {
      slot,
      title: slot.title || prizeTitle(slot, opts.comp),
      status,
      verified,
      finished,
      units,
      holders,
      withdrawn: srv?.withdrawn ?? [],
      selfBlocked,
      locked,
      tooMany,
      bracket: BRACKET_KINDS.includes(opts.comp.kind),
      deliverable: status === 'listo' && finished && !selfBlocked && !locked && !tooMany && units.length > 0 && units.length <= MAX_PODIUM_UNITS,
    };
  });
}

/**
 * Lo marcado al abrir: quien ya lo tiene, y los jugadores por defecto de cada unidad (`defaultPlayers`: con
 * alineaciones, quienes jugaron; si no, todos) menos a quien el dueño le quitó el premio a mano. El lugar va prendido
 * si se puede dar y cada unidad tiene al menos un jugador marcado.
 */
export function initialPicks(plans: readonly SlotPlan[]): Picks {
  const out: Picks = {};
  for (const p of plans) {
    const players: Record<string, string[]> = {};
    for (const u of p.units) {
      const byDefault = defaultPlayers(u);
      players[u.ref] = u.players.map((x) => x.id).filter((id) => p.holders.includes(id) || (byDefault.includes(id) && !p.withdrawn.includes(id)));
    }
    out[p.slot.id] = { on: p.deliverable && p.units.every((u) => (players[u.ref]?.length ?? 0) > 0), players };
  }
  return out;
}

/** Marca o desmarca un jugador de una unidad (siempre queda al menos uno: si no, se apaga el lugar). */
export function togglePlayer(picks: Picks, slotId: string, ref: string, playerId: string): Picks {
  const pick = picks[slotId];
  if (!pick) return picks;
  const list = pick.players[ref] ?? [];
  const next = list.includes(playerId) ? list.filter((id) => id !== playerId) : [...list, playerId];
  if (next.length === 0) return picks;
  return { ...picks, [slotId]: { ...pick, players: { ...pick.players, [ref]: next } } };
}

/** Prende o apaga un lugar (al prenderlo, las unidades vacías vuelven a sus jugadores por defecto). */
export function toggleSlot(picks: Picks, plan: SlotPlan, on: boolean): Picks {
  const pick = picks[plan.slot.id] ?? { on: false, players: {} };
  const players = { ...pick.players };
  if (on) for (const u of plan.units) if (!(players[u.ref]?.length)) players[u.ref] = defaultPlayers(u);
  return { ...picks, [plan.slot.id]: { on, players } };
}

/**
 * Lo que se manda (estado deseado, solo los lugares que se tocan): un lugar prendido va con sus unidades y los
 * jugadores marcados; uno que quedó sin nadie ('vacio') o que se apagó, con `units: []` si alguien lo tenía (se le
 * quita). Los demás no van: no cambian.
 */
export function payloadOf(plans: readonly SlotPlan[], picks: Picks): DeliverSlot[] {
  const out: DeliverSlot[] = [];
  for (const p of plans) {
    const pick = picks[p.slot.id];
    if (p.deliverable && pick?.on) {
      const units = p.units.map((u) => ({ ref: u.ref, players: (pick.players[u.ref] ?? []).filter((id) => u.players.some((x) => x.id === id)) }));
      if (units.every((u) => u.players.length > 0)) out.push({ slotId: p.slot.id, units });
    } else if (p.holders.length > 0 && !p.selfBlocked && !p.locked && (p.status === 'vacio' || (p.deliverable && pick && !pick.on))) {
      out.push({ slotId: p.slot.id, units: [] });
    }
  }
  return out;
}

/** Cómo queda un lugar: quiénes lo tienen antes y después, a quién se le da y a quién se le quita. */
export interface SlotChange {
  before: string[];
  after: string[];
  add: string[];
  remove: string[];
}

export function changeOf(plan: SlotPlan, payload: readonly DeliverSlot[]): SlotChange {
  const sent = payload.find((s) => s.slotId === plan.slot.id);
  const before = plan.holders;
  const after = sent ? unique(sent.units.flatMap((u) => u.players)) : before;
  return { before, after, add: after.filter((id) => !before.includes(id)), remove: before.filter((id) => !after.includes(id)) };
}

/** Algo cambia al enviar (si no, el botón no hace falta). */
export const hasChanges = (plans: readonly SlotPlan[], payload: readonly DeliverSlot[]): boolean =>
  plans.some((p) => {
    const c = changeOf(p, payload);
    return c.add.length > 0 || c.remove.length > 0;
  });

/** Un aviso de un lugar. */
export interface PlanNote {
  tone: 'info' | 'warn';
  text: string;
}

/** Los avisos de un lugar (empates, sin resultado, nadie, estás en el podio). `plans`: todos (para ver el de arriba). */
export function planNotes(plan: SlotPlan, plans: readonly SlotPlan[]): PlanNote[] {
  if (plan.locked) return [{ tone: 'warn', text: 'Ya no se puede corregir: solo el dueño lo cambia.' }];
  if (plan.selfBlocked) return [{ tone: 'warn', text: 'Estás en este podio: lo entrega otro admin o el dueño.' }];
  if (plan.status === 'sin_resultado' || (!plan.finished && plan.status !== 'empate_multiple')) return [{ tone: 'info', text: 'Todavía sin resultado final.' }];
  if (plan.status === 'empate_multiple') return [{ tone: 'warn', text: 'Más de 3 empatados: no se entrega sola.' }];
  if (plan.tooMany) return [{ tone: 'warn', text: `Son más de ${MAX_UNIT_PLAYERS} jugadores: no se puede entregar.` }];
  if (plan.status === 'vacio') {
    const above = plans
      .filter((o) => o.slot.category === plan.slot.category && o.slot.division === plan.slot.division && o.slot.place < plan.slot.place && o.units.length > 1)
      .sort((a, b) => a.slot.place - b.slot.place)[0];
    return [{ tone: 'info', text: above ? `Nadie: empate en el ${PLACE_LABEL[above.slot.place]}.` : 'Nadie en este lugar.' }];
  }
  if (plan.units.length > 1 && plan.bracket) return [{ tone: 'info', text: 'Se la llevan los dos semifinalistas.' }];
  if (plan.units.length > 1) return [{ tone: 'info', text: `Empate: se la llevan ${plan.units.length === 2 ? 'los dos' : 'los tres'}.` }];
  return [];
}

const jugadores = (n: number) => `${n} ${n === 1 ? 'jugador' : 'jugadores'}`;

/** El aviso al terminar: «Entregaste 3 premios a 8 jugadores. Les avisamos.» o «No había nada que cambiar.» */
export function deliveredText(result: Pick<DeliverResult, 'added' | 'revoked' | 'notified'>, prizes: number): string {
  const told = result.notified > 0 ? ` ${result.notified === 1 ? 'Le' : 'Les'} avisamos.` : '';
  if (result.added > 0 && result.revoked === 0) {
    const n = Math.max(1, prizes);
    return `Entregaste ${n} ${n === 1 ? 'premio' : 'premios'} a ${jugadores(result.added)}.${told}`;
  }
  if (result.added > 0) {
    return `Corregiste los premios: ${result.added === 1 ? '1 jugador lo recibe' : `${result.added} jugadores lo reciben`} y a ${result.revoked} se ${result.revoked === 1 ? 'le' : 'les'} quitó.${told}`;
  }
  if (result.revoked > 0) return `Quitaste el premio a ${jugadores(result.revoked)}.`;
  return 'No había nada que cambiar.';
}

/** Cuántos lugares reciben a alguien nuevo (el «3 premios» del aviso). */
export const prizesGiven = (plans: readonly SlotPlan[], payload: readonly DeliverSlot[]): number => plans.filter((p) => changeOf(p, payload).add.length > 0).length;

/** «Ana», «Ana y Luis», «Ana, Luis y Pedro», «Ana, Luis y 3 más». */
export function namesLine(names: readonly string[], max = 3): string {
  const list = names.map((n) => n.trim()).filter(Boolean);
  if (list.length <= 1) return list[0] ?? '';
  if (list.length <= max) return `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`;
  return `${list.slice(0, max).join(', ')} y ${list.length - max} más`;
}

/** Quién ganó, para una fila: «Los Strikers · Ana, Luis y Pedro» (un jugador solo: su nombre). */
export function unitLine(unit: { name: string; players: readonly { name: string }[] }): string {
  const names = unit.players.map((p) => p.name);
  if (unit.players.length === 1 && (!unit.name || unit.name === names[0])) return names[0];
  return [unit.name, namesLine(names)].filter(Boolean).join(' · ');
}
