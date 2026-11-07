/** Organizar › Miembros: el orden, quién puede hacer qué y los textos (src/components/league/members.ts). */
import { describe, expect, it } from 'vitest';
import type { Member } from '../../lib/types';
import {
  adminConfirm,
  kickConfirm,
  makerConfirm,
  memberLabels,
  memberPlayerBadge,
  memberRights,
  membersIntro,
  membersScope,
  peopleTabLabel,
  scorerConfirm,
  sortMembers,
} from './members';

const member = (uid: string, extra: Partial<Member> = {}): Member => ({
  id: `l1_${uid}`,
  leagueId: 'l1',
  uid,
  name: 'Jugador Uno',
  role: 'member',
  playerId: `p-${uid}`,
  scorer: false,
  ...extra,
});

const bowlingLeague = membersScope({ id: 'l1', sport: 'bowling', kind: 'liga' }, false);
const padelTourney = membersScope({ id: 'l2', sport: 'padel', kind: 'torneo' }, false);
const owner = { uid: 'u-dueno', isOwner: true, isAdmin: true };
const admin = { uid: 'u-admin', isOwner: false, isAdmin: true };

describe('la lista de miembros', () => {
  it('el dueño, los admins y los miembros, cada grupo por nombre', () => {
    const list = [
      member('a', { name: 'Jugadora Dos' }),
      member('b', { name: 'Jugador Uno', role: 'admin' }),
      member('c', { name: 'Ana Ejemplo' }),
      member('d', { name: 'Zoe Ejemplo', role: 'owner' }),
    ];
    expect(sortMembers(list).map((m) => m.uid)).toEqual(['d', 'b', 'c', 'a']);
  });

  it('la línea de arriba: en negrita los permisos; lo de los torneos y las insignias solo cuando toca', () => {
    const plain = (parts: ReturnType<typeof membersIntro>) => parts.map((p) => p.text).join('');
    expect(plain(membersIntro(bowlingLeague, true))).toBe(
      'Todos son jugadores, menos quien entró solo para anotar. Admin maneja la liga; Anotador solo anota los juegos de los torneos. Solo tú, como dueño, nombras admins. Tú y los admins nombran anotadores.',
    );
    expect(plain(membersIntro({ ...padelTourney, chosen: true }, false))).toBe(
      'Todos son jugadores, menos quien entró solo para anotar. Admin maneja el torneo; Anotador solo anota los juegos; Diseña insignias crea y da las insignias de el torneo. Solo el dueño nombra admins. Tú puedes nombrar anotadores.',
    );
    expect(membersIntro(bowlingLeague, true).filter((p) => p.strong).map((p) => p.text)).toEqual(['Admin', 'Anotador']);
  });

  it('la marca de su jugador', () => {
    expect(memberPlayerBadge(member('a'), 'Jugador Uno')).toEqual({ text: 'Jugador: Jugador Uno', tone: 'ok' });
    expect(memberPlayerBadge(member('a'), undefined).text).toBe('Jugador: —');
    expect(memberPlayerBadge(member('a', { playerId: null, scorerOnly: true }), undefined)).toEqual({ text: 'Solo anota', tone: 'neutral' });
    expect(memberPlayerBadge(member('a', { playerId: null }), undefined).text).toBe('Su jugador se crea al abrir la liga');
  });

  it('los botones', () => {
    expect(memberLabels(member('a'), bowlingLeague)).toMatchObject({ admin: 'Hacer admin', scorer: 'Hacer anotador', maker: 'Diseña insignias', kick: 'Sacar a Jugador Uno', kickTitle: 'Sacar de la liga' });
    expect(memberLabels(member('a', { role: 'admin', scorer: true, badgeMaker: true }), padelTourney)).toMatchObject({ admin: 'Quitar admin', scorer: 'Quitar anotador', maker: 'Ya no diseña', kickTitle: 'Sacar de el torneo' });
  });
});

describe('quién puede hacer qué', () => {
  it('el dueño: todo con los demás, nada consigo mismo', () => {
    expect(memberRights(member('x', { role: 'admin', scorer: true }), owner)).toEqual({ canKick: true, canManage: true, canScorer: true, canStepDown: false });
    expect(memberRights(member('u-dueno', { role: 'owner' }), owner)).toEqual({ canKick: false, canManage: false, canScorer: false, canStepDown: false });
  });

  it('un admin: anotadores y sacar solo a miembros sin permisos; dejar de ser admin él mismo', () => {
    expect(memberRights(member('x'), admin)).toEqual({ canKick: true, canManage: false, canScorer: true, canStepDown: false });
    expect(memberRights(member('x', { scorer: true }), admin).canKick).toBe(false);
    expect(memberRights(member('x', { badgeMaker: true }), admin).canKick).toBe(false);
    expect(memberRights(member('x', { role: 'admin' }), admin)).toEqual({ canKick: false, canManage: false, canScorer: false, canStepDown: false });
    expect(memberRights(member('u-admin', { role: 'admin' }), admin)).toEqual({ canKick: false, canManage: false, canScorer: false, canStepDown: true });
  });
});

