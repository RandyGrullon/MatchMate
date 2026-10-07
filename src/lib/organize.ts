import type { Member } from './types';

/**
 * «Organizar» (la cuarta pestaña de la barra, solo en Pro): las ligas que la cuenta organiza y a dónde lleva. Aquí va
 * lo que no es pantalla (se prueba sin navegador); la pestaña está en src/components/Shell.tsx, su número en
 * src/components/OrganizeNav.tsx y la pantalla `/organizar` en src/pages/OrganizePage.tsx.
 */

/** Las ligas y torneos que la cuenta organiza (dueña o admin), en el orden de sus membresías y sin repetir. */
export function organizedLeagueIds(members: readonly Pick<Member, 'leagueId' | 'role'>[] | null | undefined): string[] {
  const out: string[] = [];
  for (const m of members ?? []) if ((m.role === 'owner' || m.role === 'admin') && !out.includes(m.leagueId)) out.push(m.leagueId);
  return out;
}

/** La liga de la ruta (`/l/:lid/...`), o null. */
export function leagueOfPath(pathname: string): string | null {
  const m = /^\/l\/([^/?#]+)/.exec(pathname);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * A dónde lleva la pestaña «Organizar»: estando dentro de una liga que organizas, directo a su Organizar
 * (`/l/:lid/admin`); si no, a `/organizar`, que va a tu única liga o te deja elegir.
 */
export function organizeHref(pathname: string, organized: readonly string[]): string {
  const lid = leagueOfPath(pathname);
  return lid && organized.includes(lid) ? `/l/${encodeURIComponent(lid)}/admin` : '/organizar';
}

/** Qué hace `/organizar`: con una sola liga (y sin consola de superadmin), ir directo a ella; si no, la lista. */
export function organizeLanding(organized: readonly string[], isSuper: boolean): { redirect: string } | { list: true } {
  return organized.length === 1 && !isSuper ? { redirect: `/l/${encodeURIComponent(organized[0])}/admin` } : { list: true };
}

/** El número del globo: hasta 99 (después «99+»). Vacío si no hay nada. */
export function countLabel(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  return n > 99 ? '99+' : String(Math.floor(n));
}
