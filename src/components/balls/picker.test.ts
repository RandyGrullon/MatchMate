/**
 * Elegir la bola de cada juego al anotar, sin navegador (renderToString): el botón de la bola de un juego (dibujada, sin
 * bola, «Varias bolas», con un + si la cuenta no tiene ninguna), la hoja para elegirla (todas dibujadas, «Sin bola»,
 * «Agregar bola» y el cupo lleno), la fila de bolas dentro de la hoja de anotar y si se puede elegir (con sesión y la
 * lista leída, aunque no tenga ninguna).
 */
import { createElement as h, createRef, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BALL_MAX, pickableBalls, type Ball } from '../../lib/balls';
import { ballKeys, type MyBalls } from '../../lib/data/balls';
import { queryClient } from '../../lib/data/client';
import { BallPickSheet, GameBallChip, GameBallSelect, useBallChoice } from './BallPicker';

/** La cuenta que entró (sin abrir su cola: aquí no hay servidor). */
const session = vi.hoisted(() => ({ uid: null as string | null }));
vi.mock('../../lib/data/client', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/client')>()),
  getUserId: () => session.uid,
}));
/** Las que se agregaron en este teléfono (saveBall las anota). */
const added = vi.hoisted(() => new Set<string>());
vi.mock('../../lib/data/balls', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/balls')>()),
  ballAddedHere: (id: string) => added.has(id),
}));

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
const count = (html: string, re: RegExp) => html.match(new RegExp(re.source, 'g'))?.length ?? 0;

const ball = (id: string, extra: Partial<Ball> = {}): Ball => ({
  id,
  name: 'Phaze II',
  brand: 'Storm',
  weight: 15,
  color: '#1d4ed8',
  cover: 'solida',
  drilledOn: null,
  resurfacedOn: null,
  retired: false,
  createdAt: null,
  updatedAt: null,
  ...extra,
});

const noop = () => undefined;
const balls = [ball('a'), ball('b', { name: 'Spare', brand: '', weight: 14, color: '#f8fafc', cover: 'poliester' }), ball('c', { name: 'Vieja', retired: true })];
/** El cupo lleno. */
const many = Array.from({ length: BALL_MAX }, (_, i) => ball(`m${i}`, { name: `Bola ${i}` }));

