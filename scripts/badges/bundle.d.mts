// Tipos de bundle.mjs (lo importa src/badges/bundle.test.ts).

export declare const ROOT: string;
export declare const ENTRY: string;
export declare const OUT_JS: string;
export declare const OUT_DTS: string;
export declare const EXPORTS: string[];
export declare const DTS: string;

export interface BuiltEngine {
  /** El archivo completo: cabecera + código. */
  js: string;
  dts: string;
  sourceHash: string;
  /** Archivos del grafo. */
  modules: number;
}

export declare function sourceHash(files: Iterable<{ path: string; text: string }>): string;
export declare function headerHashes(text: string): { source: string | null; output: string | null };
export declare function bodyOf(text: string): string;
export declare function buildEngine(): Promise<BuiltEngine>;
/** null si está al día; si no, qué pasa. `current` = el texto del archivo (por defecto, el del repo). */
export declare function staleness(fresh: BuiltEngine, current?: string | null): string | null;
