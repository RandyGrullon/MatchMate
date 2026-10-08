/**
 * Lo puro de las pantallas de Esports (pista 4): secciones, textos, el aviso de «Pon tu ID de juego», la acción
 * principal de la página del juego, los equipos (buscar, menú, lo que el capitán hace con cada uno), unirse con el
 * código, la hoja del ID (pasos, búsqueda, proveedores, la vuelta de «Conectar con…») y el rango que se elige (Rocket
 * League con MMR).
 */
import { describe, expect, it } from 'vitest';
import { BackendError } from '../../lib/backend/types';
import type { HubTournament, MyEntry } from '../../lib/data/esports';
import type { GameIdRecord, ProvidersStatus } from '../../lib/data/esportsIds';
import { LADDERS, formatLine } from '../../sports/esports';
import {
  afterLookup,
  canLookup,
  cleanTag,
  countWord,
  createTeamLink,
  defaultRankKey,
  divsOf,
  entryPhase,
  esportsNotice,
  gameHubActions,
  gameParam,
  gameSections,
  hasGameId,
  hubSections,
  idActions,
  idFor,
  idWord,
  initialIdSheetState,
  initialIdStep,
  isTakenError,
  joinState,
  linkProviderFor,
  linkResultToast,
  liveEntries,
  memberActions,
  membersText,
  mmrProposal,
  myEntrySubtitle,
  myIdLink,
  myIdsSubtitle,
  myTeamSubtitle,
  numberRank,
  numericId,
  openTournamentCount,
  pickTier,
  rankKeysFor,
  ranksToSend,
  raisedCode,
  rosterSummary,
  safeBack,
  setRank,
  sortIds,
  sortMembers,
  suggestTag,
  takenText,
  teamFormErrors,
  teamLists,
  teamMenu,
  teamPatch,
  teamTitle,
  toggleSubLabel,
  tournamentSubtitle,
  viewerRole,
  withQuery,
} from './logic';

const NOW = Date.parse('2026-10-08T15:00:00.000Z');
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

const rec = (over: Partial<GameIdRecord> = {}): GameIdRecord => ({
  userId: 'u1',
  game: 'valorant',
  platform: '',
  region: 'latam',
  idDisplay: 'Ana#LAN',
  status: 'confirmado',
  ownership: 'declarado',
  ranks: {},
  rankSource: 'declarado',
  verifiedAt: null,
  confirmedAt: iso(NOW),
  updatedAt: null,
  ...over,
});

const entry = (over: Partial<MyEntry> = {}): MyEntry => ({
  entryId: 'e1',
  eventId: 'ev1',
  leagueId: 'l1',
  tournament: 'Copa VAL',
  game: 'valorant',
  mode: '5v5',
  entryStatus: 'approved',
  tournamentStatus: 'registration',
  startsAt: iso(NOW + 48 * H),
  entryName: 'Los Tigres',
  role: 'captain',
  kind: 'team',
  ...over,
});

const tour = (over: Partial<HubTournament> = {}): HubTournament => ({
  eventId: 'ev1',
  leagueId: 'l1',
  name: 'Copa VAL',
  game: 'valorant',
  mode: '5v5',
  entryType: 'teams',
  format: 'double_elim',
  status: 'registration',
  startsAt: iso(NOW + 48 * H),
  registrationOpensAt: null,
  registrationClosesAt: iso(NOW + 24 * H),
  checkinMinutes: null,
  maxEntries: 16,
  prizeText: '',
  leagueName: 'Copa VAL',
  visibility: 'public',
  logoPath: null,
  approved: 6,
  pending: 1,
  ...over,
});

const PROVIDERS_ON: ProvidersStatus = { lookup: ['valorant', 'lol'], link: { steam: true, epic: true, riot: false } };
const PROVIDERS_OFF: ProvidersStatus = { lookup: [], link: { steam: true, epic: false, riot: false } };
const ALL_OFF: ProvidersStatus = { lookup: [], link: { steam: false, epic: false, riot: false } };

