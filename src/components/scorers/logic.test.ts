/**
 * Lo puro de «Anotadores» (logic.ts): hasta dónde llega el permiso, quién sale en cada lista, el botón de cada
 * persona, las confirmaciones (juega o no, boliche u otro deporte, solo anota, menores), los avisos y el link. Y la
 * regla de quién anota en un evento (canScoreEvent, la gemela de private.is_event_scorer).
 */
import { describe, expect, it } from 'vitest';
import { canScoreEvent } from '../../lib/league';
import type { PersonHit } from '../../lib/data/people';
import type { ScorerInvite } from '../../lib/data/scorers';
import type { League, Member } from '../../lib/types';
import {
  adminCount,
  adminsLine,
  autoEnterStep,
  deadLinkText,
  emptyScorersText,
  expiryDay,
  foldName,
  hasScorerIntent,
  inviteConfirm,
  inviteScorerText,
  joinedScorerText,
  leavesOnRemove,
  linkStateText,
  madeText,
  makeConfirm,
  nameMatches,
  nobodyFoundText,
  personAction,
  pickableEmptyText,
  pickableMembers,
  playsHere,
  rememberScorerIntent,
  removeConfirm,
  SCORER_INTENT_KEY,
  SCORER_INTENT_MS,
  scorerJoinNext,
  scorerReach,
  scorerReachForYou,
  scorerReachOne,
  scorerReachText,
  scorerRows,
  scorerShareText,
  takeScorerIntent,
  usernameHintText,
} from './logic';

const league = (extra: Partial<League> = {}) => ({ id: 'l1', name: 'Liga', kind: 'liga', sport: 'bowling', ...extra }) as League;

const member = (uid: string, name: string, extra: Partial<Member> = {}): Member => ({
  id: `l1_${uid}`,
  leagueId: 'l1',
  uid,
  name,
  role: 'member',
  playerId: `p-${uid}`,
  ...extra,
});

const invite = (id: string, user: string, name: string, extra: Partial<ScorerInvite> = {}): ScorerInvite => ({
  id,
  user: { id: user, name, username: name.toLowerCase() },
  invitedBy: { id: 'org', name: 'Org' },
  asPlayer: false,
  scope: 'evento',
  refId: 'e1',
  title: 'Copa',
  createdAt: '2026-09-29T12:00:00Z',
  ...extra,
});

const hit = (extra: Partial<PersonHit> = {}): PersonHit => ({
  id: 'u9',
  name: 'Nora',
  username: 'nora',
  isFollowing: false,
  followsYou: false,
  inLeague: false,
  invited: false,
  ...extra,
});

describe('hasta dónde llega el permiso', () => {
  it('torneo sin liga, liga de boliche y liga de otro deporte', () => {
    expect(scorerReach(league({ kind: 'torneo' }))).toBe('torneo');
    expect(scorerReach(league({ kind: 'torneo', sport: 'padel' }))).toBe('torneo');
    expect(scorerReach(league())).toBe('bowling');
    expect(scorerReach(league({ sport: undefined }))).toBe('bowling');
    expect(scorerReach(league({ sport: 'basketball' }))).toBe('liga');
  });

  it('los tres textos de la hoja', () => {
    expect(scorerReachText('torneo')).toBe('Anotan los resultados de este torneo. No los inscribe como jugadores.');
    expect(scorerReachText('bowling')).toBe('Podrán anotar en los torneos de esta liga (no en las prácticas). No los inscribe como jugadores.');
    expect(scorerReachText('liga')).toBe('Podrán anotar en los eventos de esta liga, no solo en este. No los inscribe como jugadores.');
  });

  it('dicho de una persona (la pregunta antes de nombrarla), en singular', () => {
    expect(scorerReachOne('torneo')).toBe('Podrá anotar los resultados de este torneo.');
    expect(scorerReachOne('bowling')).toBe('Podrá anotar en los torneos de esta liga (no en las prácticas).');
    expect(scorerReachOne('liga')).toBe('Podrá anotar en los eventos de esta liga, no solo en este.');
  });

  it('dicho a quien lo invitan: nada en un torneo sin liga', () => {
    expect(scorerReachForYou('torneo')).toBeNull();
    expect(scorerReachForYou('bowling')).toContain('no en las prácticas');
    expect(scorerReachForYou('liga')).toContain('no solo en este');
  });
});

