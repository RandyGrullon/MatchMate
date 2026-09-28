import { describe, expect, it } from 'vitest';
import { ADMIN_TOUR, EVENT_TOUR, HOME_TOUR, LEAGUE_TOUR, sportLeagueTour } from './tours';

/** Palabras del boliche que no pueden salirle a quien juega otro deporte. */
const BOWLING = /boliche|bolera|pines|pinos|promedio|marcador|pr[aá]ctica/i;

describe('tours', () => {
  it('el del Home no habla de ningún deporte (lo ve el de fútbol igual que el de boliche)', () => {
    for (const s of HOME_TOUR) expect(`${s.title} ${s.body}`).not.toMatch(/boliche|bolera|pines|pinos|promedio|marcador/i);
  });

  it('el de la liga de otro deporte: con los nombres de sus pestañas y sin nada del boliche', () => {
    const golf = sportLeagueTour({ home: 'Rondas', feed: null, standings: 'Orden de mérito', profile: 'Mi golf', admin: true });
    expect(golf.map((s) => s.target)).toEqual(['portada', 'secciones', 'tab-ranking', 'tab-perfil', 'buzon', 'cambiar-liga']);
    expect(golf[1].body).toBe('Rondas, Orden de mérito, Mi golf y Admin. Desliza para ver todas.');
    expect(golf[2].title).toBe('Orden de mérito');
    const team = sportLeagueTour({ home: 'Calendario', feed: 'Partidos', standings: 'Tabla', profile: 'Mi equipo', admin: false });
    expect(team.map((s) => s.target)).toContain('tab-juegos');
    expect(team[1].body).toBe('Calendario, Partidos, Tabla y Mi equipo. Desliza para ver todas.');
    for (const s of [...golf, ...team]) expect(`${s.title} ${s.body}`).not.toMatch(BOWLING);
  });

  it('los del boliche siguen igual (solo salen en sus pantallas)', () => {
    expect(LEAGUE_TOUR.length).toBeGreaterThan(0);
    expect(EVENT_TOUR.length).toBeGreaterThan(0);
    expect(ADMIN_TOUR[0].body).toMatch(/Aprobar/);
  });
});
