import { useEffect, useSyncExternalStore } from 'react';
import { pendingTotal, useLeaguePending, type LeaguePending } from '../lib/data/organizer';
import { useNotifications } from './notifications/provider';

/**
 * El número de la fila «Organizar» de Yo › Configuración, sin pantalla (lo usan OrganizeNav.tsx en la web y
 * Configuración en la app del teléfono): todo lo que espera por ti en las ligas que organizas (league_pending más las
 * notas nuevas del buzón).
 *
 * Cada liga se cuenta con su propio componente (los hooks no van en un ciclo: `useLeagueCount`) y lo deja en una copia
 * compartida: así la fila, al volver a la pantalla, sale con el número de una vez, sin parpadear.
 */

/** Más ligas que esto no se cuentan en la fila (quien organiza tantas las ve todas en Organizar). */
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

/** Cuenta lo pendiente de una liga y lo deja en la copia compartida (para un componente que no dibuja nada). */
export function useLeagueCount(lid: string): void {
  const { feeds } = useNotifications();
  const n = leagueCount(useLeaguePending(lid).data, feeds, lid);
  useEffect(() => setCount(lid, n), [lid, n]);
}

/** Las ligas que se cuentan (las primeras MAX_COUNTED de las que organizas) y cuánto suman ahora. */
export function useOrganizeTotal(organized: readonly string[]): { counted: string[]; total: number } {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  const counted = organized.slice(0, MAX_COUNTED);
  return { counted, total: pendingSum(counted) };
}
