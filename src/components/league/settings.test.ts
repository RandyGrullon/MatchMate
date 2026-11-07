/** Ajustes de la liga sin pantalla (settings.ts): los datos de la tarjeta, la hoja de configuración, el logo y el formulario. */
import { describe, expect, it } from 'vitest';
import type { LeagueInput } from '../../lib/data/leagues';
import type { League } from '../../lib/types';
import {
  configRowSubtitle,
  configRowTitle,
  configRows,
  deleteLeagueConfirm,
  freedPhotosText,
  leagueFormData,
  leagueFormProblem,
  leagueInput,
  liveExplain,
  logoButtonLabel,
  logoHint,
  minorsNote,
  needsMinorsConfirm,
  removeLogoConfirm,
  scheduleDraft,
  scheduleHint,
  seasonToggle,
  settingsDetails,
  toggleDay,
} from './settings';

const league = (over: Partial<League> = {}): League => ({
  id: 'L1',
  name: 'Liga de Ejemplo',
  kind: 'liga',
  visibility: 'private',
  ownerUid: 'u1',
  venue: 'Bolera de Ejemplo',
  schedule: 'Martes · 7:00 pm',
  seasonStart: '2026-02-01',
  seasonEnd: '2026-06-30',
  contactName: 'Jugador Uno',
  contactPhone: '8090000000',
  requirePhoto: true,
  sport: 'bowling',
  hasMinors: false,
  tz: 'America/Santo_Domingo',
  ...over,
});

const fmt = (iso: string) => `[${iso}]`;

describe('settingsDetails', () => {
  it('una liga de boliche: lugar, horario, temporada, contacto con WhatsApp, foto, zona y menores', () => {
    const rows = settingsDetails(league(), { fmt });
    expect(rows.map((r) => r.key)).toEqual(['venue', 'schedule', 'season', 'contact', 'photo', 'tz', 'minors']);
    expect(rows.find((r) => r.key === 'season')?.value).toBe('[2026-02-01] – [2026-06-30]');
    const contact = rows.find((r) => r.key === 'contact');
    expect(contact?.value).toBe('Jugador Uno · 8090000000');
    expect(contact?.href).toBe('https://wa.me/18090000000');
    expect(rows.find((r) => r.key === 'photo')?.value).toBe('Obligatoria para que cuente');
    expect(rows.find((r) => r.key === 'tz')?.value).toMatch(/^República Dominicana/);
    expect(rows.find((r) => r.key === 'minors')).toMatchObject({ label: 'Liga con menores', value: 'No' });
  });

  it('un torneo de pádel: sin horario ni temporada ni foto; vacío y sin link si no hay contacto', () => {
    const rows = settingsDetails(league({ kind: 'torneo', sport: 'padel', contactName: '', contactPhone: '', hasMinors: true, seasonEnd: '' }), { fmt });
    expect(rows.map((r) => r.key)).toEqual(['venue', 'contact', 'tz', 'minors']);
    expect(rows.find((r) => r.key === 'contact')).toEqual({ key: 'contact', label: 'Contacto', value: '' });
    expect(rows.find((r) => r.key === 'minors')).toMatchObject({ label: 'Torneo con menores', value: 'Sí: privada, sin fotos ni comentarios' });
  });

  it('la foto opcional y la temporada sin las dos fechas', () => {
    const rows = settingsDetails(league({ requirePhoto: false, seasonEnd: '' }), { fmt });
    expect(rows.find((r) => r.key === 'photo')?.value).toBe('Opcional');
    expect(rows.find((r) => r.key === 'season')?.value).toBe('');
  });
});

describe('la configuración', () => {
  it('la fila de abajo según quién es y el deporte', () => {
    expect(configRowTitle('liga', true)).toBe('Respaldo y borrar la liga');
    expect(configRowTitle('torneo', false)).toBe('Respaldo del torneo');
    expect(configRowSubtitle('liga', true, true)).toBe('Descargar los datos, fotos viejas, borrar la liga');
    expect(configRowSubtitle('torneo', false, false)).toBe('Descargar los datos');
  });

  it('las filas: respaldo, fotos viejas (boliche) y borrar (dueño)', () => {
    expect(configRows({ kind: 'liga', bowling: true, canDelete: true }).map((r) => r.key)).toEqual(['backup', 'photos', 'delete']);
    const other = configRows({ kind: 'torneo', bowling: false, canDelete: false });
    expect(other.map((r) => r.key)).toEqual(['backup']);
    expect(other[0].text).toContain('partidos, resultados');
    expect(configRows({ kind: 'torneo', bowling: false, canDelete: true })[1]).toMatchObject({ title: 'Borrar el torneo', danger: true });
  });

  it('lo que se pregunta y lo que se dice', () => {
    expect(deleteLeagueConfirm('Liga de Ejemplo', true)).toMatchObject({ title: '¿Borrar Liga de Ejemplo?', confirmText: 'Borrar todo', danger: true });
    expect(deleteLeagueConfirm('Liga de Ejemplo', false).message).toContain('partidos');
    expect(freedPhotosText(0)).toBe('No hay fotos de hace más de un año');
    expect(freedPhotosText(3)).toBe('3 fotos borradas');
  });
});

