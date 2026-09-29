/**
 * La tarjeta «Premios» sin pantalla (docs/premios-torneo.md §6.1): qué se ve en cada estado (sin premios, elegidos,
 * entregados, cerrados), por categoría y lugar, y el aviso «El podio cambió» cuando lo entregado ya no es lo que dice
 * la clasificación. Funciones puras con pruebas en card.test.ts; la usan todos los deportes.
 */
import type { LeagueBadge } from '../lib/data/leagueBadges';
import { anyDelivered, prizeDeadline, prizeOpen, slotDelivered, slotExpired, type PrizeSlot, type PrizeWinner, type TournamentPrize } from '../lib/data/prizes';
import { prizeTitle, type PrizeComp } from './catalog';
import { refsOf, type PodiumProvider, type PodiumResult } from './providers';

export interface CardRow {
  slot: PrizeSlot;
  /** El diseño del lugar (null si ya no se ve: escondido por el superadmin o borrado). */
  design: LeagueBadge | null;
  delivered: boolean;
  winners: PrizeWinner[];
  /** El podio de hoy según el teléfono (null si no sabe). */
  current: PodiumResult | null;
}

export interface CardSection {
  key: string;
  /** «Equipos (scratch)», «Individual (handicap)». */
  title: string;
  rows: CardRow[];
}

/** Sin premios, elegidos (sin entregar), entregados (algo) o cerrados. */
export type CardState = 'sin_premios' | 'elegidos' | 'entregados' | 'cerrados';

export interface CardModel {
  state: CardState;
  /** «El campeón se lleva…» o «Campeones». */
  heading: string;
  sections: CardSection[];
  /** Todos los lugares ya se entregaron. */
  allDelivered: boolean;
  /** Lo entregado ya no es lo que dice la clasificación (solo lo ven los admins). */
  podiumChanged: boolean;
}

/**
 * El modelo de la tarjeta. `admin` = quien entrega o elige: ve los lugares aunque su diseño no se vea y el aviso «El
 * podio cambió». Los jugadores no ven un lugar cuyo diseño está escondido (o ya no existe).
 */
export function cardModel(
  comp: Pick<PrizeComp, 'kind' | 'bowling' | 'racket'>,
  prize: TournamentPrize | null,
  designs: readonly LeagueBadge[],
  opts: { podium?: PodiumProvider | null; admin?: boolean } = {},
): CardModel {
  if (!prize || !prize.slots.length) {
    return { state: 'sin_premios', heading: 'Premios del torneo', sections: [], allDelivered: false, podiumChanged: false };
  }
  const byId = new Map(designs.map((d) => [d.id, d] as const));
  const sections: CardSection[] = [];
  let changed = false;
  for (const slot of prize.slots) {
    const found = byId.get(slot.badgeId) ?? null;
    const design = found && (found.status !== 'oculta' || opts.admin) ? found : null;
    if (!design && !opts.admin) continue;
    // Un lugar que se quitó entero (a propósito) no está entregado: ni «Nadie en este lugar» ni «El podio cambió».
    const delivered = slotDelivered(slot);
    const current = opts.podium?.(slot) ?? null;
    if (opts.admin && delivered && current && (current.status === 'listo' || current.status === 'vacio')) {
      const a = refsOf(current.units);
      const b = refsOf(slot.winners);
      if (a.length !== b.length || a.some((r, i) => r !== b[i])) changed = true;
    }
    const key = `${slot.category}|${slot.division}`;
    let section = sections.find((s) => s.key === key);
    if (!section) {
      section = { key, title: slot.title || prizeTitle(slot, comp), rows: [] };
      sections.push(section);
    }
    section.rows.push({ slot, design, delivered, winners: slot.winners, current });
  }
  const delivered = anyDelivered(prize);
  return {
    state: prize.closedAt ? 'cerrados' : delivered ? 'entregados' : 'elegidos',
    heading: delivered ? 'Campeones' : 'El campeón se lleva…',
    sections,
    allDelivered: prize.slots.every(slotDelivered),
    podiumChanged: changed,
  };
}

/** Lo que quien entrega y no es dueño todavía puede hacer a `now` (la base lo revisa lugar por lugar, igual). */
export interface CorrectionWindow {
  /** Queda algo que entregar o corregir: un lugar sin entregar o dentro de sus 14 días (y la premiación abierta). */
  open: boolean;
  /** El próximo vencimiento de lo entregado que todavía se corrige («Puedes corregir hasta…»), o null. */
  deadline: string | null;
  /** Algún lugar entregado ya pasó sus 14 días: ese solo lo cambia el dueño. */
  someExpired: boolean;
}

/** La ventana de correcciones de la tarjeta (los admins ven todos los lugares en sus filas). */
export function correctionWindow(model: Pick<CardModel, 'state' | 'sections'>, now: number): CorrectionWindow {
  const slots = model.sections.flatMap((s) => s.rows.map((r) => r.slot));
  const closedAt = model.state === 'cerrados' ? 'cerrada' : null;
  return {
    open: prizeOpen({ closedAt, slots }, now),
    deadline: closedAt ? null : prizeDeadline({ slots }, now),
    someExpired: slots.some((s) => slotExpired(s, now)),
  };
}
