import { describe, expect, it } from 'vitest';
import type { MadeAward } from '../../../lib/data/leagueBadges';
import { periodChoices } from './design';
import {
  detailsOk,
  giveTitle,
  notifiedText,
  notifyHint,
  notifyLabel,
  notifyState,
  overQuota,
  periodOptions,
  pickAll,
  pickDesignSub,
  pickedLine,
  playerList,
  quotaLine,
  slotHolders,
  stepIndex,
  suggestionChosen,
  togglePick,
  toggleSuggestion,
} from './give';

const award = (over: Partial<MadeAward> = {}): MadeAward => ({
  id: 'a1',
  badgeId: 'b1',
  leagueId: 'l1',
  playerId: 'p1',
  teamId: null,
  period: 'TEMP 2026',
  division: '',
  awardedAt: '2026-10-04T15:00:00Z',
  revokedAt: null,
  hidden: false,
  ...over,
});

describe('dar insignia', () => {
  it('título y pasos', () => {
    expect(giveTitle(null)).toBe('Dar insignia');
    expect(giveTitle({ name: 'Campeón' })).toBe('Dar “Campeón”');
    expect(stepIndex('detalles')).toBe(1);
    expect(stepIndex('listo')).toBe(-1);
  });

  it('quiénes ya la tienen en el periodo (sin premios ni retiradas, sin mayúsculas ni signos)', () => {
    const awards = [award(), award({ id: 'a2', playerId: 'p2', period: 'Temp 2026.' }), award({ id: 'a3', playerId: 'p3', prizeSlotId: 's1' }), award({ id: 'a4', playerId: 'p4', revokedAt: '2026-10-05T00:00:00Z' })];
    expect([...slotHolders(awards, { id: 'b1' }, 'TEMP 2026', '')]).toEqual(['p1', 'p2']);
    expect(slotHolders(awards, null, 'TEMP 2026', '').size).toBe(0);
  });

  it('el cupo: jugadores, o equipos con una por equipo', () => {
    const base = { awards: [], left: 1, picked: ['p1'], teamId: null, period: 'TEMP 2026', division: '' };
    expect(overQuota({ ...base, badge: { id: 'b1', byTeam: false } })).toBe(false);
    expect(overQuota({ ...base, badge: { id: 'b1', byTeam: false }, picked: ['p1', 'p2'] })).toBe(true);
    const team = { ...base, badge: { id: 'b1', byTeam: true }, left: 0, teamId: 't1' };
    expect(overQuota(team)).toBe(true);
    expect(overQuota({ ...team, awards: [award({ teamId: 't1' })] })).toBe(false);
    expect(overQuota({ ...base, badge: null })).toBe(false);
  });

  it('elegir jugadores: nadie a sí mismo y hasta 30', () => {
    const free = (id: string) => id !== 'yo';
    expect(pickAll(['yo', 'p1', 'p2'], free)).toEqual(['p1', 'p2']);
    expect(pickAll(Array.from({ length: 40 }, (_, i) => `p${i}`), free)).toHaveLength(30);
    expect(togglePick(['p1'], 'p1')).toEqual([]);
    expect(togglePick(['p1'], 'p2')).toEqual(['p1', 'p2']);
    expect(toggleSuggestion(['p1'], { playerIds: ['p2', 'yo'] }, free)).toEqual(['p1', 'p2']);
    expect(toggleSuggestion(['p1', 'p2'], { playerIds: ['p2'] }, free)).toEqual(['p1']);
    expect(suggestionChosen({ teamId: 't1', playerIds: [] }, [], 't1')).toBe(true);
    expect(suggestionChosen({ teamId: null, playerIds: ['p1'] }, ['p1'], null)).toBe(true);
    expect(suggestionChosen({ teamId: null, playerIds: [] }, [], null)).toBe(false);
  });

  it('los textos del paso «¿A quién?»', () => {
    expect(quotaLine({ limitKind: 'selecta', byTeam: false }, 2, 'TEMP 2026')).toBe('Selecta: quedan 2 lugares en TEMP 2026.');
    expect(quotaLine({ limitKind: 'unica', byTeam: false }, 1, '')).toBe('Única: queda 1 lugar.');
    expect(quotaLine({ limitKind: 'unica', byTeam: false }, 0, 'TEMP 2026')).toBe('Única: ya no quedan lugares en TEMP 2026. Puedes darla con otro periodo o división en el paso siguiente.');
    expect(quotaLine({ limitKind: 'unica', byTeam: true }, 1, '')).toBe('Única: 1 equipo por periodo.');
    expect(quotaLine({ limitKind: 'abierta', byTeam: true }, 1, '')).toBe('Abierta: hasta 20 equipos por periodo.');
    expect(pickedLine(['Jugador Uno'], true)).toBe('1 elegido: Jugador Uno Nadie se da insignias a sí mismo.');
    expect(pickedLine([], false)).toBe('Elige a quién se la das.');
    expect(pickDesignSub({ limitKind: 'unica', periodText: 'TEMP 2026', byTeam: true })).toBe('Única · TEMP 2026 · por equipo');
    const players = [
      { id: 'p2', name: 'Jugadora Dos' },
      { id: 'p1', name: 'Jugador Uno' },
    ];
    expect(playerList(players, '', null).map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(playerList(players, 'dós', null).map((p) => p.id)).toEqual(['p2']);
    expect(playerList(players, '', [{ playerId: 'p2' }]).map((p) => p.id)).toEqual(['p2']);
  });

  it('periodo, nota y «Avisarle»', () => {
    const choices = periodChoices({ tz: 'America/Santo_Domingo' }, Date.parse('2026-10-15T12:00:00Z'));
    const options = periodOptions({ periodText: 'TEMP 2026' }, choices);
    expect(options.map((o) => o.key)).toEqual(['diseno', 'anio', 'mes', 'none']);
    expect(periodOptions({ periodText: '' }, choices).map((o) => o.key)).toEqual(['temporada', 'anio', 'mes', 'none']);
    expect(detailsOk('TEMP 2026', 'Cat. A', 'Por tu 279 en la final')).toBe(true);
    expect(detailsOk('UN PERIODO LARGO', '', '')).toBe(false);
    expect(detailsOk('', '', 'Llama al 8090000000')).toBe(false);
    expect(notifyLabel(1)).toBe('Avisarle');
    expect(notifyLabel(3)).toBe('Avisarles');
    expect(notifyHint(true, 2)).toBe('En ligas con menores no se mandan avisos.');
    expect(notifyHint(false, 0)).toBe('Ninguno tiene cuenta: la ven en la página de la liga.');
    expect(notifyHint(false, 3)).toBe('Les llega un aviso al teléfono (3 tienen cuenta).');
    expect(notifyState(true, false, 0)).toEqual({ on: false, disabled: true });
    expect(notifyState(true, false, 1)).toEqual({ on: true, disabled: false });
    expect(notifiedText(0)).toBe('');
    expect(notifiedText(1)).toBe('Le avisamos a 1 jugador con cuenta. ');
  });
});
