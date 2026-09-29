import { describe, expect, it } from 'vitest';
import { ALL_PINS, scoreGame } from '../../lib/bowling';
import { NO_PHOTO } from '../../lib/types';
import { evaluate } from '../engine';
import { bowlingBaseline } from '../rules/baselines';
import { bowlingGames } from '../rules/bowling';
import type { SnapEntry, SnapEvent } from '../snapshot';
import { photoId, snapEntry, snapEvent, snapLeague, snapSubmission } from '../testkit';
import type { AwardDecision, ProgressDecision, ReviewDecision } from '../types';
import { baselineAt } from './bowling';
import { apply, gives, job, NOW, of, player, revokes, row, snap, world } from './fixtures';

// ---------------------------------------------------------------------------------------------------------
// Datos: la liga 'L' de boliche (real todo el año), p1 con la cuenta u1.

const P1 = player('p1', 'L', 'u1');
let photo = 100;
const photos = (n: number) => Array.from({ length: n }, () => photoId(++photo));

/** Un torneo por día desde el 1 de octubre ('e1' = 2026-10-01…). */
const ev = (n: number, over: Partial<SnapEvent> = {}): SnapEvent => snapEvent(`e${n}`, { date: `2026-10-${String(n).padStart(2, '0')}`, ...over });
/** Participación de un jugador con fotos en todos sus juegos (B2). */
const en = (id: string, event: string, playerId: string, scores: (number | null)[], marks?: (string | null)[], over: Partial<SnapEntry> = {}) =>
  snapEntry(id, event, playerId, scores, marks ?? photos(scores.length), over);

/** `n` torneos con 3 juegos de p1 con el mismo puntaje. */
function nights(n: number, score: number, playerId = 'p1', from = 1) {
  const events = Array.from({ length: n }, (_, i) => ev(from + i));
  const entries = events.map((e, i) => en(`x${from + i}`, e.id, playerId, [score, score, score]));
  return { events, entries };
}

const resultado = (ref: string) => job('resultado', { ref });

/** Máscara de pinos (bit 0 = pin 1). */
const pins = (...n: number[]) => n.reduce((m, p) => m | (1 << (p - 1)), 0);
const knockedAllBut = (...standing: number[]) => ALL_PINS & ~pins(...standing);

/** Un juego con split en el primer cuadro (quedan `leave`), convertido, y el resto abiertos de 9. */
function splitGame(...leave: number[]) {
  const rolls = [10 - leave.length, leave.length, ...Array.from({ length: 9 }, () => [9, 0]).flat()];
  const masks: (number | null)[] = rolls.map(() => null);
  masks[0] = knockedAllBut(...leave);
  masks[1] = pins(...leave);
  return { rolls, masks, score: scoreGame(rolls).score };
}

const ALL_SPARES = [...Array.from({ length: 10 }, () => [9, 1]).flat(), 9];

// ---------------------------------------------------------------------------------------------------------

describe('línea base de boliche por fecha', () => {
  it('es la misma que bowlingBaseline, sin volver a ordenar', () => {
    const { events, entries } = nights(8, 150);
    entries[5].scores = [120, 200, 181];
    const games = bowlingGames({ events, entries });
    const at = baselineAt(games);
    for (const d of ['2026-10-01', '2026-10-05', '2026-10-06', '2026-10-09']) expect(at(d)).toEqual(bowlingBaseline(games, d));
  });
});