describe('el botón de la bola de un juego', () => {
  const chip = (p: Partial<Parameters<typeof GameBallChip>[0]> = {}) => renderToString(h(GameBallChip, { game: 2, balls, value: 'b', onPick: noop, ...p }));

  it('la bola del juego dibujada (24 px) con su nombre debajo, con el juego y la bola en su nombre; cerrado no hay hoja', () => {
    const out = chip();
    expect(out).toContain('aria-label="Bola del juego 3: Spare (14 lb)"');
    expect(out).toContain('aria-haspopup="dialog"');
    expect(out).toContain('aria-expanded="false"');
    // 44 px para el dedo y del ancho de su columna.
    expect(out).toContain('min-h-11');
    expect(out).toMatch(/[" ]w-full[" ]/);
    expect(out).toMatch(/<svg[^>]*width="24" height="24"/);
    expect(out).toContain('fill="#f8fafc"');
    expect(out).not.toContain('<dialog');
    // La bola dibujada no se nombra dos veces (el nombre va en el botón); el de debajo solo se ve, cortado si no cabe.
    expect(out).not.toContain('role="img"');
    expect(out).toMatch(/<span aria-hidden="true" class="[^"]*truncate[^"]*">Spare<\/span>/);
  });

  it('dos bolas lisas del mismo color se distinguen por su nombre', () => {
    const black = [ball('x', { name: 'Hy-Road', color: '#111827' }), ball('y', { name: 'Phaze II', color: '#111827' })];
    const one = text(chip({ balls: black, value: 'x' }));
    const two = text(chip({ balls: black, value: 'y' }));
    expect(one).toContain('Hy-Road');
    expect(two).toContain('Phaze II');
    expect(one).not.toContain('Phaze II');
  });

  it('sin bola: el círculo punteado (sin + si tiene bolas) y «Sin bola» debajo', () => {
    const out = chip({ game: 0, value: null });
    expect(out).toContain('aria-label="Bola del juego 1: sin bola"');
    expect(out).toContain('border-dashed');
    expect(out).not.toContain('lucide-plus');
    expect(text(out)).toContain('Sin bola');
  });

  it('sin bolas (ninguna o todas retiradas): con un + y dice que se puede agregar una', () => {
    for (const bs of [[], [balls[2]]]) {
      const out = chip({ game: 0, balls: bs, value: null });
      expect(out).toContain('aria-label="Bola del juego 1: sin bola. Toca para agregar una"');
      expect(out).toContain('lucide-plus');
    }
  });

  it('una retirada que ya tenía el juego se sigue viendo', () => {
    const out = chip({ value: 'c' });
    expect(out).toContain('aria-label="Bola del juego 3: Vieja (15 lb)"');
    expect(out).toMatch(/<svg[^>]*width="24" height="24"/);
  });

  it('una que ya no existe (se borró): sin bola', () => {
    expect(chip({ value: 'borrada' })).toContain('aria-label="Bola del juego 3: sin bola"');
  });

  it('la de todos los juegos, con su nombre: «Varias bolas» si los juegos tienen distintas', () => {
    const mixed = chip({ game: 'all', variant: 'full', value: undefined });
    expect(mixed).toContain('aria-label="Bola de todos los juegos: varias bolas"');
    expect(text(mixed)).toContain('Varias bolas');
    expect(mixed).not.toMatch(/[" ]w-full[" ]/);
    const same = chip({ game: 'all', variant: 'full', value: 'a' });
    expect(same).toContain('aria-label="Bola de todos los juegos: Phaze II (15 lb)"');
    expect(text(same)).toContain('Phaze II');
    expect(text(chip({ game: 'all', variant: 'full', value: null }))).toContain('Sin bola');
  });

  it('desactivado', () => {
    expect(chip({ disabled: true })).toMatch(/<button[^>]*disabled=""/);
  });
});