describe('el logo y en vivo', () => {
  it('los textos del logo', () => {
    expect(logoHint(false, 'liga')).toBe('Si subes uno, sale en la lista de ligas, en las invitaciones y arriba en la liga. Es una imagen pública.');
    expect(logoHint(true, 'torneo')).toMatch(/^Sale .* arriba en el torneo\./);
    expect(logoButtonLabel(true, true)).toBe('Subiendo…');
    expect(logoButtonLabel(false, false)).toBe('Subir logo');
    expect(removeLogoConfirm('torneo').message).toMatch(/^El torneo vuelve/);
  });

  it('en el boliche transmiten solo los admins', () => {
    expect(liveExplain({ id: 'L1', sport: 'bowling', kind: 'liga' })).toMatch(/^Los admins podrán .* arriba en la liga/);
    expect(liveExplain({ id: 'L1', sport: 'padel', kind: 'torneo' })).toMatch(/^Los admins y anotadores podrán .* arriba en el torneo/);
  });
});

describe('el formulario de los datos', () => {
  const form = (over: Partial<LeagueInput> = {}): LeagueInput => ({ ...leagueInput(league()), ...over });

  it('arranca de la liga, con la zona por defecto', () => {
    expect(leagueInput(league({ tz: undefined, kind: undefined }))).toMatchObject({ kind: 'liga', tz: 'America/Santo_Domingo', requirePhoto: true });
  });

  it('al guardar: sin espacios, el teléfono en dígitos, la temporada solo si está prendida', () => {
    const data = leagueFormData(form({ name: '  Liga de Ejemplo ', contactPhone: '809-000-0000' }), { hasSeason: false, sportPhotos: true });
    expect(data).toMatchObject({ name: 'Liga de Ejemplo', contactPhone: '8090000000', seasonStart: '', seasonEnd: '' });
  });

  it('con menores queda privada y sin foto; sin foto en los deportes sin foto', () => {
    expect(leagueFormData(form({ hasMinors: true, visibility: 'public' }), { hasSeason: true, sportPhotos: true })).toMatchObject({ visibility: 'private', requirePhoto: false });
    expect(leagueFormData(form(), { hasSeason: true, sportPhotos: false }).requirePhoto).toBe(false);
    expect(leagueFormData(form(), { hasSeason: true, sportPhotos: undefined }).requirePhoto).toBe(true);
    expect(leagueFormData(form(), { hasSeason: true, sportPhotos: true, advanced: false })).toMatchObject({ hasMinors: undefined, tz: undefined });
  });

  it('la temporada: prendida sin fechas arranca hoy; apagada las borra', () => {
    expect(seasonToggle(form({ seasonStart: '', seasonEnd: '' }), true, '2026-03-15')).toMatchObject({ seasonStart: '2026-03-15', seasonEnd: '2026-12-31' });
    expect(seasonToggle(form(), true, '2026-03-15').seasonStart).toBe('2026-02-01');
    expect(seasonToggle(form(), false, '2026-03-15')).toMatchObject({ seasonStart: '', seasonEnd: '' });
  });

  it('lo que falta para guardar', () => {
    expect(leagueFormProblem(form({ name: '  ' }), false)).toBe('nombre');
    expect(leagueFormProblem(form({ seasonEnd: '' }), true)).toBe('fechas');
    expect(leagueFormProblem(form({ seasonEnd: '2026-01-01' }), true)).toBe('orden');
    expect(leagueFormProblem(form({ seasonEnd: '2026-01-01' }), false)).toBeNull();
    expect(leagueFormProblem(form(), true)).toBeNull();
  });

  it('«Liga con menores»: cuándo se confirma y la nota de abajo', () => {
    expect(needsMinorsConfirm(false, true, false)).toBe(true);
    expect(needsMinorsConfirm(false, true, true)).toBe(false);
    expect(needsMinorsConfirm(true, true, false)).toBe(false);
    expect(minorsNote({ on: true, locked: true, canTurnOff: false })).toMatch(/^Ya está activada/);
    expect(minorsNote({ on: true, locked: false, canTurnOff: true })).toMatch(/^Como superadmin/);
    expect(minorsNote({ on: true, locked: false, canTurnOff: false })).toBe('Una vez guardada, no la puedes apagar tú.');
    expect(minorsNote({ on: false, locked: false, canTurnOff: false })).toBeNull();
  });

  it('«Cuándo juegan»: lo guardado, lo escrito a mano y la línea de abajo', () => {
    expect(scheduleDraft('Martes y jueves · 7:30 pm')).toEqual({ days: [1, 3], time: '19:30', legacy: '' });
    expect(scheduleDraft('los martes en la noche').legacy).toBe('los martes en la noche');
    expect(toggleDay([1, 3], 3)).toEqual([1]);
    expect(toggleDay([1], 4)).toEqual([1, 4]);
    expect(scheduleHint('', [1], '19:00')).toBe('Se verá así: Martes · 7:00 pm');
    expect(scheduleHint('los martes', [1], '')).toBe('Ahora dice: “los martes”. Si eliges días u hora, se reemplaza.');
    expect(scheduleHint('', [], '')).toBe('Elige el día (o los días) y la hora.');
  });
});