describe('bowling_career: hitos y marcas de la cuenta', () => {
  it('Líneas jugadas: el juego 30 da el bronce (provisional) y el progreso apunta a 100', () => {
    const { events, entries } = nights(10, 150);
    const ds = evaluate(resultado('entry:x10'), snap(resultado('entry:x10'), world('bowling', { players: [P1], events, entries })), NOW);
    const [award] = of(ds, 'bowling_games', 'award');
    expect(award).toMatchObject({ user_id: 'u1', player_id: null, league_id: null, level: 1, period_key: '-', status: 'provisional', refs: ['entry:x10:2'] });
    expect(award.context).toMatchObject({ values: { n: 30 }, league: { id: 'L', name: 'Liga L' }, event: { id: 'e10' } });
    expect(of(ds, 'bowling_games', 'progress')[0]).toMatchObject({ value: 30, target: 100, next_level: 2 });
  });

  it('todavía no: 29 juegos, y más de 10 en un día no suman', () => {
    const { events, entries } = nights(10, 150);
    entries[9].scores = [150, 150, null];
    let ds = evaluate(resultado('entry:x10'), snap(resultado('entry:x10'), world('bowling', { players: [P1], events, entries })), NOW);
    expect(of(ds, 'bowling_games', 'award')).toEqual([]);
    expect(of(ds, 'bowling_games', 'progress')[0]).toMatchObject({ value: 29, target: 30, next_level: 1 });
    // 12 juegos en un solo día: cuentan 10.
    const big = { events: [ev(1, { games: 12 })], entries: [en('x1', 'e1', 'p1', Array(12).fill(150))] };
    ds = evaluate(resultado('entry:x1'), snap(resultado('entry:x1'), world('bowling', { players: [P1], ...big })), NOW);
    expect(of(ds, 'bowling_games', 'progress')[0]).toMatchObject({ value: 10 });
  });

  it('en el historial, lo de hace 7+ días entra firme', () => {
    const { events, entries } = nights(10, 150);
    const j = job('historial');
    const ds = evaluate(j, snap(j, world('bowling', { players: [P1], events, entries })), NOW);
    expect(of(ds, 'bowling_games', 'award')[0].status).toBe('firme');
  });

  it('Rompe barreras: un 180 da los tres niveles juntos, privados', () => {
    const w = world('bowling', { players: [P1], events: [ev(1)], entries: [en('x1', 'e1', 'p1', [120, 180, 140])] });
    const ds = evaluate(resultado('entry:x1'), snap(resultado('entry:x1'), w), NOW);
    const got = of(ds, 'bowling_breakthrough', 'award');
    expect(got.map((d) => d.level)).toEqual([1, 2, 3]);
    expect(got.every((d) => d.hidden && d.refs[0] === 'entry:x1:1')).toBe(true);
    expect(got.map((d) => d.context.values?.n)).toEqual([125, 150, 175]);
  });

  it('Club de los 200: 200 y 225 con B1; 250 pide foto', () => {
    const entries = [en('x1', 'e1', 'p1', [212, 230, 255], [NO_PHOTO, NO_PHOTO, NO_PHOTO])];
    let ds = evaluate(resultado('entry:x1'), snap(resultado('entry:x1'), world('bowling', { players: [P1], events: [ev(1)], entries })), NOW);
    expect(of(ds, 'bowling_club', 'award').map((d) => [d.level, d.refs[0]])).toEqual([
      [1, 'entry:x1:0'],
      [2, 'entry:x1:1'],
    ]);
    // El 255 sin foto no llega al oro: el progreso cuenta solo los juegos con foto.
    expect(of(ds, 'bowling_club', 'progress')[0]).toMatchObject({ next_level: 3, target: 250, value: 0 });
    entries[0].photos = [NO_PHOTO, NO_PHOTO, photoId(1)];
    ds = evaluate(resultado('entry:x1'), snap(resultado('entry:x1'), world('bowling', { players: [P1], events: [ev(1)], entries })), NOW);
    expect(of(ds, 'bowling_club', 'award').map((d) => d.level)).toEqual([1, 2, 3]);
  });

  it('Serie de tres: tres juegos seguidos de la misma participación; el oro con los tres con foto', () => {
    const entries = [en('x1', 'e1', 'p1', [170, 170, 165]), en('x2', 'e2', 'p1', [220, 215, 220], [photoId(1), NO_PHOTO, photoId(2)])];
    const ds = evaluate(resultado('entry:x2'), snap(resultado('entry:x2'), world('bowling', { players: [P1], events: [ev(1), ev(2)], entries })), NOW);
    const got = of(ds, 'bowling_series', 'award');
    expect(got.map((d) => [d.level, d.context.values?.n])).toEqual([
      [1, 505],
      [2, 655],
    ]);
    expect(got[1].refs.sort()).toEqual(['entry:x2:0', 'entry:x2:1', 'entry:x2:2']);
    // 655 no es oro porque un juego no tiene foto.
    expect(of(ds, 'bowling_series', 'progress')[0]).toMatchObject({ next_level: 3, target: 650, value: 505 });
  });

  it('Por encima de ti: contra los juegos anteriores (12+) y guardando solo la ganancia', () => {
    const { events, entries } = nights(4, 150);
    events.push(ev(5));
    entries.push(en('x5', 'e5', 'p1', [176, 150, 150]));
    const ds = evaluate(resultado('entry:x5'), snap(resultado('entry:x5'), world('bowling', { players: [P1], events, entries })), NOW);
    const [award] = of(ds, 'bowling_over_average', 'award');
    expect(award).toMatchObject({ level: 1, refs: ['entry:x5:0'] });
    expect(award.context.values).toEqual({ n: 26 });
    // Con 11 juegos antes no hay línea base.
    entries[0].scores = [150, 150, null];
    const again = evaluate(resultado('entry:x5'), snap(resultado('entry:x5'), world('bowling', { players: [P1], events, entries })), NOW);
    expect(of(again, 'bowling_over_average', 'award')).toEqual([]);
  });

  it('Racha de strikes: solo juegos anotados bola por bola; el oro pide foto', () => {
    const rolls = [10, 10, 10, 10, 10, 10, 10, 10, 10, 9, 0];
    const score = scoreGame(rolls).score;
    const entries = [en('x1', 'e1', 'p1', [score, 150], [NO_PHOTO, NO_PHOTO], { frames: { '0': { rolls } } })];
    const ds = evaluate(resultado('entry:x1'), snap(resultado('entry:x1'), world('bowling', { players: [P1], events: [ev(1)], entries })), NOW);
    expect(of(ds, 'bowling_strike_streak', 'award').map((d) => [d.level, d.context.values?.n])).toEqual([
      [1, 9],
      [2, 9],
    ]);
    // Sin cuadros (o si no cuadran con el puntaje) no hay racha.
    entries[0].scores = [score - 1, 150];
    const bad = evaluate(resultado('entry:x1'), snap(resultado('entry:x1'), world('bowling', { players: [P1], events: [ev(1)], entries })), NOW);
    expect(of(bad, 'bowling_strike_streak', 'award')).toEqual([]);
  });

  it('suma todas las ligas de la cuenta y las de un jugador sin cuenta quedan en su jugador', () => {
    const L2 = snapLeague('L2', { sport: 'bowling', name: 'Liga Dos' });
    const players = [P1, player('q1', 'L2', 'u1'), player('s1', 'L', null)];
    const events = [...nights(5, 150).events, ev(20, { league_id: 'L2' }), ev(21, { league_id: 'L2' }), ev(22, { league_id: 'L2' })];
    const entries = [
      ...nights(5, 150).entries,
      ...[20, 21, 22].map((n) => en(`y${n}`, `e${n}`, 'q1', [150, 150, 150], undefined, { league_id: 'L2' })),
      ...[1, 2, 3].map((n) => en(`s${n}`, `e${n}`, 's1', [201, 150, 150])),
    ];
    const j = job('vinculo', { user_id: 'u1', league_id: null, payload: { players: ['s1'] } });
    const ds = evaluate(j, snap(j, world('bowling', { leagues: [snapLeague('L', { sport: 'bowling' }), L2], players, events, entries })), NOW);
    expect(of(ds, 'bowling_games', 'progress').find((d) => d.user_id === 'u1')).toMatchObject({ value: 24 });
    // El jugador sin cuenta: copia de respaldo en su jugador y su liga.
    expect(of(ds, 'bowling_club', 'award')).toEqual([expect.objectContaining({ player_id: 's1', user_id: null, league_id: 'L', level: 1 })]);
  });

  it('juez y parte: los juegos sin foto del admin solo cuentan si otra cuenta los aprobó', () => {
    const admin = player('pa', 'L', 'u-admin');
    const entries = [en('x1', 'e1', 'pa', [205, 150], [NO_PHOTO, NO_PHOTO])];
    let ds = evaluate(resultado('entry:x1'), snap(resultado('entry:x1'), world('bowling', { players: [admin], events: [ev(1)], entries })), NOW);
    expect(of(ds, 'bowling_club', 'award')).toEqual([]);
    const submissions = [snapSubmission('s1', 'pa', [205, 150], { event_id: 'e1', created_by: 'u-admin', reviewed_by: 'u-owner' })];
    ds = evaluate(resultado('entry:x1'), snap(resultado('entry:x1'), world('bowling', { players: [admin], events: [ev(1)], entries, submissions })), NOW);
    expect(of(ds, 'bowling_club', 'award')).toHaveLength(1);
  });

  it('un jugador que se aprobó su propio reclamo solo suma lo verificado', () => {
    const entries = [en('x1', 'e1', 'p1', [205, 150], [NO_PHOTO, photoId(1)])];
    const w = world('bowling', { players: [{ ...P1, verified_only: true }], events: [ev(1)], entries });
    const ds = evaluate(resultado('entry:x1'), snap(resultado('entry:x1'), w), NOW);
    expect(of(ds, 'bowling_club', 'award')).toEqual([]);
    expect(of(ds, 'bowling_games', 'progress')[0]).toMatchObject({ value: 1 });
  });

  it('evalúa a los jugadores del trabajo: `snapshot.targets` manda sobre lo que dice el ref', () => {
    const { events, entries } = nights(10, 150);
    const others = nights(10, 150, 'p2', 1).entries.map((e) => ({ ...e, id: `o${e.id}` }));
    const w = world('bowling', { players: [P1, player('p2', 'L', 'u2')], events, entries: [...entries, ...others] });
    // 'entry:<id>:<g>' también vale.
    let ds = evaluate(resultado('entry:ox3:1'), snap(resultado('entry:ox3:1'), w), NOW);
    expect(gives(ds).filter((g) => g.startsWith('bowling_games'))).toEqual(['bowling_games:1:-@u2']);
    ds = evaluate(resultado('entry:ox3'), { ...snap(resultado('entry:ox3'), w), targets: ['p1'] }, NOW);
    expect(gives(ds).filter((g) => g.startsWith('bowling_games'))).toEqual(['bowling_games:1:-@u1']);
  });

  it('solo en ligas reales: sin 4 cuentas establecidas no se gana nada', () => {
    const { events, entries } = nights(10, 210);
    const ds = evaluate(resultado('entry:x10'), snap(resultado('entry:x10'), world('bowling', { players: [P1], events, entries, real: [] })), NOW);
    expect(gives(ds)).toEqual([]);
  });

  it('una corrección retira la provisional que ya no cumple y deja la firme', () => {
    const entries = [en('x1', 'e1', 'p1', [180, 150, 150])];
    const j = job('revisar', { ref: 'entry:x1' });
    const s = snap(
      j,
      world('bowling', {
        players: [P1],
        events: [ev(1)],
        entries,
        awards: [
          row({ badge_key: 'bowling_club', sport: 'bowling', level: 1, period_key: '-', user_id: 'u1', refs: ['entry:x1:0'] }),
          row({ badge_key: 'bowling_breakthrough', sport: 'bowling', level: 3, period_key: '-', user_id: 'u1', status: 'firme', refs: ['entry:x1:0'] }),
        ],
      }),
    );
    // Era 205 y se corrigió a 180: el Club 200 se va; el 175 firme se queda (y se da el 125 y el 150).
    const ds = evaluate(j, s, NOW);
    expect(revokes(ds)).toEqual(['bowling_club:1:-@u1']);
    expect(gives(ds).filter((g) => g.startsWith('bowling_breakthrough'))).toEqual(['bowling_breakthrough:1:-@u1', 'bowling_breakthrough:2:-@u1']);
  });
});

