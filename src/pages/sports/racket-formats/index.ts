/**
 * Liga por cajas y escalera como extensiones de las pantallas de raqueta (src/pages/sports/racket): plantillas de
 * «Nuevo», su página de evento, su línea en las listas y las tablas de las cajas en «Tabla». Sirven para tenis,
 * pickleball, pádel y ping pong:
 *   racketScreens('tennis', withFormats('tennis', { ...lo del deporte }))
 * Lo que no trae pantallas (los textos de las plantillas, la línea de la lista, las tablas de las cajas) está en
 * info.ts (lo usa también la app del teléfono).
 */
import { Boxes, ChevronsUp } from 'lucide-react';
import type { RacketSport } from '../../../sports/racket';
import type { RacketExtensions, WizardTemplate } from '../racket/sport';
import { BoxForm } from './BoxForm';
import { BoxPage } from './BoxPage';
import { BOX_TEMPLATE_INFO, LADDER_TEMPLATE_INFO, formatsCompetitions, formatsEventInfo } from './info';
import { LadderForm } from './LadderForm';
import { LadderPage } from './LadderPage';

export { formatsCompetitions, formatsEventInfo };

export const BOX_TEMPLATE: WizardTemplate = { ...BOX_TEMPLATE_INFO, icon: Boxes, Form: BoxForm };

export const LADDER_TEMPLATE: WizardTemplate = { ...LADDER_TEMPLATE_INFO, icon: ChevronsUp, Form: LadderForm };

/** Suma la liga por cajas y la escalera a las extensiones del deporte. */
export function withFormats(sport: RacketSport, ext: RacketExtensions = {}): RacketExtensions {
  return {
    ...ext,
    templates: [...(ext.templates ?? []), BOX_TEMPLATE, LADDER_TEMPLATE],
    eventPage: (e) => ext.eventPage?.(e) ?? (e.type === 'cajas' ? BoxPage : e.type === 'escalera' ? LadderPage : null),
    eventInfo: (e, side) => ext.eventInfo?.(e, side) ?? formatsEventInfo(e),
    competitions: (events, matches, now) => [...(ext.competitions?.(events, matches, now) ?? []), ...formatsCompetitions(sport)(events, matches, now)],
  };
}
