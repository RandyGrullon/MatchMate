/**
 * Natación: quién es quién en la liga (admin, cronometrista, entrenador), los nombres de los nadadores, el título de un
 * encuentro y los clubes por id. Sin pantallas (salió de bits.tsx, que lo re-exporta): lo usan la web y la app del
 * teléfono.
 */
import { useMemo } from 'react';
import { useAuth } from '../../../lib/auth';
import { usePlayers } from '../../../lib/data';
import { useSwimClubs, type SwimClub, type SwimMeet } from '../../../lib/data/swimming';
import { formatDate } from '../../../lib/format';
import { useLeagueCtx } from '../../../lib/league';

/** La liga más lo propio de la natación: cronometrista (anotador de la liga) y los clubes que entrena la cuenta. */
export function useSwim() {
  const ctx = useLeagueCtx();
  const { user } = useAuth();
  const clubs = useSwimClubs(ctx.lid);
  const uid = user?.uid ?? null;
  const coachOf = useMemo(() => new Set(clubs.data.filter((c) => uid && c.coachId === uid).map((c) => c.id)), [clubs.data, uid]);
  return {
    ...ctx,
    uid,
    clubs,
    /** Admin o cronometrista (el anotador de la liga): toma tiempos y publica series. */
    isTimer: ctx.isAdmin || ctx.member?.scorer === true,
    /** Clubes que entrena esta cuenta. */
    coachOf,
  };
}

/** Nombre de cada jugador de la liga (los borrados salen como «(nadador borrado)»). */
export function useNames(lid: string) {
  const players = usePlayers(lid);
  return useMemo(() => {
    const m = new Map(players.data.map((p) => [p.id, p.name] as const));
    return { players, name: (id: string) => m.get(id) ?? '(nadador borrado)' };
  }, [players]);
}

/** «Copa Delfín», o sin nombre: «Encuentro 10 oct 2026» / «Control de marcas 10 oct 2026». */
export const meetTitle = (m: Pick<SwimMeet, 'type' | 'name' | 'date'>) =>
  m.name || `${m.type === 'control' ? 'Control de marcas' : m.type === 'torneo' ? 'Torneo' : 'Encuentro'} ${formatDate(m.date)}`;

export function clubMap(clubs: readonly SwimClub[]) {
  return new Map(clubs.map((c) => [c.id, c] as const));
}
