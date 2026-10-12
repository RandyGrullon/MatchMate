/**
 * Plataformas de esports en las pantallas (docs/perfiles-equipos-esports.md §4), lo puro: la plataforma en las filas
 * (página del juego, «Mis torneos», la línea del torneo y su info), el campo del paso de formato de «Crear torneo» por
 * juego, el `?plataforma=` de Mi ID de juego (NBA 2K con su clave), «¿Dónde juegas?», «Conectar otra cuenta», la vuelta
 * con `?error=cerrado` y el `?volver=` que sobrevive a «Conectar con…».
 */
import { describe, expect, it } from 'vitest';
import type { HubTournament, MyEntry } from '../../lib/data/esports';
import type { GameIdRecord, ProvidersStatus } from '../../lib/data/esportsIds';
import { defaultSettings, platformInfoText, platformLabel } from '../../sports/esports';
import { emptyForm, platformPick, stepErrors, summary, tournamentInput, withFormat, withMode } from './create/logic';
import {
  LINK_ERROR_TEXT,
  STEAM_SWITCH_NOTE,
  asksPlatforms,
  idActions,
  idKeyFor,
  initialIdSheetState,
  linkBackPath,
  linkResultToast,
  myEntrySubtitle,
  myIdLink,
  platformChips,
  samePlatforms,
  togglePlatform,
  tournamentSubtitle,
  wantedPlatform,
} from './logic';

const rec = (over: Partial<GameIdRecord> = {}): GameIdRecord => ({
  userId: 'u1',
  game: 'rocket_league',
  platform: '',
  platforms: [],
  region: '',
  idDisplay: 'AnaRL',
  status: 'pendiente',
  ownership: 'declarado',
  ranks: {},
  rankSource: 'declarado',
  verifiedAt: null,
  confirmedAt: null,
  updatedAt: null,
  ...over,
});

const hub = (over: Partial<HubTournament> = {}): HubTournament => ({
  eventId: 'ev1',
  leagueId: 'l1',
  name: 'Copa RL',
  game: 'rocket_league',
  mode: '3v3',
  entryType: 'teams',
  format: 'single_elim',
  status: 'registration',
  startsAt: '2026-10-20T23:00:00.000Z',
  registrationOpensAt: null,
  registrationClosesAt: '2026-10-20T23:00:00.000Z',
  checkinMinutes: null,
  maxEntries: 16,
  prizeText: '',
  leagueName: 'Copa RL',
  visibility: 'public',
  logoPath: null,
  approved: 6,
  pending: 0,
  ...over,
});

const mine = (over: Partial<MyEntry> = {}): MyEntry => ({
  entryId: 'e1',
  eventId: 'ev1',
  leagueId: 'l1',
  tournament: 'Copa RL',
  game: 'rocket_league',
  mode: '3v3',
  entryStatus: 'pending',
  tournamentStatus: 'registration',
  startsAt: '2026-10-20T23:00:00.000Z',
  entryName: 'Los Tigres',
  role: 'captain',
  kind: 'team',
  ...over,
});

const ON: ProvidersStatus = { lookup: ['valorant', 'lol'], link: { steam: true, epic: true, riot: false } };
const TODAY = '2026-10-08';

describe('la plataforma de cada torneo en las filas', () => {
  it('la página del juego: la plataforma primero (si se sabe), después el formato y el cupo', () => {
    expect(tournamentSubtitle(hub({ platform: 'playstation' }))).toBe('PlayStation · 3 contra 3 · Eliminación simple · Solo equipos · 6/16');
    expect(tournamentSubtitle(hub({ platform: 'crossplay' }))).toMatch(/^Crossplay · /);
    expect(tournamentSubtitle(hub({ game: 'valorant', mode: '5v5', platform: 'pc' }))).toMatch(/^PC · 5 contra 5/);
    // Sin saberla todavía: sin plataforma (no se inventa «Crossplay»).
    expect(tournamentSubtitle(hub())).toBe('3 contra 3 · Eliminación simple · Solo equipos · 6/16');
  });

  it('«Mis torneos»: el juego, la plataforma, con qué te inscribiste y si falta que lo aprueben', () => {
    expect(myEntrySubtitle(mine({ platform: 'xbox' }))).toBe('Rocket League · Xbox · Los Tigres · Por aprobar');
    expect(myEntrySubtitle(mine({ game: 'valorant', platform: 'pc', entryStatus: 'approved' }))).toBe('VALORANT · PC · Los Tigres');
    expect(myEntrySubtitle(mine({ entryStatus: 'approved' }))).toBe('Rocket League · Los Tigres');
  });

  it('la línea y la info del torneo: la de sus ajustes (lo viejo de NBA 2K convertido; sin valor, la de siempre)', () => {
    expect(platformLabel('valorant', undefined)).toBe('PC');
    expect(platformLabel('valorant', '')).toBe('PC');
    expect(platformLabel('rocket_league', 'playstation')).toBe('PlayStation');
    expect(platformLabel('rocket_league', undefined)).toBe('Crossplay');
    expect(platformLabel('nba_2k', 'psn')).toBe('PlayStation');
    expect(platformLabel('nba_2k', 'steam')).toBe('PC');
    expect(platformLabel('mlbb', 'crossplay')).toBe('Móvil');
    expect(platformLabel('otro', 'pc')).toBe('');
    expect(platformInfoText('rocket_league', 'crossplay')).toBe('Crossplay (PC, PlayStation, Xbox y Nintendo Switch)');
    expect(platformInfoText('sf6', 'xbox')).toBe('Xbox');
    expect(platformInfoText('smash', undefined)).toBe('Nintendo Switch');
  });
});

