/**
 * La hoja de un juego suelto dibujada sin navegador (renderToString): uno nuevo (hoy, tres casillas, «Guardar» sin
 * juegos no se puede tocar), uno que ya existe (sus juegos, su bolera, «Borrar» y el interruptor apagado) y lo que
 * sale de las casillas al guardar.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { SoloSession } from '../../lib/data/solo';
import { FeedbackProvider } from '../feedback';
import { SoloGameSheet, slotsToGames, soloSheetChanged, type SoloSheetValues } from './SoloGameSheet';

const render = (session: SoloSession | null, venues: string[] = []) =>
  renderToString(
    h(MemoryRouter, null, h(FeedbackProvider, null, h(SoloGameSheet, { session, venues, today: '2026-09-28', onClose: () => undefined }))),
  );
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

const existing: SoloSession = {
  id: 's1',
  userId: 'u1',
  playedOn: '2026-09-20',
  venue: 'Bolera Norte',
  note: 'Con los panas',
  scores: [210, 180, 190, 200],
  frames: { '0': { rolls: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10] } },
  shared: false,
  createdAt: '2026-09-20T12:00:00.000Z',
  updatedAt: '2026-09-20T12:00:00.000Z',
  likes: 0,
  likedByMe: false,
};

/** El botón «Guardar» (su etiqueta completa). */
const saveButton = (html: string) => html.match(/<button[^>]*>(?:(?!<\/button>).)*Guardar(?:(?!<\/button>).)*<\/button>/)?.[0] ?? '';

describe('hoja del juego suelto', () => {
  it('nuevo: hoy, tres juegos vacíos, «+ Juego», el interruptor prendido y sin «Borrar»', () => {
    const out = render(null, ['Bolera Norte', 'Club Sur']);
    const t = text(out);
    expect(t).toContain('Anotar juego suelto');
    expect(t).toContain('Boliche sin liga ni torneo');
    expect(out).toContain('value="2026-09-28"');
    expect(out).toContain('max="2026-09-28"');
    expect(out).toContain('min="2016-09-28"');
    expect(out.match(/aria-label="Juego \d+"/g)).toHaveLength(3);
    expect(out.match(/por cuadros/g)).toHaveLength(3);
    // «+ Juego» para agregar otro (el lector de pantalla dice qué hace).
    expect(out).toMatch(/<\/svg>\s*Juego<\/button>/);
    expect(out).toContain('aria-label="Agregar otro juego"');
    expect(t).toContain('Anota al menos un juego');
    expect(out).toContain('<datalist');
    expect(out).toContain('value="Club Sur"');
    expect(out).toMatch(/role="switch" aria-checked="true"/);
    expect(t).toContain('Que salga en mi perfil');
    expect(t).not.toContain('Borrar');
    // Sin juegos no se puede guardar.
    expect(saveButton(out)).toContain('disabled=""');
  });

  it('uno que existe: sus juegos (con cuadros en el primero), bolera, nota, «Borrar» y privado', () => {
    const out = render(existing);
    const t = text(out);
    expect(t).toContain('Juego suelto');
    expect(out).toContain('value="2026-09-20"');
    expect(out).toContain('value="Bolera Norte"');
    expect(t).toContain('Con los panas');
    for (const v of [210, 180, 190, 200]) expect(out).toContain(`value="${v}"`);
    expect(out.match(/aria-label="Juego \d+"/g)).toHaveLength(4);
    expect(t).toContain('4 juegos · serie 780 · promedio 195');
    expect(out).toMatch(/role="switch" aria-checked="false"/);
    expect(t).toContain('Solo lo ves tú');
    expect(t).toContain('Borrar');
    expect(saveButton(out)).not.toContain('disabled=""');
    // Sin datalist si no hay boleras que sugerir.
    expect(out).not.toContain('<datalist');
  });

  it('el interruptor apagado se ve (pista gris oscura, no la del borde)', () => {
    const off = render(existing).match(/role="switch"[^>]*>.*?<\/button>/)?.[0] ?? '';
    expect(off).toContain('bg-muted');
    expect(off).not.toContain('bg-line');
    expect(render(null).match(/role="switch"[^>]*>.*?<\/button>/)?.[0]).toContain('bg-accent');
  });

  it('una fecha que no sirve lo dice en rojo (arriba y junto a los juegos) y no deja guardar', () => {
    const out = render({ ...existing, playedOn: '2010-01-01' });
    const hint = 'Elige la fecha (de hoy hacia atrás, hasta 10 años).';
    expect(out).toContain(`<span class="text-danger">${hint}</span>`);
    expect(out).toContain(`class="text-xs text-danger" aria-live="polite">${hint}</span>`);
    expect(saveButton(out)).toContain('disabled=""');
    // Con una fecha buena no sale.
    expect(render(existing)).not.toContain(hint);
  });

  it('uno por enviar lo dice', () => {
    expect(text(render({ ...existing, pending: true }))).toContain('Guardado en este teléfono');
  });

  it('diez juegos: ya no sale «+ Juego»', () => {
    const out = render({ ...existing, scores: Array(10).fill(150), frames: null });
    expect(out.match(/aria-label="Juego \d+"/g)).toHaveLength(10);
    expect(out).not.toMatch(/<\/svg>\s*Juego<\/button>/);
  });
});

describe('cerrar sin guardar pregunta solo si cambió algo', () => {
  const base: SoloSheetValues = { date: '2026-09-28', venue: '', note: '', shared: true, slots: { values: ['', '', ''], frames: {} } };
  it('igual: no', () => {
    expect(soloSheetChanged(base, { ...base, slots: { values: ['', '', ''], frames: {} } })).toBe(false);
  });
  it('un juego, la fecha, la bolera, la nota, el interruptor o los cuadros: sí', () => {
    const changes: Partial<SoloSheetValues>[] = [
      { slots: { values: ['180', '', ''], frames: {} } },
      { slots: { values: ['', '', '', ''], frames: {} } },
      { slots: { values: ['', '', ''], frames: { 0: { rolls: [10] } } } },
      { date: '2026-09-27' },
      { venue: 'Bolera Norte' },
      { note: 'x' },
      { shared: false },
    ];
    for (const change of changes) expect(soloSheetChanged(base, { ...base, ...change }), JSON.stringify(change)).toBe(true);
  });
});

describe('las casillas al guardar', () => {
  const f = { rolls: [9, 1] };
  it('solo los juegos anotados, en orden y sin huecos (los cuadros se mueven con su juego)', () => {
    expect(slotsToGames(['', '180', ' ', '200'], { 3: f })).toEqual({ scores: [180, 200], frames: { '1': f }, invalid: false });
  });

  it('uno que no vale lo dice (y no se guarda)', () => {
    expect(slotsToGames(['301', '150'], {})).toEqual({ scores: [150], frames: null, invalid: true });
    expect(slotsToGames(['12.5'], {}).invalid).toBe(true);
  });

  it('vacías: nada', () => {
    expect(slotsToGames(['', ''], {})).toEqual({ scores: [], frames: null, invalid: false });
  });
});