describe('Esports: secciones y textos', () => {
  it('los 15 juegos en «Por equipos», «1 contra 1» y «Battle royale»', () => {
    const s = gameSections();
    expect(s.map((x) => x.title)).toEqual(['Por equipos', '1 contra 1', 'Battle royale']);
    expect(s.map((x) => x.games.length)).toEqual([5, 6, 4]);
    expect(s[0].games.map((g) => g.id)).toEqual(['valorant', 'cs2', 'lol', 'mlbb', 'rocket_league']);
    expect(s[2].games[0].blurb).toBe('Battle royale · puesto + kills');
  });

  it('palabras: miembros, equipo con tag, subtítulo de «Mis equipos»', () => {
    expect(membersText(1)).toBe('1 miembro');
    expect(membersText(5)).toBe('5 miembros');
    expect(countWord(0, 'equipo', 'equipos')).toBe('0 equipos');
    expect(teamTitle({ name: 'Los Tigres', tag: 'TGR' })).toBe('Los Tigres [TGR]');
    expect(myTeamSubtitle({ game: 'valorant', memberCount: 5 }, 'captain')).toBe('VALORANT · 5 miembros · Capitán');
    expect(myTeamSubtitle({ game: 'rocket_league', memberCount: 3 }, 'member')).toBe('Rocket League · 3 miembros');
    expect(myTeamSubtitle({ game: 'cs2', memberCount: 7 }, 'sub')).toBe('Counter-Strike 2 · 7 miembros · Suplente');
  });

  it('«Mis torneos»: solo las vivas de torneos sin terminar, por fecha; la fase sin ventana', () => {
    const list = liveEntries([
      entry({ entryId: 'tarde', startsAt: iso(NOW + 72 * H) }),
      entry({ entryId: 'pronto', startsAt: iso(NOW + H), entryStatus: 'pending' }),
      entry({ entryId: 'retirada', entryStatus: 'withdrawn' }),
      entry({ entryId: 'asignado', entryStatus: 'assigned' }),
      entry({ entryId: 'terminado', tournamentStatus: 'finished' }),
      entry({ entryId: 'en-curso', tournamentStatus: 'live', startsAt: iso(NOW - H) }),
    ]);
    expect(list.map((e) => e.entryId)).toEqual(['en-curso', 'pronto', 'tarde']);
    expect(entryPhase(entry(), NOW)).toBe('registration');
    expect(entryPhase(entry({ startsAt: iso(NOW - 60_000) }), NOW)).toBe('closed');
    expect(entryPhase(entry({ tournamentStatus: 'live' }), NOW)).toBe('live');
    expect(myEntrySubtitle(entry({ entryStatus: 'pending' }))).toBe('Los Tigres · Por aprobar');
    expect(myEntrySubtitle(entry())).toBe('Los Tigres');
  });

  it('el aviso: sin ningún ID, «Pon tu ID de juego»; con uno (declarado basta), nada', () => {
    const base = { signedIn: true, ids: [] as GameIdRecord[], idsLoading: false };
    const tip = esportsNotice(base);
    expect(tip).toMatchObject({ id: 'esports-poner-id', kind: 'tip', title: 'Pon tu ID de juego', action: { label: 'Poner mi ID', to: '/esports/mi-id' } });
    expect(tip?.text).toBe('Así te pueden sumar a un equipo y te inscribes más rápido.');
    // Un ID declarado (sin comprobar) ya basta: no hay «Te falta confirmar».
    expect(esportsNotice({ ...base, ids: [rec({ status: 'pendiente' })] })).toBeNull();
    expect(esportsNotice({ ...base, ids: [rec()] })).toBeNull();
    expect(esportsNotice({ ...base, idsLoading: true })).toBeNull();
    expect(esportsNotice({ ...base, signedIn: false })).toBeNull();
    expect(esportsNotice({ ...base, onIdsPage: true })).toBeNull();
  });

  it('la fila «Mi ID de juego»: los juegos donde tienes ID (declarado o comprobado)', () => {
    expect(myIdsSubtitle([], false)).toBe('Para unirte a equipos e inscribirte');
    expect(myIdsSubtitle([], true)).toBe('Pon tu ID para inscribirte');
    expect(myIdsSubtitle([rec({ status: 'pendiente' })], true)).toBe('VALORANT');
    expect(myIdsSubtitle([rec({ game: 'cs2' }), rec()], true)).toBe('VALORANT · Counter-Strike 2');
    expect(myIdsSubtitle([rec(), rec({ game: 'cs2' }), rec({ game: 'nba_2k', platform: 'psn' }), rec({ game: 'nba_2k', platform: 'xbox' })], true)).toBe('3 juegos');
    expect(hasGameId([rec({ status: 'pendiente' })], 'valorant')).toBe(true);
    expect(hasGameId([rec()], 'cs2')).toBe(false);
    expect(hasGameId([rec()])).toBe(true);
    expect(hasGameId([])).toBe(false);
  });
});

