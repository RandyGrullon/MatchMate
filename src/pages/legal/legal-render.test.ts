/**
 * Humo de las pantallas de la cuenta (sin navegador, renderToString): privacidad y términos con su versión, su aviso
 * de borrador (solo el superadmin) y sus anclas, la tarjeta «Tus datos» de Configuración, la pantalla de «tengo 18
 * años o más», la de «Actualizamos los términos» y la casilla «Acepto…» de «Crear cuenta».
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '../../components/feedback';
import { PRIVACY_VERSION, TERMS_VERSION, legalDate } from '../../lib/legal';

const state = vi.hoisted(() => ({
  needsAdult: true,
  user: true,
  super: false,
  /** Lo que aceptó (null = no se sabe todavía: no se pregunta). */
  legal: null as { terms: string | null; privacy: string | null } | null,
  /** Cuándo se creó la cuenta (las de antes de guardar la aceptación ven lo nuevo). */
  createdAt: '2026-10-01T12:00:00.000Z',
}));

vi.mock('../../lib/auth', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/auth')>();
  const { needsLegal } = await import('../../lib/legal');
  return {
    ...real,
    useAuth: () => ({
      user: state.user ? { uid: 'u-1', email: 'ana@x.com', displayName: 'Ana' } : null,
      profile: state.user
        ? {
            id: 'u-1',
            email: 'ana@x.com',
            name: 'Ana',
            adultConfirmedAt: state.needsAdult ? null : '2026-09-01T00:00:00.000Z',
            legal: state.legal ?? undefined,
            createdAt: state.createdAt,
          }
        : null,
      isSuper: state.super,
      loading: false,
      recovering: false,
      needsAdult: state.user && state.needsAdult,
      needsLegal: state.user && needsLegal(state.legal),
    }),
  };
});

let PrivacyPage: typeof import('./PrivacyPage').default;
let TermsPage: typeof import('./TermsPage').default;
let AccountDataCard: typeof import('./AccountDataCard').AccountDataCard;
let AdultGate: typeof import('../../components/AdultGate').AdultGate;
let LegalGate: typeof import('../../components/LegalGate').LegalGate;
let AcceptTermsBox: typeof import('../../components/AcceptTermsBox').AcceptTermsBox;
let PRIVACY_SECTIONS: typeof import('./PrivacyPage').PRIVACY_SECTIONS;
let TERMS_SECTIONS: typeof import('./TermsPage').TERMS_SECTIONS;

beforeAll(async () => {
  if (typeof navigator === 'undefined') vi.stubGlobal('navigator', { onLine: true, userAgent: 'node' });
  ({ default: PrivacyPage, PRIVACY_SECTIONS } = await import('./PrivacyPage'));
  ({ default: TermsPage, TERMS_SECTIONS } = await import('./TermsPage'));
  ({ AccountDataCard } = await import('./AccountDataCard'));
  ({ AdultGate } = await import('../../components/AdultGate'));
  ({ LegalGate } = await import('../../components/LegalGate'));
  ({ AcceptTermsBox } = await import('../../components/AcceptTermsBox'));
}, 120_000);

