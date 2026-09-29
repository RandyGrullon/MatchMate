import type { GolfCardDoc, GolfRoundFull } from '../data/golf';
import { num } from '../format';
import { formatLabel, nineLabel, roundBoard, thruText, toParText, tournamentBoard, type BoardRow } from '../../pages/sports/golf/logic';
import { golfComp, golfDivisionCompetition, golfProvider } from '../../prizes/sports';
import type { PodiumProvider } from '../../prizes/providers';
import type { GolfCompetition, RoundScore } from '../../sports/golf/scoring';
import { numCol } from './matches';
import { podiumsFrom, reportHeader, type ReportCell, type ReportColumn, type ReportFact, type ReportLeague, type ReportRow, type ReportTable, type TournamentReport } from './model';

/**
 * El reporte del golf (GolfEvent), con los leaderboards de la app (`roundBoard`, `tournamentBoard`) y los podios de
 * los premios (`golfProvider`: la competencia oficial, gross y neto). Una ronda suelta es su propio torneo; una ronda
 * de un torneo de varias rondas reporta el torneo entero (como los premios).
 * - General: campeones, el leaderboard oficial (con cada ronda en un torneo) y lo destacado;
 * - Individual: la tarjeta de cada jugador, hoyo por hoyo, en cada ronda (acostada).
 * El golf no tenía Excel: las hojas «General» e «Individual» son todo.
 */

export interface GolfReportInput {
  lid: string;
  league: ReportLeague;
  event: { id: string; name: string; date: string };
  /** El nombre de la ronda en pantalla. */
  title: string;
  /** La ronda en pantalla y sus tarjetas, con lo último (también lo anotado en este teléfono). */
  round: GolfRoundFull;
  cards: readonly GolfCardDoc[];
  /** El torneo de la ronda (sus rondas con sus tarjetas y los días de cada una), si es de un torneo. */
  tournament?: { id: string; name: string; rounds: readonly GolfRoundFull[]; cards: readonly GolfCardDoc[]; dates: readonly string[] } | null;
  nameOf: (playerId: string) => string;
}

/** «−2 · 70 netos», «+3 · 75 golpes» o «36 pts»: el resultado con el que se ordena. */
function resultText(r: Pick<BoardRow, 'points' | 'gross' | 'net' | 'toPar' | 'netToPar' | 'thru'>, comp: GolfCompetition): string | undefined {
  if (!r.thru) return undefined;
  if (comp.format === 'stableford') return `${num(r.points)} pts`;
  const net = comp.basis === 'net';
  const strokes = net ? r.net : r.gross;
  const par = toParText(net ? r.netToPar : r.toPar);
  return strokes == null ? par : `${par} · ${num(strokes)} ${net ? 'netos' : 'golpes'}`;
}

/** Por qué no tiene puesto (o qué decidió el empate). */
function statusOf(r: BoardRow): string | null {
  if (r.unfinished) return 'No terminó';
  if (r.dq) return r.card?.dq ? 'Descalificado' : 'Recogió';
  return r.decidedBy ? `Desempate: ${r.decidedBy}` : null;
}

/** Lo de una ronda en la columna de su ronda: puntos en Stableford; si no, neto o bruto. */
const roundCell = (s: RoundScore | null, comp: GolfCompetition): ReportCell => {
  if (!s || !s.thru) return null;
  if (comp.format === 'stableford') return s.points;
  return (comp.basis === 'net' ? s.net : s.gross) ?? null;
};

