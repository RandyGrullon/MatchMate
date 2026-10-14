/**
 * Mis bolas dibujadas sin navegador (renderToString): la fila de bolas de un juego al anotar (el botón de cada juego y
 * la hoja para elegirla, en picker.test.ts), el color y el ícono, la tarjeta de una bola con sus números y el aviso de
 * pulirla, la hoja para agregar o cambiar una (al anotar, la que se agrega queda elegida) y la página sin cuenta.
 */
import { createElement as h, createRef } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { BALL_BRANDS, BALL_CATALOG, searchBallCatalog } from '../../lib/ballCatalog';
import { defaultBallDesign } from '../../lib/ballDesign';
import { ballStats, catalogLine, catalogSpecs, RESURFACE_EVERY, type Ball, type BallDraft, type BallGame, type BallLayout } from '../../lib/balls';
import { BackendError } from '../../lib/backend/types';
import { FeedbackProvider } from '../feedback';
import { CatalogPick } from './BallCatalog';
import { BallDot } from './BallDot';
import { BallIcon, GameBallSelect } from './BallPicker';
import { BallSheet, ballToDraft, newBallDraft, saveBallSheet } from './BallSheet';
import { BallCard, BallStatsSection, statsForSection } from './BallStats';

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

const ball = (id: string, extra: Partial<Ball> = {}): Ball => ({
  id,
  name: 'Phaze II',
  brand: 'Storm',
  weight: 15,
  color: '#1d4ed8',
  cover: 'solida',
  drilledOn: '2026-01-10',
  resurfacedOn: null,
  retired: false,
  createdAt: null,
  updatedAt: null,
  ...extra,
});

const games = (b: string, scores: number[], extra: Partial<BallGame> = {}): BallGame[] =>
  scores.map((score, i) => ({ ball: b, kind: 'solo', ref: `s${i}`, game: 0, date: '2026-09-20', score, frames: null, counted: true, ...extra }));

const noop = () => undefined;

describe('elegir la bola al anotar', () => {
  const balls = [ball('a'), ball('b', { name: 'Spare', weight: 14, color: '#f8fafc' }), ball('c', { name: 'Vieja', retired: true })];

  it('la de un juego, dentro de la hoja de anotar: el chip «Bola: …» y la fila de bolas dibujadas, con la del juego marcada', () => {
    const choice = createRef<string | null>() as { current: string | null };
    const out = renderToString(h(GameBallSelect, { balls, initial: 'a', choice }));
    expect(text(out)).toContain('Bola: Phaze II 15 lb');
    expect(out).toContain('role="radiogroup" aria-label="Bola de este juego"');
    expect(out).toContain('role="radio" aria-checked="true" aria-label="Phaze II (15 lb)"');
    expect(out).toContain('role="radio" aria-checked="false" aria-label="Sin bola"');
    expect(out).toContain('aria-label="Agregar bola"');
    expect(out).not.toContain('<option');
  });

  it('el color y el ícono', () => {
    expect(renderToString(h(BallDot, { color: '#111827', className: 'size-8' }))).toContain('background-color:#111827');
    expect(renderToString(h(BallDot, { color: null }))).toContain('border-dashed');
    expect(renderToString(h(BallIcon, {}))).toContain('<svg');
  });
});

