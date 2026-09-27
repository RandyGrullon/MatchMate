import type { GolfCourse } from './course';

/**
 * Campo de ejemplo (par 72, 18 hoyos, SI impares en la ida y pares en la vuelta) para la demo y las pruebas.
 * Los números son inventados: no es ningún campo real.
 */
export const DEMO_PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 5, 4, 4, 4, 3, 5, 4];
export const DEMO_SIS = [7, 3, 17, 1, 11, 5, 15, 9, 13, 8, 16, 2, 10, 4, 12, 18, 6, 14];

export const DEMO_COURSE: GolfCourse = {
  id: 'demo',
  name: 'Campo de ejemplo',
  holes: DEMO_PARS.map((par, i) => ({ par, si: DEMO_SIS[i] })),
  tees: [
    {
      id: 'azul',
      name: 'Azules',
      rating: 71.2,
      slope: 128,
      par: 72,
      front9: { rating: 35.8, slope: 130, par: 36 },
      back9: { rating: 35.4, slope: 126, par: 36 },
    },
    // Rojas: el hoyo 4 es par 4 (par 71) y no traen rating por vuelta.
    { id: 'roja', name: 'Rojas', rating: 70.1, slope: 121, par: 71, pars: DEMO_PARS.map((p, i) => (i === 3 ? 4 : p)) },
  ],
};
