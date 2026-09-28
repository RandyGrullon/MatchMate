import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SCENE_FOR_SPORT } from '../components/splash/scenes';
import { accentVars, contrast, parseHex } from '../lib/theme';
import { countLabel, eventLabel, eventTitle, formatDate, joinList, sportLabel, typeLabel, venueLabel } from '../lib/format';
import { DEFAULT_SPORT_STATUS } from './status';
import { SPORT_FAMILY, type SportId } from './types';
import {
  Basketball,
  DEFAULT_SPORT,
  SPORT_GROUPS,
  SPORT_IDS,
  SPORT_LIST,
  SPORTS,
  dispatchSport,
  getSport,
  groupSports,
  isSportId,
  leagueSport,
  sportMeta,
  sportsOf,
  TennisBall,
} from './registry';

const ALL = Object.keys(SPORT_FAMILY) as SportId[];

// Filas que siembra la base en sport_status (todas las migraciones), para comparar con el registro.
const migrations = import.meta.glob<string>('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true });
function seededSports(): { id: string; family: string; status: string; order: number }[] {
  const rows: { id: string; family: string; status: string; order: number }[] = [];
  for (const sql of Object.values(migrations)) {
    for (const m of sql.matchAll(/insert into public\.sport_status\s*\(id, family, status, sort_order\)\s*values([\s\S]*?);/gi)) {
      for (const t of m[1].matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z]+)'\s*,\s*'([a-z]+)'\s*,\s*(\d+)\s*\)/g)) {
        rows.push({ id: t[1], family: t[2], status: t[3], order: Number(t[4]) });
      }
    }
  }
  return rows;
}

