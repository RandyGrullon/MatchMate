/**
 * Plantillas del creador de insignias (docs/insignias.md §5.5): 11 diseños listos para empezar. El nivel (metal) y
 * el cupo de cada una son los de la tabla; la liga puede cambiar el nombre («Campeona») y todo lo demás antes de
 * guardar. Las sugerencias de a quién dársela salen de suggest.ts: «La app sugiere; la liga decide».
 */
import type { BadgeIconKey, BadgeShape, BadgeTier } from '../../../badges/visual';
import type { LimitKind } from '../../../lib/data/leagueBadges';
import { SPORT_FAMILY, type SportId } from '../../../sports/types';

export type TemplateKey =
  | 'champion'
  | 'runner_up'
  | 'third_place'
  | 'mvp'
  | 'best_average'
  | 'most_improved'
  | 'fair_play'
  | 'perfect_attendance'
  | 'rookie_of_the_year'
  | 'player_of_the_month'
  | 'helping_hand_league';

/** De qué periodo es: la temporada o el mes (en torneos, el mes del torneo con «TORNEO» arriba). */
export type TemplatePeriod = 'temporada' | 'mes';

export interface BadgeTemplate {
  key: TemplateKey;
  shape: BadgeShape;
  icon: BadgeIconKey;
  metal: BadgeTier;
  limitKind: LimitKind;
  period: TemplatePeriod;
  /** Se ofrece en los torneos sueltos (`kind='torneo'`). */
  tournament: boolean;
  /** En los deportes de equipo se da al equipo completo (el cupo cuenta equipos). */
  teamPodium: boolean;
}

export const TEMPLATES: readonly BadgeTemplate[] = [
  { key: 'champion', shape: 'shield', icon: 'trophy', metal: 'oro', limitKind: 'unica', period: 'temporada', tournament: true, teamPodium: true },
  { key: 'runner_up', shape: 'shield', icon: 'medal', metal: 'plata', limitKind: 'unica', period: 'temporada', tournament: true, teamPodium: true },
  { key: 'third_place', shape: 'shield', icon: 'award', metal: 'bronce', limitKind: 'selecta', period: 'temporada', tournament: true, teamPodium: true },
  { key: 'mvp', shape: 'star', icon: 'crown', metal: 'oro', limitKind: 'unica', period: 'temporada', tournament: true, teamPodium: false },
  { key: 'best_average', shape: 'star', icon: 'target', metal: 'platino', limitKind: 'unica', period: 'temporada', tournament: false, teamPodium: false },
  { key: 'most_improved', shape: 'hex', icon: 'trending-up', metal: 'oro', limitKind: 'unica', period: 'temporada', tournament: false, teamPodium: false },
  { key: 'fair_play', shape: 'square', icon: 'handshake', metal: 'platino', limitKind: 'selecta', period: 'temporada', tournament: true, teamPodium: false },
  { key: 'perfect_attendance', shape: 'circle', icon: 'calendar-check', metal: 'oro', limitKind: 'abierta', period: 'temporada', tournament: false, teamPodium: false },
  { key: 'rookie_of_the_year', shape: 'hex', icon: 'sprout', metal: 'oro', limitKind: 'unica', period: 'temporada', tournament: false, teamPodium: false },
  { key: 'player_of_the_month', shape: 'medal', icon: 'flame', metal: 'plata', limitKind: 'unica', period: 'mes', tournament: false, teamPodium: false },
  { key: 'helping_hand_league', shape: 'square', icon: 'hand-heart', metal: 'bronce', limitKind: 'abierta', period: 'temporada', tournament: false, teamPodium: false },
];

export const TEMPLATE_KEYS: readonly TemplateKey[] = TEMPLATES.map((t) => t.key);
export const isTemplateKey = (v: unknown): v is TemplateKey => typeof v === 'string' && (TEMPLATE_KEYS as readonly string[]).includes(v);
export const templateOf = (key: string | null | undefined): BadgeTemplate | null => TEMPLATES.find((t) => t.key === key) ?? null;

type Sport = SportId | string | null | undefined;
const family = (sport: Sport) => (sport && Object.hasOwn(SPORT_FAMILY, sport) ? SPORT_FAMILY[sport as SportId] : null);

