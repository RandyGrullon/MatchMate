/**
 * Liga por cajas y escalera como extensiones de las pantallas de raqueta (src/pages/sports/racket): plantillas de
 * «Nuevo», su página de evento, su línea en las listas y las tablas de las cajas en «Tabla». Sirven para tenis,
 * pickleball, pádel y ping pong:
 *   racketScreens('tennis', withFormats('tennis', { ...lo del deporte }))
 */
import { Boxes, ChevronsUp } from 'lucide-react';
import type { Match } from '../../../lib/data/matches';
import type { RacketEvent } from '../../../lib/data/racket';
import type { RacketSport } from '../../../sports/racket';
import type { RacketExtensions, WizardTemplate } from '../racket/sport';
import { BoxForm } from './BoxForm';
import { BoxPage } from './BoxPage';
import { LadderForm } from './LadderForm';
import { LadderPage } from './LadderPage';
import { boxName, boxTables, openMonth, parseBoxConfig } from './logic/box';
import { parseLadderConfig } from './logic/ladder';

export const BOX_TEMPLATE: WizardTemplate = {
  k: 'cajas',
  title: 'Liga por cajas mensual',
  text: 'Cajas de 4 a 6 por nivel, todos contra todos en el mes; suben 2 y bajan 2. Fechas que acuerdan ellos.',
  icon: Boxes,
  Form: BoxForm,
};

export const LADDER_TEMPLATE: WizardTemplate = {
  k: 'escalera',
  title: 'Escalera',
  text: 'Retas hasta 3 puestos arriba; si ganas, tomas su puesto. Plazos para aceptar y jugar (si no, W.O.).',
  icon: ChevronsUp,
  Form: LadderForm,
};

/** Línea de la lista: «8 jugadores · Octubre 2026 · 3 cajas», «12 parejas · se reta hasta 3 arriba». */
export function formatsEventInfo(e: RacketEvent): { label?: string; line?: string } | null {
  if (e.type === 'cajas') {
    const c = parseBoxConfig(e.config);
    const m = c.months.at(-1);
    const who = `${c.entrants.length} ${c.doubles ? 'parejas' : 'jugadores'}`;
    return { label: 'Liga por cajas', line: m ? `${who} · ${m.label || `mes ${m.n}`} · ${m.boxes.length} ${m.boxes.length === 1 ? 'caja' : 'cajas'}` : who };
  }
  if (e.type === 'escalera') {
    const c = parseLadderConfig(e.config);
    return { label: 'Escalera', line: `${e.playerCount} ${c.doubles ? 'parejas' : 'jugadores'} · se reta hasta ${c.maxUp} arriba` };
  }
  return null;
}

/** Tablas de las cajas del mes abierto (van en «Tabla» con las de ligas y torneos). */
export function formatsCompetitions(sport: RacketSport) {
  return (events: readonly RacketEvent[], matches: readonly Match[], now: number) => {
    const out: { key: string; name: string; rows: ReturnType<typeof boxTables>[number] }[] = [];
    for (const e of events) {
      if (e.type !== 'cajas') continue;
      const cfg = parseBoxConfig(e.config);
      const month = openMonth(cfg);
      if (!month) continue;
      const list = matches.filter((m) => m.eventId === e.id);
      if (!list.length) continue;
      boxTables(sport, month, list, { scheme: cfg.points, now, lotSeed: e.id }).forEach((rows, b) =>
        out.push({ key: `${e.id}:${month.n}:${b}`, name: `${e.name || 'Cajas'} · ${boxName(b)}`, rows }),
      );
    }
    return out;
  };
}

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
