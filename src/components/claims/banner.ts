import type { PlayerClaim } from '../../lib/data/claims';
import type { Player } from '../../lib/types';
import type { UnitPair } from '../../sports/registry';
import { freePlayers } from '../league/logic';
import type { BannerState } from './logic';

/**
 * Lo que no es pantalla de «Mi reclamo» y «¿Ya jugabas en esta liga? Busca tu nombre» (ClaimBanner) y de pedir un
 * jugador (ClaimRequestModal): lo cerrado en este teléfono, los textos y a quién se puede pedir. Lo usan la web y la app
 * del teléfono (en el teléfono, `localStorage` es el de movil/src/platform/storage.ts, sobre AsyncStorage).
 */

const DISMISSED_KEY = 'mm:reclamo-cerrado';

/** Lo que la cuenta cerró en este teléfono ('<liga>:buscar', '<liga>:rechazo:<pedido>'). */
export function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function saveDismissed(s: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...s].slice(-100)));
  } catch {
    // almacenamiento no disponible
  }
}

/** Lo cerrado más esto de la liga ('buscar' o 'rechazo:<pedido>'). */
export const withDismissed = (s: Set<string>, lid: string, key: string) => new Set(s).add(`${lid}:${key}`);

/** Los jugadores que la cuenta puede decir que es: sin cuenta, no menores y no el suyo, por nombre. */
export const claimableFree = (players: readonly Player[], myPlayerId: string | null) => freePlayers(players).filter((p) => p.id !== myPlayerId);

export interface BannerCopy {
  title: string;
  text: string;
}

/** «Mi reclamo» pendiente (con «Cancelar pedido»). */
export const pendingCopy = (c: Pick<PlayerClaim, 'playerName'>): BannerCopy => ({
  title: 'Mi reclamo: pendiente de aprobación',
  text: `Pediste ser ${c.playerName}. Cuando el admin lo apruebe, tu cuenta queda con sus juegos. Mientras, juegas con tu cuenta.`,
});

/** «Mi reclamo» rechazado, con la nota del admin si dejó una. */
export const rejectedCopy = (c: Pick<PlayerClaim, 'playerName' | 'decisionNote'>): BannerCopy => ({
  title: 'Mi reclamo: no se aprobó',
  text: `No quedaste como ${c.playerName}.${c.decisionNote ? ` El admin dice: «${c.decisionNote}».` : ' Si es un error, habla con el admin.'}`,
});

/** La invitación a buscar su nombre (`people`: jugador o nadador). */
export const searchCopy = (people: UnitPair): BannerCopy => ({
  title: '¿Ya jugabas en esta liga? Busca tu nombre',
  text: `Si el admin ya te había anotado, pide ese ${people[0]} y tus resultados quedan con tu cuenta.`,
});

/** El título y el texto de la tarjeta del inicio de la liga (null si no sale). */
export function bannerCopy(state: BannerState, people: UnitPair): BannerCopy | null {
  if (state.kind === 'pending') return pendingCopy(state.claim);
  if (state.kind === 'rejected') return rejectedCopy(state.claim);
  if (state.kind === 'search') return searchCopy(people);
  return null;
}

/** El botón de la lista «Busca tu nombre»: «Soy <nombre>» o «No estoy en la lista». */
export const pickConfirmText = (picked: Pick<Player, 'name'> | null) => (picked ? `Soy ${picked.name}` : 'No estoy en la lista');

/** El toast al cancelar el pedido. */
export const CLAIM_CANCELLED_TEXT = 'Cancelaste el pedido.';

/** Los textos de «¿Eres <nombre>?» (pedir ser ese jugador). Si quien pide es admin, queda al momento. */
export function claimRequestCopy(name: string, isAdmin: boolean) {
  return {
    title: `¿Eres ${name}?`,
    message: isAdmin
      ? `Como eres admin, quedas como ${name} al momento, con todo lo que jugó.`
      : `El admin de la liga tiene que aprobarlo. Cuando lo apruebe, tu cuenta queda con ${name} y todo lo que jugó. Mientras, juegas con tu cuenta.`,
    confirmText: 'Sí, soy yo',
    noteLabel: 'Nota para el admin (opcional)',
    notePlaceholder: 'Soy yo, jugaba los martes',
  };
}

/** El toast después de pedirlo. */
export const claimRequestDoneText = (name: string, isAdmin: boolean) =>
  isAdmin ? `Listo: ahora eres ${name}.` : `Pediste ser ${name}. Queda pendiente de aprobación del admin.`;
