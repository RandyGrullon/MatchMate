// iPhone: le pasa al widget de la pantalla de inicio (hoyWidget.tsx) su línea de tiempo (homeWidget.ts).
import type { HoyWidgetSurface } from './surface';
import { HoyWidget } from './hoyWidget';

export const hoyWidgetSurface: HoyWidgetSurface | null = {
  update: (entries) => HoyWidget.updateTimeline(entries.map((e) => ({ date: new Date(e.at), props: e.props }))),
};