describe('la página del juego', () => {
  it('torneos en «Inscripción abierta», «En curso» y «Terminados» (sin cancelados, en el orden de la base)', () => {
    const s = hubSections([
      tour({ eventId: 'a' }),
      tour({ eventId: 'b', status: 'live' }),
      tour({ eventId: 'c' }),
      tour({ eventId: 'd', status: 'finished' }),
      tour({ eventId: 'x', status: 'cancelled' }),
    ]);
    expect(s.map((x) => [x.title, x.items.map((t) => t.eventId)])).toEqual([
      ['Inscripción abierta', ['a', 'c']],
      ['En curso', ['b']],
      ['Terminados', ['d']],
    ]);
    expect(hubSections([tour({ status: 'live' })]).map((x) => x.key)).toEqual(['live']);
  });

  it('«Torneos abiertos» cuenta los que todavía aceptan inscripción; el subtítulo con el formato y el cupo', () => {
    const ts = [tour(), tour({ registrationClosesAt: iso(NOW - H), startsAt: iso(NOW + H) }), tour({ status: 'live' }), tour({ registrationOpensAt: iso(NOW + H) })];
    expect(openTournamentCount(ts, NOW)).toBe(1);
    const t = tour();
    expect(tournamentSubtitle(t)).toBe(`${formatLine(t)} · 6/16`);
    expect(tournamentSubtitle(t)).toContain('Doble eliminación');
  });

  it('la acción principal: Pro crea torneo (y equipo al lado); Lite crea equipo si no tiene, con «¿Organizas?»', () => {
    expect(gameHubActions({ pro: true, kind: 'team', hasTeam: true })).toEqual({ primary: 'tournament', secondary: 'team', organizeLink: false });
    expect(gameHubActions({ pro: true, kind: 'duel', hasTeam: false })).toEqual({ primary: 'tournament', secondary: null, organizeLink: false });
    expect(gameHubActions({ pro: false, kind: 'team', hasTeam: false })).toEqual({ primary: 'team', secondary: null, organizeLink: true });
    expect(gameHubActions({ pro: false, kind: 'br', hasTeam: false }).primary).toBe('team');
    expect(gameHubActions({ pro: false, kind: 'team', hasTeam: true }).primary).toBeNull();
    expect(gameHubActions({ pro: false, kind: 'duel', hasTeam: false })).toEqual({ primary: null, secondary: null, organizeLink: true });
  });

  it('equipos: los tuyos primero (aunque no vengan en la lista), sin repetir, y el buscador sin acentos ni mayúsculas', () => {
    const mine = [{ id: 't1', name: 'Los Tigres', tag: 'TGR' }];
    const all = [
      { id: 't1', name: 'Los Tigres', tag: 'TGR' },
      { id: 't2', name: 'Águilas del Cibao', tag: 'AGC' },
      { id: 't3', name: 'Fénix', tag: 'FNX' },
    ];
    expect(teamLists(mine, all, '')).toEqual({ mine, others: [all[1], all[2]] });
    expect(teamLists(mine, all, 'aguilas').others.map((t) => t.id)).toEqual(['t2']);
    expect(teamLists(mine, all, 'FENIX').others.map((t) => t.id)).toEqual(['t3']);
    expect(teamLists(mine, all, 'fnx').others.map((t) => t.id)).toEqual(['t3']);
    expect(teamLists(mine, all, 'tigr')).toEqual({ mine, others: [] });
  });

  it('?volver= solo a una ruta de la app; los links para poner el ID y crear equipo', () => {
    expect(safeBack('/esports/valorant?crear=equipo')).toBe('/esports/valorant?crear=equipo');
    expect(safeBack('//evil.com/x')).toBeNull();
    expect(safeBack('https://evil.com')).toBeNull();
    expect(safeBack('/\\evil.com')).toBeNull();
    expect(safeBack('')).toBeNull();
    expect(safeBack(null)).toBeNull();
    expect(withQuery('/l/abc', 'equipo', 't1')).toBe('/l/abc?equipo=t1');
    expect(withQuery('/esports/valorant?crear=x', 'equipo', 't1')).toBe('/esports/valorant?crear=x&equipo=t1');
    expect(myIdLink('valorant')).toBe('/esports/mi-id?juego=valorant');
    expect(myIdLink('valorant', '/esports/valorant?crear=equipo')).toBe('/esports/mi-id?juego=valorant&volver=%2Fesports%2Fvalorant%3Fcrear%3Dequipo');
    expect(createTeamLink('cs2')).toBe('/esports/cs2?crear=equipo');
    expect(createTeamLink('cs2', '/l/abc')).toBe('/esports/cs2?crear=equipo&volver=%2Fl%2Fabc');
    expect(gameParam('valorant')).toBe('valorant');
    expect(gameParam('zelda')).toBeNull();
    expect(gameParam(null)).toBeNull();
  });
});

