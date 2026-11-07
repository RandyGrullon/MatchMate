import { compareMatches, hasResult, type Match } from '../../../lib/data/matches';
import type { SeasonTeam } from '../../../lib/data/seasonTeams';
import { SPORTS } from '../../../sports/registry';
import { basketballConfig, type BasketballConfig } from '../../../sports/team/basketball';
import type { DisciplineConfig } from '../../../sports/team/discipline';
import type { FootballConfig, FootballVariant } from '../../../sports/team/football';
import type { FootballTableConfig, FootballTieBreak } from '../../../sports/team/standings';
import { basketballConfigFrom, basketballTeamRules, describeConfig as describeBasketball } from '../basketball/rules';
import { disciplineFrom, footballConfigFrom, footballTableFrom, footballTeamRules, formatOf, TIEBREAK_CHOICES } from '../football/rules';
import { rosterOf } from './logic';

/**
 * Lo que decide Organizar › Equipos › Reglas y Comité sin pantalla (lo comparten la web, BasketballAdmin.tsx y
 * FootballAdmin.tsx, y la app del teléfono): los números que se escriben, lo que se guarda, las validaciones, el orden
 * de los desempates y las sanciones del comité.
 */

/** Un número de las reglas de baloncesto: si no es entero o se sale de [min, max], queda el de antes. */
export function basketballNum(v: string, min: number, max: number, dflt: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : dflt;
}

/** Un número de las reglas de fútbol (también el vacío deja el de antes). */
export function footballNum(v: string, min: number, max: number, dflt: number): number {
  const n = Number(v);
  return v.trim() !== '' && Number.isInteger(n) && n >= min && n <= max ? n : dflt;
}

// ---------- Baloncesto ----------

export interface BasketballDraft {
  cfg: BasketballConfig;
  reinforcements: number;
  minPlayers: number;
  runningClock: boolean;
}

/** Lo que muestra «Ajustar a mano» antes de tocar nada (las reglas de la liga). */
export function basketballDraftOf(current: unknown): BasketballDraft {
  const teams = basketballTeamRules(current);
  return { cfg: basketballConfigFrom(current), reinforcements: teams.reinforcements, minPlayers: teams.minPlayers, runningClock: teams.runningClock };
}

/** Lo que se guarda con «Guardar reglas» (baloncesto). */
export const basketballRulesPatch = (d: BasketballDraft) => ({
  match: d.cfg,
  teams: { reinforcements: d.reinforcements, minPlayers: d.minPlayers, runningClock: d.runningClock, template: null },
});

export const PERIOD_OPTIONS = [
  { key: '4', label: '4 cuartos' },
  { key: '2', label: '2 mitades' },
  { key: '1', label: '1 tiempo' },
];

/**
 * El aviso al cambiar los periodos de un 5x5: «Con 2 mitades, las faltas de equipo se cuentan por periodo. FIBA usa 4
 * cuartos (…).» null si no hace falta.
 */
export function periodsNote(draft: BasketballConfig, saved: BasketballConfig): string | null {
  if (draft.variant !== '5x5' || draft.periods === saved.periods) return null;
  return `Con ${draft.periods === 2 ? '2 mitades' : `${draft.periods} periodos`}, las faltas de equipo se cuentan por periodo. FIBA usa 4 cuartos (${describeBasketball(basketballConfig('fiba'))}).`;
}

// ---------- Fútbol y sala ----------

export interface FootballDraft {
  cfg: FootballConfig;
  table: FootballTableConfig;
  discipline: DisciplineConfig;
  minPlayers: number;
  reinforcements: number;
}

/** Lo que muestra Reglas antes de tocar nada (las reglas de la liga). */
export function footballDraftOf(current: unknown, variant: FootballVariant): FootballDraft {
  const teams = footballTeamRules(current, variant);
  return {
    cfg: footballConfigFrom(current, variant),
    table: footballTableFrom(current),
    discipline: disciplineFrom(current),
    minPlayers: teams.minPlayers,
    reinforcements: teams.reinforcements,
  };
}

