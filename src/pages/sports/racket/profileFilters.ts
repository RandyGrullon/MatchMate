import type { Match } from '../../../lib/data/matches';
import { MODALITY_LABEL, type Modality } from './logic/modality';
import { isPointsMatch } from './logic/results';

/**
 * Lo puro de la página del jugador en Pro (Profile.tsx; la app del teléfono lo usa igual): qué partidos contar (Todo,
 * por modalidad o por tipo) y cuáles entran con cada filtro.
 */

export type ProfileFilter = 'todo' | 'sets' | 'noches' | Modality;

/**
 * Los filtros de «Qué partidos contar»: Todo; Individual y Dobles si jugó de las dos (si no, «Liga y torneos» donde hay
 * noches); y las noches del deporte («Noches», «Round robin»).
 */
export function profileFilters(o: { split: boolean; nights: boolean; nightsWord: string }): { key: ProfileFilter; label: string }[] {
  return [
    { key: 'todo', label: 'Todo' },
    ...(o.split
      ? [
          { key: 'individual' as ProfileFilter, label: MODALITY_LABEL.individual },
          { key: 'dobles' as ProfileFilter, label: MODALITY_LABEL.dobles },
        ]
      : o.nights
        ? [{ key: 'sets' as ProfileFilter, label: 'Liga y torneos' }]
        : []),
    ...(o.nights ? [{ key: 'noches' as ProfileFilter, label: o.nightsWord }] : []),
  ];
}

/** Los partidos que cuentan con el filtro: los de sets, los de las noches o los de una modalidad (`kinds`). */
export function scopeProfileMatches<M extends Pick<Match, 'format'>>(all: readonly M[], filter: ProfileFilter, kinds: Readonly<Record<Modality, readonly M[]>>): M[] {
  return all.filter((m) => {
    if (filter === 'sets') return !isPointsMatch(m);
    if (filter === 'noches') return isPointsMatch(m);
    if (filter === 'individual' || filter === 'dobles') return kinds[filter].includes(m);
    return true;
  });
}
