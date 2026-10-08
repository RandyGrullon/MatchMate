import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../../sports/esports';
import {
  CHECKIN_OPTIONS,
  STEPS,
  clampMax,
  cleanPoints,
  defaultMax,
  emptyForm,
  idRequirement,
  rankRequirement,
  stepErrors,
  subsMaxOf,
  summary,
  times,
  tournamentInput,
  withFormat,
  withMode,
  withRequirements,
} from './logic';

const TZ = 'America/Santo_Domingo';
const TODAY = '2026-10-08';
const NOW = Date.parse('2026-10-08T12:00:00Z');

describe('crear torneo de esports: el formulario', () => {
  it('cinco pasos: Juego · Inscripción · Formato · Nombre · Invitar', () => {
    expect(STEPS.map((s) => s.label)).toEqual(['Juego', 'Inscripción', 'Formato', 'Nombre', 'Invitar']);
    expect(CHECKIN_OPTIONS.map((o) => o.value)).toEqual([0, 15, 30, 60]);
  });

  it('abre con el modo y el formato por defecto del juego, mañana a las 7 pm, inscripción hasta el inicio', () => {
    const f = emptyForm('valorant', TODAY);
    expect([f.mode, f.format, f.entryType, f.maxEntries]).toEqual(['5v5', 'single_elim', 'teams', 8]);
    expect([f.date, f.time, f.closeAtStart, f.visibility]).toEqual(['2026-10-09', '19:00', true, 'public']);
    expect(f.settings).toEqual(defaultSettings('valorant', '5v5', 'single_elim'));
    const rl = emptyForm('rocket_league', TODAY);
    expect(rl.mode).toBe('3v3');
    const ff = emptyForm('free_fire', TODAY);
    expect([ff.mode, ff.format, ff.maxEntries]).toEqual(['squad', 'br', 12]);
    // Un duelo: solo «Libre».
    expect(emptyForm('sf6', TODAY).entryType).toBe('open');
  });

  it('cambiar el modo: en 1v1 la entrada pasa a «Libre» y sin suplentes; el cupo dentro del lobby en BR', () => {
    const rl = withMode(emptyForm('rocket_league', TODAY), '1v1');
    expect(rl.entryType).toBe('open');
    expect(rl.settings.subs).toBe(0);
    const fn = { ...emptyForm('fortnite', TODAY), maxEntries: 50 };
    expect(withMode(fn, 'squad').maxEntries).toBe(25);
    expect(subsMaxOf('rocket_league', '3v3')).toBe(2);
    expect(subsMaxOf('valorant', '5v5')).toBe(2);
    expect(subsMaxOf('fortnite', 'solo')).toBe(0);
  });

  it('cambiar el formato: sus ajustes por defecto (lo de la inscripción se queda) y el cupo de su rango', () => {
    const f = { ...emptyForm('lol', TODAY), maxEntries: 2 };
    f.settings = { ...f.settings, autoApprove: true, requireConfirmedId: true, requireVerifiedRank: true, subs: 1 };
    const d = withFormat(f, 'double_elim');
    expect(d.format).toBe('double_elim');
    expect(d.maxEntries).toBe(4);
    expect([d.settings.autoApprove, d.settings.requireConfirmedId, d.settings.requireVerifiedRank, d.settings.subs, d.settings.bracketReset]).toEqual([true, true, true, 1, true]);
    // VALORANT no da el rango verificado: ese «Pedir…» se apaga.
    const v = { ...emptyForm('valorant', TODAY), settings: { ...emptyForm('valorant', TODAY).settings, requireConfirmedId: true, requireVerifiedRank: true } };
    expect([withFormat(v, 'double_elim').settings.requireConfirmedId, withFormat(v, 'double_elim').settings.requireVerifiedRank]).toEqual([true, false]);
    expect(clampMax(500, 'valorant', '5v5', 'round_robin')).toBe(20);
    expect(defaultMax('warzone', 'quad', 'br')).toBe(37);
  });

  it('los errores de cada paso: cupo, cierre, el formato del motor y el nombre y la fecha', () => {
    const f = emptyForm('valorant', TODAY);
    const o = { tz: TZ, now: NOW };
    expect(stepErrors('juego', f, o)).toEqual([]);
    expect(stepErrors('inscripcion', f, o)).toEqual([]);
    expect(stepErrors('inscripcion', { ...f, format: 'double_elim', maxEntries: 3 }, o)).toEqual(['El cupo va de 4 a 128.']);
    expect(stepErrors('inscripcion', { ...f, closeAtStart: false, closeDate: '2026-10-10', closeTime: '10:00' }, o)).toEqual(['La inscripción tiene que cerrar antes del inicio.']);
    expect(stepErrors('formato', f, o)).toEqual([]);
    expect(stepErrors('formato', { ...f, format: 'double_elim', maxEntries: 2, settings: defaultSettings('valorant', '5v5', 'double_elim') }, o).length).toBeGreaterThan(0);
    expect(stepErrors('nombre', f, o)).toEqual(['Ponle un nombre al torneo.']);
    expect(stepErrors('nombre', { ...f, name: 'Copa', date: '2026-10-01' }, o)).toEqual(['El inicio tiene que ser más adelante.']);
    expect(stepErrors('nombre', { ...f, name: 'Copa' }, o)).toEqual([]);
  });

  it('lo que se manda: el inicio y el cierre en la zona, el check-in y los textos limpios', () => {
    const f = { ...emptyForm('valorant', TODAY), name: '  Copa VAL  ', checkin: 30, prize: ' RD$5,000 ', closeAtStart: false, closeDate: '2026-10-09', closeTime: '18:00' };
    const input = tournamentInput(f, TZ);
    expect(input.startsAt).toBe('2026-10-09T23:00:00.000Z');
    expect(input.registrationClosesAt).toBe('2026-10-09T22:00:00.000Z');
    expect([input.name, input.checkinMinutes, input.prizeText, input.tz]).toEqual(['Copa VAL', 30, 'RD$5,000', TZ]);
    expect(tournamentInput({ ...f, checkin: 0 }, TZ).checkinMinutes).toBeNull();
    // Lo que el juego no puede comprobar no se manda encendido.
    const mlbb = emptyForm('mlbb', TODAY);
    const sent = tournamentInput({ ...mlbb, name: 'Copa', settings: { ...mlbb.settings, requireConfirmedId: true, requireVerifiedRank: true } }, TZ).settings;
    expect([sent.requireConfirmedId, sent.requireVerifiedRank]).toEqual([false, false]);
    expect(times({ ...f, closeAtStart: true }, TZ).closesAt).toBe('2026-10-09T23:00:00.000Z');
  });

  it('«Pedir ID confirmado» solo donde se comprueba solo, y «Pedir rango verificado» solo en LoL; apagados por defecto', () => {
    expect(idRequirement('rocket_league')).toEqual({ label: 'Pedir ID confirmado', hint: 'Con su cuenta de Epic conectada.' });
    expect(idRequirement('fortnite')?.hint).toBe('Con su cuenta de Epic conectada.');
    expect(idRequirement('cs2')?.hint).toBe('Con su cuenta de Steam conectada.');
    expect(idRequirement('lol')?.hint).toBe('Comprobado con su Riot ID.');
    expect(idRequirement('valorant')?.hint).toBe('Comprobado con su Riot ID.');
    for (const g of ['mlbb', 'ea_fc', 'nba_2k', 'sf6', 'tekken8', 'smash', 'clash_royale', 'free_fire', 'warzone', 'pubg_mobile'] as const) {
      expect(idRequirement(g)).toBeNull();
      expect(rankRequirement(g)).toBeNull();
    }
    expect(rankRequirement('lol')).toEqual({ label: 'Pedir rango verificado', hint: 'El rango de LoL que da Riot.' });
    expect(rankRequirement('valorant')).toBeNull();
    expect(rankRequirement('cs2')).toBeNull();
    const val = emptyForm('valorant', TODAY).settings;
    expect([val.requireConfirmedId, val.requireVerifiedRank]).toEqual([false, false]);
    expect(withRequirements('valorant', val)).toBe(val);
    expect(withRequirements('smash', { ...val, requireConfirmedId: true })).toMatchObject({ requireConfirmedId: false, requireVerifiedRank: false });
  });

  it('la tabla de puntos de BR: enteros de 0 a 100; el resumen del formato', () => {
    expect(cleanPoints([12, -3, 150, 2.6])).toEqual([12, 0, 100, 3]);
    expect(summary(emptyForm('valorant', TODAY))).toBe('Eliminación simple · Al mejor de 3 y 5 en la final · Solo equipos');
    expect(summary(emptyForm('free_fire', TODAY))).toBe('Battle royale · Solo equipos');
  });
});