export function golfReport(input: GolfReportInput): TournamentReport {
  const { lid, league, round, nameOf } = input;
  const tid = round.tournamentId;
  const t = tid && input.tournament?.id === tid ? input.tournament : null;
  // La ronda en pantalla va con lo último; las otras rondas del torneo, como vienen del servidor.
  const rounds = (t ? t.rounds.map((r) => (r.eventId === round.eventId ? round : r)) : [round]).slice().sort((a, b) => (a.roundNo ?? 0) - (b.roundNo ?? 0));
  if (!rounds.some((r) => r.eventId === round.eventId)) rounds.push(round);
  const cards = t ? [...t.cards.filter((c) => c.eventId !== round.eventId), ...input.cards] : [...input.cards];
  const multi = !!tid;
  const src = { rounds, cards };
  const final = rounds.every((r) => r.closed);

  // El leaderboard de cada división, con la misma cuenta del premio (`golfPrizeBoard`) pero con las filas completas.
  const compOf = (division: string) => golfDivisionCompetition(rounds[0].competition, division);
  const boards = new Map<string, BoardRow[]>();
  const board = (division: string): BoardRow[] => {
    let b = boards.get(division);
    if (!b) {
      const ids = new Set(rounds.map((r) => r.eventId));
      const mine = cards.filter((c) => ids.has(c.eventId));
      b = multi ? tournamentBoard(rounds, mine, compOf(division)) : roundBoard(round, mine, compOf(division));
      boards.set(division, b);
    }
    return b;
  };

  // Los podios de los premios, con el resultado de cada uno.
  const base = golfProvider(src, nameOf);
  const provider: PodiumProvider = (slot) => {
    const r = base(slot);
    if (!r) return r;
    const rows = board(slot.division);
    return {
      ...r,
      units: r.units.map((u) => {
        const row = rows.find((x) => `p:${x.id}` === u.ref);
        const detail = row ? resultText(row, compOf(slot.division)) : undefined;
        return detail ? { ...u, detail } : u;
      }),
    };
  };
  const comp = golfComp(lid, { eventId: input.event.id, tournamentId: tid, name: t ? t.name : input.event.name, date: input.event.date });
  const title = multi ? comp.name : input.title;

  const courses = [...new Set(rounds.map((r) => r.courseName).filter(Boolean))];
  const facts: ReportFact[] = [
    ...(courses.length ? [{ label: courses.length === 1 ? 'Campo' : 'Campos', value: courses.join(', ') }] : []),
    {
      label: 'Formato',
      value: [formatLabel(rounds[0].competition), multi ? `${num(rounds.length)} ${rounds.length === 1 ? 'ronda' : 'rondas'}` : nineLabel(round.nine, round.holes), round.shotgun ? 'salida simultánea' : null]
        .filter(Boolean)
        .join(' · '),
    },
  ];

  // General: el leaderboard oficial (en un torneo, con la columna de cada ronda).
  const main = compOf('');
  const stableford = main.format === 'stableford';
  const net = main.basis === 'net';
  const rows = board('');
  const leaderboard: ReportTable = {
    title: multi ? `Leaderboard del torneo · ${formatLabel(main)}` : `Leaderboard · ${formatLabel(main)}`,
    note: stableford
      ? 'Resultado: puntos Stableford. Bruto y Neto: golpes.'
      : `Resultado: ${net ? 'golpes netos' : 'golpes'} contra el par (E = par). Empates: countback (últimos 9, 6, 3 y 1 hoyos).`,
    columns: [
      { label: 'Lugar', align: 'center', place: true, width: 7 },
      { label: 'Jugador', width: 28 },
      ...(multi ? rounds.map((r, i) => numCol(`R${r.roundNo ?? i + 1}`, { width: 7 })) : []),
      numCol('Resultado', { strong: true, width: 11 }),
      numCol('Bruto'),
      numCol('Neto'),
      ...(stableford ? [] : [numCol('Pts', { width: 7 })]),
      numCol('Hcp', { width: 7 }),
      numCol('Hoyos', { width: 7 }),
      { label: 'Nota', width: 22 },
    ],
    rows: rows.map((r): ReportRow => {
      const holes = multi ? rounds.reduce((n, x) => n + x.holes, 0) : round.holes;
      return [
        r.rank,
        nameOf(r.id),
        ...(multi ? rounds.map((_, i) => roundCell(r.rounds[i] ?? null, main)) : []),
        !r.thru ? null : stableford ? r.points : toParText(net ? r.netToPar : r.toPar),
        r.gross,
        r.net,
        ...(stableford ? [] : [r.thru ? r.points : null]),
        r.card?.playingHcp ?? null,
        thruText(multi ? r.holesPlayed : r.thru, holes),
        statusOf(r),
      ];
    }),
    empty: 'Todavía no hay inscritos.',
  };

  // Lo destacado: jugadores y la mejor ronda en bruto (completa).
  const played = new Set(cards.filter((c) => c.strokes.some((s) => s != null)).map((c) => c.playerId));
  let best: { gross: number; who: string[] } | null = null;
  for (const r of rounds) {
    for (const row of roundBoard(r, cards.filter((c) => c.eventId === r.eventId), { format: 'stroke', basis: 'gross', allowance: 100 })) {
      const s = row.rounds[0];
      if (!s?.complete || s.gross == null || row.dq) continue;
      const label = multi ? `${nameOf(row.id)} (R${r.roundNo ?? 1})` : nameOf(row.id);
      if (!best || s.gross < best.gross) best = { gross: s.gross, who: [label] };
      else if (s.gross === best.gross) best.who.push(label);
    }
  }
  const highlights: ReportFact[] = [
    { label: 'Jugadores', value: num(played.size) },
    ...(multi ? [{ label: 'Rondas', value: `${num(rounds.filter((r) => r.closed).length)} de ${num(rounds.length)} cerradas` }] : []),
    ...(best ? [{ label: 'Mejor ronda (bruto)', value: `${num(best.gross)} · ${best.who.slice(0, 3).join(', ')}${best.who.length > 3 ? ` y ${best.who.length - 3} más` : ''}` }] : []),
  ];

  // Individual: la tarjeta de cada jugador en cada ronda, hoyo por hoyo (en el orden del leaderboard de la ronda).
  const individual = rounds.map((r) => cardTable(r, cards.filter((c) => c.eventId === r.eventId), nameOf, multi));

  return {
    // El campo de la ronda dice más que el de la liga (va en su lugar).
    ...reportHeader(courses.length ? { ...league, venue: '' } : league, { title, dates: t && t.dates.length ? t.dates : input.event.date, facts }),
    final,
    notes: final ? [] : [multi ? 'Faltan rondas por cerrar: el leaderboard puede cambiar.' : 'La ronda todavía no se cierra: el leaderboard puede cambiar.'],
    podiums: podiumsFrom({ kind: 'golf' }, provider),
    prizes: [],
    highlights,
    general: [leaderboard],
    individual,
    individualLandscape: true,
    sheets: [],
  };
}