describe('la tarjeta de una bola', () => {
  const card = (b: Ball, gs: BallGame[]) =>
    renderToString(
      h(MemoryRouter, null, h(BallCard, { stats: ballStats([b], gs)[0], onEdit: noop, onResurface: noop, onRetire: noop })),
    );

  it('sus números en una fila, cuántos juegos lleva sin pulir con «La pulí hoy» y lo demás en «•••»', () => {
    const out = card(ball('a'), games('a', [200, 181, 150]));
    const t = text(out);
    expect(t).toContain('Phaze II');
    expect(t).toContain('15 lb · Storm · Reactiva sólida');
    expect(t).toContain('Juegos');
    expect(t).toContain('177');
    expect(t).toContain('200');
    expect(out).toMatch(/<dd class="num[^"]*">177<\/dd>/);
    expect(t).toContain('3 juegos sin pulir.');
    expect(t).toContain('La pulí hoy');
    expect(t).toContain('Último juego con ella');
    // Editar, Diseñar y Retirar van en el menú «•••» (se abre al tocarlo).
    expect(out).toContain('aria-label="Más opciones de la Phaze II"');
    expect(t).not.toContain('Retirar');
    // La barrita de lo que lleva sin pulir: 3 de 60.
    expect(out).toContain('width:5%');
    expect(out).not.toContain('bg-warn-soft');
  });

  it('a los 60 juegos avisa que toca pulirla; lo por verificar se dice aparte', () => {
    const gs = [...games('a', Array(RESURFACE_EVERY).fill(180), { date: '2026-09-10' }), ...games('a', [190], { counted: false })];
    const out = card(ball('a', { resurfacedOn: '2026-09-01' }), gs);
    const t = text(out);
    expect(t).toContain(`Lleva ${RESURFACE_EVERY + 1} juegos desde la última pulida: ya le toca pulirla`);
    expect(t).toContain('La puliste el');
    expect(t).toContain('1 juego cuenta cuando se verifique.');
    expect(out).toContain('bg-warn-soft');
  });

  it('retirada: «Volver a usarla» a la vista y sin pulir', () => {
    const t = text(card(ball('a', { retired: true }), []));
    expect(t).toContain('retirada');
    expect(t).toContain('Volver a usarla');
    expect(t).not.toContain('La pulí hoy');
  });

  it('«Por bola»: sin sesión no sale; las retiradas sin juegos tampoco', () => {
    expect(renderToString(h(MemoryRouter, null, h(BallStatsSection)))).toBe('');
    const stats = statsForSection([ball('a'), ball('b', { retired: true }), ball('c', { retired: true })], games('c', [150]));
    expect(stats.map((s) => s.ball.id)).toEqual(['a', 'c']);
  });
});

describe('la hoja de una bola', () => {
  const sheet = (b: Ball | null) =>
    renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, h(BallSheet, { ball: b, today: '2026-09-30', onClose: noop }))));

  it('nueva: 15 libras, azul, sin «Borrar»', () => {
    const out = sheet(null);
    const t = text(out);
    expect(t).toContain('Agregar bola');
    expect(t).toContain('Solo tú ves tus bolas');
    expect(out).toMatch(/<option value="15" selected="">15 lb<\/option>/);
    expect(out.match(/role="radio"/g)).toHaveLength(13);
    expect(out).toMatch(/role="radio" aria-checked="true" aria-label="Azul"/);
    expect(out).toContain('max="2026-09-30"');
    expect(t).not.toContain('Borrar');
    expect(t).toContain('cada 60 juegos');
  });

  it('una que existe: sus datos y «Borrar»', () => {
    const out = sheet(ball('a', { color: '#111827', weight: 14, resurfacedOn: '2026-09-01' }));
    const t = text(out);
    expect(out).toContain('value="Phaze II"');
    expect(out).toContain('value="Storm"');
    expect(out).toMatch(/<option value="14" selected="">14 lb<\/option>/);
    expect(out).toMatch(/<option value="solida" selected="">/);
    expect(out).toMatch(/role="radio" aria-checked="true" aria-label="Negro"/);
    expect(out).toContain('value="2026-09-01"');
    expect(t).toContain('Borrar');
  });

  it('al anotar (con `onSaved`, que recibe la nueva para elegirla) se ve igual', () => {
    const withSaved = renderToString(
      h(MemoryRouter, null, h(FeedbackProvider, null, h(BallSheet, { ball: null, today: '2026-09-30', onClose: noop, onSaved: noop }))),
    );
    expect(withSaved).toBe(sheet(null));
  });

  describe('«Guardar» (al anotar, «Agregar bola»)', () => {
    const draft: BallDraft = { ...ballToDraft(null), name: 'Nueva' };
    /** Lo que pasa, en orden. */
    const run = async (save: (d: BallDraft, today: string) => Promise<string>, d = draft) => {
      const log: string[] = [];
      const ok = await saveBallSheet(d, '2026-09-30', {
        toast: (m, tone) => log.push(`toast:${tone ?? 'ok'}:${m}`),
        onSaved: (id) => log.push(`elegida:${id}`),
        onClose: () => log.push('cerrar'),
        save,
      });
      return { ok, log };
    };

    it('la nueva queda elegida (su id, el que devuelve saveBall) y después se cierra la hoja', async () => {
      const save = vi.fn(async () => 'bola-nueva');
      const { ok, log } = await run(save);
      expect(ok).toBe(true);
      expect(save).toHaveBeenCalledWith(draft, '2026-09-30');
      expect(log).toEqual(['toast:ok:Bola agregada', 'elegida:bola-nueva', 'cerrar']);
    });

    it('cambiar una que ya existe dice «Bola guardada»', async () => {
      const { log } = await run(async () => 'a', { ...draft, id: 'a' });
      expect(log).toEqual(['toast:ok:Bola guardada', 'elegida:a', 'cerrar']);
    });

    it('sin señal (o con el cupo lleno): lo dice, no elige nada y la hoja sigue abierta', async () => {
      const offline = await run(async () => {
        throw new BackendError('Failed to fetch', 'network', 'network');
      });
      expect(offline.ok).toBe(false);
      expect(offline.log).toEqual(['toast:error:Sin conexión. Prueba otra vez cuando tengas señal.']);
      const full = await run(async () => {
        throw new Error('cupo_lleno');
      });
      expect(full.log).toEqual(['toast:error:Ya tienes 30 bolas: borra una que ya no uses para agregar otra.']);
    });
  });

  it('lo que se edita sale de la bola (o una nueva)', () => {
    expect(ballToDraft(null)).toEqual({
      id: null,
      name: '',
      brand: '',
      weight: 15,
      color: '#1d4ed8',
      cover: null,
      drilledOn: null,
      resurfacedOn: null,
      retired: false,
      catalog: null,
      layout: null,
    });
    expect(ballToDraft(ball('a', { retired: true }))).toMatchObject({ id: 'a', name: 'Phaze II', cover: 'solida', retired: true, catalog: null, layout: null });
    expect(ballToDraft(ball('a', { catalog: 'storm:phaze-ii', layout: { drillingAngle: 45 } }))).toMatchObject({ catalog: 'storm:phaze-ii', layout: { drillingAngle: 45 } });
  });
});

