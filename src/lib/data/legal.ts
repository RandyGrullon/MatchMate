import { useMemo } from 'react';
import type { AccountProfile } from '../auth';
import { BLOCKED_MESSAGE, isBlockedError } from '../backend/errors';
import { asBackendError, isOutdatedAppError } from '../db/errors';
import { acceptedNow, CURRENT_LEGAL, latestAccepted, type LegalAccepted, type LegalDocKey } from '../legal';
import { invalidate, queryClient, rpc, select, type Live } from './client';
import { keys, tags } from './keys';

/**
 * Aceptación de los términos y la privacidad (20260929000900_legal.sql). La cuenta lee sus filas de
 * `legal_acceptances` (la RLS: las propias) y acepta con `accept_legal` (solo las versiones vigentes). El perfil de
 * auth.tsx trae la última versión aceptada (`profile.legal`) y de ahí sale `needsLegal`.
 * Consola: `admin_legal_stats` (cuántas cuentas aceptaron lo vigente). Versiones y textos: src/lib/legal.ts.
 */

// ---------- Cuenta ----------

/** La última versión que aceptó la cuenta de cada documento. */
export async function fetchLegalAccepted(uid: string): Promise<LegalAccepted> {
  const rows = await select<{ doc: string; version: string }>({
    table: 'legal_acceptances',
    columns: 'doc,version',
    filters: [{ col: 'user_id', op: 'eq', value: uid }],
  });
  return latestAccepted(rows);
}

/** Acepta las versiones vigentes (las dos a la vez) y pone al día el perfil de la cuenta (sale de la pantalla). */
export async function acceptLegal(uid: string): Promise<void> {
  await rpc('accept_legal', { p_terms: CURRENT_LEGAL.terms, p_privacy: CURRENT_LEGAL.privacy });
  queryClient.setQueryData<AccountProfile | null>(keys.profile(uid), (old) => (old ? { ...old, legal: acceptedNow(old.legal) } : (old ?? null)));
  invalidate(tags.profile(uid));
}

/**
 * ¿accept_legal dijo 'invalido'? Es lo único que lo lanza: la base tiene otras versiones que esta app. Puede ser que
 * la app quedó vieja en el teléfono o que se publicó la app antes que la migración (el orden es al revés: ver
 * src/lib/legal.ts). Desde aquí no se sabe cuál, así que LegalGate deja seguir por esta vez y lo reporta.
 */
export function isLegalVersionMismatch(e: unknown): boolean {
  if (isBlockedError(e)) return false;
  const msg = (e instanceof Error ? e.message : String(e ?? '')).trim();
  return msg.split(/[\s:]/)[0] === 'invalido';
}

/**
 * ¿La base no tiene accept_legal (PGRST202 en PostgREST, 42883 en Postgres; o una columna o función que usa)? Se
 * publicó la app antes que 20260929000900_legal.sql o PostgREST no recargó su caché. Como con las versiones que no
 * coinciden, LegalGate deja seguir por esta vez: nadie se queda trancado por algo que no puede arreglar.
 */
export function isLegalMissing(e: unknown): boolean {
  return !isBlockedError(e) && isOutdatedAppError(e);
}

/** ¿La base no puede guardar la aceptación de esta app (otras versiones o sin accept_legal)? */
export const legalCannotBeSaved = (e: unknown): boolean => isLegalVersionMismatch(e) || isLegalMissing(e);

/**
 * Lo que llega a Errores de la consola cuando la base no puede guardar la aceptación: otras versiones (la consola ›
 * Legal muestra las de la base) o sin accept_legal.
 */
export const legalMismatchText = (e?: unknown) =>
  isLegalMissing(e)
    ? `accept_legal: la base no tiene la función (falta 20260929000900_legal.sql o PostgREST no recargó su caché; términos ${CURRENT_LEGAL.terms}, privacidad ${CURRENT_LEGAL.privacy})`
    : `accept_legal: la base no tiene las versiones de la app (términos ${CURRENT_LEGAL.terms}, privacidad ${CURRENT_LEGAL.privacy})`;

/**
 * Acepta; si la base no lo puede guardar (legalCannotBeSaved), no falla: devuelve el texto para Errores de la consola
 * y LegalGate deja seguir por esta vez. null = quedó guardado. Lo demás (sin señal, bloqueada…) se lanza.
 */
export async function acceptLegalOrSkip(uid: string): Promise<string | null> {
  try {
    await acceptLegal(uid);
    return null;
  } catch (e) {
    if (!legalCannotBeSaved(e)) throw e;
    return legalMismatchText(e);
  }
}

/** El error de aceptar en palabras simples (lo que la base no puede guardar no llega aquí: ver legalCannotBeSaved). */
export function legalErrorMessage(e: unknown): string {
  if (isBlockedError(e)) return BLOCKED_MESSAGE;
  const be = asBackendError(e);
  if (be?.kind === 'network') return 'Sin conexión. Prueba otra vez cuando tengas señal.';
  if (be?.kind === 'auth') return 'Tu sesión venció. Entra de nuevo.';
  return 'No se pudo guardar. Prueba otra vez.';
}

// ---------- Consola del superadmin ----------

export interface AdminLegalStats {
  /** Versiones vigentes según la base (las compara con las de la app). */
  terms: string;
  privacy: string;
  accounts: number;
  /** Aceptaron las dos versiones vigentes. */
  accepted: number;
  acceptedTerms: number;
  acceptedPrivacy: number;
  /** No aceptaron ninguna versión nunca. */
  never: number;
  /** Aceptaron lo vigente en los últimos 7 días. */
  last7d: number;
  byVersion: { doc: LegalDocKey; version: string; accounts: number }[];
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function toAdminLegalStats(raw: unknown): AdminLegalStats | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = obj(raw);
  return {
    terms: str(r.terms),
    privacy: str(r.privacy),
    accounts: num(r.accounts),
    accepted: num(r.accepted),
    acceptedTerms: num(r.acceptedTerms),
    acceptedPrivacy: num(r.acceptedPrivacy),
    never: num(r.never),
    last7d: num(r.last7d),
    byVersion: (Array.isArray(r.byVersion) ? r.byVersion : []).map((x) => {
      const o = obj(x);
      return { doc: o.doc === 'privacidad' ? 'privacidad' : 'terminos', version: str(o.version), accounts: num(o.accounts) };
    }),
  };
}

export const ADMIN_LEGAL_TAG = 'admin:legal';

/** Cuántas cuentas aceptaron lo vigente (no se guarda en el teléfono). */
export function useAdminLegalStats(enabled: boolean): Live<AdminLegalStats | null> {
  const st = queryClient.useQuery<AdminLegalStats | null>(
    enabled ? 'admin:legal' : null,
    async () => toAdminLegalStats(await rpc('admin_legal_stats')),
    { initial: null, tags: [tags.admin, ADMIN_LEGAL_TAG, tags.users], persist: false },
  );
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}