/** Las tarjetas de una ronda: golpes por hoyo (– = recogió), ida y vuelta, bruto, handicap, neto, puntos y putts. */
function cardTable(r: GolfRoundFull, cards: readonly GolfCardDoc[], nameOf: (id: string) => string, multi: boolean): ReportTable {
  const rows = roundBoard(r, cards, r.competition);
  const holes = rows.find((x) => x.rounds[0])?.rounds[0]?.holes ?? [];
  const numbers = holes.length ? holes.map((h) => h.number) : Array.from({ length: r.holes }, (_, i) => i + 1 + (r.nine === 'back' ? 9 : 0));
  const split = numbers.length === 18;
  const sum = (xs: readonly (number | null)[]) => (xs.length && xs.every((x) => x != null) ? xs.reduce<number>((a, b) => a + (b ?? 0), 0) : null);
  // La fila del par, si todas las tarjetas juegan los mismos pares (salidas de par distinto: cada una el suyo).
  const pars = rows.map((x) => x.rounds[0]?.holes.map((h) => h.par).join(',') ?? '').filter(Boolean);
  const samePar = pars.length > 0 && pars.every((p) => p === pars[0]) && holes.length > 0;
  const columns: ReportColumn[] = [
    { label: '#', align: 'center', place: true, width: 5 },
    { label: 'Jugador', width: 26 },
    { label: 'Salida', width: 12, only: 'excel' },
    ...numbers.map((n) => ({ label: String(n), align: 'center' as const, width: 5 })),
    ...(split ? [numCol('Ida', { width: 6 }), numCol('Vta', { width: 6 })] : []),
    numCol('Bruto', { strong: r.competition.basis === 'gross' && r.competition.format !== 'stableford' }),
    numCol('Hcp', { width: 6 }),
    numCol('Neto', { strong: r.competition.basis === 'net' && r.competition.format !== 'stableford' }),
    numCol('Pts', { strong: r.competition.format === 'stableford', width: 6 }),
    numCol('Putts', { width: 7 }),
  ];
  const body: ReportRow[] = [];
  if (samePar) {
    const p = holes.map((h) => h.par);
    body.push({
      cells: [null, 'Par', null, ...p, ...(split ? [sum(p.slice(0, 9)), sum(p.slice(9))] : []), sum(p), null, null, null, null],
      strong: true,
    });
  }
  for (const x of rows) {
    const s = x.rounds[0];
    const tee = r.course.tees.find((tt) => tt.id === x.card?.teeId)?.name ?? null;
    if (!s || !s.thru) {
      body.push([x.rank, nameOf(x.id), tee, ...numbers.map(() => null), ...(split ? [null, null] : []), null, x.card?.playingHcp ?? null, null, null, null]);
      continue;
    }
    const strokes = s.holes.map((h) => (h.pickedUp ? '–' : h.strokes));
    const nums = s.holes.map((h) => (h.pickedUp ? null : h.strokes));
    body.push([
      x.rank,
      nameOf(x.id) + (statusOf(x) && !x.decidedBy ? ` (${statusOf(x)})` : ''),
      tee,
      ...strokes,
      ...(split ? [sum(nums.slice(0, 9)), sum(nums.slice(9))] : []),
      s.gross,
      s.playingHcp,
      s.net,
      s.points,
      s.putts,
    ]);
  }
  return {
    title: `${multi ? `Ronda ${r.roundNo ?? 1}` : 'Tarjetas'} · ${r.courseName} · ${nineLabel(r.nine, r.holes)}`,
    note: `${formatLabel(r.competition)}. Golpes por hoyo (– = recogió). Hcp: el de juego.`,
    columns,
    rows: body,
    empty: 'Todavía no hay tarjetas.',
  };
}
