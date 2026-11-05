import { ArrowUpDown, Boxes, ChevronsUp, ListOrdered, Moon, Shuffle, Trophy, type LucideIcon } from 'lucide-react';
import type { StandingsColumn } from '../../../components/match/standings';
import { awaitingConfirmation, hasResult, type Match } from '../../../lib/data/matches';
import type { RacketEvent } from '../../../lib/data/racket';
import type { Side } from '../../../sports/types';
import { isGameSport } from '../../../sports/racket/rules';
import { isNightType, parseNightConfig } from './logic/night';
import { isPointsMatch, matchTime } from './logic/results';
import { signupBlurb, signupPhase } from './logic/signup';
import { parseTourneyConfig, tourneyStarted } from './logic/tourney';

/**
 * Textos, columnas y listas de las pantallas de raqueta, sin React ni pantallas: los usan bits.tsx, Home.tsx y
 * Feed.tsx en la web y las pantallas de la app del teléfono (movil/).
 */

export interface EventTypeInfo {
  label: string;
  icon: LucideIcon;
  hint: string;
}

const TYPES: Record<string, EventTypeInfo> = {
  americano: { label: 'Americano', icon: Shuffle, hint: 'Parejas que rotan cada ronda; cada quien suma sus puntos.' },
  mexicano: { label: 'Mexicano', icon: ArrowUpDown, hint: 'Cada ronda se arma con la tabla: 1+4 contra 2+3.' },
  liga: { label: 'Liga', icon: ListOrdered, hint: 'Todos contra todos por jornadas, con tabla.' },
  torneo: { label: 'Torneo', icon: Trophy, hint: 'Categorías, grupos y cuadro de eliminación.' },
  noche: { label: 'Noche', icon: Moon, hint: 'Noche de puntos.' },
  cajas: { label: 'Liga por cajas', icon: Boxes, hint: 'Cajas de 4 a 6 por nivel; cada mes suben 2 y bajan 2.' },
  escalera: { label: 'Escalera', icon: ChevronsUp, hint: 'Reta hasta 3 puestos arriba; si ganas, tomas su puesto.' },
};

export const eventTypeInfo = (type: string, doubles = true): EventTypeInfo => {
  const t = TYPES[type] ?? TYPES.noche;
  return type === 'liga' && doubles ? { ...t, label: 'Liga de parejas' } : t;
};

/** «1 pareja» / «3 parejas». */
export const plural = (n: number, [one, many]: readonly [string, string]) => `${n} ${n === 1 ? one : many}`;

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/**
 * Columnas de la tabla de raqueta: PJ, G, P, dif. de sets, juegos a favor y en contra, dif. de juegos (pickleball y
 * ping pong: juegos y puntos).
 */
export function racketColumns(sport: string): StandingsColumn[] {
  const pk = isGameSport(sport);
  return [
    { key: 'played', label: 'PJ', title: 'Partidos jugados', value: (r) => r.played },
    { key: 'won', label: 'G', title: 'Ganados', value: (r) => r.won },
    { key: 'lost', label: 'P', title: 'Perdidos', value: (r) => r.lost },
    { key: 'sets', label: pk ? 'Jue.' : 'Sets', title: pk ? 'Diferencia de juegos' : 'Diferencia de sets', value: (r) => signed(r.extra[pk ? 'gamesDiff' : 'setsDiff'] ?? 0) },
    { key: 'for', label: pk ? 'PF' : 'JF', title: pk ? 'Puntos a favor' : 'Juegos a favor', value: (r) => r.for, wide: true },
    { key: 'against', label: pk ? 'PC' : 'JC', title: pk ? 'Puntos en contra' : 'Juegos en contra', value: (r) => r.against, wide: true },
    { key: 'diff', label: pk ? 'Dif.' : 'Dif. J', title: pk ? 'Diferencia de puntos' : 'Diferencia de juegos', value: (r) => signed(r.diff) },
  ];
}


/** Qué se dice del evento en la lista: «Ronda 3 de 7», «8 parejas», «2 categorías» (y la inscripción abierta). */
export function eventLine(e: RacketEvent, side: readonly [string, string], today: string, now = Date.now()): string {
  if (isNightType(e.type)) {
    const c = parseNightConfig(e.config, e.type);
    const started = c.round > 0 || c.closed;
    const blurb = c.signup ? signupBlurb(c.signup, c.players.length, signupPhase(c.signup, { started, date: e.date, today, now })) : null;
    const state = c.closed ? 'terminada' : c.round ? `ronda ${c.round} de ${c.rounds}` : (blurb ?? `${c.rounds} rondas`);
    return `${c.players.length} jugadores · ${state}`;
  }
  if (e.type === 'torneo') {
    const t = parseTourneyConfig(e.config);
    const n = t.categories.length;
    const line = `${n} ${n === 1 ? 'categoría' : 'categorías'} · ${e.playerCount} ${e.playerCount === 1 ? side[0] : side[1]}`;
    if (!t.signup || !n) return line;
    // El cupo es por categoría: en la lista, el de todo el torneo.
    const total = { ...t.signup, cap: t.signup.cap != null ? t.signup.cap * n : null };
    const blurb = signupBlurb(total, e.playerCount, signupPhase(t.signup, { started: tourneyStarted(t), date: e.date, today, now }));
    return blurb ? `${line} · ${blurb}` : line;
  }
  return `${e.playerCount} ${e.playerCount === 1 ? side[0] : side[1]}`;
}


/** Los filtros de Partidos: todos, los míos y, con noches de puntos, liga y torneos o noches. */
export type FeedFilter = 'todos' | 'mios' | 'sets' | 'noches';

/** Partidos agrupados como en Partidos: en vivo, por confirmar (o en disputa), próximos y resultados. */
export function feedGroups(all: readonly Match[], filter: FeedFilter, mySideOf: (m: Match) => Side | null, now: number) {
  const list = all.filter((m) => {
    if (filter === 'mios') return mySideOf(m) !== null;
    if (filter === 'sets') return !isPointsMatch(m);
    if (filter === 'noches') return isPointsMatch(m);
    return true;
  });
  const live = list.filter((m) => m.status === 'live');
  const toConfirm = list.filter((m) => awaitingConfirmation(m, now) || m.status === 'disputed');
  const upcoming = list
    .filter((m) => m.status === 'scheduled' || m.status === 'postponed' || m.status === 'suspended')
    .sort((a, b) => matchTime(a) - matchTime(b));
  const results = list.filter((m) => hasResult(m) && !toConfirm.includes(m)).sort((a, b) => matchTime(b) - matchTime(a));
  return { live, toConfirm, upcoming, results };
}