/** Lo que se guarda con «Guardar reglas» (fútbol y sala). */
export function footballRulesPatch(current: Record<string, unknown>, d: FootballDraft, variant: FootballVariant) {
  const oldTeams = typeof current.teams === 'object' && current.teams ? (current.teams as Record<string, unknown>) : {};
  return {
    match: { ...d.cfg, variant },
    table: d.table,
    discipline: d.discipline,
    teams: { ...oldTeams, minPlayers: d.minPlayers, reinforcements: d.reinforcements, runningClock: d.cfg.clock !== 'stopped', template: formatOf(current) === 'relampago' ? 'relampago' : null },
  };
}

/** Las mismas validaciones que el registro del deporte (las del formulario de la liga). */
export const footballRulesErrors = (current: Record<string, unknown>, patch: Record<string, unknown>, variant: FootballVariant): string[] =>
  SPORTS[variant].validateRules({ ...current, ...patch });

/** Sube (-1) o baja (1) un desempate en la lista. */
export function moveTiebreak(tb: readonly FootballTieBreak[], i: number, dir: -1 | 1): FootballTieBreak[] {
  const next = [...tb];
  const j = i + dir;
  if (j < 0 || j >= next.length) return next;
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Los desempates que se pueden agregar. */
export const missingTiebreaks = (tb: readonly FootballTieBreak[]) => TIEBREAK_CHOICES.filter((k) => !tb.includes(k));

export const CLOCK_OPTIONS: { key: FootballConfig['clock']; label: string }[] = [
  { key: 'running', label: 'Corrido (no se para)' },
  { key: 'stopped', label: 'Parado (se para en cada pitazo)' },
  { key: 'none', label: 'Sin reloj' },
];
export const SUBS_OPTIONS = [...[3, 5, 7].map((n) => ({ key: String(n), label: `${n} cambios` })), { key: 'libre', label: 'Ilimitados' }];
export const SHOOTOUT_OPTIONS = [
  { key: '3', label: '3 y muerte súbita' },
  { key: '5', label: '5 y muerte súbita' },
];
export const YELLOWS_OPTIONS = [{ key: '0', label: 'No se acumulan' }, ...[2, 3, 4, 5].map((n) => ({ key: String(n), label: `${n} amarillas` }))];

// ---------- Comité ----------

/** Los partidos de los que puede salir una sanción: los jugados y los en vivo, el más nuevo primero. */
export const committeeMatches = (matches: readonly Match[]) => matches.filter((m) => hasResult(m) || m.status === 'live').sort((a, b) => compareMatches(b, a));

/** «J3 · Tigres vs. Leones» (o «partido borrado»). */
export function committeeMatchText(matches: readonly Match[], id: string, teamName: (teamId: string | null) => string | null | undefined): string {
  const m = matches.find((x) => x.id === id);
  if (!m) return 'partido borrado';
  const nm = (i: 0 | 1) => teamName(m.sides[i].teamId) ?? m.sides[i].label;
  return `${m.round != null ? `J${m.round} · ` : ''}${nm(0)} vs. ${nm(1)}`;
}

/** La opción del partido en «Desde el partido»: con el marcador si lo tiene. */
export const committeeMatchOption = (m: Match, text: string) => `${text}${typeof m.score?.text === 'string' ? ` (${m.score.text})` : ''}`;

/** A quién se puede sancionar: la plantilla del equipo y los que jugaron de su lado en ese partido. */
export function committeeCandidates(match: Pick<Match, 'sides'> | undefined, teamId: string, teams: readonly Pick<SeasonTeam, 'id' | 'roster'>[]): string[] {
  const side = match?.sides.find((s) => s.teamId === teamId);
  if (!side) return [];
  return [...new Set([...rosterOf(teams, teamId).map((r) => r.playerId), ...side.players.map((p) => p.playerId)])];
}

/** «Ana Pérez · 2 partidos». */
export const sanctionTitle = (name: string, matches: number) => `${name} · ${matches} ${matches === 1 ? 'partido' : 'partidos'}`;

/** «Tigres · desde J3 · Tigres vs. Leones · Agresión al árbitro». */
export const sanctionLine = (teamName: string | null | undefined, matchText: string, note: string | null | undefined) => `${teamName ?? 'Equipo'} · desde ${matchText}${note ? ` · ${note}` : ''}`;
