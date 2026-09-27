import { bestMatch, isValidScore } from './stats';

export interface ScanRow {
  /** Nombre tal como aparece en la pantalla. */
  name: string;
  handicap: number | null;
  /**
   * Pinos scratch por juego, respetando la posición de la pantalla (Game 1, Game 2, ...).
   * null = ese juego no se jugó (la pantalla lo muestra en 0 o vacío).
   */
  games: (number | null)[];
  /** Total scratch que muestra la pantalla para el jugador, si aparece. */
  total: number | null;
  /** true si la suma de los juegos cuadra con el total de la pantalla; null si no hay total. */
  matchesTotal: boolean | null;
}

/**
 * Por qué no se pudo leer la foto: `foto` (la foto no sirve), `red` (sin señal o el servidor falló:
 * se reintenta sola), `cupo` (se acabó el cupo gratis por ahora: se reintenta en un minuto) o
 * `config` (la configuración de Firebase: reintentar no sirve).
 */
export type ScanErrorKind = 'foto' | 'red' | 'cupo' | 'config';

export class ScanError extends Error {
  constructor(
    message: string,
    readonly kind: ScanErrorKind = 'foto',
  ) {
    super(message);
  }
}

/** La fila del jugador en la foto: la que se parece a su nombre o, si hay una sola, esa. */
export function rowFor(name: string, rows: ScanRow[]): ScanRow | null {
  return bestMatch(name, rows) ?? (rows.length === 1 ? rows[0] : null);
}

interface RawScan {
  esPantallaDeBoliche?: boolean;
  soloTotales?: boolean;
  jugadores?: { nombre?: string; handicap?: number | null; juegos?: number[]; total?: number | null }[];
}

/** Convierte la respuesta JSON de la IA en filas limpias, o explica por qué la foto no sirve. */
export function parseScanResult(text: string): ScanRow[] {
  let parsed: RawScan;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ScanError('La IA no devolvió un resultado legible. Prueba con otra foto.');
  }
  if (parsed.esPantallaDeBoliche === false) {
    throw new ScanError('La foto no parece una pantalla de resultados de boliche.');
  }

  const players = (parsed.jugadores ?? []).map((j) => {
    // 0 = no jugó (puestos vacíos de la máquina, o entró tarde). Se conserva la posición de cada juego.
    const games = (j.juegos ?? []).map((g) => (isValidScore(g) && g > 0 ? g : null));
    while (games.length && games[games.length - 1] == null) games.pop();
    const total = typeof j.total === 'number' && j.total > 0 ? j.total : null;
    const sum = games.reduce<number>((a, g) => a + (g ?? 0), 0);
    return {
      name: (j.nombre ?? '').trim(),
      handicap: typeof j.handicap === 'number' ? j.handicap : null,
      games,
      total,
      matchesTotal: total == null || !games.length ? null : sum === total,
    };
  });

  const rows = players.filter((r) => r.name && r.games.some((g) => g != null));
  if (rows.length) return rows;

  const totals = players.filter((r) => r.name && r.total);
  if (parsed.soloTotales || totals.length) {
    const sample = totals
      .slice(0, 3)
      .map((r) => `${r.name} ${r.total}`)
      .join(', ');
    throw new ScanError(
      `Esta pantalla solo muestra totales${sample ? ` (${sample})` : ''}, no los juegos uno por uno. ` +
        'Toma la foto de la pantalla de resultados con Game 1, Game 2, Game 3.',
    );
  }
  throw new ScanError('No se pudieron leer puntuaciones en la foto.');
}
