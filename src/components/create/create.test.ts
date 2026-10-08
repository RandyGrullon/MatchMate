/**
 * «Crear o unirme» y el asistente «Crear una liga» (rediseño «Calma y foco»), sin navegador: la hoja con el código y el
 * QR primero y después Liga · Torneo · Práctica · Juego suelto; el asistente de 4 pasos (Nombre · Día y lugar ·
 * Temporada · Invitar) con su barra de pasos, y lo que arma para crear (lo mismo que el formulario de antes).
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { League, Member } from '../../lib/types';
import type { SportId } from '../../sports/types';
import { FeedbackProvider } from '../feedback';

const world = vi.hoisted(() => ({
  pro: false,
  leagues: [] as League[],
  members: [] as Member[],
  creatable: ['bowling'] as string[],
}));

vi.mock('../../lib/auth', async (orig) => ({
  ...(await orig<typeof import('../../lib/auth')>()),
  useAuth: () => ({ user: { uid: 'u1', email: 'ana@x.com', displayName: 'Ana Pérez' }, profile: null, isSuper: false, loading: false, recovering: false }),
}));
vi.mock('../home/useHomeData', () => ({
  useMyLeagues: () => ({
    uid: 'u1',
    memberships: { data: world.members, loading: false, error: null },
    all: world.leagues,
    leagues: world.leagues,
    loading: false,
    error: null,
    roleOf: (lid: string) => world.members.find((m) => m.leagueId === lid)?.role,
  }),
}));
vi.mock('../../lib/useMode', async (orig) => ({
  ...(await orig<typeof import('../../lib/useMode')>()),
  useIsPro: () => world.pro,
}));
vi.mock('../../sports/status', async (orig) => {
  const real = await orig<typeof import('../../sports/status')>();
  return {
    ...real,
    useSportStatus: () => ({
      status: {},
      loaded: true,
      creatable: world.creatable,
      choices: [],
      canCreate: (s: string) => world.creatable.includes(s),
    }),
  };
});
vi.mock('../home/LeagueCard', () => ({ LeagueLogo: ({ children }: { children: ReactNode }) => children }));

const { CreateSheet, JoinCodeBox, SoloOption, createChoices } = await import('./CreateSheet');
const { CreateWizard, StepBar, esportsCreatePath, wizardSport } = await import('./CreateWizard');
const logic = await import('./logic');

const render = (node: ReactNode) => renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, node)));
const text = (html: string) =>
  html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const league = (id: string, name: string, extra: Partial<League> = {}): League =>
  ({ id, name, kind: 'liga', visibility: 'public', sport: 'bowling', schedule: 'Martes · 7:30 pm', venue: '', logoPath: null, ...extra }) as League;
const member = (leagueId: string, role: Member['role']): Member => ({ id: `${leagueId}_u1`, leagueId, uid: 'u1', name: 'Ana Pérez', role, playerId: 'p1' });

beforeEach(() => {
  world.pro = false;
  world.leagues = [];
  world.members = [];
  world.creatable = ['bowling'];
});

const noop = () => undefined;
const sheet = () => render(h(CreateSheet, { open: true, onClose: noop, onJoin: noop, onCreate: noop, onEvent: noop, onSolo: noop }));

describe('la hoja «¿Qué quieres hacer?»', () => {
  it('primero unirse con el código (y el QR), después Liga · Torneo · Práctica · Juego suelto', () => {
    world.leagues = [league('l1', 'Liga de los martes')];
    world.members = [member('l1', 'owner')];
    const html = sheet();
    const t = text(html);
    expect(t).toContain('¿Qué quieres hacer?');
    expect(t).toContain('Unirme con un código');
    expect(t).toContain('Te lo da quien organiza la liga');
    expect(html).toContain('aria-label="Código de invitación"');
    expect(t).toContain('o escanea el QR');
    const order = ['Unirme con un código', 'Crear', 'Una liga', 'Para jugar cada semana', 'Un torneo', 'Un día, con o sin liga', 'Una práctica', 'En Liga de los martes', 'Un juego suelto', 'Solo para ti, sin liga'];
    const at = order.map((s) => t.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    // Ya no está el menú viejo.
    expect(t).not.toContain('Torneo sin liga');
    expect(t).not.toContain('¿Te invitaron?');
  });

  it('sin ligas que organiza no ofrece «Una práctica»; el torneo es suelto', () => {
    world.leagues = [league('l1', 'Liga de los martes')];
    world.members = [member('l1', 'member')];
    const t = text(sheet());
    expect(t).not.toContain('Una práctica');
    expect(t).toContain('Un día, con sus inscritos');
  });

  it('el juego suelto (boliche) no sale a quien solo juega otros deportes', () => {
    world.leagues = [league('l1', 'Pádel Naco', { sport: 'padel' })];
    world.members = [member('l1', 'member')];
    expect(text(sheet())).not.toContain('Un juego suelto');
  });

  it('cerrada no dibuja nada adentro', () => {
    const t = text(render(h(CreateSheet, { open: false, onClose: noop, onJoin: noop, onCreate: noop, onEvent: noop, onSolo: noop })));
    expect(t).not.toContain('Unirme con un código');
  });

  it('createChoices: las ligas de boliche que organiza (no torneos sueltos ni otros deportes), en orden', () => {
    const ls = [league('b', 'Liga B'), league('a', 'Liga A'), league('t', 'Copa', { kind: 'torneo' }), league('p', 'Pádel', { sport: 'padel' }), league('m', 'Miembro')];
    const ms = [member('b', 'admin'), member('a', 'owner'), member('t', 'owner'), member('p', 'owner'), member('m', 'member')];
    const c = createChoices(ls, ms);
    expect(c.organized.map((o) => o.league.id)).toEqual(['a', 'b']);
    expect(c.soloOk).toBe(true);
    expect(createChoices([], []).soloOk).toBe(true);
    expect(createChoices([league('p', 'Pádel', { sport: 'padel' })], []).soloOk).toBe(false);
  });

  it('la caja del código y la opción del juego suelto', () => {
    const t = text(render(h(JoinCodeBox, { onJoin: noop, onQr: noop })));
    expect(t).toContain('Unirme');
    expect(t).toContain('o escanea el QR');
    expect(text(render(h(SoloOption, { onClick: noop })))).toContain('Un juego suelto Solo para ti, sin liga');
  });
});

describe('el asistente «Crear una liga»', () => {
  const wizard = (kind: 'liga' | 'torneo' = 'liga', sport: SportId | null = null) =>
    render(h(CreateWizard, { kind, sport, onClose: noop, onDone: noop }));

  it('arranca en el paso 1 de 4 con la barra de pasos y un solo botón', () => {
    const html = wizard();
    const t = text(html);
    expect(t).toContain('Crear una liga');
    expect(t).toContain('1 de 4');
    for (const s of ['Nombre', 'Día y lugar', 'Temporada', 'Invitar']) expect(t).toContain(s);
    expect(t).toContain('¿Cómo se llama tu liga?');
    expect(t).toContain('¿Quién la puede ver?');
    expect(t).toContain('Privada');
    expect(t).toContain('Pública');
    // Sin nombre todavía no se puede seguir; no hay «Atrás» en el primer paso.
    expect(html).toMatch(/<button type="submit" form="wz-form" disabled=""/);
    expect(t).toContain('Siguiente');
    expect(t).not.toContain('Atrás');
    // Con un solo deporte no se pregunta; el logo es de Pro.
    expect(t).not.toContain('Deporte');
    expect(t).not.toContain('Logo (opcional)');
  });

  it('en Pro, el logo; con varios deportes, el deporte con «Cambiar»', () => {
    world.pro = true;
    world.creatable = ['bowling', 'padel'];
    const t = text(wizard());
    expect(t).toContain('Logo (opcional)');
    expect(t).toContain('Deporte');
    expect(t).toContain('Boliche');
    expect(t).toContain('Cambiar');
  });

  it('si juega varios deportes, chips con los suyos y «Otro»', () => {
    world.creatable = ['bowling', 'padel', 'tennis'];
    world.leagues = [league('a', 'A'), league('b', 'B', { sport: 'padel' })];
    const t = text(wizard());
    expect(t).toContain('Boliche');
    expect(t).toContain('Pádel');
    expect(t).toContain('Otro');
  });

  it('un torneo sin liga va en 3 pasos', () => {
    const t = text(wizard('torneo'));
    expect(t).toContain('Crear un torneo');
    expect(t).toContain('1 de 3');
    expect(t).toContain('Fecha y lugar');
    expect(t).not.toContain('Temporada');
    expect(t).toContain('¿Cómo se llama el torneo?');
  });

  it('la barra marca el paso actual (y los hechos)', () => {
    const html = render(h(StepBar, { labels: ['Nombre', 'Día y lugar', 'Temporada', 'Invitar'], index: 1 }));
    expect(html).toMatch(/aria-current="step"[^>]*>Día y lugar</);
    expect((html.match(/bg-accent/g) ?? []).length).toBe(2);
  });

  it('el deporte marcado: el pedido, el único que juega o el boliche', () => {
    expect(wizardSport(['bowling', 'padel'], 'padel', [])).toBe('padel');
    expect(wizardSport(['bowling', 'padel'], 'tennis', [])).toBe('bowling');
    expect(wizardSport(['bowling', 'padel'], null, ['padel'])).toBe('padel');
    expect(wizardSport(['bowling', 'padel'], null, ['padel', 'bowling'])).toBe('bowling');
    expect(wizardSport(['padel'], null, [])).toBe('padel');
  });

  it('esports: marcado solo si se pidió (quien solo juega esports igual puede crear otra cosa)', () => {
    // Venir de Esports (el deporte en que estabas) no lo marca: el asistente se iría sin dejar elegir otro.
    expect(wizardSport(['bowling', 'esports'], 'esports', [])).toBe('bowling');
    expect(wizardSport(['padel', 'esports'], 'esports', ['padel'])).toBe('padel');
    expect(wizardSport(['bowling', 'padel', 'esports'], null, ['esports'])).toBe('bowling');
    expect(wizardSport(['padel', 'esports'], null, ['esports', 'padel'])).toBe('padel');
    expect(wizardSport(['esports'], null, [])).toBe('esports');
  });

  it('elegir esports lleva a Esports a elegir el juego (torneo o liga)', () => {
    expect(esportsCreatePath('torneo')).toBe('/esports?crear=torneo');
    expect(esportsCreatePath('liga')).toBe('/esports?crear=liga');
  });
});

describe('lógica del asistente', () => {
  const base = () => logic.emptyForm('liga', 'Ana Pérez', '2026-10-07');

  it('pasos y en cuál se crea', () => {
    expect(logic.wizardSteps('liga').map((s) => s.label)).toEqual(['Nombre', 'Día y lugar', 'Temporada', 'Invitar']);
    expect(logic.wizardSteps('torneo').map((s) => s.label)).toEqual(['Nombre', 'Fecha y lugar', 'Invitar']);
    expect(logic.createStep('liga')).toBe('temporada');
    expect(logic.createStep('torneo')).toBe('lugar');
  });

  it('las horas van de 6:00 am a 11:45 pm cada 15 minutos', () => {
    expect(logic.TIME_OPTIONS[0]).toEqual({ value: '06:00', label: '6:00 am' });
    expect(logic.TIME_OPTIONS.find((o) => o.value === '19:30')?.label).toBe('7:30 pm');
    expect(logic.TIME_OPTIONS.at(-1)?.value).toBe('23:45');
  });

  it('la frase de cuándo juegan', () => {
    expect(logic.scheduleSummary([1], '19:30', 'semana')).toEqual({ before: 'Jugarán ', strong: 'todos los martes, 7:30 pm' });
    expect(logic.scheduleSummary([3, 1], '', 'semana').strong).toBe('todos los martes y jueves');
    expect(logic.scheduleSummary([5, 6], '10:00', 'semana').strong).toBe('todos los sábados y domingos, 10:00 am');
    expect(logic.scheduleSummary([], '19:30', 'semana')).toEqual({ before: 'Elige el día (o los días) en que juegan.', strong: '' });
    expect(logic.scheduleSummary([1], '19:30', 'libre').strong).toBe('cada fecha a las 7:30 pm');
    expect(logic.scheduleText([1], '19:30', 'semana')).toBe('Martes · 7:30 pm');
    expect(logic.scheduleText([1], '19:30', 'libre')).toBe('7:30 pm');
  });

  it('fechas en palabras', () => {
    expect(logic.longDay('2026-10-24')).toBe('sábado 24 de octubre');
    expect(logic.longDay('')).toBe('');
    expect(logic.seasonRange('2026-09-01', '2026-12-15')).toBe('del 1 sept al 15 dic');
    expect(logic.seasonRange('2026-09-01', '2027-01-31')).toBe('del 1 sept de 2026 al 31 ene de 2027');
  });

  it('cuándo se puede seguir', () => {
    const f = base();
    expect(logic.canAdvance('nombre', 'liga', f)).toBe(false);
    expect(logic.canAdvance('nombre', 'liga', { ...f, name: '  Liga  ' })).toBe(true);
    expect(logic.canAdvance('lugar', 'liga', f)).toBe(true);
    expect(logic.canAdvance('lugar', 'torneo', { ...f, date: '' })).toBe(false);
    expect(logic.canAdvance('temporada', 'liga', { ...f, hasSeason: true, seasonStart: '2026-12-01', seasonEnd: '2026-11-01' })).toBe(false);
    expect(logic.canAdvance('temporada', 'liga', { ...f, hasSeason: true, ...logic.defaultSeason('2026-10-07') })).toBe(true);
  });

  it('lo que se manda al crear (como el formulario de antes)', () => {
    const f = { ...base(), name: '  Liga de los martes ', venue: ' Bolera Sambil ', days: [1], time: '19:30', contactPhone: '(809) 555-0000', seasonStart: '2026-09-01', seasonEnd: '2026-12-15' };
    const liga = logic.wizardInput('liga', 'bowling', f);
    expect(liga).toMatchObject({
      name: 'Liga de los martes',
      kind: 'liga',
      visibility: 'private',
      venue: 'Bolera Sambil',
      schedule: 'Martes · 7:30 pm',
      seasonStart: '',
      seasonEnd: '',
      contactName: 'Ana Pérez',
      contactPhone: '8095550000',
      requirePhoto: true,
      hasMinors: false,
      tz: 'America/Santo_Domingo',
      sport: 'bowling',
    });
    expect(logic.wizardInput('liga', 'bowling', { ...f, hasSeason: true })).toMatchObject({ seasonStart: '2026-09-01', seasonEnd: '2026-12-15' });
    // Con menores: privada y sin foto. Sin foto en los deportes sin foto.
    expect(logic.wizardInput('liga', 'bowling', { ...f, visibility: 'public', hasMinors: true })).toMatchObject({ visibility: 'private', requirePhoto: false, hasMinors: true });
    expect(logic.wizardInput('liga', 'swimming', f).requirePhoto).toBe(false);
    // El torneo: sin horario, temporada, menores ni zona.
    const torneo = logic.wizardInput('torneo', 'bowling', { ...logic.emptyForm('torneo', 'Ana', '2026-10-07'), name: 'Copa', hasSeason: true, seasonStart: '2026-01-01' });
    expect(torneo).toMatchObject({ kind: 'torneo', visibility: 'public', schedule: '', seasonStart: '', hasMinors: undefined, tz: undefined });
  });
});
