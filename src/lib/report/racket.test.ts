import { describe, expect, it } from 'vitest';
import type { Match } from '../data/matches';
import { nightRounds, nightTable, parseNightConfig } from '../../pages/sports/racket/logic/night';
import { mkMatch, pts, side } from '../../pages/sports/racket/logic/testMatch';
import { parseSocialConfig, socialTable } from '../../pages/sports/pickleball/social/logic';
import { racketTourneyFinished } from '../../prizes/sports';
import { LEAGUE } from './fixtures';
import { pickleballSocialReport, racketNightReport, racketTourneyReport, type RacketNames } from './racket';
import { excelLines, pdfPages, podiumsBrief, view } from './testing';

const NOW = Date.parse('2026-10-20T12:00:00Z');
const PADEL = { ...LEAGUE, sport: 'padel', venue: 'Club Las Palmas' };

const PEOPLE: Record<string, string> = { a: 'Ana', b: 'Beto', c: 'Carla', d: 'Dani', e: 'Eva', f: 'Fer', g: 'Gabi', h: 'Hugo', i: 'Iris', j: 'Juan', k: 'Kike', l: 'Lola' };
const PAIRS: Record<string, string[]> = { T1: ['a', 'b'], T2: ['c', 'd'], T3: ['e', 'f'], T4: ['g', 'h'], T5: ['i', 'j'], T6: ['k', 'l'] };
const pairName = (t: string) => PAIRS[t].map((p) => PEOPLE[p]).join(' / ');
const names: RacketNames = {
  nameOf: (id) => PEOPLE[id] ?? '(jugador borrado)',
  entrantName: (id) => (PAIRS[id] ? pairName(id) : (PEOPLE[id] ?? '(borrado)')),
  rosterOf: (id) => PAIRS[id] ?? [],
};

/** Un partido a sets entre dos parejas (sin marcador: por jugar). */
function game(id: string, stage: string, key: string | null, t1: string, t2: string, result?: { text: string; winner: 1 | 2; sets: [number, number]; games: [number, number] }): Match {
  return mkMatch({
    id,
    eventId: 'E1',
    stage,
    bracketKey: key,
    sides: [side(1, PAIRS[t1], t1, pairName(t1)), side(2, PAIRS[t2], t2, pairName(t2))],
    status: result ? 'confirmed' : 'scheduled',
    score: result ? { text: result.text, sides: result.sets, totals: { sets: result.sets, games: result.games } } : null,
    winner: result?.winner ?? null,
  });
}

// Categoría A: cuadro directo de 4 con 3.er lugar. Semis: T1 le gana a T4, T2 a T3; final T1 a T2; 3.º T3 a T4.
const categoryA = { id: 'A', name: 'Categoría A', pairs: ['T1', 'T2', 'T3', 'T4'], groups: 0, perGroup: 2, thirdPlace: true, seeds: ['T1', 'T2', 'T3', 'T4'] };
const BRACKET = [
  game('s1', 'Categoría A · Semifinal', 'A-R1-1', 'T1', 'T4', { text: '6-2 6-3', winner: 1, sets: [2, 0], games: [12, 5] }),
  game('s2', 'Categoría A · Semifinal', 'A-R1-2', 'T2', 'T3', { text: '6-4 3-6 10-7', winner: 1, sets: [2, 1], games: [19, 17] }),
  game('p3', 'Categoría A · 3.er lugar', 'A-P3', 'T3', 'T4', { text: '6-1 6-1', winner: 1, sets: [2, 0], games: [12, 2] }),
  game('f', 'Categoría A · Final', 'A-R2-1', 'T1', 'T2', { text: '7-5 6-4', winner: 1, sets: [2, 0], games: [13, 9] }),
];
const event = (categories: unknown[]) => ({ id: 'E1', name: 'Open de Pádel', date: '2026-10-12', config: { v: 1, format: 'torneo', categories, courts: [], points: 'standard' } });
const tourney = (categories: unknown[], matches: Match[]) =>
  racketTourneyReport({ lid: 'L1', league: PADEL, event: event(categories), title: 'Open de Pádel', sport: 'padel', leagueRules: {}, matches, names, now: NOW });

