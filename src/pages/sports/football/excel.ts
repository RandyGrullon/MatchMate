import type { SheetData } from 'write-excel-file/browser';
import { compareMatches, hasResult, type Match } from '../../../lib/data/matches';
import { statusInfo, whenText } from '../../../components/match/format';
import { pensFromScore } from './adapter';
import { REASON_TEXT } from './rules';
import type { FootballSeason } from './season';

const head = (labels: string[]) => labels.map((value) => ({ value, fontWeight: 'bold' as const, backgroundColor: '#E8E7FB' }));

export interface FootballExcelInput {
  leagueName: string;
  matches: readonly Match[];
  season: FootballSeason;
  teamName: (teamKey: string) => string;
  playerName: (playerId: string) => string;
  tz: string;
  now?: number;
}

const sideName = (m: Match, i: 0 | 1, teamName: (id: string) => string) => (m.sides[i].teamId ? teamName(m.sides[i].teamId!) : m.sides[i].label);

type Sheet = { data: SheetData; sheet: string; columns: { width: number }[]; stickyRowsCount: number };

/** Hojas del Excel de la liga: calendario (con resultados y penales), tabla, goleadores, tarjetas y disciplina. Puro. */
export function footballSheets(input: FootballExcelInput): Sheet[] {
  const { matches, season, teamName, playerName, tz } = input;
  const now = input.now ?? Date.now();
  const sorted = [...matches].sort(compareMatches);

  const schedule: SheetData = [head(['Jornada', 'Fase', 'Fecha y hora', 'Cancha', 'Local', 'Goles local', 'Goles visita', 'Visita', 'Penales', 'Estado'])];
  for (const m of sorted) {
    const sides = hasResult(m) && Array.isArray(m.score?.sides) ? m.score!.sides! : [undefined, undefined];
    const pens = pensFromScore(m.score);
    schedule.push([
      { value: m.round ?? undefined },
      { value: m.stage || '' },
      { value: whenText(m.scheduledAt, tz) ?? 'Sin fecha' },
      { value: m.court || '' },
      { value: sideName(m, 0, teamName) },
      { value: sides[0] },
      { value: sides[1] },
      { value: sideName(m, 1, teamName) },
      { value: pens ? `${pens[0]}-${pens[1]}` : '' },
      { value: m.status === 'walkover' ? 'W.O.' : statusInfo(m, now).label },
    ]);
  }

  const table: SheetData = [head(['Grupo', 'Puesto', 'Equipo', 'PJ', 'G', 'E', 'P', 'GF', 'GC', 'Dif.', 'Pts', 'Juego limpio', 'Desempate'])];
  const tables = season.groups.length ? season.groups : [{ stage: '', rows: season.standings }];
  for (const g of tables) {
    for (const r of g.rows) {
      table.push([
        { value: g.stage },
        { value: r.rank },
        { value: teamName(r.id) },
        { value: r.played },
        { value: r.won },
        { value: r.drawn },
        { value: r.lost },
        { value: r.for },
        { value: r.against },
        { value: r.diff },
        { value: r.points, fontWeight: 'bold' as const },
        { value: r.extra.fairPlay ?? 0 },
        { value: r.decidedBy && r.decidedBy !== 'puntos' ? r.decidedBy : '' },
      ]);
    }
  }

  const scorers: SheetData = [head(['Puesto', 'Jugador', 'Equipo', 'PJ', 'Goles', 'Asistencias', 'Autogoles', 'Portero: PJ', 'Vallas invictas', 'Goles recibidos'])];
  season.scorers.forEach((l, i) => {
    scorers.push([
      { value: i + 1 },
      { value: playerName(l.player) },
      { value: teamName(l.team) },
      { value: l.games },
      { value: l.goals, fontWeight: 'bold' as const },
      { value: l.assists },
      { value: l.ownGoals },
      { value: l.keeperGames },
      { value: l.cleanSheets },
      { value: l.conceded },
    ]);
  });

  const cards: SheetData = [head(['Jugador', 'Equipo', 'Amarillas', 'Doble amarilla', 'Rojas directas', 'Juego limpio'])];
  for (const c of season.cards) {
    cards.push([
      { value: playerName(c.player) },
      { value: teamName(c.team) },
      { value: c.yellows },
      { value: c.secondYellows },
      { value: c.reds },
      { value: c.fairPlay },
    ]);
  }

  const byId = new Map(matches.map((m) => [m.id, m] as const));
  const matchText = (id: string) => {
    const m = byId.get(id);
    if (!m) return '';
    return `${m.round != null ? `J${m.round} ` : ''}${sideName(m, 0, teamName)} vs. ${sideName(m, 1, teamName)}`;
  };
  const discipline: SheetData = [head(['Jugador', 'Equipo', 'Motivo', 'Partido', 'Partidos de suspensión', 'Cumplidos', 'Le faltan', 'Nota'])];
  for (const s of season.discipline.sanctions) {
    discipline.push([
      { value: playerName(s.player) },
      { value: teamName(s.team) },
      { value: REASON_TEXT[s.reason] ?? s.reason },
      { value: matchText(s.matchId) },
      { value: s.matches },
      { value: s.served.length },
      { value: s.remaining, fontWeight: s.remaining > 0 ? ('bold' as const) : undefined },
      { value: s.note ?? '' },
    ]);
  }
  if (season.discipline.violations.length) {
    discipline.push([]);
    discipline.push(head(['Jugó suspendido', 'Equipo', 'Partido']));
    for (const v of season.discipline.violations) discipline.push([{ value: playerName(v.player) }, { value: teamName(v.team) }, { value: matchText(v.matchId) }]);
  }

  return [
    { sheet: 'Calendario', stickyRowsCount: 1, columns: [{ width: 9 }, { width: 14 }, { width: 24 }, { width: 16 }, { width: 24 }, { width: 8 }, { width: 8 }, { width: 24 }, { width: 10 }, { width: 14 }], data: schedule },
    { sheet: 'Tabla', stickyRowsCount: 1, columns: [{ width: 10 }, { width: 8 }, { width: 26 }, ...Array.from({ length: 8 }, () => ({ width: 7 })), { width: 12 }, { width: 26 }], data: table },
    { sheet: 'Goleadores', stickyRowsCount: 1, columns: [{ width: 8 }, { width: 28 }, { width: 24 }, ...Array.from({ length: 7 }, () => ({ width: 11 }))], data: scorers },
    { sheet: 'Tarjetas', stickyRowsCount: 1, columns: [{ width: 28 }, { width: 24 }, ...Array.from({ length: 4 }, () => ({ width: 12 }))], data: cards },
    { sheet: 'Disciplina', stickyRowsCount: 1, columns: [{ width: 28 }, { width: 24 }, { width: 22 }, { width: 32 }, { width: 12 }, { width: 11 }, { width: 11 }, { width: 30 }], data: discipline },
  ];
}

/** Descarga el Excel de la liga de fútbol o sala. */
export async function exportFootballExcel(input: FootballExcelInput) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const date = new Date().toISOString().slice(0, 10);
  await writeExcelFile(footballSheets(input)).toFile(`${input.leagueName} - ${date}.xlsx`);
}