describe('crear torneo: la plataforma en el paso de formato', () => {
  it('un juego de varias: fichas con «Crossplay» primero y las suyas; uno de una sola: solo el texto', () => {
    const rl = platformPick('rocket_league', 'crossplay');
    expect(rl.options.map((o) => o.label)).toEqual(['Crossplay', 'PC', 'PlayStation', 'Xbox', 'Nintendo Switch']);
    expect(rl.value).toBe('crossplay');
    expect(rl.note).toBe('Entra gente de todas las plataformas.');
    expect(platformPick('sf6', 'playstation')).toMatchObject({ value: 'playstation', note: 'Solo entran quienes juegan en PlayStation.' });
    expect(platformPick('sf6', 'crossplay').options.map((o) => o.key)).toEqual(['crossplay', 'pc', 'playstation', 'xbox']);
    expect(platformPick('fortnite', 'mobile').options.map((o) => o.key)).toContain('mobile');
    // NBA 2K viejo (psn) se ve como PlayStation.
    expect(platformPick('nba_2k', 'psn').value).toBe('playstation');
    const val = platformPick('valorant', 'pc');
    expect(val.options.map((o) => o.key)).toEqual(['pc']);
    expect(val.note).toBe('VALORANT se juega en PC.');
    expect(platformPick('clash_royale', '').note).toBe('Clash Royale se juega en Móvil.');
  });

  it('por defecto la única del juego o «crossplay»; se queda al cambiar de modo o formato; se manda y se valida', () => {
    expect(emptyForm('valorant', TODAY).settings.platform).toBe('pc');
    expect(emptyForm('free_fire', TODAY).settings.platform).toBe('mobile');
    const rl = emptyForm('rocket_league', TODAY);
    expect(rl.settings.platform).toBe('crossplay');
    const ps = { ...rl, settings: { ...rl.settings, platform: 'playstation' } };
    expect(withMode(ps, '2v2').settings.platform).toBe('playstation');
    expect(withFormat(ps, 'double_elim').settings.platform).toBe('playstation');
    expect(summary(ps)).toBe('Eliminación simple · Al mejor de 5 y 7 en la final · Solo equipos · PlayStation');
    const o = { tz: 'America/Santo_Domingo', now: Date.parse('2026-10-08T12:00:00Z') };
    expect(stepErrors('formato', ps, o)).toEqual([]);
    expect(stepErrors('formato', { ...rl, settings: { ...rl.settings, platform: 'mobile' } }, o)).toEqual(['Elige la plataforma.']);
    expect(tournamentInput({ ...ps, name: 'Copa' }, o.tz).settings.platform).toBe('playstation');
    // NBA 2K: lo viejo sigue valiendo; la nueva lista también.
    const nba = emptyForm('nba_2k', TODAY);
    expect(nba.settings.platform).toBe('crossplay');
    expect(stepErrors('formato', { ...nba, settings: { ...nba.settings, platform: 'psn' } }, o)).toEqual([]);
    expect(stepErrors('formato', { ...nba, settings: { ...defaultSettings('nba_2k', '1v1', 'single_elim'), platform: 'switch' } }, o)).toEqual([]);
  });
});

