/**
 * Las pantallas del creador de insignias dibujadas sin navegador (renderToString): el editor con la vista previa, el
 * selector de íconos, los pasos de «Dar insignia», «Quién la tiene», la lista de Admin, los ajustes y la pestaña.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { BadgeHolder, LeagueBadge } from '../../../lib/data/leagueBadges';
import { LeagueContext, type LeagueCtx } from '../../../lib/league';
import type { League, Player } from '../../../lib/types';
import { FeedbackProvider } from '../../feedback';
import AdminPage from '../../../pages/AdminPage';
import { EditorBody, shownErrors, withTemplate } from './BadgeEditor';
import { blankDraft, draftFromBadge, periodChoices, templateDraft } from './design';
import { DesignHeader, HoldersList } from './DesignSheet';
import { DetailsStep, DoneStep, PickDesign, PreviewStep, SuggestionsBox, WhoStep } from './GiveBadge';
import { IconPicker } from './IconPicker';
import { designLook } from './look';
import MakerAdmin, { MakerEmpty } from './MakerAdmin';
import { DesignRow, RecentAwards } from './MakerHost';
import { MakerShelf, PlayerMadeBadges } from './MakerPanels';
import { BadgeMakersChoice } from './MakerSettings';

vi.mock('../../Tour', () => ({ Tour: () => null }));

const render = (el: ReactElement) => renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, el)));
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<title>[^<]*<\/title>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
const noop = () => undefined;

const NOW = Date.parse('2026-10-05T15:00:00Z');
const choices = periodChoices({ seasonStart: '2026-01-10', seasonEnd: '2026-11-28' }, NOW);

function badge(p: Partial<LeagueBadge> = {}): LeagueBadge {
  return {
    id: 'B1',
    leagueId: 'L1',
    name: 'Campeón',
    description: 'Terminaste de primero en la temporada.',
    shape: 'shield',
    palette: 'oro',
    color: null,
    icon: 'trophy',
    topText: '',
    periodText: 'TEMP 2026',
    template: 'champion',
    limitKind: 'unica',
    byTeam: false,
    status: 'activa',
    createdBy: 'u1',
    createdAt: '2026-10-01T12:00:00Z',
    updatedAt: '2026-10-01T12:00:00Z',
    given: 1,
    active: 1,
    locked: true,
    openReports: 2,
    ...p,
  };
}

const players: Player[] = [
  { id: 'p1', name: 'Ana', averageOverride: null, uid: 'u-ana' },
  { id: 'p2', name: 'Luis', averageOverride: null, uid: null },
  { id: 'p3', name: 'Rosa', averageOverride: null, uid: 'u-rosa' },
];

describe('editor (§5.4)', () => {
  it('nueva con plantilla: vista previa en claro y oscuro, tamaños, plantillas, formas, colores, íconos, cupo y periodo', () => {
    const draft = templateDraft('champion', 'bowling');
    const html = render(
      h(EditorBody, {
        draft,
        onChange: noop,
        onTemplate: noop,
        choices,
        sport: 'bowling',
        leagueName: 'Liga Los Pinos',
        isNew: true,
        locked: false,
        errors: {},
      }),
    );
    const t = text(html);
    for (const s of ['Claro', 'Oscuro', '24 px', '40 px', '64 px', 'Liga Los Pinos · Temporada 2026', 'Empieza con una plantilla', 'Mejor promedio', 'Estrella del mes']) expect(t).toContain(s);
    expect(html).toContain('vista previa en modo claro');
    expect(html).toContain('vista previa en modo oscuro');
    for (const s of ['Hexágono', 'Escudo', 'Medalla con laurel', 'Bronce', 'Diamante', 'Color de la liga', 'Otro color']) expect(t).toContain(s);
    expect(t).toContain('Nombre (sale debajo de la insignia)');
    expect(t).toContain('Texto de arriba (opcional, solo en grande)');
    for (const s of ['Única Solo 1 por periodo', 'Selecta Hasta 3', 'Abierta Hasta 20']) expect(t).toContain(s);
    expect(t).toContain('¿Qué hay que hacer para ganarla?');
    expect(html).toContain('Busca: trofeo, fuego, cigua…');
    // Boliche: sin «Por equipo».
    expect(t).not.toContain('Se da al equipo o la pareja completa');
    // El chip de la plantilla elegida y el de la forma salen prendidos.
    expect(html).toMatch(/aria-pressed="true"[^>]*>Campeón/);
    expect(html).toMatch(/<input[^>]*value="Campeón"/);
  });

  it('en raqueta y equipos sale «Por pareja» o «Por equipo»; «Otro color» muestra los colores y el aviso de ajuste', () => {
    const d = { ...blankDraft(), name: 'Amarilla', palette: 'color' as const, color: '#facc15' };
    const t = text(render(h(EditorBody, { draft: d, onChange: noop, onTemplate: noop, choices, sport: 'padel', leagueName: 'Liga', isNew: false, locked: false, errors: {} })));
    expect(t).toContain('Por pareja');
    expect(t).toContain('Se da al equipo o la pareja completa (cuenta como 1)');
    expect(t).toContain('Ajustamos el tono para que se lea bien.');
    expect(t).not.toContain('Empieza con una plantilla');
    const team = text(render(h(EditorBody, { draft: d, onChange: noop, onTemplate: noop, choices, sport: 'football', leagueName: 'Liga', isNew: true, locked: false, errors: {} })));
    expect(team).toContain('Por equipo');
  });

  it('ya dada: el aviso, «Duplicar» y los campos apagados menos la descripción; los errores de cada campo', () => {
    const html = render(
      h(EditorBody, {
        draft: draftFromBadge(badge(), choices),
        onChange: noop,
        onTemplate: noop,
        choices,
        sport: 'bowling',
        leagueName: 'Liga',
        isNew: false,
        locked: true,
        errors: { description: 'Ese texto no se puede usar.' },
        failure: 'Llegaste a 30 insignias activas. Archiva una para crear otra.',
        onDuplicate: noop,
      }),
    );
    const t = text(html);
    expect(t).toContain('Esta insignia ya se dio: solo puedes cambiar la descripción. Duplícala para hacer otra versión.');
    expect(t).toContain('Duplicar');
    expect(t).toContain('No se puede cambiar: la insignia ya se dio.');
    expect(t).toContain('Ese texto no se puede usar.');
    expect(t).toContain('Llegaste a 30 insignias activas');
    expect(html).toMatch(/<input[^>]*id="insignia-nombre"[^>]*disabled=""/);
    expect(html).not.toMatch(/<textarea[^>]*disabled=""[^>]*id="insignia-descripcion"/);
  });

  it('selector de íconos: pestañas, 44 px por botón y el elegido marcado', () => {
    const html = render(h(IconPicker, { value: 'bird', onChange: noop }));
    const t = text(html);
    for (const s of ['Deporte', 'Premios', 'Esfuerzo', 'Comunidad', 'Nuestra tierra']) expect(t).toContain(s);
    // Abre en la pestaña del elegido (la cigua es de «Nuestra tierra»).
    expect(html).toMatch(/aria-selected="true"[^>]*>Nuestra tierra/);
    expect(html).toMatch(/aria-pressed="true" aria-label="Cigua palmera"/);
    expect(html).toContain('size-11');
  });
});

describe('dar insignia (§5.6)', () => {
  it('elegir cuál: solo las activas', () => {
    const t = text(render(h(PickDesign, { designs: [badge(), badge({ id: 'B2', name: 'Vieja', status: 'archivada' })], sport: 'bowling', onPick: noop })));
    expect(t).toContain('¿Cuál vas a dar?');
    expect(t).toContain('Campeón');
    expect(t).not.toContain('Vieja');
    expect(text(render(h(PickDesign, { designs: [], sport: 'bowling', onPick: noop })))).toContain('No hay insignias activas');
  });

  it('¿a quién?: sugerencias, cupo, «Sin cuenta», «Ya la tiene» y «Tú»', () => {
    const html = render(
      h(WhoStep, {
        badge: badge({ limitKind: 'selecta' }),
        players,
        picked: ['p1'],
        onToggle: noop,
        onSuggestion: noop,
        myPlayerId: 'p2',
        holders: new Set(['p3']),
        left: 2,
        period: 'TEMP 2026',
        teams: null,
        teamId: null,
        onTeam: noop,
        suggestions: { list: [{ id: 'p1', playerIds: ['p1'], teamId: null, name: 'Ana', detail: 'Promedio 187 · 24 juegos', place: 1 }], note: null },
      }),
    );
    const t = text(html);
    expect(t).toContain('Sugerencias de la app');
    expect(t).toContain('Promedio 187 · 24 juegos');
    expect(t).toContain('La app sugiere; la liga decide.');
    expect(t).toContain('Selecta: quedan 2 lugares en TEMP 2026.');
    expect(t).toContain('Tú');
    expect(t).toContain('Ya la tiene');
    expect(t).toContain('1 elegido: Ana');
    expect(t).toContain('Nadie se da insignias a sí mismo.');
    // Luis es mío (disabled); Rosa ya la tiene (disabled); Ana, elegida.
    expect((html.match(/type="checkbox"[^>]*disabled=""/g) ?? []).length).toBe(2);
    expect(html).toMatch(/aria-pressed="true"/);
  });

  it('si no se pudieron leer los jugadores o los equipos, lo dice (no «todavía no hay»)', () => {
    const base = {
      badge: badge(),
      players: [],
      picked: [],
      onToggle: noop,
      onSuggestion: noop,
      myPlayerId: null,
      holders: new Set<string>(),
      left: 1,
      period: 'TEMP 2026',
      teams: null,
      teamId: null,
      onTeam: noop,
      suggestions: null,
    };
    const t = text(render(h(WhoStep, { ...base, error: new Error('red') })));
    expect(t).toContain('No se pudieron cargar los datos');
    expect(t).not.toContain('Todavía no hay jugadores');
    const teams = text(render(h(WhoStep, { ...base, badge: badge({ byTeam: true }), teams: [], teamsError: new Error('red') })));
    expect(teams).toContain('No se pudieron cargar los datos');
    expect(teams).not.toContain('Todavía no hay equipos');
  });

  it('por equipo: primero el equipo; sin sugerencias, la nota', () => {
    const t = text(
      render(
        h(WhoStep, {
          badge: badge({ byTeam: true }),
          players,
          picked: [],
          onToggle: noop,
          onSuggestion: noop,
          myPlayerId: null,
          holders: new Set<string>(),
          left: 1,
          period: 'TEMP 2026',
          teams: [{ id: 'T1', name: 'Tigres', roster: [{ playerId: 'p1' }] }],
          teamId: null,
          onTeam: noop,
          suggestions: { list: [], note: 'No hay un MVP guardado: decide la liga.' },
        }),
      ),
    );
    expect(t).toContain('Equipo o pareja');
    expect(t).toContain('Tigres');
    expect(t).toContain('Única: 1 equipo por periodo.');
    expect(t).toContain('No hay un MVP guardado: decide la liga.');
    expect(t).not.toContain('Busca un jugador');
    expect(text(render(h(SuggestionsBox, { outcome: { list: [], note: null }, loading: true, picked: [], teamId: null, onPick: noop })))).toContain('Calculando');
  });

  it('periodo, división, nota y «Avisarle» (apagado en ligas con menores)', () => {
    const props = {
      badge: badge(),
      choices,
      period: 'TEMP 2026',
      onPeriod: noop,
      division: '',
      onDivision: noop,
      note: '',
      onNote: noop,
      notify: true,
      onNotify: noop,
      minors: false,
      errors: { period: null, division: null, note: null },
      withAccount: 1,
    };
    const html = render(h(DetailsStep, props));
    const t = text(html);
    expect(t).toContain('El del diseño TEMP 2026');
    expect(t).not.toMatch(/Temporada TEMP 2026/);
    expect(t).toContain('Mes OCT 2026');
    expect(t).toContain('División (opcional)');
    expect(t).toContain('Nota para el jugador (opcional)');
    expect(html).toContain('“Por tu 279 en la final”');
    expect(t).toContain('Le llega un aviso al teléfono (tiene cuenta).');
    const minors = text(render(h(DetailsStep, { ...props, minors: true })));
    expect(minors).toContain('En ligas con menores no se mandan avisos.');
    // Varios: «Les».
    const many = text(render(h(DetailsStep, { ...props, withAccount: 3 })));
    expect(many).toContain('Les llega un aviso al teléfono (3 tienen cuenta).');
    expect(many).toContain('Avisarles');
  });

  it('«Así la verá» y el aviso de listo con «Deshacer»', () => {
    const t = text(
      render(h(PreviewStep, { badge: badge(), sport: 'bowling', leagueName: 'Liga Los Pinos', period: 'TEMP 2026', division: 'Cat. A', note: 'Por tu 279', names: ['Ana'], teamName: null, error: null })),
    );
    expect(t).toContain('Así la verá');
    expect(t).toContain('Otorgada por Liga Los Pinos');
    expect(t).toContain('“Por tu 279”');
    expect(t).toContain('Cat. A');
    expect(t).toContain('Para Ana .');
    const done = text(render(h(DoneStep, { badge: badge(), result: { awards: [], notified: 1 }, names: ['Ana'], period: 'TEMP 2026', error: null })));
    expect(done).toContain('Listo: Ana tiene “Campeón · TEMP 2026”');
    expect(done).toContain('Le avisamos a 1 jugador con cuenta.');
    const doneMany = text(render(h(DoneStep, { badge: badge(), result: { awards: [], notified: 3 }, names: ['Ana', 'Luis', 'Rosa'], period: 'TEMP 2026', error: null })));
    expect(doneMany).toContain('Les avisamos a 3 jugadores con cuenta.');
    expect(done).toContain('Puedes deshacerla durante 24 horas.');
  });
});

describe('quién la tiene, la lista y los ajustes', () => {
  const holder = (p: Partial<BadgeHolder>): BadgeHolder => ({
    id: 'a1',
    playerId: 'p1',
    playerName: 'Ana',
    userId: 'u-ana',
    teamId: null,
    teamName: null,
    period: 'TEMP 2026',
    division: '',
    awardedAt: '2026-10-04T12:00:00Z',
    hidden: false,
    revokedAt: null,
    note: null,
    awardedBy: 'u-owner',
    awardedByName: 'Rosa',
    revokedBy: null,
    revokeReason: null,
    canUndo: false,
    ...p,
  });

  it('el detalle: estado, reportes (admins), cupo y periodo', () => {
    const b = badge({ status: 'archivada' });
    const t = text(render(h(DesignHeader, { badge: b, look: designLook(b, 'bowling'), isAdmin: true })));
    expect(t).toContain('Archivada');
    expect(t).toContain('2 reportes');
    expect(t).toContain('Única · 1 por periodo · TEMP 2026');
    const hidden = text(render(h(DesignHeader, { badge: badge({ status: 'oculta' }), look: designLook(badge(), 'bowling'), isAdmin: false })));
    expect(hidden).toContain('Escondida por moderación');
    expect(hidden).not.toContain('reportes');
  });

  it('las filas: deshacer (quien la dio), quitar (el dueño), ocultar (el jugador) y las retiradas', () => {
    const list = [
      holder({ canUndo: true, awardedBy: 'u-me', note: 'Por tu 279' }),
      holder({ id: 'a2', playerId: 'p2', playerName: 'Luis', userId: null, canUndo: true, awardedBy: 'u-otro' }),
      holder({ id: 'a3', playerId: 'p3', playerName: 'Yo', userId: 'u-me', hidden: true }),
      holder({ id: 'a4', playerId: 'p4', playerName: 'Pedro', revokedAt: '2026-10-05T00:00:00Z', revokeReason: 'Se dio por error' }),
    ];
    const t = text(render(h(HoldersList, { holders: list, me: 'u-me', owner: true, onRevoke: noop, onToggleMine: noop })));
    expect(t).toContain('Deshacer');
    expect(t).toContain('Quitar');
    expect(t).toContain('Sin cuenta');
    expect(t).toContain('Mostrar en mi perfil');
    expect(t).toContain('Oculta en su perfil');
    expect(t).toContain('Se la dio Rosa');
    expect(t).toContain('“Por tu 279”');
    expect(t).toMatch(/Retirada · .* · Se dio por error/);
    // Quien no es el dueño solo deshace lo suyo (no ve quién la dio): el botón dice «Deshacer».
    const maker = text(render(h(HoldersList, { holders: [holder({ canUndo: true, awardedBy: null, awardedByName: null })], me: 'u-me', owner: false, onRevoke: noop, onToggleMine: noop })));
    expect(maker).toContain('Deshacer');
    expect(maker).not.toContain('Quitar');
  });

  it('la lista de Admin, las últimas dadas y sin diseños', () => {
    const t = text(render(h(DesignRow, { badge: badge({ active: 3 }), sport: 'bowling', onOpen: noop, reports: true })));
    expect(t).toContain('Única · TEMP 2026 · 3 la tienen');
    expect(t).toContain('Reportada');
    const recent = text(
      render(
        h(RecentAwards, {
          awards: [
            { id: 'a1', badgeId: 'B1', leagueId: 'L1', playerId: 'p1', teamId: null, period: 'TEMP 2026', division: '', awardedAt: '2026-10-04T12:00:00Z', revokedAt: null, hidden: false },
            { id: 'a2', badgeId: 'B1', leagueId: 'L1', playerId: 'p2', teamId: null, period: '', division: '', awardedAt: '2026-10-03T12:00:00Z', revokedAt: '2026-10-03T13:00:00Z', hidden: false },
          ],
          designs: [badge()],
          names: new Map([['p1', 'Ana']]),
          sport: 'bowling',
          onOpen: noop,
        }),
      ),
    );
    expect(recent).toContain('Ana · Campeón · TEMP 2026');
    expect(recent).toContain('4 oct 2026');
    expect(recent).not.toContain('Jugador');
    const empty = text(render(h(MakerEmpty, { can: true, kind: 'liga', sport: 'bowling', m: { openEditor: noop } })));
    expect(empty).toContain('Todavía no hay insignias de la liga');
    expect(empty).toContain('Campeón');
    expect(text(render(h(MakerEmpty, { can: false, sport: 'bowling', m: { openEditor: noop } })))).toContain('Cuando la liga cree insignias, salen aquí.');
  });

  it('«¿Quién diseña y da insignias?»: el dueño elige; los admins lo leen', () => {
    const owner = text(render(h(BadgeMakersChoice, { value: 'admins', onChange: noop })));
    for (const s of ['Solo yo', 'Yo y los admins', 'Yo y los que yo elija']) expect(owner).toContain(s);
    const admin = render(h(BadgeMakersChoice, { value: 'chosen' }));
    expect(text(admin)).toContain('El dueño y los miembros que él elige');
    expect(admin).toMatch(/<fieldset[^>]*disabled=""/);
  });
});

describe('Organizar › Insignias', () => {
  const league = (badgeMakers?: 'owner' | 'admins' | 'chosen'): League => ({
    id: 'l1',
    name: 'Liga del Club',
    kind: 'liga',
    visibility: 'private',
    ownerUid: 'u-owner',
    venue: '',
    schedule: '',
    seasonStart: '',
    seasonEnd: '',
    contactName: '',
    contactPhone: '',
    requirePhoto: false,
    sport: 'bowling',
    badgeMakers,
  });
  const ctx = (role: 'owner' | 'admin', badgeMakers?: 'owner' | 'admins' | 'chosen', badgeMaker?: boolean): LeagueCtx => ({
    lid: 'l1',
    league: league(badgeMakers),
    member: { id: 'l1_u', leagueId: 'l1', uid: 'u', name: 'Org', role, playerId: 'p1', badgeMaker },
    isAdmin: true,
    isOwner: role === 'owner',
    isScorer: false,
    canScore: true,
    myPlayerId: 'p1',
    base: '/l/l1',
  });
  const page = (c: LeagueCtx) =>
    renderToString(h(MemoryRouter, { initialEntries: ['/l/l1/admin?tab=insignias'] }, h(FeedbackProvider, null, h(LeagueContext.Provider, { value: c }, h(AdminPage)))));
  /** El creador de insignias (MakerAdmin) llega aparte: mientras, su esqueleto debajo de los ajustes. */
  const maker = (c: LeagueCtx) => page(c).includes('skeleton');

  it('la pantalla trae los ajustes («¿Quién diseña y da insignias?») y, para quien diseña y da, el creador', () => {
    expect(text(page(ctx('owner', 'owner')))).toContain('¿Quién diseña y da insignias?');
    expect(text(page(ctx('admin', 'owner')))).toContain('Insignias automáticas');
    expect(maker(ctx('owner', 'owner'))).toBe(true);
    expect(maker(ctx('admin', 'admins'))).toBe(true);
    expect(maker(ctx('admin', 'owner'))).toBe(false);
    expect(maker(ctx('admin', 'chosen'))).toBe(false);
    expect(maker(ctx('admin', 'chosen', true))).toBe(true);
  });

  const inLeague = (c: LeagueCtx, el: ReactElement) => text(render(h(LeagueContext.Provider, { value: c }, el)));

  it('la pestaña dibuja sin datos todavía; el estante y la página del jugador con diseños', () => {
    const tab = inLeague(ctx('owner', 'owner'), h(MakerAdmin));
    expect(tab).toContain('Insignias de la liga');
    expect(tab).toContain('Nueva insignia');
    expect(tab).toContain('Dar insignia');
    expect(tab).toContain('Las diseñan y las dan: solo el dueño');
    // Un admin sin permiso (la regla es «Solo yo») ve la lista pero no los botones.
    expect(inLeague(ctx('admin', 'owner'), h(MakerAdmin))).not.toContain('Nueva insignia');

    const data = {
      designs: [badge({ leagueId: 'l1', active: 2 }), badge({ id: 'B2', leagueId: 'l1', name: 'Vieja', status: 'archivada' })],
      awards: [
        { id: 'a1', badgeId: 'B1', leagueId: 'l1', playerId: 'p7', teamId: null, period: 'TEMP 2026', division: '', awardedAt: '2026-10-04T12:00:00Z', revokedAt: null, hidden: false },
        { id: 'a2', badgeId: 'B1', leagueId: 'l1', playerId: 'p8', teamId: null, period: 'TEMP 2025', division: '', awardedAt: '2025-10-04T12:00:00Z', revokedAt: null, hidden: false },
      ],
    };
    const shelf = inLeague(ctx('owner', 'owner'), h(MakerShelf, { data }));
    expect(shelf).toContain('Insignias de la liga');
    expect(shelf).toContain('2 la tienen');
    expect(shelf).not.toContain('Vieja');
    expect(shelf).toContain('Dar insignia');
    expect(shelf).toContain('Nueva insignia');
    const member = inLeague({ ...ctx('admin', 'owner'), isAdmin: false, member: { id: 'l1_u', leagueId: 'l1', uid: 'u', name: 'Ana', role: 'member', playerId: 'p7' } }, h(MakerShelf, { data }));
    expect(member).not.toContain('Dar insignia');
    const player = inLeague(ctx('owner'), h(PlayerMadeBadges, { playerId: 'p7', data }));
    expect(player).toContain('De la liga');
    expect(player).toContain('Campeón');
    expect(inLeague(ctx('owner'), h(PlayerMadeBadges, { playerId: 'p9', data })).trim()).toBe('');
  });
});

describe('el editor mientras se escribe', () => {
  it('el aviso del nombre no sale con las primeras letras; sí al guardar o si ya tiene 3 y algo no está bien', () => {
    const errors = { name: 'El nombre lleva de 3 a 28 letras.' };
    expect(shownErrors(errors, { name: 'C' }, false).name).toBeUndefined();
    expect(shownErrors(errors, { name: '' }, false).name).toBeUndefined();
    expect(shownErrors(errors, { name: 'C' }, true).name).toBe(errors.name);
    expect(shownErrors(errors, { name: 'Un nombre demasiado largo para caber' }, false).name).toBe(errors.name);
  });

  it('elegir una plantilla no borra el nombre ni la descripción que ya se escribieron', () => {
    const typed = { ...blankDraft(), name: 'Mi premio', description: 'Por venir siempre' };
    const tpl = templateDraft('champion', 'bowling');
    const next = withTemplate(typed, tpl);
    expect(next).toMatchObject({ name: 'Mi premio', description: 'Por venir siempre', shape: tpl.shape, icon: tpl.icon, template: tpl.template });
    expect(withTemplate(blankDraft(), tpl)).toEqual(tpl);
  });
});
