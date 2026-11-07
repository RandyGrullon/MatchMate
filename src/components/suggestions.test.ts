/** El buzón de sugerencias sin pantalla (suggestions.ts): el día de la nota, borrar, quién ve la caja, el ritmo y mandar. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPace } from '../lib/pace';

const sent = vi.hoisted(() => ({ next: null as null | (() => Promise<string>) }));
vi.mock('../lib/data/suggestions', async (orig) => ({
  ...(await orig<typeof import('../lib/data/suggestions')>()),
  sendSuggestion: () => (sent.next ? sent.next() : Promise.resolve('n1')),
}));

const {
  deleteSuggestionConfirm,
  deliverSuggestion,
  markLabel,
  noteDay,
  setSuggestionDraft,
  showSuggestionBox,
  suggestionCounter,
  suggestionDraft,
  suggestionErrorText,
  suggestionOrganizers,
  suggestionPaceProblem,
  unreadIds,
} = await import('./suggestions');

beforeEach(() => {
  resetPace();
  sent.next = null;
});
afterEach(() => vi.useRealTimers());

describe('organizadores', () => {
  const now = new Date(2026, 10, 6, 15, 0);

  it('el día de la nota: hoy, ayer o la fecha', () => {
    expect(noteDay(undefined, now)).toBe('hoy');
    expect(noteDay(new Date(2026, 10, 6, 8, 0).getTime(), now)).toBe('hoy');
    expect(noteDay(new Date(2026, 10, 5, 23, 0).getTime(), now)).toBe('ayer');
    expect(noteDay(new Date(2026, 9, 1, 12, 0).getTime(), now)).not.toMatch(/^(hoy|ayer)$/);
  });

  it('las sin leer, el botón de cada una y lo que pregunta al borrar', () => {
    expect(unreadIds([{ id: 'a', read: false }, { id: 'b', read: true }, { id: 'c', read: false }])).toEqual(['a', 'c']);
    expect(markLabel(true)).toBe('Marcar como no leída');
    expect(markLabel(false)).toBe('Marcar como leída');
    expect(deleteSuggestionConfirm('Más prácticas los jueves')).toEqual({ title: '¿Borrar la sugerencia?', message: '“Más prácticas los jueves”', confirmText: 'Borrar', danger: true });
    expect(deleteSuggestionConfirm('x'.repeat(200)).message).toBe(`“${'x'.repeat(140)}…”`);
  });
});

describe('jugadores', () => {
  it('la caja: con cuenta, de la liga y sin organizarla', () => {
    expect(showSuggestionBox({ signedIn: true, member: true, isAdmin: false })).toBe(true);
    expect(showSuggestionBox({ signedIn: true, member: true, isAdmin: true })).toBe(false);
    expect(showSuggestionBox({ signedIn: true, member: false, isAdmin: false })).toBe(false);
    expect(showSuggestionBox({ signedIn: false, member: true, isAdmin: false })).toBe(false);
    expect(suggestionOrganizers('torneo')).toBe('los organizadores del torneo');
    expect(suggestionOrganizers(undefined)).toBe('los organizadores de la liga');
  });

  it('el contador y la nota a medio escribir por liga', () => {
    expect(suggestionCounter(12)).toEqual({ full: false, text: '12/1000' });
    expect(suggestionCounter(1000)).toEqual({ full: true, text: 'Llegaste al máximo (1000 letras): lo que sigue no entra.' });
    setSuggestionDraft('L1', 'Más prácticas');
    expect(suggestionDraft('L1')).toBe('Más prácticas');
    expect(suggestionDraft('L2')).toBe('');
    setSuggestionDraft('L1', '');
    expect(suggestionDraft('L1')).toBe('');
  });

  it('manda la nota y después pide esperar el minuto', async () => {
    expect(suggestionPaceProblem('L1')).toBeNull();
    expect(await deliverSuggestion('L1', 'u1', 'Más prácticas los jueves')).toEqual({ kind: 'ok' });
    expect(suggestionPaceProblem('L1')).toMatch(/^Ya enviaste una hace poco\. Podrás mandar otra en \d+ s\.$/);
    expect(suggestionPaceProblem('L2')).toBeNull();
  });

  it('sin señal queda en cola (y no deja mandar otra mientras tanto)', async () => {
    vi.useFakeTimers();
    let release: (id: string) => void = () => undefined;
    sent.next = () => new Promise<string>((r) => (release = r));
    const out = deliverSuggestion('L1', 'u1', 'Una nota', 1500);
    await vi.advanceTimersByTimeAsync(1500);
    const result = await out;
    expect(result.kind).toBe('en-cola');
    expect(suggestionPaceProblem('L1')).toBe('Tu sugerencia anterior todavía se está enviando. Espera a tener señal.');
    release('n2');
    if (result.kind === 'en-cola') await expect(result.sent).resolves.toBe('n2');
  });

  it('el error: el ritmo de la base o no se pudo', async () => {
    sent.next = () => Promise.reject(new Error('permission denied'));
    const result = await deliverSuggestion('L1', 'u1', 'Otra');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(suggestionErrorText(result.error)).toBe('Ya enviaste una hace poco. Espera un minuto para mandar otra.');
    expect(suggestionErrorText(new Error('network'))).toBe('No se pudo enviar tu sugerencia. Inténtalo de nuevo.');
  });
});
