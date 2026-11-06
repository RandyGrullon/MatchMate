/**
 * Lo que no es pantalla de Admin › Temporada (SeasonAdmin.tsx en la web y movil/src/components/seasonAdmin en la app
 * del teléfono): la temporada en curso y la última cerrada, la línea de fechas de cada una, a quién se le puede dar un
 * premio, las notas de cerrar o corregir y el mensaje de un error de close_season / start_season. Funciones puras.
 */
import { asBackendError } from '../../lib/db/errors';
import type { AwardKind, Season, SeasonAward } from '../../lib/seasons';
import { sportMeta } from '../../sports/registry';
import { makeSnapshot, seasonDates, shortDay, type Awardee, type SeasonSnapshot, type SeasonTableResult } from './logic';

/** La tabla de una temporada para cerrarla, como la da cada deporte (SportScreens.useSeasonTable). */
export type UseSeasonTable = (season: Season) => SeasonTableResult;

/** Deporte sin tabla propia: sin foto, con los jugadores de la liga para los premios. */
export const noSeasonTable: UseSeasonTable = () => ({ loading: false, snapshot: makeSnapshot('', []), teams: [], players: [] });

/** Mensaje de un error de close_season / start_season (`fallback`: el de un dato que no sirve). */
export function seasonErrorText(e: unknown, fallback: string): string {
  const be = asBackendError(e);
  const code = (be?.message ?? (e instanceof Error ? e.message : '')).trim().split(/[\s:]/)[0];
  if (be?.kind === 'network') return 'Sin conexión. Intenta de nuevo cuando vuelva la señal.';
  if (be?.kind === 'permission') return 'Solo los admins de la liga manejan las temporadas.';
  if (code === 'invalido') return fallback;
  return 'No se pudo guardar. Intenta de nuevo.';
}

/** La temporada en curso y la última cerrada (las temporadas vienen de la más nueva a la más vieja). */
export function seasonsOverview<T extends Pick<Season, 'status'>>(list: readonly T[]): { active: T | null; lastClosed: T | null } {
  return { active: list.find((s) => s.status === 'active') ?? null, lastClosed: list.find((s) => s.status === 'closed') ?? null };
}

/** La línea de fechas de una temporada: «12 feb 2026 – termina el 30 nov 2026 (previsto)» si sigue en curso. */
export function seasonHeadDates(s: Pick<Season, 'status' | 'startsOn' | 'endsOn'>): string {
  return s.status === 'active' && s.endsOn ? `${shortDay(s.startsOn)} – termina el ${shortDay(s.endsOn)} (previsto)` : seasonDates(s);
}

/** El campeón de la temporada (si ya tiene). */
export const seasonChampion = (s: Pick<Season, 'awards'>): SeasonAward | null => s.awards.find((a) => a.kind === 'campeon') ?? null;

/** Las ligas de equipos copian sus equipos a la temporada nueva. */
export const seasonCopiesTeams = (sport: string | null | undefined): boolean => sportMeta(sport)?.family === 'team';

/** Cómo se llaman los equipos en los premios: «Parejas» en raqueta, «Equipos» en lo demás. */
export const awardTeamWord = (sport: string | null | undefined): string => (sportMeta(sport)?.family === 'racket' ? 'Parejas' : 'Equipos');

/** MVP, más mejorado y fair play dicen «(opcional)». */
export const optionalAward = (kind: AwardKind): boolean => kind === 'mvp' || kind === 'mas_mejorado' || kind === 'fair_play';

/**
 * A quién se le puede dar un premio (jugadores con `playerId` o equipos con `teamId`): los de la tabla del deporte y,
 * aunque ya no estén en su lista (se borró de un equipo), quien ya tenía un premio o sale en la tabla guardada. Por
 * nombre, sin repetir.
 */
export function awardOptions(base: readonly Awardee[], awards: readonly Pick<SeasonAward, 'playerId' | 'teamId' | 'name'>[], snapshot: SeasonSnapshot, key: 'playerId' | 'teamId'): Awardee[] {
  const known = (id: string) => base.some((x) => x.id === id);
  const extra = awards.filter((a) => a[key] && !known(a[key]!)).map((a) => ({ id: a[key]!, name: a.name }));
  const fromTable = snapshot.tables.flatMap((t) => t.rows.filter((r) => r[key] && !known(r[key]!)).map((r) => ({ id: r[key]!, name: r.name })));
  const all = [...base, ...extra, ...fromTable];
  return all.filter((p, i) => all.findIndex((x) => x.id === p.id) === i).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/**
 * Lo que se dice al cerrar o corregir: si el campeón sale de la final de un playoff ya terminado, si hay uno en juego
 * (su final todavía no se juega y el campeón saldría de la tabla) y la nota del podio que propone el deporte
 * (`podium` de SeasonTableResult: el cuadro del torneo, o null si la tabla va por grupos).
 */
export function closeSeasonNotes(
  season: Pick<Season, 'status' | 'playoffs'>,
  podium: SeasonTableResult['podium'],
): { closed: boolean; fromPlayoff: boolean; running: boolean; podiumNote: string | null } {
  const closed = season.status === 'closed';
  const fromPlayoff = !closed && season.playoffs.some((p) => p.status === 'finished' && p.champion);
  const running = !closed && season.playoffs.some((p) => p.status === 'active');
  const podiumNote =
    closed || fromPlayoff || podium === undefined
      ? null
      : podium
        ? 'El campeón y el subcampeón salen de la final del cuadro. Puedes cambiarlos.'
        : 'La tabla va por grupos: elige tú el campeón, el subcampeón y el tercero.';
  return { closed, fromPlayoff, running, podiumNote };
}
