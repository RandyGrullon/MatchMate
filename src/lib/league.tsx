import { createContext, useContext } from 'react';
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
  /** Anotador del torneo (solo en torneos sin liga): anota los juegos de todos. */
  isScorer: boolean;
  /** Puede anotar juegos de cualquiera: admin o anotador. */
  canScore: boolean;
  /** Jugador de la liga vinculado a la cuenta. */
  myPlayerId: string | null;
  /** Ruta base de la liga: `/l/<id>`. */
  base: string;
}

export const LeagueContext = createContext<LeagueCtx | null>(null);

export function useLeagueCtx(): LeagueCtx {
  const ctx = useContext(LeagueContext);
  if (!ctx) throw new Error('useLeagueCtx fuera de una liga');
  return ctx;
}

const LAST = 'bowlinx:liga';

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
