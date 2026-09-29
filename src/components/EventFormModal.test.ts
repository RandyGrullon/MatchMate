/**
 * El formulario del torneo del boliche con la regla del dueño (docs/premios-torneo.md §5.1): un torneo nuevo nace con
 * individual con handicap y equipos por scratch, y debajo de las dos reglas se lee con qué se entregan los premios.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaults, RuleLine } from './EventFormModal';

const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('torneo nuevo del boliche', () => {
  it('nace con la regla del dueño: individual con handicap, equipos por scratch (230 / 80 %, equipos de 3)', () => {
    expect(defaults('torneo')).toMatchObject({ type: 'torneo', individualRankBy: 'hcp', teamRankBy: 'scratch', hcpBase: 230, hcpPercent: 80, teamSize: 3 });
    expect(defaults('practica')).toMatchObject({ hcpPercent: 0, teamSize: 0 });
  });

  it('la regla en palabras, con lo elegido, y el aviso con 0 % de handicap', () => {
    const line = (form: Parameters<typeof RuleLine>[0]['form']) => text(renderToString(h(RuleLine, { form })));
    expect(line(defaults('torneo'))).toBe('Los premios siguen esta regla: Equipos por scratch, Individual con handicap.');
    expect(line({ individualRankBy: 'scratch', teamRankBy: 'hcp', hcpPercent: 80 })).toBe('Los premios siguen esta regla: Equipos con handicap, Individual por scratch.');
    expect(line({ ...defaults('torneo'), hcpPercent: 0 })).toBe('Los premios siguen esta regla: Equipos por scratch, Individual con handicap. Con 0 % de handicap, el individual queda por scratch.');
  });
});
