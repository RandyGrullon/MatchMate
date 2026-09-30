import { describe, expect, it } from 'vitest';
import { evaluate } from '../engine';
import type { BadgeSnapshot, SnapEvent, SnapLadderChallenge, SnapMatch, SnapMatchPlayer, SnapMatchSide } from '../snapshot';
import { matchSides, snapEvent, snapLeague, snapMatch } from '../testkit';
import type { RacketSport } from '../../sports/racket';
import { gives, job, NOW, of, player, revokes, row, snap, world } from './fixtures';

/** Cuentas de los jugadores de raqueta (p9 sin cuenta). */
const USERS: Record<string, string | null> = { p1: 'u1', p2: 'u2', p3: 'u3', p4: 'u4', p5: 'u5', p6: 'u6', p7: 'u7', p8: 'u8', p9: null };
const PLAYERS = Object.entries(USERS).map(([p, u]) => player(p, 'L', u));

interface Built {
  matches: SnapMatch[];
  match_sides: SnapMatchSide[];
  match_players: SnapMatchPlayer[];
}

/** Sets ganados por lado de un marcador «6-4 3-6 10-7». */
function setsOf(text: string): [number, number] {
  const out: [number, number] = [0, 0];
  for (const t of text.split(' ')) {
    const m = /^(\d+)-(\d+)/.exec(t);
    if (m) out[Number(m[1]) > Number(m[2]) ? 0 : 1]++;
  }
  return out;
}

/**
 * Un partido a sets en la fecha (19:00 locales): el lado 1 lo propone y el lado 2 lo confirma (R2 para los dos).
 * `teams` pone parejas de temporada en los lados.
 */
function mk(id: string, day: string, s1: string[], s2: string[], text: string, over: Partial<SnapMatch> = {}, teams: [string | null, string | null] = [null, null]): Built {
  const { sides, players } = matchSides(id, [teams[0], s1], [teams[1], s2]);
  const sets = setsOf(text);
  const match = snapMatch(id, {
    scheduled_at: `${day}T23:00:00.000Z`,
    score: { text, sides: sets },
    winner_side: sets[0] > sets[1] ? 1 : 2,
    proposed_by: USERS[s1[0]] ?? 'u-admin',
    proposed_side: 1,
    confirmed_by: USERS[s2[0]] ?? null,
    confirmed_at: `${day}T23:30:00.000Z`,
    ...over,
  });
  return { matches: [match], match_sides: sides, match_players: players };
}

const join = (...bs: Built[]): Built => ({
  matches: bs.flatMap((b) => b.matches),
  match_sides: bs.flatMap((b) => b.match_sides),
  match_players: bs.flatMap((b) => b.match_players),
});

