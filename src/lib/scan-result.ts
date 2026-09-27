import type { ScanRow } from '../../supabase/functions/_shared/scan-core';
import { bestMatch } from './stats';

/**
 * Filas leídas de la foto del marcador. La lectura la hace la Edge Function scan-bowling con el mismo código que
 * la app: ScanRow, ScanError y parseScanResult vienen de supabase/functions/_shared/scan-core.ts.
 */
export {
  parseScanResult,
  rowsFromScan,
  ScanError,
  type ScanErrorKind,
  type ScanRow,
} from '../../supabase/functions/_shared/scan-core';

/** La fila del jugador en la foto: la que se parece a su nombre o, si hay una sola, esa. */
export function rowFor(name: string, rows: ScanRow[]): ScanRow | null {
  return bestMatch(name, rows) ?? (rows.length === 1 ? rows[0] : null);
}
