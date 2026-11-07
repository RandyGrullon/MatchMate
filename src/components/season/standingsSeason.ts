import type { Season } from '../../lib/seasons';
import { parseSnapshot } from './logic';

/**
 * Lo que no es pantalla de la temporada en las tablas (SeasonView.tsx y SeasonSelect.tsx de la web, y las tablas de la
 * app del teléfono): si una temporada cerrada tiene tabla guardada que mostrar. El orden de los premios está en
 * awardOrder.ts.
 */

/** La temporada cerrada tiene una tabla guardada que mostrar. */
export const hasSavedTable = (s: Pick<Season, 'status' | 'standings'> | null | undefined): boolean => !!s && s.status === 'closed' && parseSnapshot(s.standings) != null;
