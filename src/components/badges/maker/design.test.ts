import { describe, expect, it } from 'vitest';
import { BADGE_ICON_KEYS } from '../../../badges/visual';
import { BackendError } from '../../../lib/backend/types';
import type { LeagueBadge, MadeAward } from '../../../lib/data/leagueBadges';
import { textLength } from '../text';
import {
  awardTitle,
  blankDraft,
  dayText,
  draftDesign,
  draftErrors,
  draftFromBadge,
  draftLook,
  draftPatch,
  draftPayload,
  givenText,
  isEmptyPatch,
  makerCode,
  makerErrorText,
  modeOfText,
  namesText,
  periodChoices,
  quotaFullText,
  quotaLeft,
  slotKey,
  templateDraft,
  unitsTaken,
  withinUndo,
} from './design';
import { colorAdjusted, designLook } from './look';
import { TEMPLATES, byTeamAllowed, templateDescription, templateName, templatesFor } from './templates';

const NOW = Date.parse('2026-10-05T15:00:00Z');
const SEASON = { seasonStart: '2026-01-10', seasonEnd: '2026-11-28', tz: 'America/Santo_Domingo' };
const choices = periodChoices(SEASON, NOW);
const SPORTS = ['bowling', 'padel', 'tennis', 'pickleball', 'basketball', 'football', 'futsal', 'golf', 'swimming', 'table_tennis'];

function badge(p: Partial<LeagueBadge> = {}): LeagueBadge {
  return {
    id: 'B1',
    leagueId: 'L1',
    name: 'Campeón',
    description: 'Terminaste de primero.',
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
    ...p,
  };
}

const p0001 = (code: string) => new BackendError(code, code === 'duplicado' ? 'conflict' : code === 'rate_limited' ? 'rate_limited' : 'validation', 'P0001');

describe('plantillas (§5.5)', () => {
  it('son 11, con su forma, ícono curado, metal y cupo; en un torneo, solo 5', () => {
    expect(TEMPLATES).toHaveLength(11);
    for (const t of TEMPLATES) expect(BADGE_ICON_KEYS).toContain(t.icon);
    expect(templatesFor('torneo').map((t) => t.key)).toEqual(['champion', 'runner_up', 'third_place', 'mvp', 'fair_play']);
    expect(templatesFor('liga')).toHaveLength(11);
    expect(TEMPLATES.find((t) => t.key === 'third_place')).toMatchObject({ shape: 'shield', icon: 'award', metal: 'bronce', limitKind: 'selecta' });
    expect(TEMPLATES.find((t) => t.key === 'perfect_attendance')).toMatchObject({ shape: 'circle', limitKind: 'abierta' });
  });

  it('nombres y textos caben (3–28 y 140) en todos los deportes, y «Mejor promedio» cambia por deporte', () => {
    for (const t of TEMPLATES)
      for (const s of SPORTS)
        for (const tournament of [false, true]) {
          const n = textLength(templateName(t.key, s, tournament));
          expect(n, `${t.key} ${s}`).toBeGreaterThanOrEqual(3);
          expect(n, `${t.key} ${s}`).toBeLessThanOrEqual(28);
          expect(textLength(templateDescription(t.key, s, tournament))).toBeLessThanOrEqual(140);
        }
    expect(['bowling', 'golf', 'basketball', 'football', 'padel', 'swimming'].map((s) => templateName('best_average', s))).toEqual([
      'Mejor promedio',
      'Mejor promedio neto',
      'Más puntos',
      'Más goles',
      'Mejor récord',
      'Más puntos',
    ]);
    expect(templateDescription('champion', 'bowling', true)).toBe('Terminaste de primero en el torneo. ¡El título es tuyo!');
    expect(templateName('mvp', 'bowling', true)).toBe('MVP del torneo');
  });

  it('«Por equipo» solo en raqueta y equipos; el podio de los equipos arranca por equipo', () => {
    expect(SPORTS.filter(byTeamAllowed)).toEqual(['padel', 'tennis', 'pickleball', 'basketball', 'football', 'futsal', 'table_tennis']);
    expect(templateName('best_average', 'table_tennis')).toBe('Mejor récord');
    expect(templateDraft('champion', 'football').byTeam).toBe(true);
    expect(templateDraft('champion', 'padel').byTeam).toBe(false);
    expect(templateDraft('mvp', 'basketball').byTeam).toBe(false);
  });
});

