import { describe, expect, it } from 'vitest';
import type { BadgeHolder, LeagueBadge, MadeAward } from '../../../lib/data/leagueBadges';
import { blankDraft, periodChoices } from './design';
import {
  activeTitle,
  designActionLabel,
  designActions,
  designGroups,
  designHoldersText,
  designRowSub,
  editorDraft,
  editorKey,
  editorTitle,
  holderSub,
  holdersHeading,
  periodChipPatch,
  playerMadeShown,
  playerMadeTiles,
  policyLine,
  reasonCopy,
  reasonMax,
  recentAwards,
  shelfHoldersText,
  shelfShown,
  signedOutHolders,
  sortHolders,
  teamWord,
  undoes,
} from './view';

const badge = (over: Partial<LeagueBadge> = {}): LeagueBadge => ({
  id: 'b1',
  leagueId: 'l1',
  name: 'Campeón',
  description: 'Primero de la temporada.',
  shape: 'shield',
  palette: 'oro',
  color: null,
  icon: 'trophy',
  topText: '',
  periodText: 'TEMP 2026',
  template: 'champion',
  limitKind: 'unica',
  byTeam: false,
  status: 'activa',
  createdBy: 'u1',
  createdAt: '2026-10-01T12:00:00Z',
  updatedAt: '2026-10-01T12:00:00Z',
  given: 0,
  active: 0,
  locked: false,
  openReports: null,
  ...over,
});

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

const holder = (over: Partial<BadgeHolder> = {}): BadgeHolder => ({
  id: 'a1',
  playerId: 'p1',
  playerName: 'Jugador Uno',
  userId: null,
  teamId: null,
  teamName: null,
  period: 'TEMP 2026',
  division: '',
  awardedAt: '2026-10-04T15:00:00Z',
  hidden: false,
  revokedAt: null,
  note: null,
  awardedBy: 'u1',
  awardedByName: null,
  revokedBy: null,
  revokeReason: null,
  canUndo: true,
  ...over,
});

describe('lista de diseños y estante', () => {
  it('dice cuántos la tienen', () => {
    expect(designHoldersText(0)).toBe('Nadie la tiene todavía');
    expect(designHoldersText(1)).toBe('1 la tiene');
    expect(designHoldersText(3)).toBe('3 la tienen');
    expect(shelfHoldersText(0)).toBe('Nadie todavía');
    expect(designRowSub(badge({ active: 3 }))).toBe('Única · TEMP 2026 · 3 la tienen');
    expect(designRowSub(badge({ periodText: '', limitKind: 'abierta' }))).toBe('Abierta · Nadie la tiene todavía');
    expect(activeTitle(4)).toBe('Activas (4 de 30)');
  });

  it('separa por estado y arma la regla de quién diseña', () => {
    const g = designGroups([badge(), badge({ id: 'b2', status: 'archivada' }), badge({ id: 'b3', status: 'oculta' })]);
    expect([g.active.length, g.archived.length, g.hidden.length]).toEqual([1, 1, 1]);
    expect(policyLine({ badgeMakers: 'owner' }, false)).toEqual({ who: 'solo el dueño', text: 'Lo decide el dueño.' });
    expect(policyLine({}, true)?.text).toBe('Lo cambias aquí arriba, en «¿Quién diseña y da insignias?».');
  });

  it('las últimas que se dieron saltan las retiradas, ocultas y escondidas', () => {
    const designs = [badge(), badge({ id: 'b2', status: 'oculta' })];
    const list = recentAwards(
      [award({ id: 'x1', revokedAt: '2026-10-05T00:00:00Z' }), award({ id: 'x2', hidden: true }), award({ id: 'x3', badgeId: 'b2' }), award({ id: 'x4' }), award({ id: 'x5' })],
      designs,
      1,
    );
    expect(list.map((x) => x.award.id)).toEqual(['x4']);
  });

  it('las del jugador van una por diseño con ×N', () => {
    const data = { designs: [badge(), badge({ id: 'b2', name: 'Mano amiga' })], awards: [award(), award({ id: 'a2', period: 'TEMP 2025' }), award({ id: 'a3', badgeId: 'b2', playerId: 'p2' })] };
    expect(playerMadeTiles(data, 'p1')).toEqual([{ badge: data.designs[0], period: 'TEMP 2026', count: 2 }]);
    expect(playerMadeShown(false, data.awards, 'p2')).toBe(true);
    expect(playerMadeShown(true, data.awards, 'p2')).toBe(false);
  });

  it('el estante sale con activas, o para el elegido que no es admin', () => {
    const base = { hidden: false, loading: false, can: false, isAdmin: false };
    expect(shelfShown({ ...base, designs: [badge()] })).toBe(true);
    expect(shelfShown({ ...base, designs: [] })).toBe(false);
    expect(shelfShown({ ...base, designs: [], can: true })).toBe(true);
    expect(shelfShown({ ...base, designs: [], can: true, isAdmin: true })).toBe(false);
    expect(shelfShown({ ...base, designs: [], loading: true, can: true })).toBe(false);
  });
});