describe('climbing (boliche)', () => {
  it('media de los últimos 18 menos la de los primeros 18, con 36+; el nivel alcanzado se queda', () => {
    const a = nights(6, 150);
    const b = nights(6, 162, 'p1', 7);
    const events = [...a.events, ...b.events];
    const entries = [...a.entries, ...b.entries];
    let ds = evaluate(resultado('entry:x12'), snap(resultado('entry:x12'), world('bowling', { players: [P1], events, entries })), NOW);
    expect(of(ds, 'climbing', 'award').map((d) => [d.level, d.context.values?.n, d.refs[0]])).toEqual([
      [1, 12, 'entry:x12:2'],
      [2, 12, 'entry:x12:2'],
    ]);
    // Si después baja, lo ganado se queda (se mide juego a juego).
    const c = nights(6, 140, 'p1', 13);
    ds = evaluate(resultado('entry:x18'), snap(resultado('entry:x18'), world('bowling', { players: [P1], events: [...events, ...c.events], entries: [...entries, ...c.entries] })), NOW);
    expect(of(ds, 'climbing', 'award').map((d) => d.level)).toEqual([1, 2]);
    // Con 35 juegos, todavía no.
    entries[11].scores = [162, 162, null];
    ds = evaluate(resultado('entry:x12'), snap(resultado('entry:x12'), world('bowling', { players: [P1], events, entries })), NOW);
    expect(of(ds, 'climbing', 'award')).toEqual([]);
  });
});

