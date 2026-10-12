/**
 * Inscribirse con la plataforma del torneo (docs/perfiles-equipos-esports.md §4), lo puro: qué ID cuenta en cada juego
 * (NBA 2K por la plataforma del torneo; los demás, el único), lo que falta («Otra plataforma», «Sin plataforma») en el
 * mismo orden que la base, las frases para ti, lo que pide el torneo, el aviso de la página y quién de la inscripción
 * tiene ahora otro ID que el que quedó al inscribirse.
 */
import { describe, expect, it } from 'vitest';
import type { GameIdRecord } from '../../../lib/data/esportsIds';
import { defaultSettings, type GameId } from '../../../sports/esports';
import { MEMBER_PROBLEM, idNotice, memberProblem, myProblemText, platformOf, platformRequirement, staleMembers, tournamentIdFor } from './logic';
import { idFor, memberProblemLabel, playsOnText } from './register/RegisterSheet';
import { mkMember, mkTournament } from './testData';

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

/** Un torneo de ese juego con esa plataforma en sus ajustes. */
const tour = (game: GameId, platform?: string, over: Parameters<typeof mkTournament>[0] = {}) => {
  const mode = game === 'rocket_league' ? '3v3' : game === 'valorant' ? '5v5' : '1v1';
  const settings = defaultSettings(game, mode, 'single_elim');
  return mkTournament({ game, mode, format: 'single_elim', entryType: mode === '1v1' ? 'open' : 'teams', settings: platform === undefined ? settings : { ...settings, platform }, ...over });
};

describe('el ID que cuenta para el torneo (idFor)', () => {
  it('juegos de una sola plataforma y de varias: el único ID del juego (de esa persona)', () => {
    const list = [rec({ game: 'valorant', idDisplay: 'Ana#LAN' }), rec({ userId: 'u2', idDisplay: 'BeaRL' }), rec()];
    expect(idFor(list, tour('valorant'))?.idDisplay).toBe('Ana#LAN');
    expect(idFor(list, tour('rocket_league', 'playstation'), 'u2')?.idDisplay).toBe('BeaRL');
    expect(idFor(list, tour('rocket_league', 'crossplay'), 'u1')?.idDisplay).toBe('AnaRL');
    expect(idFor(list, tour('cs2'))).toBeNull();
  });

  it('NBA 2K: el de la plataforma del torneo (también con lo viejo: psn); crossplay, primero el comprobado; solo de otra: ese', () => {
    const nba = [rec({ game: 'nba_2k', platform: 'steam', idDisplay: 'AnaPC' }), rec({ game: 'nba_2k', platform: 'psn', idDisplay: 'AnaPS', status: 'confirmado' })];
    expect(idFor(nba, tour('nba_2k', 'playstation'))?.idDisplay).toBe('AnaPS');
    expect(idFor(nba, tour('nba_2k', 'psn'))?.idDisplay).toBe('AnaPS');
    expect(idFor(nba, tour('nba_2k', 'pc'))?.idDisplay).toBe('AnaPC');
    expect(idFor(nba, tour('nba_2k', 'crossplay'))?.idDisplay).toBe('AnaPS');
    // Sin ID de Xbox, uno de otra plataforma (el comprobado primero): la base dice «otra_plataforma», no «sin_id».
    expect(idFor(nba, tour('nba_2k', 'xbox'))?.idDisplay).toBe('AnaPS');
    expect(tournamentIdFor([], tour('nba_2k', 'xbox'))).toBeNull();
  });
});

