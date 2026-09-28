import type { ReactNode } from 'react';
import { loadTheme, scopedAccentCss, usesBrandAccent } from '../../lib/theme';
import { sportMeta } from '../../sports/registry';

/** La clase que lleva el color de un deporte (`mm-sport-padel`). */
export const sportScopeClass = (sport: string) => `mm-sport-${sport.replace(/[^a-z0-9-]/g, '')}`;

/**
 * El color de un deporte para una parte de la pantalla: la clase y su CSS (vacío si el deporte no tiene color
 * propio, como el boliche, o si la cuenta eligió su propio color en Configuración: ese se respeta en todas partes).
 */
export function sportAccent(sport: string | null | undefined, prefs = loadTheme()): { className: string; css: string } {
  const color = sport ? (sportMeta(sport)?.color ?? null) : null;
  if (!sport || !color || !usesBrandAccent(prefs)) return { className: '', css: '' };
  const className = sportScopeClass(sport);
  const css = scopedAccentCss(`.${className}`, color);
  return css ? { className, css } : { className: '', css: '' };
}

/**
 * Todo lo de adentro toma el color del deporte (pestañas, botones, la portada, la animación de carga y la de la
 * escena): cambia `--accent`, `--accent-fg` y `--accent-soft` solo aquí adentro, en claro y en oscuro.
 */
export function SportTheme({ sport, className, children }: { sport: string | null | undefined; className?: string; children: ReactNode }) {
  const { className: scope, css } = sportAccent(sport);
  return (
    <div className={[scope, className].filter(Boolean).join(' ') || undefined} data-sport={sport ?? undefined}>
      {/* React lo pone una sola vez en el <head> por deporte, aunque haya varias partes con su color. */}
      {css && (
        <style href={scope} precedence="default">
          {css}
        </style>
      )}
      {children}
    </div>
  );
}