/** El modelo del catálogo con más datos (lo que diga el catálogo de la app; las pruebas no dependen de cuál). */
const model = BALL_CATALOG.find((c) => c.colors?.length && catalogSpecs(c)) ?? BALL_CATALOG[0];
const layout = { drillingAngle: 45, pinToPap: 4.5, valAngle: 30 };
/** La opción elegida de un <select> por su aria-label. */
const selected = (html: string, label: string) => {
  const select = html.match(new RegExp(`<select[^>]*aria-label="${label}"[^>]*>(.*?)</select>`))?.[1] ?? '';
  return select.match(/<option[^>]*selected=""[^>]*>([^<]*)<\/option>/)?.[1] ?? null;
};

describe('el catálogo y la perforación', () => {
  const sheet = (b: Ball | null, extra: { catalog?: string | null } = {}) =>
    renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, h(BallSheet, { ball: b, today: '2026-09-30', onClose: noop, ...extra }))));

  it('una nueva: arriba «Buscar en el catálogo» (abierto); la marca con las del catálogo para elegir', () => {
    const out = sheet(null);
    const t = text(out);
    expect(t).toContain('Buscar en el catálogo');
    expect(out).toContain('type="search"');
    expect(t).toContain('Marca y modelo, en cualquier orden.');
    // La marca: escrita o elegida de las del catálogo.
    const list = out.match(/<input[^>]*list="([^"]+)"[^>]*placeholder="Storm, Hammer…"/)?.[1];
    expect(list).toBeTruthy();
    const options = [...(out.match(new RegExp(`<datalist id="${list}">(.*?)</datalist>`))?.[1] ?? '').matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
    expect(options).toEqual([...BALL_BRANDS]);
    // Los colores para elegir siguen siendo los 13 (nada más es «radio»).
    expect(out.match(/role="radio"/g)).toHaveLength(13);
  });

  it('una nueva: abajo la perforación (vacía), con qué es el layout', () => {
    const out = sheet(null);
    const t = text(out);
    expect(t).toContain('Perforación (opcional)');
    expect(t).toContain('¿Qué es el layout?');
    expect(t).toContain('Dual Angle: ángulo de perforación, distancia del pin al PAP y ángulo VAL.');
    expect(t).toContain('Ángulo de perforación');
    expect(t).toContain('Ángulo VAL');
    expect(out).toContain('aria-label="Pin a PAP: pulgadas"');
    expect(out).toContain('aria-label="Pin a PAP: fracción"');
    expect(out).toContain('aria-label="Buffer: pulgadas"');
    expect(out).toMatch(/<option value="4">½<\/option>/);
    expect(out).toContain('inputMode="numeric"');
    expect(t).toContain('Notas');
    expect(selected(out, 'Pin a PAP: pulgadas')).toBe('—');
    expect(t).not.toContain('Tu layout');
  });

  it('una que ya tiene modelo y perforación: cuál es (con «Cambiar» y quitarlo), los números y la línea «Tu layout»', () => {
    const out = sheet(ball('a', { catalog: model.id, layout: { ...layout, pinBuffer: 2, notes: 'Mano derecha' } }));
    const t = text(out);
    expect(t).toContain('Del catálogo');
    expect(t).toContain(`${model.brand} ${model.name}`);
    expect(t).toContain('Cambiar');
    expect(out).toContain('aria-label="Quitar el modelo del catálogo"');
    expect(out).not.toContain('type="search"');
    expect(out).toContain('value="45"');
    expect(out).toContain('value="30"');
    expect(out).toContain('value="Mano derecha"');
    expect(selected(out, 'Pin a PAP: pulgadas')).toBe('4');
    expect(selected(out, 'Pin a PAP: fracción')).toBe('½');
    expect(selected(out, 'Buffer: pulgadas')).toBe('2');
    expect(selected(out, 'Buffer: fracción')).toBe('—');
    expect(t).toContain('Tu layout: 45° × 4½″ × 30° + 2″ buffer');
  });

  it('una que ya existe sin modelo: el buscador detrás de un botón', () => {
    const out = sheet(ball('a'));
    expect(text(out)).toContain('Buscar en el catálogo');
    expect(out).not.toContain('type="search"');
  });

  it('una perforación que no vale lo dice (y marca el campo)', () => {
    const out = sheet(ball('a', { layout: { drillingAngle: 95 } }));
    expect(text(out)).toContain('El ángulo de perforación va de 0 a 90°.');
    expect(out).toMatch(/<input[^>]*aria-invalid="true"[^>]*value="95"/);
  });

  it('«Agregar a mi arsenal» (una nueva con un modelo): ya llena, con los colores del catálogo', () => {
    const out = sheet(null, { catalog: model.id });
    const t = text(out);
    expect(out).toContain(`value="${model.name}"`);
    expect(out).toContain(`value="${model.brand}"`);
    expect(out).toMatch(new RegExp(`<option value="${model.cover}" selected="">`));
    expect(t).toContain('Del catálogo');
    if (model.colors?.length) {
      expect(t).toContain('con los colores del catálogo');
      expect(out).toContain(`fill="${model.colors[0].toLowerCase()}"`);
    }
    // Una clave que no está: vacía, como siempre.
    expect(sheet(null, { catalog: 'no:existe' })).toBe(sheet(null));
  });

  it('buscar en la hoja: marca y modelo; cada uno con su marca, su nombre y lo que es; «No está en el catálogo»', () => {
    const pick = (q: string) =>
      renderToString(h(CatalogPick, { value: null, brand: '', name: '', fresh: true, initialQuery: q, onPick: noop, onClear: noop, onManual: noop }));
    const q = `${model.name} ${model.brand}`;
    const out = pick(q);
    const t = text(out);
    expect(out).toContain('aria-label="Bolas del catálogo"');
    expect(t).toContain(model.brand);
    expect(t).toContain(model.name);
    expect(t).toContain(catalogLine(model));
    expect(t).toContain('No está en el catálogo');
    expect(out.match(/<li>/g)?.length).toBe(searchBallCatalog(q, 8).length);
    const none = text(pick('zzzz qqqq'));
    expect(none).toContain('Ninguna bola del catálogo con «zzzz qqqq».');
    expect(none).toContain('No está en el catálogo');
  });

  it('la hoja llena con el modelo (o vacía si no está)', () => {
    expect(newBallDraft(model.id)).toMatchObject({ id: null, name: model.name, brand: model.brand, cover: model.cover, catalog: model.id });
    expect(newBallDraft('no:existe')).toEqual(ballToDraft(null));
    expect(newBallDraft(null)).toEqual(ballToDraft(null));
  });

  it('la tarjeta: lo que dice el catálogo de su modelo y «Perforación 45° × 4½″ × 30°» (con sus notas)', () => {
    const card = (b: Ball) =>
      text(renderToString(h(MemoryRouter, null, h(BallCard, { stats: ballStats([b], [])[0], onEdit: noop, onResurface: noop, onRetire: noop }))));
    const t = card(ball('a', { catalog: model.id, layout: { ...layout, pinBuffer: 2, notes: 'Mano derecha' } }));
    expect(t).toContain('Perforación 45° × 4½″ × 30° + 2″ buffer · Mano derecha');
    const specs = catalogSpecs(model);
    if (specs) expect(t).toContain(specs);
    expect(card(ball('a', { layout: { notes: 'Sin medir' } }))).toContain('Perforación Sin medir');
    // Sin modelo ni perforación, nada de eso.
    expect(card(ball('a'))).not.toContain('Perforación');
  });
});

