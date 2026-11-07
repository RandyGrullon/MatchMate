import { describe, expect, it } from 'vitest';
import type { LeagueFeed } from '../../lib/data';
import type { Submission } from '../../lib/types';
import { homePendingNotice } from './homeNotices';

// Datos de mentira: «Liga de Ejemplo», «Jugador Uno»…
const sub = (playerId: string): Submission => ({
  id: `s-${playerId}`,
  playerId,
  eventId: 'E1',
  scores: [180],
  scanned: null,
  photoId: null,
  status: 'pendiente',
  note: null,
  createdAt: { toMillis: () => 0 },
});
const feed = (lid: string, pending: Submission[], isAdmin = true): LeagueFeed => ({
  lid,
  uid: 'u1',
  playerId: 'p-uno',
  isAdmin,
  isScorer: false,
  events: [],
  mySubs: [],
  pending,
  reactions: [],
  comments: [],
  suggestions: [],
});
const leagues = [
  { id: 'L1', name: 'Liga de Ejemplo' },
  { id: 'L2', name: 'Otra Liga de Ejemplo' },
];

describe('el aviso de juegos por aprobar en Hoy (Lite)', () => {
  it('sin nada de otros (o sin organizar), nada', () => {
    expect(homePendingNotice([feed('L1', [sub('p-uno')])], leagues)).toBeNull();
    expect(homePendingNotice([feed('L1', [sub('p-dos')], false)], leagues)).toBeNull();
  });

  it('una liga: su nombre y «Ver» a Aprobar; varias: «En 2 ligas»', () => {
    expect(homePendingNotice([feed('L1', [sub('p-dos')])], leagues)).toEqual({
      id: 'pendientes:L1:1',
      kind: 'admin',
      title: '1 envío por aprobar',
      text: 'Liga de Ejemplo',
      action: { label: 'Ver', to: '/l/L1/admin?tab=aprobar' },
    });
    const many = homePendingNotice([feed('L1', [sub('p-dos'), sub('p-tres')]), feed('L2', [sub('p-cuatro')])], leagues);
    expect(many).toMatchObject({ id: 'pendientes:L1:2,L2:1', title: '3 envíos por aprobar', text: 'En 2 ligas' });
  });
});