describe('crear y editar un equipo', () => {
  it('el tag: mayúsculas, solo letras y números, hasta 5; el sugerido sale del nombre', () => {
    expect(cleanTag('tgr-1 ñ!')).toBe('TGR1N');
    expect(cleanTag('abcdefg')).toBe('ABCDE');
    expect(suggestTag('Los Tigres del Norte')).toBe('LTDN');
    expect(suggestTag('Fénix')).toBe('FENIX');
    expect(suggestTag('Dragones')).toBe('DRA');
    expect(suggestTag('Uno Dos Tres Cuatro Cinco Seis')).toBe('UDTCC');
    expect(suggestTag('   ')).toBe('');
  });

  it('lo que falta y lo que cambió', () => {
    expect(teamFormErrors({ name: 'Los Tigres', tag: 'TGR', description: '' })).toEqual({});
    expect(Object.keys(teamFormErrors({ name: ' A ', tag: 'T', description: 'x'.repeat(201) })).sort()).toEqual(['description', 'name', 'tag']);
    expect(teamFormErrors({ name: 'x'.repeat(41), tag: 'TG', description: '' }).name).toBe('El nombre va hasta 40 letras.');
    const team = { name: 'Los Tigres', tag: 'TGR', description: '' };
    expect(teamPatch(team, { name: 'Los Tigres ', tag: 'TGR', description: '' })).toBeNull();
    expect(teamPatch(team, { name: 'Tigres', tag: 'TIG', description: ' Hola ' })).toEqual({ name: 'Tigres', tag: 'TIG', description: 'Hola' });
  });
});

