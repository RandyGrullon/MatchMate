/** Lo del evento del boliche que cambia con el modo (eventPro.ts): las pestañas de Pro, la primera, «•••» y la línea. */
import { describe, expect, it } from 'vitest';
import { currentEventTab, eventExcelName, eventMeta, eventTabOf, eventTabs, liveWhenText, myGamesLook, proToolsLabel, resultsHint, resultsTitle, showsPro } from './eventPro';

const keys = (tabs: { key: string }[]) => tabs.map((t) => t.key).join(',');

describe('event/eventPro', () => {
  it('las pestañas de Pro según quién mira', () => {
    expect(keys(eventTabs({ canScore: false, isAdmin: false, isTorneo: false }))).toBe('juegos,clasificacion');
    expect(eventTabs({ canScore: false, isAdmin: false, isTorneo: false })[1].label).toBe('Resultados');
    expect(eventTabs({ canScore: false, isAdmin: false, isTorneo: true })[1].label).toBe('Clasificación');
    expect(keys(eventTabs({ canScore: true, isAdmin: false, isTorneo: true }))).toBe('juegos,clasificacion,pistas');
    expect(keys(eventTabs({ canScore: true, isAdmin: true, isTorneo: true }))).toBe('inscritos,equipos,pistas,juegos,clasificacion');
    expect(eventTabs({ canScore: true, isAdmin: true, isTorneo: false }).map((t) => t.label)).toEqual(['Planilla', 'Resultados', 'Pistas']);
  });

  it('la primera pestaña: Inscritos para quien organiza un torneo que no está en vivo; si no, la Planilla', () => {
    const admin = eventTabs({ canScore: true, isAdmin: true, isTorneo: true });
    expect(currentEventTab(admin, null, { isAdmin: true, isTorneo: true, live: false })).toBe('inscritos');
    expect(currentEventTab(admin, null, { isAdmin: true, isTorneo: true, live: true })).toBe('juegos');
    expect(currentEventTab(admin, eventTabOf('equipos'), { isAdmin: true, isTorneo: true, live: false })).toBe('equipos');
    // Una pestaña que no tiene (o una que no existe): la primera.
    const viewer = eventTabs({ canScore: false, isAdmin: false, isTorneo: false });
    expect(currentEventTab(viewer, eventTabOf('pistas'), { isAdmin: false, isTorneo: false, live: false })).toBe('juegos');
    expect(eventTabOf('nada')).toBeNull();
  });

  it('lo de Pro también con un link de Pro para quien organiza o anota', () => {
    expect(showsPro(true, false, null)).toBe(true);
    expect(showsPro(false, true, 'juegos')).toBe(true);
    expect(showsPro(false, false, 'juegos')).toBe(false);
    expect(showsPro(false, true, null)).toBe(false);
    expect(myGamesLook(false, true)).toBe('lite');
    expect(myGamesLook(true, true)).toBe('sheet');
    expect(myGamesLook(true, false)).toBe('pro');
  });

  it('las filas de «•••» y el Excel', () => {
    expect(resultsTitle(true)).toBe('Clasificación');
    expect(resultsHint(false)).toBe('Promedio y total de cada uno');
    expect(proToolsLabel(false)).toBe('Planilla, aprobar y pistas');
    expect(proToolsLabel(true)).toBe('Planilla, inscritos y pistas');
    expect(eventExcelName({ name: 'Copa de Ejemplo', type: 'torneo', date: '2026-10-07' })).toBe('Copa de Ejemplo - 2026-10-07.xlsx');
    expect(eventExcelName({ name: '', type: 'practica', date: '2026-10-07' })).toMatch(/^Práctica .+ - 2026-10-07\.xlsx$/);
    expect(liveWhenText(true, '7:30 pm')).toBe('Empieza a las 7:30 pm');
    expect(liveWhenText(false, '7:30 pm')).toBe('En juego');
  });

  it('la línea de debajo del título: Lite con la bolera, Pro con los juegos', () => {
    const ev = { date: '2026-10-07', startTime: null, type: 'practica' as const, games: 3, hcpPercent: 0, hcpBase: 220, teamSize: 0 };
    const league = { schedule: '', venue: 'Bolera de Ejemplo' };
    expect(eventMeta(ev, league, '2026-10-01', false)).toBe('Miércoles 7 oct · Bolera de Ejemplo');
    expect(eventMeta(ev, league, '2026-10-01', true)).toBe('Mié 7 oct · 3 juegos');
    expect(eventMeta({ ...ev, type: 'torneo', hcpPercent: 80, teamSize: 4 }, league, '2026-10-01', false)).toBe('Miércoles 7 oct · 3 juegos · Hcp 80 % de 220 · Equipos de 4');
  });
});
