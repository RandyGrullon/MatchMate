import { describe, expect, it } from 'vitest';
import type { LeagueBadge } from '../lib/data/leagueBadges';
import type { PrizeSlot, TournamentPrize } from '../lib/data/prizes';
import type { PrizeComp } from './catalog';
import { deliveredKeys, designsForPlace, initialRows, setupPayload, setupProblem, setupSections, templateDesign, withPodiumTemplates, type SetupRows } from './setup';

const comp: PrizeComp = { lid: 'L1', scope: 'evento', refId: 'E1', kind: 'bowling', sport: 'bowling', name: 'Copa', date: '2026-10-12', bowling: { type: 'torneo', hcpPercent: 80, hasTeams: true } };

let n = 0;
const design = (p: Partial<LeagueBadge>): LeagueBadge => ({
  id: `B${++n}`,
  leagueId: 'L1',
  name: 'Insignia',
  description: '',
  shape: 'shield',
  palette: 'oro',
  color: null,
  icon: 'trophy',
  topText: '',
  periodText: '',
  template: null,
  limitKind: 'abierta',
  byTeam: false,
  status: 'activa',
  createdBy: null,
  createdAt: `2026-09-${String(10 + n).padStart(2, '0')}T00:00:00Z`,
  updatedAt: '',
  given: 0,
  active: 0,
  locked: false,
  openReports: null,
  ...p,
});

const slot = (p: Partial<PrizeSlot> & Pick<PrizeSlot, 'id' | 'category' | 'place' | 'badgeId'>): PrizeSlot => ({
  division: '',
  label: '',
  title: '',
  winners: [],
  verified: false,
  deliveredAt: null,
  deliveredBy: null,
  editableUntil: null,
  updatedAt: '',
  ...p,
});

const prize = (slots: PrizeSlot[]): TournamentPrize => ({ id: 'Z', leagueId: 'L1', scope: 'evento', refId: 'E1', period: 'OCT 2026', closedAt: null, closedBy: null, createdAt: '', updatedAt: '', slots });

describe('elegir premios', () => {
  const oldChamp = design({ name: 'Campeón 2025', template: 'champion', periodText: 'TEMP 2025' });
  const champ = design({ name: 'Campeón', template: 'champion' });
  const archived = design({ name: 'Campeón viejo', template: 'champion', status: 'archivada' });
  const third = design({ name: 'Tercer lugar', template: 'third_place' });
  const mvp = design({ name: 'MVP', template: 'mvp' });
  const all = [oldChamp, champ, archived, third, mvp];

  it('secciones del boliche y lo marcado sin premios: el 1.er lugar de cada una con «Campeón» (el de sin cinta)', () => {
    const sections = setupSections(comp, null);
    expect(sections.map((s) => s.title)).toEqual(['Equipos (scratch)', 'Individual (handicap)']);
    expect(templateDesign(all, 'champion')?.id).toBe(champ.id);
    expect(templateDesign(all, 'runner_up')).toBeNull();
    const rows = initialRows(sections, null, all);
    expect(rows['equipo||1']).toEqual({ on: true, badgeId: champ.id });
    expect(rows['individual||1']).toEqual({ on: true, badgeId: champ.id });
    expect(rows['individual||2']).toEqual({ on: false, badgeId: null });
    expect(setupPayload(sections, rows, null)).toEqual([
      { category: 'equipo', division: '', place: 1, badgeId: champ.id },
      { category: 'individual', division: '', place: 1, badgeId: champ.id },
    ]);
  });

  it('con premios guardados: lo guardado (y su división); una categoría que ya no aplica sigue saliendo', () => {
    const saved = prize([
      slot({ id: 'S1', category: 'individual', place: 2, badgeId: third.id, label: 'Viejo', deliveredAt: '2026-10-12T00:00:00Z', winners: [{ ref: 'p:ana', name: 'Ana', teamId: null, players: ['ana'] }] }),
      slot({ id: 'S2', category: 'pareja', division: 'A', place: 1, badgeId: champ.id }),
    ]);
    const sections = setupSections({ ...comp, bowling: { ...comp.bowling!, hasTeams: false } }, saved);
    expect(sections.map((s) => `${s.category}:${s.division}`)).toEqual(['individual:', 'pareja:A']);
    const rows = initialRows(sections, saved, all);
    expect(rows['individual||1']).toEqual({ on: false, badgeId: null });
    expect(rows['individual||2']).toEqual({ on: true, badgeId: third.id });
    expect([...deliveredKeys(saved)]).toEqual(['individual||2']);
    // Un lugar que se quitó entero (entregado y hoy sin ganadores) vuelve a cambiarse, como en la base.
    expect([...deliveredKeys(prize([{ ...saved.slots[0], winners: [] }, saved.slots[1]]))]).toEqual([]);
    expect(setupPayload(sections, rows, saved)).toEqual([
      { category: 'individual', division: '', place: 2, badgeId: third.id, label: 'Viejo' },
      { category: 'pareja', division: 'A', place: 1, badgeId: champ.id, label: '' },
    ]);
  });

  it('un lugar prendido sin insignia no se guarda; el atajo de las tres plantillas no toca lo entregado', () => {
    const sections = setupSections(comp, null);
    const rows: SetupRows = { ...initialRows(sections, null, []), 'individual||3': { on: true, badgeId: null } };
    expect(setupProblem(sections, rows)).toBe('Elige la insignia del 1.er lugar de Equipos (scratch).');
    const filled = withPodiumTemplates(sections, rows, { champion: 'C', runner_up: 'R', third_place: 'T' }, new Set(['individual||1']));
    expect(filled['equipo||2']).toEqual({ on: true, badgeId: 'R' });
    expect(filled['individual||3']).toEqual({ on: true, badgeId: 'T' });
    expect(filled['individual||1']).toEqual(rows['individual||1']);
    expect(setupProblem(sections, { ...filled, 'individual||1': { on: true, badgeId: 'C' } })).toBeNull();
  });

  it('las insignias de un lugar: activas, arriba la plantilla de ese lugar', () => {
    expect(designsForPlace(all, 3).map((d) => d.name)).toEqual(['Tercer lugar', 'Campeón', 'Campeón 2025', 'MVP']);
    expect(designsForPlace(all, 1).map((d) => d.name)).toEqual(['Campeón', 'Campeón 2025', 'Tercer lugar', 'MVP']);
  });
});
