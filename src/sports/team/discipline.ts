/**
 * Disciplina de fútbol y sala: suspensiones automáticas a partir de las tarjetas de la temporada.
 *
 * - Roja (directa o por doble amarilla) = 1 partido (configurable por separado).
 * - N amarillas acumuladas (3 por defecto, o 5) = 1 partido; el conteo sigue (a las 6, otra).
 *   Las amarillas de una doble amarilla no suman a la acumulación (configurable); la de una amarilla
 *   seguida de roja directa sí suma.
 * - La suspensión se cumple en el siguiente partido que el equipo juegue DE VERDAD: los aplazados,
 *   cancelados y descansos no cuentan (el W.O. tampoco, salvo que se configure).
 * - La app avisa pero no bloquea: el admin puede sumar partidos a mano (`adjustments`, p. ej. el comité).
 */

export interface CardLine {
  player: string;
  team: string;
  /** Amarillas del partido (0, 1 o 2). */
  yellows: number;
  red: 'direct' | 'second_yellow' | null;
}

export type DisciplineStatus = 'played' | 'scheduled' | 'postponed' | 'cancelled' | 'walkover' | 'bye';

export interface DisciplineMatch {
  id: string;
  /** Orden en el calendario (fecha ISO o número). Empates de orden se resuelven por id. */
  order: number | string;
  /** Equipos del partido (uno solo si es descanso). */
  teams: string[];
  status: DisciplineStatus;
  cards?: CardLine[];
  /** Quién jugó por equipo (para avisar si jugó un suspendido). */
  present?: { team: string; players: string[] }[];
}

export interface DisciplineConfig {
  /** Partidos por roja directa. */
  redMatches: number;
  /** Partidos por doble amarilla. */
  secondYellowMatches: number;
  /** Amarillas para una suspensión (3 o 5); 0 = sin acumulación. */
  yellowsForSuspension: number;
  /** Partidos por acumular amarillas. */
  yellowMatches: number;
  /** Las amarillas de una doble amarilla suman a la acumulación. */
  secondYellowCounts: boolean;
  /** Un W.O. cuenta como partido cumplido. */
  walkoverServes: boolean;
}

export const DEFAULT_DISCIPLINE: DisciplineConfig = {
  redMatches: 1,
  secondYellowMatches: 1,
  yellowsForSuspension: 3,
  yellowMatches: 1,
  secondYellowCounts: false,
  walkoverServes: false,
};

/** Partidos extra que pone el admin o el comité, a partir del partido `matchId`. */
export interface DisciplineAdjustment {
  player: string;
  team: string;
  matchId: string;
  matches: number;
  note?: string;
}

export type SanctionReason = 'roja' | 'doble_amarilla' | 'amarillas' | 'comite';

export interface Sanction {
  player: string;
  team: string;
  reason: SanctionReason;
  /** Partido donde se ganó la suspensión. */
  matchId: string;
  matches: number;
  /** Partidos donde ya la cumplió. */
  served: string[];
  remaining: number;
  note?: string;
}

export interface DisciplineReport {
  sanctions: Sanction[];
  /** Amarillas por jugador: total de la temporada y las que van para la próxima suspensión. */
  yellows: { player: string; team: string; total: number; pending: number }[];
  /** Suspendidos que aparecen jugando (presentes o con tarjeta) en un partido que les tocaba cumplir. */
  violations: { matchId: string; team: string; player: string }[];
}

export interface Suspended {
  player: string;
  team: string;
  reason: SanctionReason;
  /** Partido donde se ganó. */
  fromMatchId: string;
  /** Partidos que le faltan contando el que se consulta. */
  remaining: number;
}

const key = (team: string, player: string) => `${team}\u0000${player}`;

