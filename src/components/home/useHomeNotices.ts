import { createElement } from 'react';
import { ClipboardCheck } from 'lucide-react';
import type { LeagueFeed } from '../../lib/data';
import type { League } from '../../lib/types';
import { useProSuggestion } from '../mode';
import { useNotice, type Notice } from '../NoticeSlot';

/**
 * El aviso de juegos por aprobar en Hoy (Lite: en Pro eso sale en «Por hacer»). Un solo aviso para todas las ligas que
 * organizas; el id cambia con lo que hay, así vuelve a salir si llegan más después de cerrarlo. null = nada pendiente.
 */
export function pendingNotice(feeds: readonly LeagueFeed[], leagues: readonly Pick<League, 'id' | 'name'>[]): Notice | null {
  // Sus propios envíos no cuentan (los ve igual en Aprobar, marcados «Tú»).
  const withPending = feeds
    .filter((f) => f.isAdmin)
    .map((f) => ({ lid: f.lid, n: f.pending.filter((s) => s.playerId !== f.playerId).length }))
    .filter((x) => x.n > 0);
  if (!withPending.length) return null;
  const total = withPending.reduce((a, x) => a + x.n, 0);
  const first = withPending[0];
  return {
    id: `pendientes:${withPending.map((x) => `${x.lid}:${x.n}`).join(',')}`,
    kind: 'admin',
    title: total === 1 ? '1 envío por aprobar' : `${total} envíos por aprobar`,
    text: withPending.length > 1 ? `En ${withPending.length} ligas` : leagues.find((l) => l.id === first.lid)?.name,
    icon: createElement(ClipboardCheck, { className: 'size-[18px]' }),
    action: { label: 'Ver', to: `/l/${first.lid}/admin?tab=aprobar` },
  };
}

/**
 * Lo que Hoy propone a su NoticeSlot (sale uno solo, el más importante): los juegos por aprobar (Lite) y la sugerencia
 * de Pro a quien organiza una liga y está en Lite. Instalar la app y permitir los avisos los proponen PwaPrompts y
 * PushNotice para toda la app.
 */
export function useHomeNotices({ feeds, leagues, pro }: { feeds: readonly LeagueFeed[]; leagues: readonly League[]; pro: boolean }): void {
  useNotice(!pro && pendingNotice(feeds, leagues));
  useProSuggestion();
}