describe('la hoja para elegir la bola', () => {
  const sheet = (p: Partial<Parameters<typeof BallPickSheet>[0]> = {}) =>
    renderToString(h(BallPickSheet, { game: 2, balls, value: 'a', onPick: noop, onClose: noop, ...p }));

  it('«Sin bola» y las que no están retiradas, cada una dibujada con su nombre; la del juego marcada', () => {
    const out = sheet();
    const t = text(out);
    expect(t).toContain('Bola del juego 3');
    expect(t).toContain('¿Con cuál bola lo tiraste?');
    expect(out).toContain('role="radiogroup" aria-label="Bola del juego 3"');
    expect(count(out, /role="radio"/)).toBe(3);
    expect(count(out, /aria-checked="true"/)).toBe(1);
    expect(out).toMatch(/aria-checked="true"(?:(?!<\/button>).)*Phaze II/s);
    expect(t).toContain('Sin bola');
    expect(t).toContain('No la anoto en este juego');
    expect(t).toContain('15 lb · Storm · Reactiva sólida');
    expect(t).toContain('14 lb · Poliéster (plástico)');
    expect(t).not.toContain('Vieja');
    // Dibujadas a 40 px (la de «Sin bola» es el círculo punteado); nada de la lista del teléfono.
    expect(count(out, /<svg[^>]*width="40"/)).toBe(2);
    expect(out).not.toContain('<select');
    expect(out).not.toContain('<option');
    // Agregar una ahí mismo (con señal).
    expect(t).toContain('Agregar bola');
    expect(t).toContain('Queda en «Mis bolas». Necesitas señal para agregarla.');
    expect(t).not.toContain('Todavía no tienes bolas');
    // Cada fila es para el dedo (56 px).
    expect(out).toContain('min-h-14');
  });

  it('una retirada sale solo si ya era la del juego', () => {
    const out = sheet({ value: 'c' });
    expect(count(out, /role="radio"/)).toBe(4);
    expect(out).toMatch(/aria-checked="true"(?:(?!<\/button>).)*Vieja/s);
    expect(text(out)).toContain('retirada');
  });

  it('sin bolas: lo dice, solo «Sin bola» (marcada) y «Agregar bola»', () => {
    const out = sheet({ balls: [], value: null });
    const t = text(out);
    expect(t).toContain('Todavía no tienes bolas');
    expect(count(out, /role="radio"/)).toBe(1);
    expect(out).toMatch(/role="radio" aria-checked="true"/);
    expect(t).toContain('Agregar bola');
    expect(text(sheet({ balls: [balls[2]], value: null }))).toContain('Tus bolas están retiradas');
  });

  it('con el cupo lleno no deja agregar otra (y dice por qué)', () => {
    const out = sheet({ balls: many, value: null });
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Agregar bola/s);
    expect(text(out)).toContain(`Ya tienes ${BALL_MAX} bolas: borra una que ya no uses para agregar otra.`);
    expect(text(out)).not.toContain('Necesitas señal');
  });

  it('la de todos los juegos: con bolas distintas no hay ninguna marcada', () => {
    const out = sheet({ game: 'all', value: undefined });
    const t = text(out);
    expect(t).toContain('Bola de todos los juegos');
    expect(t).toContain('La misma para todos tus juegos');
    expect(t).toContain('No la anoto en estos juegos');
    expect(out).not.toContain('aria-checked="true"');
    expect(count(out, /role="radio"/)).toBe(3);
  });

  it('una que ya no existe (se borró): «Sin bola» marcada', () => {
    expect(sheet({ value: 'borrada' })).toMatch(/role="radio" aria-checked="true"(?:(?!<\/button>).)*Sin bola/s);
  });

  it('dos bolas iguales en la misma hoja no comparten ids', () => {
    const out = sheet({ balls: [ball('x', { cover: 'perlada' }), ball('y', { cover: 'perlada' })], value: 'x' });
    const ids = [...out.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('la fila de bolas en la hoja de anotar', () => {
  const row = (p: Partial<Parameters<typeof GameBallSelect>[0]> = {}) => {
    const choice = createRef<string | null>() as { current: string | null };
    return renderToString(h(GameBallSelect, { balls, initial: 'a', choice, game: 2, ...p }));
  };

  it('«Sin bola» y las bolas dibujadas con su nombre, la del juego marcada, y «Agregar»', () => {
    const out = row();
    const t = text(out);
    expect(t).toContain('Bola de este juego');
    expect(out).toContain('role="radiogroup" aria-label="Bola del juego 3"');
    expect(count(out, /role="radio"/)).toBe(3);
    expect(out).toContain('role="radio" aria-checked="true" aria-label="Phaze II (15 lb)"');
    expect(out).toContain('role="radio" aria-checked="false" aria-label="Sin bola"');
    expect(out).toContain('aria-label="Spare (14 lb)"');
    expect(out).toContain('aria-label="Agregar bola"');
    expect(t).toContain('Agregar');
    expect(count(out, /<svg[^>]*width="40"/)).toBe(2);
    expect(t).not.toContain('Vieja');
    expect(out).not.toContain('<option');
    expect(out).not.toContain('<dialog');
    // Se desliza de lado dentro de su caja, con el mismo margen de la hoja (la hoja no se desliza de lado).
    for (const c of ['overflow-x-auto', '-mx-5', 'px-5', 'no-scrollbar', 'overscroll-x-contain']) expect(out).toContain(c);
    // Cada casilla mide 64 px de ancho (para el dedo).
    expect(out).toContain('w-16');
  });

  it('sin nombre del juego: la fila se llama como dice', () => {
    expect(row({ game: undefined })).toContain('role="radiogroup" aria-label="Bola de este juego"');
  });

  it('sin bolas: solo «Sin bola» (marcada) y «Agregar»', () => {
    const out = row({ balls: [], initial: null });
    expect(count(out, /role="radio"/)).toBe(1);
    expect(out).toContain('role="radio" aria-checked="true" aria-label="Sin bola"');
    expect(out).toContain('aria-label="Agregar bola"');
  });

  it('la retirada que ya tenía el juego sigue en la fila aunque esté elegida otra (hasta guardar se puede volver a ella)', () => {
    // La fila deja la del juego (`initial`) y la elegida (su estado): lo mismo que pickableBalls con las dos.
    expect(pickableBalls(balls, 'a', 'c').map((b) => b.id)).toEqual(['a', 'b', 'c']);
    expect(pickableBalls(balls, 'a', null).map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('la retirada que ya tenía el juego sale (marcada); con el cupo lleno no hay «Agregar»', () => {
    expect(row({ initial: 'c' })).toContain('role="radio" aria-checked="true" aria-label="Vieja (15 lb) · retirada"');
    const full = row({ balls: many, initial: null });
    expect(full).not.toContain('Agregar bola');
    expect(count(full, /role="radio"/)).toBe(BALL_MAX + 1);
  });
});

describe('si se puede elegir la bola', () => {
  const UID = 'u-elegir';

  /** Lo que dice useBallChoice, en atributos (el JSON se escapa en el marcado). */
  function Probe() {
    const c = useBallChoice();
    return h('i', { 'data-can': c.canPick, 'data-loaded': c.loaded, 'data-none': c.noBallsAtStart, 'data-auto': c.auto ?? '' });
  }
  const probe = () => {
    const out = renderToString(h(Probe));
    const attr = (k: string) => out.match(new RegExp(`data-${k}="([^"]*)"`))?.[1];
    return { can: attr('can'), loaded: attr('loaded'), none: attr('none'), auto: attr('auto') };
  };
  const seed = (mine: MyBalls) => queryClient.setQueryData(ballKeys.list(UID), mine);

  it('sin sesión no se elige (aunque «loaded» sea true: no hay nada que leer)', () => {
    expect(probe()).toMatchObject({ can: 'false', loaded: 'true', none: 'false' });
  });

  it('con sesión, hasta que se lea la lista no se sabe: no se elige', () => {
    session.uid = UID;
    expect(probe()).toMatchObject({ can: 'false', loaded: 'false', none: 'false' });
  });

  it('sin ninguna bola se puede elegir (sale «Agregar bola») y la pantalla lo anota', () => {
    seed({ balls: [], lastUsed: null });
    expect(probe()).toMatchObject({ can: 'true', loaded: 'true', none: 'true', auto: '' });
  });

  it('todas retiradas: se puede elegir, pero tenía bolas (sus juegos pueden tener una)', () => {
    seed({ balls: [ball('v', { retired: true })], lastUsed: 'v' });
    expect(probe()).toMatchObject({ can: 'true', none: 'false', auto: '' });
  });

  it('con bolas: la última que usó se pone sola', () => {
    seed({ balls: [ball('a'), ball('b')], lastUsed: 'b' });
    expect(probe()).toMatchObject({ can: 'true', none: 'false', auto: 'b' });
  });

  /** La misma pantalla dibujada otra vez (el mismo `ref`) después de que la lista cambia a `next`. */
  function redrawWith(next: MyBalls) {
    function Redraw() {
      const c = useBallChoice();
      const [step, setStep] = useState(0);
      if (step === 0) {
        seed(next);
        setStep(1);
      }
      return h('i', { 'data-n': c.balls.length, 'data-none': c.noBallsAtStart });
    }
    return renderToString(h(Redraw));
  }

  it('agregar la primera ahí mismo no cambia lo que se anotó al abrir', () => {
    seed({ balls: [], lastUsed: null });
    added.add('nueva');
    const out = redrawWith({ balls: [ball('nueva')], lastUsed: null });
    expect(out).toContain('data-n="1"');
    expect(out).toContain('data-none="true"');
    // Una pantalla nueva ya sabe que tiene una.
    expect(probe()).toMatchObject({ none: 'false' });
  });

  it('si al leer la lista llega una de otro teléfono, la de al abrir era la copia vieja: ya no vale «sin bolas»', () => {
    seed({ balls: [], lastUsed: null });
    const out = redrawWith({ balls: [ball('remota')], lastUsed: 'remota' });
    expect(out).toContain('data-n="1"');
    expect(out).toContain('data-none="false"');
    // Aunque también haya agregado una aquí.
    seed({ balls: [], lastUsed: null });
    expect(redrawWith({ balls: [ball('nueva'), ball('remota')], lastUsed: null })).toContain('data-none="false"');
  });
});