describe('la página del equipo', () => {
  const members = [
    { userId: 'u3', role: 'sub' as const, displayName: 'Zoe' },
    { userId: 'u2', role: 'member' as const, displayName: 'Bruno' },
    { userId: 'u1', role: 'captain' as const, displayName: 'Ana' },
    { userId: 'u4', role: 'member' as const, displayName: 'Ángel' },
  ];

  it('quién mira, el orden y el menú «•••»', () => {
    expect(viewerRole(members, 'u1')).toBe('captain');
    expect(viewerRole(members, 'u3')).toBe('sub');
    expect(viewerRole(members, 'x')).toBe('none');
    expect(viewerRole(members, null)).toBe('none');
    expect(sortMembers(members).map((m) => m.displayName)).toEqual(['Ana', 'Ángel', 'Bruno', 'Zoe']);
    expect(teamMenu('captain')).toEqual(['edit', 'delete']);
    expect(teamMenu('member')).toEqual(['leave']);
    expect(teamMenu('sub')).toEqual(['leave']);
    expect(teamMenu('none')).toEqual([]);
    expect(rosterSummary(members)).toBe('3 titulares · 1 suplente');
    expect(rosterSummary([{ role: 'captain' }])).toBe('1 titular');
  });

  it('el capitán con los demás: suplente o titular, capitanía y sacar; a sí mismo nada; los demás no pueden', () => {
    expect(memberActions('captain', members[1], 'u1')).toEqual(['toggle_sub', 'make_captain', 'remove']);
    expect(memberActions('captain', members[2], 'u1')).toEqual([]);
    expect(memberActions('member', members[0], 'u2')).toEqual([]);
    expect(memberActions('none', members[0], null)).toEqual([]);
    expect(toggleSubLabel('sub')).toBe('Hacer titular');
    expect(toggleSubLabel('member')).toBe('Hacer suplente');
  });

  it('unirse con el código: leyendo, no sirve, sin cuenta, ya estás, sin ID, listo', () => {
    const preview = { teamId: 't1', game: 'valorant' as const };
    const base = { preview, signedIn: true, loading: false, myTeamIds: new Set<string>(), ids: [rec()] };
    expect(joinState({ ...base, preview: undefined })).toBe('loading');
    expect(joinState({ ...base, loading: true })).toBe('loading');
    expect(joinState({ ...base, preview: null })).toBe('dead');
    expect(joinState({ ...base, signedIn: false })).toBe('signin');
    expect(joinState({ ...base, myTeamIds: new Set(['t1']) })).toBe('member');
    expect(joinState({ ...base, ids: [rec({ game: 'cs2' })] })).toBe('need_id');
    expect(joinState({ ...base, ids: [] })).toBe('need_id');
    // Basta con tener el ID puesto (declarado, sin comprobar).
    expect(joinState({ ...base, ids: [rec({ status: 'pendiente' })] })).toBe('ready');
    expect(joinState(base)).toBe('ready');
  });
});

