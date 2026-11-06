import { BALL_CATALOG, catalogBall } from '../../lib/ballCatalog';
import { catalogLine, catalogSpecs } from '../../lib/balls';

/*
 * Buscar bolas en el catálogo, sin la pantalla: lo usan BallCatalog.tsx de la web (que lo reexporta) y el de la app del
 * teléfono (movil/src/components/balls/BallCatalog.tsx).
 */

/** Cuántas salen en la hoja de la bola (ahí se busca una sola) y en «Buscar bolas» (ahí se mira). */
export const CATALOG_PICK_LIMIT = 8;
export const CATALOG_BROWSE_LIMIT = 40;

/** Gris de una bola del catálogo que no dice sus colores. */
export const CATALOG_NO_COLOR = '#6b7280';

/** ¿Hay catálogo? (sin modelos no sale el buscador). */
export const hasBallCatalog = () => BALL_CATALOG.length > 0;

/**
 * El modelo elegido en la hoja de una bola: cuál es (el del catálogo, o la marca y el nombre escritos si la clave ya no
 * está), su nombre y lo que dice el catálogo de él (o null).
 */
export function pickedCatalog(value: string | null, brand: string, name: string) {
  const linked = catalogBall(value);
  return {
    linked,
    title: linked ? `${linked.brand} ${linked.name}` : [brand, name].filter(Boolean).join(' '),
    specs: linked ? (catalogSpecs(linked) ?? catalogLine(linked)) : null,
  };
}
