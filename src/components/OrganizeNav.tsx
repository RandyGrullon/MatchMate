import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '../lib/auth';
import { useMyMemberships } from '../lib/data/members';
import { pendingTotal, useLeaguePending, type LeaguePending } from '../lib/data/organizer';
import { organizeHref, organizedLeagueIds } from '../lib/organize';
import { useNotifications } from './Notifications';

/**
 * El número de la pestaña «Organizar» (solo en Pro): todo lo que espera por ti en las ligas que organizas (juegos por
 * aprobar, reclamos, resultados vencidos, listas de espera, de league_pending, más las notas nuevas del buzón). Es el
 * mismo número que la fila «Organizas esta liga» de la Liga (useLeagueToDo) y lo que lista «Por hacer» en Hoy.
 *
 * Cada liga se cuenta con su propio componente (los hooks no van en un ciclo) y lo cuenta en una copia compartida: así
 * la barra, que se vuelve a montar en cada pantalla, sale con el número de una vez, sin parpadear.
 */

/** Más ligas que esto no se cuentan en la barra (quien organiza tantas las ve todas en Organizar). */
export const MAX_COUNTED = 8;

const counts = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;

function setCount(lid: string, n: number) {
  if ((counts.get(lid) ?? 0) === n) return;
  if (n) counts.set(lid, n);
  else counts.delete(lid);
  version++;
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const snapshot = () => version;

/** La suma de lo pendiente en esas ligas (lo último que se contó de cada una). */
export function pendingSum(lids: readonly string[]): number {
  return lids.reduce((sum, lid) => sum + (counts.get(lid) ?? 0), 0);
}

/** Solo pruebas: lo contado vuelve a cero (y se puede poner un número a mano). */
export function setPendingCountForTests(lid: string, n: number): void {
  setCount(lid, n);
}

/** Lo que suma una liga: lo pendiente (league_pending) más sus notas nuevas del buzón (las de la campana). */
export function leagueCount(p: LeaguePending | null | undefined, feeds: readonly { lid: string; suggestions: readonly unknown[] }[], lid: string): number {
  return pendingTotal(p) + (feeds.find((f) => f.lid === lid)?.suggestions.length ?? 0);
}

/** Cuenta lo pendiente de una liga (no dibuja nada). */
function PendingProbe({ lid }: { lid: string }) {
  const { feeds } = useNotifications();
  const n = leagueCount(useLeaguePending(lid).data, feeds, lid);
  useEffect(() => setCount(lid, n), [lid, n]);
  return null;
}

/**
 * La pestaña «Organizar»: a dónde lleva (dentro de una liga que organizas, a su Organizar; si no, a /organizar), cuántas
 * cosas esperan y los contadores que hay que montar (`probes`, en cualquier parte de la barra). Apagado (Lite o sin
 * cuenta) no pide nada.
 */
export function useOrganize(enabled: boolean): { href: string; total: number; probes: ReactNode } {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const members = useMyMemberships(enabled ? user?.uid : undefined);
  useSyncExternalStore(subscribe, snapshot, snapshot);
  const organized = enabled ? organizedLeagueIds(members.data) : [];
  const counted = organized.slice(0, MAX_COUNTED);
  return {
    href: organizeHref(pathname, organized),
    total: enabled ? pendingSum(counted) : 0,
    probes: counted.map((lid) => <PendingProbe key={lid} lid={lid} />),
  };
}