describe('reporte del torneo de raqueta por categorías', () => {
  it('arriba: título, liga, fecha, club y el formato', () => {
    const r = tourney([categoryA], BRACKET);
    expect(r.title).toBe('Open de Pádel');
    expect(r.subtitle).toBe('Liga Norte · Pádel');
    expect(r.sport).toBe('padel');
    expect(r.facts.map((f) => [f.label, f.label === 'Fecha' ? '' : f.value])).toEqual([
      ['Fecha', ''],
      ['Club', 'Club Las Palmas'],
      ['Formato', '1 categoría · Dobles · Tabla: ganar 3, perder 1'],
    ]);
  });

  it('campeones de cada categoría con el cuadro (los podios de los premios): final, 3.er lugar y la pareja', () => {
    const r = tourney([categoryA], BRACKET);
    expect(r.final).toBe(true);
    expect(r.notes).toEqual([]);
    expect(podiumsBrief(r)).toEqual([
      [
        'Parejas · Categoría A',
        [
          // La pareja se llama como sus jugadores: no se repiten debajo.
          [1, [['Ana / Beto', null, null]]],
          [2, [['Carla / Dani', null, null]]],
          [3, [['Eva / Fer', null, null]]],
        ],
      ],
    ]);
    // La pareja armada al revés («Beto / Ana»): tampoco se repiten (los jugadores vienen por nombre).
    const reversed = BRACKET.map((m) => ({ ...m, sides: m.sides.map((x) => ({ ...x, label: x.label.split(' / ').reverse().join(' / ') })) }) as Match);
    expect(podiumsBrief(tourney([categoryA], reversed))[0][1]).toEqual([
      [1, [['Beto / Ana', null, null]]],
      [2, [['Dani / Carla', null, null]]],
      [3, [['Fer / Eva', null, null]]],
    ]);
    expect(r.highlights).toEqual([
      { label: 'Categorías', value: '1' },
      { label: 'Parejas', value: '4' },
      { label: 'Jugadores', value: '8' },
      { label: 'Partidos jugados', value: '4' },
    ]);
  });

  it('General: los partidos por fase (semifinal, 3.er lugar y final) con el marcador y quién ganó', () => {
    const [partidos] = tourney([categoryA], BRACKET).general;
    expect(partidos.title).toBe('Categoría A · Partidos');
    expect(partidos.note).toBe('4 parejas · cuadro directo · con 3.er lugar');
    const pdf = view(partidos, 'pdf');
    expect(pdf.head).toEqual(['Lado 1', 'Marcador', 'Lado 2', 'Ganador']);
    expect(pdf.rows).toEqual([
      'Semifinal',
      ['Ana / Beto', '6-2 6-3', 'Gabi / Hugo', 'Ana / Beto'],
      ['Carla / Dani', '6-4 3-6 10-7', 'Eva / Fer', 'Carla / Dani'],
      '3.er lugar',
      ['Eva / Fer', '6-1 6-1', 'Gabi / Hugo', 'Eva / Fer'],
      'Final',
      ['Ana / Beto', '7-5 6-4', 'Carla / Dani', 'Ana / Beto'],
    ]);
    // En el Excel, además, la fecha y la cancha.
    expect(view(partidos, 'excel').head).toEqual(['Fecha y hora', 'Cancha', 'Lado 1', 'Marcador', 'Lado 2', 'Ganador']);
  });

  it('Individual: cada jugador de la categoría con lo de su lado (la cuenta del ranking de la liga)', () => {
    const [cat] = tourney([categoryA], BRACKET).individual;
    expect(cat.title).toBe('Categoría A');
    const pdf = view(cat, 'pdf');
    expect(pdf.head).toEqual(['#', 'Jugador', 'Pareja', 'PJ', 'G', 'P', '% G', 'Dif. sets', 'Dif. juegos', 'Pts']);
    // Ana y Beto: 2 ganados (3 + 3). Eva y Fer y Carla y Dani: 1 y 1 (3 + 1), por la diferencia de juegos (+8 y −2).
    // Los empatados del todo (la misma pareja) los ordena el sorteo, como el ranking de la liga.
    const byName = new Map(pdf.rows.map((x) => [(x as unknown[])[1], (x as unknown[]).slice(2)] as const));
    expect(pdf.rows.map((x) => (x as unknown[])[0])).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(byName.get('Ana')).toEqual(['Ana / Beto', 2, 2, 0, 100, 4, 11, 6]);
    expect(byName.get('Eva')).toEqual(['Eva / Fer', 2, 1, 1, 50, 1, 8, 4]);
    expect(byName.get('Carla')).toEqual(['Carla / Dani', 2, 1, 1, 50, -1, -2, 4]);
    expect(byName.get('Hugo')).toEqual(['Gabi / Hugo', 2, 0, 2, 0, -4, -17, 2]);
    expect(pdf.rows.slice(0, 2).map((x) => (x as unknown[])[1]).sort()).toEqual(['Ana', 'Beto']);
    expect(view(cat, 'excel').head).toEqual(['#', 'Jugador', 'Pareja', 'PJ', 'G', 'P', '% G', 'Sets +', 'Sets −', 'Dif. sets', 'Juegos +', 'Juegos −', 'Dif. juegos', 'Pts']);
  });

  it('a medias: grupos con su tabla, partidos por jugar (con su estado) e inscritos de una categoría sin arrancar', () => {
    const categoryB = { id: 'B', name: 'Categoría B', pairs: ['T5', 'T6'], groups: 1, perGroup: 1, thirdPlace: false, groupsOf: [['T5', 'T6']] };
    const categoryC = { id: 'C', name: 'Damas', pairs: ['T3', 'T4'], groups: 0, perGroup: 2, thirdPlace: false };
    const matches = [...BRACKET.slice(0, 2), game('g1', 'Categoría B · Grupo A', null, 'T5', 'T6')];
    const r = tourney([categoryA, categoryB, categoryC], matches);
    expect(r.final).toBe(false);
    expect(r.notes).toEqual(['Falta 1 partido por jugar o confirmar: el podio puede cambiar.']);
    expect(r.general.map((t) => t.title)).toEqual(['Categoría A · Partidos', 'Categoría B · Grupo A', 'Categoría B · Partidos', 'Damas · Inscritos']);
    const group = view(r.general[1], 'pdf');
    expect(group.head).toEqual(['Lugar', 'Pareja', 'PJ', 'G', 'P', 'Sets +', 'Sets −', 'Juegos +', 'Juegos −', 'Pts']);
    expect(group.rows.map((x) => (x as unknown[])[1])).toEqual(['Iris / Juan', 'Kike / Lola']);
    const pending = view(r.general[2], 'pdf');
    expect(pending.head).toEqual(['Lado 1', 'Marcador', 'Lado 2', 'Ganador', 'Estado']);
    expect(pending.rows).toEqual(['Grupo A', ['Iris / Juan', null, 'Kike / Lola', null, 'Programado']]);
    expect(view(r.general[3], 'pdf').rows).toEqual([
      [1, 'Eva / Fer'],
      [2, 'Gabi / Hugo'],
    ]);
    // Sin la final, el podio de A todavía no sale.
    expect(r.podiums).toEqual([]);
    expect(racketTourneyFinished([categoryA, categoryB], matches, names, NOW)).toBe(false);
    expect(racketTourneyFinished([categoryA], BRACKET, names, NOW)).toBe(true);
    // Sin categorías que se jueguen, no terminó.
    expect(racketTourneyFinished([{ ...categoryC, pairs: ['T3'] }], [], names, NOW)).toBe(false);
  });

  it('una pareja con nombre propio sí lleva a sus jugadores debajo', () => {
    const named = BRACKET.map((m) => ({ ...m, sides: m.sides.map((s) => (s.teamId === 'T1' ? { ...s, label: 'Los Rápidos' } : s)) as Match['sides'] }));
    expect(podiumsBrief(tourney([categoryA], named))[0][1][0]).toEqual([1, [['Los Rápidos', 'Ana y Beto', null]]]);
  });

  it('Excel: «General», «Individual» y el detalle de siempre (partidos y jugadores)', () => {
    const xl = excelLines(tourney([categoryA], BRACKET));
    expect(xl.names).toEqual(['General', 'Individual', 'Partidos', 'Jugadores']);
    expect(xl.lines('General')).toContain('1.er lugar | Ana / Beto');
    expect(xl.lines('Individual')[0]).toBe('Categoría A');
    expect(xl.lines('Partidos')[0]).toBe('Jornada o fase | Fecha | Hora | Cancha | Lado 1 | Lado 2 | Marcador | Ganador | Estado');
  });

  it('Excel con la tabla «ganar 2, perder 0»: «Jugadores» cuenta los mismos puntos que «Individual»', () => {
    const e = event([categoryA]);
    const r = racketTourneyReport({ lid: 'L1', league: PADEL, event: { ...e, config: { ...e.config, points: '2-0' } }, title: 'Open de Pádel', sport: 'padel', leagueRules: {}, matches: BRACKET, names, now: NOW });
    const xl = excelLines(r);
    const pts = (sheet: string) => xl.lines(sheet).find((l) => l.split(' | ')[1] === 'Ana')?.split(' | ').pop();
    // Ana ganó 2: 4 puntos (con «ganar 3, perder 1» serían 6).
    expect(pts('Individual')).toBe('4');
    expect(pts('Jugadores')).toBe('4');
  });

  it('PDF: la página «General» con los campeones y el cuadro, y el individual en otra página', () => {
    const { pages, individualFrom, landscape } = pdfPages(tourney([categoryA], BRACKET));
    expect(individualFrom).toBe(2);
    expect(landscape).toBe(false);
    expect(pages[0]).toEqual(expect.arrayContaining(['Resultados finales', 'Open de Pádel', 'Campeones', 'Parejas · Categoría A', 'Categoría A · Partidos', 'Final']));
    expect(pages[1]).toEqual(expect.arrayContaining(['Individual', 'Categoría A', 'Ana', 'Dif. sets']));
  });
});