function sorted(matches: readonly DisciplineMatch[]): DisciplineMatch[] {
  return [...matches].sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Recorre la temporada en orden. `project` = los partidos programados se dan por jugados (para saber quién
 * estará suspendido en un partido futuro si los anteriores se juegan).
 */
function run(matches: readonly DisciplineMatch[], cfg: DisciplineConfig, adjustments: readonly DisciplineAdjustment[], stopAt: string | null, project: boolean) {
  const sanctions: Sanction[] = [];
  const yellows = new Map<string, { player: string; team: string; total: number; pending: number }>();
  const violations: DisciplineReport['violations'] = [];

  for (const m of sorted(matches)) {
    if (m.id === stopAt) break;
    const serves = m.status === 'played' || (m.status === 'walkover' && cfg.walkoverServes) || (project && m.status === 'scheduled');
    if (serves) {
      for (const team of m.teams) {
        // Cada partido cumple un partido de cada sanción pendiente del jugador (las sanciones se cumplen una tras otra).
        const pendingByPlayer = new Map<string, Sanction>();
        for (const s of sanctions) if (s.team === team && s.remaining > 0 && !pendingByPlayer.has(s.player)) pendingByPlayer.set(s.player, s);
        for (const s of pendingByPlayer.values()) {
          s.served.push(m.id);
          s.remaining--;
          const present = m.present?.find((p) => p.team === team)?.players.includes(s.player) ?? false;
          const carded = m.cards?.some((c) => c.team === team && c.player === s.player) ?? false;
          if (present || carded) violations.push({ matchId: m.id, team, player: s.player });
        }
      }
    }
    if (m.status === 'played') {
      for (const c of m.cards ?? []) {
        if (c.red === 'direct' && cfg.redMatches > 0) sanctions.push(newSanction(c, 'roja', m.id, cfg.redMatches));
        if (c.red === 'second_yellow' && cfg.secondYellowMatches > 0) sanctions.push(newSanction(c, 'doble_amarilla', m.id, cfg.secondYellowMatches));
        const counted = c.red === 'second_yellow' && !cfg.secondYellowCounts ? 0 : c.yellows;
        const k = key(c.team, c.player);
        const y = yellows.get(k) ?? { player: c.player, team: c.team, total: 0, pending: 0 };
        y.total += c.yellows;
        y.pending += counted;
        if (cfg.yellowsForSuspension > 0) {
          while (y.pending >= cfg.yellowsForSuspension) {
            y.pending -= cfg.yellowsForSuspension;
            if (cfg.yellowMatches > 0) sanctions.push(newSanction(c, 'amarillas', m.id, cfg.yellowMatches));
          }
        }
        yellows.set(k, y);
      }
    }
    for (const a of adjustments) {
      if (a.matchId === m.id && a.matches > 0) sanctions.push({ ...newSanction(a, 'comite', m.id, a.matches), ...(a.note ? { note: a.note } : {}) });
    }
  }
  return { sanctions, yellows: [...yellows.values()], violations };
}

function newSanction(c: { player: string; team: string }, reason: SanctionReason, matchId: string, matches: number): Sanction {
  return { player: c.player, team: c.team, reason, matchId, matches, served: [], remaining: matches };
}

/** Todo lo de la temporada hasta hoy: sanciones (cumplidas y pendientes), amarillas y alineaciones indebidas. */
export function disciplineReport(matches: readonly DisciplineMatch[], config: Partial<DisciplineConfig> = {}, adjustments: readonly DisciplineAdjustment[] = []): DisciplineReport {
  return run(matches, { ...DEFAULT_DISCIPLINE, ...config }, adjustments, null, false);
}

/**
 * Suspendidos para un partido (normalmente el próximo). Cuenta lo jugado antes de ese partido; los partidos
 * programados que caen antes se dan por jugados (si uno se aplaza, márcalo 'postponed' y la lista cambia).
 */
export function suspendedFor(matches: readonly DisciplineMatch[], matchId: string, config: Partial<DisciplineConfig> = {}, adjustments: readonly DisciplineAdjustment[] = []): Suspended[] {
  const target = matches.find((m) => m.id === matchId);
  if (!target) throw new Error('No existe ese partido');
  const { sanctions } = run(matches, { ...DEFAULT_DISCIPLINE, ...config }, adjustments, matchId, true);
  const byPlayer = new Map<string, Suspended>();
  for (const s of sanctions) {
    if (s.remaining <= 0 || !target.teams.includes(s.team)) continue;
    const k = key(s.team, s.player);
    const prev = byPlayer.get(k);
    // Si tiene varias sanciones, se muestra la primera pendiente y lo que le falta en total.
    if (prev) prev.remaining += s.remaining;
    else byPlayer.set(k, { player: s.player, team: s.team, reason: s.reason, fromMatchId: s.matchId, remaining: s.remaining });
  }
  return [...byPlayer.values()].sort((a, b) => a.team.localeCompare(b.team) || a.player.localeCompare(b.player));
}
