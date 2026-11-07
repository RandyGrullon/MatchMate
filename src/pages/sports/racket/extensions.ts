/**
 * Lo que cada deporte de raqueta agrega a las pantallas compartidas, sin pantallas ni íconos (puro): qué plantillas de
 * «Nuevo» esconde y cómo se llaman, las palabras (round robin, mesa), la línea de cada evento en las listas y las tablas
 * de las cajas en la temporada. Lo de cada `screens.tsx` de la web que no trae pantallas; la app del teléfono (movil/)
 * lo usa tal cual (no puede importar los `screens.tsx`, que traen las pantallas de la web).
 */
import type { Match } from '../../../lib/data/matches';
import type { RacketEvent } from '../../../lib/data/racket';
import type { RacketSport } from '../../../sports/racket';
import { BOX_TEMPLATE_INFO, LADDER_TEMPLATE_INFO, formatsCompetitions, formatsEventInfo, type TemplateInfo } from '../racket-formats/info';
import { isSocialEvent, parseSocialConfig } from '../pickleball/social/logic';
import type { RacketExtensions } from './sport';

export type { TemplateInfo };

/** Lo puro de una extensión (sin plantillas propias, página, cancha ni «Solo el resultado», que traen pantallas). */
export type PureExtensions = Pick<RacketExtensions, 'hideTemplates' | 'templateTitles' | 'eventInfo' | 'words' | 'competitions'>;

/** Tenis: sin americano ni mexicano; liga y torneo con su nombre. */
export const TENNIS_BASE: PureExtensions = {
  hideTemplates: ['americano', 'mexicano'],
  templateTitles: (doubles) => ({
    liga: { title: doubles ? 'Liga de dobles' : 'Liga', text: 'Todos contra todos por jornadas, de ida o de ida y vuelta, con canchas, horas y tabla.' },
    torneo: { title: 'Torneo con cuadro', text: 'Categorías por nivel: grupos o cuadro directo con siembra por NTRP, cruces y 3.er lugar.' },
  }),
};

/** El round robin social del pickleball en las listas: «Round robin mixto» y «12 jugadores · a 11 · ronda 2 de 6». */
export function socialEventInfo(e: RacketEvent): { label?: string; line?: string } | null {
  if (!isSocialEvent(e)) return null;
  const c = parseSocialConfig(e.config, e.type);
  const state = c.closed ? 'terminado' : c.round ? `ronda ${c.round} de ${c.rounds}` : `${c.rounds} rondas`;
  return { label: c.mixed ? 'Round robin mixto' : 'Round robin', line: `${c.players.length} jugadores · a ${c.game.to} · ${state}` };
}

/** Pickleball: sin americano ni mexicano (tiene su round robin social); liga y torneo con su nombre. */
export const PICKLEBALL_BASE: PureExtensions = {
  hideTemplates: ['americano', 'mexicano'],
  templateTitles: (doubles) => ({
    liga: { title: doubles ? 'Liga de dobles' : 'Liga', text: 'Todos contra todos por jornadas, con canchas, horas y la tabla de USA Pickleball.' },
    torneo: { title: 'Torneo grupos + eliminatoria', text: 'Categorías por nivel (DUPR): grupos, cruces y cuadro con 3.er lugar.' },
  }),
  eventInfo: socialEventInfo,
  words: { nights: 'Round robin', nightsLong: 'Round robin social' },
};

/** Ping pong: sin americano ni mexicano; donde se juega se llama «mesa». */
export const TABLE_TENNIS_BASE: PureExtensions = {
  hideTemplates: ['americano', 'mexicano'],
  templateTitles: (doubles) => ({
    liga: { title: doubles ? 'Liga de dobles' : 'Liga', text: 'Todos contra todos por jornadas, con mesas, horas y la tabla de la ITTF (ganar 2, perder 1).' },
    torneo: { title: 'Torneo grupos + eliminatoria', text: 'Categorías por nivel: grupos de 3 o 4 que pasan al cuadro, con 3.er lugar, como en la ITTF.' },
  }),
  words: { court: ['mesa', 'mesas'] },
};

const BASES: Readonly<Record<RacketSport, PureExtensions>> = { padel: {}, tennis: TENNIS_BASE, pickleball: PICKLEBALL_BASE, table_tennis: TABLE_TENNIS_BASE };

/** La plantilla del round robin social del pickleball (sin su ícono ni su formulario). */
export const SOCIAL_TEMPLATE_INFO: TemplateInfo = {
  k: 'social',
  title: 'Round robin social',
  text: 'Compañeros que rotan cada ronda y cada partido es un juego a 11. La app arma las rondas; también mixto.',
};

/** Las plantillas propias de «Nuevo» del deporte, en el orden de la web (las del deporte y luego cajas y escalera). */
export function extraTemplates(sport: RacketSport): TemplateInfo[] {
  return [...(sport === 'pickleball' ? [SOCIAL_TEMPLATE_INFO] : []), BOX_TEMPLATE_INFO, LADDER_TEMPLATE_INFO];
}

/** Suma lo puro de la liga por cajas y la escalera (como withFormats de racket-formats/index.ts, sin las pantallas). */
export function withPureFormats(sport: RacketSport, ext: PureExtensions = {}): PureExtensions {
  const boxes = formatsCompetitions(sport);
  return {
    ...ext,
    eventInfo: (e, side) => ext.eventInfo?.(e, side) ?? formatsEventInfo(e),
    competitions: (events: readonly RacketEvent[], matches: readonly Match[], now: number) => [...(ext.competitions?.(events, matches, now) ?? []), ...boxes(events, matches, now)],
  };
}

const cache = new Map<RacketSport, PureExtensions>();

/**
 * Lo puro del deporte con la liga por cajas y la escalera: lo que la app del teléfono le pasa a RacketProvider. Siempre
 * el mismo objeto por deporte (así el contexto no cambia en cada render).
 */
export function racketPureExt(sport: RacketSport): PureExtensions {
  let ext = cache.get(sport);
  if (!ext) {
    ext = withPureFormats(sport, BASES[sport] ?? {});
    cache.set(sport, ext);
  }
  return ext;
}