describe('reporte del torneo de ping pong', () => {
  const TT = { ...LEAGUE, sport: 'table_tennis', venue: 'Club Naco' };
  const singles = (id: string, stage: string, key: string, a: string, b: string, text: string, winner: 1 | 2, g: [number, number], p: [number, number]) =>
    mkMatch({
      id,
      eventId: 'E1',
      stage,
      bracketKey: key,
      sides: [side(1, [a], null, PEOPLE[a]), side(2, [b], null, PEOPLE[b])],
      status: 'confirmed',
      score: { text, sides: g, totals: { sets: g, games: g, points: p } },
      winner,
    });
  const cat = { id: 'A', name: 'Primera', pairs: ['a', 'c', 'e', 'g'], groups: 0, perGroup: 2, thirdPlace: true, seeds: ['a', 'c', 'e', 'g'] };
  const matches = [
    singles('s1', 'Primera · Semifinal', 'A-R1-1', 'a', 'g', '11-5 11-7 11-3', 1, [3, 0], [33, 15]),
    singles('s2', 'Primera · Semifinal', 'A-R1-2', 'c', 'e', '11-9 9-11 11-8 11-9', 1, [3, 1], [42, 37]),
    singles('p3', 'Primera · 3.er lugar', 'A-P3', 'e', 'g', '11-4 11-6 11-2', 1, [3, 0], [33, 12]),
    singles('f', 'Primera · Final', 'A-R2-1', 'a', 'c', '11-8 8-11 12-10 11-7', 1, [3, 1], [42, 36]),
  ];
  const r = racketTourneyReport({ lid: 'L1', league: TT, event: event([cat]), title: 'Abierto de Ping Pong', sport: 'table_tennis', leagueRules: {}, matches, names, now: NOW });

  it('individual, la tabla de la ITTF, juegos y puntos, y la mesa en el Excel', () => {
    expect(r.subtitle).toBe('Liga Norte · Ping pong');
    expect(r.facts.find((f) => f.label === 'Formato')?.value).toBe('1 categoría · Individual · Tabla: ganar 2, perder 1 (W.O. o retiro 0)');
    expect(podiumsBrief(r)).toEqual([
      [
        'Individual · Primera',
        [
          [1, [['Ana', null, null]]],
          [2, [['Carla', null, null]]],
          [3, [['Eva', null, null]]],
        ],
      ],
    ]);
    const [ind] = r.individual;
    expect(view(ind, 'excel').head).toEqual(['#', 'Jugador', 'PJ', 'G', 'P', '% G', 'Juegos +', 'Juegos −', 'Dif. juegos', 'Puntos +', 'Puntos −', 'Dif. puntos', 'Pts']);
    expect(view(r.general[0], 'excel').head[1]).toBe('Mesa');
    expect(excelLines(r).lines('Partidos')[0]).toBe('Jornada o fase | Fecha | Hora | Mesa | Lado 1 | Lado 2 | Marcador | Ganador | Estado');
  });
});