describe('registro de deportes: contrato', () => {
  it('cada SportId tiene su ficha, con su mismo id y la familia de SPORT_FAMILY', () => {
    expect(Object.keys(SPORTS).sort()).toEqual([...ALL].sort());
    expect([...SPORT_IDS].sort()).toEqual([...ALL].sort());
    for (const id of ALL) {
      const m = SPORTS[id];
      expect(m.id).toBe(id);
      expect(m.family).toBe(SPORT_FAMILY[id]);
      expect(getSport(id)).toBe(m);
      expect(sportMeta(id)).toBe(m);
    }
  });

  it('nombres, lugar, unidades e icono en todos', () => {
    for (const m of SPORT_LIST) {
      for (const text of [m.name, m.label, m.short, m.lower, m.venue, m.venueHint, m.units.score, ...m.units.match, ...m.units.side]) {
        expect(text.trim()).not.toBe('');
      }
      expect(m.lower).toBe(m.lower.toLowerCase());
      expect(['Bolera', 'Club', 'Cancha', 'Campo', 'Piscina']).toContain(m.venue);
      expect(m.icon).toBeTruthy();
    }
    expect(SPORTS.bowling.venue).toBe('Bolera');
    expect(SPORTS.swimming.venue).toBe('Piscina');
    expect(SPORTS.bowling.units.score).toBe('pinos');
  });

  it('cada deporte con su icono (tenis: pelota de tenis; baloncesto: balón), dibujados con el trazo de lucide', () => {
    const byIcon = new Map<unknown, SportId[]>();
    for (const m of SPORT_LIST) byIcon.set(m.icon, [...(byIcon.get(m.icon) ?? []), m.id]);
    // Solo el fútbol de campo y el de sala comparten (son el mismo deporte con dos modalidades).
    expect([...byIcon.values()].filter((ids) => ids.length > 1)).toEqual([['football', 'futsal']]);
    expect(SPORTS.tennis.icon).toBe(TennisBall);
    expect(SPORTS.basketball.icon).toBe(Basketball);
    for (const Icon of [TennisBall, Basketball]) {
      const svg = renderToString(createElement(Icon, { className: 'size-4' }));
      expect(svg).toMatch(/^<svg[^>]*viewBox="0 0 24 24"/);
      expect(svg).toMatch(/class="lucide [^"]*size-4"/);
      expect(svg).toContain('stroke-width="2"');
      expect(svg).toContain('<circle cx="12" cy="12" r="10">');
    }
  });

  it('color por deporte: el boliche usa el de la app; los demás, uno propio que se lee en claro y en oscuro', () => {
    expect(SPORTS.bowling.color).toBeNull();
    // Fútbol de campo y sala comparten el suyo; los demás son distintos entre sí.
    expect(SPORTS.futsal.color).toBe(SPORTS.football.color);
    const colors = SPORT_LIST.filter((m) => m.id !== 'bowling' && m.id !== 'futsal').map((m) => m.color);
    expect(new Set(colors).size).toBe(colors.length);
    for (const m of SPORT_LIST.filter((x) => x.id !== 'bowling')) {
      expect(m.color).toMatch(/^#[0-9a-f]{6}$/);
      const v = accentVars(m.color!)!;
      expect(contrast(parseHex(v.light.accent)!, parseHex('#ffffff')!)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(parseHex(v.dark.accent)!, parseHex('#161922')!)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(parseHex(v.light.accent)!, parseHex(v.light.fg)!)).toBeGreaterThanOrEqual(4.5);
      // Ninguno es el morado de la app (así se nota que es otra liga).
      expect(m.color).not.toBe('#4338ca');
    }
  });

  it('las reglas por defecto pasan su propia validación, son JSON plano y salen como copia nueva', () => {
    for (const m of SPORT_LIST) {
      const rules = m.defaultRules();
      expect(m.validateRules(rules), m.id).toEqual([]);
      // Se guardan en leagues.rules (jsonb): lo que vuelve de la base es igual.
      expect(JSON.parse(JSON.stringify(rules))).toEqual(rules);
      const again = m.defaultRules();
      expect(again).toEqual(rules);
      expect(again).not.toBe(rules);
      for (const [k, v] of Object.entries(again)) {
        if (typeof v === 'object' && v !== null) expect(v, `${m.id}.${k}`).not.toBe(rules[k]);
      }
    }
  });

  it('las reglas de cada deporte vienen de su motor', () => {
    expect((SPORTS.padel.defaultRules().match as { sport: string; deuce: string }).sport).toBe('padel');
    expect((SPORTS.tennis.defaultRules().match as { sport: string }).sport).toBe('tennis');
    expect((SPORTS.pickleball.defaultRules().match as { gameTo: number }).gameTo).toBe(11);
    expect((SPORTS.basketball.defaultRules().match as { periods: number }).periods).toBe(4);
    expect((SPORTS.football.defaultRules().match as { players: number }).players).toBe(11);
    expect((SPORTS.futsal.defaultRules().match as { players: number; variant: string }).variant).toBe('futsal');
    expect(SPORTS.bowling.defaultRules()).toEqual({});
  });

  it('la validación rechaza reglas malas (y lo que no es un objeto)', () => {
    for (const m of SPORT_LIST) {
      expect(m.validateRules(null).length, m.id).toBeGreaterThan(0);
      expect(m.validateRules([]).length, m.id).toBeGreaterThan(0);
      expect(m.validateRules('x').length, m.id).toBeGreaterThan(0);
      if (m.id !== 'bowling') expect(m.validateRules({}).length, m.id).toBeGreaterThan(0);
    }
    // Reglas de otro deporte de la misma familia no sirven.
    expect(SPORTS.padel.validateRules(SPORTS.tennis.defaultRules()).length).toBeGreaterThan(0);
    expect(SPORTS.futsal.validateRules(SPORTS.football.defaultRules()).length).toBeGreaterThan(0);
    const padel = SPORTS.padel.defaultRules();
    expect(SPORTS.padel.validateRules({ ...padel, match: { ...(padel.match as object), doubles: false } })).toContain('El pádel siempre es en dobles.');
    const futbol = SPORTS.football.defaultRules();
    expect(SPORTS.football.validateRules({ ...futbol, table: { win: 1, draw: 3, loss: 0 } }).length).toBeGreaterThan(0);
    expect(SPORTS.basketball.validateRules({ ...SPORTS.basketball.defaultRules(), match: { variant: '5x5', periods: 0 } }).length).toBeGreaterThan(0);
    expect(SPORTS.swimming.validateRules({ pool: 33, lanes: 6, points: [6, 4] })).toEqual(['La piscina es de 25 o de 50 metros.']);
    expect(SPORTS.golf.validateRules({ competition: { format: 'stroke', basis: 'net', allowance: 120 }, meritPoints: [3, 2, 1] })).toEqual([
      'El % de handicap va de 0 a 100.',
    ]);
  });

  it('la animación de cada deporte es la de scenes.ts', () => {
    for (const id of ALL) expect(SPORTS[id].scene, id).toBe(SCENE_FOR_SPORT[id]);
  });

  it('coincide con lo que siembra la base en sport_status (ids, familia, orden y estado inicial)', () => {
    const rows = seededSports();
    expect(rows.map((r) => r.id).sort()).toEqual([...ALL].sort());
    for (const r of rows) {
      const id = r.id as SportId;
      expect(SPORTS[id].family, r.id).toBe(r.family);
      expect(SPORTS[id].order, r.id).toBe(r.order);
      expect(DEFAULT_SPORT_STATUS[id], r.id).toBe(r.status);
    }
    expect(SPORT_LIST.map((m) => m.id)).toEqual([...rows].sort((a, b) => a.order - b.order).map((r) => r.id));
  });

  it('todos los deportes ya tienen sus pantallas en esta versión', () => {
    expect(SPORT_LIST.filter((m) => !m.ready).map((m) => m.id)).toEqual([]);
    expect(SPORTS.padel.phase).toBe(1);
  });

  it('tipos de evento: el boliche, torneo y práctica como hoy; los demás, los de su migración', () => {
    expect(SPORTS.bowling.eventTypes.map((t) => [t.id, t.label, t.plural])).toEqual([
      ['torneo', 'Torneo', 'Torneos'],
      ['practica', 'Práctica', 'Prácticas'],
    ]);
    for (const m of SPORT_LIST) {
      if (!m.ready) expect(m.eventTypes, m.id).toEqual([]);
      for (const t of m.eventTypes) expect(t.id).toMatch(/^[a-z_]{1,30}$/); // el CHECK de events.type
    }
    expect(SPORTS.bowling.photos).toBe(true);
    expect(SPORT_LIST.filter((m) => m.photos).map((m) => m.id)).toEqual(['bowling']);
  });

  it('fútbol: campo y sala son un solo deporte con modalidad', () => {
    expect(SPORTS.football.name).toBe('Fútbol');
    expect(SPORTS.futsal.name).toBe('Fútbol');
    expect([SPORTS.football.modality, SPORTS.futsal.modality]).toEqual(['Campo', 'Sala']);
    expect(SPORTS.football.group).toBe(SPORTS.futsal.group);
    const others = SPORT_LIST.filter((m) => m.group !== 'football');
    expect(others.every((m) => m.modality === null && m.group === m.id)).toBe(true);
    // Nombres cortos distintos para las insignias.
    expect(new Set(SPORT_LIST.map((m) => m.short)).size).toBe(SPORT_LIST.length);
  });
});

describe('registro de deportes: funciones', () => {
  it('isSportId y sportMeta', () => {
    expect(isSportId('padel')).toBe(true);
    expect(isSportId('cricket')).toBe(false);
    expect(isSportId('toString')).toBe(false);
    expect(isSportId(null)).toBe(false);
    expect(sportMeta('cricket')).toBeNull();
    expect(sportMeta(undefined)).toBeNull();
  });

  it('una liga sin deporte es de boliche', () => {
    expect(DEFAULT_SPORT).toBe('bowling');
    expect(leagueSport({ id: 'l1' })).toBe('bowling');
    expect(leagueSport({ id: 'l1', sport: null })).toBe('bowling');
    expect(leagueSport({ id: 'l1', sport: '' })).toBe('bowling');
    expect(leagueSport({ id: 'l1', sport: 'padel' })).toBe('padel');
  });

  it('desvío: los deportes de esta versión, listos; uno que no conoce: actualizar', () => {
    expect(dispatchSport('bowling')).toMatchObject({ kind: 'ready', sport: 'bowling' });
    expect(dispatchSport(null)).toMatchObject({ kind: 'ready', sport: 'bowling' });
    expect(dispatchSport('padel')).toMatchObject({ kind: 'ready', sport: 'padel', meta: SPORTS.padel });
    expect(dispatchSport('futsal')).toMatchObject({ kind: 'ready', sport: 'futsal' });
    expect(dispatchSport('volleyball')).toEqual({ kind: 'unknown', sport: 'volleyball' });
    expect(dispatchSport('__proto__')).toEqual({ kind: 'unknown', sport: '__proto__' });
  });

  it('deportes de una lista de ligas, en orden y sin repetir', () => {
    const ligas = [{ id: 'a', sport: 'padel' }, { id: 'b' }, { id: 'c', sport: 'bowling' }, { id: 'd', sport: 'softball' }, { id: 'e', sport: 'padel' }];
    expect(sportsOf(ligas)).toEqual(['bowling', 'padel', 'softball']);
    expect(sportsOf([])).toEqual([]);
  });

  it('grupos del selector: el fútbol junta campo y sala', () => {
    expect(SPORT_GROUPS.map((g) => g.id)).toEqual(['bowling', 'padel', 'tennis', 'pickleball', 'basketball', 'football', 'golf', 'swimming']);
    expect(SPORT_GROUPS.find((g) => g.id === 'football')).toMatchObject({ name: 'Fútbol', sports: ['football', 'futsal'] });
    expect(groupSports(['futsal', 'bowling'])).toMatchObject([
      { id: 'bowling', sports: ['bowling'] },
      { id: 'football', sports: ['futsal'] },
    ]);
    expect(groupSports([])).toEqual([]);
  });
});

describe('etiquetas por deporte (format.ts)', () => {
  const practica = { type: 'practica', name: '', date: '2026-09-15' };
  const torneo = { type: 'torneo', name: '', date: '2025-11-15' };

  it('el boliche se nombra igual que en BowlingX', () => {
    expect(typeLabel('torneo')).toBe('Torneo');
    expect(typeLabel('practica')).toBe('Práctica');
    expect(eventLabel(practica)).toBe(`Práctica ${formatDate('2026-09-15')}`);
    expect(eventLabel(torneo)).toBe('Torneo 2025');
    expect(eventLabel({ ...torneo, name: 'Copa X' })).toBe('Copa X');
    expect(eventTitle({ ...torneo, name: 'Copa X' })).toBe(`Torneo · Copa X · ${formatDate('2025-11-15')}`);
    expect(eventLabel(practica, 'bowling')).toBe(eventLabel(practica));
  });

  it('otros deportes: el tipo del registro o el id con mayúscula, y la fecha', () => {
    expect(typeLabel('americano', 'padel')).toBe('Americano');
    expect(typeLabel('liga_parejas', 'padel')).toBe('Liga parejas');
    expect(typeLabel('torneo', 'softball')).toBe('Torneo');
    expect(eventLabel({ type: 'americano', name: '', date: '2026-09-15' }, 'padel')).toBe(`Americano ${formatDate('2026-09-15')}`);
    expect(eventTitle({ type: 'americano', name: 'Noche', date: '2026-09-15' }, 'padel')).toBe(`Americano · Noche · ${formatDate('2026-09-15')}`);
  });

  it('nombre del deporte, lugar, cantidades y listas', () => {
    expect(sportLabel(null)).toBe('Boliche');
    expect(sportLabel('futsal')).toBe('Fútbol sala');
    expect(sportLabel('softball')).toBe('Otro deporte');
    expect(venueLabel(undefined)).toBe('Bolera');
    expect(venueLabel('padel')).toBe('Club');
    expect(venueLabel('swimming')).toBe('Piscina');
    expect(venueLabel('golf')).toBe('Campo');
    expect(countLabel(1, SPORTS.padel.units.match)).toBe('1 partido');
    expect(countLabel(3, SPORTS.padel.units.match)).toBe('3 partidos');
    expect(countLabel(0, SPORTS.bowling.units.match)).toBe('0 juegos');
    expect(joinList([])).toBe('');
    expect(joinList(['boliche'])).toBe('boliche');
    expect(joinList(['boliche', 'pádel'])).toBe('boliche y pádel');
    expect(joinList(['boliche', 'pádel', 'tenis'])).toBe('boliche, pádel y tenis');
  });
});
