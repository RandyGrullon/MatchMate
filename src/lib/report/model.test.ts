import { describe, expect, it } from 'vitest';
import type { LeagueBadge } from '../data/leagueBadges';
import { formatDate } from '../format';
import type { PrizeSlot, TournamentPrize } from '../data/prizes';
import { cardModel } from '../../prizes/card';
import type { PrizeComp } from '../../prizes/catalog';
import type { PodiumProvider } from '../../prizes/providers';
import { datesText, isGroupRow, podiumsFrom, prizesFrom, reportHeader, rowCells, rowStrong, tablesFor, visibleColumns } from './model';
import { LEAGUE } from './fixtures';

const unit = (ref: string, name: string, players: string[], detail?: string) => ({
  ref,
  name,
  teamId: ref.startsWith('t:') ? ref.slice(2) : null,
  players: players.map((p) => ({ id: p.toLowerCase(), name: p })),
  ...(detail ? { detail } : {}),
});

describe('encabezado del reporte', () => {
  it('liga, deporte, fecha y el lugar con la palabra del deporte', () => {
    const h = reportHeader({ ...LEAGUE, sport: 'padel', venue: 'Club Las Palmas' }, { title: 'Open de Pádel', dates: '2026-10-12', facts: [{ label: 'Formato', value: 'Grupos y cuadro' }] });
    expect(h.subtitle).toBe('Liga Norte · Pádel');
    expect(h.facts).toEqual([
      { label: 'Fecha', value: expect.stringMatching(/^Lunes, 12 de octubre de 2026$/i) },
      { label: 'Club', value: 'Club Las Palmas' },
      { label: 'Formato', value: 'Grupos y cuadro' },
    ]);
    expect(h.fileName).toBe('Open de Pádel');
  });

  it('varias fechas: la primera y la última', () => {
    expect(datesText(['2026-10-14', '2026-10-12', '2026-10-13', '2026-10-12'])).toBe(`${formatDate('2026-10-12')} – ${formatDate('2026-10-14')}`);
    expect(datesText([])).toBe('');
    const h = reportHeader(LEAGUE, { title: 'Copa', dates: ['2026-10-12', '2026-10-14'] });
    expect(h.facts[0].label).toBe('Fechas');
  });

  it('el mismo día repetido (un juego o una ronda por día): «Fecha», no «Fechas»', () => {
    const h = reportHeader(LEAGUE, { title: 'Copa', dates: ['2026-10-12', '2026-10-12', '2026-10-12'] });
    expect(h.facts[0]).toEqual({ label: 'Fecha', value: expect.stringMatching(/^Lunes, 12 de octubre de 2026$/i) });
  });

  it('torneo sin liga: solo el deporte; sin lugar, no sale', () => {
    const h = reportHeader({ ...LEAGUE, kind: 'torneo', name: 'Open', venue: '  ' }, { title: '', dates: '2026-10-12' });
    expect(h.title).toBe('Open');
    expect(h.subtitle).toBe('Boliche');
    expect(h.facts.map((f) => f.label)).toEqual(['Fecha']);
  });
});

describe('campeones', () => {
  const comp: Pick<PrizeComp, 'kind' | 'bowling' | 'racket'> = { kind: 'bowling', bowling: { type: 'torneo', hcpPercent: 80, hasTeams: true } };

  it('cada categoría que premia la competencia, lugares 1 a 3, con empates y lugares vacíos', () => {
    const provider: PodiumProvider = ({ category, place }) => {
      if (category === 'equipo') {
        if (place === 1) return { status: 'listo', units: [unit('t:T1', 'Strikers', ['Ana', 'Beto'], '1125 pinos')] };
        if (place === 2) return { status: 'vacio', units: [] };
        return { status: 'listo', units: [unit('t:T2', 'Spares', ['Carla', 'Dani'], '930 pinos'), unit('t:T3', 'Pinos', ['Eva'], '930 pinos')] };
      }
      return place === 1 ? { status: 'listo', units: [unit('p:a', 'Ana', ['Ana'], '648 pinos')] } : { status: 'sin_resultado', units: [] };
    };
    const podiums = podiumsFrom(comp, provider);
    expect(podiums.map((p) => p.title)).toEqual(['Equipos (scratch)', 'Individual (handicap)']);
    expect(podiums[0].places).toEqual([
      { place: 1, label: '1.er lugar', winners: [{ name: 'Strikers', members: 'Ana y Beto', detail: '1125 pinos' }] },
      { place: 2, label: '2.º lugar', winners: [], note: 'Nadie en este lugar' },
      {
        place: 3,
        label: '3.er lugar',
        winners: [
          { name: 'Spares', members: 'Carla y Dani', detail: '930 pinos' },
          { name: 'Pinos', members: 'Eva', detail: '930 pinos' },
        ],
        note: 'Empate',
      },
    ]);
    // Un jugador solo: su nombre, sin «integrantes».
    expect(podiums[1].places).toEqual([{ place: 1, label: '1.er lugar', winners: [{ name: 'Ana', detail: '648 pinos' }] }]);
  });

  it('sin resultado todavía (o el teléfono no sabe): la categoría no sale; los lugares vacíos del final tampoco', () => {
    expect(podiumsFrom(comp, () => ({ status: 'sin_resultado', units: [] }))).toEqual([]);
    const two: PodiumProvider = ({ category, place }) =>
      category !== 'equipo' ? null : place === 3 ? { status: 'vacio', units: [] } : { status: 'listo', units: [unit(`t:T${place}`, `Equipo ${place}`, ['Ana'])] };
    expect(podiumsFrom(comp, two)[0].places.map((p) => p.place)).toEqual([1, 2]);
    expect(podiumsFrom(comp, () => null)).toEqual([]);
  });

  it('la pareja que se llama como sus jugadores, en cualquier orden, no los repite debajo', () => {
    const pairs: PodiumProvider = ({ category, place }) =>
      category !== 'equipo'
        ? null
        : place === 1
          ? // Los jugadores vienen por nombre; la pareja, en el orden en que se armó.
            { status: 'listo', units: [unit('s:m:1', 'Luis / Ana', ['Ana', 'Luis'])] }
          : place === 2
            ? { status: 'listo', units: [unit('t:T2', 'Luis / Beto', ['Ana', 'Luis'])] }
            : { status: 'vacio', units: [] };
    expect(podiumsFrom(comp, pairs)[0].places.map((p) => p.winners)).toEqual([[{ name: 'Luis / Ana' }], [{ name: 'Luis / Beto', members: 'Ana y Luis' }]]);
  });
});

