/**
 * La pantalla propia del boliche en Organizar (Equipos) es la misma en Hub.tsx y en logic.ts (BOWLING_TEAMS_TAB, que
 * usa la fila de la app del teléfono): la misma clave, el mismo título y la misma línea. Sin navegador.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { League } from '../../lib/types';
import { useOwnTabs } from '../organizer/Hub';
import { BOWLING_TEAMS_TAB } from './logic';

const league = (kind: League['kind']): League => ({
  id: 'L1',
  name: 'Liga de Ejemplo',
  kind,
  visibility: 'private',
  ownerUid: 'u1',
  venue: '',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: true,
  sport: 'bowling',
});

function Tabs({ kind }: { kind: League['kind'] }) {
  const own = useOwnTabs(league(kind));
  return h('pre', null, JSON.stringify(own.extra.map((t) => ({ key: t.key, label: t.label, subtitle: t.subtitle }))));
}

const tabsOf = (kind: League['kind']) => JSON.parse(renderToString(h(Tabs, { kind })).replace(/^<pre>|<\/pre>$/g, '').replace(/&quot;/g, '"')) as unknown[];

describe('Organizar › Equipos del boliche', () => {
  it('la de Hub.tsx es BOWLING_TEAMS_TAB', () => {
    expect(tabsOf('liga')).toEqual([BOWLING_TEAMS_TAB]);
  });

  it('un torneo suelto no la tiene', () => {
    expect(tabsOf('torneo')).toEqual([]);
  });
});