describe('las confirmaciones', () => {
  it('hacer admin y quitarlo (o dejarlo uno mismo)', () => {
    expect(adminConfirm(member('x'), bowlingLeague, owner.uid)).toEqual({
      role: 'admin',
      title: '¿Hacer admin a Jugador Uno?',
      message: 'Podrá crear torneos y prácticas, anotar y aprobar juegos, manejar jugadores e invitar. Los permisos los sigues manejando tú.',
      confirmText: 'Hacer admin',
      danger: false,
      done: 'Jugador Uno ahora es admin',
    });
    expect(adminConfirm(member('x'), padelTourney, owner.uid).message).toBe(
      'Podrá inscribir jugadores, armar equipos, anotar y aprobar juegos, e invitar. Los permisos los sigues manejando tú.',
    );
    expect(adminConfirm(member('x', { role: 'admin' }), bowlingLeague, owner.uid)).toMatchObject({ role: 'member', message: 'Sigue en la liga como jugador.', danger: true, done: 'Listo' });
    expect(adminConfirm(member('u-admin', { role: 'admin' }), padelTourney, 'u-admin').message).toBe(
      'Vas a dejar de administrar el torneo; sigues como jugador. Para volver a ser admin, el dueño te lo tiene que dar.',
    );
  });

  it('anotador: lo que podrá anotar según el deporte, y quien entró solo para anotar sale al quitárselo', () => {
    expect(scorerConfirm(member('x'), bowlingLeague)).toMatchObject({
      make: true,
      title: '¿Hacer anotador a Jugador Uno?',
      message: 'Podrá anotar los juegos de los torneos de la liga (no las prácticas) y nada más. Sigue siendo jugador.',
      done: 'Jugador Uno ahora es anotador',
    });
    expect(scorerConfirm(member('x'), membersScope({ id: 'l3', sport: 'bowling', kind: 'torneo' }, false)).message).toBe(
      'Podrá anotar los juegos de los inscritos (a mano, por cuadros o con la foto) y nada más. Sigue siendo jugador.',
    );
    expect(scorerConfirm(member('x'), padelTourney).message).toBe('Podrá anotar los partidos, las tarjetas o los tiempos, y nada más. Sigue siendo jugador.');
    expect(scorerConfirm(member('x', { scorer: true }), bowlingLeague)).toMatchObject({ make: false, message: 'Ya no podrá anotar en la liga.', confirmText: 'Quitar anotador', danger: true, done: 'Listo' });
    const leaving = scorerConfirm(member('x', { name: 'Anotador de Prueba', scorer: true, scorerOnly: true, playerId: null }), bowlingLeague);
    expect(leaving.message).toContain('entró solo para anotar');
    expect(leaving.done).toContain('Anotador de Prueba salió');
  });

  it('diseña insignias y sacar de la liga', () => {
    expect(makerConfirm(member('x'), bowlingLeague)).toMatchObject({ make: true, title: '¿Jugador Uno diseña insignias?', confirmText: 'Sí, que diseñe', danger: false });
    expect(makerConfirm(member('x', { badgeMaker: true }), bowlingLeague)).toMatchObject({
      make: false,
      message: 'Ya no podrá crear ni dar insignias de la liga. Las que ya dio se quedan.',
      confirmText: 'Quitar',
      danger: true,
    });
    expect(kickConfirm(member('x'), padelTourney)).toEqual({
      title: '¿Sacar a Jugador Uno de el torneo?',
      message: 'Sus juegos se quedan; su cuenta deja de estar en el torneo. Si es privado, necesitará otra invitación para volver.',
      confirmText: 'Sacar',
      danger: true,
      done: 'Jugador Uno ya no está en el torneo',
    });
  });
});

describe('la pestaña propia de la gente del deporte', () => {
  it('natación y raqueta la tienen; el boliche y los equipos no', () => {
    expect(peopleTabLabel('swimming')).toBe('Nadadores');
    expect(peopleTabLabel('padel')).toBe('Parejas y niveles');
    expect(peopleTabLabel('tennis')).toBe('Jugadores y niveles');
    expect(peopleTabLabel('bowling')).toBeNull();
    expect(peopleTabLabel('football')).toBeNull();
  });
});
