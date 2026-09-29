import type { InvitePerson, InviteStatus } from '../../lib/data/invites';
import type { LeagueKind, Visibility } from '../../lib/types';
import { atUsername } from '../social/socialFormat';

/**
 * Textos de las invitaciones a una liga para la cuenta invitada (sin React: se prueban solos). Los usan la tarjeta
 * «Invitaciones» de Avisos y la pantalla /invitacion/<id>.
 */

/** «Ana Pérez (@ana)», «Ana Pérez» (sin @usuario) o null (ya no tiene cuenta). */
export function inviterText(by: InvitePerson | null | undefined): string | null {
  const name = by?.name?.trim();
  if (!by || !name) return null;
  const handle = atUsername(by.username);
  return handle ? `${name} (${handle})` : name;
}

/** «Ana Pérez (@ana) te invitó» o «Te invitaron» (sin quien invitó). */
export function invitedByLine(by: InvitePerson | null | undefined): string {
  const who = inviterText(by);
  return who ? `${who} te invitó` : 'Te invitaron';
}

/** «Torneo», «Liga pública» o «Liga privada». */
export const leagueTypeLabel = (kind: LeagueKind, visibility: Visibility) =>
  kind === 'torneo' ? 'Torneo' : visibility === 'public' ? 'Liga pública' : 'Liga privada';

/** «la liga» o «el torneo». */
export const leagueNoun = (kind: LeagueKind) => (kind === 'torneo' ? 'el torneo' : 'la liga');

/** El aviso al aceptar: «Te uniste a Liga de los martes». */
export const joinedText = (leagueName: string) => `Te uniste a ${leagueName.trim() || 'la liga'}`;

/**
 * Cómo quedó una invitación para quien la mira: la de `status`, pero 'accepted' solo si todavía está en la liga
 * ('left': la aceptó y después salió o lo sacaron); una pendiente de quien ya es miembro, 'accepted'.
 */
export type InviteOutcome = Exclude<InviteStatus, 'pending'> | 'left';

export function inviteOutcomeOf(status: InviteStatus, member: boolean): InviteOutcome {
  if (member) return 'accepted';
  if (status === 'accepted') return 'left';
  return status === 'pending' ? 'cancelled' : status;
}

/** Lo que dice la pantalla de una invitación que ya no está pendiente (o de quien ya es miembro). */
export function inviteOutcome(status: InviteOutcome, kind: LeagueKind, leagueName: string): { title: string; body: string } {
  const noun = leagueNoun(kind);
  const name = leagueName.trim() || noun;
  switch (status) {
    case 'accepted':
      return { title: `Ya estás en ${noun}`, body: `Eres parte de ${name}. Entra para ver lo que viene.` };
    case 'left':
      return {
        title: `Ya no estás en ${noun}`,
        body: `Aceptaste esta invitación, pero ya no eres parte de ${name}. Si quieres volver, pídele a alguien de ${noun} el link.`,
      };
    case 'declined':
      return { title: 'Rechazaste esta invitación', body: `Si cambias de idea, pídele a alguien de ${name} que te invite otra vez o que te pase el link.` };
    default:
      return { title: 'Esta invitación ya no está disponible', body: `La retiraron o ${name} cambió. Pídele a un admin el link para unirte.` };
  }
}

/** El aviso cuando al responder la invitación ya no valía o ya estaba decidida. */
export function respondedText(status: InviteStatus, leagueName: string): string {
  if (status === 'accepted') return joinedText(leagueName);
  if (status === 'declined') return 'Rechazaste la invitación';
  if (status === 'cancelled') return 'Esta invitación ya no está disponible.';
  return 'No se pudo. Prueba otra vez.';
}
