/**
 * Los derechos de la persona sobre su cuenta (Ley 172-13): bajar sus datos, borrar la cuenta (con el traspaso
 * guiado de las ligas a su nombre) y lo que queda en el teléfono después de borrarla.
 *
 * Base: supabase/migrations/20260927001500_cuenta.sql (`export_my_data`, `prepare_delete_account`). El borrado lo
 * hace la Edge Function `delete-account` (en el modo local, el manejador de src/lib/backend/local.ts): primero
 * revisa lo mismo que `prepare_delete_account` y después borra la cuenta con la API de administración.
 */
import { CONFIRM_WORD } from '../../../supabase/functions/delete-account/core';
import { BLOCKED_MESSAGE, isBlockedError } from '../../lib/backend/errors';
import { seenKey } from '../../lib/data/admin';
import { backend, currentOutbox, queryClient, rpc } from '../../lib/data/client';
import { asBackendError } from '../../lib/db/errors';
import type { LeagueKind } from '../../lib/types';

/** La palabra que hay que escribir para borrar la cuenta (la misma que exige la Edge Function). */
export const DELETE_WORD = CONFIRM_WORD;

export type DeleteBlocker = 'owned_leagues' | 'last_superadmin';

export interface DeletePlanMember {
  userId: string;
  /** Su nombre en esa liga (league_members.display_name). */
  name: string;
  role: 'admin' | 'member';
}

/** Una liga a su nombre: hay que pasársela a otro miembro o borrarla antes de borrar la cuenta. */
export interface DeletePlanLeague {
  id: string;
  name: string;
  sport: string;
  kind: LeagueKind;
  /** Los otros miembros (sin contarla a ella). */
  memberCount: number;
  /** Hasta 200, los admins primero. */
  members: DeletePlanMember[];
}

export interface DeletePlan {
  canDelete: boolean;
  blockers: DeleteBlocker[];
  ownedLeagues: DeletePlanLeague[];
  /** Lo que se borra con la cuenta (para mostrarlo antes de confirmar). */
  summary: { leagues: number; players: number; comments: number; reactions: number; devices: number };
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Lo que manda prepare_delete_account → DeletePlan (una fila rara nunca rompe la pantalla). */
export function toDeletePlan(raw: unknown): DeletePlan {
  const r = obj(raw);
  const blockers = list(r.blockers).filter((b): b is DeleteBlocker => b === 'owned_leagues' || b === 'last_superadmin');
  const ownedLeagues = list(r.ownedLeagues).map((x): DeletePlanLeague => {
    const l = obj(x);
    const members = list(l.members).map((m): DeletePlanMember => {
      const o = obj(m);
      return { userId: str(o.userId), name: str(o.name) || 'Miembro', role: o.role === 'admin' ? 'admin' : 'member' };
    });
    return {
      id: str(l.id),
      name: str(l.name),
      sport: str(l.sport),
      kind: l.kind === 'torneo' ? 'torneo' : 'liga',
      memberCount: Math.max(num(l.memberCount), members.length),
      members: members.filter((m) => m.userId),
    };
  });
  const s = obj(r.summary);
  return {
    // Sin la marca de la base no se borra nada (tampoco con ligas o bloqueos que la base sí mandó).
    canDelete: r.canDelete === true && blockers.length === 0 && ownedLeagues.length === 0,
    blockers,
    ownedLeagues,
    summary: { leagues: num(s.leagues), players: num(s.players), comments: num(s.comments), reactions: num(s.reactions), devices: num(s.devices) },
  };
}

/** ¿Se puede borrar ya? Si no, qué falta (lo que revisa también la Edge Function). */
export async function fetchDeletePlan(): Promise<DeletePlan> {
  return toDeletePlan(await rpc('prepare_delete_account'));
}

/** Cómo se llama el archivo de «Descargar mis datos» (fecha del teléfono). */
export function myDataFileName(now: Date = new Date()): string {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `matchmate-mis-datos-${day}.json`;
}

/** Guarda un JSON en el teléfono o la computadora (en el iPhone abre la hoja para guardarlo o compartirlo). */
export function saveJsonFile(fileName: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Algunos navegadores leen el archivo después del clic: se suelta un momento después.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Todo lo de la cuenta (export_my_data): perfil, ligas, jugadores, partidos y las filas de cada tabla. */
export async function fetchMyData(): Promise<Record<string, unknown>> {
  const data = await rpc<unknown>('export_my_data');
  return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
}

/** «Descargar mis datos»: todo lo de la cuenta en un JSON (como mucho 5 veces por hora). Devuelve el archivo. */
export async function downloadMyData(now: Date = new Date()): Promise<string> {
  const data = await fetchMyData();
  const name = myDataFileName(now);
  saveJsonFile(name, data);
  return name;
}

/**
 * Borra la cuenta que entró (la Edge Function vuelve a revisar todo). Después quita de este teléfono lo que era de
 * ella: la cola sin enviar, la copia de sus datos, los avisos push y la sesión.
 */
export async function deleteMyAccount(uid: string): Promise<void> {
  // Se toma antes: al cerrarse la sesión la app suelta la cola de la cuenta.
  const outbox = currentOutbox()?.userId === uid ? currentOutbox() : null;
  const pending = outbox ? [...outbox.listPending(), ...outbox.listFailed()].map((i) => i.opId) : [];
  await backend().invoke('delete-account', { confirm: DELETE_WORD });
  await forgetAccountOnThisPhone(uid, outbox, pending);
}

async function forgetAccountOnThisPhone(uid: string, outbox: ReturnType<typeof currentOutbox>, pending: string[]): Promise<void> {
  for (const opId of pending) await outbox?.discard(opId).catch(() => undefined);
  try {
    localStorage.removeItem(seenKey(uid));
  } catch {
    // sin almacenamiento
  }
  // La suscripción del navegador (la fila en la base ya se borró con la cuenta).
  await import('../../lib/push').then((m) => m.unsubscribePush(uid)).catch(() => undefined);
  // Supabase: la sesión quedó sin cuenta; en local el manejador ya la cerró.
  await backend().auth.signOut().catch(() => undefined);
  await queryClient.clearPersisted(uid).catch(() => undefined);
}

/** Mensaje en palabras sencillas para un error de bajar los datos, preparar o borrar la cuenta. */
export function accountErrorMessage(e: unknown): string {
  const be = asBackendError(e);
  if (isBlockedError(be ?? e)) return BLOCKED_MESSAGE;
  if (be?.kind === 'network' && !be.code) return 'Sin conexión. Intenta de nuevo cuando vuelva la señal.';
  if (be?.kind === 'rate_limited') return 'Ya lo pediste varias veces en la última hora. Intenta más tarde.';
  // Los de la Edge Function (y del borrado local) ya vienen en español.
  if (be?.code && ['tiene_ligas', 'ultimo_superadmin', 'sesion', 'invalido', 'config', 'servidor'].includes(be.code)) return be.message;
  if (be?.kind === 'auth') return 'Tu sesión venció. Entra de nuevo.';
  if (be?.kind === 'network') return 'No se pudo conectar. Intenta de nuevo en un rato.';
  return 'No se pudo completar. Intenta de nuevo.';
}
