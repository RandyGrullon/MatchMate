import { claimConflictList, claimErrorText, type ClaimConflict, type ClaimStatus, type PlayerClaim } from '../../lib/data/claims';
import type { Member } from '../../lib/types';
import { ago } from './logic';

/**
 * Lo que no es pantalla de Organizar › Reclamos (ClaimsPanel.tsx de la web y movil/src/components/claims de la app):
 * de quién es cada pedido, la línea debajo del nombre, los textos de aprobar y rechazar, el aviso de después y el
 * problema cuando los dos jugadores no se pueden juntar. Funciones puras (pruebas en panel.test.ts).
 */

/** La cuenta que pide: su nombre en la liga, su correo (solo lo lee el superadmin) y su jugador propio en la liga. */
export interface ClaimAccount {
  name: string;
  email: string | null;
  playerId: string | null;
}

/** Las cuentas de la liga por id (para cada pedido), con el correo si se pudo leer. */
export function claimAccounts(
  members: readonly Pick<Member, 'uid' | 'name' | 'playerId'>[],
  users: readonly { id: string; email: string | null }[],
): Map<string, ClaimAccount> {
  const byUid = new Map<string, ClaimAccount>();
  const mail = new Map(users.map((u) => [u.id, u.email] as const));
  for (const m of members) byUid.set(m.uid, { name: m.name, email: mail.get(m.uid) ?? null, playerId: m.playerId });
  return byUid;
}

/** Debajo del nombre: «Cuenta: Ana · ana@… · hace 2 días» (la cuenta solo si se llama distinto que al pedir). */
export function claimMeta(c: Pick<PlayerClaim, 'claimantName' | 'requestedAt'>, account: ClaimAccount | null, now = Date.now()): string {
  const accountName = account?.name?.trim();
  return `${accountName && accountName !== c.claimantName ? `Cuenta: ${accountName} · ` : ''}${account?.email ? `${account.email} · ` : ''}${ago(c.requestedAt, now)}`;
}

/** El jugador propio de la cuenta (lo que ya jugó con ella), si es otro que el pedido; null = «Nada todavía». */
export const ownPlayerOf = (c: Pick<PlayerClaim, 'playerId'>, account: ClaimAccount | null): string | null =>
  account?.playerId && account.playerId !== c.playerId ? account.playerId : null;

/** Los textos de la hoja de aprobar o rechazar. */
export function decideCopy(c: Pick<PlayerClaim, 'claimantName' | 'playerName'>, approve: boolean) {
  return {
    title: approve ? 'Aprobar reclamo' : 'Rechazar reclamo',
    message: approve
      ? `${c.claimantName} queda como ${c.playerName}: lo que jugó cada uno se junta en un solo jugador y su cuenta sigue con él. Esto no se puede deshacer.`
      : `${c.claimantName} no queda como ${c.playerName} y sigue con su propio jugador. Le avisamos.`,
    noteLabel: `Nota para ${c.claimantName} (opcional)`,
    placeholder: approve ? 'Bienvenido' : 'Ese no eres tú: habla conmigo',
    confirmText: approve ? 'Aprobar' : 'Rechazar',
  };
}

/** El aviso después de decidir (`status`: cómo quedó; si otro admin ya lo había decidido, lo que decidió él). */
export function decideDoneText(c: Pick<PlayerClaim, 'claimantName' | 'playerName'>, approve: boolean, status: ClaimStatus): string {
  const other = (approve && status !== 'approved') || (!approve && status !== 'rejected');
  if (other) return 'Otro admin ya lo había decidido.';
  return approve ? `Listo: ${c.claimantName} ahora es ${c.playerName}.` : `Rechazado. ${c.claimantName} sigue con su propio jugador.`;
}

/** Lo que dice la hoja cuando no se pueden juntar (y la lista de lo que choca debajo). */
export const CLAIM_CONFLICT_TEXT = 'No se pueden juntar los dos jugadores porque los dos aparecen en lo mismo:';

/** Debajo de la lista de lo que choca. */
export const CLAIM_CONFLICT_HELP =
  'Una misma persona no puede estar dos veces en el mismo evento o partido. Borra lo repetido (el juego o el partido de uno de los dos) y aprueba otra vez.';

/** El problema que muestra la hoja: lo que choca (antes de aprobar, de player_claim_conflicts) o el error. */
export interface DecideProblem {
  text: string;
  list: string[] | null;
}

/** Lo que choca antes de aprobar («Juegos en el mismo evento (1)»); null si no choca nada. */
export function conflictsProblem(conflicts: readonly ClaimConflict[]): DecideProblem | null {
  return conflicts.length ? { text: CLAIM_CONFLICT_TEXT, list: conflicts.map((x) => `${x.label} (${x.count})`) } : null;
}

/** El error al decidir: lo que choca (si la base dijo 'conflicto: …') o el texto de siempre. */
export function decideProblem(e: unknown): DecideProblem {
  const list = claimConflictList(e);
  return list ? { text: CLAIM_CONFLICT_TEXT, list } : { text: claimErrorText(e), list: null };
}
