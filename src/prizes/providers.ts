/**
 * Los podios que arma el teléfono (docs/premios-torneo.md §5 y §9). Todos devuelven lo mismo por lugar premiado
 * (`PodiumResult`): así la tarjeta «Premios» muestra quién va ganando, avisa «El podio cambió» después de entregar y,
 * donde el servidor no calcula el orden (golf, natación, noches: estado 'telefono'), «Entregar premios» manda esto.
 *
 * El boliche lo calcula también el servidor (private.prize_bowling_rank): lo de aquí es la misma cuenta
 * (`bowlingStandings`, con una prueba de paridad) para mostrar y comparar; la entrega manda lo que dice el servidor.
 */
import type { PodiumUnit, PrizeCategory, PrizePlace } from '../lib/data/prizes';
import { MAX_PODIUM_UNITS } from '../lib/data/prizes';
import { bowlingStandings, teamRule, individualRule, type BowlingStandings } from '../lib/stats';
import type { BowlingEvent, Entry } from '../lib/types';

/** El podio de un lugar según el teléfono ('telefono' no: eso lo dice el servidor cuando no calcula). */
export interface PodiumResult {
  status: 'listo' | 'vacio' | 'sin_resultado' | 'empate_multiple';
  /** Empatados en ese lugar, por nombre (hasta 3 para entregarse). */
  units: PodiumUnit[];
}

/** El podio de hoy de una competencia, lugar por lugar (null = el teléfono no sabe). */
export type PodiumProvider = (slot: { category: PrizeCategory; division: string; place: PrizePlace }) => PodiumResult | null;

const byName = (a: PodiumUnit, b: PodiumUnit) => a.name.localeCompare(b.name, 'es') || (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0);

/**
 * El lugar `place` de una clasificación con ranking de competición (1, 2, 2, 4): las unidades con esa posición.
 * Sin nadie clasificado: 'sin_resultado'; nadie en ese lugar (empate arriba): 'vacio'; más de 3: 'empate_multiple'.
 */
export function placeOf<T>(ranked: readonly { row: T; pos: number }[], place: number, unit: (row: T) => PodiumUnit): PodiumResult {
  if (!ranked.length) return { status: 'sin_resultado', units: [] };
  const units = ranked.filter((r) => r.pos === place).map((r) => unit(r.row)).sort(byName);
  return { status: units.length === 0 ? 'vacio' : units.length > MAX_PODIUM_UNITS ? 'empate_multiple' : 'listo', units };
}

const pins = (n: number) => `${n} pinos`;

/**
 * El podio del boliche con la clasificación oficial (equipos por su regla, individual por la suya; solo juegos
 * verificados). `ready` = ya se puede entregar (desde el día del torneo): antes, todo 'sin_resultado' como en el servidor.
 * Los jugadores de un equipo son los que jugaron (como teamLines y el servidor).
 */
export function bowlingPodium(
  event: BowlingEvent,
  entries: readonly Entry[],
  nameOf: (playerId: string) => string,
  opts: { ready?: boolean; standings?: BowlingStandings } = {},
): PodiumProvider {
  const st = opts.standings ?? bowlingStandings(event, entries);
  const ready = opts.ready ?? true;
  const teamHcp = teamRule(event) === 'hcp';
  const indHcp = individualRule(event) === 'hcp';
  return (slot) => {
    if (!ready) return { status: 'sin_resultado', units: [] };
    if (slot.division !== '') return null;
    if (slot.category === 'equipo') {
      return placeOf(st.teams, slot.place, (t) => ({
        ref: `t:${t.teamId}`,
        name: t.name,
        teamId: t.teamId,
        players: t.members
          .map((m) => ({ id: m.entry.playerId, name: nameOf(m.entry.playerId) }))
          .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase(), 'es') || (a.id < b.id ? -1 : 1)),
        detail: pins(teamHcp ? t.total : t.scratch),
      }));
    }
    if (slot.category === 'individual') {
      return placeOf(st.individual, slot.place, (l) => ({
        ref: `p:${l.entry.playerId}`,
        name: nameOf(l.entry.playerId),
        teamId: null,
        players: [{ id: l.entry.playerId, name: nameOf(l.entry.playerId) }],
        detail: pins(indHcp ? l.total : l.scratch),
      }));
    }
    return null;
  };
}

/** Las refs de un podio, ordenadas (para comparar con lo entregado). */
export const refsOf = (units: readonly { ref: string }[]): string[] => units.map((u) => u.ref).sort();
