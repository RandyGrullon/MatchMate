import { createElement } from 'react';
import { ClipboardCheck } from 'lucide-react';
import type { LeagueFeed } from '../../lib/data';
import type { League } from '../../lib/types';
import { useProSuggestion } from '../mode';
import { useNotice, type Notice } from '../NoticeSlot';
import { homePendingNotice } from './homeNotices';

/**
 * El aviso de juegos por aprobar en Hoy (Lite: en Pro eso sale en «Por hacer»). Un solo aviso para todas las ligas que
 * organizas; el id cambia con lo que hay, así vuelve a salir si llegan más después de cerrarlo. null = nada pendiente.
 */
export function pendingNotice(feeds: readonly LeagueFeed[], leagues: readonly Pick<League, 'id' | 'name'>[]): Notice | null {
  // Lo que dice (y la app del teléfono) está en homeNotices.ts; aquí se le pone el ícono.
  const n = homePendingNotice(feeds, leagues);
  return n && { ...n, icon: createElement(ClipboardCheck, { className: 'size-[18px]' }) };
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