describe('editor', () => {
  it('título, clave y borrador inicial', () => {
    const b = badge();
    expect(editorTitle(null)).toBe('Nueva insignia');
    expect(editorTitle({ kind: 'edit', badge: b })).toBe('Cambiar la insignia');
    expect(editorTitle({ kind: 'copy', badge: b })).toBe('Copia de la insignia');
    expect(editorKey({ kind: 'new', template: 'mvp' })).toBe('new-mvp');
    expect(editorKey({ kind: 'edit', badge: b })).toBe('edit-b1');
    const choices = periodChoices({ tz: 'America/Santo_Domingo' }, Date.parse('2026-10-15T12:00:00Z'));
    expect(editorDraft({ kind: 'new' }, 'bowling', 'liga', choices)).toEqual(blankDraft());
    expect(editorDraft({ kind: 'new', template: 'champion' }, 'bowling', 'liga', choices).name).toBe('Campeón');
    expect(editorDraft({ kind: 'copy', badge: b }, 'bowling', 'liga', choices).periodMode).toBe('temporada');
  });

  it('el chip «Torneo» pone TORNEO arriba si está vacío', () => {
    expect(periodChipPatch({ mode: 'torneo' }, { topText: '' })).toEqual({ periodMode: 'torneo', periodFree: '', topText: 'TORNEO' });
    expect(periodChipPatch({ mode: 'torneo' }, { topText: 'LOS PINOS' })).toEqual({ periodMode: 'torneo', periodFree: '' });
    expect(teamWord('padel')).toBe('Por pareja');
    expect(teamWord('football')).toBe('Por equipo');
  });
});

describe('detalle de un diseño', () => {
  it('los botones según quién mira', () => {
    const all = { maker: true, status: 'activa' as const, canGive: true, canEdit: true, canDuplicate: true, neverGiven: true, isSuper: false, member: true };
    expect(designActions(all)).toEqual(['dar', 'editar', 'duplicar', 'archivar', 'borrar', 'reportar']);
    expect(designActions({ ...all, status: 'archivada', neverGiven: false })).toEqual(['editar', 'duplicar', 'archivar', 'reportar']);
    expect(designActions({ ...all, status: 'oculta', isSuper: true })).toEqual(['esconder']);
    expect(designActions({ ...all, maker: false })).toEqual(['reportar']);
    expect(designActionLabel('editar', { locked: true, status: 'activa' })).toBe('Cambiar descripción');
    expect(designActionLabel('archivar', { locked: false, status: 'archivada' })).toBe('Activar');
  });

  it('quién la tiene', () => {
    expect(holdersHeading(null, 0)).toBe('Quién la tiene');
    expect(holdersHeading(null, 2)).toBe('Quién la tiene (2)');
    expect(holdersHeading([holder(), holder({ revokedAt: '2026-10-05T00:00:00Z' })], 9)).toBe('Quién la tiene (1)');
    expect(signedOutHolders(1)).toBe('La tiene 1 jugador. Entra a tu cuenta para ver quiénes.');
    expect(signedOutHolders(0)).toBe('Todavía nadie la tiene.');
    expect(sortHolders([holder({ id: 'r', revokedAt: '2026-10-05T00:00:00Z' }), holder({ id: 'v' })]).map((h) => h.id)).toEqual(['v', 'r']);
    expect(holderSub(holder({ division: 'Cat. A', teamName: 'Equipo Uno' }))).toBe('TEMP 2026 · Cat. A · Equipo Uno · 4 oct 2026');
    expect(undoes(holder({ awardedBy: 'u2' }), 'u1', true)).toBe(false);
    expect(undoes(holder({ awardedBy: 'u2' }), 'u1', false)).toBe(true);
  });

  it('los textos del motivo', () => {
    const b = badge();
    expect(reasonCopy({ kind: 'quitar', holder: holder(), undo: false }, b).title).toBe('¿Quitarle “Campeón” a Jugador Uno?');
    expect(reasonCopy({ kind: 'quitar', holder: holder(), undo: true }, b).button).toBe('Deshacer');
    expect(reasonCopy({ kind: 'reportar' }, b).title).toBe('Reportar “Campeón”');
    expect(reasonCopy({ kind: 'esconder' }, badge({ status: 'oculta' })).button).toBe('Dejar de esconder');
    expect(reasonMax({ kind: 'esconder' })).toBe(200);
    expect(reasonMax({ kind: 'reportar' })).toBe(140);
  });
});
