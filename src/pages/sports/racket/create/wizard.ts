/**
 * Lo de «Nuevo» (EventWizard) sin pantallas (puro): el nombre por defecto, las plantillas de siempre con lo que cambia
 * el deporte, y la configuración que se guarda al crear la noche, la liga o el torneo. Lo usan EventWizard.tsx de la web
 * y la app del teléfono (movil/).
 */
import type { RacketExtensions } from '../sport';
import { eventTypeInfo } from '../view';
import { leagueConfigJson, parseLeagueConfig } from '../logic/league';
import { nightConfigJson, type NightConfig } from '../logic/night';
import type { SignupSettings } from '../logic/signup';
import { CATEGORY_IDS, newCategory, tourneyConfigJson, type TourneyConfig } from '../logic/tourney';

export type WizardKind = 'americano' | 'mexicano' | 'liga' | 'torneo';

const weekday = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Intl.DateTimeFormat('es-DO', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
};

/** Nombre por defecto: «Americano del jueves», «Liga de parejas», «Torneo de octubre». */
export function defaultName(kind: WizardKind, date: string, doubles: boolean): string {
  if (kind === 'americano' || kind === 'mexicano') return `${eventTypeInfo(kind).label} del ${weekday(date)}`;
  if (kind === 'liga') return doubles ? 'Liga de parejas' : 'Liga';
  const [y, m] = date.split('-').map(Number);
  const month = y && m ? new Intl.DateTimeFormat('es-DO', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1))) : '';
  return `Torneo de ${month}`;
}

/** Las plantillas de siempre (americano y mexicano solo en dobles), con lo que el deporte esconde o les cambia. */
export function builtInTemplates(doubles: boolean, ext: Pick<RacketExtensions, 'hideTemplates' | 'templateTitles'>): { k: WizardKind; title: string; text: string }[] {
  const all: { k: WizardKind; title: string; text: string }[] = [
    ...(doubles
      ? [
          { k: 'americano' as const, title: 'Americano de la noche', text: 'Las parejas rotan cada ronda y cada quien suma sus puntos. La app arma las rondas.' },
          { k: 'mexicano' as const, title: 'Mexicano', text: 'Cada ronda se arma con la tabla: 1.º y 4.º contra 2.º y 3.º. Recomendado de 8 jugadores en adelante.' },
        ]
      : []),
    { k: 'liga', title: doubles ? 'Liga de parejas' : 'Liga', text: `Todos contra todos por jornadas, de ida o de ida y vuelta, con canchas, horas y tabla.` },
    { k: 'torneo', title: 'Torneo por categorías', text: 'Categorías A, B, C…: grupos por nivel, cruces y cuadro con 3.er lugar.' },
  ];
  const titles = ext.templateTitles?.(doubles) ?? {};
  return all.filter((t) => !ext.hideTemplates?.includes(t.k)).map((t) => ({ ...t, ...titles[t.k] }));
}

/** «Repetir la última noche» sale si hay una noche y el deporte tiene esa plantilla (en dobles). */
export function canRepeatNight(last: { type: string } | null | undefined, doubles: boolean, ext: Pick<RacketExtensions, 'hideTemplates'>): boolean {
  return !!last && doubles && !ext.hideTemplates?.includes(last.type === 'mexicano' ? 'mexicano' : 'americano');
}

/**
 * La configuración que se guarda al crear: la noche (con el nivel de cada jugador y, si se abrió, la inscripción), la
 * liga (sus parejas, ida y vuelta, la primera jornada y la hora) o el torneo (sus categorías; con una sola, sus parejas).
 */
export function wizardConfig(
  kind: WizardKind,
  o: {
    night: NightConfig;
    levels: Readonly<Record<string, number>>;
    signup: SignupSettings | null;
    pairs: readonly string[];
    double: boolean;
    date: string;
    time: string;
    cats: number;
    /** Semilla de la noche (en la web, `noche:<hora en base 36>`). */
    seed: string;
  },
): Record<string, unknown> {
  if (kind === 'americano' || kind === 'mexicano') {
    const lv: Record<string, number> = {};
    for (const p of o.night.players) if (o.levels[p] != null) lv[p] = o.levels[p];
    return nightConfigJson({ ...o.night, format: kind, levels: lv, seed: o.seed, ...(o.signup?.open ? { signup: o.signup } : {}) });
  }
  if (kind === 'liga') return leagueConfigJson(parseLeagueConfig({ pairs: [...o.pairs], double: o.double, startDate: o.date, times: [o.time], everyDays: 7, minutes: 90 }, o.date));
  const t: TourneyConfig = {
    v: 1,
    format: 'torneo',
    categories: CATEGORY_IDS.slice(0, o.cats).map((id) => ({ ...newCategory(id), pairs: o.cats === 1 ? [...o.pairs] : [] })),
    courts: [],
    points: 'standard',
    ...(o.signup?.open ? { signup: o.signup } : {}),
  };
  return tourneyConfigJson(t);
}
