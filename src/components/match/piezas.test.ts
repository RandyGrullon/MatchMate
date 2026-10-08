/**
 * Las piezas de los partidos en el rediseño «Calma y foco» (raqueta y equipos): la tarjeta del partido (sin «Programado»,
 * «● En vivo» en el color del deporte, «● Por confirmar» en ámbar, tu lado en acento suave), la tabla tranquila (tu fila en
 * acento suave, los puntos grandes, columnas que se esconden en el teléfono), el resultado por confirmar con «No es así» y
 * Confirmar, y «solo el resultado» en una hoja con un botón grande.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { FeedbackProvider } from '../feedback';
import { mkMatch } from '../../pages/sports/racket/logic/testMatch';
import type { StandingRow } from '../../sports/types';
import { ConfirmResultBanner } from './ConfirmResultBanner';
import { MatchCard } from './MatchCard';
import { ResultEntryModal } from './ResultEntryModal';
import { StandingsTable } from './StandingsTable';
import { twoNumbersParser } from './parsers';

const render = (el: ReactElement) => renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, el)));
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('MatchCard', () => {
  it('programado: no lo dice a la vista (solo para el lector de pantalla); tu lado en acento suave', () => {
    const html = render(h(MatchCard, { match: mkMatch({ a: ['Ana', 'Luis'], b: ['Rosa', 'Pedro'], round: 2, court: 'Cancha 1' }), mySide: 1, roundWord: 'Jornada' }));
    expect(html).toContain('sr-only">Programado');
    expect(text(html)).toContain('Jornada 2 · Cancha 1');
    expect(html).toContain('bg-accent-soft');
    // Tarjeta sin borde.
    expect(html).not.toMatch(/class="[^"]*\bborder\b[^"]*rounded-3xl/);
  });

  it('en vivo en el color del deporte y por confirmar en ámbar, con el marcador por set', () => {
    const live = render(h(MatchCard, { match: mkMatch({ a: ['A'], b: ['B'], status: 'live', score: { text: '6-4 2-1' } }) }));
    expect(live).toContain('text-accent');
    expect(text(live)).toContain('En vivo');
    const pending = render(
      h(MatchCard, {
        match: mkMatch({ a: ['A'], b: ['B'], status: 'finished', proposedAt: new Date().toISOString(), proposedSide: 1, score: { text: '6-4 6-3' }, winner: 1 }),
      }),
    );
    expect(pending).toContain('text-warn');
    expect(text(pending)).toContain('Por confirmar');
    expect(text(pending)).toContain('Se confirma solo en');
    expect(pending).toContain('aria-label="Ganó"');
  });
});

describe('StandingsTable', () => {
  const row = (id: string, rank: number, points: number, extra: Partial<StandingRow> = {}): StandingRow =>
    ({ id, rank, points, played: 2, won: 1, drawn: 0, lost: 1, for: 10, against: 8, diff: 2, extra: {}, decidedBy: null, ...extra }) as StandingRow;

  it('tu fila en acento suave, los puntos grandes y las columnas anchas solo en la computadora', () => {
    const html = render(h(StandingsTable, { rows: [row('a', 1, 6), row('b', 2, 3, { decidedBy: 'dif. de sets' })], nameOf: (id: string) => id.toUpperCase(), highlight: ['b'] }));
    expect(html).toContain('bg-accent-soft');
    expect(html).toContain('num pr-4');
    expect(html).toContain('hidden sm:table-cell');
    expect(html).toContain('aria-label="Desempate: dif. de sets"');
    // Sin medallas: el puesto es un número gris.
    expect(html).not.toContain('bg-gold');
  });

  it('sin filas: el aviso vacío', () => {
    expect(text(render(h(StandingsTable, { rows: [], nameOf: (id: string) => id, empty: 'Todavía nada' })))).toContain('Todavía nada');
  });
});

describe('ConfirmResultBanner', () => {
  const finished = mkMatch({ a: ['Ana'], b: ['Rosa'], status: 'finished', proposedAt: new Date().toISOString(), proposedSide: 1, score: { text: '6-4 6-3' }, winner: 1 });

  it('el rival: «● Por confirmar», lo que anotó el otro y «No es así» / Confirmar', () => {
    const t = text(render(h(ConfirmResultBanner, { lid: 'L', match: finished, mySide: 2 })));
    expect(t).toContain('Por confirmar');
    expect(t).toContain('Ana anotó 4-6 3-6');
    expect(t).toContain('No es así');
    expect(t).toContain('Confirmar');
  });

  it('quien lo anotó: «Esperando al rival», sin botones', () => {
    const t = text(render(h(ConfirmResultBanner, { lid: 'L', match: finished, mySide: 1 })));
    expect(t).toContain('Esperando al rival');
    expect(t).not.toContain('Confirmar');
  });
});

describe('ResultEntryModal', () => {
  it('una hoja desde abajo con el marcador grande y UN botón, «Guardar»', () => {
    const html = render(
      h(ResultEntryModal, {
        open: true,
        onClose: () => undefined,
        lid: 'L',
        match: mkMatch({ a: ['Ana'], b: ['Rosa'] }),
        parser: twoNumbersParser(),
        placeholder: '14-10',
        examples: ['11-9'],
      }),
    );
    expect(html).toContain('mm-sheet');
    const t = text(html);
    expect(t).toContain('Anotar resultado');
    expect(t).toContain('Ana vs. Rosa');
    expect(t).toContain('El de la izquierda primero');
    expect(t).toContain('11-9');
    expect(t).toContain('Guardar');
    expect(html).toContain('placeholder="14-10"');
  });
});
