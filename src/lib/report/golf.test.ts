import { describe, expect, it } from 'vitest';
import type { GolfCardDoc, GolfRoundFull } from '../data/golf';
import { DEMO_COURSE, DEMO_PARS } from '../../sports/golf/demo';
import { LEAGUE } from './fixtures';
import { golfReport, type GolfReportInput } from './golf';
import { excelLines, pdfPages, podiumsBrief, view } from './testing';

const GOLF = { ...LEAGUE, sport: 'golf', venue: 'Club de Golf del Norte' };

const round = (eventId: string, extra: Partial<GolfRoundFull> = {}): GolfRoundFull => ({
  eventId,
  courseId: 'demo',
  courseName: DEMO_COURSE.name,
  holes: 18,
  nine: 'all',
  competition: { format: 'stroke', basis: 'net', allowance: 95 },
  shotgun: false,
  tournamentId: null,
  roundNo: null,
  closed: true,
  closedAt: null,
  course: DEMO_COURSE,
  ...extra,
});

const card = (eventId: string, playerId: string, strokes: (number | null)[], extra: Partial<GolfCardDoc> = {}): GolfCardDoc => ({
  id: `${eventId}-${playerId}`,
  eventId,
  playerId,
  teeId: 'azul',
  hcpIndex: 0,
  courseHcp: 0,
  playingHcp: 0,
  groupNo: 1,
  startHole: 1,
  strokes,
  putts: strokes.map(() => 2),
  pickedUp: strokes.map(() => false),
  signed: true,
  signedAt: null,
  scoredAt: '2026-10-12T14:00:00Z',
  dq: false,
  ...extra,
});

/** Golpes por hoyo: el par más `delta` en los hoyos que diga. */
const pars = (delta: (i: number) => number = () => 0) => DEMO_PARS.map((p, i) => p + delta(i));
const nameOf = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

// Neto: ana +2 bruto con 4 de handicap (−2 neto); caro −1; beto par; dani (−2 bruto) descalificado.
const R = round('r');
const CARDS = [
  card('r', 'ana', pars((i) => (i < 2 ? 1 : 0)), { playingHcp: 4 }),
  card('r', 'beto', pars()),
  card('r', 'caro', pars((i) => (i === 0 ? -1 : 0))),
  card('r', 'dani', pars((i) => (i === 0 ? -2 : 0)), { dq: true }),
];
const single = (over: Partial<GolfReportInput> = {}) =>
  golfReport({ lid: 'L1', league: GOLF, event: { id: 'r', name: 'Ronda del sábado', date: '2026-10-12' }, title: 'Ronda del sábado', round: R, cards: CARDS, nameOf, ...over });

describe('reporte del golf: una ronda suelta', () => {
  it('arriba: la ronda, la liga, el campo de la ronda y el formato', () => {
    const r = single();
    expect(r.title).toBe('Ronda del sábado');
    expect(r.subtitle).toBe('Liga Norte · Golf');
    expect(r.facts.map((f) => [f.label, f.label === 'Fecha' ? '' : f.value])).toEqual([
      ['Fecha', ''],
      ['Campo', 'Campo de ejemplo'],
      ['Formato', 'Stroke play neto · 18 hoyos'],
    ]);
    expect(r.final).toBe(true);
    expect(r.notes).toEqual([]);
  });

  it('campeones: la competencia oficial, gross y neto (los podios de los premios), con el resultado', () => {
    expect(podiumsBrief(single())).toEqual([
      [
        'Individual',
        [
          [1, [['Ana', null, '−2 · 70 netos']]],
          [2, [['Caro', null, '−1 · 71 netos']]],
          [3, [['Beto', null, 'E · 72 netos']]],
        ],
      ],
      [
        'Individual · Gross',
        [
          [1, [['Caro', null, '−1 · 71 golpes']]],
          [2, [['Beto', null, 'E · 72 golpes']]],
          [3, [['Ana', null, '+2 · 74 golpes']]],
        ],
      ],
      [
        'Individual · Neto',
        [
          [1, [['Ana', null, '−2 · 70 netos']]],
          [2, [['Caro', null, '−1 · 71 netos']]],
          [3, [['Beto', null, 'E · 72 netos']]],
        ],
      ],
    ]);
  });

  it('General: el leaderboard oficial (el descalificado al final, sin puesto)', () => {
    const [board] = single().general;
    expect(board.title).toBe('Leaderboard · Stroke play neto');
    const pdf = view(board, 'pdf');
    expect(pdf.head).toEqual(['Lugar', 'Jugador', 'Resultado', 'Bruto', 'Neto', 'Pts', 'Hcp', 'Hoyos', 'Nota']);
    expect(pdf.rows.map((x) => (x as unknown[]).filter((_, i) => i !== 5))).toEqual([
      [1, 'Ana', '−2', 74, 70, 4, 'F', null],
      [2, 'Caro', '−1', 71, 71, 0, 'F', null],
      [3, 'Beto', 'E', 72, 72, 0, 'F', null],
      [null, 'Dani', '−2', 70, 70, 0, 'F', 'Descalificado'],
    ]);
  });

  it('Individual: la tarjeta de cada jugador hoyo por hoyo (con la fila del par), acostada', () => {
    const r = single();
    const [cards] = r.individual;
    expect(cards.title).toBe('Tarjetas · Campo de ejemplo · 18 hoyos');
    const pdf = view(cards, 'pdf');
    expect(pdf.head).toEqual(['#', 'Jugador', ...Array.from({ length: 18 }, (_, i) => String(i + 1)), 'Ida', 'Vta', 'Bruto', 'Hcp', 'Neto', 'Pts', 'Putts']);
    expect(pdf.rows[0]).toEqual([null, 'Par', ...DEMO_PARS, 36, 36, 72, null, null, null, null]);
    expect(pdf.rows[1]).toEqual([1, 'Ana', ...pars((i) => (i < 2 ? 1 : 0)), 38, 36, 74, 4, 70, expect.any(Number), 36]);
    expect(pdf.rows[4]).toEqual([null, 'Dani (Descalificado)', ...pars((i) => (i === 0 ? -2 : 0)), 34, 36, 70, 0, 70, expect.any(Number), 36]);
    // Recogió en un hoyo: una raya.
    const picked = card('r', 'eva', pars(), { pickedUp: pars().map((_, i) => i === 3) });
    const withPick = view(single({ cards: [...CARDS, picked] }).individual[0], 'pdf');
    const eva = withPick.rows.find((x) => (x as unknown[])[1] === 'Eva (Recogió)') as unknown[];
    expect(eva[5]).toBe('–');
    expect(eva[20]).toBeNull();
    expect(view(cards, 'excel').head[2]).toBe('Salida');
    expect(r.individualLandscape).toBe(true);
    expect(r.highlights).toEqual([
      { label: 'Jugadores', value: '4' },
      { label: 'Mejor ronda (bruto)', value: '71 · Caro' },
    ]);
  });

  it('sin cerrar: resultados parciales y el aviso', () => {
    const r = single({ round: { ...R, closed: false } });
    expect(r.final).toBe(false);
    expect(r.notes).toEqual(['La ronda todavía no se cierra: el leaderboard puede cambiar.']);
  });

  it('PDF y Excel: «General» con el leaderboard e «Individual» acostada; el golf no tenía más hojas', () => {
    const { pages, individualFrom, landscape } = pdfPages(single());
    expect(individualFrom).toBe(2);
    expect(landscape).toBe(true);
    expect(pages[0]).toEqual(expect.arrayContaining(['Ronda del sábado', 'Campeones', 'Individual · Gross', 'Leaderboard · Stroke play neto']));
    expect(pages[1]).toEqual(expect.arrayContaining(['Tarjetas · Campo de ejemplo · 18 hoyos', 'Par', 'Ida', 'Putts']));
    expect(excelLines(single()).names).toEqual(['General', 'Individual']);
  });
});

