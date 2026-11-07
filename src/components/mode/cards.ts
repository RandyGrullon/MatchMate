import { Leaf, Zap, type LucideIcon } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useLeaguesByIds, useMyMemberships } from '../../lib/data';
import type { UiMode } from '../../lib/mode';

/** La hoja «Elige cómo ver la app» sin pantalla (la dibujan HomeSheets.tsx en la web y la app del teléfono). */

/** Qué trae cada modo (las tarjetas de la hoja). */
export const MODE_CARDS: Record<UiMode, { label: string; tagline: string; items: readonly string[]; icon: LucideIcon }> = {
  lite: { label: 'Lite', tagline: 'Lo esencial', items: ['Anotar rápido', 'Tu promedio', 'Tus ligas y fechas'], icon: Leaf },
  pro: { label: 'Pro', tagline: 'Todo el detalle', items: ['Aprobar juegos', 'Planilla y Excel', 'Estadísticas'], icon: Zap },
};

/** La liga que organizas (dueño o admin) para la línea «Organizas Liga de los martes»: su nombre, «2 ligas» o null. */
export function useOrganizedLabel(): string | null {
  const { user } = useAuth();
  const members = useMyMemberships(user?.uid);
  const ids = members.data.filter((m) => m.role === 'owner' || m.role === 'admin').map((m) => m.leagueId);
  const leagues = useLeaguesByIds(ids.slice(0, 1));
  if (!ids.length) return null;
  if (ids.length > 1) return `${ids.length} ligas`;
  return leagues.data[0]?.name ?? null;
}
