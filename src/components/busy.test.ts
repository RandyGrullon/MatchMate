/**
 * Ruedita de «cargando» en lo que espera: el ícono se cambia por la ruedita del mismo tamaño, y mientras una acción
 * espera no se puede lanzar otra (no se guarda dos veces por tocar dos veces).
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BusyIcon, createBusy } from './busy';
import { Button, iconSizeClass } from './ui';

/** Una promesa que se resuelve o falla desde afuera. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('BusyIcon', () => {
  const icon = h('svg', { className: 'size-4 lucide-check', 'data-icon': 'check' });

  it('sin esperar, el ícono tal cual', () => {
    const html = renderToString(h(BusyIcon, { busy: false, icon }));
    expect(html).toContain('data-icon="check"');
    expect(html).not.toContain('animate-spin');
  });

  it('esperando, la ruedita del mismo tamaño en vez del ícono', () => {
    const html = renderToString(h(BusyIcon, { busy: true, icon, className: 'size-5 shrink-0' }));
    expect(html).not.toContain('data-icon="check"');
    expect(html).toContain('animate-spin');
    expect(html).toContain('size-5 shrink-0');
    expect(html).toContain('aria-hidden="true"');
  });

  it('sin tamaño, size-4 como el del botón', () => {
    const cls = /class="([^"]*)"/.exec(renderToString(h(BusyIcon, { busy: true, icon })))?.[1].split(/\s+/) ?? [];
    expect(cls).toContain('animate-spin');
    expect(cls).toContain('size-4');
  });

  it('sin ícono y sin esperar, nada', () => {
    expect(renderToString(h(BusyIcon, { busy: false }))).toBe('');
  });
});

describe('Button con loading', () => {
  const spin = (icon?: ReturnType<typeof h>) =>
    /<svg[^>]*class="([^"]*animate-spin[^"]*)"/.exec(renderToString(h(Button, { loading: true, icon }, 'Retar')))?.[1].split(/\s+/) ?? [];

  it('la ruedita del tamaño del ícono (no se corre el texto)', () => {
    expect(spin(h('svg', { className: 'size-5' }))).toContain('size-5');
    const small = spin(h('svg', { className: 'size-3.5 text-accent' }));
    expect(small).toContain('size-3.5');
    expect(small).not.toContain('text-accent');
  });

  it('sin ícono o sin tamaño, size-4', () => {
    expect(spin()).toContain('size-4');
    expect(spin(h('svg', { className: 'text-muted' }))).toContain('size-4');
  });

  it('el tamaño puede ser h/w o con prefijo de pantalla', () => {
    expect(iconSizeClass(h('svg', { className: 'h-4 w-4 shrink-0' }))).toBe('h-4 w-4');
    expect(iconSizeClass(h('svg', { className: 'size-4 sm:size-5' }))).toBe('size-4 sm:size-5');
  });
});

describe('createBusy', () => {
  it('marca la acción mientras espera y la limpia al terminar', async () => {
    const seen: (string | null)[] = [];
    const b = createBusy<string>((k) => seen.push(k));
    const d = deferred<number>();
    const p = b.run('guardar', () => d.promise);
    expect(b.current()).toBe('guardar');
    d.resolve(7);
    await expect(p).resolves.toBe(7);
    expect(b.current()).toBeNull();
    expect(seen).toEqual(['guardar', null]);
  });

  it('una segunda acción mientras espera no corre (no se guarda dos veces)', async () => {
    const b = createBusy<string>(() => {});
    const d = deferred<string>();
    let calls = 0;
    const first = b.run('guardar', () => {
      calls++;
      return d.promise;
    });
    const second = await b.run('borrar', async () => {
      calls++;
      return 'no';
    });
    expect(second).toBeUndefined();
    expect(calls).toBe(1);
    expect(b.current()).toBe('guardar');
    d.resolve('ok');
    await expect(first).resolves.toBe('ok');
    // Al terminar, ya se puede otra.
    await expect(b.run('borrar', async () => 'sí')).resolves.toBe('sí');
  });

  it('si falla, limpia igual y el error sigue de largo (lo muestra quien llama)', async () => {
    const seen: (number | null)[] = [];
    const b = createBusy<number>((k) => seen.push(k));
    const err = new Error('sin conexión');
    await expect(b.run(3, () => Promise.reject(err))).rejects.toBe(err);
    expect(b.current()).toBeNull();
    expect(seen).toEqual([3, null]);
  });

  it('un error al llamar (antes de la promesa) también limpia', async () => {
    const b = createBusy<string>(() => {});
    await expect(
      b.run('x', () => {
        throw new Error('mal');
      }),
    ).rejects.toThrow('mal');
    expect(b.current()).toBeNull();
  });
});
