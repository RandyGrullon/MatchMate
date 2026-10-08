/**
 * Piezas de la consola: el control segmentado mientras se guarda lo elegido (la ruedita en vez de su ícono, del mismo
 * tamaño, y no se puede cambiar mientras), como el estado de cada deporte; y las del rediseño: la barra de arriba con
 * «‹ Consola», el menú «•••», la cuadrícula de números, la paginación, la píldora con menú y los estados.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { Trash2 } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { DetailRow, EmptyCard, KpiCard, KpiGrid, MenuList, Pager, Pill, PillSelect, SectionHeader, Segmented } from './bits';

const options = [
  { value: 'open', label: 'Abierto', icon: h('svg', { className: 'size-3.5', 'data-icon': 'open' }) },
  { value: 'beta', label: 'Beta', icon: h('svg', { className: 'size-3.5', 'data-icon': 'beta' }) },
  { value: 'closed', label: 'Cerrado', icon: h('svg', { className: 'size-3.5', 'data-icon': 'closed' }) },
] as const;

const render = (busy?: boolean) => renderToString(h(Segmented<'open' | 'beta' | 'closed'>, { label: 'Estado', options, value: 'beta', onChange: () => {}, busy }));

describe('Segmented', () => {
  it('sin guardar: los íconos tal cual, sin ruedita y se puede cambiar', () => {
    const html = render();
    expect(html).not.toContain('animate-spin');
    expect(html).not.toContain('aria-busy');
    expect(html).not.toContain('disabled');
    for (const o of options) expect(html).toContain(`data-icon="${o.value}"`);
  });

  it('guardando: la ruedita del mismo tamaño en lugar del ícono de lo elegido, y nada se puede tocar', () => {
    const html = render(true);
    expect(html).toContain('aria-busy="true"');
    // Solo lo elegido cambia el ícono; los otros lo conservan.
    expect(html).not.toContain('data-icon="beta"');
    expect(html).toContain('data-icon="open"');
    expect(html).toContain('data-icon="closed"');
    const spin = /<svg[^>]*class="([^"]*animate-spin[^"]*)"/.exec(html)?.[1].split(/\s+/) ?? [];
    expect(spin).toContain('size-3.5');
    expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(options.length);
    // La ruedita va en el botón marcado.
    const checked = /<button[^>]*aria-checked="true"[^>]*>(.*?)<\/button>/.exec(html)?.[1] ?? '';
    expect(checked).toContain('animate-spin');
  });
});

// ---------- Piezas del rediseño en la consola ----------

const inRouter = (el: ReturnType<typeof h>) => renderToString(h(MemoryRouter, null, el));

describe('SectionHeader', () => {
  it('«‹ Consola» arriba (solo en teléfono y tableta), actualizar, el título de Pro y una línea corta', () => {
    const html = inRouter(h(SectionHeader, { title: 'Cuentas', hint: 'Buscar y bloquear' }));
    expect(html).toMatch(/<div class="[^"]*lg:hidden[^"]*"><a[^>]*href="\/superadmin"/);
    expect(html).toContain('<span class="truncate">Consola</span>');
    expect(html).toContain('aria-label="Actualizar los datos"');
    expect(html).toMatch(/<h1 class="[^"]*text-title-pro[^"]*">Cuentas<\/h1>/);
    expect(html).toContain('Buscar y bloquear');
    // Sin menú no hay «•••».
    expect(html).not.toContain('aria-label="Más opciones"');
  });

  it('a otro lugar con `back`, una píldora (la acción de la pantalla) y «•••» con el menú', () => {
    const html = inRouter(
      h(SectionHeader, {
        title: 'Consola',
        back: { to: '/organizar', label: 'Organizar' },
        actions: h(Pill, { onClick: () => {}, label: 'Bajar en CSV', children: 'CSV' }),
        menu: [{ key: 'x', icon: Trash2, label: 'Borrar todos', onClick: () => {}, danger: true }],
      }),
    );
    expect(html).toContain('href="/organizar"');
    expect(html).toContain('aria-label="Bajar en CSV"');
    expect(html).toContain('aria-label="Más opciones"');
    expect(html).toContain('aria-haspopup="dialog"');
  });
});

describe('MenuList', () => {
  it('cada opción como fila: link o botón, la línea de abajo, y la peligrosa en rojo y sin chevron', () => {
    const html = inRouter(
      h(MenuList, {
        items: [
          { key: 'abrir', icon: Trash2, label: 'Abrir la liga', to: '/l/l1', hint: 'Boliche' },
          { key: 'borrar', icon: Trash2, label: 'Borrar la liga', onClick: () => {}, danger: true },
          { key: 'no', icon: Trash2, label: 'No se puede', onClick: () => {}, disabled: true },
        ],
      }),
    );
    expect(html).toMatch(/<a[^>]*href="\/l\/l1"/);
    expect(html).toContain('Boliche');
    expect(html).toMatch(/<button[^>]*class="[^"]*text-danger[^"]*"[^>]*>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*No se puede/);
  });
});

describe('KpiGrid y KpiCard', () => {
  it('los números en una sola tarjeta; el que lleva a algún lado se toca entero y tiene chevron', () => {
    const html = inRouter(
      h(KpiGrid, null, h(KpiCard, { label: 'Cuentas', value: '1,240', to: '/superadmin/cuentas', note: '+35 en 7 días' }), h(KpiCard, { label: 'Activas', value: '410' })),
    );
    expect(html.match(/rounded-3xl/g)).toHaveLength(1);
    expect(html).toMatch(/<a[^>]*href="\/superadmin\/cuentas"/);
    expect(html).toContain('lucide-chevron-right');
    expect(html).toMatch(/<b class="num[^"]*">1,240<\/b>/);
    expect(html).toContain('+35 en 7 días');
  });
});

describe('Pager', () => {
  it('pocas filas: solo «1–3 de 3», sin «por página» ni flechas', () => {
    const html = renderToString(h(Pager, { page: 0, pageSize: 25, total: 3, onPage: () => {}, onPageSize: () => {}, noun: 'cuentas' }));
    expect(html).toContain('1–3 de 3 cuentas');
    expect(html).not.toContain('Filas por página');
    expect(html).not.toContain('Página siguiente');
  });

  it('muchas: «por página» en una píldora y flechas redondas', () => {
    const html = renderToString(h(Pager, { page: 1, pageSize: 25, total: 120, onPage: () => {}, onPageSize: () => {}, noun: 'cuentas' }));
    expect(html).toContain('26–50 de 120 cuentas');
    expect(html).toContain('aria-label="Filas por página"');
    expect(html).toContain('25 por página');
    expect(html).toContain('aria-label="Página anterior"');
    expect(html.replace(/<!-- -->/g, '')).toContain('2 / 5');
  });
});

describe('PillSelect', () => {
  it('se ve lo elegido (corto si tiene) con su ícono, y el menú del teléfono encima', () => {
    const html = renderToString(
      h(PillSelect<'all' | 'public'>, {
        label: 'Visibilidad',
        icon: h('svg', { 'data-icon': 'globe' }),
        options: [
          { key: 'all', label: 'Públicas y privadas', short: 'Todas' },
          { key: 'public', label: 'Solo públicas', short: 'Públicas' },
        ],
        value: 'all',
        onChange: () => {},
      }),
    );
    expect(html).toContain('data-icon="globe"');
    expect(html).toMatch(/<span aria-hidden="true" class="truncate">Todas<\/span>/);
    expect(html).toContain('<select aria-label="Visibilidad"');
    expect(html).toContain('Públicas y privadas</option>');
  });
});

describe('estados', () => {
  it('vacío sin borde punteado (va en su tarjeta) y la fila de detalle con el texto entero', () => {
    const empty = renderToString(h(EmptyCard, { title: 'Nada por revisar' }, 'Cuando alguien reporte algo, sale aquí.'));
    expect(empty).toContain('Nada por revisar');
    expect(empty).not.toContain('border-dashed');
    const row = renderToString(h(DetailRow, { title: 'Pendiente' }, 'Un texto largo que no se corta'));
    expect(row).toContain('mm-row');
    expect(row).not.toContain('line-clamp');
  });
});
