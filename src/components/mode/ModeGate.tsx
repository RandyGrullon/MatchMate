import type { ReactNode } from 'react';
import { useIsPro } from '../../lib/useMode';

/**
 * Lo que solo se ve en Pro (aprobar juegos, la planilla, la tabla completa, estadísticas a fondo, Excel). En Lite no se
 * dibuja (o se dibuja `fallback`, p. ej. una fila «Ver en Pro»). Solo oculta: los permisos siguen siendo los de la
 * liga, así que dentro va lo mismo que antes, con sus propias revisiones de dueño o admin.
 */
export function ProOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return <>{useIsPro() ? children : fallback}</>;
}

/** Lo que solo se ve en Lite (la versión corta de algo que Pro muestra completo). */
export function LiteOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return <>{useIsPro() ? fallback : children}</>;
}
