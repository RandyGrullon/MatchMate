/**
 * Esports en Hoy y en Ligas: cuándo sale la fila que lleva a `/esports`, la fila misma, y el aviso de «Tu ID pasó a
 * otra cuenta» (alguien entró con esa cuenta de Epic, Steam o Riot en otra cuenta). También a dónde lleva
 * `/d/esports` (al índice de esports, no a Hoy).
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { IdMove } from '../../lib/data/esportsIds';
import { sportHomeTarget } from '../../pages/SportHomePage';
import * as row from './EsportsHomeRow';
import { EsportsRowCard, esportsIdMoveNotice, showsEsportsRow } from './EsportsHomeRow';

const move = (patch: Partial<IdMove>): IdMove => ({
  id: 'm1',
  game: 'fortnite',
  platform: '',
  idDisplay: 'NinjaDR',
  provider: 'epic',
  createdAt: '2026-10-08T10:00:00Z',
  ...patch,
});

describe('la fila de esports', () => {
  it('sale con el deporte activo en esports o si la cuenta tiene equipos o inscripciones', () => {
    expect(showsEsportsRow({ active: null, teams: 0, entries: 0 })).toBe(false);
    expect(showsEsportsRow({ active: 'padel', teams: 0, entries: 0 })).toBe(false);
    expect(showsEsportsRow({ active: 'esports', teams: 0, entries: 0 })).toBe(true);
    expect(showsEsportsRow({ active: 'bowling', teams: 1, entries: 0 })).toBe(true);
    expect(showsEsportsRow({ active: null, teams: 0, entries: 2 })).toBe(true);
  });

  it('una fila que lleva a /esports, con el control en el violeta del deporte', () => {
    const out = renderToString(h(MemoryRouter, null, h(EsportsRowCard, { title: 'Esports', subtitle: 'Tus equipos y torneos' })));
    expect(out).toContain('href="/esports"');
    expect(out).toContain('Tus equipos y torneos');
    expect(out).toContain('mm-tint-esports');
    expect(out).toContain('lucide-gamepad');
    expect(out).toContain('min-h-row ');
    // En Pro, la fila densa.
    expect(renderToString(h(MemoryRouter, null, h(EsportsRowCard, { title: 'Torneos de esports', subtitle: 'x', pro: true })))).toContain('min-h-row-pro');
  });
});

describe('el aviso de «Tu ID pasó a otra cuenta»', () => {
  it('título, texto y «Ver» a Mi ID de ese juego; se puede cerrar y al cerrarlo queda visto', () => {
    const seen: string[] = [];
    const n = esportsIdMoveNotice([move({})], (id) => void seen.push(id))!;
    expect(n).toMatchObject({
      id: 'esports-id-move:m1',
      kind: 'admin',
      title: 'Tu ID NinjaDR de Fortnite pasó a otra cuenta',
      text: 'Alguien entró con esa cuenta de Epic en otra cuenta de MatchMate.',
      action: { label: 'Ver', to: '/esports/mi-id?juego=fortnite' },
      dismissible: true,
    });
    expect(n.icon).toBeTruthy();
    n.onDismiss!();
    expect(seen).toEqual(['m1']);
  });

  it('Steam y Riot; con varios, el más nuevo primero', () => {
    expect(esportsIdMoveNotice([move({ game: 'cs2', idDisplay: '22202', provider: 'steam' })])?.text).toBe(
      'Alguien entró con esa cuenta de Steam en otra cuenta de MatchMate.',
    );
    const n = esportsIdMoveNotice([
      move({ id: 'viejo', createdAt: '2026-10-01T10:00:00Z' }),
      move({ id: 'nuevo', game: 'lol', idDisplay: 'Ana#LAN', provider: 'riot', createdAt: '2026-10-07T10:00:00Z' }),
    ])!;
    expect(n).toMatchObject({
      id: 'esports-id-move:nuevo',
      title: 'Tu ID Ana#LAN de League of Legends pasó a otra cuenta',
      text: 'Alguien entró con esa cuenta de Riot en otra cuenta de MatchMate.',
      action: { to: '/esports/mi-id?juego=lol' },
    });
  });

  it('nada sin avisos; ya no hay aviso de reclamos', () => {
    expect(esportsIdMoveNotice([])).toBeNull();
    expect(row).not.toHaveProperty('esportsAppealNotice');
    expect(typeof row.useEsportsIdMoveNotice).toBe('function');
  });
});

describe('/d/esports', () => {
  it('lleva al índice de esports; los demás deportes, a Hoy', () => {
    expect(sportHomeTarget('esports')).toBe('/esports');
    expect(sportHomeTarget('padel')).toBe('/');
    expect(sportHomeTarget(null)).toBe('/');
  });
});