describe('quién anota en un evento (canScoreEvent)', () => {
  const ctx = (extra: { isAdmin?: boolean; scorer?: boolean; kind?: 'liga' | 'torneo'; sport?: string }) => ({
    isAdmin: extra.isAdmin ?? false,
    member: { scorer: extra.scorer ?? true },
    league: { id: 'l1', kind: extra.kind ?? 'liga', sport: extra.sport ?? 'bowling' },
  });

  it('liga de boliche: el anotador anota los torneos, no las prácticas', () => {
    expect(canScoreEvent(ctx({}), 'torneo')).toBe(true);
    expect(canScoreEvent(ctx({}), 'practica')).toBe(false);
  });

  it('torneo sin liga y otros deportes: cualquier evento', () => {
    expect(canScoreEvent(ctx({ kind: 'torneo' }), 'practica')).toBe(true);
    expect(canScoreEvent(ctx({ sport: 'golf' }), 'ronda')).toBe(true);
  });

  it('el admin siempre; sin la marca, nunca', () => {
    expect(canScoreEvent(ctx({ isAdmin: true, scorer: false }), 'practica')).toBe(true);
    expect(canScoreEvent(ctx({ scorer: false }), 'torneo')).toBe(false);
    expect(canScoreEvent({ isAdmin: false, member: null, league: { id: 'l1', kind: 'torneo', sport: 'bowling' } }, 'torneo')).toBe(false);
  });
});

describe('quién juega', () => {
  it('con la lista de la pantalla; sin ella no se marca a nadie (tener jugador no es jugar este torneo)', () => {
    const ana = member('a', 'Ana');
    expect(playsHere(ana, new Set(['p-a']))).toBe(true);
    expect(playsHere(ana, new Set(['p-x']))).toBe(false);
    expect(playsHere(ana, null)).toBe(false);
    expect(playsHere(member('b', 'Beto', { playerId: null }), new Set(['p-b']))).toBe(false);
  });

  it('buscar sin tildes y por palabras', () => {
    expect(foldName('  José Ñúñez ')).toBe('jose nunez');
    expect(nameMatches('José Pérez', 'jose')).toBe(true);
    expect(nameMatches('José Pérez', 'PEREZ jo')).toBe(true);
    expect(nameMatches('José Pérez', 'ana')).toBe(false);
    expect(nameMatches('José Pérez', '   ')).toBe(true);
  });
});

describe('«Anotan ahora»', () => {
  const members = [
    member('o', 'Org', { role: 'owner', scorer: true }),
    member('s', 'Sofi', { role: 'admin' }),
    member('c', 'Carla', { scorer: true }),
    member('b', 'Beto', { scorer: true, scorerOnly: true, playerId: null }),
    member('d', 'Dani'),
  ];

  it('miembros con el permiso (por nombre) y después las invitaciones; los admins no salen', () => {
    const rows = scorerRows(members, [invite('i1', 'u7', 'Eva')], new Set(['p-c']));
    expect(rows.map((r) => r.name)).toEqual(['Beto', 'Carla', 'Eva']);
    const [beto, carla, eva] = rows;
    expect(beto).toMatchObject({ kind: 'member', plays: false, scorerOnly: true });
    expect(carla).toMatchObject({ kind: 'member', plays: true, scorerOnly: false });
    expect(eva).toMatchObject({ kind: 'invite', username: 'eva' });
  });

  it('una invitación de quien ya entró no sale (llega antes el miembro que el tiempo real)', () => {
    expect(scorerRows(members, [invite('i1', 'd', 'Dani')], null).some((r) => r.kind === 'invite')).toBe(false);
  });

  it('sin la lista de quién juega (un torneo de varios eventos que todavía carga): nadie sale con «Juega»', () => {
    const rows = scorerRows([member('c', 'Carla', { scorer: true })], [], null);
    expect(rows.map((r) => r.plays)).toEqual([false]);
    expect(pickableMembers([member('z', 'Zoe')], '', null).map((x) => x.plays)).toEqual([false]);
  });

  it('cuántos admins (el dueño cuenta)', () => {
    expect(adminCount(members)).toBe(2);
    expect(adminsLine(2)).toBe('Los admins (2) también anotan.');
    expect(adminsLine(1)).toBe('El dueño también anota.');
  });
});

