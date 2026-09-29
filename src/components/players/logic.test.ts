/**
 * «Agregar jugador» según el deporte: qué se pide, cómo se lee lo escrito y lo que sale en la lista.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  draftFromAttrs,
  emptyDraft,
  parseAverage,
  parseGolfIndex,
  parseJersey,
  parseManyNames,
  parseStats,
  readTeamPrefs,
  statKind,
  statSummary,
  teamPositions,
  withTeamPrefs,
} from './logic';
import { SportStatFields } from './SportStatFields';
import { statWord } from './AddPlayerModal';

describe('qué pide cada deporte', () => {
  it('agrupa los deportes; sin deporte es boliche', () => {
    expect(statKind(null)).toBe('bowling');
    expect(statKind('bowling')).toBe('bowling');
    expect(['padel', 'tennis', 'pickleball'].map(statKind)).toEqual(['racket', 'racket', 'racket']);
    expect(['basketball', 'football', 'futsal'].map(statKind)).toEqual(['team', 'team', 'team']);
    expect(statKind('golf')).toBe('golf');
    expect(statKind('swimming')).toBe('swimming');
    expect(statKind('curling')).toBe('plain');
    expect(statWord('tennis')).toBe('su nivel');
    expect(statWord('swimming')).toBe('');
  });

  it('las posiciones son las de las plantillas', () => {
    expect(teamPositions('basketball')).toContain('Base');
    expect(teamPositions('futsal')).toContain('Portero');
    expect(teamPositions('golf')).toEqual([]);
  });
});

describe('leer lo que escribe el admin', () => {
  it('promedio del boliche: como siempre (redondeado, entre 0 y 300)', () => {
    expect(parseAverage('')).toBeNull();
    expect(parseAverage('185.6')).toBe(186);
    expect(parseAverage('350')).toBe(300);
    expect(parseAverage('abc')).toBe('invalido');
  });

  it('Index de golf: coma o punto, plus con +, de -10 a 54', () => {
    expect(parseGolfIndex('')).toBeNull();
    expect(parseGolfIndex('12,4')).toBe(12.4);
    expect(parseGolfIndex('+1.2')).toBe(-1.2);
    expect(parseGolfIndex('54')).toBe(54);
    expect(parseGolfIndex('55')).toBe('invalido');
    expect(parseGolfIndex('+11')).toBe('invalido');
    expect(parseGolfIndex('doce')).toBe('invalido');
  });

  it('dorsal: entero de 0 a 99', () => {
    expect(parseJersey('')).toBeNull();
    expect(parseJersey('7')).toBe(7);
    expect(parseJersey('0')).toBe(0);
    expect(parseJersey('100')).toBe('invalido');
    expect(parseJersey('7.5')).toBe('invalido');
  });

  it('solo cuenta el campo del deporte, con la escala del deporte', () => {
    const all = { average: '180', level: '4.5', index: '10', position: 'Base', jersey: '23' };
    expect(parseStats('bowling', all)).toEqual({ ok: true, stats: { averageOverride: 180, level: null, index: null, position: null, jersey: null } });
    expect(parseStats('tennis', all)).toEqual({ ok: true, stats: { averageOverride: null, level: 4.5, index: null, position: null, jersey: null } });
    expect(parseStats('golf', all)).toEqual({ ok: true, stats: { averageOverride: null, level: null, index: 10, position: null, jersey: null } });
    expect(parseStats('basketball', all)).toEqual({ ok: true, stats: { averageOverride: null, level: null, index: null, position: 'Base', jersey: 23 } });
    expect(parseStats('swimming', all)).toEqual({ ok: true, stats: { averageOverride: null, level: null, index: null, position: null, jersey: null } });
  });

  it('fuera de la escala: dice cuál es', () => {
    expect(parseStats('pickleball', { ...emptyDraft, level: '9' })).toEqual({ ok: false, error: 'El DUPR va de 2 a 8.' });
    expect(parseStats('padel', { ...emptyDraft, level: '8' })).toEqual({ ok: false, error: 'El nivel va de 0 a 7.' });
    expect(parseStats('tennis', { ...emptyDraft, level: '0.5' })).toMatchObject({ ok: false });
    expect(parseStats('padel', { ...emptyDraft, level: '3,5' })).toMatchObject({ ok: true, stats: { level: 3.5 } });
    expect(parseStats('football', { ...emptyDraft, jersey: '120' })).toMatchObject({ ok: false });
    expect(parseStats('golf', { ...emptyDraft, index: '60' })).toMatchObject({ ok: false });
  });
});

describe('posición y dorsal en players.attrs.team', () => {
  it('conserva lo demás de attrs y quita `team` si queda vacío', () => {
    const attrs = { level: 4, golf: { index: 3 } };
    const next = withTeamPrefs(attrs, { position: 'Portero', jersey: 1 });
    expect(next).toEqual({ level: 4, golf: { index: 3 }, team: { position: 'Portero', jersey: 1 } });
    expect(readTeamPrefs(next)).toEqual({ position: 'Portero', jersey: 1 });
    expect(withTeamPrefs(next, { position: null, jersey: null })).toEqual({ level: 4, golf: { index: 3 } });
    expect(attrs).toEqual({ level: 4, golf: { index: 3 } });
  });

  it('lo raro no sirve', () => {
    expect(readTeamPrefs(null)).toEqual({ position: null, jersey: null });
    expect(readTeamPrefs({ team: { position: '  ', jersey: 150 } })).toEqual({ position: null, jersey: null });
  });
});

describe('lo que sale en la lista y al editar', () => {
  it('el número del deporte, corto', () => {
    expect(statSummary('padel', { level: 4.5 })).toBe('Nivel 4.5');
    expect(statSummary('tennis', { ntrp: 4 })).toBe('NTRP 4.0');
    expect(statSummary('pickleball', { dupr: 3.752 })).toBe('DUPR 3.752');
    expect(statSummary('golf', { golf: { index: -1.2, at: '2026-09-01' } })).toBe('Index +1.2');
    expect(statSummary('basketball', { team: { position: 'Base', jersey: 7 } })).toBe('Base · #7');
    expect(statSummary('football', { team: { jersey: 9 } })).toBe('#9');
    expect(statSummary('bowling', { level: 4 })).toBeNull();
    expect(statSummary('padel', {})).toBeNull();
  });

  it('al editar, el formulario empieza con lo guardado (y vuelve a leerse igual)', () => {
    expect(draftFromAttrs('bowling', {}, 190)).toMatchObject({ average: '190' });
    expect(draftFromAttrs('tennis', { ntrp: 3.5 }, null)).toMatchObject({ level: '3.5' });
    expect(draftFromAttrs('golf', { golf: { index: -2 } }, null)).toMatchObject({ index: '+2' });
    const d = draftFromAttrs('futsal', { team: { position: 'Delantero', jersey: 10 } }, null);
    expect(d).toMatchObject({ position: 'Delantero', jersey: '10' });
    expect(parseStats('futsal', d)).toMatchObject({ ok: true, stats: { position: 'Delantero', jersey: 10 } });
    expect(parseStats('golf', draftFromAttrs('golf', { golf: { index: -2 } }, null))).toMatchObject({ ok: true, stats: { index: -2 } });
  });
});

describe('«Agregar varios»: un nombre por línea', () => {
  it('limpia viñetas y espacios, no repite y separa los que ya están', () => {
    const r = parseManyNames('1. Ana  Pérez\n- Luis Gómez\n\n• ana pérez\n  José Núñez \nJOSE NUNEZ\nCarla', ['Carla', 'Pedro']);
    expect(r.names).toEqual(['Ana Pérez', 'Luis Gómez', 'José Núñez']);
    expect(r.existing).toEqual(['Carla']);
    expect(r.repeated).toBe(2);
  });

  it('nada escrito: nada que agregar; los nombres largos se cortan a 60', () => {
    expect(parseManyNames('  \n \n')).toEqual({ names: [], existing: [], repeated: 0 });
    expect(parseManyNames('x'.repeat(80)).names[0]).toHaveLength(60);
  });
});

describe('campos del deporte (sin navegador)', () => {
  const render = (sport: string) => renderToString(h(SportStatFields, { sport, draft: emptyDraft, onChange: () => undefined }));

  it('cada deporte con lo suyo', () => {
    expect(render('bowling')).toContain('Promedio fijo');
    expect(render('tennis')).toContain('NTRP');
    expect(render('pickleball')).toContain('DUPR');
    expect(render('padel')).toContain('Nivel');
    expect(render('golf')).toContain('Handicap Index');
    const basket = render('basketball');
    expect(basket).toContain('Posición preferida');
    expect(basket).toContain('Pívot');
    expect(basket).toContain('Dorsal');
    expect(render('swimming')).toBe('');
  });
});
