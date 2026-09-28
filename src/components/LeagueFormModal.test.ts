/**
 * El formulario de la liga: la zona horaria y «Liga con menores» (con lo que cambia explicado), y lo que no deja
 * cuando está activada. Se dibuja sin navegador (renderToString).
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LeagueInput } from '../lib/data/leagues';
import { FeedbackProvider } from './feedback';
import { LeagueForm } from './LeagueFormModal';

const base: LeagueInput = {
  name: 'Club Delfines',
  kind: 'liga',
  visibility: 'private',
  venue: '',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
  hasMinors: false,
  tz: 'America/Santo_Domingo',
};

const draw = (initial: LeagueInput, opts: { creating?: boolean; withDate?: boolean; sport?: string } = {}) =>
  renderToString(h(FeedbackProvider, null, h(LeagueForm, { id: 'f', initial, onSubmit: () => {}, sport: opts.sport ?? 'swimming', ...opts })));

describe('formulario de la liga: zona horaria y menores', () => {
  it('al crear una liga: la zona (RD elegida) y el interruptor apagado, con lo que cambia', () => {
    const html = draw(base, { creating: true });
    expect(html).toContain('Zona horaria');
    expect(html).toMatch(/<option value="America\/Santo_Domingo" selected="">República Dominicana/);
    expect(html).toContain('Liga con menores');
    expect(html).toContain('Al activarla queda privada');
    const box = /<input type="checkbox"[^>]*aria-describedby="menores-reglas"[^>]*>/.exec(html)?.[0] ?? '';
    expect(box).not.toBe('');
    expect(box).not.toContain('checked=""');
    expect(box).not.toContain('disabled=""');
  });

  it('un torneo nuevo no las lleva (create_tournament no las recibe)', () => {
    const html = draw({ ...base, kind: 'torneo' }, { creating: true, withDate: true });
    expect(html).not.toContain('Zona horaria');
    expect(html).not.toContain('con menores');
  });

  it('activada: explica las reglas y no deja la liga pública', () => {
    const html = draw({ ...base, hasMinors: true }, { creating: true });
    expect(html).toContain('Los menores no tienen cuenta');
    expect(html).toContain('Sin fotos, sin «Me gusta» y sin comentarios');
    expect(html).toContain('Con menores no se puede.');
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*disabled=""[^>]*>.*Pública/);
    expect(html).toContain('Una vez guardada, no la puedes apagar tú.');
  });

  it('ya guardada con menores: el admin no la puede apagar', () => {
    const html = draw({ ...base, hasMinors: true });
    const box = /<input type="checkbox"[^>]*aria-describedby="menores-reglas"[^>]*>/.exec(html)?.[0] ?? '';
    expect(box).toContain('checked=""');
    expect(box).toContain('disabled=""');
    expect(html).toContain('Solo el equipo de MatchMate la puede apagar');
  });

  it('una zona que no está en la lista sale igual (la de la liga)', () => {
    const html = draw({ ...base, tz: 'America/El_Salvador' });
    expect(html).toMatch(/<option value="America\/El_Salvador" selected="">America\/El Salvador/);
  });

  it('boliche: con menores no sale lo de la foto obligatoria', () => {
    expect(draw({ ...base, requirePhoto: true }, { creating: true, sport: 'bowling' })).toContain('Exigir foto del marcador');
    expect(draw({ ...base, hasMinors: true }, { creating: true, sport: 'bowling' })).not.toContain('Exigir foto del marcador');
  });
});
