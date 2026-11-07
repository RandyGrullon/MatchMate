/**
 * Lo de la liga por cajas y la escalera sin pantallas ni íconos (puro): el nombre y el texto de sus plantillas de
 * «Nuevo», su línea en las listas, las tablas de las cajas del mes abierto y el orden de salida de la escalera. Lo usan
 * index.ts de la web y la app del teléfono (movil/), que no puede importar index.ts (trae los formularios de la web).
 */
import type { Match } from '../../../lib/data/matches';
import type { RacketEvent } from '../../../lib/data/racket';
import type { RacketSport } from '../../../sports/racket';
import type { StandingRow } from '../../../sports/types';
import { boxName, boxTables, openMonth, parseBoxConfig } from './logic/box';
import { parseLadderConfig } from './logic/ladder';

/** Una plantilla de «Nuevo» sin su ícono ni su formulario. */
export interface TemplateInfo {
  k: string;
  title: string;
  text: string;
}

export const BOX_TEMPLATE_INFO: TemplateInfo = {
  k: 'cajas',
  title: 'Liga por cajas mensual',
  text: 'Cajas de 4 a 6 por nivel, todos contra todos en el mes; suben 2 y bajan 2. Fechas que acuerdan ellos.',
};

export const LADDER_TEMPLATE_INFO: TemplateInfo = {
  k: 'escalera',
  title: 'Escalera',
  text: 'Retas hasta 3 puestos arriba; si ganas, tomas su puesto. Plazos para aceptar y jugar (si no, W.O.).',
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
    const out: { key: string; name: string; rows: StandingRow[] }[] = [];
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

/**
 * Orden de salida de la escalera (al crearla): por nivel, de mayor a menor; los que no tienen, abajo, en el orden en
 * que se eligieron.
 */
export function ladderStartOrder(picked: readonly string[], levelOf: (id: string) => number | null): string[] {
  return picked
    .map((p, i) => ({ p, i, lv: levelOf(p) }))
    .sort((a, b) => (b.lv ?? -1) - (a.lv ?? -1) || a.i - b.i)
    .map((x) => x.p);
}
