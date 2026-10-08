/**
 * Piezas nuevas del rediseño «Calma y foco» de las pantallas de equipos: los textos (./view.ts), qué partidos salen en el
 * inicio y en «Partidos», y las piezas de ./TeamUi.tsx y ./AdminParts.tsx dibujadas sin navegador (renderToString).
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { Match, MatchSide } from '../../../lib/data/matches';
import type { SeasonTeam } from '../../../lib/data/seasonTeams';
import { FeedbackProvider } from '../../../components/feedback';
import { TemplateRows, ToggleRow } from './AdminParts';
import { defaultGamesFilter, filterGames } from './GamesList';
import { homeMatches } from './TeamHome';
import { MineTag, Scoreboard, StatTiles, TableTop, TeamCrest, matchHeading, sideNames, type TableTopRow } from './TeamUi';
import type { TeamLeague } from './useTeamLeague';
import { matchDayLabel, matchTime, matchWhen, recordLine, resultLine, rowWhen as rowWhenRaw, rsvpLine, scoreShort, todayIn, vsTitle } from './view';

const tz = 'America/Santo_Domingo';
// Sábado 10 de octubre de 2026, 7:00 pm en Santo Domingo (UTC−4).
const sat = '2026-10-10T23:00:00.000Z';

const sides = (a: string, b: string, la = 'Tigres', lb = 'Leones'): [MatchSide, MatchSide] => [
  { side: 1, teamId: a, label: la, seed: null, players: [] },
  { side: 2, teamId: b, label: lb, seed: null, players: [] },
];
function match(id: string, p: Partial<Match>): Match {
  return {
    id,
    leagueId: 'l1',
    eventId: null,
    round: 3,
    stage: '',
    bracketKey: null,
    court: 'Cancha 1',
    scheduledAt: sat,
    status: 'scheduled',
    format: 'fiba',
    requireConfirm: true,
    score: null,
    winner: null,
    walkoverSide: null,
    scorerId: null,
    leaseUntil: null,
    seq: 0,
    version: 0,
    proposedBy: null,
    proposedAt: null,
    proposedSide: null,
    confirmedBy: null,
    confirmedAt: null,
    disputedBy: null,
    disputedAt: null,
    disputeNote: null,
    note: null,
    createdBy: null,
    sides: sides('T1', 'T2'),
    createdAt: null,
    updatedAt: null,
    ...p,
  };
}

const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<style[^>]*>.*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const render = (el: ReactElement) => renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, el)));

describe('textos de las pantallas de equipos', () => {
  it('el día con el mes (nunca «MAR 13»), la hora como «7:00 pm», hoy y mañana', () => {
    const today = '2026-10-07';
    expect(matchTime(sat, tz)).toBe('7:00 pm');
    expect(matchDayLabel(sat, tz, today)).toBe('Sáb 10 oct');
    expect(matchDayLabel(sat, tz, today, true)).toBe('Sábado 10 oct');
    expect(matchDayLabel(sat, tz, '2026-10-10')).toBe('Hoy');
    expect(matchDayLabel(sat, tz, '2026-10-09')).toBe('Mañana');
    expect(matchDayLabel(sat, tz, '2027-01-01')).toBe('Sáb 10 oct 2026');
    expect(matchWhen(sat, tz, today)).toBe('Sáb 10 oct · 7:00 pm');
    expect(matchWhen(null, tz, today)).toBe('Sin fecha');
    expect(todayIn(tz, Date.parse('2026-10-08T02:00:00Z'))).toBe('2026-10-07');
  });

  it('la línea de una fila con su bloque de fecha: el día de la semana, la hora y la jornada (o «Aplazado»)', () => {
    const m = match('a', {});
    // La hora y la jornada no se parten al final de una línea (espacio duro); aquí se comparan con espacio normal.
    const rowWhen = (...a: Parameters<typeof rowWhenRaw>) => rowWhenRaw(...a).replace(/\u00a0/g, ' ');
    expect(rowWhenRaw(m, tz, '2026-10-07')).toBe('Sábado · 7:00\u00a0pm · Jornada\u00a03');
    expect(rowWhen(m, tz, '2026-10-07')).toBe('Sábado · 7:00 pm · Jornada 3');
    expect(rowWhen(m, tz, '2026-10-10', 'Jornada', true)).toBe('Hoy · 7:00 pm · Jornada 3 · Cancha 1');
    expect(rowWhen(m, tz, '2026-10-07', 'Jornada', false, false)).toBe('Sábado · 7:00 pm');
    expect(rowWhen({ ...m, status: 'postponed' }, tz, '2026-10-07')).toBe('Aplazado · Jornada 3');
    expect(rowWhen({ ...m, scheduledAt: null, stage: 'Final' }, tz, '2026-10-07')).toBe('Sin fecha · Final');
  });

  it('vs., la marca de un equipo y el marcador corto', () => {
    expect(vsTitle(['Tigres', 'Leones'])).toBe('Tigres vs. Leones');
    expect(recordLine({ won: 2, lost: 1 })).toBe('2-1');
    expect(recordLine({ won: 2, drawn: 1, lost: 0, diff: 3 }, true)).toBe('2-1-0 · +3');
    expect(recordLine({ won: 0, drawn: 0, lost: 2, diff: -4 }, true)).toBe('0-0-2 · -4');
    expect(scoreShort({ score: { text: '72-65', sides: [72, 65] } })).toBe('72–65');
    expect(scoreShort({ score: { text: '1-1 pen 4-3' } })).toBe('1–1');
    expect(scoreShort({ score: null })).toBeNull();
  });

  it('cómo va la convocatoria y qué pasó en el partido', () => {
    const sum = (yes: number, maybe = 0, no = 0) => ({ yes: Array(yes).fill('p'), maybe: Array(maybe).fill('p'), no: Array(no).fill('p'), none: [] });
    expect(rsvpLine(sum(0), 5)).toBe('Nadie ha respondido');
    expect(rsvpLine(sum(1), 5)).toBe('1 va · faltan 4');
    expect(rsvpLine(sum(3, 2), 5)).toBe('3 van · 2 tal vez · faltan 2');
    expect(rsvpLine(sum(6), 5)).toBe('6 van · listos');
    const names: [string, string] = ['Tigres', 'Leones'];
    expect(resultLine({ status: 'confirmed', winner: 1, walkoverSide: null, proposedAt: null }, names)).toBe('Ganó Tigres');
    expect(resultLine({ status: 'confirmed', winner: null, walkoverSide: null, proposedAt: null }, names)).toBe('Empate');
    expect(resultLine({ status: 'walkover', winner: 1, walkoverSide: 2, proposedAt: null }, names)).toBe('W.O.: no vino Leones');
    expect(resultLine({ status: 'disputed', winner: 2, walkoverSide: null, proposedAt: null }, names)).toBe('En disputa');
    const now = Date.parse('2026-10-08T12:00:00Z');
    expect(resultLine({ status: 'finished', winner: 2, walkoverSide: null, proposedAt: '2026-10-08T10:00:00Z' }, names, now)).toBe('Ganó Leones · por confirmar');
    expect(resultLine({ status: 'scheduled', winner: null, walkoverSide: null, proposedAt: null }, names)).toBeNull();
    expect(matchHeading({ stage: '', round: 3 })).toBe('Jornada 3');
    expect(matchHeading({ stage: 'Final', round: null })).toBe('Final');
    expect(matchHeading({ stage: '', round: null })).toBe('Partido');
  });
});

describe('qué partidos salen', () => {
  const now = Date.parse('2026-10-08T12:00:00Z');
  const live = match('live', { status: 'live', round: 2, scheduledAt: '2026-10-08T11:30:00Z', sides: sides('T3', 'T4') });
  const mine = match('mine', { round: 3, sides: sides('T1', 'T2') });
  const other = match('other', { round: 3, scheduledAt: '2026-10-11T00:30:00Z', sides: sides('T3', 'T4') });
  const later = match('later', { round: 4, scheduledAt: '2026-10-17T23:00:00Z', sides: sides('T2', 'T3') });
  const done1 = match('d1', { round: 1, status: 'confirmed', winner: 1, scheduledAt: '2026-09-26T23:00:00Z', score: { text: '70-60', sides: [70, 60] } });
  const done2 = match('d2', { round: 2, status: 'walkover', winner: 2, walkoverSide: 1, scheduledAt: '2026-10-03T23:00:00Z' });
  const voided = match('v', { round: 2, status: 'void', scheduledAt: '2026-10-03T23:00:00Z' });
  const all = [live, mine, other, later, done1, done2, voided];

  it('el inicio: lo en vivo, mi próximo (una sola vez), los próximos sin repetirlo y los últimos resultados primero', () => {
    const h1 = homeMatches(all, ['T1'], now);
    expect(h1.live.map((m) => m.id)).toEqual(['live']);
    expect(h1.next?.id).toBe('mine');
    expect(h1.upcoming.map((m) => m.id)).toEqual(['other', 'later']);
    expect(h1.results.map((m) => m.id)).toEqual(['d2', 'd1']);
    // Sin equipo: no hay «Tu próximo partido» y los próximos los traen todos.
    const h2 = homeMatches(all, [], now, { upcoming: 2 });
    expect(h2.next).toBeNull();
    expect(h2.upcoming.map((m) => m.id)).toEqual(['mine', 'other']);
  });

  it('«Partidos»: por jugar, lo ya jugado (también anulado y W.O.) y los de mi equipo; entra en lo que viene', () => {
    expect(filterGames(all, 'proximos', []).map((m) => m.id)).toEqual(['mine', 'other', 'later']);
    expect(filterGames(all, 'resultados', []).map((m) => m.id)).toEqual(['d1', 'd2', 'v']);
    expect(filterGames(all, 'mios', ['T2']).map((m) => m.id)).toEqual(['mine', 'later', 'd1', 'd2', 'v']);
    expect(defaultGamesFilter(all)).toBe('proximos');
    expect(defaultGamesFilter([done1, done2])).toBe('resultados');
  });
});

describe('piezas', () => {
  const team = (id: string, name: string, color: string, order: number): SeasonTeam => ({ id, leagueId: 'l1', name, color, order, roster: [], createdAt: null, updatedAt: null });
  const teams = [team('T1', 'Tigres', '#f97316', 1), team('T2', 'Leones', '#1e3a8a', 2)];
  const tl = { teamOf: (id: string | null | undefined) => teams.find((t) => t.id === id) ?? null } as unknown as TeamLeague;

  it('el escudo de un equipo: su color con la inicial y la letra que se lee', () => {
    const html = renderToString(h(TeamCrest, { team: teams[1] }));
    expect(html).toContain('>L<');
    expect(html).toContain('background:#1e3a8a');
    expect(html).toContain('color:#ffffff');
    expect(renderToString(h(TeamCrest, { team: null, label: 'águilas' }))).toContain('>Á<');
    expect(text(renderToString(h(MineTag)))).toBe('Tu equipo');
  });

  it('el marcador grande: el ganador con copa, «Tu equipo» y los nombres del partido si el equipo se borró', () => {
    const m = match('m', { status: 'confirmed', winner: 1, score: { text: '72-65', sides: [72, 65] } });
    const html = render(h(Scoreboard, { tl, match: m, mySide: 2 }));
    const t = text(html);
    expect(t).toContain('Tigres');
    expect(t).toContain('72');
    expect(t).toContain('Leones Tu equipo');
    expect(t).toContain('65');
    expect(html).toContain('aria-label="Ganó"');
    const gone = { ...m, sides: sides('X1', 'T2', 'Borrados FC', 'Leones') };
    expect(sideNames(tl, gone)).toEqual(['Borrados FC', 'Leones']);
    expect(text(render(h(Scoreboard, { tl, match: match('n', {}), mySide: null })))).toContain('–');
    // Fútbol con penales: el número grande son los goles.
    const pens = match('p', { status: 'confirmed', winner: 1, score: { text: '1-1 pen 4-3', sides: [1, 1] } });
    expect(text(render(h(Scoreboard, { tl, match: pens, mySide: null })))).not.toContain('4');
  });

  it('los números de un jugador: de 2 en 2 en Lite, de 4 en 4 en Pro', () => {
    const items = [
      { label: 'Partidos', value: 3 },
      { label: 'Puntos', value: 54 },
      { label: 'Por partido', value: '18,0' },
      { label: 'Máximo', value: 24 },
    ];
    const lite = renderToString(h(StatTiles, { items }));
    expect(lite).toContain('grid-cols-2');
    expect(lite).toContain('text-stat');
    expect(text(lite)).toBe('3 Partidos 54 Puntos 18,0 Por partido 24 Máximo');
    expect(renderToString(h(StatTiles, { items, dense: true }))).toContain('grid-cols-4');
  });

  it('plantillas de reglas como filas (✓ y «En uso» la que se usa) y los sí/no como filas de 48 px', () => {
    const templates = [
      { id: 'fiba' as const, name: 'Liga FIBA', description: '4 cuartos de 10' },
      { id: '3x3' as const, name: '3x3', description: 'A 21 puntos' },
    ];
    const html = render(h(TemplateRows, { templates, active: 'fiba', busy: () => false, onPick: () => undefined, footer: 'Ahora: FIBA.' }));
    const t = text(html);
    expect(t).toContain('Liga FIBA · En uso');
    expect(t).toContain('3x3');
    expect(t).toContain('Ahora: FIBA.');
    expect(html).toContain('aria-label="Usar 3x3"');
    const toggle = renderToString(h(ToggleRow, { checked: true, onChange: () => undefined, children: 'Reloj corrido' }));
    expect(toggle).toContain('min-h-12');
    expect(toggle).toContain('checked=""');
  });

  it('la tabla de arriba del inicio: puesto, escudo, marca y puntos; tu equipo resaltado; «Ver toda» a la Tabla', () => {
    const rows: TableTopRow[] = [
      { id: 'T2', rank: 1, points: 4, line: recordLine({ won: 2, lost: 0 }) },
      { id: 'T1', rank: 2, points: 3, line: recordLine({ won: 1, lost: 1 }) },
    ];
    const html = render(h(TableTop, { tl: { ...tl, base: '/l/l1' } as TeamLeague, rows, mine: ['T1'], footer: 'Máximo anotador: Ana' }));
    const t = text(html);
    expect(t).toContain('Tabla Ver toda');
    expect(t).toContain('1 L Leones 2-0 4');
    expect(t).toContain('2 T Tigres Tu equipo 1-1 3');
    expect(t).toContain('Máximo anotador: Ana');
    expect(html).toContain('href="/l/l1/ranking"');
    expect(html).toContain('mm-row-me');
    expect(render(h(TableTop, { tl, rows: [], mine: [] }))).toBe(render(h('span')).replace('<span></span>', ''));
  });
});
