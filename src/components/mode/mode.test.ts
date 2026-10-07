/**
 * Las piezas del modo (src/components/mode): <ProOnly> y <LiteOnly> muestran u ocultan secciones, el selector
 * «Lite | Pro» de Yo y la sugerencia de Pro a quien organiza una liga (una sola, la de menos prioridad).
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  mode: 'lite' as 'lite' | 'pro',
  suggestedPro: false,
  setMode: vi.fn(async () => 'saved' as const),
}));

vi.mock('../../lib/useMode', () => ({
  useIsPro: () => state.mode === 'pro',
  useMode: () => ({ mode: state.mode, isPro: state.mode === 'pro', setMode: state.setMode, suggestedPro: state.suggestedPro }),
}));

const { LiteOnly, ModeSwitch, ModeTag, PRO_SUGGESTION_ID, ProOnly, proSuggestion } = await import('./index');

beforeEach(() => {
  state.mode = 'lite';
  state.suggestedPro = false;
  state.setMode.mockClear();
});

describe('mostrar según el modo', () => {
  const both = () =>
    renderToString(
      h('div', null, h(ProOnly, null, h('i', null, 'PLANILLA')), h(LiteOnly, null, h('i', null, 'RESUMEN')), h(ProOnly, { fallback: h('i', null, 'VER EN PRO'), children: h('i', null, 'EXCEL') })),
    );

  it('Lite (por defecto): lo de Lite y lo que reemplaza a lo de Pro', () => {
    expect(both()).toBe('<div><i>RESUMEN</i><i>VER EN PRO</i></div>');
  });

  it('Pro: todo lo de Pro y nada de lo que es solo de Lite', () => {
    state.mode = 'pro';
    expect(both()).toBe('<div><i>PLANILLA</i><i>EXCEL</i></div>');
  });
});

describe('selector Lite | Pro', () => {
  it('dos opciones con su ícono; la elegida marcada', () => {
    const html = renderToString(h(ModeSwitch));
    expect(html).toContain('role="radiogroup" aria-label="Cómo ver la app"');
    expect(html.match(/role="radio"/g)).toHaveLength(2);
    expect(html).toMatch(/aria-checked="true"[^>]*>.*?<svg[^>]*>.*?<\/svg>Lite<\/button>/);
    expect(html).toMatch(/aria-checked="false"[^>]*>.*?<\/svg>Pro<\/button>/);
    state.mode = 'pro';
    expect(renderToString(h(ModeSwitch))).toMatch(/aria-checked="true"[^>]*>.*?<\/svg>Pro<\/button>/);
  });
});

describe('etiqueta «PRO ▾»', () => {
  it('solo en Pro, tocable (44 px con su borde invisible) y en el color del deporte', () => {
    expect(renderToString(h(ModeTag))).toBe('');
    state.mode = 'pro';
    const html = renderToString(h(ModeTag, { onClick: () => {} }));
    expect(html).toMatch(/^<button type="button" aria-label="Modo Pro: cambiar cómo ver la app" class="[^"]*bg-accent-soft[^"]*text-accent[^"]*after:-inset-y-2\.5/);
    expect(html).toContain('>PRO<');
  });
});

describe('sugerir Pro', () => {
  it('solo a quien organiza y está en Lite; «Probar Pro» cambia el modo', async () => {
    expect(proSuggestion({ mode: 'lite', suggestedPro: false })).toBeNull();
    expect(proSuggestion({ mode: 'pro', suggestedPro: true })).toBeNull();
    const onTry = vi.fn();
    const n = proSuggestion({ mode: 'lite', suggestedPro: true }, { title: 'Organizas esta liga' }, onTry);
    expect(n).toMatchObject({ id: PRO_SUGGESTION_ID, kind: 'pro', title: 'Organizas esta liga', text: 'Aprueba juegos en Pro', action: { label: 'Probar Pro' } });
    // Sin snooze: cerrado una vez, no vuelve (se sugiere una sola vez).
    expect(n?.snoozeDays).toBeUndefined();
    await n?.action?.onClick?.();
    expect(onTry).toHaveBeenCalledOnce();
    expect(proSuggestion({ mode: 'lite', suggestedPro: true })?.title).toBe('Organizas una liga');
  });
});