describe('reporte de la noche (americano) y del round robin social', () => {
  // Americano a 24 con 5: una ronda descansa Eva y la otra Ana.
  const cfg = parseNightConfig({ format: 'americano', players: ['a', 'b', 'c', 'd', 'e'], courts: ['Cancha 1'], rounds: 2, rest: 'none', rests: { 1: ['e'], 2: ['a'] } });
  const matches = [pts(1, 'Cancha 1', ['a', 'b'], ['c', 'd'], 14, 10, { eventId: 'N1' }), pts(2, 'Cancha 1', ['b', 'e'], ['c', 'd'], 9, 15, { eventId: 'N1' })];
  const rounds = nightRounds(cfg, matches, NOW);
  const table = nightTable(cfg, rounds);
  const night = (finished = true) =>
    racketNightReport({ lid: 'L1', league: PADEL, event: { id: 'N1', name: '', date: '2026-10-12' }, title: 'Americano', cfg, rounds, table, nameOf: names.nameOf, finished, now: NOW });

  it('el podio de la noche (los que jugaron), las rondas con quién descansó y la tabla en «Individual»', () => {
    const r = night();
    expect(r.title).toBe('Americano');
    expect(r.final).toBe(true);
    expect(r.facts.find((f) => f.label === 'Formato')?.value).toBe('Americano · A 24 puntos · 2 rondas · 1 cancha');
    // Beto suma 14 + 9 = 23; Carla y Dani 10 + 15 = 25; Ana 14; Eva 9.
    expect(podiumsBrief(r)).toEqual([
      [
        'Individual',
        [
          [1, [['Carla', null, '25 pts'], ['Dani', null, '25 pts']]],
          // El empate de arriba se lleva el 2.º lugar.
          [2, []],
          [3, [['Beto', null, '23 pts']]],
        ],
      ],
    ]);
    expect(view(r.general[0], 'pdf').rows).toEqual([
      'Ronda 1 · Descansan: Eva',
      ['Cancha 1', 'Ana / Beto', '14-10', 'Carla / Dani'],
      'Ronda 2 · Descansan: Ana',
      ['Cancha 1', 'Beto / Eva', '9-15', 'Carla / Dani'],
    ]);
    const tabla = view(r.individual[0], 'pdf');
    expect(tabla.head).toEqual(['#', 'Jugador', 'PJ', 'G', 'E', 'P', 'A favor', 'En contra', 'Dif.', 'Desc.', 'Prom.', 'Pts']);
    expect(tabla.rows[0]).toEqual([1, 'Carla', 2, 1, 0, 1, 25, 23, 2, 0, 12.5, 25]);
    expect(r.highlights).toEqual([
      { label: 'Jugadores', value: '5' },
      { label: 'Rondas', value: '2 de 2' },
      { label: 'Partidos jugados', value: '2' },
      { label: 'Canchas', value: '1' },
    ]);
  });

  it('sin terminar: aviso; el Excel trae las rondas de siempre (la tabla ya va en «Individual»)', () => {
    const r = night(false);
    expect(r.final).toBe(false);
    expect(r.notes).toEqual(['Todavía no termina: la tabla puede cambiar.']);
    expect(excelLines(r).names).toEqual(['General', 'Individual', 'Rondas']);
  });

  it('round robin social del pickleball: la tabla por partidos ganados', () => {
    const social = parseSocialConfig({ players: ['a', 'b', 'c', 'd'], courts: ['Cancha 1'], rounds: 1, game: { to: 11 } });
    const ms = [pts(1, 'Cancha 1', ['a', 'b'], ['c', 'd'], 11, 7, { eventId: 'S1' })];
    const rr = nightRounds(social, ms, NOW);
    const t = socialTable(['a', 'b', 'c', 'd'], rr);
    const r = pickleballSocialReport({
      lid: 'L1',
      league: { ...LEAGUE, sport: 'pickleball' },
      event: { id: 'S1', name: 'Social del jueves', date: '2026-10-12' },
      title: 'Social del jueves',
      cfg: social,
      rounds: rr,
      table: t,
      nameOf: names.nameOf,
      finished: true,
      now: NOW,
    });
    expect(r.facts.find((f) => f.label === 'Formato')?.value).toBe('Round robin · Juego a 11, ganando por 2, conteo tradicional · 1 ronda · 1 cancha');
    expect(podiumsBrief(r)[0][1]).toEqual([
      [1, [['Ana', null, '1 pts'], ['Beto', null, '1 pts']]],
      [2, []],
      [3, [['Carla', null, '0 pts'], ['Dani', null, '0 pts']]],
    ]);
    const tabla = view(r.individual[0], 'pdf');
    expect(tabla.head).toEqual(['#', 'Jugador', 'PJ', 'G', 'P', 'PF', 'PC', 'Dif.', 'Desc.']);
    expect(tabla.rows[0]).toEqual([1, 'Ana', 1, 1, 0, 11, 7, 4, 0]);
    const { pages } = pdfPages(r);
    expect(pages[0]).toEqual(expect.arrayContaining(['Social del jueves', 'Liga Norte · Pickleball', 'Rondas', 'Ronda 1']));
  });
});