describe('Mi ID de juego', () => {
  it('orden por juego, el de cada juego (y plataforma) y la etiqueta en una frase', () => {
    const list = sortIds([rec({ game: 'pubg_mobile' }), rec({ game: 'nba_2k', platform: 'xbox' }), rec({ game: 'nba_2k', platform: 'psn' }), rec()]);
    expect(list.map((r) => `${r.game}:${r.platform}`)).toEqual(['valorant:', 'nba_2k:psn', 'nba_2k:xbox', 'pubg_mobile:']);
    expect(idFor(list, 'nba_2k', 'xbox')?.platform).toBe('xbox');
    expect(idFor(list, 'nba_2k')?.platform).toBe('psn');
    expect(idFor(list, 'cs2')).toBeNull();
    expect(idWord('Código de amigo de Steam')).toBe('código de amigo de Steam');
    expect(idWord('Riot ID')).toBe('Riot ID');
    expect(numericId('cs2')).toBe(true);
    expect(numericId('valorant')).toBe(false);
  });

  it('búsqueda (solo LoL y VALORANT) y «Conectar con…» solo si el juego lo tiene y está encendido', () => {
    expect(canLookup('valorant', PROVIDERS_ON)).toBe(true);
    expect(canLookup('lol', PROVIDERS_ON)).toBe(true);
    expect(canLookup('valorant', PROVIDERS_OFF)).toBe(false);
    expect(canLookup('rocket_league', PROVIDERS_ON)).toBe(false);
    // Aunque la función dijera otra cosa, un juego sin búsqueda en el catálogo no busca.
    expect(canLookup('cs2', { lookup: ['cs2'] })).toBe(false);
    expect(canLookup('clash_royale', { lookup: ['clash_royale'] })).toBe(false);
    expect(linkProviderFor('cs2', PROVIDERS_OFF)).toBe('steam');
    expect(linkProviderFor('valorant', PROVIDERS_ON)).toBeNull(); // Riot apagado
    expect(linkProviderFor('rocket_league', PROVIDERS_ON)).toBe('epic');
    expect(linkProviderFor('fortnite', PROVIDERS_ON)).toBe('epic');
    expect(linkProviderFor('rocket_league', PROVIDERS_OFF)).toBeNull();
    expect(linkProviderFor('mlbb', PROVIDERS_ON)).toBeNull();
    // El modo local: todo apagado.
    expect(canLookup('lol', ALL_OFF)).toBe(false);
    expect(linkProviderFor('cs2', ALL_OFF)).toBeNull();
  });

  it('lo que se hace con un ID guardado: rango, comprobar con Riot, conectar, cambiarlo y quitarlo', () => {
    expect(idActions(rec({ status: 'pendiente' }), PROVIDERS_ON)).toEqual(['rank', 'lookup', 'change', 'delete']);
    expect(idActions(rec({ ownership: 'busqueda' }), PROVIDERS_ON)).toEqual(['rank', 'change', 'delete']);
    expect(idActions(rec({ game: 'rocket_league', status: 'pendiente' }), PROVIDERS_ON)).toEqual(['rank', 'link', 'change', 'delete']);
    expect(idActions(rec({ game: 'rocket_league', ownership: 'login' }), PROVIDERS_ON)).toEqual(['rank', 'delete']);
    expect(idActions(rec({ game: 'mlbb', status: 'pendiente' }), PROVIDERS_ON)).toEqual(['rank', 'change', 'delete']);
    expect(idActions(rec({ status: 'pendiente' }), ALL_OFF)).toEqual(['rank', 'change', 'delete']);
  });

  it('la vuelta de «Conectar con…»', () => {
    const q = (s: string) => new URLSearchParams(s);
    expect(linkResultToast(q('conectado=steam&juego=cs2'))).toEqual({ text: 'Listo: tu cuenta quedó conectada.', tone: 'ok' });
    expect(linkResultToast(q('error=estado_vencido'))).toEqual({ text: 'Se venció el inicio de sesión: vuelve a intentarlo.', tone: 'error' });
    expect(linkResultToast(q('error=proveedor'))?.text).toBe('El proveedor no lo confirmó.');
    expect(linkResultToast(q('error=no_disponible'))?.text).toBe('Conectar esa cuenta no está disponible ahora.');
    expect(linkResultToast(q('error=otra_cosa'))?.text).toBe('No se pudo conectar la cuenta.');
    expect(linkResultToast(q('juego=cs2'))).toBeNull();
  });

  it('los pasos de la hoja: abre en lo que hay o en escribir; la búsqueda decide el siguiente', () => {
    expect(initialIdStep(null)).toBe('edit');
    expect(initialIdStep(rec())).toBe('summary');
    expect(afterLookup({ status: 'found' }, 'Riot ID')).toEqual({ next: 'found', message: null });
    expect(afterLookup({ status: 'not_found' }, 'Riot ID')).toEqual({ next: 'edit', message: 'No encontramos ese Riot ID. Revisa cómo lo escribiste.' });
    // Sin búsqueda (el modo local), con un error o con muchas búsquedas: queda guardado declarado.
    expect(afterLookup({ status: 'no_disponible' }, 'Riot ID')).toEqual({ next: 'saved', message: null });
    expect(afterLookup({ status: 'error' }, 'Riot ID')).toEqual({ next: 'saved', message: null });
    expect(afterLookup({ status: 'rate_limited' }, 'Riot ID')).toEqual({ next: 'saved', message: null });

    const fresh = initialIdSheetState('valorant', null);
    expect(fresh).toEqual({ step: 'edit', raw: '', region: 'latam', platform: '', display: '', found: null, message: null, ranks: {} });
    expect(initialIdSheetState('lol', null).region).toBe('la1');
    expect(initialIdSheetState('free_fire', null).region).toBe('');
    const withRank = initialIdSheetState('valorant', rec({ region: 'na', ranks: { main: { tier: 'gold', div: 2 } } }));
    expect(withRank).toMatchObject({ step: 'summary', raw: 'Ana#LAN', display: 'Ana#LAN', region: 'na', ranks: { main: { tier: 'gold', div: 2 } } });
  });

  it('el rango que se manda al guardar: solo si cambió (un verificado no pasa a declarado por guardar el ID)', () => {
    expect(ranksToSend({ main: { tier: 'gold', div: 1 } }, null)).toEqual({ main: { tier: 'gold', div: 1 } });
    expect(ranksToSend({ main: { tier: 'gold', div: 1 } }, { main: { tier: 'gold', div: 2 } })).toEqual({ main: { tier: 'gold', div: 1 } });
    expect(ranksToSend({ main: { div: 1, tier: 'gold' } }, { main: { tier: 'gold', div: 1 } })).toBeUndefined();
    expect(ranksToSend({ '3v3': { tier: 'gc2', div: 3 }, '2v2': { tier: 'gold1', div: 1 } }, { '2v2': { tier: 'gold1', div: 1 }, '3v3': { tier: 'gc2', div: 3 } })).toBeUndefined();
    expect(ranksToSend({}, { main: { tier: 'gold', div: 1 } })).toEqual({});
    expect(ranksToSend({}, {})).toBeUndefined();
    expect(ranksToSend({}, null)).toBeUndefined();
  });

  it('«Ese ID está conectado a otra cuenta» se reconoce por el código de la base y dice con qué entró', () => {
    expect(isTakenError(new BackendError('id_tomado', 'validation', 'P0001'))).toBe(true);
    expect(isTakenError(new Error('id_tomado'))).toBe(true);
    expect(isTakenError(new BackendError('cerrado: torneo', 'validation', 'P0001'))).toBe(false);
    expect(raisedCode(new BackendError('cerrado: torneo', 'validation', 'P0001'))).toBe('cerrado');
    expect(raisedCode({ code: 'id_tomado', message: 'Ese ID está conectado a otra cuenta con su inicio de sesión.' })).toBe('id_tomado');
    expect(raisedCode(null)).toBeNull();
    expect(takenText('rocket_league')).toBe('Quien lo conectó entró con su cuenta de Epic. Si es tuyo, conéctalo tú y pasa a tu cuenta.');
    expect(takenText('cs2')).toContain('su cuenta de Steam');
    expect(takenText('mlbb')).toContain('su cuenta del juego');
  });
});

