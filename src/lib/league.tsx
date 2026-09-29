import { createContext, useContext } from 'react';
import { leagueSport } from '../sports/registry';
import type { League, Member } from './types';

export interface LeagueCtx {
  lid: string;
  league: League;
  /** Membresía de la cuenta en esta liga (null = observador de una liga pública o superadmin). */
  member: Member | null;
  /** Dueño o admin de la liga, o superadmin. */
  isAdmin: boolean;
  /** Dueño (o superadmin): el único que da o quita permisos. */
  isOwner: boolean;
  /**
   * Anotador de la liga: anota los juegos de todos. En boliche, la marca vale solo en un torneo sin liga; para un
   * evento, `canScoreEvent` (en una liga de boliche vale en sus torneos, no en las prácticas).
   */
  isScorer: boolean;
  /** Puede anotar juegos de cualquiera: admin o anotador (de liga; para un evento de boliche, `canScoreEvent`). */
  canScore: boolean;
  /**
   * Entró solo para anotar (link o invitación de anotador) y no tiene jugador: «Mis juegos» le ofrece «También
   * juego» en vez de crearle uno solo.
   */
  scorerOnly?: boolean;
  /** Jugador de la liga vinculado a la cuenta. */
  myPlayerId: string | null;
  /** Ruta base de la liga: `/l/<id>`. */
  base: string;
}

export const LeagueContext = createContext<LeagueCtx | null>(null);

/**
 * ¿La cuenta anota los juegos de todos en ese evento? El admin siempre; el anotador de la liga en un torneo sin liga,
 * en cualquier evento de otro deporte y, en una liga de boliche, en los torneos (no en las prácticas: esas las anota
 * cada jugador y el admin las aprueba). La gemela de private.is_event_scorer.
 */
export function canScoreEvent(
  ctx: Pick<LeagueCtx, 'isAdmin'> & { member: Pick<Member, 'scorer'> | null; league: Pick<League, 'id' | 'kind' | 'sport'> },
  eventType: string | null | undefined,
): boolean {
  if (ctx.isAdmin) return true;
  if (ctx.member?.scorer !== true) return false;
  return ctx.league.kind === 'torneo' || leagueSport(ctx.league) !== 'bowling' || eventType === 'torneo';
}

export function useLeagueCtx(): LeagueCtx {
  const ctx = useContext(LeagueContext);
  if (!ctx) throw new Error('useLeagueCtx fuera de una liga');
  return ctx;
}

const LAST = 'mm:liga';

/** Última liga abierta en este teléfono: la app abre ahí. */
export function rememberLeague(lid: string | null) {
  try {
    if (lid) localStorage.setItem(LAST, lid);
    else localStorage.removeItem(LAST);
  } catch {
    // almacenamiento no disponible
  }
}

export function lastLeague(): string | null {
  try {
    return localStorage.getItem(LAST);
  } catch {
    return null;
  }
}

export const roleLabel = (role: Member['role']) => (role === 'owner' ? 'Dueño' : role === 'admin' ? 'Admin' : 'Miembro');

/** Link de WhatsApp al contacto de la liga (solo dígitos, con código de país). */
export function whatsappUrl(phone: string, text?: string) {
  let digits = phone.replace(/\D/g, '');
  // Números de República Dominicana escritos sin el 1 (809/829/849 + 7 dígitos).
  if (digits.length === 10 && /^8[024]9/.test(digits)) digits = `1${digits}`;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
