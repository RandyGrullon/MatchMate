import { describe, expect, it, vi } from 'vitest';
import { PRO_SUGGESTION_ID, proSuggestion } from './proSuggestion';

describe('la sugerencia «Probar Pro»', () => {
  it('solo en Lite y a quien organiza', () => {
    expect(proSuggestion({ mode: 'lite', suggestedPro: false })).toBeNull();
    expect(proSuggestion({ mode: 'pro', suggestedPro: true })).toBeNull();
  });

  it('con los textos de siempre o los de la pantalla, y «Probar Pro»', () => {
    expect(proSuggestion({ mode: 'lite', suggestedPro: true })).toMatchObject({
      id: PRO_SUGGESTION_ID,
      kind: 'pro',
      title: 'Organizas una liga',
      text: 'Aprueba juegos en Pro',
      action: { label: 'Probar Pro' },
    });
    const onTry = vi.fn();
    const n = proSuggestion({ mode: 'lite', suggestedPro: true }, { title: 'Organizas esta liga', text: 'Resultados y ajustes en Pro' }, onTry);
    expect(n).toMatchObject({ title: 'Organizas esta liga', text: 'Resultados y ajustes en Pro' });
    n?.action?.onClick?.();
    expect(onTry).toHaveBeenCalledOnce();
  });
});
