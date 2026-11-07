import { describe, expect, it } from 'vitest';
import { singleEliminationPlan, groupsPlan, roundRobinPlan } from '../../../../sports/esports';
import { mkBrGame, mkEntry, mkMatch, mkMember, mkTournament } from '../testData';
import {
  STATUS_CHANGE,
  agentUserOf,
  assignRoleFor,
  brClash,
  brInitialRows,
  brSheetTitle,
  brSlotRanges,
  checkinMissing,
  createStageLabel,
  editInitial,
  editTournamentErrors,
  editTournamentPatch,
  entryAdminItems,
  entryNameOk,
  formedTeamsCount,
  moveSeed,
  organizerMenu,
  planPreview,
  seedFromInput,
  seriesAdminMenu,
  stageIntro,
  teamsWithRoom,
  tryPlan,
  walkoverOptions,
} from './logic';

const TZ = 'America/Santo_Domingo';

describe('el «•••» del torneo', () => {
  const base = { hasStage: false, approved: 4, freeAgents: 0, individual: false, redoable: false };
  it('en la inscripción sin fases: editar (con el formato), sembrar, armar el cuadro, el logo y cancelar', () => {
    const keys = organizerMenu(mkTournament({ format: 'single_elim' }), base).map((i) => i.key);
    expect(keys).toEqual(['editar', 'sembrar', 'cuadro', 'logo', 'cancelar']);
    expect(organizerMenu(mkTournament(), base)[0].hint).toBe('También el formato');
  });
  it('en curso: rehacer (sin resultados), cerrar y cancelar; los agentes libres en «Libre»', () => {
    const t = mkTournament({ status: 'live', entryType: 'open' });
    const keys = organizerMenu(t, { ...base, hasStage: true, redoable: true, freeAgents: 2 }).map((i) => i.key);
    expect(keys).toEqual(['editar', 'agentes', 'rehacer', 'logo', 'cerrar', 'cancelar']);
  });
  it('battle royale: los anotadores; cancelado: volver a abrir', () => {
    const t = mkTournament({ game: 'free_fire', mode: 'squad', format: 'br', status: 'cancelled' });
    expect(organizerMenu(t, base).map((i) => i.key)).toEqual(['editar', 'anotadores', 'logo', 'reabrir']);
    expect(STATUS_CHANGE.registration.ask).toBeNull();
    expect(STATUS_CHANGE.cancelled.ask?.danger).toBe(true);
  });
});

describe('armar el cuadro', () => {
  it('el error del motor en palabras', () => {
    expect(tryPlan(() => { throw new Error('Pocos inscritos.'); })).toEqual({ plan: null, error: 'Pocos inscritos.' });
  });
  it('los que no hicieron check-in (solo si el torneo lo pide)', () => {
    const entries = [mkEntry('A', 'Equipo Uno', { checkedInAt: '2026-01-01T00:00:00Z' }), mkEntry('B', 'Equipo Dos'), mkEntry('C', 'Equipo Tres', { status: 'pending' })];
    expect(checkinMissing(mkTournament({ checkinMinutes: 30 }), entries).map((e) => e.id)).toEqual(['B']);
    expect(checkinMissing(mkTournament(), entries)).toEqual([]);
  });
  it('los textos del paso', () => {
    expect(stageIntro('single_elim', 1)).toContain('1 inscrito, por siembra.');
    expect(createStageLabel('groups_playoffs')).toBe('Crear los grupos');
    expect(createStageLabel('round_robin')).toBe('Crear los partidos');
  });
  it('la vista previa: cuadro, liga y grupos', () => {
    expect(planPreview(singleEliminationPlan(['A', 'B', 'C', 'D'], { thirdPlace: false, bestOf: 1, finalBestOf: 1, kind: 'bracket' })).kind).toBe('bracket');
    const league = planPreview(roundRobinPlan(['A', 'B', 'C'], { double: false, bestOf: 1 }));
    expect(league).toEqual({ kind: 'league', text: '3 series en 3 jornadas.' });
    const groups = planPreview(groupsPlan(['A', 'B', 'C', 'D'], { groups: 2, double: false, bestOf: 1 }));
    expect(groups.kind).toBe('groups');
    if (groups.kind === 'groups') expect(groups.groups.map((g) => g.ids.length)).toEqual([2, 2]);
  });
});

