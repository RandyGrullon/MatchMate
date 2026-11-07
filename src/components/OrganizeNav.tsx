import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '../lib/auth';
import { useMyMemberships } from '../lib/data/members';
import { organizeHref, organizedLeagueIds } from '../lib/organize';
import { useLeagueCount, useOrganizeTotal } from './organizeCount';

/**
 * El número de la fila «Organizar» de Yo › Configuración (ya no va en la barra de abajo; en Lite y en Pro): todo lo que
 * espera por ti en las ligas que organizas (juegos por aprobar, reclamos, resultados vencidos, listas de espera, de
 * league_pending, más las notas nuevas del buzón). Es el mismo número que la fila «Organizas esta liga» de la Liga
 * (useLeagueToDo) y lo que lista «Por hacer» en Hoy.
 *
 * Cada liga se cuenta con su propio componente (los hooks no van en un ciclo) y lo cuenta en una copia compartida: así
 * la fila, al volver a la pantalla, sale con el número de una vez, sin parpadear.
 */

export { MAX_COUNTED, leagueCount, pendingSum, setPendingCountForTests } from './organizeCount';

/** Cuenta lo pendiente de una liga (no dibuja nada). */
function PendingProbe({ lid }: { lid: string }) {
  useLeagueCount(lid);
  return null;
}

/**
 * «Organizar»: a dónde lleva (dentro de una liga que organizas, a su Organizar; si no, a /organizar), cuántas cosas
 * esperan y los contadores que hay que montar (`probes`, en cualquier parte de la pantalla que muestra el número).
 * Apagado (sin cuenta) no pide nada.
 */
export function useOrganize(enabled: boolean): { href: string; total: number; probes: ReactNode } {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const members = useMyMemberships(enabled ? user?.uid : undefined);
  const organized = enabled ? organizedLeagueIds(members.data) : [];
  const { counted, total } = useOrganizeTotal(organized);
  return {
    href: organizeHref(pathname, organized),
    total: enabled ? total : 0,
    probes: counted.map((lid) => <PendingProbe key={lid} lid={lid} />),
  };
}