beforeEach(() => {
  state.needsAdult = true;
  state.user = true;
  state.super = false;
  state.legal = null;
  state.createdAt = '2026-10-01T12:00:00.000Z';
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
  it('privacidad: versión, leyes, fotos de Google, menores, avisos, reportes, derechos, con anclas', () => {
    const raw = html('/privacidad', h(PrivacyPage));
    const out = text(raw);
    expect(out).toContain('Política de privacidad');
    expect(out).toContain(`Versión ${legalDate(PRIVACY_VERSION)} · vigente desde`);
    // El borrador solo lo ve el superadmin.
    expect(out).not.toContain('Borrador');
    for (const law of ['Ley 172-13', 'Ley 136-03', 'Ley 53-07', 'artículo 70']) expect(out).toContain(law);
    expect(out).toContain('Gemini');
    expect(out).toContain('plan gratis');
    expect(out).toContain('mayores de 18 años');
    expect(out).toContain('Descargar mis datos');
    expect(out).toContain('Borrar mi cuenta');
    expect(out).toContain('Estados Unidos');
    expect(out).toContain('notificaciones push');
    expect(out).toContain('sin saber quién lo reportó');
    expect(out).toContain('qué versión y desde qué navegador');
    // El correo de contacto ya es real: un link.
    expect(raw).toContain('href="mailto:matchmate.oficial@gmail.com"');
    // Anclas que usan otras pantallas (aviso de las fotos, borrar la cuenta, términos).
    for (const id of ['fotos', 'menores', 'tiempo', 'derechos', 'avisos', 'reportes']) expect(raw).toContain(`id="${id}"`);
    expect(new Set(PRIVACY_SECTIONS.map((s) => s.id)).size).toBe(PRIVACY_SECTIONS.length);
    // Lo que falta llenar (datos del titular) se ve marcado, sin inventar nada.
    expect(raw).toContain('<mark');
    expect(out).toContain('[Nombre legal del titular]');
    expect(out).toContain('[RNC o cédula del titular]');
    expect(raw).toContain('href="/terminos"');
  });

  it('términos: versión, solo adultos, lo que no se permite, reportar, ley dominicana', () => {
    const raw = html('/terminos', h(TermsPage));
    const out = text(raw);
    expect(out).toContain('Términos de uso');
    expect(out).toContain(`Versión ${legalDate(TERMS_VERSION)} · vigente desde`);
    expect(out).not.toContain('Borrador');
    expect(out).toContain('Solo los mayores de 18 años pueden tener cuenta');
    expect(out).toContain('Anotar resultados falsos');
    expect(out).toContain('Reportar y moderar');
    expect(out).toContain('Ley 53-07');
    expect(out).toContain('República Dominicana');
    expect(out).toContain('[Nombre legal del titular]');
    expect(raw).toContain('href="mailto:matchmate.oficial@gmail.com"');
    // Los links a la privacidad llevan a secciones que existen.
    for (const hash of ['#fotos', '#tiempo', '#avisos']) {
      expect(raw).toContain(`href="/privacidad${hash}"`);
      expect(PRIVACY_SECTIONS.some((s) => `#${s.id}` === hash)).toBe(true);
    }
    expect(new Set(TERMS_SECTIONS.map((s) => s.id)).size).toBe(TERMS_SECTIONS.length);
  });

  it('el superadmin ve el aviso de borrador: falta la revisión de un abogado dominicano', () => {
    state.super = true;
    for (const page of [PrivacyPage, TermsPage]) {
      const out = text(html('/x', h(page)));
      expect(out).toContain('Borrador.');
      expect(out).toContain('Pendiente: revisión por un abogado dominicano');
    }
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

describe('actualizamos los términos', () => {
  const app = h('p', null, 'LA APP');
  const gate = (url = '/ligas') => html(url, h(LegalGate, null, app));

  it('aceptó una versión vieja: lo nuevo, los dos links, «Acepto» y salir', () => {
    state.needsAdult = false;
    state.legal = { terms: '2020-01-01', privacy: '2020-01-01' };
    const raw = gate();
    const out = text(raw);
    expect(out).not.toContain('LA APP');
    expect(out).toContain('Actualizamos los términos');
    expect(out).toContain('Cambiamos los Términos de uso y la Política de privacidad. Esto es lo nuevo:');
    expect(out).toContain('reportar comentarios');
    expect(out).toContain('Acepto');
    expect(out).toContain('Salir de la cuenta');
    expect(out).toContain('borrar tu cuenta');
    expect(out).toContain(`Versión ${legalDate(TERMS_VERSION)}`);
    expect(raw).toContain('href="/terminos"');
    expect(raw).toContain('href="/privacidad"');
  });

  it('solo cambió la privacidad: solo lo nuevo de la privacidad', () => {
    state.needsAdult = false;
    state.legal = { terms: TERMS_VERSION, privacy: '2020-01-01' };
    const out = text(gate());
    expect(out).toContain('Cambiamos la Política de privacidad.');
    expect(out).toContain('desde qué navegador');
    expect(out).not.toContain('reportar comentarios');
  });

  it('cuenta nueva que nunca aceptó (Google sin la casilla): «Antes de seguir», sin lista de cambios', () => {
    state.needsAdult = false;
    state.legal = { terms: null, privacy: null };
    const out = text(gate());
    expect(out).toContain('Antes de seguir');
    expect(out).toContain('Para usar MatchMate tienes que aceptar los Términos de uso y la Política de privacidad.');
    expect(out).not.toContain('Esto es lo nuevo');
  });

  it('cuenta de antes de guardar la aceptación (aceptó el texto sin versión): «Actualizamos los términos» con todo lo nuevo', () => {
    state.needsAdult = false;
    state.legal = { terms: null, privacy: null };
    state.createdAt = '2026-09-10T12:00:00.000Z';
    const out = text(gate());
    expect(out).toContain('Actualizamos los términos');
    expect(out).toContain('Cambiamos los Términos de uso y la Política de privacidad. Esto es lo nuevo:');
    expect(out).toContain('reportar comentarios');
    expect(out).toContain('desde qué navegador');
    expect(out).not.toContain('Antes de seguir');
  });

  it('las páginas legales se leen igual; al día, sin saber aún o sin cuenta: la app; primero va la de 18 años', () => {
    state.needsAdult = false;
    state.legal = { terms: '2020-01-01', privacy: '2020-01-01' };
    expect(text(gate('/privacidad'))).toContain('LA APP');
    expect(text(gate('/terminos'))).toContain('LA APP');
    // Mientras falte «tengo 18 años», esta no sale (AdultGate va primero).
    state.needsAdult = true;
    expect(text(gate())).toContain('LA APP');
    state.needsAdult = false;
    state.legal = { terms: TERMS_VERSION, privacy: PRIVACY_VERSION };
    expect(text(gate())).toContain('LA APP');
    state.legal = null;
    expect(text(gate())).toContain('LA APP');
    state.user = false;
    expect(text(gate())).toContain('LA APP');
  });
});

describe('crear cuenta: «Acepto los Términos y la Política de privacidad»', () => {
  it('casilla obligatoria con los dos links', () => {
    const raw = html('/login?modo=registro', h(AcceptTermsBox, { checked: false, onChange: () => undefined }));
    expect(text(raw)).toContain('Acepto los Términos y la Política de privacidad');
    expect(raw).toMatch(/<input[^>]*type="checkbox"[^>]*required/);
    expect(raw).toContain('href="/terminos"');
    expect(raw).toContain('href="/privacidad"');
  });
});
