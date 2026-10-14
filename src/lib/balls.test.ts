import { describe, expect, it } from 'vitest';
import { BALL_CATALOG, type CatalogBall } from './ballCatalog';
import { defaultBallDesign } from './ballDesign';
import {
  BALL_COLORS,
  BALL_MIN_GAMES,
  RESURFACE_EVERY,
  ballDetail,
  ballDetailsChanged,
  ballDraftProblem,
  ballForGame,
  ballFromDraft,
  ballLabel,
  ballProblemText,
  ballStats,
  ballsByGame,
  ballsChanged,
  ballsOfScored,
  bestBall,
  bestBallText,
  catalogLine,
  catalogLook,
  catalogSpecs,
  cleanLayout,
  colorLabel,
  commonBall,
  compactBalls,
  composeBalls,
  coverLabel,
  defaultBall,
  draftBallsAfter,
  draftFromCatalog,
  eventBallUpdate,
  eventGameBall,
  gameBallTitle,
  inchesText,
  joinInches,
  keepBalls,
  knownBalls,
  lastBall,
  layoutProblem,
  layoutProblemText,
  layoutText,
  ownPickShown,
  pctText,
  pickableBalls,
  resurfaceQuestion,
  resurfaceText,
  sameBall,
  seenPick,
  splitInches,
  submissionBalls,
  withBall,
  type Ball,
  type BallGame,
} from './balls';

/**
 * Mis bolas, las cuentas: la hoja de una bola, qué bola se pone sola al anotar, cómo quedan las bolas de una hoja de
 * juegos sueltos (sin huecos), y los números de cada bola (promedio, el más alto, strikes y spares de los cuadros que
 * cuadran, lo que falta por verificar y cuántos juegos lleva desde la pulida).
 */

const ball = (id: string, extra: Partial<Ball> = {}): Ball => ({
  id,
  name: id.toUpperCase(),
  brand: '',
  weight: 15,
  color: '#1d4ed8',
  cover: null,
  drilledOn: null,
  resurfacedOn: null,
  retired: false,
  createdAt: null,
  updatedAt: null,
  ...extra,
});

let n = 0;
const game = (b: string, score: number | null, extra: Partial<BallGame> = {}): BallGame => ({
  ball: b,
  kind: 'solo',
  ref: `s${n++}`,
  game: 0,
  date: '2026-09-20',
  score,
  frames: null,
  counted: true,
  ...extra,
});

const STRIKES = Array(12).fill(10);
/** 9 y spare en cada cuadro, y un 9 de más en el 10: 190. */
const SPARES = [...Array(10).fill([9, 1]).flat(), 9];
/** Todo 9 y fallo: 90 (10 abiertos). */
const NINES = Array(10).fill([9, 0]).flat();