const day = (month: number, d: number) => `2026-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function run(b: Built, over: Partial<BadgeSnapshot> = {}, j = job('resultado', { ref: `match:${b.matches[b.matches.length - 1].id}` }), sport: RacketSport = 'padel') {
  const w = world(sport, { players: PLAYERS, ...b, ...over });
  return evaluate(j, snap(j, w), NOW);
}

describe('racket_career', () => {
  it('Partidos jugados: 10 partidos R1 de la cuenta (máximo 4 por día) dan bronce; queda el progreso a plata', () => {
    // 5 el mismo día (solo cuentan 4) y 6 en días distintos = 10.
    const same = Array.from({ length: 5 }, (_, i) => mk(`s${i}`, day(3, 7), ['p1', 'p2'], ['p3', 'p4'], '6-4 6-4'));
    const spread = Array.from({ length: 6 }, (_, i) => mk(`d${i}`, day(4, i + 1), ['p1', 'p2'], ['p3', 'p4'], '3-6 4-6'));
    const ds = run(join(...same, ...spread));
    const got = of(ds, 'racket_matches').filter((d) => d.user_id === 'u1');
    expect(got.map((d) => d.level)).toEqual([1]);
    expect(got[0]).toMatchObject({ sport: 'padel', period_key: '-', status: 'provisional', refs: ['match:d5'] });
    expect(of(ds, 'racket_matches', 'progress').find((d) => d.user_id === 'u1')).toMatchObject({ value: 10, target: 30, next_level: 2 });
  });

  it('Partidos jugados: 9 partidos no llegan; sin cuenta suma solo lo de su liga', () => {
    const ms = Array.from({ length: 9 }, (_, i) => mk(`m${i}`, day(5, i + 1), ['p1', 'p9'], ['p3', 'p4'], '6-4 6-4'));
    const ds = run(join(...ms));
    expect(of(ds, 'racket_matches')).toEqual([]);
    expect(of(ds, 'racket_matches', 'progress').find((d) => d.player_id === 'p9')).toMatchObject({ league_id: 'L', value: 9, target: 10 });
  });

  it('Victorias: 5 victorias R2 a sets; máximo 3 por mes contra el mismo rival', () => {
    const rivals = [
      ['p3', 'p4'],
      ['p5', 'p6'],
    ];
    // 4 contra la misma pareja en junio (cuenta 3) + 1 contra otra = 4: no llega.
    const june = [0, 1, 2, 3].map((i) => mk(`j${i}`, day(6, i + 1), ['p1', 'p2'], rivals[0], '6-1 6-1'));
    const other = mk('o1', day(6, 10), ['p1', 'p2'], rivals[1], '6-2 6-2');
    expect(of(run(join(...june, other)), 'racket_wins').filter((d) => d.user_id === 'u1')).toEqual([]);
    // Una más en julio contra la primera pareja: 5.
    const july = mk('k1', day(7, 1), ['p1', 'p2'], rivals[0], '6-3 6-3');
    const ds = run(join(...june, other, july));
    expect(of(ds, 'racket_wins').filter((d) => d.user_id === 'u1').map((d) => d.level)).toEqual([1]);
    // El rival confirmó, pero él no ganó ninguna.
    expect(of(ds, 'racket_wins').filter((d) => d.user_id === 'u3')).toEqual([]);
  });

  it('Victorias: un partido que el propio lado propuso y confirmó no es R2', () => {
    const ms = [0, 1, 2, 3, 4].map((i) => mk(`x${i}`, day(8, i + 1), ['p1', 'p2'], [`p${3 + (i % 2) * 2}`, `p${4 + (i % 2) * 2}`], '6-0 6-0', { confirmed_by: 'u2' }));
    expect(of(run(join(...ms)), 'racket_wins')).toEqual([]);
  });

  it('Racha ganadora: 3 victorias R2 seguidas con 2 rivales distintos; una derrota corta', () => {
    const win = (id: string, d: string, rival: string[]) => mk(id, d, ['p1', 'p2'], rival, '6-3 6-3');
    const loss = mk('l1', day(2, 4), ['p1', 'p2'], ['p5', 'p6'], '3-6 3-6');
    const ok = run(join(win('w1', day(2, 1), ['p3', 'p4']), win('w2', day(2, 2), ['p5', 'p6']), win('w3', day(2, 3), ['p3', 'p4'])));
    expect(of(ok, 'racket_win_streak').find((d) => d.user_id === 'u1')).toMatchObject({ level: 1, refs: ['match:w3'], context: { values: { n: 3, rivales: 2 } } });
    const cut = run(join(win('w1', day(2, 1), ['p3', 'p4']), win('w2', day(2, 2), ['p5', 'p6']), loss, win('w3', day(2, 5), ['p3', 'p4'])));
    expect(of(cut, 'racket_win_streak').filter((d) => d.user_id === 'u1')).toEqual([]);
    // Siempre el mismo rival: no vale aunque sean 3.
    const same = run(join(win('w1', day(2, 1), ['p3', 'p4']), win('w2', day(2, 2), ['p3', 'p4']), win('w3', day(2, 3), ['p3', 'p4'])));
    expect(of(same, 'racket_win_streak').filter((d) => d.user_id === 'u1')).toEqual([]);
  });

  it('Sangre fría: 3 sets ganados 7-6 (y el súper tie-break del set decisivo)', () => {
    const ms = [mk('t1', day(3, 1), ['p1', 'p2'], ['p3', 'p4'], '7-6(4) 6-3'), mk('t2', day(3, 2), ['p1', 'p2'], ['p5', 'p6'], '6-7(5) 6-4 10-8'), mk('t3', day(3, 3), ['p1', 'p2'], ['p3', 'p4'], '7-6(2) 7-6(9)')];
    const ds = run(join(...ms));
    // t1: 1, t2: el súper tie-break, t3: 2 → 4.
    expect(of(ds, 'racket_tiebreaks').find((d) => d.user_id === 'u1')).toMatchObject({ level: 1, refs: ['match:t3'] });
    expect(of(ds, 'racket_tiebreaks', 'progress').find((d) => d.user_id === 'u1')).toMatchObject({ value: 4, target: 10 });
    // El lado 2 ganó un tie-break (el de t2): no llega.
    expect(of(ds, 'racket_tiebreaks').filter((d) => d.user_id === 'u3' || d.user_id === 'u5')).toEqual([]);
  });

  it('Al filo (pickleball): juegos ganados más allá de 11', () => {
    const PB = { match: { gameTo: 11, bestOf: 3 } };
    const ms = [
      mk('k1', day(3, 1), ['p1', 'p2'], ['p3', 'p4'], '13-11 11-5', { rules: PB }),
      mk('k2', day(3, 2), ['p1', 'p2'], ['p3', 'p4'], '12-10 13-11', { rules: PB }),
    ];
    const ds = run(join(...ms), {}, undefined, 'pickleball');
    expect(of(ds, 'racket_tiebreaks').find((d) => d.user_id === 'u1')).toMatchObject({ sport: 'pickleball', level: 1 });
  });

  it('Al filo (ping pong): juegos ganados después del 10-10 (12-10, 13-11…); un 11-9 no cuenta', () => {
    const ms = [
      mk('f1', day(3, 1), ['p1'], ['p3'], '12-10 11-5 13-11'),
      mk('f2', day(3, 2), ['p1'], ['p5'], '11-9 14-12 8-11 11-3'),
    ];
    const ds = run(join(...ms), {}, undefined, 'table_tennis');
    // f1: 2, f2: 1 → 3 (el bronce).
    expect(of(ds, 'racket_tiebreaks').find((d) => d.user_id === 'u1')).toMatchObject({ sport: 'table_tennis', level: 1, refs: ['match:f2'] });
    expect(of(ds, 'racket_tiebreaks', 'progress').find((d) => d.user_id === 'u1')).toMatchObject({ value: 3, target: 10 });
    expect(of(ds, 'racket_tiebreaks').filter((d) => d.user_id === 'u3')).toEqual([]);
  });

  it('las de carrera corren para el ping pong (racketTargets): victorias y racha', () => {
    const win = (id: string, d: string, rival: string) => mk(id, d, ['p1'], [rival], '11-7 11-8 11-9');
    const ms = [win('w1', day(9, 1), 'p3'), win('w2', day(9, 2), 'p5'), win('w3', day(9, 3), 'p3'), win('w4', day(9, 4), 'p5'), win('w5', day(9, 5), 'p7')];
    const ds = run(join(...ms), {}, undefined, 'table_tennis');
    expect(of(ds, 'racket_wins').filter((d) => d.user_id === 'u1')).toEqual([expect.objectContaining({ sport: 'table_tennis', level: 1 })]);
    expect(of(ds, 'racket_win_streak').filter((d) => d.user_id === 'u1').map((d) => `${d.sport}:${d.level}`)).toEqual(['table_tennis:1', 'table_tennis:2']);
    expect(of(ds, 'racket_matches', 'progress').find((d) => d.user_id === 'u1')).toMatchObject({ sport: 'table_tennis', value: 5 });
  });

  it('Buena química: victorias R2 en dobles con 3 compañeros distintos', () => {
    const ms = [mk('c1', day(4, 1), ['p1', 'p2'], ['p3', 'p4'], '6-2 6-2'), mk('c2', day(4, 2), ['p1', 'p5'], ['p3', 'p4'], '6-2 6-2'), mk('c3', day(4, 3), ['p1', 'p6'], ['p3', 'p4'], '6-2 6-2')];
    const ds = run(join(...ms));
    expect(of(ds, 'racket_partners').find((d) => d.user_id === 'u1')).toMatchObject({ level: 1, refs: ['match:c3'] });
    expect(of(ds, 'racket_partners').filter((d) => d.user_id === 'u2')).toEqual([]);
  });

  it('Escalando: reto jugado que ganó como retador, con partido R2', () => {
    const m = mk('lc', day(5, 3), ['p1'], ['p3'], '6-4 6-4');
    const challenge: SnapLadderChallenge = { id: 'c1', league_id: 'L', event_id: 'LAD', challenger: 'p1', challenged: 'p3', match_id: 'lc', status: 'played', winner: 'p1', resolved_at: '2026-05-04T12:00:00.000Z' };
    const ds = run(m, { ladder_challenges: [challenge] }, undefined, 'tennis');
    expect(of(ds, 'racket_ladder_climber').map((d) => `${d.user_id}:${d.level}`)).toEqual(['u1:1']);
    // Un W.O. por plazo no cuenta.
    const wo = run(m, { ladder_challenges: [{ ...challenge, status: 'walkover' }] }, undefined, 'tennis');
    expect(of(wo, 'racket_ladder_climber')).toEqual([]);
  });

  it('corregir un resultado retira el nivel provisional que ya no llega (el firme se queda)', () => {
    const ms = Array.from({ length: 9 }, (_, i) => mk(`m${i}`, day(5, i + 1), ['p1', 'p2'], ['p3', 'p4'], '6-4 6-4'));
    const had = [
      row({ badge_key: 'racket_matches', sport: 'padel', level: 1, period_key: '-', user_id: 'u1', status: 'provisional' }),
      row({ badge_key: 'racket_matches', sport: 'padel', level: 1, period_key: '-', user_id: 'u2', status: 'firme' }),
    ];
    const ds = run(join(...ms), { awards: had }, job('revisar', { ref: 'match:m8' }));
    expect(revokes(ds)).toEqual(['racket_matches:1:-@u1']);
  });

  it('vínculo: recalcula la cuenta; de un jugador que se reclamó a sí mismo solo cuenta lo que confirmó el otro lado', () => {
    const official = Array.from({ length: 10 }, (_, i) => mk(`v${i}`, day(7, i + 1), ['p1', 'p2'], ['p3', 'p4'], '6-4 6-4', { proposed_by: 'u-admin', proposed_side: null, confirmed_by: null }));
    const j = job('vinculo', { user_id: 'u1', ref: 'player:p1', payload: { players: ['p1'] } });
    const all = run(join(...official), {}, j);
    expect(of(all, 'racket_matches').filter((d) => d.user_id === 'u1').map((d) => d.level)).toEqual([1]);
    const verified = run(join(...official), { players: PLAYERS.map((p) => (p.id === 'p1' ? { ...p, verified_only: true } : p)) }, j);
    expect(of(verified, 'racket_matches').filter((d) => d.user_id === 'u1')).toEqual([]);
    // Y en cualquier trabajo (un resultado nuevo), no solo en el vínculo: la marca viene en la foto.
    const later = run(join(...official), { players: PLAYERS.map((p) => (p.id === 'p1' ? { ...p, verified_only: true } : p)) }, job('resultado', { ref: 'match:v9' }));
    expect(of(later, 'racket_matches').filter((d) => d.user_id === 'u1')).toEqual([]);
  });

  it('una liga que no es real no suma', () => {
    const ms = Array.from({ length: 10 }, (_, i) => mk(`m${i}`, day(5, i + 1), ['p1', 'p2'], ['p3', 'p4'], '6-4 6-4'));
    const w = world('padel', { players: PLAYERS, ...join(...ms), real: [] });
    const j = job('resultado', { ref: 'match:m9' });
    expect(of(evaluate(j, snap(j, w), NOW), 'racket_matches')).toEqual([]);
  });
});

describe('racket_match', () => {
  it('Set en blanco: un set 6-0 en un partido R2 (también perdiendo el partido)', () => {
    const ds = run(mk('b1', day(6, 1), ['p1', 'p2'], ['p3', 'p4'], '6-0 3-6 7-10'));
    expect(gives(ds).filter((g) => g.startsWith('racket_bagel'))).toEqual(['racket_bagel:0:m:b1@p1', 'racket_bagel:0:m:b1@p2']);
    expect(of(ds, 'racket_bagel')[0]).toMatchObject({ league_id: 'L', status: 'provisional', refs: ['match:b1'], context: { league: { id: 'L' } } });
  });

  it('Juego en blanco (pickleball): 11-0', () => {
    const ds = run(mk('b2', day(6, 2), ['p1', 'p2'], ['p3', 'p4'], '11-0', { rules: { match: { gameTo: 11, bestOf: 1 } } }), {}, undefined, 'pickleball');
    expect(of(ds, 'racket_bagel').map((d) => d.player_id)).toEqual(['p1', 'p2']);
  });

  it('Zapatero (ping pong): un juego 11-0; con 11-1 no', () => {
    const ds = run(mk('z1', day(6, 2), ['p1'], ['p3'], '11-0 9-11 11-5 11-8'), {}, undefined, 'table_tennis');
    expect(of(ds, 'racket_bagel')).toEqual([expect.objectContaining({ player_id: 'p1', sport: 'table_tennis' })]);
    // También perdiendo el partido.
    const lost = run(mk('z2', day(6, 2), ['p1'], ['p3'], '11-0 9-11 5-11 8-11'), {}, undefined, 'table_tennis');
    expect(of(lost, 'racket_bagel').map((d) => d.player_id)).toEqual(['p1']);
    expect(of(run(mk('z3', day(6, 2), ['p1'], ['p3'], '11-1 11-5 11-8'), {}, undefined, 'table_tennis'), 'racket_bagel')).toEqual([]);
  });

  it('Remontada (ping pong): desde 0-2 en juegos al mejor de 5 y de 7; con 0-1 o al mejor de 3 no', () => {
    const tt = (id: string, text: string, rules?: Record<string, unknown>) =>
      of(run(mk(id, day(6, 4), ['p1'], ['p3'], text, rules ? { rules } : {}), {}, undefined, 'table_tennis'), 'racket_comeback').map((d) => d.player_id);
    expect(tt('c5', '5-11 9-11 11-7 11-8 11-9')).toEqual(['p1']);
    expect(tt('c7', '5-11 9-11 11-7 11-8 9-11 11-9 11-3', { match: { bestOf: 7 } })).toEqual(['p1']);
    expect(tt('c1', '5-11 11-9 11-7 11-8')).toEqual([]);
    expect(tt('c3', '5-11 11-9 11-7', { match: { bestOf: 3 } })).toEqual([]);
  });

  it('Remontada: perdió el primer set y ganó el partido, sin retiro', () => {
    expect(of(run(mk('r1', day(6, 3), ['p1', 'p2'], ['p3', 'p4'], '4-6 6-3 10-7')), 'racket_comeback').map((d) => d.player_id)).toEqual(['p1', 'p2']);
    expect(of(run(mk('r2', day(6, 3), ['p1', 'p2'], ['p3', 'p4'], '6-4 6-3')), 'racket_comeback')).toEqual([]);
    // Con retiro no vale.
    expect(of(run(mk('r3', day(6, 3), ['p1', 'p2'], ['p3', 'p4'], '4-6 6-3 2-1 ret.', { score: { text: '4-6 6-3 2-1 ret.', sides: [1, 1] }, winner_side: 1 })), 'racket_comeback')).toEqual([]);
  });

  it('Batacazo: le ganó a alguien con 10+ partidos y 25+ puntos más de % de victorias (tenis, individual)', () => {
    const t = (id: string, d: string, a: string, b: string, text: string) => mk(id, d, [a], [b], text);
    // p5 ganó 9 de 10 contra p7; p1 ganó 2 de 5 contra p7.
    const hist = [
      ...Array.from({ length: 10 }, (_, i) => t(`h5-${i}`, day(1, i + 1), 'p5', 'p7', i === 0 ? '3-6 3-6' : '6-3 6-3')),
      ...Array.from({ length: 5 }, (_, i) => t(`h1-${i}`, day(2, i + 1), 'p1', 'p7', i < 2 ? '6-3 6-3' : '3-6 3-6')),
    ];
    const upset = t('up', day(3, 1), 'p1', 'p5', '6-4 6-4');
    const ds = run(join(...hist, upset), {}, job('resultado', { ref: 'match:up' }), 'tennis');
    expect(of(ds, 'racket_upset').map((d) => d.player_id)).toEqual(['p1']);
    expect(of(ds, 'racket_upset')[0].context.values).toEqual({ gap: 50 });
    // Sin historial suficiente, nada.
    const none = run(join(upset), {}, job('resultado', { ref: 'match:up' }), 'tennis');
    expect(of(none, 'racket_upset')).toEqual([]);
  });

  it('anular el partido retira las marcas provisionales; borrar el partido también (con los jugadores del payload)', () => {
    const had = [row({ badge_key: 'racket_bagel', sport: 'padel', level: 0, period_key: 'm:b1', player_id: 'p1', league_id: 'L' })];
    const voided = run(mk('b1', day(6, 1), ['p1', 'p2'], ['p3', 'p4'], '6-0 6-3', { status: 'void' }), { awards: had }, job('revisar', { ref: 'match:b1' }));
    expect(revokes(voided)).toContain('racket_bagel:0:m:b1@p1');
    const deleted = run(join(), { awards: had }, job('revisar', { ref: 'match:b1', payload: { players: ['p1', 'p2', 'p3', 'p4'] } }));
    expect(revokes(deleted)).toEqual(['racket_bagel:0:m:b1@p1']);
  });

  it('con badges_auto = ninguna no da marcas de liga', () => {
    const b = mk('b1', day(6, 1), ['p1', 'p2'], ['p3', 'p4'], '6-0 6-3');
    const ds = run(b, { leagues: [snapLeague('L', { sport: 'padel', badges_auto: 'ninguna' })] });
    expect(of(ds, 'racket_bagel')).toEqual([]);
  });
});

describe('racket_night: figura de la noche', () => {
  const NIGHT = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8'];
  const nightPlayers = NIGHT.map((p, i) => player(p, 'L', i < 6 ? `u-${p}` : null));
  const event: SnapEvent = snapEvent('NIGHT', { type: 'americano', date: '2026-11-10', config: { format: 'americano', players: NIGHT, rest: 'none' } });

  function nightMatch(id: string, round: number, s1: string[], s2: string[], pts: [number, number], by: string) {
    const { sides, players } = matchSides(id, [null, s1], [null, s2]);
    const match = snapMatch(id, {
      event_id: 'NIGHT',
      round,
      format: 'americano',
      require_confirm: false,
      scheduled_at: '2026-11-11T00:00:00.000Z',
      score: { text: `${pts[0]}-${pts[1]}`, sides: pts },
      winner_side: pts[0] > pts[1] ? 1 : 2,
      proposed_by: by,
      proposed_at: '2026-11-11T02:00:00.000Z',
      confirmed_at: '2026-11-11T02:00:00.000Z',
    });
    return { matches: [match], match_sides: sides, match_players: players };
  }

  const matches = join(
    nightMatch('nm1', 1, ['n1', 'n2'], ['n3', 'n4'], [18, 6], 'u-n1'),
    nightMatch('nm2', 1, ['n5', 'n6'], ['n7', 'n8'], [12, 12], 'u-n5'),
    nightMatch('nm3', 2, ['n1', 'n3'], ['n5', 'n7'], [15, 9], 'u-n1'),
    nightMatch('nm4', 2, ['n2', 'n4'], ['n6', 'n8'], [10, 14], 'u-n5'),
  );

  function runNight(over: Partial<BadgeSnapshot> = {}, now: number | string = NOW) {
    const j = job('noche', { ref: 'event:NIGHT' });
    const w = world('padel', { players: nightPlayers, events: [event], ...matches, ...over });
    return evaluate(j, snap(j, w), now);
  }

  it('el que más sumó en una noche cerrada de 8+ jugadores, 6+ cuentas y resultados de 2+ cuentas', () => {
    const ds = runNight();
    expect(gives(ds)).toEqual(['racket_night_champion:0:e:NIGHT@n1']);
    expect(of(ds, 'racket_night_champion')[0]).toMatchObject({ status: 'firme', context: { event: { id: 'NIGHT' }, values: { n: 33, formato: 'americano' } } });
  });

  it('no se da si la noche no cerró (24 h desde el último resultado) o si los resultados los escribió una sola cuenta', () => {
    expect(runNight({}, Date.parse('2026-11-11T12:00:00.000Z'))).toEqual([]);
    const one = matches.matches.map((m) => ({ ...m, proposed_by: 'u-n1' }));
    expect(of(runNight({ matches: one }), 'racket_night_champion')).toEqual([]);
  });

  it('en tenis no existe', () => {
    const ds = runNight({ leagues: [snapLeague('L', { sport: 'tennis' })] });
    expect(of(ds, 'racket_night_champion')).toEqual([]);
  });
});

describe('event_podium de raqueta: torneo por categorías', () => {
  const PAIRS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10'];
  const roster: Record<string, [string, string]> = { A1: ['p1', 'p2'], A2: ['p3', 'p4'], A3: ['p5', 'p6'], A4: ['p7', 'p8'] };
  const bk = (id: string, key: string, a: string, b: string, text: string, over: Partial<SnapMatch> = {}) =>
    mk(id, '2026-10-17', roster[a], roster[b], text, { event_id: 'TOR', bracket_key: `A-${key}`, ...over }, [a, b]);
  const bracket = join(
    bk('sf1', 'R1-1', 'A1', 'A4', '6-2 6-2'),
    bk('sf2', 'R1-2', 'A2', 'A3', '6-4 6-4'),
    bk('fin', 'R2-1', 'A1', 'A2', '6-3 7-5'),
    bk('p3', 'P3', 'A3', 'A4', '6-1 6-1'),
  );
  const event = (pairs: string[]): SnapEvent =>
    snapEvent('TOR', { type: 'torneo', date: '2026-10-17', config: { format: 'torneo', categories: [{ id: 'A', name: 'Categoría A', pairs, groups: 0, perGroup: 2, thirdPlace: true, seeds: ['A1', 'A2', 'A3', 'A4'] }] } });
  const runTorneo = (pairs: string[], b: Built = bracket, over: Partial<BadgeSnapshot> = {}) => {
    const j = job('evento', { ref: 'event:TOR' });
    return evaluate(j, snap(j, world('padel', { players: PLAYERS, events: [event(pairs)], ...b, ...over })), NOW);
  };

  it('10 parejas: oro al campeón, plata al finalista y bronce al ganador del 3.er lugar', () => {
    const ds = runTorneo(PAIRS);
    expect(gives(ds)).toEqual([
      'event_podium:1:e:TOR:A@p5',
      'event_podium:1:e:TOR:A@p6',
      'event_podium:2:e:TOR:A@p3',
      'event_podium:2:e:TOR:A@p4',
      'event_podium:3:e:TOR:A@p1',
      'event_podium:3:e:TOR:A@p2',
    ]);
    expect(of(ds, 'event_podium')[0]).toMatchObject({ status: 'firme', context: { event: { id: 'TOR' }, values: { categoria: 'A', inscritos: 10 } } });
  });

  it('4 parejas: solo oro', () => {
    expect(gives(runTorneo(PAIRS.slice(0, 4)))).toEqual(['event_podium:3:e:TOR:A@p1', 'event_podium:3:e:TOR:A@p2']);
  });

  it('una final que confirmó el propio lado no da oro (al finalista sí: el resultado lo escribió el otro lado); un W.O. en la final vale con la semifinal R2, sin plata', () => {
    const own = bracket.matches.map((m) => (m.id === 'fin' ? { ...m, confirmed_by: 'u2' } : m));
    expect(gives(runTorneo(PAIRS, { ...bracket, matches: own })).filter((g) => !g.startsWith('event_podium:1'))).toEqual(['event_podium:2:e:TOR:A@p3', 'event_podium:2:e:TOR:A@p4']);
    const wo = bracket.matches.map((m) => (m.id === 'fin' ? { ...m, status: 'walkover' as const, walkover_side: 2, winner_side: 1, score: { text: 'W.O.' } } : m));
    expect(gives(runTorneo(PAIRS, { ...bracket, matches: wo })).filter((g) => !g.startsWith('event_podium:1'))).toEqual(['event_podium:3:e:TOR:A@p1', 'event_podium:3:e:TOR:A@p2']);
  });

  it('en una liga kind=torneo no hay event_podium (va el título de temporada)', () => {
    expect(runTorneo(PAIRS, bracket, { leagues: [snapLeague('L', { sport: 'padel', kind: 'torneo' })] })).toEqual([]);
  });
});

describe('debut de raqueta', () => {
  it('primera actividad válida del deporte en una liga real, a la cuenta', () => {
    const ds = run(mk('d1', day(9, 2), ['p1', 'p2'], ['p3', 'p9'], '6-4 6-4'));
    expect(gives(ds).filter((g) => g.startsWith('debut'))).toEqual(['debut:0:-@p9', 'debut:0:-@u1', 'debut:0:-@u2', 'debut:0:-@u3']);
    expect(of(ds, 'debut').find((d) => d.user_id === 'u1')).toMatchObject({ sport: 'padel', refs: ['match:d1'], context: { values: { fecha: '2026-09-02' } } });
  });

  it('un W.O. a favor también es actividad; el lado que no vino no debuta', () => {
    const ds = run(mk('w1', day(9, 3), ['p1', 'p2'], ['p3', 'p4'], 'W.O.', { status: 'walkover', walkover_side: 2, winner_side: 1, score: { text: 'W.O.' } }));
    expect(of(ds, 'debut').map((d) => d.user_id).sort()).toEqual(['u1', 'u2']);
  });
});