describe('«De la liga»', () => {
  const members = [member('c', 'Carla', { scorer: true }), member('z', 'Zoe'), member('a', 'Álvaro'), member('s', 'Sofi', { role: 'admin' })];

  it('los miembros que todavía no anotan, por nombre, con «Juega»', () => {
    const list = pickableMembers(members, '', new Set(['p-z']));
    expect(list.map((x) => x.member.name)).toEqual(['Álvaro', 'Zoe']);
    expect(list.map((x) => x.plays)).toEqual([false, true]);
    expect(pickableMembers(members, 'alva', null).map((x) => x.member.name)).toEqual(['Álvaro']);
  });

  it('lo que dice vacía', () => {
    expect(pickableEmptyText(members, 'nadie', false)).toBe('Nadie con ese nombre');
    expect(pickableEmptyText([member('c', 'Carla', { scorer: true })], '', false)).toBe('Todos los miembros ya anotan');
    const alone = [member('s', 'Sofi', { role: 'owner' })];
    expect(pickableEmptyText(alone, '', false)).toBe('Todavía no hay miembros sin permisos. Búscalo por su @usuario o manda el link.');
    // Con menores no hay link: no se habla de él.
    expect(pickableEmptyText(alone, '', true)).toBe('Todavía no hay miembros sin permisos. Búscalo por su @usuario.');
  });

  it('«Anotan ahora» vacío: de la liga o del torneo, como la pestaña (con menores, sin el link)', () => {
    expect(emptyScorersText('liga', false)).toBe('Todavía no hay anotadores. Elige a alguien de la liga, búscalo por su @usuario o manda el link.');
    expect(emptyScorersText('torneo', false)).toBe('Todavía no hay anotadores. Elige a alguien del torneo, búscalo por su @usuario o manda el link.');
    expect(emptyScorersText('liga', true)).toBe('Todavía no hay anotadores. Elige a alguien de la liga o búscalo por su @usuario.');
  });
});

describe('el botón de cada persona (personAction)', () => {
  it('los cinco estados', () => {
    expect(personAction(hit({ inLeague: true }), member('u9', 'Nora', { scorer: true }), null)).toBe('scorer');
    expect(personAction(hit({ inLeague: true }), member('u9', 'Nora', { role: 'admin' }), null)).toBe('admin');
    expect(personAction(hit({ inLeague: true }), member('u9', 'Nora'), null)).toBe('member');
    expect(personAction(hit({ invited: true }), null, invite('i1', 'u9', 'Nora'))).toBe('invited');
    expect(personAction(hit(), null, null)).toBe('invite');
  });

  it('en la liga pero sin la membresía a mano todavía: «Hacer anotador»', () => {
    expect(personAction(hit({ inLeague: true }), null, null)).toBe('member');
  });

  it('con una invitación para jugar (no de anotador): «Invitar a anotar» (la reemplaza)', () => {
    expect(personAction(hit({ invited: true }), null, null)).toBe('invite');
  });

  it('lo que dice sin buscar o sin resultados: el link, o con menores, que primero se cree la cuenta', () => {
    expect(usernameHintText(false)).toBe('Escribe su nombre o su @usuario. Si todavía no tiene cuenta, mándale el link.');
    expect(usernameHintText(true)).toBe('Escribe su nombre o su @usuario. Si todavía no tiene cuenta, pídele que se cree una y búscalo aquí.');
    expect(nobodyFoundText(' nora ', false)).toBe('No encontramos a nadie con «nora». Si todavía no tiene cuenta, mándale el link.');
    expect(nobodyFoundText('nora', true)).toBe('No encontramos a nadie con «nora». Si todavía no tiene cuenta, pídele que se cree una y búscalo aquí.');
  });
});

