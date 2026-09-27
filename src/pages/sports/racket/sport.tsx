import { createContext, useContext, useMemo, type ComponentType, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useLeagueCtx } from '../../../lib/league';
import type { Match } from '../../../lib/data/matches';
import { useLeagueRules, type RacketEvent } from '../../../lib/data/racket';
import { getSport, type SportMeta } from '../../../sports/registry';
import type { RacketRules, RacketSport } from '../../../sports/racket';
import type { StandingRow } from '../../../sports/types';
import type { ResultParser } from '../../../components/match';
import { engineRules } from './court/adapters';

/**
 * El deporte de raqueta de las pantallas compartidas (pádel, tenis y pickleball): cada pantalla lee aquí su
 * deporte, las palabras del registro, las reglas del partido de la liga y lo que el deporte agrega (`ext`).
 */

/** Formulario de una plantilla propia de «Nuevo» (dentro del mismo modal). */
export interface WizardFormProps {
  /** Se creó el evento: el modal se cierra y se abre el evento. */
  onDone: (eventId: string) => void;
  /** Volver a las plantillas. */
  onBack: () => void;
  /** La última noche o evento de ese tipo (para «repetir»). */
  last?: RacketEvent | null;
}

export interface WizardTemplate {
  /** Id de la plantilla (normalmente el tipo de evento). */
  k: string;
  title: string;
  text: string;
  icon: LucideIcon;
  Form: ComponentType<WizardFormProps>;
}

/** Props de la cancha de un partido (la que pone el deporte en lugar de la de siempre). */
export interface RacketCourtProps {
  match: Match;
  isAdmin: boolean;
  userId: string | null;
  onExit: () => void;
}

/** «Solo el resultado» de un partido que el deporte lee a su manera (p. ej. el juego a 11 del round robin). */
export interface ResultEntrySpec {
  parser: ResultParser;
  placeholder: string;
  hint: string;
  examples: string[];
  /** Se guarda con save_points_result (partidos de noche) en lugar de finish_match. */
  points: boolean;
}

/**
 * Lo que un deporte agrega a las pantallas compartidas (todo opcional; el pádel no pasa nada). Así tenis y
 * pickleball suman la liga por cajas, la escalera, el round robin social y su cancha sin tocar lo del pádel.
 */
export interface RacketExtensions {
  /** Plantillas extra de «Nuevo» (van después de las de siempre). */
  templates?: WizardTemplate[];
  /** Plantillas de siempre que el deporte no usa: 'americano', 'mexicano', 'liga', 'torneo'. */
  hideTemplates?: readonly string[];
  /** Nombre de la plantilla de siempre («Liga de dobles», «Torneo con cuadro»), según la liga sea de dobles. */
  templateTitles?: (doubles: boolean) => Readonly<Record<string, { title?: string; text?: string }>>;
  /** Página de un evento que el deporte maneja (null = la de siempre). */
  eventPage?: (e: RacketEvent) => ComponentType<{ event: RacketEvent }> | null;
  /** Nombre y línea de un evento en las listas (null = lo de siempre). */
  eventInfo?: (e: RacketEvent, side: readonly [string, string]) => { label?: string; line?: string } | null;
  /** Cancha de un partido (null = la de siempre: puntos o sets). */
  court?: (m: Match) => ComponentType<RacketCourtProps> | null;
  /** «Solo el resultado» de un partido (null = lo de siempre). */
  resultEntry?: (m: Match) => ResultEntrySpec | null;
  /** Palabras: cómo se llaman las noches de puntos del deporte («Round robin»). */
  words?: { nights?: string; nightsLong?: string };
  /** Tablas extra de la temporada (las cajas del mes, por ejemplo), después de las de ligas y torneos. */
  competitions?: (events: readonly RacketEvent[], matches: readonly Match[], now: number) => { key: string; name: string; rows: StandingRow[] }[];
}

interface RacketSportValue {
  sport: RacketSport;
  meta: SportMeta;
  ext: RacketExtensions;
}

const Ctx = createContext<RacketSportValue | null>(null);

const NO_EXT: RacketExtensions = {};

/** El deporte tiene noches de puntos (americano del pádel, round robin del pickleball; como private.night_league). El tenis no. */
export const hasNights = (sport: RacketSport): boolean => sport === 'padel' || sport === 'pickleball';

export function RacketProvider({ sport, ext, children }: { sport: RacketSport; ext?: RacketExtensions; children: ReactNode }) {
  const value = useMemo(() => ({ sport, meta: getSport(sport), ext: ext ?? NO_EXT }), [sport, ext]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export interface RacketContext extends RacketSportValue {
  /** leagues.rules tal cual. */
  leagueRules: Record<string, unknown>;
  /** Reglas del partido de la liga, completas. */
  rules: RacketRules;
  /** Se juega en dobles (pareja por lado). */
  doubles: boolean;
  /** «pareja» / «parejas» o «jugador» / «jugadores». */
  side: readonly [string, string];
}

export function useRacket(): RacketContext {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRacket fuera de RacketProvider');
  const { lid } = useLeagueCtx();
  const leagueRules = useLeagueRules(lid).data;
  return useMemo(() => {
    const rules = engineRules(v.sport, leagueRules);
    return { ...v, leagueRules, rules, doubles: rules.doubles, side: rules.doubles ? (['pareja', 'parejas'] as const) : (['jugador', 'jugadores'] as const) };
  }, [v, leagueRules]);
}