/** «Mejor promedio» según el deporte (§5.5). */
function bestName(sport: Sport): string {
  switch (sport) {
    case 'golf':
      return 'Mejor promedio neto';
    case 'basketball':
    case 'swimming':
      return 'Más puntos';
    case 'football':
    case 'futsal':
      return 'Más goles';
    case 'padel':
    case 'tennis':
    case 'pickleball':
      return 'Mejor récord';
    default:
      return 'Mejor promedio';
  }
}

function bestText(sport: Sport): string {
  switch (sport) {
    case 'golf':
      return 'Nadie tuvo mejor promedio neto que tú esta temporada.';
    case 'basketball':
      return 'Nadie anotó más puntos por partido que tú esta temporada.';
    case 'swimming':
      return 'Nadie sumó más puntos que tú esta temporada.';
    case 'football':
    case 'futsal':
      return 'Nadie metió más goles que tú esta temporada.';
    case 'padel':
    case 'tennis':
    case 'pickleball':
      return 'Nadie tuvo mejor récord que tú esta temporada.';
    default:
      return 'Nadie tuvo mejor promedio que tú esta temporada.';
  }
}

/** Nombre de la plantilla (≤ 28 letras) en ese deporte. */
export function templateName(key: TemplateKey, sport: Sport, tournament = false): string {
  switch (key) {
    case 'champion':
      return 'Campeón';
    case 'runner_up':
      return 'Subcampeón';
    case 'third_place':
      return 'Tercer lugar';
    case 'mvp':
      return tournament ? 'MVP del torneo' : 'MVP de la temporada';
    case 'best_average':
      return bestName(sport);
    case 'most_improved':
      return 'Gran progreso';
    case 'fair_play':
      return 'Juego limpio';
    case 'perfect_attendance':
      return 'Asistencia perfecta';
    case 'rookie_of_the_year':
      return 'Revelación del año';
    case 'player_of_the_month':
      return 'Estrella del mes';
    case 'helping_hand_league':
      return 'Mano amiga';
  }
}

/** Lo que lee el jugador (≤ 140). En un torneo suelto dice «el torneo» donde dice «la temporada». */
export function templateDescription(key: TemplateKey, sport: Sport, tournament = false): string {
  const text = ((): string => {
    switch (key) {
      case 'champion':
        return 'Terminaste de primero en la temporada. ¡El título es tuyo!';
      case 'runner_up':
        return 'Segundo en la temporada. ¡Ahí mismito!';
      case 'third_place':
        return 'Te subiste al podio: tercero en la temporada.';
      case 'mvp':
        return 'Lo más valioso de la temporada, según tu liga.';
      case 'best_average':
        return bestText(sport);
      case 'most_improved':
        return 'Nadie subió tanto su nivel como tú esta temporada. ¡Se nota el trabajo!';
      case 'fair_play':
        return 'Respeto, buena vibra y cero lío. Así se juega.';
      case 'perfect_attendance':
        return 'No faltaste ni una vez en toda la temporada.';
      case 'rookie_of_the_year':
        return 'Tu primera temporada y ya dejaste tu marca.';
      case 'player_of_the_month':
        return 'Lo mejor del mes en tu liga.';
      case 'helping_hand_league':
        return 'Gracias por ayudar a que la liga funcione.';
    }
  })();
  return tournament ? text.replace('en la temporada', 'en el torneo').replace('de la temporada', 'del torneo') : text;
}

/** Las plantillas que se ofrecen: en un torneo suelto, solo podio, MVP y juego limpio (§5.5). */
export function templatesFor(kind: string | null | undefined): BadgeTemplate[] {
  return kind === 'torneo' ? TEMPLATES.filter((t) => t.tournament) : [...TEMPLATES];
}

/** ¿Se puede dar al equipo o a la pareja completa? Solo en raqueta y equipos (lo revisa la base igual). */
export const byTeamAllowed = (sport: Sport): boolean => {
  const f = family(sport);
  return f === 'racket' || f === 'team';
};

/** El podio de una liga de equipos se da al equipo completo; en raqueta la liga elige (individual o pareja). */
export const templateByTeam = (t: BadgeTemplate, sport: Sport): boolean => t.teamPodium && family(sport) === 'team';
