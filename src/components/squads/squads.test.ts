/**
 * Las piezas de Equipos sin navegador: lo puro (textos, quién hace qué, pestañas, unirse, avisos de aceptar y pasar
 * miembros), el logo y el color del equipo, Seguir / Siguiendo y el panel de los admins con los equipos que piden entrar
 * a la liga (Aceptar · Rechazar; sin pendientes no se ve).
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BLOCKED_MESSAGE } from '../../lib/backend/errors';
import { BackendError } from '../../lib/backend/types';
import type { Live } from '../../lib/data/client';
import type { SquadLeague, SquadLite, SquadMember, SquadRequest } from '../../lib/data/squads';
import { FeedbackProvider } from '../feedback';

const state = vi.hoisted(() => ({
  requests: { data: [], loading: false, error: null } as Live<SquadRequest[]>,
  askedLid: [] as (string | null | undefined)[],
}));

vi.mock('../../lib/data/squads', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/squads')>()),
  useLeagueSquadRequests: (lid: string | null | undefined) => {
    state.askedLid.push(lid);
    return state.requests;
  },
}));

const logic = await import('./logic');
const { squadErrorText } = await import('../../lib/data/squads');
const { SquadChip, SquadLogo, SquadTint, squadTintClass } = await import('./SquadBits');
const { SquadFollowButton } = await import('./SquadFollowButton');
const { SquadRequestsPanel } = await import('./SquadRequestsPanel');

const render = (node: ReactNode) => renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, node)));
const text = (html: string) =>
  html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ')
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const squad = (extra: Partial<SquadLite> = {}): SquadLite => ({
  id: 'S1',
  sport: 'football',
  name: 'Los Tigres',
  tag: 'TGR',
  logo: null,
  color: null,
  city: 'Santiago',
  recruiting: false,
  members: 12,
  followers: 30,
  ...extra,
});
const member = (id: string, extra: Partial<SquadMember> = {}): SquadMember => ({
  id,
  name: `Jugador ${id}`,
  username: null,
  avatar: null,
  role: 'member',
  position: null,
  jersey: null,
  isMe: false,
  ...extra,
});
const sl = (leagueId: string, status: SquadLeague['status'], extra: Partial<SquadLeague> = {}): SquadLeague => ({
  leagueId,
  name: `Liga ${leagueId}`,
  sport: 'football',
  logo: null,
  status,
  requestId: `r-${leagueId}`,
  record: { played: 0, won: 0, drawn: 0, lost: 0 },
  ...extra,
});

beforeEach(() => {
  state.requests = { data: [], loading: false, error: null };
  state.askedLid = [];
});

describe('textos', () => {
  it('las líneas de un equipo: la suya, la de Mis equipos y la de la lupa', () => {
    expect(logic.squadTitle(squad())).toBe('Los Tigres [TGR]');
    expect(logic.squadLine(squad())).toBe('Fútbol · Santiago · 12 miembros');
    expect(logic.squadLine(squad({ city: null, members: 1, sport: 'futsal' }))).toBe('Fútbol sala · 1 miembro');
    expect(logic.squadLine(squad({ city: '  ', members: 0, sport: 'nada' }))).toBe('Otro deporte');
    expect(logic.mySquadLine({ ...squad(), role: 'captain' })).toBe('Fútbol · 12 miembros · Capitán');
    expect(logic.mySquadLine({ ...squad({ sport: 'basketball' }), role: 'member' })).toBe('Baloncesto · 12 miembros');
    expect(logic.squadResultLine(squad({ recruiting: true }))).toBe('Equipo · Fútbol · Santiago · 12 miembros · Busca jugadores');
    expect(logic.followersText(1)).toBe('1 seguidor');
    expect(logic.membersText(1200)).toMatch(/^1.200 miembros$/);
  });

  it('la línea de alguien de la plantilla y el orden (el capitán primero, después por número y por nombre)', () => {
    expect(logic.memberLine(member('a', { position: 'Portero', jersey: 1 }))).toBe('Portero · #1');
    expect(logic.memberLine(member('a', { jersey: 0 }))).toBe('#0');
    expect(logic.memberLine(member('a', { username: 'ana' }))).toBe('@ana');
    expect(logic.memberLine(member('a'))).toBe('');
    const sorted = logic.sortRoster([
      member('z', { name: 'Zoe' }),
      member('b', { name: 'Bruno', jersey: 9 }),
      member('c', { name: 'Carla', role: 'captain', jersey: 99 }),
      member('a', { name: 'Ana' }),
      member('d', { name: 'Dani', jersey: 2 }),
    ]);
    expect(sorted.map((m) => m.name)).toEqual(['Carla', 'Dani', 'Bruno', 'Ana', 'Zoe']);
  });

  it('Yo › Mis equipos: uno, dos, más o cómo empezar', () => {
    expect(logic.myTeamsLine([])).toBe('Crea tu equipo o únete a uno');
    expect(logic.myTeamsLine(['Los Tigres'])).toBe('Los Tigres');
    expect(logic.myTeamsLine(['Los Tigres', 'Radiantes'])).toBe('Los Tigres y Radiantes');
    expect(logic.myTeamsLine(['a', 'b', 'c'])).toBe('3 equipos');
  });

  it('compartir y los colores', () => {
    expect(logic.squadShareText(squad())).toBe('Únete a Los Tigres (Fútbol) en MatchMate');
    expect(logic.validColor('#DC2626')).toBe('#dc2626');
    expect(logic.validColor('rojo')).toBeNull();
    expect(logic.validColor(null)).toBeNull();
    expect(logic.SQUAD_COLORS.every((c) => logic.validColor(c.hex) === c.hex)).toBe(true);
  });
});

describe('quién hace qué', () => {
  it('las pestañas (?tab=) y quién mira', () => {
    expect(logic.squadTab(null)).toBe('plantilla');
    expect(logic.squadTab('muro')).toBe('muro');
    expect(logic.squadTab('ligas')).toBe('ligas');
    expect(logic.squadTab('otra')).toBe('plantilla');
    expect(logic.SQUAD_TABS.map((t) => t.label)).toEqual(['Plantilla', 'Muro', 'Ligas']);
    expect(logic.squadViewer({ isMember: true, myRole: 'captain' })).toBe('captain');
    expect(logic.squadViewer({ isMember: true, myRole: 'member' })).toBe('member');
    expect(logic.squadViewer({ isMember: false, myRole: null })).toBe('none');
    expect(logic.squadViewer(null)).toBe('none');
  });

  it('el menú «•••»: el capitán edita, logo, sale (si hay más gente) y borra; un miembro sale; los demás nada', () => {
    expect(logic.squadMenu('captain', 5)).toEqual(['edit', 'logo', 'leave', 'delete']);
    expect(logic.squadMenu('captain', 1)).toEqual(['edit', 'logo', 'delete']);
    expect(logic.squadMenu('member', 5)).toEqual(['leave']);
    expect(logic.squadMenu('none', 5)).toEqual([]);
  });

  it('lo que el capitán hace con alguien: posición y número (también los suyos), capitanía y sacarlo', () => {
    expect(logic.memberActions('captain', { role: 'member', isMe: false })).toEqual(['edit', 'make_captain', 'remove']);
    expect(logic.memberActions('captain', { role: 'captain', isMe: true })).toEqual(['edit']);
    expect(logic.memberActions('member', { role: 'member', isMe: true })).toEqual([]);
    expect(logic.memberActions('none', { role: 'member', isMe: false })).toEqual([]);
  });

  it('el número de la camiseta', () => {
    expect(logic.parseJersey('')).toBeNull();
    expect(logic.parseJersey(' 7 ')).toBe(7);
    expect(logic.parseJersey('99')).toBe(99);
    expect(logic.parseJersey('100')).toBe('invalid');
    expect(logic.parseJersey('-1')).toBe('invalid');
  });
});

describe('ligas', () => {
  it('solo fútbol, futsal y baloncesto inscriben equipos; los demás, «Pronto»', () => {
    expect(['football', 'futsal', 'basketball'].every(logic.canEnterLeagues)).toBe(true);
    expect(['bowling', 'padel', 'swimming', 'esports', 'nada', 'toString'].some(logic.canEnterLeagues)).toBe(false);
    expect(logic.leaguesSoonText('swimming')).toBe('Pronto podrás inscribir equipos de natación.');
  });

  it('las ligas que se muestran, las que ya pidió y las que puede elegir', () => {
    const ls = [sl('c', 'rejected'), sl('a', 'pending'), sl('w', 'withdrawn'), sl('b', 'approved')];
    expect(logic.shownLeagues(ls).map((l) => l.status)).toEqual(['approved', 'pending', 'rejected']);
    expect([...logic.takenLeagues(ls)]).toEqual([
      ['a', 'pending'],
      ['b', 'approved'],
    ]);
    const hits = [
      { id: '1', sport: 'football', visibility: 'public', isMember: false },
      { id: '2', sport: 'football', visibility: 'private', isMember: false },
      { id: '3', sport: 'football', visibility: 'private', isMember: true },
      { id: '4', sport: 'futsal', visibility: 'public', isMember: true },
    ];
    expect(logic.leagueChoices(hits, 'football').map((l) => l.id)).toEqual(['1', '3']);
  });

  it('los avisos al aceptar y al pasar miembros nuevos', () => {
    expect(logic.decisionText({ teamId: 't', added: 8, skipped: 2 })).toBe('Entró con 8 jugadores (2 ya estaban en otro equipo)');
    expect(logic.decisionText({ added: 1, skipped: 1 })).toBe('Entró con 1 jugador (1 ya estaba en otro equipo)');
    expect(logic.decisionText({ added: 5 })).toBe('Entró con 5 jugadores');
    expect(logic.decisionText({})).toBe('Entró sin jugadores nuevos');
    expect(logic.syncText({ added: 2, skipped: 1 })).toBe('Entraron 2 jugadores (1 ya estaba en otro equipo)');
    expect(logic.syncText({ added: 1, skipped: 0 })).toBe('Entró 1 jugador');
    expect(logic.syncText({ added: 0, skipped: 3 })).toBe('No entró nadie nuevo (3 ya estaban en otro equipo)');
    expect(logic.syncText({ added: 0, skipped: 0 })).toBe('Ya estaban todos en la liga');
  });

  it('los errores del capitán y de los admins (con los códigos de la base)', () => {
    expect(logic.requestErrorText(new BackendError('duplicado', 'conflict'))).toBe('Ya pediste entrar a esa liga (o el equipo ya está en ella).');
    expect(logic.requestErrorText(new BackendError('invalido', 'validation'))).toBe('Esa liga no acepta este equipo: tiene que ser de su deporte y sin menores.');
    expect(logic.requestErrorText(new BackendError('no_existe', 'not_found'))).toMatch(/pública o una donde ya juegas/);
    expect(logic.requestErrorText(new BackendError('cerrado', 'validation'))).toBe('Esa solicitud ya se decidió.');
    expect(logic.requestErrorText(new BackendError('no_permitido', 'permission'))).toBe('Solo el capitán puede inscribir el equipo.');
    expect(logic.requestErrorText(new BackendError('x', 'network'))).toMatch(/Sin conexión/);
    expect(logic.syncErrorText(new BackendError('no_existe', 'not_found'))).toBe('El equipo ya no está en esa liga.');
    expect(logic.memberErrorText(new BackendError('duplicado', 'conflict'))).toBe('Ese número ya lo tiene otro del equipo.');
    expect(logic.memberErrorText(new BackendError('no_existe', 'not_found'))).toBe('Esa persona ya no está en el equipo.');
    expect(logic.adminErrorText(new BackendError('no_permitido', 'permission'))).toBe('Solo los admins de la liga pueden hacer eso.');
    expect(logic.adminErrorText(new BackendError('no_existe', 'not_found'))).toBe('Esa solicitud ya no está.');
    expect(logic.adminErrorText(new BackendError('cerrado', 'validation'))).toBe('Esa solicitud ya se decidió.');
    // Una cuenta bloqueada ve su aviso, no «Solo el capitán…».
    const blocked = new BackendError(BLOCKED_MESSAGE, 'permission', 'bloqueada');
    for (const f of [logic.requestErrorText, logic.adminErrorText, logic.memberErrorText, logic.syncErrorText, squadErrorText]) expect(f(blocked)).toBe(BLOCKED_MESSAGE);
  });
});

describe('unirse y crear', () => {
  it('el código mientras se escribe', () => {
    expect(logic.cleanCode('ab-cd 2345xyz')).toBe('ABCD2345');
    expect(logic.CODE_LENGTH).toBe(8);
  });

  it('el estado de la pantalla de unirse', () => {
    const base = { signedIn: true, loading: false, mySquadIds: new Set<string>() };
    expect(logic.squadJoinState({ ...base, preview: undefined })).toBe('loading');
    expect(logic.squadJoinState({ ...base, preview: { id: 'S1' }, loading: true })).toBe('loading');
    expect(logic.squadJoinState({ ...base, preview: null })).toBe('dead');
    expect(logic.squadJoinState({ ...base, preview: { id: 'S1' }, signedIn: false })).toBe('signin');
    expect(logic.squadJoinState({ ...base, preview: { id: 'S1' }, mySquadIds: new Set(['S1']) })).toBe('member');
    expect(logic.squadJoinState({ ...base, preview: { id: 'S1' } })).toBe('ready');
  });

  it('el deporte marcado al crear: el pedido, el activo o el primero (nunca esports)', () => {
    const open = ['bowling', 'padel', 'football', 'esports'];
    expect(logic.defaultSquadSport(open, 'football', 'padel')).toBe('football');
    expect(logic.defaultSquadSport(open, null, 'padel')).toBe('padel');
    expect(logic.defaultSquadSport(open, 'esports', 'esports')).toBe('bowling');
    expect(logic.defaultSquadSport(['esports'], 'esports')).toBeNull();
  });
});

describe('piezas', () => {
  it('el logo sin imagen: el tag en un círculo del color del equipo (o del deporte)', () => {
    const html = render(h(SquadLogo, { squad: squad({ color: '#DC2626' }), className: 'size-24' }));
    expect(html).toContain('>TGR</text>');
    expect(html).toContain(squadTintClass('#dc2626'));
    expect(html).toContain('size-24');
    const sport = render(h(SquadLogo, { squad: squad({ sport: 'basketball' }) }));
    expect(sport).toContain('mm-tint-basketball');
    // Un color raro no se usa: el del deporte.
    expect(render(h(SquadTint, { color: 'url(x)', sport: 'football', children: 'x' }))).not.toContain('mm-squad-');
  });

  it('el chip de una publicación lleva al equipo', () => {
    const html = render(h(SquadChip, { squad: squad() }));
    expect(html).toContain('href="/equipos/S1"');
    expect(text(html)).toContain('TGR Los Tigres');
  });

  it('Seguir / Siguiendo', () => {
    const off = render(h(SquadFollowButton, { squadId: 'S1', name: 'Los Tigres', following: false }));
    expect(off).toContain('aria-pressed="false"');
    expect(off).toContain('aria-label="Seguir Los Tigres"');
    expect(text(off)).toContain('Seguir');
    const on = render(h(SquadFollowButton, { squadId: 'S1', name: 'Los Tigres', following: true }));
    expect(on).toContain('aria-pressed="true"');
    expect(text(on)).toContain('Siguiendo');
  });
});

describe('SquadRequestsPanel', () => {
  const request = (id: string, extra: Partial<SquadRequest> = {}): SquadRequest => ({
    id,
    squad: squad({ id: `S-${id}`, name: `Equipo ${id}` }),
    status: 'pending',
    note: null,
    createdAt: new Date().toISOString(),
    requestedBy: { id: 'u-ana', name: 'Ana' },
    ...extra,
  });

  it('sin pendientes no se ve (tampoco mientras carga)', () => {
    expect(render(h(SquadRequestsPanel, { lid: 'L1' }))).not.toContain('Equipos que quieren entrar');
    state.requests = { data: [request('r1', { status: 'approved' }), request('r2', { status: 'rejected' })], loading: false, error: null };
    expect(render(h(SquadRequestsPanel, { lid: 'L1' }))).not.toContain('data-squad-requests');
    state.requests = { data: [], loading: true, error: null };
    expect(render(h(SquadRequestsPanel, { lid: 'L1' }))).not.toContain('data-squad-requests');
    expect(state.askedLid).toContain('L1');
  });

  it('los pendientes: logo, nombre, cuántos son, quién lo pidió, Aceptar y Rechazar', () => {
    state.requests = { data: [request('r1'), request('r2', { requestedBy: { id: 'u2', name: '' } }), request('r3', { status: 'approved' })], loading: false, error: null };
    const html = render(h(SquadRequestsPanel, { lid: 'L1' }));
    const t = text(html);
    expect(t).toContain('Equipos que quieren entrar');
    expect(t).toContain('2 pendientes');
    expect(t).toContain('Equipo r1 [TGR]');
    expect(t).toContain('Fútbol · Santiago · 12 miembros · Lo pidió Ana');
    expect(t).not.toContain('Equipo r3');
    expect(html).toContain('href="/equipos/S-r1"');
    expect(html.match(/>Aceptar</g)).toHaveLength(2);
    expect(html.match(/>Rechazar</g)).toHaveLength(2);
    expect(html).toContain('>TGR</text>');
  });
});