describe('premios entregados', () => {
  const comp: Pick<PrizeComp, 'kind' | 'bowling' | 'racket'> = { kind: 'bowling', bowling: { type: 'torneo', hcpPercent: 80, hasTeams: true } };
  const design = (id: string, name: string, status: LeagueBadge['status'] = 'activa') => ({ id, name, status }) as LeagueBadge;
  const slot = (id: string, category: PrizeSlot['category'], place: 1 | 2 | 3, badgeId: string, over: Partial<PrizeSlot> = {}): PrizeSlot => ({
    id,
    category,
    division: '',
    label: '',
    place,
    badgeId,
    title: '',
    winners: [],
    verified: true,
    deliveredAt: null,
    deliveredBy: null,
    editableUntil: null,
    updatedAt: '',
    ...over,
  });
  const prize = (slots: PrizeSlot[]): TournamentPrize => ({
    id: 'Z1',
    leagueId: 'L1',
    scope: 'evento',
    refId: 'E1',
    period: 'OCT 2026',
    closedAt: null,
    closedBy: null,
    createdAt: '',
    updatedAt: '',
    slots,
  });
  const names: Record<string, string> = { a: 'Ana', b: 'Beto', c: 'Carla' };
  const nameOf = (id: string) => names[id] ?? 'Jugador';

  it('el lugar, la insignia y quién la recibió (el equipo con sus jugadores); lo no entregado, vacío', () => {
    const model = cardModel(
      comp,
      prize([
        slot('s1', 'equipo', 1, 'B1', { deliveredAt: '2026-10-13', winners: [{ ref: 't:T1', name: 'Strikers', teamId: 'T1', players: ['a', 'b'] }] }),
        slot('s2', 'individual', 1, 'B1', { deliveredAt: '2026-10-13', winners: [{ ref: 'p:c', name: 'Carla', teamId: null, players: ['c'] }] }),
        slot('s3', 'individual', 2, 'B2'),
        // Diseño escondido: no sale (como en la tarjeta de los jugadores).
        slot('s4', 'individual', 3, 'B3'),
      ]),
      [design('B1', 'Campeón'), design('B2', 'Subcampeón'), design('B3', 'Tercero', 'oculta')],
    );
    expect(prizesFrom(model, nameOf)).toEqual([
      { title: 'Equipos (scratch)', rows: [{ place: 1, label: '1.er lugar', badge: 'Campeón', delivered: true, winners: ['Strikers · Ana y Beto'] }] },
      {
        title: 'Individual (handicap)',
        rows: [
          { place: 1, label: '1.er lugar', badge: 'Campeón', delivered: true, winners: ['Carla'] },
          { place: 2, label: '2.º lugar', badge: 'Subcampeón', delivered: false, winners: [] },
        ],
      },
    ]);
  });

  it('sin premios elegidos: nada', () => {
    expect(prizesFrom(cardModel(comp, null, []), nameOf)).toEqual([]);
  });
});

describe('tablas', () => {
  const table = {
    title: 'T',
    columns: [{ label: 'A' }, { label: 'B', only: 'excel' as const }, { label: 'C', only: 'pdf' as const }],
    rows: [[1, 2, 3], { group: 'Grupo' }, { cells: [4, 5, 6], strong: true }],
  };

  it('las columnas de cada formato y las filas especiales', () => {
    expect(visibleColumns(table, 'pdf').map((c) => [c.col.label, c.index])).toEqual([
      ['A', 0],
      ['C', 2],
    ]);
    expect(visibleColumns(table, 'excel').map((c) => c.index)).toEqual([0, 1]);
    expect(table.rows.map(isGroupRow)).toEqual([false, true, false]);
    expect(table.rows.map(rowCells)).toEqual([[1, 2, 3], [], [4, 5, 6]]);
    expect(table.rows.map(rowStrong)).toEqual([false, false, true]);
  });

  it('las tablas de un formato, sin las vacías que no dicen nada', () => {
    const empty = { columns: [], rows: [] };
    const said = { columns: [], rows: [], empty: 'Todavía no hay resultados.' };
    const onlyPdf = { ...table, only: 'pdf' as const };
    expect(tablesFor([table, empty, said, onlyPdf], 'excel')).toEqual([table, said]);
    expect(tablesFor([table, empty, said, onlyPdf], 'pdf')).toEqual([table, said, onlyPdf]);
  });
});