describe('confirmaciones', () => {
  it('a quien no juega, sin preguntar; a quien juega, juez y parte según el deporte (dicho de esa persona)', () => {
    expect(makeConfirm('Ana', false, league())).toBeNull();
    expect(makeConfirm('Ana', true, league())).toEqual({
      title: '¿Hacer anotador a Ana?',
      message: 'Podrá anotar en los torneos de esta liga (no en las prácticas). Como también juega, sus juegos sin foto no cuentan para insignias.',
      confirmText: 'Hacer anotador',
    });
    expect(makeConfirm('Ana', true, league({ sport: 'padel', kind: 'torneo' }))?.message).toBe(
      'Podrá anotar los resultados de este torneo. Lo que anote de sus propios partidos no cuenta para insignias.',
    );
    expect(makeConfirm('Ana', true, league({ sport: 'basketball' }))?.message).toBe(
      'Podrá anotar en los eventos de esta liga, no solo en este. Lo que anote de sus propios partidos no cuenta para insignias.',
    );
  });

  it('quitar: con jugador se queda; solo anota, sale, el link ya no le sirve y se avisa que lo cambie (y es peligroso)', () => {
    const stays = removeConfirm(member('c', 'Carla', { scorer: true }), 'liga');
    expect(stays.title).toBe('¿Quitarle el permiso de anotar a Carla?');
    expect(stays.message).toBe('Sigue en la liga como jugador.');
    expect(stays.danger).toBeFalsy();
    expect(stays.done).toBe('Carla ya no anota');
    const leaves = removeConfirm(member('b', 'Beto', { scorer: true, scorerOnly: true, playerId: null }), 'torneo');
    expect(leaves.message).toBe(
      'Beto entró solo para anotar: al quitarle el permiso sale del torneo y ya no puede volver a entrar con un link para anotar. Si no sabes quién es, cambia también el link.',
    );
    expect(leaves.danger).toBe(true);
    expect(leaves.done).toBe('Beto salió del torneo');
    expect(removeConfirm(member('x', 'Xavi', { scorer: true, playerId: null }), 'liga').message).toBe('Sigue en la liga.');
  });

  it('quitar a quien solo anota pero el dueño eligió para «Diseña insignias»: se queda (como en la base)', () => {
    const maker = member('m', 'Mia', { scorer: true, scorerOnly: true, playerId: null, badgeMaker: true });
    expect(leavesOnRemove(maker)).toBe(false);
    expect(removeConfirm(maker, 'liga')).toMatchObject({ message: 'Sigue en la liga.', done: 'Mia ya no anota' });
    expect(leavesOnRemove({ ...maker, badgeMaker: false })).toBe(true);
    expect(leavesOnRemove({ ...maker, role: 'admin', badgeMaker: false })).toBe(false);
  });

  it('invitar en una liga con menores: avisa que verá a los menores', () => {
    expect(inviteConfirm('Nora', { kind: 'liga', hasMinors: false })).toBeNull();
    expect(inviteConfirm('Nora', { kind: 'liga', hasMinors: true })?.message).toBe('Nora entrará a la liga y verá sus datos, también los de los menores.');
    expect(inviteConfirm('Nora', { kind: 'torneo', hasMinors: true })?.message).toBe('Nora entrará al torneo y verá sus datos, también los de los menores.');
  });
});

describe('avisos', () => {
  it('nombrar e invitar', () => {
    expect(madeText('Ana')).toBe('Ana ya puede anotar');
    expect(inviteScorerText('sent', 'Nora', 'liga')).toBe('Le llegó la invitación a Nora');
    expect(inviteScorerText('pending', 'Nora', 'liga')).toBe('Nora ya tiene una invitación');
    expect(inviteScorerText('declined', 'Nora', 'liga')).toBe('Nora la rechazó hace poco. Prueba en unos días.');
    expect(inviteScorerText('unavailable', 'Nora', 'liga')).toBe('Esa cuenta no está disponible');
    expect(inviteScorerText('rate_limited', 'Nora', 'liga')).toBe('Mandaste muchas invitaciones hoy. Prueba mañana.');
    expect(inviteScorerText('member', 'Nora', 'torneo')).toBe('Nora ya está en el torneo');
  });

  it('entrar con el link', () => {
    expect(joinedScorerText('joined', 'Copa')).toBe('Ya puedes anotar en Copa');
    expect(joinedScorerText('upgraded', 'Copa')).toBe('Ya puedes anotar en Copa. Sigues jugando.');
    expect(joinedScorerText('already', 'Copa')).toBeNull();
  });
});

