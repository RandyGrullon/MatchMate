import { describe, expect, it } from 'vitest';
import type { Player } from '../../lib/types';
import {
  DEFAULT_TZ,
  PEOPLE_TABS,
  TIMEZONES,
  announceTemplates,
  arrangeAdminTabs,
  countLabel,
  freePlayers,
  guessPlayer,
  infoRows,
  isLeagueHome,
  joinLabel,
  minorsLocked,
  noticesLeft,
  peopleWord,
  reachLine,
  recentNotices,
  searchPlayers,
  timezoneOptions,
  tzLabel,
  tzOffset,
  withMinors,
} from './logic';

const p = (id: string, name: string, extra: Partial<Player> = {}): Player => ({ id, name, averageOverride: null, ...extra });

describe('«¿Quién eres?»', () => {
  const list = [p('3', 'Zoe'), p('1', 'Ana Pérez'), p('2', 'Luis', { uid: 'u-luis' }), p('4', 'Nene', { isMinor: true }), p('5', 'Beto')];

  it('solo los que no tienen cuenta y no son menores, por nombre', () => {
    expect(freePlayers(list).map((x) => x.id)).toEqual(['1', '5', '3']);
  });

  it('adivina solo si hay uno con el mismo nombre (sin acentos ni mayúsculas)', () => {
    expect(guessPlayer([p('3', 'Zoe'), p('1', 'Ana Pérez')], 'ANA PEREZ')).toBe('1');
    expect(guessPlayer([p('1', 'José  Núñez')], 'jose nunez')).toBe('1');
    // Dos iguales: que elija la persona.
    expect(guessPlayer([p('1', 'Ana Pérez'), p('5', 'ana perez')], 'Ana Pérez')).toBeNull();
    expect(guessPlayer(list, 'Pedro')).toBeNull();
    expect(guessPlayer(list, '')).toBeNull();
    expect(guessPlayer(list, null)).toBeNull();
  });

  it('buscar: cada palabra, sin acentos', () => {
    const l = [p('1', 'María José Gómez'), p('2', 'José Luis'), p('3', 'Ana')];
    expect(searchPlayers(l, 'jose').map((x) => x.id)).toEqual(['1', '2']);
    expect(searchPlayers(l, 'gomez maria').map((x) => x.id)).toEqual(['1']);
    expect(searchPlayers(l, '  ')).toHaveLength(3);
    expect(searchPlayers(l, 'pedro')).toEqual([]);
  });
});

describe('inicio de la liga', () => {
  it('solo /l/<id> es el inicio', () => {
    expect(isLeagueHome('/l/abc', '/l/abc')).toBe(true);
    expect(isLeagueHome('/l/abc/', '/l/abc')).toBe(true);
    expect(isLeagueHome('/l/abc/ranking', '/l/abc')).toBe(false);
    expect(isLeagueHome('/l/abcd', '/l/abc')).toBe(false);
  });

  it('nadadores en natación; jugadores en lo demás (también en pádel, aunque compitan por parejas)', () => {
    expect(peopleWord('swimming')).toEqual(['nadador', 'nadadores']);
    expect(peopleWord('padel')).toEqual(['jugador', 'jugadores']);
    expect(peopleWord('football')).toEqual(['jugador', 'jugadores']);
    expect(peopleWord('curling')).toEqual(['jugador', 'jugadores']);
    expect(countLabel(1, peopleWord('swimming'))).toBe('1 nadador');
    expect(countLabel(12, peopleWord('golf'))).toBe('12 jugadores');
  });

  it('«Unirme a la liga» o «Unirme al torneo»', () => {
    expect(joinLabel('liga')).toBe('Unirme a la liga');
    expect(joinLabel(undefined)).toBe('Unirme a la liga');
    expect(joinLabel('torneo')).toBe('Unirme al torneo');
  });

  it('datos de la liga: lo que tiene algo, con el nombre del lugar del deporte y el WhatsApp', () => {
    const fmt = { date: (s: string) => `d(${s})`, longDate: (s: string) => `D(${s})` };
    expect(
      infoRows(
        {
          sport: 'padel',
          kind: 'liga',
          venue: ' Club Naco ',
          schedule: 'Martes 7:00 pm',
          seasonStart: '2026-01-01',
          seasonEnd: '2026-06-30',
          contactName: 'Rosa',
          contactPhone: '809 555-0101',
        },
        fmt,
      ),
    ).toEqual([
      { key: 'venue', label: 'Club', value: 'Club Naco' },
      { key: 'schedule', label: 'Cuándo juegan', value: 'Martes 7:00 pm' },
      { key: 'season', label: 'Temporada', value: 'd(2026-01-01) – d(2026-06-30)' },
      { key: 'contact', label: 'Contacto', value: 'Rosa', phone: '8095550101' },
    ]);
    // Torneo: la fecha (no el horario ni la temporada); contacto solo con nombre, sin WhatsApp.
    expect(
      infoRows({ sport: 'swimming', kind: 'torneo', venue: 'Centro Acuático', schedule: 'x', seasonStart: '2026-10-03', seasonEnd: '2026-10-03', contactName: 'Coach' }, fmt),
    ).toEqual([
      { key: 'venue', label: 'Piscina', value: 'Centro Acuático' },
      { key: 'date', label: 'Fecha', value: 'D(2026-10-03)' },
      { key: 'contact', label: 'Contacto', value: 'Coach' },
    ]);
    expect(infoRows({ venue: '', schedule: '  ', contactName: '', contactPhone: '' }, fmt)).toEqual([]);
    // Temporada a medias: no sale.
    expect(infoRows({ kind: 'liga', seasonStart: '2026-01-01', seasonEnd: '' }, fmt)).toEqual([]);
    // Solo el teléfono: sale el número con su WhatsApp.
    expect(infoRows({ contactPhone: '+18095550101' }, fmt)).toEqual([{ key: 'contact', label: 'Contacto', value: '+18095550101', phone: '+18095550101' }]);
  });
});

