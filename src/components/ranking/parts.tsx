import { ChevronDown } from 'lucide-react';
import { initials } from '../Avatar';
import { cx } from '../ui';

/**
 * Piezas chicas de la Tabla (rediseño «Calma y foco»): la píldora con menú («Promedio ▾», «Temporada 2026 ▾»), la
 * etiqueta «Tú» y el círculo con las iniciales. «‹ Liga de los martes» arriba es LeagueBackBar (league/home).
 */

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** Píldora gris de 36 px que se toca en 44 (el ::after la agranda): «Promedio ▾», «Excel». */
export const pillClass = cx(
  "relative inline-flex h-9 min-w-0 items-center gap-1.5 rounded-full bg-surface-2 px-[13px] text-sm font-semibold whitespace-nowrap text-fg transition active:scale-[0.97] after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
  focusRing,
);

export interface PillOption<K extends string> {
  key: K;
  /** Lo que se ve en la píldora. */
  label: string;
  /** En el menú, si es distinto («Temporada 2025 (en curso)»). */
  option?: string;
}

/**
 * Píldora con menú: se ve «Promedio ▾» y al tocarla abre el menú del teléfono (un <select> invisible encima, que
 * también la hace usable con el teclado y el lector de pantalla). Con una sola opción no hay nada que elegir: se ve el
 * nombre, sin flecha.
 */
export function PillSelect<K extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: readonly PillOption<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Qué se elige (lector de pantalla): «Ordenar la tabla por». */
  label: string;
  className?: string;
}) {
  const current = options.find((o) => o.key === value) ?? options[0];
  if (!current) return null;
  if (options.length < 2) {
    return <span className={cx('inline-flex h-9 min-w-0 items-center rounded-full bg-surface-2 px-[13px] text-sm font-semibold text-fg', className)}>{current.label}</span>;
  }
  return (
    <label
      className={cx(
        'relative inline-flex h-9 min-w-0 cursor-pointer items-center gap-1.5 rounded-full bg-surface-2 pr-3 pl-[13px] text-sm font-semibold text-fg transition active:scale-[0.97]',
        'has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-accent',
        className,
      )}
    >
      <span aria-hidden="true" className="truncate">
        {current.label}
      </span>
      <ChevronDown aria-hidden="true" strokeWidth={2.25} className="size-4 shrink-0" />
      <select
        aria-label={label}
        value={current.key}
        onChange={(e) => onChange(e.target.value as K)}
        className="absolute inset-x-0 -inset-y-1 cursor-pointer appearance-none opacity-0"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.option ?? o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * La etiqueta «Tú» de tu fila: blanca sobre el fondo de acento en claro y de acento translúcido en oscuro (como el
 * mockup). `small`: la de la tabla de Pro.
 */
const TU_CSS =
  '.mm-tu{background:var(--surface)}' +
  '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .mm-tu{background:color-mix(in srgb,var(--accent) 18%,transparent)}}' +
  ':root[data-theme="dark"] .mm-tu{background:color-mix(in srgb,var(--accent) 18%,transparent)}';

export function TuTag({ small }: { small?: boolean }) {
  return (
    <>
      <style href="mm-tabla-tu" precedence="default">
        {TU_CSS}
      </style>
      <span className={cx('mm-tu inline-flex shrink-0 items-center rounded-full font-[650] text-accent', small ? 'h-[18px] px-1.5 text-[11px]' : 'h-[22px] px-2 text-xs')}>
        Tú
      </span>
    </>
  );
}

/** Círculo de 40 px con las iniciales: gris; el tuyo, del color del deporte. */
export function Initials({ name, me }: { name: string; me?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx('grid size-10 shrink-0 place-items-center rounded-full text-sm font-[650]', me ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-2')}
    >
      {initials(name)}
    </span>
  );
}

/** El puesto al principio de la fila (sin medallas: la tabla es tranquila). */
export function PosNum({ pos }: { pos: number }) {
  return <span className="w-[18px] shrink-0 text-center text-[15px] font-semibold text-muted tabular-nums">{pos}</span>;
}
