/**
 * Las piezas de la Tabla dibujadas sin navegador (renderToString): la tarjeta «Vas 2.º de 6», la lista de Lite con
 * «Tú», la tabla de Pro (columnas que se ordenan, desvanecido y «Desliza ›»), la píldora con menú, los récords, el más
 * mejorado y la píldora «Excel». Todo con los colores del tema (claro y oscuro) y áreas de 44 px.
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { RankingRow } from '../../lib/bowlingSeason';
import { LeagueContext, type LeagueCtx } from '../../lib/league';
import type { League } from '../../lib/types';
import { FeedbackProvider } from '../feedback';
import { LeagueExcelButton } from '../LeagueExcelButton';
import { DEFAULT_HCP, myPlace, placeCopy, seasonRecords, standingsTable } from './logic';
import { MyPlaceCard } from './MyPlaceCard';
import { PillSelect, TuTag } from './parts';
import { RankList } from './RankList';
import { MostImprovedCard, SeasonRecordsCard } from './SeasonExtras';
import { StandingsTable } from './StandingsTable';

const render = (node: ReactNode) => renderToString(h(MemoryRouter, null, node));
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');
/** Ningún color fijo: todo del tema (sirve en claro y en oscuro). */
const noFixedColors = (html: string) => expect(html).not.toMatch(/\b(?:bg|text|border)-(?:white|black|gray|slate|zinc|neutral)\b/);

const row = (playerId: string, name: string, average: number, games: number, high: number, series: number, events: number): RankingRow => ({
  playerId,
  name,
  average,
  games,
  pins: average * games,
  high,
  series,
  events,
});
const rows: RankingRow[] = [
  row('pedro', 'Pedro Gómez', 219, 9, 245, 658, 3),
  row('ana', 'Ana Pérez', 195, 8, 214, 594, 3),
  row('luis', 'Luis Martínez', 194, 9, 224, 605, 3),
  row('jose', 'José Ramírez', 150, 7, 172, 468, 2),
];

describe('tarjeta de tu lugar (Lite)', () => {
  it('el puesto grande, las dos líneas y la barra con sus puntas, en acento suave y sin sombra', () => {
    const html = render(h(MyPlaceCard, { copy: placeCopy(myPlace(rows, 'ana', 'promedio')!, 'promedio') }));
    const t = text(html);
    expect(t).toContain('2.º');
    expect(t).toContain('Vas 2.º de 4, con 195');
    expect(t).toContain('Pedro te lleva 24 pinos');
    expect(t).toContain('Tú · 195');
    expect(t).toContain('1.º · Pedro 219');
    expect(html).toContain(`width:${Math.round((195 / 219) * 100)}%`);
    expect(html).toContain('bg-accent-soft');
    expect(html).not.toContain('card-shadow');
    expect(html).toContain('text-[54px]');
    expect(html).toContain('aria-label="Tu lugar en la tabla"');
    noFixedColors(html);
  });
});

describe('lista de Lite', () => {
  it('puesto, iniciales, nombre y el número; tu fila con «Tú», fondo de acento y tu círculo del color del deporte', () => {
    const html = render(h(RankList, { ranked: rows.map((r, i) => ({ row: r, pos: i + 1 })), value: (r: RankingRow) => r.average, me: 'ana', base: '/l/x' }));
    const t = text(html);
    expect(t).toMatch(/1 PG Pedro Gómez 219 2 AP Ana Pérez Tú 195 3 LM Luis Martínez 194/);
    expect(html.match(/>Tú</g)).toHaveLength(1);
    expect(html.match(/mm-row-me/g)).toHaveLength(1);
    expect(html).toContain('bg-accent text-accent-fg');
    expect(html).toContain('bg-surface-2 text-fg-2');
    // Cada fila abre la página del jugador; sin chevron (como el diseño) y de 60 px.
    expect(html).toContain('href="/l/x/j/luis"');
    expect(html).not.toContain('lucide-chevron-right');
    expect(html).toContain('min-h-[60px]!');
    expect(html).toContain('text-row-num');
    noFixedColors(html);
  });

  it('«Tú» blanca en claro y de acento translúcido en oscuro (las dos formas del oscuro)', () => {
    const html = render(h(TuTag));
    expect(html).toContain('mm-tu');
    expect(html).toContain('.mm-tu{background:var(--surface)}');
    expect(html).toContain('@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .mm-tu');
    expect(html).toContain(':root[data-theme="dark"] .mm-tu{background:color-mix(in srgb,var(--accent) 18%,transparent)}');
  });
});