describe('«Guardar» con el catálogo y la perforación', () => {
  const base: BallDraft = { ...ballToDraft(null), name: 'Phaze II', catalog: model.id, layout: { ...layout, notes: ' Dual ' } };
  const look = defaultBallDesign('#7c3aed');

  const run = async (
    d: BallDraft,
    opts: {
      before?: Pick<Ball, 'catalog' | 'layout'> | null;
      look?: typeof look | null;
      save?: () => Promise<string>;
      details?: () => Promise<void>;
      design?: () => Promise<unknown>;
    } = {},
  ) => {
    const log: string[] = [];
    const ok = await saveBallSheet(d, '2026-09-30', {
      toast: (m, tone) => log.push(`toast:${tone ?? 'ok'}:${m}`),
      onSaved: (id) => log.push(`elegida:${id}`),
      onClose: () => log.push('cerrar'),
      onKept: (id) => log.push(`queda:${id}`),
      before: opts.before,
      look: opts.look,
      save: async () => {
        log.push('save_ball');
        return (await opts.save?.()) ?? 'n1';
      },
      details: async (id: string, catalog: string | null, l: BallLayout | null) => {
        log.push(`set_ball_details:${id}:${catalog}:${JSON.stringify(l)}`);
        await opts.details?.();
      },
      design: async (id, design) => {
        log.push(`set_ball_design:${id}:${design?.base}`);
        await opts.design?.();
      },
    });
    return { ok, log };
  };

  it('una nueva: la bola, después su diseño del catálogo y su modelo y perforación (con su id), y se cierra', async () => {
    const { ok, log } = await run(base, { look });
    expect(ok).toBe(true);
    expect(log).toEqual([
      'save_ball',
      'set_ball_design:n1:#7c3aed',
      `set_ball_details:n1:${model.id}:{"drillingAngle":45,"pinToPap":4.5,"valAngle":30,"notes":"Dual"}`,
      'toast:ok:Bola agregada',
      'elegida:n1',
      'cerrar',
    ]);
  });

  it('sin cambiar el modelo ni la perforación no se manda (tampoco en una nueva sin ellos); quitarlos sí', async () => {
    const before = { catalog: model.id, layout: { valAngle: 30, pinToPap: 4.5, drillingAngle: 45, notes: 'Dual' } };
    expect((await run({ ...base, id: 'a' }, { before })).log).toEqual(['save_ball', 'toast:ok:Bola guardada', 'elegida:n1', 'cerrar']);
    expect((await run({ ...ballToDraft(null), name: 'Nueva' })).log).toEqual(['save_ball', 'toast:ok:Bola agregada', 'elegida:n1', 'cerrar']);
    expect((await run({ ...base, id: 'a', catalog: null, layout: null }, { before })).log).toContain('set_ball_details:n1:null:null');
  });

  it('la bola se guardó pero no su perforación: lo dice, la elige y la hoja sigue abierta con su id', async () => {
    const { ok, log } = await run(base, {
      details: async () => {
        throw new BackendError('Failed to fetch', 'network', 'network');
      },
    });
    expect(ok).toBe(false);
    expect(log.slice(1)).toEqual([
      expect.stringMatching(/^set_ball_details:n1:/),
      'toast:error:La bola se guardó, pero no su perforación. Sin conexión. Prueba otra vez cuando tengas señal.',
      'queda:n1',
      'elegida:n1',
    ]);
  });

  it('el diseño del catálogo es solo una propuesta: si no se pudo, la bola queda igual', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { ok, log } = await run(base, {
      look,
      design: async () => {
        throw new Error('rate_limited');
      },
    });
    expect(ok).toBe(true);
    expect(log.slice(-3)).toEqual(['toast:ok:Bola agregada', 'elegida:n1', 'cerrar']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('si la bola no se guardó, no se manda nada más', async () => {
    const { log } = await run(base, {
      look,
      save: async () => {
        throw new Error('cupo_lleno');
      },
    });
    expect(log).toEqual(['save_ball', 'toast:error:Ya tienes 30 bolas: borra una que ya no uses para agregar otra.']);
  });
});