describe('reporte del golf: la ronda de un torneo reporta el torneo entero', () => {
  const gross = { format: 'stroke' as const, basis: 'gross' as const, allowance: 100 };
  const r1 = round('r1', { tournamentId: 't', roundNo: 1, competition: gross });
  const r2 = round('r2', { tournamentId: 't', roundNo: 2, competition: gross, closed: false });
  const c1 = [card('r1', 'ana', pars((i) => (i === 0 ? -1 : 0))), card('r1', 'beto', pars())];
  const c2 = [card('r2', 'ana', pars((i) => (i === 0 ? 1 : 0))), card('r2', 'beto', pars((i) => (i === 0 ? -2 : 0)))];
  const report = (screen: GolfRoundFull) =>
    golfReport({
      lid: 'L1',
      league: GOLF,
      event: { id: screen.eventId, name: '', date: '2026-10-13' },
      title: 'Ronda 13 oct 2026',
      round: screen,
      cards: c2,
      tournament: { id: 't', name: 'Abierto del Norte', rounds: [r1, { ...r2, closed: false }], cards: [...c1, ...c2], dates: ['2026-10-12', '2026-10-13'] },
      nameOf,
    });

  it('el nombre y las fechas del torneo, la suma de las rondas y una tabla de tarjetas por ronda', () => {
    const r = report(r2);
    expect(r.title).toBe('Abierto del Norte');
    expect(r.facts.map((f) => f.label)).toEqual(['Fechas', 'Campo', 'Formato']);
    expect(r.facts[2].value).toBe('Stroke play bruto · 2 rondas');
    expect(r.final).toBe(false);
    expect(r.notes).toEqual(['Faltan rondas por cerrar: el leaderboard puede cambiar.']);
    const board = view(r.general[0], 'pdf');
    expect(r.general[0].title).toBe('Leaderboard del torneo · Stroke play bruto');
    expect(board.head.slice(0, 5)).toEqual(['Lugar', 'Jugador', 'R1', 'R2', 'Resultado']);
    // Beto 72 + 70 = 142 (−2); Ana 71 + 73 = 144 (E).
    expect(board.rows.map((x) => (x as unknown[]).slice(0, 5))).toEqual([
      [1, 'Beto', 72, 70, '−2'],
      [2, 'Ana', 71, 73, 'E'],
    ]);
    expect(r.individual.map((t) => t.title)).toEqual(['Ronda 1 · Campo de ejemplo · 18 hoyos', 'Ronda 2 · Campo de ejemplo · 18 hoyos']);
    expect(r.highlights).toEqual([
      { label: 'Jugadores', value: '2' },
      { label: 'Rondas', value: '1 de 2 cerradas' },
      { label: 'Mejor ronda (bruto)', value: '70 · Beto (R2)' },
    ]);
  });

  it('cerrada la última ronda (la de la pantalla), el torneo terminó', () => {
    expect(report({ ...r2, closed: true }).final).toBe(true);
  });
});
