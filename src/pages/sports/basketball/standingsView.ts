import type { LeaderColumn } from '../team/leaders';
import { defaultColumns } from '../../../components/match/standings';
import { leadersShare, standingsShare } from '../../../components/share/adapters';
import type { ShareTableSpec } from '../../../components/share/cards';
import type { BasketballTableConfig } from '../../../sports/team/standings';
import type { BasketballTotals } from '../../../sports/team/stats';
import type { StandingRow } from '../../../sports/types';

/**
 * Lo que no es pantalla de la Tabla del baloncesto (BasketballStandings.tsx de la web y la tabla de la app): las columnas
 * de la tabla y de los anotadores, qué se ve (`?ver=`), la línea de cada anotador en Lite y la imagen para compartir.
 */

/** Columnas de la tabla FIBA (puntos a favor y en contra: PF y PC). */
export const TABLE_COLUMNS = defaultColumns({ forLabel: 'PF', againstLabel: 'PC' });

/** Un número con un decimal, como en la web («25,5»). */
const oneDecimal = (n: number) => n.toLocaleString('es-DO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Columnas de la tabla de anotadores. */
export const SCORER_COLUMNS: LeaderColumn<BasketballTotals>[] = [
  { key: 'points', label: 'PTS', title: 'Puntos', value: (r) => r.points },
  { key: 'avg', label: 'Prom', title: 'Promedio de puntos por partido', value: (r) => r.avg, show: (r) => oneDecimal(r.avg) },
  { key: 'games', label: 'PJ', title: 'Partidos jugados (presentes)', value: (r) => r.games },
  { key: 'high', label: 'Máx', title: 'Máximo en un partido', value: (r) => r.high, wide: true },
  { key: 'threes', label: '3P', title: 'Triples anotados', value: (r) => r.threes },
  { key: 'ftm', label: 'TL', title: 'Tiros libres anotados', value: (r) => r.ftm, wide: true },
  { key: 'fouls', label: 'F', title: 'Faltas', value: (r) => r.fouls, wide: true },
];

export type BasketballView = 'tabla' | 'anotadores';

/** Lo que se ve en la Tabla (`?ver=`): la tabla salvo que pida los anotadores. */
export const basketballView = (ver: string | null | undefined): BasketballView => (ver === 'anotadores' ? 'anotadores' : 'tabla');

/** La línea de un anotador en Lite: «25,5 por partido». */
export const scorerLine = (r: Pick<BasketballTotals, 'avg'>) => `${oneDecimal(r.avg)} por partido`;

/** La regla de la tabla en una línea (debajo de la tabla): «Ganar 2 · perder 1 · desempate FIBA». */
export const basketballRuleLine = (t: Pick<BasketballTableConfig, 'win' | 'loss'>) => `Ganar ${t.win} · perder ${t.loss} · desempate FIBA`;

/** «Cómo se cuenta»: los párrafos de la hoja (puntos, forfeit, default y desempate FIBA). */
export function basketballRuleText(t: BasketballTableConfig): string[] {
  return [
    `Ganar da ${t.win} puntos y perder ${t.loss}. Perder por forfeit (no se presentó) da ${t.forfeitLoss} y el forfeit se anota ${t.forfeitScore}-0. Perder por default (se quedó sin jugadores) da ${t.defaultLoss}.`,
    'Desempate FIBA: puntos entre los empatados, diferencia entre ellos, puntos a favor entre ellos, diferencia general y puntos a favor.',
    'Un resultado por confirmar cuenta a las 48 horas.',
  ];
}

/**
 * La imagen de lo que se ve en la Tabla (la tabla o los anotadores) para mandar al grupo (la de Pro): la tabla con el
 * color de cada equipo, o los 20 primeros anotadores con su equipo.
 */
export function basketballShareCard(o: {
  leagueName: string;
  view: BasketballView;
  season: { standings: readonly StandingRow[]; leaders: readonly BasketballTotals[] };
  teamOf: (teamId: string) => { name: string; color?: string | null } | null | undefined;
  nameOf: (playerId: string) => string;
}): ShareTableSpec {
  if (o.view === 'tabla') {
    return standingsShare({
      title: o.leagueName,
      subtitle: 'Tabla de posiciones',
      sections: [{ rows: o.season.standings }],
      columns: TABLE_COLUMNS,
      nameOf: (id) => o.teamOf(id)?.name ?? '(equipo borrado)',
      rowExtra: (id) => ({ dot: o.teamOf(id)?.color ?? null }),
      nameLabel: 'Equipo',
    });
  }
  return leadersShare({ title: o.leagueName, subtitle: 'Anotadores', rows: o.season.leaders, columns: SCORER_COLUMNS, nameOf: o.nameOf, teamOf: o.teamOf, limit: 20 });
}

/** Hay algo que compartir en lo que se ve (equipos en la tabla o anotadores). */
export const basketballCanShare = (view: BasketballView, season: { standings: readonly unknown[]; leaders: readonly unknown[] }) =>
  view === 'tabla' ? season.standings.length > 0 : season.leaders.length > 0;
