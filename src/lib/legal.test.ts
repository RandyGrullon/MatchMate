/**
 * Versiones de los términos y la privacidad (src/lib/legal.ts): qué le falta aceptar a cada cuenta, lo nuevo de cada
 * documento, lo que falta llenar en los textos y la casilla «Acepto…» antes de ir a Google. Que la base tenga las
 * mismas versiones lo revisa tests/sql/legal.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CURRENT_LEGAL,
  LEGAL_CHANGES,
  LEGAL_CONTACT,
  LEGAL_DOCS,
  LEGAL_PLACEHOLDERS,
  LEGAL_TRACKED_SINCE,
  PRIVACY_VERSION,
  TERMS_VERSION,
  acceptedNow,
  accountBeforeLegal,
  createdAfterMark,
  forgetLegalForGoogle,
  isPlaceholder,
  latestAccepted,
  legalChangesFor,
  legalDate,
  legalPending,
  needsLegal,
  neverAccepted,
  rememberLegalForGoogle,
  takeLegalPending,
} from './legal';

describe('versiones', () => {
  it('fechas YYYY-MM-DD; rige desde la versión o después; las mismas en el registro', () => {
    for (const d of Object.values(LEGAL_DOCS)) {
      expect(d.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d.effective).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d.effective >= d.version).toBe(true);
    }
    expect(CURRENT_LEGAL).toEqual({ terms: TERMS_VERSION, privacy: PRIVACY_VERSION });
    expect(legalDate('2026-09-29')).toBe('29 de septiembre de 2026');
    expect(legalDate('raro')).toBe('raro');
  });

  it('cada documento tiene algo en la lista de cambios', () => {
    expect(LEGAL_CHANGES.some((c) => c.doc === 'terminos')).toBe(true);
    expect(LEGAL_CHANGES.some((c) => c.doc === 'privacidad')).toBe(true);
  });
});

describe('qué le falta aceptar', () => {
  it('la última versión de cada documento (ignora lo que no es fecha)', () => {
    expect(
      latestAccepted([
        { doc: 'terminos', version: '2026-01-01' },
        { doc: 'terminos', version: '2026-09-29' },
        { doc: 'privacidad', version: '2025-05-05' },
        { doc: 'privacidad', version: 'basura' },
        { doc: 'otro', version: '2030-01-01' },
      ]),
    ).toEqual({ terms: '2026-09-29', privacy: '2025-05-05' });
    expect(latestAccepted([])).toEqual({ terms: null, privacy: null });
  });

  it('vieja o ninguna: falta; la vigente o una más nueva (app más nueva en otro teléfono): no', () => {
    expect(legalPending({ terms: null, privacy: null })).toEqual(['terminos', 'privacidad']);
    expect(legalPending({ terms: '2020-01-01', privacy: PRIVACY_VERSION })).toEqual(['terminos']);
    expect(legalPending({ terms: TERMS_VERSION, privacy: '2020-01-01' })).toEqual(['privacidad']);
    expect(legalPending({ terms: TERMS_VERSION, privacy: PRIVACY_VERSION })).toEqual([]);
    expect(legalPending({ terms: '2099-01-01', privacy: '2099-01-01' })).toEqual([]);
    expect(needsLegal({ terms: '2020-01-01', privacy: PRIVACY_VERSION })).toBe(true);
    expect(needsLegal({ terms: TERMS_VERSION, privacy: PRIVACY_VERSION })).toBe(false);
    // No se sabe todavía (copia vieja del perfil): no se pregunta.
    expect(needsLegal(undefined)).toBe(false);
    expect(needsLegal(null)).toBe(false);
    expect(neverAccepted({ terms: null, privacy: null })).toBe(true);
    expect(neverAccepted({ terms: '2020-01-01', privacy: null })).toBe(false);
  });

  it('cuenta de antes de guardar la aceptación: creada antes de LEGAL_TRACKED_SINCE (sin fecha, no se sabe: no)', () => {
    expect(LEGAL_TRACKED_SINCE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(accountBeforeLegal('2026-09-10T12:00:00.000Z')).toBe(true);
    expect(accountBeforeLegal('2026-09-28 23:59:59+00')).toBe(true);
    expect(accountBeforeLegal(`${LEGAL_TRACKED_SINCE}T00:00:00.000Z`)).toBe(false);
    expect(accountBeforeLegal('2026-10-01T12:00:00.000Z')).toBe(false);
    expect(accountBeforeLegal(null)).toBe(false);
    expect(accountBeforeLegal(undefined)).toBe(false);
    expect(accountBeforeLegal('basura')).toBe(false);
  });

  it('lo nuevo solo de lo que le falta; después de aceptar queda al día (sin bajar una más nueva)', () => {
    expect(legalChangesFor(['privacidad'])).toEqual(LEGAL_CHANGES.filter((c) => c.doc === 'privacidad').map((c) => c.text));
    expect(legalChangesFor([])).toEqual([]);
    expect(acceptedNow({ terms: '2020-01-01', privacy: null })).toEqual({ terms: TERMS_VERSION, privacy: PRIVACY_VERSION });
    expect(acceptedNow({ terms: '2099-01-01', privacy: PRIVACY_VERSION })).toEqual({ terms: '2099-01-01', privacy: PRIVACY_VERSION });
    expect(needsLegal(acceptedNow(undefined))).toBe(false);
  });
});

describe('lo que falta llenar', () => {
  it('los datos del titular entre corchetes (sin inventar) y el correo real', () => {
    expect(LEGAL_CONTACT.email).toBe('matchmate.oficial@gmail.com');
    expect(isPlaceholder(LEGAL_CONTACT.email)).toBe(false);
    expect(LEGAL_PLACEHOLDERS.map((p) => p.text)).toEqual([LEGAL_CONTACT.responsible, LEGAL_CONTACT.taxId, LEGAL_CONTACT.address]);
    for (const p of LEGAL_PLACEHOLDERS) {
      expect(isPlaceholder(p.text)).toBe(true);
      expect(p.what.length).toBeGreaterThan(10);
      expect(p.where.length).toBeGreaterThan(5);
    }
  });
});

describe('«Acepto…» antes de ir a Google', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const t = Date.parse('2026-09-29T12:00:00Z');
  /** La cuenta nueva que vuelve de Google (la base la crea un par de minutos después de marcar la casilla). */
  const fresh = new Date(t + 2 * 60_000).toISOString();

  it('vale una vez y por 1 hora', () => {
    expect(takeLegalPending(fresh, t)).toBe(false);
    rememberLegalForGoogle(t);
    expect(takeLegalPending(fresh, t + 10 * 60_000)).toBe(true);
    expect(takeLegalPending(fresh, t + 10 * 60_000)).toBe(false);
    rememberLegalForGoogle(t);
    expect(takeLegalPending(fresh, t + 61 * 60_000)).toBe(false);
  });

  it('solo para una cuenta creada después de marcarla: otra que entre en el mismo teléfono no queda aceptada', () => {
    // Una cuenta que ya existía (Google devolvió una cuenta vieja, o entra otra persona antes de la hora).
    rememberLegalForGoogle(t);
    expect(takeLegalPending('2026-09-01T10:00:00.000Z', t + 5 * 60_000)).toBe(false);
    // Y la marca se gastó: la cuenta nueva que venga después tampoco la usa.
    expect(takeLegalPending(fresh, t + 6 * 60_000)).toBe(false);
    // Sin fecha de la cuenta no se sabe: no.
    rememberLegalForGoogle(t);
    expect(takeLegalPending(null, t + 60_000)).toBe(false);
    // El reloj del teléfono va hasta 5 minutos adelantado: vale igual.
    rememberLegalForGoogle(t);
    expect(takeLegalPending(new Date(t - 4 * 60_000).toISOString(), t + 60_000)).toBe(true);
    expect(createdAfterMark(new Date(t - 6 * 60_000).toISOString(), t)).toBe(false);
    expect(createdAfterMark('raro', t)).toBe(false);
  });

  it('al salir de la cuenta se olvida', () => {
    rememberLegalForGoogle(t);
    forgetLegalForGoogle();
    expect(takeLegalPending(fresh, t + 60_000)).toBe(false);
  });

  it('con otra versión (se marcó con una app vieja) o basura: no vale', () => {
    store.set('mm:acepto-legal', JSON.stringify({ at: 1, terms: '2020-01-01', privacy: PRIVACY_VERSION }));
    expect(takeLegalPending(fresh, 2)).toBe(false);
    store.set('mm:acepto-legal', '{no es json');
    expect(takeLegalPending(fresh, 2)).toBe(false);
    // Sin almacenamiento no falla.
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
      removeItem: () => undefined,
    });
    expect(() => rememberLegalForGoogle()).not.toThrow();
    expect(() => forgetLegalForGoogle()).not.toThrow();
    expect(takeLegalPending(fresh)).toBe(false);
  });
});
