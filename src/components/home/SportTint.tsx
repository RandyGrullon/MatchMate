import type { ReactNode } from 'react';
import { loadTheme, scopedVarsCss, usesBrandAccent, type ThemePrefs } from '../../lib/theme';
import { isSportId, sportMeta } from '../../sports/registry';

/** Clase con el color de un deporte para una pieza chica (`mm-tint-padel`). */
export const sportTintClass = (sport: string) => `mm-tint-${sport.replace(/[^a-z0-9-]/g, '')}`;

/**
 * El color de un deporte para una pieza de la pantalla (el cuadro del deporte en el selector, la tarjeta de una liga,
 * la portada del Home del deporte), aunque la app esté en el color de otro deporte. El boliche lleva el morado de
 * siempre. Si la cuenta eligió su propio color en Configuración, se respeta (sin clase).
 */
export function sportTint(sport: string | null | undefined, prefs: Pick<ThemePrefs, 'accent'> = loadTheme()): { className: string; css: string } {
  if (!sport || !isSportId(sport) || !usesBrandAccent(prefs)) return { className: '', css: '' };
  const className = sportTintClass(sport);
  const css = scopedVarsCss(`.${className}`, sportMeta(sport)?.color ?? null);
  return css ? { className, css } : { className: '', css: '' };
}

/** Todo lo de adentro toma el color del deporte (--accent, --accent-fg y --accent-soft), en claro y en oscuro. */
export function SportTint({ sport, className, children }: { sport: string | null | undefined; className?: string; children: ReactNode }) {
  const { className: scope, css } = sportTint(sport);
  return (
    <div className={[scope, className].filter(Boolean).join(' ') || undefined}>
      {/* React lo pone una sola vez en el <head> por deporte. */}
      {css && (
        <style href={scope} precedence="default">
          {css}
        </style>
      )}
      {children}
    </div>
  );
}