describe('periodos del editor', () => {
  it('la temporada de la liga, el año, el mes (en su zona), el torneo y sin periodo', () => {
    expect(choices.map((c) => [c.mode, c.text])).toEqual([
      ['temporada', 'TEMP 2026'],
      ['anio', '2026'],
      ['mes', 'OCT 2026'],
      ['torneo', 'OCT 2026'],
      ['none', ''],
    ]);
    expect(periodChoices({ seasonStart: '2026-09-01', seasonEnd: '2027-06-30' }, NOW)[0].text).toBe('TEMP 26/27');
    expect(periodChoices({}, NOW)[0].text).toBe('TEMP 2026');
    // A las 11 pm del 31 de octubre en Santo Domingo ya es 1 de noviembre en UTC: manda la zona de la liga.
    expect(periodChoices({ tz: 'America/Santo_Domingo' }, Date.parse('2026-11-01T03:00:00Z'))[2].text).toBe('OCT 2026');
  });

  it('un texto guardado vuelve a su chip, o queda como texto libre', () => {
    expect(modeOfText('TEMP 2026', choices)).toEqual({ mode: 'temporada', free: '' });
    expect(modeOfText('oct 2026', choices)).toEqual({ mode: 'mes', free: '' });
    expect(modeOfText('', choices)).toEqual({ mode: 'none', free: '' });
    expect(modeOfText('Clausura', choices)).toEqual({ mode: 'temporada', free: 'CLAUSURA' });
  });
});

describe('borrador del diseño', () => {
  it('una plantilla llena todo; en un torneo va el mes con «TORNEO» arriba', () => {
    const d = templateDraft('player_of_the_month', 'bowling');
    expect(d).toMatchObject({ template: 'player_of_the_month', name: 'Estrella del mes', shape: 'medal', palette: 'plata', icon: 'flame', periodMode: 'mes', limitKind: 'unica' });
    expect(draftPayload(d, choices, 'bowling')).toEqual({
      template: 'player_of_the_month',
      name: 'Estrella del mes',
      description: 'Lo mejor del mes en tu liga.',
      shape: 'medal',
      palette: 'plata',
      color: null,
      icon: 'flame',
      top_text: '',
      period_text: 'OCT 2026',
      limit_kind: 'unica',
      by_team: false,
    });
    const t = templateDraft('champion', 'bowling', 'torneo');
    expect(t).toMatchObject({ periodMode: 'torneo', topText: 'TORNEO' });
    expect(draftLook(t, choices, 'bowling')).toMatchObject({ top: 'TORNEO', period: { long: 'OCT 2026', short: 'OCT 26' }, origin: 'liga', pips: 0 });
  });

  it('los textos se limpian, lo de arriba y abajo en mayúsculas, y el color solo con «Otro color»', () => {
    const d = { ...blankDraft(), name: '  Mano   amiga ', topText: 'los pinos', periodFree: ' clausura ', palette: 'color' as const, color: '0D9488' };
    const x = draftDesign(d, choices);
    expect(x).toMatchObject({ name: 'Mano amiga', topText: 'LOS PINOS', periodText: 'CLAUSURA', palette: 'color', color: '#0d9488' });
    expect(draftPayload({ ...d, palette: 'liga' }, choices, 'padel')).toMatchObject({ palette: 'liga', color: null });
    // Un color a medio escribir se ve con el de la liga (y no deja guardar).
    expect(draftDesign({ ...d, color: '#12' }, choices).palette).toBe('liga');
    expect(draftErrors({ ...d, color: '#12' }).color).toBe('Escribe el color así: #1a2b3c.');
    // «Por equipo» no sale del boliche aunque el borrador lo tenga.
    expect(draftPayload({ ...d, byTeam: true }, choices, 'bowling').by_team).toBe(false);
    expect(draftPayload({ ...d, byTeam: true }, choices, 'basketball').by_team).toBe(true);
  });

  it('se ve como lo guardaría la base: forma, metal o color, ícono, cinta y pestaña LIGA', () => {
    expect(designLook({ shape: 'star', palette: 'liga', color: null, icon: 'bird', topText: '', periodText: 'TEMP 2026' }, 'padel')).toMatchObject({
      shape: 'star',
      tier: { custom: '#0f766e' },
      icon: 'bird',
      origin: 'liga',
      period: { long: 'TEMP 2026', short: 'T 2026' },
    });
    // El periodo del otorgamiento manda sobre el del diseño.
    expect(designLook(badge(), 'bowling', 'TEMP 2027').period).toEqual({ long: 'TEMP 2027', short: 'T 2027' });
    expect(designLook(badge(), 'bowling', 'TEMP 26/27').period).toEqual({ long: 'TEMP 26/27', short: 'T 26/27' });
    expect(designLook(badge(), 'bowling', 'CLAUSURA').period).toEqual({ long: 'CLAUSURA', short: '' });
    expect(designLook(badge(), 'bowling', 'COPA').period).toEqual({ long: 'COPA', short: 'COPA' });
    expect(designLook(badge(), 'bowling', '').period).toBeNull();
    expect(colorAdjusted({ palette: 'color', color: '#facc15' }, 'bowling')).toBe(true);
    expect(colorAdjusted({ palette: 'oro', color: null }, 'bowling')).toBe(false);
  });

  it('al editar solo se manda lo que cambió; ya dada, solo la descripción', () => {
    const b = badge();
    const d = draftFromBadge(b, choices);
    expect(d).toMatchObject({ name: 'Campeón', periodMode: 'temporada', periodFree: '', template: 'champion' });
    expect(isEmptyPatch(draftPatch(b, d, choices, 'bowling'))).toBe(true);
    expect(draftPatch(b, { ...d, name: 'Campeona', description: 'Nueva' }, choices, 'bowling')).toEqual({ name: 'Campeona', description: 'Nueva' });
    expect(draftPatch({ ...b, locked: true }, { ...d, name: 'Campeona', description: 'Nueva' }, choices, 'bowling')).toEqual({ description: 'Nueva' });
    expect(draftPatch(b, { ...d, periodMode: 'none' }, choices, 'bowling')).toEqual({ period_text: '' });
    expect(draftPatch({ ...b, palette: 'color', color: '#dc2626' }, { ...d, palette: 'color', color: '#dc2626' }, choices, 'bowling')).toEqual({});
  });

  it('los avisos de cada campo', () => {
    expect(draftErrors(blankDraft()).name).toBe('Ponle un nombre.');
    expect(draftErrors({ ...blankDraft(), name: 'Yo' }).name).toBe('El nombre lleva de 3 a 28 letras.');
    expect(draftErrors({ ...blankDraft(), name: 'Campeón 🏆' }).name).toBe('Usa letras, números y signos simples. Sin emoji.');
    expect(draftErrors({ ...blankDraft(), name: 'Campeón', description: 'Llama al 809-555-1234' })).toEqual({ description: 'Ese texto no se puede usar.' });
    expect(draftErrors({ ...blankDraft(), name: 'Campeón', topText: 'X'.repeat(15) }).topText).toBe('El texto de arriba lleva hasta 14 letras.');
    expect(draftErrors({ ...blankDraft(), name: 'Campeón', periodFree: 'www.x' }).period).toBe('Ese texto no se puede usar.');
    expect(draftErrors({ ...blankDraft(), name: 'Campeón' })).toEqual({});
  });
});

