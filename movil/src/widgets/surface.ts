/**
 * Fuera del iPhone no hay widget (Metro usa surface.ios.ts en el iPhone). En Android, expo-widgets 58 no deja abrir la
 * app al tocar un widget (solo le avisa a la app si está abierta): queda para cuando lo permita. En la vista previa web,
 * tampoco.
 */
import type { HomeWidgetEntry } from '@mm/components/home/homeWidget';

/** Le pasa al widget su línea de tiempo. */
export interface HoyWidgetSurface {
  update: (entries: readonly HomeWidgetEntry[]) => void;
}

export const hoyWidgetSurface: HoyWidgetSurface | null = null;