describe('siembra, agentes libres e inscritos', () => {
  it('sube y baja sin salirse de la lista', () => {
    expect(moveSeed(['A', 'B', 'C'], 1, -1)).toEqual(['B', 'A', 'C']);
    expect(moveSeed(['A', 'B'], 0, -1)).toEqual(['A', 'B']);
  });
  it('los equipos con lugar y con qué rol entra el agente', () => {
    const t = mkTournament({ mode: '5v5', entryType: 'open' });
    const four = mkEntry('A', 'Equipo Uno', { members: [1, 2, 3, 4].map((n) => mkMember(`u${n}`, `Jugador ${n}`)) });
    const full = mkEntry('B', 'Equipo Dos', { members: [1, 2, 3, 4, 5, 6].map((n) => mkMember(`v${n}`, `Jugador ${n}`)) });
    expect(teamsWithRoom([four, full], { ...t, settings: { ...t.settings, subs: 1 } }).map((e) => e.id)).toEqual(['A']);
    expect(assignRoleFor(four, '5v5')).toBe('member');
    expect(formedTeamsCount([mkEntry('C', 'Equipo 1'), mkEntry('D', 'Equipo de Ejemplo')])).toBe(1);
    expect(agentUserOf(mkEntry('E', 'Jugador Uno', { kind: 'free_agent', members: [mkMember('w1', 'Jugador Uno')] }))).toBe('w1');
  });
  it('el menú de un inscrito, la siembra y el nombre', () => {
    const e = mkEntry('A', 'Equipo Uno', { seed: 2, tag: 'UNO' });
    expect(entryAdminItems(mkTournament({ checkinMinutes: 15 }), e).map((i) => [i.key, i.label])).toEqual([
      ['seed', 'Cambiar siembra'],
      ['checkin', 'Marcar check-in'],
      ['name', 'Editar nombre'],
    ]);
    expect(entryAdminItems(mkTournament(), { ...e, status: 'pending' }).map((i) => i.key)).toEqual(['name']);
    expect(seedFromInput('')).toEqual({ n: null, ok: true });
    expect(seedFromInput('200').ok).toBe(false);
    expect(entryNameOk('Equipo Uno', 'UNO')).toBe(true);
    expect(entryNameOk(' ', 'UNO')).toBe(false);
  });
});

describe('editar el torneo', () => {
  const t = mkTournament({ format: 'single_elim', startsAt: '2030-05-10T23:00:00.000Z', registrationClosesAt: '2030-05-10T23:00:00.000Z' });
  it('sin cambios no hay nada que guardar; con el nombre nuevo, solo el nombre', () => {
    const v = editInitial(t, TZ);
    expect(editTournamentErrors(t, v, { tz: TZ, approved: 2, formatEditable: true })).toEqual([]);
    expect(editTournamentPatch(t, v, { tz: TZ, formatEditable: true })).toEqual({});
    expect(editTournamentPatch(t, { ...v, name: 'Copa de Ejemplo' }, { tz: TZ, formatEditable: true })).toEqual({ name: 'Copa de Ejemplo' });
  });
  it('el cupo no baja de los aprobados y la inscripción cierra antes del inicio', () => {
    const v = editInitial(t, TZ);
    const errors = editTournamentErrors(t, { ...v, closeDate: '2030-05-11', format: { ...v.format, maxEntries: 3 } }, { tz: TZ, approved: 4, formatEditable: false });
    expect(errors).toContain('La inscripción tiene que cerrar antes del inicio.');
    expect(errors.some((e) => e.startsWith('El cupo va de 4'))).toBe(true);
  });
});

describe('una partida de battle royale', () => {
  const t = mkTournament({ game: 'free_fire', mode: 'squad', format: 'br' });
  it('el título, las jornadas que se eligen y si ya está anotada', () => {
    const g = mkBrGame('G1', 1, 2, [{ entryId: 'A', placement: 1, kills: 3 }]);
    expect(brSheetTitle(null)).toBe('Anotar partida');
    expect(brSheetTitle(g)).toBe('Partida 2 · Jornada 1');
    expect(brSlotRanges({ ...t, settings: { ...t.settings, br: { placementPoints: [10], killPoints: 1, rounds: 2, gamesPerRound: 3 } } }, 1, 5)).toEqual({ rounds: 2, perRound: 5 });
    expect(brClash([g], 1, 2, false)).toBe(true);
    expect(brClash([g], 1, 2, true)).toBe(false);
    expect(brInitialRows([{ id: 'A' }, { id: 'B' }], g)).toEqual({ A: { placement: 1, kills: 3 }, B: { placement: null, kills: 0 } });
  });
});

describe('el «•••» de una serie', () => {
  it('por jugar: W.O. (con los dos lados), cambiar la hora y anular', () => {
    expect(seriesAdminMenu(mkMatch(), { known: true }).map((i) => i.key)).toEqual(['wo', 'hora', 'anular']);
    expect(seriesAdminMenu(mkMatch(), { known: false }).map((i) => i.key)).toEqual(['hora', 'anular']);
  });
  it('con resultado: corregir y anular; anulada: nada', () => {
    expect(seriesAdminMenu(mkMatch({ status: 'disputed' }), { known: true }).map((i) => i.key)).toEqual(['corregir', 'anular']);
    expect(seriesAdminMenu(mkMatch({ status: 'void' }), { known: true })).toEqual([]);
  });
  it('W.O.: quién no vino', () => {
    expect(walkoverOptions(['Equipo Uno', 'Equipo Dos']).map((o) => o.label)).toEqual(['No vino Equipo Uno', 'No vino Equipo Dos', 'No vino ninguno']);
  });
});