describe('debut (boliche)', () => {
  it('el primer juego B1 en una liga real; provisional y a la cuenta', () => {
    const { events, entries } = nights(2, 150);
    const ds = evaluate(resultado('entry:x2'), snap(resultado('entry:x2'), world('bowling', { players: [P1], events, entries })), NOW);
    expect(of(ds, 'debut', 'award')).toEqual([expect.objectContaining({ user_id: 'u1', sport: 'bowling', level: 0, period_key: '-', status: 'provisional', refs: ['entry:x1:0'] })]);
  });
});

describe('bowling_game: marcas de un juego (liga)', () => {
  const players = [P1, player('p2', 'L', 'u-admin')];

  it('Juego perfecto: 300 con foto va a aval; revisan owners y admins que no jugaron el evento', () => {
    const entries = [en('x1', 'e1', 'p1', [300, 150]), en('x2', 'e1', 'p2', [150, 150])];
    const ds = evaluate(resultado('entry:x1'), snap(resultado('entry:x1'), world('bowling', { players, events: [ev(1)], entries })), NOW);
    const [r] = of(ds, 'bowling_perfect_game', 'review') as ReviewDecision[];
    expect(r).toMatchObject({ player_id: 'p1', league_id: 'L', user_id: null, level: 0, period_key: 'g:x1:0', refs: ['entry:x1:0'], reviewers: ['u-owner'] });
    expect(of(ds, 'bowling_perfect_game', 'award')).toEqual([]);
  });

  it('Juego perfecto: sin foto, o con cuadros que no son 12 strikes, no', () => {
    const noPhoto = [en('x1', 'e1', 'p1', [300], [NO_PHOTO])];
    expect(of(evaluate(resultado('entry:x1'), snap(resultado('entry:x1'), world('bowling', { players, events: [ev(1)], entries: noPhoto })), NOW), 'bowling_perfect_game')).toEqual([]);
    const badFrames = [en('x1', 'e1', 'p1', [300], undefined, { frames: { '0': { rolls: ALL_SPARES } } })];
    expect(of(evaluate(resultado('entry:x1'), snap(resultado('entry:x1'), world('bowling', { players, events: [ev(1)], entries: badFrames })), NOW), 'bowling_perfect_game')).toEqual([]);
    const twelve = [en('x1', 'e1', 'p1', [300], undefined, { frames: { '0': { rolls: Array(12).fill(10) } } })];
    expect(of(evaluate(resultado('entry:x1'), snap(resultado('entry:x1'), world('bowling', { players, events: [ev(1)], entries: twelve })), NOW), 'bowling_perfect_game', 'review')).toHaveLength(1);
  });

  it('Cero abiertos, Split convertido y el 7-10 (con aval y foto)', () => {
    const split = splitGame(4, 6);
    const seven = splitGame(7, 10);
    const entries = [
      en('x1', 'e1', 'p1', [scoreGame(ALL_SPARES).score, split.score, seven.score, seven.score], [photoId(1), NO_PHOTO, photoId(2), NO_PHOTO], {
        frames: { '0': { rolls: ALL_SPARES }, '1': split, '2': seven, '3': seven },
      }),
    ];
    const ds = evaluate(resultado('entry:x1'), snap(resultado('entry:x1'), world('bowling', { players, events: [ev(1, { games: 4 })], entries })), NOW);
    expect(gives(ds).filter((g) => !g.includes('@u1'))).toEqual(['bowling_clean_game:0:g:x1:0@p1', 'bowling_seven_ten:0:g:x1:2@p1', 'bowling_split:0:g:x1:1@p1']);
    expect(of(ds, 'bowling_clean_game', 'award')[0].status).toBe('provisional');
    expect(of(ds, 'bowling_seven_ten', 'review')).toHaveLength(1);
  });

  it('si corrigen el juego se retira la provisional; si borran la participación también; la firme se queda', () => {
    const entries = [en('x1', 'e1', 'p1', [150], undefined, { frames: { '0': { rolls: [...Array(9).fill([9, 0]).flat(), 9, 1, 6] } } })];
    const awards = [
      row({ badge_key: 'bowling_clean_game', sport: 'bowling', level: 0, period_key: 'g:x1:0', player_id: 'p1', league_id: 'L' }),
      row({ badge_key: 'bowling_split', sport: 'bowling', level: 0, period_key: 'g:x9:1', player_id: 'p1', league_id: 'L' }),
      row({ badge_key: 'bowling_clean_game', sport: 'bowling', level: 0, period_key: 'g:x9:0', player_id: 'p1', league_id: 'L', status: 'firme' }),
    ];
    const j = job('revisar', { ref: 'entry:x1', payload: { refs: ['entry:x9'], players: ['p1'] } });
    const ds = evaluate(j, snap(j, world('bowling', { players, events: [ev(1)], entries, awards })), NOW);
    expect(revokes(ds)).toEqual(['bowling_clean_game:0:g:x1:0@p1', 'bowling_split:0:g:x9:1@p1']);
  });

  it('un aval rechazado no se vuelve a pedir', () => {
    const entries = [en('x1', 'e1', 'p1', [300])];
    const awards = [row({ badge_key: 'bowling_perfect_game', sport: 'bowling', level: 0, period_key: 'g:x1:0', player_id: 'p1', league_id: 'L', status: 'revocada', revoke_reason: 'aval', revoked_at: NOW })];
    const ds = evaluate(resultado('entry:x1'), snap(resultado('entry:x1'), world('bowling', { players, events: [ev(1)], entries, awards })), NOW);
    expect(of(ds, 'bowling_perfect_game')).toEqual([]);
  });
});