describe('el rango que se elige', () => {
  it('Rocket League por modo (3v3 primero); los demás, uno solo', () => {
    expect(rankKeysFor('rocket_league')).toEqual(['1v1', '2v2', '3v3']);
    expect(defaultRankKey('rocket_league')).toBe('3v3');
    expect(rankKeysFor('valorant')).toEqual(['main']);
    expect(defaultRankKey('valorant')).toBe('main');
    expect(setRank({}, '2v2', { tier: 'gold1', div: 1 })).toEqual({ '2v2': { tier: 'gold1', div: 1 } });
    expect(setRank({ main: { value: 5 } }, 'main', null)).toEqual({});
  });

  it('las divisiones de la más baja a la más alta: «1 2 3» (VALORANT) e «IV III II I» (LoL)', () => {
    const val = LADDERS.valorant;
    const lol = LADDERS.lol;
    if (val.kind !== 'tiers' || lol.kind !== 'tiers') throw new Error('escaleras');
    expect(divsOf(val, 'gold')).toEqual([1, 2, 3]);
    expect(divsOf(val, 'radiant')).toEqual([]);
    expect(divsOf(lol, 'gold')).toEqual([4, 3, 2, 1]);
    expect(pickTier(lol, 'gold')).toEqual({ tier: 'gold', div: 4 });
    expect(pickTier(val, 'radiant')).toEqual({ tier: 'radiant' });
    expect(pickTier(val, '')).toBeNull();
  });

  it('el MMR propone el rango de Rocket League (con el MMR guardado); el número de CS2 o Clash Royale', () => {
    expect(mmrProposal('3v3', '1650')).toEqual({ tier: 'gc2', div: 3, mmr: 1650 });
    expect(mmrProposal('3v3', '1900')).toEqual({ tier: 'ssl', mmr: 1900 });
    expect(mmrProposal('2v2', '-100')).toEqual({ tier: 'bronze1', div: 1, mmr: -100 });
    expect(mmrProposal('3v3', '3500')).toBeNull();
    expect(mmrProposal('3v3', '12a')).toBeNull();
    expect(mmrProposal('3v3', '')).toBeNull();
    expect(numberRank('1.245')).toEqual({ value: 1245 });
    expect(numberRank('7320')).toEqual({ value: 7320 });
    expect(numberRank('')).toBeNull();
  });
});