describe('la hoja de una bola', () => {
  const ok = { name: 'Phaze II', brand: 'Storm', weight: 15, color: '#1D4ED8', drilledOn: '2026-01-10', resurfacedOn: '2026-08-01' };

  it('lo que vale', () => {
    expect(ballDraftProblem(ok, '2026-09-30')).toBeNull();
    // Mañana todavía vale (el teléfono puede estar en otra hora) y sin fechas también.
    expect(ballDraftProblem({ ...ok, drilledOn: '2026-10-01', resurfacedOn: null }, '2026-09-30')).toBeNull();
    expect(ballDraftProblem({ ...ok, drilledOn: null, resurfacedOn: null }, '2026-09-30')).toBeNull();
    expect(ballDraftProblem({ ...ok, drilledOn: '1996-09-30' }, '2026-09-30')).toBeNull();
  });

  it('lo que no deja guardar, en orden', () => {
    const today = '2026-09-30';
    expect(ballDraftProblem({ ...ok, name: '   ' }, today)).toBe('name');
    expect(ballDraftProblem({ ...ok, name: 'x'.repeat(41) }, today)).toBe('name');
    expect(ballDraftProblem({ ...ok, brand: 'x'.repeat(41) }, today)).toBe('brand');
    expect(ballDraftProblem({ ...ok, weight: 5 }, today)).toBe('weight');
    expect(ballDraftProblem({ ...ok, weight: 17 }, today)).toBe('weight');
    expect(ballDraftProblem({ ...ok, weight: 14.5 }, today)).toBe('weight');
    expect(ballDraftProblem({ ...ok, color: 'azul' }, today)).toBe('color');
    expect(ballDraftProblem({ ...ok, drilledOn: '2026-10-02' }, today)).toBe('dates');
    expect(ballDraftProblem({ ...ok, drilledOn: '1996-09-29' }, today)).toBe('dates');
    expect(ballDraftProblem({ ...ok, resurfacedOn: '2025-12-31' }, today)).toBe('dates');
    expect(ballDraftProblem({ ...ok, resurfacedOn: '30/09/2026' }, today)).toBe('dates');
    expect(ballProblemText('weight')).toBe('El peso va de 6 a 16 libras.');
  });

  it('cómo se nombra y se describe', () => {
    expect(ballLabel(ball('a', { name: 'Phaze II', weight: 14 }))).toBe('Phaze II (14 lb)');
    expect(ballDetail(ball('a', { brand: ' Storm ', cover: 'solida' }))).toBe('15 lb · Storm · Reactiva sólida');
    expect(ballDetail(ball('a'))).toBe('15 lb');
    expect(coverLabel('poliester')).toBe('Poliéster (plástico)');
    expect(coverLabel(null)).toBeNull();
    expect(colorLabel('#1D4ED8')).toBe('Azul');
    expect(colorLabel('#123456')).toBe('Otro color');
    // Los colores para elegir son distintos y válidos.
    expect(new Set(BALL_COLORS.map((c) => c.hex)).size).toBe(BALL_COLORS.length);
    for (const c of BALL_COLORS) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('la que queda al guardar (para verla enseguida en la lista): recortada, el color en minúsculas, sin diseño', () => {
    const draft = { id: null, name: ' Phaze II ', brand: ' Storm ', weight: 15, color: ' #1D4ED8 ', cover: 'solida' as const, drilledOn: '', resurfacedOn: '2026-09-01', retired: false };
    // Con el modelo del catálogo y la perforación: limpios (lo que manda set_ball_details).
    expect(ballFromDraft('n1', { ...draft, catalog: ' storm:phaze-ii ', layout: { valAngle: 30, drillingAngle: 45, notes: ' Dual ' } })).toMatchObject({
      catalog: 'storm:phaze-ii',
      layout: { drillingAngle: 45, valAngle: 30, notes: 'Dual' },
    });
    expect(ballFromDraft('n1', draft)).toEqual({
      id: 'n1',
      name: 'Phaze II',
      brand: 'Storm',
      weight: 15,
      color: '#1d4ed8',
      cover: 'solida',
      drilledOn: null,
      resurfacedOn: '2026-09-01',
      retired: false,
      createdAt: null,
      updatedAt: null,
      design: null,
      catalog: null,
      layout: null,
    });
  });

  it('la lista con esa bola: la cambia en su lugar o, nueva, va donde la pone my_balls', () => {
    const list = [ball('a'), ball('b'), ball('r', { retired: true })];
    // Una nueva: la última de las que usa (antes de las retiradas).
    expect(withBall(list, ball('n')).map((b) => b.id)).toEqual(['a', 'b', 'n', 'r']);
    expect(withBall([ball('a')], ball('n')).map((b) => b.id)).toEqual(['a', 'n']);
    expect(withBall([], ball('n')).map((b) => b.id)).toEqual(['n']);
    // Una nueva ya retirada: al final.
    expect(withBall(list, ball('nr', { retired: true })).map((b) => b.id)).toEqual(['a', 'b', 'r', 'nr']);
    // La misma: en su lugar, con lo nuevo (y no cambia la de antes).
    const changed = withBall(list, ball('b', { name: 'Otra' }));
    expect(changed.map((b) => [b.id, b.name])).toEqual([
      ['a', 'A'],
      ['b', 'Otra'],
      ['r', 'R'],
    ]);
    expect(list[1].name).toBe('B');
  });

  it('el nombre de la bola de un juego (desde 0) o de todos', () => {
    expect(gameBallTitle(0)).toBe('Bola del juego 1');
    expect(gameBallTitle(2)).toBe('Bola del juego 3');
    expect(gameBallTitle('all')).toBe('Bola de todos los juegos');
  });
});

describe('qué bola se pone sola', () => {
  const balls = [ball('a'), ball('b'), ball('viejita', { retired: true })];

  it('la última de este teléfono; si no, la del servidor; nunca una retirada o borrada', () => {
    expect(defaultBall(balls, 'b', 'a')).toBe('b');
    expect(defaultBall(balls, null, 'a')).toBe('a');
    expect(defaultBall(balls, 'borrada', 'a')).toBe('a');
    expect(defaultBall(balls, 'viejita', 'viejita')).toBeNull();
    expect(defaultBall(balls, null, null)).toBeNull();
    expect(defaultBall([], 'a', 'a')).toBeNull();
  });

  it('para elegir: las que no están retiradas y la que ya tenía el juego', () => {
    expect(pickableBalls(balls).map((b) => b.id)).toEqual(['a', 'b']);
    expect(pickableBalls(balls, 'viejita').map((b) => b.id)).toEqual(['a', 'b', 'viejita']);
    // La que tenía el juego y la elegida (mientras se elige): la retirada no se va al tocar otra.
    expect(pickableBalls(balls, 'a', 'viejita').map((b) => b.id)).toEqual(['a', 'b', 'viejita']);
    expect(pickableBalls(balls, null, undefined).map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('en el borrador: la del juego, si no la del juego anterior, si no la última', () => {
    expect(ballForGame({ 0: 'a', 1: null }, 1, 'b')).toBeNull();
    expect(ballForGame({ 0: 'a' }, 2, 'b')).toBe('a');
    expect(ballForGame({ 0: 'a', 1: null }, 2, 'b')).toBe('a');
    expect(ballForGame({}, 0, 'b')).toBe('b');
    expect(ballForGame(undefined, 3, null)).toBeNull();
  });

  it('en la hoja del evento: la que tenía ahí; sin jugar, la última; con puntaje y sin bola ahí, ninguna', () => {
    expect(eventGameBall({ 0: 'a' }, 0, true, 'b')).toBe('a');
    expect(eventGameBall({ 0: 'a' }, 1, false, 'b')).toBe('b');
    // Un juego con puntaje que no tiene bola ahí (lo anotó el admin): no se le pone una sola.
    expect(eventGameBall({ 0: 'a' }, 1, true, 'b')).toBeNull();
    expect(eventGameBall({}, 2, false, null)).toBeNull();
  });

  it('la de todos los juegos y la más usada', () => {
    expect(sameBall(['a', 'a'])).toBe('a');
    expect(sameBall([null, undefined])).toBeNull();
    expect(sameBall([])).toBeNull();
    expect(sameBall(['a', null])).toBeUndefined();
    expect(commonBall(['a', 'b', 'b', null])).toBe('b');
    expect(commonBall(['a', 'b'])).toBe('a');
    expect(commonBall([null])).toBeNull();
  });
});

describe('las bolas de cada juego al guardar', () => {
  it('juegos sueltos: se saltan las casillas vacías o que no valen, como los juegos', () => {
    expect(compactBalls(['180', '', '200', '301', '150'], { 0: 'a', 1: 'b', 2: 'b', 3: 'a', 4: null })).toEqual({ 0: 'a', 1: 'b', 2: null });
    expect(compactBalls(['180', '190'], {})).toEqual({ 0: null, 1: null });
    expect(compactBalls(['', ''], { 0: 'a' })).toEqual({});
  });

  it('envío: solo los juegos con puntaje y con bola', () => {
    expect(ballsOfScored([180, null, 200, 150], { 0: 'a', 1: 'a', 2: null, 3: 'b' })).toEqual({ 0: 'a', 3: 'b' });
    expect(ballsOfScored([180], { 0: null })).toBeNull();
  });

  it('la hoja del evento: solo lo que cambia (con puntaje, la elegida; sin puntaje, se le quita)', () => {
    expect(eventBallUpdate({}, 0, 180, 'a')).toEqual({ 0: 'a' });
    expect(eventBallUpdate({ 0: 'a' }, 0, 180, 'b')).toEqual({ 0: 'b' });
    expect(eventBallUpdate({ 0: 'a' }, 0, 180, null)).toEqual({ 0: null });
    // La misma de antes, o ninguna antes ni ahora: nada.
    expect(eventBallUpdate({ 0: 'a' }, 0, 190, 'a')).toBeNull();
    expect(eventBallUpdate({}, 1, 190, null)).toBeNull();
    // Sin bolas para elegir (undefined) no se toca la que tenía.
    expect(eventBallUpdate({ 2: 'a' }, 2, 190, undefined)).toBeNull();
    // Se borró el juego: se le quita la bola (si tenía).
    expect(eventBallUpdate({ 2: 'a' }, 2, null, 'a')).toEqual({ 2: null });
    expect(eventBallUpdate({}, 2, null, 'a')).toBeNull();
  });

  it('la hoja del evento: la que eligió se ve hasta llegar; ya en la cola, otra pantalla manda aunque vuelva a la de antes', () => {
    // Eligió la B en un juego con la X: se ve mientras sigue con la X (no llega a la cola) y cuando ya tiene la B.
    const picks = { 1: { ball: 'b', was: 'x' } };
    expect(ownPickShown(picks[1], 'x')).toBe('b');
    expect(ownPickShown(picks[1], 'b')).toBe('b');
    // Otra pantalla le puso otra: manda esa.
    expect(ownPickShown(picks[1], 'z')).toBeUndefined();
    expect(ownPickShown(undefined, 'x')).toBeUndefined();
    // Ya en la cola: si la foto (u otro teléfono) le vuelve a poner la X, se ve la X (y al guardar el juego no se
    // manda otra vez la B).
    const seen = seenPick(picks, 1, 'b');
    expect(seen).toEqual({ 1: { ball: 'b', was: 'b' } });
    expect(ownPickShown(seen[1], 'b')).toBe('b');
    expect(ownPickShown(seen[1], 'x')).toBeUndefined();
    // La que se puso sola (antes sin bola) y después «Sin bola» en otra pantalla: sin bola.
    const auto = seenPick({ 0: { ball: 'a', was: null } }, 0, 'a');
    expect(ownPickShown(auto[0], null)).toBeUndefined();
    // Si ahí ya eligió otra (mientras se guardaba), esa sigue esperando; otro juego, igual.
    expect(seenPick(picks, 1, 'c')).toBe(picks);
    expect(seenPick(picks, 2, 'b')).toBe(picks);
  });

  it('el borrador de «Mis juegos» al guardar o borrar un juego', () => {
    expect(draftBallsAfter(undefined, 0, { score: 180 }, 'a')).toEqual({ 0: 'a' });
    expect(draftBallsAfter({ 0: 'a' }, 1, { score: 200 }, null)).toEqual({ 0: 'a', 1: null });
    expect(draftBallsAfter({ 0: 'a', 1: 'b' }, 1, { score: 200 }, 'a')).toEqual({ 0: 'a', 1: 'a' });
    // Borrar el juego le quita la bola; sin bolas para elegir, se queda como estaba.
    expect(draftBallsAfter({ 0: 'a', 1: 'b' }, 1, null, 'a')).toEqual({ 0: 'a' });
    expect(draftBallsAfter({ 0: 'a' }, 1, { score: 200 }, undefined)).toEqual({ 0: 'a' });
    // Un juego sin puntaje (a medias) no cambia su bola.
    expect(draftBallsAfter({ 0: 'a' }, 0, { score: null }, 'b')).toEqual({ 0: 'a' });
  });

  it('el envío de «Subir mis juegos»: la de cada juego con puntaje, como se ve en la hoja', () => {
    // J1 con la A (del borrador), J2 sin jugar, J3 sigue con la del juego anterior, J4 sin bola a propósito.
    expect(submissionBalls([180, null, 200, 150], { 0: 'a', 3: null }, 'b', true)).toEqual({ 0: 'a', 2: 'a' });
    // Sin nada en el borrador: la última que usó en todos.
    expect(submissionBalls([180, 190], {}, 'b', true)).toEqual({ 0: 'b', 1: 'b' });
    expect(submissionBalls([180, 190], { 0: 'c', 1: 'b' }, null, true)).toEqual({ 0: 'c', 1: 'b' });
    // Sin bolas para elegir, o ninguna bola: nada.
    expect(submissionBalls([180], { 0: 'a' }, 'a', false)).toBeNull();
    expect(submissionBalls([180], {}, null, true)).toBeNull();
  });

  it('la que se recuerda: la última elegida', () => {
    expect(lastBall(['a', null, 'b', null])).toBe('b');
    expect(lastBall([null, 3, undefined])).toBeNull();
    expect(lastBall([])).toBeNull();
  });

  it('las de un lugar, por juego', () => {
    const gs = [game('a', 180, { ref: 'x', game: 0 }), game('b', 190, { ref: 'x', game: 2 }), game('a', 170, { ref: 'y', game: 1 }), game('a', 170, { kind: 'event', ref: 'x', game: 1 })];
    expect(ballsByGame(gs, 'solo', 'x')).toEqual({ 0: 'a', 2: 'b' });
    expect(ballsByGame(gs, 'event', 'x')).toEqual({ 1: 'a' });
    expect(ballsByGame(gs, 'sub', 'x')).toEqual({});
  });
});

describe('juegos sueltos sin señal: lo de la cola y cómo se movieron los juegos', () => {
  it('las que tiene cada juego: las del servidor con lo de la cola encima', () => {
    // Sin nada en la cola: las del servidor (o no se sabe).
    expect(knownBalls(3, { 0: 'a', 2: 'b' }, null)).toEqual({ 0: 'a', 2: 'b' });
    expect(knownBalls(3, null, null)).toBeNull();
    // Lo de la cola trae todos los juegos: con bolas se sabe sin el servidor.
    expect(knownBalls(3, null, { 0: 'a', 1: null, 2: 'b' })).toEqual({ 0: 'a', 2: 'b' });
    expect(knownBalls(2, { 0: 'x', 1: 'y' }, { 0: null, 1: 'b' })).toEqual({ 1: 'b' });
    // Un número es la bola que el servidor tiene en ese juego: sin servidor no se sabe.
    expect(knownBalls(2, { 0: 'a', 2: 'c' }, { 0: 0, 1: 2 })).toEqual({ 0: 'a', 1: 'c' });
    expect(knownBalls(2, null, { 0: 0, 1: 'b' })).toBeNull();
    // Un juego que la cola no trae queda como en el servidor.
    expect(knownBalls(3, { 2: 'c' }, { 0: 'a' })).toEqual({ 0: 'a', 2: 'c' });
    expect(knownBalls(3, null, { 0: 'a' })).toBeNull();
    expect(knownBalls(0, null, null)).toEqual({});
  });

  it('cómo se movieron los juegos (sin saber las bolas): cada uno apunta al que era', () => {
    // Se borró el del medio: el tercero pasa a ser el segundo.
    expect(keepBalls(['180', '', '210'], 3)).toEqual({ 0: 0, 1: 2 });
    // Uno nuevo va sin bola; uno que no vale se salta (como los juegos).
    expect(keepBalls(['180', '190', '200', '150'], 3)).toEqual({ 0: 0, 1: 1, 2: 2, 3: null });
    expect(keepBalls(['180', '301', '200'], 3)).toEqual({ 0: 0, 1: 2 });
    // Se quitó el último: los demás no se movieron, pero sobra el suyo.
    expect(keepBalls(['180', '190', ''], 3)).toEqual({ 0: 0, 1: 1 });
    // Los mismos juegos en el mismo lugar (se cambió un puntaje): nada que mandar.
    expect(keepBalls(['180', '195', '200'], 3)).toBeNull();
    expect(keepBalls(['180', '195', '200', ''], 3)).toBeNull();
  });

  it('juntar lo nuevo con lo que reemplaza en la cola', () => {
    // Primero se borró el J2 (B) y después, todavía sin señal, el J1: queda el que era el J3 del servidor.
    expect(composeBalls({ 0: 1 }, { 0: 0, 1: 2 })).toEqual({ 0: 2 });
    // Un número de lo nuevo toma la bola (o el «sin bola») que le ponía la cola.
    expect(composeBalls({ 0: 1, 1: 0, 2: null }, { 0: 'a', 1: null })).toEqual({ 0: null, 1: 'a', 2: null });
    // Si la cola no decía nada de ese juego, sigue apuntando al servidor.
    expect(composeBalls({ 0: 3 }, { 0: 'a' })).toEqual({ 0: 3 });
    expect(composeBalls({ 0: 'b', 1: 1 }, null)).toEqual({ 0: 'b', 1: 1 });
  });

  it('¿cambió algo? (si no, no se manda: el juego viejo no pasa a ser el último con esa bola)', () => {
    expect(ballsChanged({ 0: 'a', 1: 'a' }, { 0: 'a', 1: 'a' })).toBe(false);
    expect(ballsChanged({ 0: 'a', 1: null }, { 0: 'a' })).toBe(false);
    expect(ballsChanged({ 0: 'a', 1: 'b' }, { 0: 'a', 1: 'a' })).toBe(true);
    expect(ballsChanged({ 0: null }, { 0: 'a' })).toBe(true);
    // Se quitó un juego que tenía bola: sobra (hay que avisar).
    expect(ballsChanged({ 0: 'a', 1: 'a' }, { 0: 'a', 1: 'a', 2: 'a' })).toBe(true);
  });
});

describe('los números de cada bola', () => {
  it('promedio hacia abajo, el más alto, lo que falta por verificar y los juegos sin puntaje fuera', () => {
    const [a, b] = ballStats(
      [ball('a'), ball('b')],
      [game('a', 200), game('a', 181), game('a', 300, { counted: false }), game('a', null), game('b', 150, { kind: 'event' })],
    );
    expect(a).toMatchObject({ games: 2, pins: 381, average: 190, high: 200, pending: 1, framed: 0, strikePct: null, sparePct: null });
    expect(b).toMatchObject({ games: 1, average: 150, high: 150, pending: 0 });
    const [none] = ballStats([ball('c')], []);
    expect(none).toMatchObject({ games: 0, pins: 0, average: null, high: 0, pending: 0, sinceResurface: 0, needsResurface: false, lastUsedOn: null });
  });

  it('strikes y spares solo de los cuadros que cuadran con el puntaje (y de los que cuentan)', () => {
    const [s] = ballStats(
      [ball('a')],
      [
        game('a', 300, { frames: { rolls: STRIKES } }),
        game('a', 190, { frames: { rolls: SPARES } }),
        // No cuadra con el puntaje (el admin cambió el total): no cuenta para los porcentajes.
        game('a', 200, { frames: { rolls: NINES } }),
        // Todavía no cuenta.
        game('a', 90, { frames: { rolls: NINES }, counted: false }),
      ],
    );
    expect(s.games).toBe(3);
    expect(s.framed).toBe(2);
    // 12 strikes en 12 tiros con todo parado + 0 en 11 del juego de spares.
    expect(s.strikePct).toBe(Math.round((12 * 100) / 23));
    expect(s.sparePct).toBe(100);
  });

  it('juegos desde la pulida (los por verificar gastan la bola) y el aviso a los 60', () => {
    const many = (k: number, date: string, extra: Partial<BallGame> = {}) => Array.from({ length: k }, () => game('a', 180, { date, ...extra }));
    const games = [...many(10, '2026-07-01'), ...many(RESURFACE_EVERY - 1, '2026-09-01'), game('a', 170, { date: '2026-09-02', counted: false })];
    const [never] = ballStats([ball('a')], games);
    expect(never).toMatchObject({ sinceResurface: 10 + RESURFACE_EVERY, needsResurface: true, lastUsedOn: '2026-09-02' });
    // Pulida el 1 de agosto: solo cuentan los de ese día en adelante.
    const [polished] = ballStats([ball('a', { resurfacedOn: '2026-08-01' })], games);
    expect(polished).toMatchObject({ sinceResurface: RESURFACE_EVERY, needsResurface: true });
    // «La pulí hoy»: los juegos de ese mismo día también cuentan (no se pierden nunca).
    const [today] = ballStats([ball('a', { resurfacedOn: '2026-09-02' })], games);
    expect(today).toMatchObject({ sinceResurface: 1, needsResurface: false });
    const [sameDay] = ballStats([ball('a', { resurfacedOn: '2026-09-01' })], games);
    expect(sameDay).toMatchObject({ sinceResurface: RESURFACE_EVERY, needsResurface: true });
    const [later] = ballStats([ball('a', { resurfacedOn: '2026-09-03' })], games);
    expect(later).toMatchObject({ sinceResurface: 0, needsResurface: false });
  });

  it('«La pulí hoy» pregunta antes (y no hace nada si ya dice hoy)', () => {
    const day = (d: string) => `el ${d}`;
    expect(resurfaceQuestion({ name: 'Phaze', resurfacedOn: null }, '2026-09-30', day)).toEqual({
      title: '¿Puliste la Phaze hoy?',
      message: 'Sus juegos se vuelven a contar desde hoy (los de hoy también).',
    });
    expect(resurfaceQuestion({ name: 'Phaze', resurfacedOn: '2026-08-01' }, '2026-09-30', day)?.message).toBe(
      'Sus juegos se vuelven a contar desde hoy (los de hoy también). La última pulida (el 2026-08-01) se reemplaza.',
    );
    expect(resurfaceQuestion({ name: 'Phaze', resurfacedOn: '2026-09-30' }, '2026-09-30', day)).toBeNull();
  });

  it('en palabras: cuántos juegos lleva y si ya le toca', () => {
    const t = (sinceResurface: number, resurfacedOn: string | null) =>
      resurfaceText({ sinceResurface, needsResurface: sinceResurface >= RESURFACE_EVERY, ball: { resurfacedOn } });
    expect(t(0, null)).toBe('Todavía sin juegos.');
    expect(t(1, null)).toBe('1 juego sin pulir.');
    expect(t(12, '2026-09-01')).toBe('12 juegos desde la última pulida.');
    expect(t(0, '2026-09-01')).toBe('0 juegos desde la última pulida.');
    expect(t(64, '2026-09-01')).toBe('Lleva 64 juegos desde la última pulida: ya le toca pulirla (cada 60 juegos, más o menos).');
    expect(t(60, null)).toBe('Lleva 60 juegos sin pulir: ya le toca (cada 60 juegos, más o menos).');
    expect(pctText(null)).toBe('—');
    expect(pctText(42)).toBe('42%');
  });

  it('con cuál tiras mejor: el mejor promedio con al menos 3 juegos, si hay dos para comparar', () => {
    const games = [
      ...[200, 190, 204].map((s) => game('a', s)),
      ...[180, 170, 190, 160].map((s) => game('b', s)),
      ...[290, 280].map((s) => game('c', s)),
    ];
    const stats = ballStats([ball('a', { name: 'Phaze' }), ball('b', { name: 'Hammer' }), ball('c', { name: 'Nueva' })], games);
    expect(BALL_MIN_GAMES).toBe(3);
    expect(bestBall(stats)?.ball.id).toBe('a');
    expect(bestBallText(stats)).toBe('Tiras mejor con la Phaze: 198 de promedio en 3 juegos (23 pinos más que con la Hammer).');
    // Solo una con juegos suficientes: no hay con qué comparar.
    expect(bestBall(stats.filter((s) => s.ball.id !== 'b'))).toBeNull();
    expect(bestBallText([])).toBeNull();
    // Empate en promedio: la de más juegos, sin «más que».
    const tie = ballStats([ball('a', { name: 'A' }), ball('b', { name: 'B' })], [...[200, 200, 200].map((s) => game('a', s)), ...[200, 200, 200, 200].map((s) => game('b', s))]);
    expect(bestBallText(tie)).toBe('Tiras mejor con la B: 200 de promedio en 4 juegos.');
  });
});

describe('la perforación (layout Dual Angle)', () => {
  it('en una línea, como la escribe el taladrador: «45° × 4½″ × 30°» y el buffer al final', () => {
    expect(layoutText({ drillingAngle: 45, pinToPap: 4.5, valAngle: 30 })).toBe('45° × 4½″ × 30°');
    expect(layoutText({ drillingAngle: 45, pinToPap: 4.5, valAngle: 30, pinBuffer: 2 })).toBe('45° × 4½″ × 30° + 2″ buffer');
    expect(layoutText({ drillingAngle: 70, pinToPap: 3.375, valAngle: 45, pinBuffer: 1.5, notes: 'Dual Angle' })).toBe('70° × 3⅜″ × 45° + 1½″ buffer');
    // Lo que falta, «—»; solo el buffer; sin números (solo notas o nada), null.
    expect(layoutText({ drillingAngle: 60 })).toBe('60° × — × —');
    expect(layoutText({ pinToPap: 5 })).toBe('— × 5″ × —');
    expect(layoutText({ pinBuffer: 0.25 })).toBe('Buffer ¼″');
    expect(layoutText({ notes: 'Mano derecha' })).toBeNull();
    expect(layoutText({})).toBeNull();
    expect(layoutText(null)).toBeNull();
  });

  it('las pulgadas con su fracción (de a ⅛), y en enteros y octavos para elegirlas', () => {
    expect([0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1, 4.5, 6.875, 7].map(inchesText)).toEqual([
      '0″',
      '⅛″',
      '¼″',
      '⅜″',
      '½″',
      '⅝″',
      '¾″',
      '⅞″',
      '1″',
      '4½″',
      '6⅞″',
      '7″',
    ]);
    // Algo que no va de a 1/8 (no debería llegar): con coma.
    expect(inchesText(4.3)).toBe('4,3″');
    expect(splitInches(4.5)).toEqual({ whole: 4, eighths: 4 });
    expect(splitInches(0.125)).toEqual({ whole: 0, eighths: 1 });
    expect(splitInches(undefined)).toBeNull();
    expect(joinInches(4, 4)).toBe(4.5);
    expect(joinInches(null, 2)).toBe(0.25);
    expect(joinInches(null, 0)).toBeUndefined();
    expect(joinInches(0, 0)).toBe(0);
    // Con 7 (el máximo), justo 7.
    expect(joinInches(7, 3)).toBe(7);
  });

  it('lo que no deja guardar: los mismos límites de la base', () => {
    const ok = { drillingAngle: 45, pinToPap: 4.5, valAngle: 30, pinBuffer: 2, notes: 'Dual Angle, mano derecha' };
    expect(layoutProblem(ok)).toBeNull();
    expect(layoutProblem({ drillingAngle: 0, pinToPap: 0, valAngle: 90, pinBuffer: 7 })).toBeNull();
    expect(layoutProblem(null)).toBeNull();
    expect(layoutProblem({})).toBeNull();
    expect(layoutProblem({ ...ok, drillingAngle: 91 })).toBe('drillingAngle');
    expect(layoutProblem({ ...ok, drillingAngle: -1 })).toBe('drillingAngle');
    expect(layoutProblem({ ...ok, drillingAngle: 45.5 })).toBe('drillingAngle');
    expect(layoutProblem({ ...ok, pinToPap: 4.3 })).toBe('pinToPap');
    expect(layoutProblem({ ...ok, pinToPap: 7.125 })).toBe('pinToPap');
    expect(layoutProblem({ ...ok, pinToPap: '4' })).toBe('pinToPap');
    expect(layoutProblem({ ...ok, valAngle: Number.NaN })).toBe('valAngle');
    expect(layoutProblem({ ...ok, pinBuffer: 8 })).toBe('pinBuffer');
    expect(layoutProblem({ ...ok, notes: 'x'.repeat(61) })).toBe('notes');
    expect(layoutProblem({ ...ok, notes: 'x'.repeat(60) })).toBeNull();
    expect(layoutProblem({ ...ok, hand: 'derecha' })).toBe('keys');
    expect(layoutProblem([45, 4.5, 30])).toBe('keys');
    expect(layoutProblemText('pinToPap')).toBe('Del pin al PAP va de 0 a 7″.');
  });

  it('como se guarda: solo lo que tiene algo, en orden y las notas recortadas; sin nada, null', () => {
    expect(cleanLayout({ notes: '  Dual  ', valAngle: 30, drillingAngle: 45 })).toEqual({ drillingAngle: 45, valAngle: 30, notes: 'Dual' });
    expect(JSON.stringify(cleanLayout({ valAngle: 30, drillingAngle: 45 }))).toBe('{"drillingAngle":45,"valAngle":30}');
    expect(cleanLayout({ drillingAngle: undefined, pinToPap: null, notes: '   ' })).toBeNull();
    expect(cleanLayout({})).toBeNull();
    expect(cleanLayout(null)).toBeNull();
    expect(cleanLayout('45 x 4.5 x 30')).toBeNull();
  });

  it('set_ball_details solo sale si cambió el modelo o la perforación', () => {
    const before = { catalog: 'storm:phaze-ii', layout: { drillingAngle: 45, valAngle: 30 } };
    expect(ballDetailsChanged(before, { catalog: 'storm:phaze-ii', layout: { valAngle: 30, drillingAngle: 45 } })).toBe(false);
    expect(ballDetailsChanged(before, { catalog: null, layout: before.layout })).toBe(true);
    expect(ballDetailsChanged(before, { catalog: 'storm:phaze-ii', layout: { drillingAngle: 50, valAngle: 30 } })).toBe(true);
    expect(ballDetailsChanged(null, { catalog: null, layout: null })).toBe(false);
    expect(ballDetailsChanged(null, { catalog: '', layout: { notes: ' ' } })).toBe(false);
    expect(ballDetailsChanged(null, { catalog: null, layout: { pinToPap: 4 } })).toBe(true);
  });
});

describe('el modelo del catálogo', () => {
  const model: CatalogBall = {
    id: 'marca:modelo',
    brand: 'Marca',
    name: 'Modelo',
    cover: 'perlada',
    coverstock: 'R2S Pearl',
    core: 'asimetrico',
    year: 2023,
    colors: ['#7C3AED', '#facc15'],
  };
  const empty = { id: null, name: '', brand: '', weight: 14, color: '#1d4ed8', cover: null, drilledOn: null, resurfacedOn: null, retired: false, catalog: null, layout: null };

  it('lo que dice al buscarlo y en su tarjeta', () => {
    expect(catalogLine(model)).toBe('Reactiva perlada · 2023 · asimétrico');
    expect(catalogLine({ cover: 'solida' })).toBe('Reactiva sólida');
    expect(catalogSpecs(model)).toBe('R2S Pearl · núcleo asimétrico · 2023');
    expect(catalogSpecs({ core: 'simetrico' })).toBe('núcleo simétrico');
    expect(catalogSpecs({})).toBeNull();
  });

  it('sus colores, como diseño propuesto: jaspeada con el segundo; con uno, como sin diseño; sin colores, null', () => {
    expect(catalogLook(model)).toEqual({ ...defaultBallDesign('#7c3aed', 'perlada'), pattern: 'jaspeada', second: '#facc15', third: null });
    expect(catalogLook({ ...model, colors: ['#111111'] })).toEqual(defaultBallDesign('#111111', 'perlada'));
    expect(catalogLook({ ...model, colors: ['rojo'] })).toBeNull();
    expect(catalogLook({ cover: 'solida' })).toBeNull();
  });

  it('llena la hoja: marca, nombre, cubierta y su clave; en una nueva también el color', () => {
    expect(draftFromCatalog(empty, model, true)).toEqual({ ...empty, name: 'Modelo', brand: 'Marca', cover: 'perlada', catalog: 'marca:modelo', color: '#7c3aed' });
    // Una que ya existe se queda con su color (el de su diseño); el peso y lo demás, igual.
    expect(draftFromCatalog({ ...empty, id: 'a', name: 'La mía' }, model, false)).toEqual({ ...empty, id: 'a', name: 'Modelo', brand: 'Marca', cover: 'perlada', catalog: 'marca:modelo' });
    // Sin colores, el que tenía.
    expect(draftFromCatalog(empty, { ...model, colors: undefined }, true).color).toBe('#1d4ed8');
  });

  it('cada modelo del catálogo de la app llena la hoja (clave única, marca y nombre)', () => {
    expect(new Set(BALL_CATALOG.map((c) => c.id)).size).toBe(BALL_CATALOG.length);
    for (const c of BALL_CATALOG) {
      expect(catalogLine(c)).toMatch(/^(Reactiva|Uretano|Poliéster)/);
      const d = draftFromCatalog(empty, c, true);
      expect(d.name.trim()).not.toBe('');
      expect(d.brand.trim()).not.toBe('');
      expect(d.catalog).toBe(c.id);
    }
  });
});