describe('torneo cerrado: podio, categoría y equipos', () => {
  /** Torneo del 10 de noviembre con `n` jugadores; el i-ésimo suma menos. */
  function tourney(n: number, over: { averages?: number[]; teams?: (string | null)[]; eventOver?: Partial<SnapEvent> } = {}) {
    const E = snapEvent('E', { date: '2026-11-10', ...over.eventOver });
    const players = Array.from({ length: n }, (_, i) => player(`t${i + 1}`, 'L', i < 6 ? `u-t${i + 1}` : null));
    const entries = players.map((p, i) => en(`z${i + 1}`, 'E', p.id, [200 - i * 5, 200 - i * 5, 200 - i * 5], undefined, { average: over.averages?.[i] ?? 150, team_id: over.teams?.[i] ?? null }));
    return { E, players, entries };
  }
  const evento = () => job('evento', { ref: 'event:E' });

  it('6 jugadores: oro y plata, firmes, al jugador en su liga', () => {
    const { E, players, entries } = tourney(6);
    const ds = evaluate(evento(), snap(evento(), world('bowling', { players, events: [E], entries })), NOW);
    const got = of(ds, 'event_podium', 'award') as AwardDecision[];
    expect(got.map((d) => [d.player_id, d.level, d.period_key, d.status])).toEqual([
      ['t1', 3, 'e:E', 'firme'],
      ['t2', 2, 'e:E', 'firme'],
    ]);
    expect(got[0].context).toMatchObject({ values: { n: 1, of: 6, value: 600 }, event: { id: 'E' } });
  });

  it('10 jugadores dan bronce; menos de 6 no hay podio; empates comparten', () => {
    let t = tourney(10);
    let ds = evaluate(evento(), snap(evento(), world('bowling', { players: t.players, events: [t.E], entries: t.entries })), NOW);
    expect(of(ds, 'event_podium').map((d) => d.player_id)).toEqual(['t1', 't2', 't3']);
    t = tourney(5);
    ds = evaluate(evento(), snap(evento(), world('bowling', { players: t.players, events: [t.E], entries: t.entries })), NOW);
    expect(of(ds, 'event_podium')).toEqual([]);
    t = tourney(6);
    t.entries[1].scores = [200, 200, 200];
    ds = evaluate(evento(), snap(evento(), world('bowling', { players: t.players, events: [t.E], entries: t.entries })), NOW);
    // Dos oros; el siguiente es tercero y con 6 no hay bronce.
    expect(of(ds, 'event_podium').map((d) => [d.player_id, d.level])).toEqual([
      ['t1', 3],
      ['t2', 3],
    ]);
  });

  it('liga que pide foto: quien tiene un juego sin foto no entra; en torneos sueltos no hay podio', () => {
    const t = tourney(7);
    t.entries[0].photos = [photoId(1), NO_PHOTO, photoId(2)];
    let ds = evaluate(evento(), snap(evento(), world('bowling', { leagues: [snapLeague('L', { require_photo: true })], players: t.players, events: [t.E], entries: t.entries })), NOW);
    expect(of(ds, 'event_podium').map((d) => d.player_id)).toEqual(['t2', 't3']);
    ds = evaluate(evento(), snap(evento(), world('bowling', { leagues: [snapLeague('L', { kind: 'torneo' })], players: t.players, events: [t.E], entries: t.entries })), NOW);
    expect(of(ds, 'event_podium')).toEqual([]);
  });

  it('con badges_auto «sin_titulos» no hay títulos; con «ninguna», nada de liga', () => {
    const t = tourney(6);
    for (const mode of ['sin_titulos', 'ninguna'] as const) {
      const ds = evaluate(evento(), snap(evento(), world('bowling', { leagues: [snapLeague('L', { badges_auto: mode })], players: t.players, events: [t.E], entries: t.entries })), NOW);
      expect(gives(ds)).toEqual([]);
    }
  });

  it('Mejor de tu categoría: 4+ en la categoría; el promedio bajo a propósito no cuela', () => {
    const t = tourney(6, { averages: [150, 150, 150, 150, 190, 150] });
    let ds = evaluate(evento(), snap(evento(), world('bowling', { players: t.players, events: [t.E], entries: t.entries })), NOW);
    // D: t1, t2, t3, t4, t6 (5 jugadores) gana t1; B: solo t5, no hay categoría.
    expect(of(ds, 'bowling_category_win').map((d) => [d.player_id, (d as AwardDecision).context.values?.categoria])).toEqual([['t1', 'D']]);
    // t1 entró con 150 pero su línea base es 195: pasa a la B (sola) y la D la gana t2.
    const history = nights(5, 195, 't1');
    ds = evaluate(evento(), snap(evento(), world('bowling', { players: t.players, events: [t.E, ...history.events], entries: [...t.entries, ...history.entries] })), NOW);
    expect(of(ds, 'bowling_category_win').map((d) => d.player_id)).toEqual(['t2']);
  });

  it('Título por equipos: 3+ equipos con 2+ jugadores; va a los que jugaron', () => {
    const t = tourney(6, { teams: ['A', 'A', 'B', 'B', 'C', 'C'] });
    const teams = ['A', 'B', 'C'].map((id, i) => ({ id, event_id: 'E', name: `Equipo ${id}`, sort_order: i, color: null, league_id: 'L' }));
    let ds = evaluate(evento(), snap(evento(), world('bowling', { players: t.players, events: [t.E], entries: t.entries, teams })), NOW);
    const got = of(ds, 'bowling_team_win') as AwardDecision[];
    expect(got.map((d) => d.player_id)).toEqual(['t1', 't2']);
    expect(got[0].context.team).toEqual({ id: 'A', name: 'Equipo A' });
    // Con dos equipos no hay título.
    ds = evaluate(evento(), snap(evento(), world('bowling', { players: t.players, events: [t.E], entries: t.entries, teams: teams.slice(0, 2) })), NOW);
    expect(of(ds, 'bowling_team_win')).toEqual([]);
  });

  it('el historial solo mira torneos que ya pasaron sus 3 días de gracia', () => {
    const t = tourney(6, { eventOver: { date: '2026-11-18' } });
    const j = job('historial');
    const ds = evaluate(j, snap(j, world('bowling', { players: t.players, events: [t.E], entries: t.entries })), NOW);
    expect(of(ds, 'event_podium')).toEqual([]);
  });
});

