import { readFileSync } from 'node:fs';
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
  PingPong,
  sportMeta,
  sportsOf,
  TennisBall,
} from './registry';

const ALL = Object.keys(SPORT_FAMILY) as SportId[];

/** Distancia entre dos colores en OKLab, × 100 (≈ 2 es lo mínimo que se nota). */
function oklabDistance(a: string, b: string): number {
  const lab = (hex: string) => {
    const [r, g, bl] = parseHex(hex)!.map((c) => {
      const x = c / 255;
      return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * bl);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * bl);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * bl);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  };
  const [x, y] = [lab(a), lab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100;
}

// Filas que deja la base en sport_status (todas las migraciones, en orden), para comparar con el registro: lo que
// siembran y después los cambios de estado de todos a la vez (p. ej. 20260929001000 abrió los que estaban en beta).
const migrations = import.meta.glob<string>('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true });
function seededSports(): { id: string; family: string; status: string; order: number }[] {
  const rows: { id: string; family: string; status: string; order: number }[] = [];
  const files = Object.entries(migrations).sort(([a], [b]) => a.localeCompare(b));
  for (const [, sql] of files) {
    for (const m of sql.matchAll(/insert into public\.sport_status\s*\(id, family, status, sort_order\)\s*values([\s\S]*?);/gi)) {
      for (const t of m[1].matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z]+)'\s*,\s*'([a-z]+)'\s*,\s*(\d+)\s*\)/g)) {
        rows.push({ id: t[1], family: t[2], status: t[3], order: Number(t[4]) });
      }
    }
    for (const u of sql.matchAll(/update public\.sport_status\s+set status\s*=\s*'([a-z]+)'\s+where status\s*=\s*'([a-z]+)'\s*;/gi)) {
      for (const r of rows) if (r.status === u[2]) r.status = u[1];
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
    // Ping pong: la paleta (cara, mango) y la pelota, con el mismo trazo.
    expect(SPORTS.table_tennis.icon).toBe(PingPong);
    const pp = renderToString(createElement(PingPong, { className: 'size-4' }));
    expect(pp).toMatch(/^<svg[^>]*viewBox="0 0 24 24"/);
    expect(pp).toContain('stroke-width="2"');
    expect(pp).toContain('<circle cx="9.5" cy="14.5" r="6.5">');
    expect(pp).toContain('<circle cx="4.3" cy="4.3" r="1.8">');
  });

  it('ping pong: se llama así, con «Tenis de mesa» como alias, y es de raqueta', () => {
    const m = SPORTS.table_tennis;
    expect([m.name, m.label, m.short, m.lower, m.alias]).toEqual(['Ping pong', 'Ping pong', 'Ping pong', 'ping pong', 'Tenis de mesa']);
    expect(m.family).toBe('racket');
    expect(m.venue).toBe('Club');
    expect(m.units.score).toBe('juegos');
    expect(m.order).toBe(10);
    expect(m.eventTypes.map((t) => t.id)).toEqual(['liga', 'torneo', 'cajas', 'escalera']);
    expect((m.defaultRules().match as { sport: string; bestOf: number }).bestOf).toBe(5);
    expect(SPORT_LIST.filter((x) => x.alias).map((x) => x.id)).toEqual(['table_tennis']);
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

  it('el color de cada deporte no se confunde con el rojo de peligro ni con el ámbar de aviso (claro y oscuro)', () => {
    // El color del deporte pinta toda la app (botones, insignias, lo elegido): no puede parecer un error o un aviso.
    const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
    const light = css.slice(css.indexOf(':root {'));
    const dark = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));
    const token = (block: string, name: string) => new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(block)![1];
    expect([token(light, 'danger'), token(dark, 'danger')]).toEqual(['#c62828', '#f07070']);
    for (const m of SPORT_LIST.filter((x) => x.id !== 'bowling')) {
      const v = accentVars(m.color!)!;
      for (const [mode, accent, block] of [
        ['claro', v.light.accent, light],
        ['oscuro', v.dark.accent, dark],
      ] as const) {
        // El más cercano hoy es el naranja del baloncesto (≈ 6).
        for (const name of ['danger', 'warn']) expect(oklabDistance(accent, token(block, name)), `${m.id} (${mode}) contra --${name}`).toBeGreaterThanOrEqual(5);
      }
    }
    // El ping pong, bien lejos (antes era #dc2626: casi el mismo rojo de --danger, a 1 de distancia).
    const tt = accentVars(SPORTS.table_tennis.color!)!;
    expect(oklabDistance(tt.light.accent, token(light, 'danger'))).toBeGreaterThanOrEqual(15);
    expect(oklabDistance(tt.dark.accent, token(dark, 'danger'))).toBeGreaterThanOrEqual(15);
    expect(oklabDistance(tt.light.accent, token(light, 'warn'))).toBeGreaterThanOrEqual(15);
    expect(oklabDistance(tt.dark.accent, token(dark, 'warn'))).toBeGreaterThanOrEqual(15);
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
    expect(SPORT_GROUPS.map((g) => g.id)).toEqual(['bowling', 'padel', 'tennis', 'pickleball', 'basketball', 'football', 'golf', 'swimming', 'table_tennis']);
    expect(SPORT_GROUPS.find((g) => g.id === 'football')).toMatchObject({ name: 'Fútbol', sports: ['football', 'futsal'] });
    // El ping pong lleva su otro nombre («Tenis de mesa») para el selector; los demás no tienen.
    expect(SPORT_GROUPS.find((g) => g.id === 'table_tennis')).toMatchObject({ name: 'Ping pong', alias: 'Tenis de mesa', sports: ['table_tennis'] });
    expect(SPORT_GROUPS.filter((g) => g.alias).map((g) => g.id)).toEqual(['table_tennis']);
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
