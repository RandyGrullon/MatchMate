/**
 * «Agregar al vuelo» en una liga con menores (useQuickMinor): inscribir en un evento, parejas, noches y plantillas
 * preguntan «Es menor de edad» con su tutor, como «Agregar jugador». Sin menores, no sale nada y crea adultos.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LeagueContext, type LeagueCtx } from '../../lib/league';
import type { League } from '../../lib/types';
import { useQuickMinor, type QuickMinor } from './GuardianFields';

const league = (hasMinors: boolean): League => ({
  id: 'L1',
  name: 'Liga Infantil',
  kind: 'liga',
  visibility: 'private',
  ownerUid: 'u1',
  venue: '',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
  sport: 'basketball',
  hasMinors,
});

const ctx = (hasMinors: boolean): LeagueCtx => ({
  lid: 'L1',
  league: league(hasMinors),
  member: { id: 'L1_u1', leagueId: 'L1', uid: 'u1', name: 'Rosa', role: 'owner', playerId: 'p1' },
  isAdmin: true,
  isOwner: true,
  isScorer: false,
  canScore: true,
  myPlayerId: 'p1',
  base: '/l/L1',
});

/** Dibuja los campos y devuelve lo que dio el hook (para probar take()). */
function draw(hasMinors: boolean, show: boolean): { html: string; quick: QuickMinor } {
  let quick: QuickMinor | null = null;
  function Harness() {
    quick = useQuickMinor(show);
    return h('div', null, quick.fields);
  }
  const html = renderToString(h(LeagueContext.Provider, { value: ctx(hasMinors) }, h(Harness)));
  return { html, quick: quick! };
}

describe('useQuickMinor', () => {
  it('liga sin menores: no pregunta nada y crea un adulto', () => {
    const { html, quick } = draw(false, true);
    expect(html).not.toContain('Es menor de edad');
    expect(quick.take()).toBeNull();
  });

  it('liga con menores: con un nombre escrito, «Es menor de edad» (marcado), el tutor y el permiso', () => {
    const { html } = draw(true, true);
    expect(html).toContain('Es menor de edad');
    expect(html).toContain('Padre, madre o tutor');
    expect(html).toContain('Teléfono del tutor (opcional)');
    expect(html).toContain('El tutor dio permiso');
    expect(html).toMatch(/type="checkbox"[^>]*checked=""/);
  });

  it('liga con menores: sin nombre todavía no sale; sin tutor no deja crear', () => {
    expect(draw(true, false).html).not.toContain('Es menor de edad');
    // Marcado de entrada y sin tutor ni permiso: take() no da nada que crear.
    expect(draw(true, true).quick.take()).toBeUndefined();
  });
});
