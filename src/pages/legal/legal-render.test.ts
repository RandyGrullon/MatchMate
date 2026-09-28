/**
 * Humo de las pantallas de la cuenta (sin navegador, renderToString): privacidad y términos con su aviso de
 * borrador y sus anclas, la tarjeta «Tus datos» de Configuración y la pantalla de «tengo 18 años o más».
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '../../components/feedback';

const state = vi.hoisted(() => ({ needsAdult: true, user: true }));

vi.mock('../../lib/auth', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/auth')>();
  return {
    ...real,
    useAuth: () => ({
      user: state.user ? { uid: 'u-1', email: 'ana@x.com', displayName: 'Ana' } : null,
      profile: state.user ? { id: 'u-1', email: 'ana@x.com', name: 'Ana', adultConfirmedAt: state.needsAdult ? null : '2026-09-01T00:00:00.000Z' } : null,
      isSuper: false,
      loading: false,
      recovering: false,
      needsAdult: state.user && state.needsAdult,
    }),
  };
});

let PrivacyPage: typeof import('./PrivacyPage').default;
let TermsPage: typeof import('./TermsPage').default;
let AccountDataCard: typeof import('./AccountDataCard').AccountDataCard;
let AdultGate: typeof import('../../components/AdultGate').AdultGate;
let PRIVACY_SECTIONS: typeof import('./PrivacyPage').PRIVACY_SECTIONS;

beforeAll(async () => {
  if (typeof navigator === 'undefined') vi.stubGlobal('navigator', { onLine: true, userAgent: 'node' });
  ({ default: PrivacyPage, PRIVACY_SECTIONS } = await import('./PrivacyPage'));
  ({ default: TermsPage } = await import('./TermsPage'));
  ({ AccountDataCard } = await import('./AccountDataCard'));
  ({ AdultGate } = await import('../../components/AdultGate'));
}, 120_000);

beforeEach(() => {
  state.needsAdult = true;
  state.user = true;
});

const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

function html(url: string, element: ReactNode, path = '*'): string {
  return renderToString(h(MemoryRouter, { initialEntries: [url] }, h(FeedbackProvider, null, h(Routes, null, h(Route, { path, element })))));
}

describe('privacidad y términos', () => {
  it('privacidad: borrador, leyes, fotos de Google, menores, derechos, con anclas', () => {
    const raw = html('/privacidad', h(PrivacyPage));
    const out = text(raw);
    expect(out).toContain('Política de privacidad');
    expect(out).toContain('Borrador para revisar con un abogado');
    expect(out).toContain('Ley 172-13');
    expect(out).toContain('Ley 136-03');
    expect(out).toContain('Gemini');
    expect(out).toContain('plan gratis');
    expect(out).toContain('mayores de 18 años');
    expect(out).toContain('Descargar mis datos');
    expect(out).toContain('Borrar mi cuenta');
    expect(out).toContain('Estados Unidos');
    // Anclas que usan otras pantallas (aviso de las fotos, borrar la cuenta).
    for (const id of ['fotos', 'menores', 'tiempo', 'derechos']) expect(raw).toContain(`id="${id}"`);
    expect(new Set(PRIVACY_SECTIONS.map((s) => s.id)).size).toBe(PRIVACY_SECTIONS.length);
    // Lo que falta llenar se ve marcado.
    expect(raw).toContain('<mark');
    expect(raw).toContain('href="/terminos"');
  });

  it('términos: solo adultos, lo que no se permite, ley dominicana', () => {
    const out = text(html('/terminos', h(TermsPage)));
    expect(out).toContain('Términos de uso');
    expect(out).toContain('Borrador para revisar con un abogado');
    expect(out).toContain('Solo los mayores de 18 años pueden tener cuenta');
    expect(out).toContain('Anotar resultados falsos');
    expect(out).toContain('República Dominicana');
  });
});

describe('Configuración › Tus datos', () => {
  it('links a privacidad y términos, bajar mis datos y borrar la cuenta', () => {
    const raw = html('/cuenta', h(AccountDataCard, { onDeleted: () => undefined }));
    const out = text(raw);
    expect(out).toContain('Tus datos');
    expect(out).toContain('Descargar mis datos');
    expect(out).toContain('Borrar mi cuenta');
    expect(raw).toContain('href="/privacidad"');
    expect(raw).toContain('href="/terminos"');
  });
});

describe('tengo 18 años o más', () => {
  const app = h('p', null, 'LA APP');

  it('sin la marca: la pregunta en vez de la app, con los links', () => {
    const raw = html('/ligas', h(AdultGate, null, app));
    const out = text(raw);
    expect(out).not.toContain('LA APP');
    expect(out).toContain('¿Tienes 18 años o más?');
    expect(out).toContain('Sí, tengo 18 años o más');
    expect(out).toContain('No, soy menor de 18');
    expect(raw).toContain('href="/privacidad"');
  });

  it('la privacidad y los términos se leen igual; con la marca o sin cuenta, la app', () => {
    expect(text(html('/privacidad', h(AdultGate, null, app)))).toContain('LA APP');
    expect(text(html('/terminos', h(AdultGate, null, app)))).toContain('LA APP');
    state.needsAdult = false;
    expect(text(html('/ligas', h(AdultGate, null, app)))).toContain('LA APP');
    state.user = false;
    expect(text(html('/ligas', h(AdultGate, null, app)))).toContain('LA APP');
  });
});