describe('Mi ID de juego: dónde juegas y otra cuenta', () => {
  it('`?plataforma=`: la del torneo (también la clave vieja de NBA 2K) y la clave del ID en NBA 2K', () => {
    expect(wantedPlatform('rocket_league', 'playstation')).toBe('playstation');
    expect(wantedPlatform('rocket_league', 'mobile')).toBeNull();
    expect(wantedPlatform('rocket_league', 'crossplay')).toBeNull();
    expect(wantedPlatform('rocket_league', null)).toBeNull();
    expect(wantedPlatform('nba_2k', 'psn')).toBe('playstation');
    expect(wantedPlatform('nba_2k', 'pc')).toBe('pc');
    expect(idKeyFor('nba_2k', 'playstation')).toBe('psn');
    expect(idKeyFor('nba_2k', 'pc')).toBe('steam');
    expect(idKeyFor('nba_2k', 'xbox')).toBe('xbox');
    expect(idKeyFor('nba_2k', 'psn')).toBe('psn');
    expect(idKeyFor('nba_2k', 'crossplay')).toBe('');
    expect(idKeyFor('rocket_league', 'playstation')).toBe('');
  });

  it('«¿Dónde juegas?»: en los juegos de varias plataformas (no en NBA 2K ni en los de una sola); se marcan varias', () => {
    expect(asksPlatforms('rocket_league')).toBe(true);
    expect(asksPlatforms('fortnite')).toBe(true);
    expect(asksPlatforms('nba_2k')).toBe(false);
    expect(asksPlatforms('valorant')).toBe(false);
    expect(asksPlatforms('mlbb')).toBe(false);
    expect(platformChips('sf6').map((c) => c.label)).toEqual(['PC', 'PlayStation', 'Xbox']);
    expect(togglePlatform('rocket_league', ['xbox'], 'pc')).toEqual(['pc', 'xbox']);
    expect(togglePlatform('rocket_league', ['pc', 'xbox'], 'pc')).toEqual(['xbox']);
    expect(samePlatforms(['pc', 'xbox'], ['xbox', 'pc'])).toBe(true);
    expect(samePlatforms(['pc'], [])).toBe(false);
  });

  it('la hoja abre con lo que dice el ID; si no dice nada y viene de un torneo, con la del torneo marcada', () => {
    expect(initialIdSheetState('rocket_league', rec({ platforms: ['pc'] }), 'playstation').platforms).toEqual(['pc']);
    expect(initialIdSheetState('rocket_league', rec(), 'playstation').platforms).toEqual(['playstation']);
    expect(initialIdSheetState('rocket_league', null, 'xbox')).toMatchObject({ step: 'edit', platforms: ['xbox'] });
    expect(initialIdSheetState('rocket_league', null).platforms).toEqual([]);
    expect(initialIdSheetState('valorant', null, 'pc').platforms).toEqual([]);
    // NBA 2K: sin ID de esa plataforma, se elige esa (la clave del ID).
    expect(initialIdSheetState('nba_2k', null, 'playstation')).toMatchObject({ platform: 'psn', platforms: [] });
    expect(initialIdSheetState('nba_2k', rec({ game: 'nba_2k', platform: 'xbox' }), 'playstation').platform).toBe('xbox');
  });

  it('«Conectar otra cuenta» en los IDs conectados (si el proveedor está encendido); la nota de Steam', () => {
    expect(idActions(rec({ ownership: 'login', status: 'confirmado' }), ON)).toEqual(['rank', 'relink', 'delete']);
    expect(idActions(rec({ game: 'cs2', ownership: 'login', status: 'confirmado' }), ON)).toEqual(['rank', 'relink', 'delete']);
    expect(idActions(rec({ ownership: 'declarado' }), ON)).toEqual(['rank', 'link', 'change', 'delete']);
    expect(idActions(rec({ game: 'ea_fc', ownership: 'declarado' }), ON)).toEqual(['rank', 'change', 'delete']);
    expect(STEAM_SWITCH_NOTE).toBe('Para usar otra cuenta de Steam, cierra sesión de Steam en el navegador antes.');
  });

  it('la vuelta de «Conectar con…»: `?error=cerrado` (el ID juega un torneo en curso)', () => {
    expect(LINK_ERROR_TEXT.cerrado).toBe('Ya estás jugando un torneo con esta cuenta: cámbiala cuando termine.');
    expect(linkResultToast(new URLSearchParams('error=cerrado&juego=rocket_league'))).toEqual({
      text: 'Ya estás jugando un torneo con esta cuenta: cámbiala cuando termine.',
      tone: 'error',
    });
  });

  it('el `?volver=` de ida y vuelta: Mi ID con la plataforma del torneo, y «Conectar con…» vuelve a la misma hoja', () => {
    const back = '/l/01900000-0000-7000-8000-00000000000a/e/01900000-0000-7000-8000-00000000000e';
    const link = myIdLink('rocket_league', back, 'playstation');
    expect(link).toBe(`/esports/mi-id?juego=rocket_league&plataforma=playstation&volver=${encodeURIComponent(back)}`);
    const q = new URLSearchParams(link.split('?')[1]);
    expect([q.get('juego'), q.get('plataforma'), q.get('volver')]).toEqual(['rocket_league', 'playstation', back]);
    // Crossplay no dice plataforma; sin volver, tampoco lo dice.
    expect(myIdLink('rocket_league', back, 'crossplay')).toBe(`/esports/mi-id?juego=rocket_league&volver=${encodeURIComponent(back)}`);
    expect(myIdLink('valorant')).toBe('/esports/mi-id?juego=valorant');
    // «Conectar con…» vuelve a Mi ID con todo (esports-auth guarda hasta 200 letras, sin espacios).
    const path = linkBackPath('rocket_league', back, 'playstation');
    expect(path).toBe(link);
    expect(path.length).toBeLessThanOrEqual(200);
    expect(/\s/.test(path)).toBe(false);
    // Si no cabe: sin la plataforma, después sin volver.
    const long = `/l/${'x'.repeat(130)}`;
    expect(linkBackPath('rocket_league', long, 'playstation')).toBe(myIdLink('rocket_league', long));
    expect(linkBackPath('rocket_league', `/l/${'x'.repeat(200)}`, 'playstation')).toBe('/esports/mi-id?juego=rocket_league');
  });
});
