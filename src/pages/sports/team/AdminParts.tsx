import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { Check, type LucideIcon } from 'lucide-react';
import { BusyIcon } from '../../../components/busy';
import { Card, ListRow, RowIcon, SectionHeader, Segmented, cx } from '../../../components/ui';

/**
 * Piezas de Organizar › Equipos de los deportes de equipo (rediseño «Calma y foco»): el segmentado de arriba (Equipos ·
 * Partidos · Reglas · Comité, en la dirección `?parte=` para que no se pierda al volver de un partido), las acciones como
 * filas con su ícono, las plantillas de reglas como filas para elegir (✓ la que se usa) y los sí/no como filas.
 */

/** La parte de Organizar › Equipos que se ve (`?parte=`); la primera si no dice o no existe. */
export function useAdminPart<K extends string>(keys: readonly K[]): [K, (k: K) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('parte') as K | null;
  const part = raw && keys.includes(raw) ? raw : keys[0];
  const set = (k: K) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set('parte', k);
        return next;
      },
      { replace: true },
    );
  return [part, set];
}

/** El segmentado de arriba de Organizar › Equipos. */
export function AdminSegmented<K extends string>({ options, value, onChange }: { options: readonly { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  return (
    <Segmented
      full
      label="Qué organizar"
      // Con 4 opciones en un teléfono de 360 px, las letras un poco más chicas para que quepan.
      className={options.length > 3 ? '[&>button]:px-1 [&>button]:text-sm' : undefined}
      options={options}
      value={value}
      onChange={onChange}
    />
  );
}

/** Una acción de Organizar como fila: ícono, qué hace y una línea. */
export interface AdminAction {
  key: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
}

/** Las acciones como filas en una tarjeta (la primera en el color del deporte). */
export function AdminActions({ actions, hint }: { actions: readonly AdminAction[]; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <Card className="overflow-hidden">
        {actions.map((a, i) => (
          <ListRow
            key={a.key}
            className={cx(a.disabled && 'pointer-events-none opacity-50')}
            leading={
              <RowIcon tone={i === 0 ? 'accent' : 'neutral'}>
                <a.icon className="size-5" />
              </RowIcon>
            }
            title={a.title}
            subtitle={a.subtitle}
            onClick={a.disabled ? undefined : a.onClick}
          />
        ))}
      </Card>
      {hint && <p className="mx-1 text-meta text-muted">{hint}</p>}
    </div>
  );
}

/** Una plantilla de reglas («Liga FIBA», «Fútbol 7»…). */
export interface TemplateOption<K extends string> {
  id: K;
  name: string;
  description: string;
}

/**
 * Las plantillas como filas para elegir: la que se usa con ✓ en el color del deporte; tocar otra la usa (después de
 * preguntar). Mientras se guarda, la ruedita en su fila.
 */
export function TemplateRows<K extends string>({
  templates,
  active,
  busy,
  disabled,
  onPick,
  footer,
}: {
  templates: readonly TemplateOption<K>[];
  active: K | null | undefined;
  busy: (id: K) => boolean;
  disabled?: boolean;
  onPick: (id: K) => void;
  footer?: ReactNode;
}) {
  return (
    <section aria-labelledby="reglas-plantillas">
      <SectionHeader id="reglas-plantillas" title="Plantillas" />
      <Card className="overflow-hidden">
        {templates.map((t) => {
          const on = active === t.id;
          return (
            <ListRow
              key={t.id}
              me={on}
              title={
                on ? (
                  <>
                    {t.name}
                    <span className="ml-1.5 text-sm font-semibold text-accent">· En uso</span>
                  </>
                ) : (
                  t.name
                )
              }
              subtitle={t.description}
              onClick={on || disabled ? undefined : () => onPick(t.id)}
              ariaLabel={on ? `${t.name} (en uso)` : `Usar ${t.name}`}
              trailing={
                <span
                  aria-hidden="true"
                  className={cx('grid size-6 place-items-center rounded-full', on ? 'bg-accent text-accent-fg' : 'shadow-[inset_0_0_0_1.5px_var(--faint)]')}
                >
                  <BusyIcon busy={busy(t.id)} icon={on ? <Check className="size-4" strokeWidth={2.6} /> : null} className="size-4" />
                </span>
              }
            />
          );
        })}
      </Card>
      {footer && <p className="mx-1 mt-2.5 text-meta text-muted">{footer}</p>}
    </section>
  );
}

/** Un sí/no como fila (en una tarjeta de ajustes): el texto y la casilla del color del deporte, 48 px de alto. */
export function ToggleRow({ checked, onChange, disabled, children }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; children: ReactNode }) {
  return (
    <label className={cx('flex min-h-12 cursor-pointer items-center gap-3 py-2 text-[15px]', disabled && 'cursor-default opacity-50')}>
      <span className="min-w-0 flex-1">{children}</span>
      <input type="checkbox" className="size-5 shrink-0 accent-[var(--accent)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** Una tarjeta de ajustes con su título de sección (El partido, La tabla, Disciplina…). */
export function SettingsCard({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <SectionHeader id={id} title={title} />
      <Card className="flex flex-col gap-3 px-[18px] py-4">{children}</Card>
    </section>
  );
}