describe('lo que falta: la plataforma (en el orden de la base)', () => {
  const rk = 'main';
  it('torneo de PlayStation: «Otra plataforma» si su ID es de otras; «Sin plataforma» si no lo dijo; crossplay acepta todo', () => {
    const ps = tour('rocket_league', 'playstation').settings;
    expect(memberProblem(rec({ platforms: ['pc'] }), ps, rk, 'rocket_league')).toBe(MEMBER_PROBLEM.otherPlatform);
    expect(memberProblem(rec({ platforms: ['pc', 'playstation'] }), ps, rk, 'rocket_league')).toBeNull();
    expect(memberProblem(rec(), ps, rk, 'rocket_league')).toBe(MEMBER_PROBLEM.noPlatform);
    expect(memberProblem(null, ps, rk, 'rocket_league')).toBe(MEMBER_PROBLEM.noId);
    const cross = tour('rocket_league', 'crossplay').settings;
    expect(memberProblem(rec(), cross, rk, 'rocket_league')).toBeNull();
    expect(memberProblem(rec({ platforms: ['xbox'] }), cross, rk, 'rocket_league')).toBeNull();
    // Sin la clave (torneos de antes): crossplay en los de varias.
    expect(memberProblem(rec(), { requireConfirmedId: false, requireVerifiedRank: false }, rk, 'rocket_league')).toBeNull();
  });

  it('la plataforma va antes que «ID sin comprobar»; los de una sola plataforma no piden nada', () => {
    const ps = { ...tour('rocket_league', 'playstation').settings, requireConfirmedId: true };
    expect(memberProblem(rec({ platforms: ['pc'] }), ps, 'main', 'rocket_league')).toBe(MEMBER_PROBLEM.otherPlatform);
    expect(memberProblem(rec({ platforms: ['playstation'] }), ps, 'main', 'rocket_league')).toBe(MEMBER_PROBLEM.unchecked);
    expect(memberProblem(rec({ game: 'valorant' }), tour('valorant').settings, 'main', 'valorant')).toBeNull();
    expect(memberProblem(rec({ game: 'mlbb' }), tour('mlbb', 'mobile', { mode: '5v5' }).settings, 'main', 'mlbb')).toBeNull();
  });

  it('NBA 2K: la plataforma sale de la clave del ID', () => {
    const t = tour('nba_2k', 'playstation');
    const pc = rec({ game: 'nba_2k', platform: 'steam' });
    expect(memberProblem(pc, t.settings, 'main', 'nba_2k')).toBe(MEMBER_PROBLEM.otherPlatform);
    expect(memberProblem(rec({ game: 'nba_2k', platform: 'psn' }), t.settings, 'main', 'nba_2k')).toBeNull();
    expect(memberProblem(idFor([pc], t), t.settings, 'main', 'nba_2k')).toBe(MEMBER_PROBLEM.otherPlatform);
  });

  it('las frases para ti y lo que pide el torneo', () => {
    expect(myProblemText(MEMBER_PROBLEM.otherPlatform, 'rocket_league', { tournament: 'playstation', playsOn: ['pc'] })).toBe('Tu ID es de PC y el torneo es de PlayStation.');
    expect(myProblemText(MEMBER_PROBLEM.otherPlatform, 'rocket_league', { tournament: 'playstation', playsOn: ['pc', 'xbox'] })).toBe('Tu ID es de PC y Xbox, y el torneo es de PlayStation.');
    expect(myProblemText(MEMBER_PROBLEM.otherPlatform, 'rocket_league')).toBe('Tu ID de Rocket League es de otra plataforma que la del torneo.');
    expect(myProblemText(MEMBER_PROBLEM.noPlatform, 'rocket_league', { tournament: 'playstation' })).toBe('Di dónde juegas Rocket League.');
    expect(myProblemText(MEMBER_PROBLEM.noId, 'valorant')).toBe('Primero pon tu ID de VALORANT.');
    expect(platformRequirement('rocket_league', 'playstation')).toBe('Este torneo es de PlayStation.');
    expect(platformRequirement('sf6', 'crossplay')).toBe('Este torneo es crossplay: entra gente de PC, PlayStation y Xbox.');
    expect(platformRequirement('valorant', 'pc')).toBeNull();
    expect(platformOf(tour('nba_2k', 'steam'))).toBe('pc');
    expect(platformOf(tour('valorant', ''))).toBe('pc');
  });

  it('la fila de la plantilla y la tarjeta del ID: «Otra plataforma (PC)», dónde juega', () => {
    expect(memberProblemLabel(MEMBER_PROBLEM.otherPlatform, 'rocket_league', rec({ platforms: ['pc'] }))).toBe('Otra plataforma (PC)');
    expect(memberProblemLabel(MEMBER_PROBLEM.noPlatform, 'rocket_league', rec())).toBe('Sin plataforma');
    expect(memberProblemLabel(MEMBER_PROBLEM.noId, 'rocket_league', null)).toBe('Sin ID');
    // En el orden del juego.
    expect(playsOnText('rocket_league', rec({ platforms: ['playstation', 'pc'] }))).toBe('PC y PlayStation');
    expect(playsOnText('rocket_league', rec())).toBe('Sin plataforma');
    expect(playsOnText('valorant', rec({ game: 'valorant' }))).toBe('');
    expect(playsOnText('nba_2k', rec({ game: 'nba_2k', platform: 'psn' }))).toBe('PlayStation');
  });

  it('el aviso de la página del torneo dice la plataforma', () => {
    expect(idNotice(MEMBER_PROBLEM.noId, 'rocket_league', 'playstation', [])).toEqual({
      key: 'poner',
      title: 'Pon tu ID de Rocket League',
      text: 'Este torneo es de PlayStation. Lo necesitas para inscribirte.',
      action: 'Poner mi ID',
    });
    expect(idNotice(MEMBER_PROBLEM.otherPlatform, 'rocket_league', 'playstation', ['pc'])).toMatchObject({ key: 'plataforma', title: 'Tu ID es de PC y el torneo es de PlayStation', action: 'Cambiar mi ID' });
    expect(idNotice(MEMBER_PROBLEM.noPlatform, 'rocket_league', 'xbox', [])).toMatchObject({ title: 'Di dónde juegas Rocket League', text: 'Este torneo es de Xbox. Lo necesitas para inscribirte.' });
    expect(idNotice(MEMBER_PROBLEM.noId, 'valorant', 'pc', []).text).toBe('Lo necesitas para inscribirte.');
    expect(idNotice(MEMBER_PROBLEM.unchecked, 'valorant', 'pc', []).key).toBe('comprobar');
  });
});

describe('«Actualizar mi ID en la inscripción»: quién tiene ahora otro ID que el de la inscripción', () => {
  it('otro ID o otro rango; no el que no tiene ID ni el de otra plataforma', () => {
    const t = tour('rocket_league', 'playstation');
    const members = [mkMember('u1', 'Ana', 'captain', { gamerTag: 'AnaRL' }), mkMember('u2', 'Bea', 'member', { gamerTag: 'BeaViejo' }), mkMember('u3', 'Caro'), mkMember('u4', 'Dani', 'member', { gamerTag: 'DaniRL' })];
    const records = [
      rec({ userId: 'u1', idDisplay: 'AnaRL', platforms: ['playstation'] }),
      rec({ userId: 'u2', idDisplay: 'BeaNuevo', platforms: ['playstation'] }),
      rec({ userId: 'u4', idDisplay: 'DaniPC', platforms: ['pc'] }),
    ];
    expect(staleMembers(members, records, t)).toEqual(['u2']);
    // El rango también cuenta (es lo que vuelve a tomar la base).
    const ranked = [{ ...records[0], ranks: { '3v3': { tier: 'gold1', div: 1 } } }, ...records.slice(1)];
    expect(staleMembers(members, ranked, t)).toEqual(['u1', 'u2']);
    expect(staleMembers(members, [], t)).toEqual([]);
  });
});