describe('avisos a toda la liga', () => {
  const now = Date.parse('2026-09-28T15:00:00Z');
  const at = (h: number) => new Date(now - h * 3_600_000).toISOString();
  const list = [
    { id: 'a', sentAt: at(1) },
    { id: 'b', sentAt: at(30) },
    { id: 'c', sentAt: at(47.9) },
    { id: 'd', sentAt: at(49) },
    { id: 'e', sentAt: 'no es fecha' },
  ];

  it('en el inicio: los de las últimas 48 h, el más nuevo primero, hasta 2, sin los cerrados', () => {
    expect(recentNotices(list, now).map((a) => a.id)).toEqual(['a', 'b']);
    expect(recentNotices(list, now, new Set(['a'])).map((a) => a.id)).toEqual(['b', 'c']);
    expect(recentNotices(list, now, new Set(), 24, 5).map((a) => a.id)).toEqual(['a']);
    expect(recentNotices([], now)).toEqual([]);
  });

  it('textos listos con el lugar de cada deporte', () => {
    expect(announceTemplates('padel')).toContain('Cambio de cancha: ');
    expect(announceTemplates('bowling')).toContain('Cambio de pista: ');
    expect(announceTemplates('swimming')).toContain('Cambio de piscina: ');
    for (const t of [...announceTemplates('golf'), ...announceTemplates(null)]) expect(t.length).toBeLessThanOrEqual(180);
    expect(announceTemplates('football')[0]).toMatch(/lluvia/);
  });

  it('a cuántos llega y cuántos quedan hoy', () => {
    expect(reachLine(5, 12)).toBe('Le llega al teléfono a 5 de 12 miembros (los que activaron los avisos).');
    expect(reachLine(1, 1)).toBe('Le llega al teléfono a 1 de 1 miembro (los que activaron los avisos).');
    // Nunca «a 3 de 2» (el superadmin no cuenta como miembro).
    expect(reachLine(3, 2)).toMatch(/a 3 de 3 miembros/);
    expect(reachLine(0, 8)).toMatch(/^Nadie tiene los avisos activados/);
    expect(noticesLeft({ sentToday: 1, dailyLimit: 3 })).toBe(2);
    expect(noticesLeft({ sentToday: 5, dailyLimit: 3 })).toBe(0);
    expect(noticesLeft(null)).toBeNull();
  });
});