describe('tabla de Pro', () => {
  const table = (sort: Parameters<typeof standingsTable>[1]['sort']) =>
    render(h(StandingsTable, { rows: standingsTable(rows, { sort, withHcp: false, hcp: DEFAULT_HCP }), sort, onSort: () => {}, me: 'ana', base: '/l/x', totalEvents: 3 }));

  it('# · Jugador · J · Prom · Hcp · Alto · Serie · Asist., la ordenada en acento y subrayada', () => {
    const html = table('promedio');
    const t = text(html);
    expect(t).toMatch(/# Jugador J Prom Hcp Alto Serie Asist\./);
    expect(t).toMatch(/1 Pedro G\. 9 219 8 245 658 3\/3/);
    expect(t).toMatch(/2 Ana P\. Tú 8 195 28 214 594 3\/3/);
    expect(html).toMatch(/aria-sort="descending"[^>]*><button[^>]*aria-label="Ordenar por Promedio"[^>]*text-accent/);
    expect(html).toContain('border-b-2 border-accent');
    expect(html.match(/aria-sort=/g)).toHaveLength(1);
    // Los números de la ordenada, más grandes; los demás, en fg-2.
    expect(html).toContain('text-lg font-bold');
    expect(html).toContain('text-fg-2');
    // Tu fila en acento suave; los nombres abren al jugador.
    expect(html).toContain('bg-accent-soft');
    expect(html).toContain('href="/l/x/j/pedro"');
    noFixedColors(html);
  });

  it('en el teléfono se desliza: 384 px con desvanecido a la derecha y «Desliza ›»', () => {
    const html = table('promedio');
    expect(html).toContain('min-w-[384px]');
    expect(html).toContain('overflow-x-auto');
    expect(html).toMatch(/mask-image:linear-gradient\(90deg, #000 calc\(100% - 42px\), transparent\)/);
    expect(text(html)).toContain('Toca una columna para ordenar');
    expect(text(html)).toContain('Desliza');
  });

  it('cada encabezado es un botón de 44 × 44 px (las columnas de números miden 44); por nombre, de la A a la Z', () => {
    const html = table('nombre');
    expect(html.match(/<button[^>]*aria-label="Ordenar por /g)).toHaveLength(7);
    expect(html.match(/<button[^>]*aria-label="Ordenar por [^"]*" class="[^"]*h-11 w-full/g)).toHaveLength(7);
    expect(html).toContain('grid-cols-[22px_minmax(84px,1fr)_repeat(6,44px)]');
    expect(html).toMatch(/aria-sort="ascending"[^>]*><button[^>]*aria-label="Ordenar por Jugador"/);
    expect(text(html).indexOf('Ana P.')).toBeLessThan(text(html).indexOf('Pedro G.'));
  });
});

describe('píldora con menú', () => {
  it('se ve «Promedio ▾» y el menú del teléfono va encima (un select invisible de 44 px)', () => {
    const html = render(
      h(PillSelect, {
        label: 'Ordenar la tabla por',
        value: 'juego',
        onChange: () => {},
        options: [
          { key: 'promedio', label: 'Promedio' },
          { key: 'juego', label: 'Mejor juego' },
        ],
      }),
    );
    expect(html).toMatch(/<span aria-hidden="true" class="truncate">Mejor juego<\/span>/);
    expect(html).toMatch(/<select aria-label="Ordenar la tabla por"[^>]*class="[^"]*opacity-0/);
    expect(html).toContain('-inset-y-1');
    expect(html).toContain('lucide-chevron-down');
    expect(html).toContain('rounded-full bg-surface-2');
  });

  it('con una sola opción no hay nada que elegir: el nombre, sin flecha ni menú', () => {
    const html = render(h(PillSelect, { label: 'Temporada', value: 's', onChange: () => {}, options: [{ key: 's', label: 'Temporada 2026' }] }));
    expect(text(html)).toContain('Temporada 2026');
    expect(html).not.toContain('<select');
    expect(html).not.toContain('lucide-chevron-down');
  });
});

describe('récords y más mejorado (Pro)', () => {
  it('«Récords de la temporada»: mejor juego, mejor serie y asistencia con quién', () => {
    const html = render(h(SeasonRecordsCard, { records: seasonRecords(rows, 3, 'ana') }));
    const t = text(html);
    expect(t).toContain('Récords de la temporada');
    expect(t).toContain('Mejor juego 245 Pedro G. Mejor serie 658 Pedro G. Asistencia 3/3 Ana y 2 más');
    expect(html).toContain('border-l border-line');
    expect(render(h(SeasonRecordsCard, { records: { game: null, series: null, attendance: null } }))).toBe('');
  });

  it('más mejorado: quién, de cuánto a cuánto y cuánto subió', () => {
    const t = text(
      render(
        h(MostImprovedCard, {
          list: [
            { playerId: 'p1', name: 'Ana', current: 200, previous: 180, delta: 20, games: 6, previousGames: 10 },
            { playerId: 'p2', name: 'Luis', current: 170, previous: 162, delta: 8, games: 9, previousGames: 7 },
          ],
          season: { name: 'Temporada 2026' },
          previous: { name: 'Temporada 2025' },
          base: '/l/x',
        }),
      ),
    );
    expect(t).toContain('Más mejorado');
    expect(t).toContain('Ana');
    expect(t).toContain('180 → 200');
    expect(t).toContain('+20');
    expect(t).toContain('Promedio de Temporada 2026 contra Temporada 2025, con al menos 6 juegos aprobados en las dos.');
  });
});

describe('Excel', () => {
  it('una píldora «Excel» con su ícono que abre la hoja de descargar', () => {
    const league = { id: 'L1', name: 'Liga', visibility: 'private', ownerUid: 'u1' } as League;
    const ctx = { lid: 'L1', league, member: null, isAdmin: true, isOwner: true, isScorer: false, canScore: true, myPlayerId: null, base: '/l/L1' } as LeagueCtx;
    const html = render(h(FeedbackProvider, null, h(LeagueContext.Provider, { value: ctx }, h(LeagueExcelButton, { season: null, events: [], players: [] }))));
    expect(html).toMatch(/<button type="button" aria-haspopup="dialog" title="Descargar en Excel" class="[^"]*rounded-full bg-surface-2[^"]*">/);
    expect(html).toContain('lucide-download');
    expect(text(html)).toContain('Excel');
    expect(html).toContain('after:-inset-y-1');
  });
});
