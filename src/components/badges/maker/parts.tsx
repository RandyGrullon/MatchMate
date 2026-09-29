import type { CSSProperties, ReactNode } from 'react';
import { Insignia, SHAPES, badgeLabel, badgeThemeVars, nodesToElements, svgToReact, type BadgeLook, type BadgeShape, type BadgeSize } from '../../../badges/visual';
import { cx } from '../../ui';

/**
 * Piezas chicas del creador de insignias: el ícono tal cual, el contorno de una forma, los chips, el contador de
 * letras, el aviso de un campo y la vista previa en claro y en oscuro.
 */

/** Un ícono de la grilla de 24 (trazo del color del texto), para los botones del selector. */
export function IconGlyph({ icon, className }: { icon: string; className?: string }) {
  const els = nodesToElements([{ t: 'icon', key: icon, x: 0, y: 0, k: 1, color: 'currentColor', width: 2 }], 'light');
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      {els.map((el, i) => svgToReact(el, i))}
    </svg>
  );
}

/** El contorno de una forma (los chips de «Forma»). */
export function ShapeOutline({ shape, className }: { shape: BadgeShape; className?: string }) {
  return (
    <svg viewBox="-4 -4 136 136" className={className} aria-hidden="true" focusable="false">
      <path d={SHAPES[shape].outer} fill="none" stroke="currentColor" strokeWidth={10} strokeLinejoin="round" />
    </svg>
  );
}

/** Un chip que se prende (44 px de alto para el dedo). */
export function Chip({
  on,
  onClick,
  children,
  disabled,
  label,
  className,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      disabled={disabled}
      className={cx(
        'inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
        on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-fg hover:bg-surface-2',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Un puntito de color (las opciones de «Color»). */
export const Dot = ({ color }: { color: string }) => (
  <span className="inline-block size-3.5 shrink-0 rounded-full border border-black/10" style={{ background: color }} aria-hidden="true" />
);

/** «12/28» al lado de la etiqueta; en rojo si se pasa. */
export function Counter({ value, max }: { value: number; max: number }) {
  return <span className={cx('text-xs font-normal tabular-nums', value > max ? 'text-danger' : 'text-muted')}>{`${value}/${max}`}</span>;
}

/** El aviso de un campo (lo lee el lector de pantalla al aparecer). */
export function FieldError({ id, text }: { id: string; text?: string | null }) {
  return text ? (
    <p id={id} role="alert" className="text-xs font-medium text-danger">
      {text}
    </p>
  ) : null;
}

/** Un campo con su etiqueta, el contador y la ayuda. */
export function FieldBox({ label, htmlFor, count, hint, error, errorId, children }: {
  label: ReactNode;
  htmlFor?: string;
  count?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  errorId: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-xs font-medium text-muted">
            {label}
          </label>
        ) : (
          <span className="text-xs font-medium text-muted">{label}</span>
        )}
        {count}
      </div>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
      <FieldError id={errorId} text={error} />
    </div>
  );
}

/**
 * La vista previa del editor (§5.4): la insignia a 128 px sobre una tarjeta clara y una oscura lado a lado (siempre en
 * esos temas, sin importar el de la pantalla), y abajo la fila a 24, 40 y 64 px. No es una región viva: cambia con cada
 * letra que se escribe y el lector de pantalla la repetiría sin parar.
 */
export function PreviewPair({ look, name, sub }: { look: BadgeLook; name: string; sub: string }) {
  const sizes: BadgeSize[] = [24, 40, 64];
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {(['light', 'dark'] as const).map((mode) => (
          <figure
            key={mode}
            className="m-0 flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border border-line px-1.5 pt-2 pb-2.5 text-center"
            style={badgeThemeVars(mode) as CSSProperties}
          >
            <span className="self-start px-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{mode === 'light' ? 'Claro' : 'Oscuro'}</span>
            <Insignia badge={look} size={128} label={`${badgeLabel(name, look)}, vista previa en modo ${mode === 'light' ? 'claro' : 'oscuro'}`} />
            <figcaption className="w-full min-w-0">
              <b className="block truncate text-sm">{name}</b>
              <span className="block truncate text-xs text-muted">{sub}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="flex items-end justify-center gap-5" aria-label="Tamaños">
        {sizes.map((s) => (
          <figure key={s} className="m-0 flex flex-col items-center gap-1">
            <Insignia badge={look} size={s} />
            <figcaption className="text-[11px] text-muted tabular-nums">{s} px</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

/** Interruptor con su texto (44 px de alto). */
export function Toggle({ on, onChange, label, hint, disabled, id }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: ReactNode; disabled?: boolean; id: string }) {
  return (
    <label htmlFor={id} className={cx('flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-line p-3', disabled && 'cursor-not-allowed opacity-60')}>
      <input id={id} type="checkbox" role="switch" className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0 flex-1 text-sm">
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}