describe('zona horaria', () => {
  it('la de RD primero y por defecto; sin repetidas', () => {
    expect(DEFAULT_TZ).toBe('America/Santo_Domingo');
    expect(TIMEZONES[0].id).toBe(DEFAULT_TZ);
    expect(new Set(TIMEZONES.map((z) => z.id)).size).toBe(TIMEZONES.length);
  });

  it('el teléfono conoce todas las de la lista', () => {
    for (const z of TIMEZONES) expect(() => new Intl.DateTimeFormat('es', { timeZone: z.id })).not.toThrow();
    expect(tzOffset('America/Santo_Domingo', new Date('2026-09-28T12:00:00Z'))).toBe('GMT-4');
    expect(tzOffset('Marte/Base')).toBe('');
  });

  it('agrega la de la liga y la del teléfono si no están', () => {
    const ids = (cur: string | null, dev: string | null) => timezoneOptions(cur, dev).map((z) => z.id);
    expect(ids(DEFAULT_TZ, DEFAULT_TZ)).toEqual(TIMEZONES.map((z) => z.id));
    expect(ids('America/El_Salvador', 'Europe/London').slice(-2)).toEqual(['America/El_Salvador', 'Europe/London']);
    expect(ids(null, null)).toHaveLength(TIMEZONES.length);
    expect(tzLabel('America/El_Salvador')).toBe('America/El Salvador');
    expect(tzLabel(DEFAULT_TZ)).toBe('República Dominicana');
  });
});

describe('liga con menores', () => {
  it('con menores: privada y sin foto obligatoria; sin menores no toca nada', () => {
    const f = { hasMinors: true, visibility: 'public' as const, requirePhoto: true, name: 'x' };
    expect(withMinors(f)).toEqual({ hasMinors: true, visibility: 'private', requirePhoto: false, name: 'x' });
    const g = { hasMinors: false, visibility: 'public' as const, requirePhoto: true };
    expect(withMinors(g)).toBe(g);
  });

  it('el admin la enciende pero no la apaga después de guardada; el superadmin sí', () => {
    expect(minorsLocked(false, false)).toBe(false);
    expect(minorsLocked(undefined, false)).toBe(false);
    expect(minorsLocked(true, false)).toBe(true);
    expect(minorsLocked(true, true)).toBe(false);
  });
});

describe('pestañas del Admin', () => {
  const t = (key: string) => ({ key });
  const generic = ['jugadores', 'miembros', 'buzon', 'liga'].map(t);
  const keys = (r: { tabs: { key: string }[] }) => r.tabs.map((x) => x.key);

  it('boliche: las de siempre y abre en Jugadores', () => {
    const r = arrangeAdminTabs([t('jugadores'), t('aprobar'), t('miembros'), t('buzon'), t('liga')], [], true);
    expect(keys(r)).toEqual(['jugadores', 'aprobar', 'miembros', 'buzon', 'liga']);
    expect(r.defaultKey).toBe('jugadores');
    expect(r.playersMerged).toBe(false);
  });

  it('equipos y golf: la del deporte primero y abre ahí; «Jugadores» se queda', () => {
    const r = arrangeAdminTabs(generic, [t('equipos')], false);
    expect(keys(r)).toEqual(['equipos', 'jugadores', 'miembros', 'buzon', 'liga']);
    expect(r.defaultKey).toBe('equipos');
    expect(r.playersMerged).toBe(false);
    expect(arrangeAdminTabs(generic, [t('campos')], false).defaultKey).toBe('campos');
  });

  it('natación y raqueta: su pestaña de gente reemplaza a «Jugadores» (las cuentas pasan a Miembros)', () => {
    expect(PEOPLE_TABS.has('nadadores') && PEOPLE_TABS.has('parejas')).toBe(true);
    const swim = arrangeAdminTabs(generic, [t('nadadores'), t('clubes')], false);
    expect(keys(swim)).toEqual(['nadadores', 'clubes', 'miembros', 'buzon', 'liga']);
    expect(swim.defaultKey).toBe('nadadores');
    expect(swim.playersMerged).toBe(true);
    const racket = arrangeAdminTabs(generic, [t('parejas')], false);
    expect(keys(racket)).toEqual(['parejas', 'miembros', 'buzon', 'liga']);
    expect(racket.playersMerged).toBe(true);
  });

  it('una del deporte con la clave de una general la reemplaza en su lugar', () => {
    const own = { key: 'jugadores', label: 'Plantel' };
    const r = arrangeAdminTabs(
      generic.map((g) => ({ ...g, label: g.key })),
      [own, { key: 'nadadores', label: 'Nadadores' }],
      false,
    );
    expect(keys(r)).toEqual(['nadadores', 'jugadores', 'miembros', 'buzon', 'liga']);
    expect(r.tabs[1]).toBe(own);
    // Si el deporte trae su propia «jugadores», no se esconde.
    expect(r.playersMerged).toBe(false);
  });

  it('mientras no llegan las del deporte: las generales, en Jugadores', () => {
    const r = arrangeAdminTabs(generic, [], false);
    expect(keys(r)).toEqual(['jugadores', 'miembros', 'buzon', 'liga']);
    expect(r.defaultKey).toBe('jugadores');
  });
});
