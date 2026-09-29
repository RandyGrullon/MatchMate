import { describe, expect, it } from 'vitest';
import { invitedByLine, inviteOutcome, inviteOutcomeOf, inviterText, joinedText, leagueNoun, leagueTypeLabel, respondedText } from './inviteText';

const ana = { id: 'u1', name: 'Ana Pérez', username: 'ana' };

describe('textos de las invitaciones', () => {
  it('quién invitó: con su @usuario, sin él o sin cuenta', () => {
    expect(inviterText(ana)).toBe('Ana Pérez (@ana)');
    expect(inviterText({ ...ana, username: '' })).toBe('Ana Pérez');
    expect(inviterText({ ...ana, name: '  ' })).toBeNull();
    expect(inviterText(null)).toBeNull();
    expect(invitedByLine(ana)).toBe('Ana Pérez (@ana) te invitó');
    expect(invitedByLine(null)).toBe('Te invitaron');
  });

  it('el tipo de liga y cómo se nombra', () => {
    expect(leagueTypeLabel('liga', 'public')).toBe('Liga pública');
    expect(leagueTypeLabel('liga', 'private')).toBe('Liga privada');
    expect(leagueTypeLabel('torneo', 'public')).toBe('Torneo');
    expect(leagueNoun('liga')).toBe('la liga');
    expect(leagueNoun('torneo')).toBe('el torneo');
  });

  it('cómo quedó una invitación ya respondida', () => {
    expect(inviteOutcome('accepted', 'liga', 'Liga Norte')).toEqual({ title: 'Ya estás en la liga', body: 'Eres parte de Liga Norte. Entra para ver lo que viene.' });
    expect(inviteOutcome('accepted', 'torneo', '').title).toBe('Ya estás en el torneo');
    expect(inviteOutcome('declined', 'liga', 'Liga Norte').title).toBe('Rechazaste esta invitación');
    expect(inviteOutcome('cancelled', 'liga', 'Liga Norte')).toMatchObject({ title: 'Esta invitación ya no está disponible' });
    expect(inviteOutcome('cancelled', 'liga', ' ').body).toContain('la liga cambió');
    expect(inviteOutcome('left', 'liga', 'Liga Norte')).toMatchObject({ title: 'Ya no estás en la liga' });
    expect(inviteOutcome('left', 'torneo', 'Copa').body).toContain('ya no eres parte de Copa');
  });

  it('«ya estás» solo si todavía está en la liga (aceptó y salió: «ya no estás»)', () => {
    expect(inviteOutcomeOf('accepted', true)).toBe('accepted');
    expect(inviteOutcomeOf('pending', true)).toBe('accepted');
    expect(inviteOutcomeOf('accepted', false)).toBe('left');
    expect(inviteOutcomeOf('pending', false)).toBe('cancelled');
    expect(inviteOutcomeOf('declined', false)).toBe('declined');
    expect(inviteOutcomeOf('cancelled', false)).toBe('cancelled');
  });

  it('el aviso al responder', () => {
    expect(joinedText('Liga Norte')).toBe('Te uniste a Liga Norte');
    expect(joinedText('')).toBe('Te uniste a la liga');
    expect(respondedText('accepted', 'Liga Norte')).toBe('Te uniste a Liga Norte');
    expect(respondedText('declined', 'Liga Norte')).toBe('Rechazaste la invitación');
    expect(respondedText('cancelled', 'Liga Norte')).toBe('Esta invitación ya no está disponible.');
    expect(respondedText('pending', 'Liga Norte')).toBe('No se pudo. Prueba otra vez.');
  });
});