describe('el link', () => {
  const ok = { status: 'ok' as const, expiresAt: '2026-10-06T15:00:00Z', uses: 3, maxUses: 20 };

  it('si sirve: cuándo vence y cuántas veces se usó', () => {
    expect(expiryDay(ok.expiresAt, 'America/Santo_Domingo')).toBe('6 de octubre');
    expect(linkStateText(ok, 'America/Santo_Domingo')).toBe('Vence el 6 de octubre · 3 de 20 usos');
    expect(expiryDay('mañana')).toBe('');
  });

  it('si no sirve, por qué; y sin link', () => {
    expect(linkStateText(null)).toBe('Todavía no hay link para anotar en este torneo.');
    expect(linkStateText({ ...ok, status: 'expired' })).toBe('El link para anotar venció.');
    expect(linkStateText({ ...ok, status: 'full' })).toBe('El link para anotar ya se usó todas las veces.');
    expect(linkStateText({ ...ok, status: 'closed' })).toContain('ya no es admin');
    expect(linkStateText({ ...ok, status: 'revoked' })).toBe('Quitaste el link para anotar.');
  });

  it('el texto para compartir y a dónde vuelve /login', () => {
    expect(scorerShareText('Copa Aniversario')).toBe('Te invito a anotar en Copa Aniversario con MatchMate');
    expect(scorerShareText('  ')).toBe('Te invito a anotar en mi torneo con MatchMate');
    expect(scorerJoinNext('ABCDEFGH23')).toBe('%2Fanotar%2FABCDEFGH23%3Fentrar%3D1');
  });

  it('/anotar/<código> cuando no sirve', () => {
    expect(deadLinkText(null).title).toBe('Este link no sirve');
    expect(deadLinkText(null).body).toContain('El código no existe');
    expect(deadLinkText('expired').title).toBe('Este link venció');
    expect(deadLinkText('revoked').title).toBe('Este link ya no sirve');
    expect(deadLinkText('closed').title).toBe('Este link ya no sirve');
    expect(deadLinkText('full').title).toBe('Este link ya se usó todas las veces');
    expect(deadLinkText('rate_limited').title).toBe('Demasiados intentos');
    expect(deadLinkText('removed')).toEqual({
      title: 'Este link ya no te sirve',
      body: 'Un admin te quitó el permiso de anotar. Si fue un error, pídele que te vuelva a invitar.',
    });
  });
});

describe('volver de /login con ?entrar=1: la marca de que tocó el botón', () => {
  /** Un almacenamiento de mentira (como localStorage). */
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };
  const now = Date.parse('2026-09-29T15:00:00Z');

  it('sin la marca (el link con ?entrar=1 llegó de otro lado): se ve la tarjeta, no entra solo', () => {
    const store = memory();
    expect(hasScorerIntent('ABCDEFGH23', now, store)).toBe(false);
    expect(takeScorerIntent('ABCDEFGH23', now, store)).toBe(false);
    expect(autoEnterStep({ canScore: false }, false)).toBe('card');
  });

  it('tocó «Crear cuenta y entrar a anotar» o «Ya tengo cuenta» con este link: entra solo, una vez', () => {
    const store = memory();
    rememberScorerIntent('ABCDEFGH23', now, store);
    expect(JSON.parse(store.m.get(SCORER_INTENT_KEY)!)).toEqual({ code: 'ABCDEFGH23', at: now });
    expect(hasScorerIntent('ABCDEFGH23', now + 60_000, store)).toBe(true);
    expect(autoEnterStep({ canScore: false }, takeScorerIntent('ABCDEFGH23', now + 60_000, store))).toBe('enter');
    // Se usó: la segunda vez ya no.
    expect(takeScorerIntent('ABCDEFGH23', now + 60_000, store)).toBe(false);
  });

  it('solo para ese link y por 24 horas; ya anota: directo al torneo', () => {
    const store = memory();
    rememberScorerIntent('ABCDEFGH23', now, store);
    expect(takeScorerIntent('ZZZZZZZZZZ', now, store)).toBe(false);
    expect(store.m.has(SCORER_INTENT_KEY)).toBe(true);
    expect(hasScorerIntent('ABCDEFGH23', now + SCORER_INTENT_MS, store)).toBe(false);
    expect(hasScorerIntent('ABCDEFGH23', now - 1, store)).toBe(false);
    store.m.set(SCORER_INTENT_KEY, '{roto');
    expect(hasScorerIntent('ABCDEFGH23', now, store)).toBe(false);
    expect(autoEnterStep({ canScore: true }, true)).toBe('skip');
    expect(autoEnterStep({ canScore: true }, false)).toBe('skip');
  });

  it('sin almacenamiento (o que falla): no hay marca, y nada revienta', () => {
    const broken = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
      removeItem: () => undefined,
    };
    expect(() => rememberScorerIntent('ABCDEFGH23', now, broken)).not.toThrow();
    expect(hasScorerIntent('ABCDEFGH23', now, broken)).toBe(false);
    expect(hasScorerIntent('ABCDEFGH23', now, null)).toBe(false);
  });
});