describe('idempotencia', () => {
  it('evaluar, aplicar y volver a evaluar no cambia nada', () => {
    const split = splitGame(5, 7);
    const { events, entries } = nights(12, 180);
    entries.push(en('x13', 'e13', 'p1', [300, split.score, 150], undefined, { frames: { '1': split } }));
    events.push(ev(13));
    const j = resultado('entry:x13');
    const first = snap(j, world('bowling', { players: [P1, player('p2', 'L', 'u2')], events, entries }));
    const ds = evaluate(j, first, NOW);
    expect(gives(ds).length).toBeGreaterThan(10);
    const after = apply(first, ds);
    expect(evaluate(j, after, NOW)).toEqual([]);
    // El progreso ya escrito tampoco se repite.
    expect((after.progress ?? []).length).toBeGreaterThan(0);
    expect(of(evaluate(j, after, NOW), 'bowling_games', 'progress') as ProgressDecision[]).toEqual([]);
  });

  it('lo retirado por evidencia vuelve si se cumple otra vez', () => {
    const entries = [en('x1', 'e1', 'p1', [205])];
    const awards = [row({ badge_key: 'bowling_club', sport: 'bowling', level: 1, period_key: '-', user_id: 'u1', status: 'revocada', revoke_reason: 'evidencia', revoked_at: NOW })];
    const ds = evaluate(resultado('entry:x1'), snap(resultado('entry:x1'), world('bowling', { players: [P1], events: [ev(1)], entries, awards })), NOW);
    expect(gives(ds)).toContain('bowling_club:1:-@u1');
  });
});
