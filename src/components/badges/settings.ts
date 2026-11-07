/**
 * «Insignias automáticas» de la liga sin pantalla (docs/insignias.md §6.5): las tres opciones y el modo de la liga.
 * Salió de BadgesSettings.tsx para que la app del teléfono haga lo mismo. Con pruebas en settings.test.ts.
 */
import type { BadgesAutoMode } from '../../lib/data/badges';

/** Las tres opciones de «Insignias automáticas» (§6.5). */
export const BADGES_AUTO_OPTIONS: readonly { mode: BadgesAutoMode; label: string; hint: string }[] = [
  { mode: 'todas', label: 'Todas', hint: 'Resultados, marcas, hitos, constancia y los premios del mes y de la temporada.' },
  {
    mode: 'sin_titulos',
    label: 'Sin títulos',
    hint: 'Sin las que comparan a unos con otros (figura, podios, títulos). Recomendado para ligas con menores.',
  },
  { mode: 'ninguna', label: 'Ninguna', hint: 'La liga no da insignias automáticas. Las de cada cuenta (constancia, kilometraje) siguen.' },
];

/** El modo de la liga (sin dato: con menores, «Sin títulos»; si no, «Todas»). */
export const badgesAutoOf = (league: { badgesAuto?: BadgesAutoMode; hasMinors?: boolean }): BadgesAutoMode =>
  league.badgesAuto ?? (league.hasMinors ? 'sin_titulos' : 'todas');

/** Debajo del título: quién lo cambia. */
export const badgesAutoIntro = (isOwner: boolean): string => `MatchMate las da solo con los resultados de la liga. ${isOwner ? 'Tú decides cuáles.' : 'Solo el dueño lo cambia.'}`;

/**
 * Lo que se ve marcado: lo elegido al momento (mientras se guarda) y, cuando la liga llega de nuevo con otro valor,
 * lo que dice la base.
 */
export const pickedOr = <T>(picked: { from: T; to: T } | null, saved: T): T => (picked && picked.from === saved ? picked.to : saved);
