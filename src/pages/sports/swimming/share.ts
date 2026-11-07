/**
 * Natación: las imágenes para mandar al grupo (salieron de ResultsPanel y StandingsPage, que las importan de aquí): una
 * prueba con sus categorías, los puntos por club de un encuentro y los de la temporada. Sin pantallas: las usan la web y
 * la app del teléfono.
 */
import { medalPointsShare } from '../../../components/share/adapters';
import type { ShareTableSpec } from '../../../components/share/cards';
import type { SwimClub, SwimEventItem, SwimMeet } from '../../../lib/data/swimming';
import { GENDER_LABEL, STATUS_LABEL, formatSwimTime, type TeamScore } from '../../../sports/swimming';
import { groupLabel, pointsText as pts, raceName, raceTitle, scores, type MeetData, type ResultGroup, type SeasonTable } from './logic';
import { meetTitle } from './swim';

/**
 * Imagen de una prueba para mandar al grupo: cada categoría con el puesto, el club, el tiempo (o DQ, «No
 * salió») y los puntos (si el encuentro da puntos).
 */
export function raceShare(data: Pick<MeetData, 'meet' | 'clubs' | 'name'>, ev: SwimEventItem, groups: readonly ResultGroup[]): ShareTableSpec {
  const { meet, clubs, name } = data;
  const withPoints = scores(meet);
  return {
    kind: 'table',
    title: meetTitle(meet),
    subtitle: raceTitle(ev),
    nameLabel: 'Nadador',
    columns: [...(withPoints ? [{ label: 'Pts', optional: true }] : []), { label: 'Tiempo', strong: true }],
    sections: groups.map((g) => ({
      heading: `${GENDER_LABEL[g.gender]} · ${groupLabel(g.ageGroup)}`,
      rows: g.rows.map((r) => {
        const club = r.teamId ? clubs.get(r.teamId) : null;
        const sub = [club?.name, r.tied ? 'empate' : null].filter(Boolean).join(' · ');
        return {
          rank: r.place,
          name: name(r.swimmerId),
          ...(sub ? { sub } : {}),
          dot: club?.color ?? null,
          dim: r.place == null,
          values: [...(withPoints ? [r.points > 0 ? pts(r.points) : ''] : []), r.status === 'ok' ? formatSwimTime(r.time) : STATUS_LABEL[r.status]],
        };
      }),
    })),
    note: meet.finalizedAt ? undefined : 'Resultados provisionales hasta que el organizador finalice el encuentro.',
    caption: `${meetTitle(meet)} · ${raceName(ev)}`,
  };
}

/** Imagen de los puntos por club de un encuentro (con las medallas) para mandar al grupo. */
export function meetPointsShare(meet: SwimMeet, rows: readonly TeamScore[], clubs: ReadonlyMap<string, Pick<SwimClub, 'name' | 'color'>>): ShareTableSpec {
  return medalPointsShare({
    title: meetTitle(meet),
    subtitle: meet.finalizedAt ? 'Puntos por club' : 'Puntos por club · Provisional',
    rows: rows.map((c) => ({ ...c, id: c.teamId })),
    who: (id) => clubs.get(id) ?? { name: '(club borrado)' },
    note: `Puntos por puesto: ${meet.points.join('-')}. En un empate se reparten.`,
  });
}

/**
 * Imagen de los puntos de la temporada para mandar al grupo. `season`: el nombre de la temporada elegida (con
 * temporadas) o el año (sin temporadas).
 */
export function seasonPointsShare(o: {
  leagueName: string;
  shown: string;
  withSeasons: boolean;
  table: Pick<SeasonTable, 'clubs' | 'meets'>;
  clubs: ReadonlyMap<string, Pick<SwimClub, 'name' | 'color'>>;
}): ShareTableSpec {
  const { table } = o;
  return medalPointsShare({
    title: o.leagueName,
    subtitle: o.withSeasons ? `Puntos · ${o.shown}` : `Puntos de la temporada ${o.shown}`,
    rows: table.clubs.map((c) => ({ ...c, id: c.clubId })),
    who: (id) => o.clubs.get(id) ?? { name: '(club borrado)' },
    note: `Suma de ${table.meets.length} ${table.meets.length === 1 ? 'encuentro' : 'encuentros'}. El control de marcas no cuenta.`,
  });
}