describe('dar', () => {
  const aw = (p: Partial<MadeAward>): MadeAward => ({
    id: Math.random().toString(36).slice(2),
    badgeId: 'B1',
    leagueId: 'L1',
    playerId: 'p1',
    teamId: null,
    period: 'TEMP 2026',
    division: '',
    awardedAt: '2026-10-01T12:00:00Z',
    revokedAt: null,
    hidden: false,
    ...p,
  });

  it('el cupo cuenta jugadores (o equipos) vigentes del mismo periodo y división', () => {
    const list = [aw({ playerId: 'p1' }), aw({ playerId: 'p2', revokedAt: '2026-10-02T00:00:00Z' }), aw({ playerId: 'p3', period: 'TEMP 2025' }), aw({ playerId: 'p4', division: 'Cat. A' })];
    expect(unitsTaken(badge(), list, 'TEMP 2026', '')).toBe(1);
    expect(quotaLeft(badge(), list, 'TEMP 2026', '')).toBe(0);
    expect(quotaLeft(badge({ limitKind: 'selecta' }), list, 'TEMP 2026', '')).toBe(2);
    expect(quotaLeft(badge(), list, 'TEMP 2026', 'Cat. B')).toBe(1);
    const team = [aw({ playerId: 'p1', teamId: 'T1' }), aw({ playerId: 'p2', teamId: 'T1' }), aw({ playerId: 'p5', teamId: 'T2' })];
    expect(unitsTaken(badge({ byTeam: true }), team, 'TEMP 2026', '')).toBe(2);
    // Como la base: sin mayúsculas, tildes ni signos (no se esquiva el cupo con «temp 2026.» o «cat a»).
    expect(quotaLeft(badge(), list, 'temp 2026.', '')).toBe(0);
    expect(unitsTaken(badge(), list, 'TEMP 2026', 'cat a')).toBe(1);
    expect([slotKey('Cat. Á-1'), slotKey('Niño'), slotKey('TEMP 2027')]).toEqual(['cata1', 'nino', 'temp2027']);
    // Los premios del torneo no usan el cupo del diseño (docs/premios-torneo.md §1 D4), como en la base.
    const prizes = [aw({ playerId: 'p6', prizeSlotId: 'S1' }), aw({ playerId: 'p7', prizeSlotId: 'S2' })];
    expect(unitsTaken(badge(), prizes, 'TEMP 2026', '')).toBe(0);
    expect(quotaLeft(badge(), [...prizes, ...list], 'TEMP 2026', '')).toBe(0);
    expect(quotaLeft(badge(), prizes, 'TEMP 2026', '')).toBe(1);
  });

  it('los textos de listo y de los nombres', () => {
    expect(namesText(['Ana'])).toBe('Ana');
    expect(namesText(['Ana', 'Luis'])).toBe('Ana y Luis');
    expect(namesText(['Ana', 'Luis', 'Pedro'])).toBe('Ana, Luis y Pedro');
    expect(namesText(['Ana', 'Luis', 'Pedro', 'Rosa', 'Juan'])).toBe('Ana, Luis y 3 más');
    expect(givenText(['Ana'], 'Campeón', 'TEMP 2026')).toBe('Listo: Ana tiene “Campeón · TEMP 2026”');
    expect(givenText(['Ana', 'Luis'], 'Juego limpio', '')).toBe('Listo: Ana y Luis tienen “Juego limpio”');
    expect(awardTitle('MVP', ' ')).toBe('MVP');
    expect(dayText('2026-10-04T12:00:00Z')).toBe('4 oct 2026');
    expect(withinUndo('2026-10-05T00:00:00Z', NOW)).toBe(true);
    expect(withinUndo('2026-10-04T14:00:00Z', NOW)).toBe(false);
  });

  it('los errores de la base en palabras, sin repetir el texto bloqueado', () => {
    expect(makerCode(p0001('limite: activas'))).toBe('limite: activas');
    expect(makerCode(new BackendError('no_permitido', 'permission', '42501'))).toBe('no_permitido');
    expect(makerCode(new BackendError('Tu cuenta está bloqueada.', 'permission', 'bloqueada'))).toBeNull();
    expect(makerCode(new Error('cupo_lleno'))).toBeNull();
    expect(makerErrorText(p0001('cupo_lleno'), { name: 'Campeón', limitKind: 'unica', period: 'TEMP 2026', holders: ['Ana'] })).toBe(
      '“Campeón” es Única: ya se la diste a Ana en TEMP 2026.',
    );
    expect(quotaFullText({ name: 'Juego limpio', limitKind: 'selecta', period: 'TEMP 2026' })).toBe('“Juego limpio” ya llegó a su cupo (3) en TEMP 2026. Quítasela a alguien o usa otro periodo.');
    expect(makerErrorText(p0001('limite: activas'))).toBe('Llegaste a 30 insignias activas. Archiva una para crear otra.');
    expect(makerErrorText(p0001('texto_bloqueado'))).toBe('Ese texto no se puede usar.');
    expect(makerErrorText(p0001('a_si_mismo'))).toBe('No puedes darte insignias a ti mismo. Pídele a otro admin o al dueño.');
    // Quitar un premio del torneo ya cerrado (o con más de 14 días): solo el dueño.
    expect(makerErrorText(p0001('cerrado'), { action: 'quitar' })).toBe('Los premios de este torneo ya se cerraron. Solo el dueño puede quitarla.');
    expect(makerErrorText(p0001('ya_dada'), { action: 'guardar' })).toBe('Esta insignia ya se dio: solo puedes cambiar la descripción. Duplícala para hacer otra versión.');
    expect(makerErrorText(p0001('ya_dada'), { action: 'borrar' })).toBe('Esta insignia ya se dio: no se puede borrar. Archívala.');
    expect(makerErrorText(p0001('rate_limited'), { action: 'guardar' })).toBe('Guardaste muchos diseños en la última hora. Espera un rato.');
    expect(makerErrorText(new BackendError('no_permitido', 'permission', '42501'), { action: 'quitar' })).toMatch(/24 horas/);
    // Lo demás (red, sesión) lo dice el mensaje de siempre.
    expect(makerErrorText(new BackendError('Failed to fetch', 'network'))).toBe('Sin conexión. Intenta de nuevo cuando vuelva la señal.');
  });
});
