import type { ReactNode } from 'react';
import { Check, Megaphone } from 'lucide-react';
import { SQUAD_CITY_MAX, SQUAD_DESCRIPTION_MAX, SQUAD_NAME_MAX, cleanTag, type SquadPage, type SquadPatch } from '../../lib/data/squads';
import { SportTint } from '../../components/home/SportTint';
import { SQUAD_COLORS, validColor } from '../../components/squads/logic';
import { Field, Input, Textarea, cx } from '../../components/ui';

/**
 * Los datos de un equipo, iguales al crearlo y al editarlo: nombre, tag (sale solo del nombre hasta que escribes el
 * tuyo), ciudad, color (el del deporte o uno de la lista), descripción y «Busca jugadores».
 */

export interface SquadForm {
  name: string;
  tag: string;
  city: string;
  /** null = el color del deporte. */
  color: string | null;
  description: string;
  recruiting: boolean;
}

export const emptySquadForm = (): SquadForm => ({ name: '', tag: '', city: '', color: null, description: '', recruiting: false });

export const squadFormOf = (s: Pick<SquadPage, 'name' | 'tag' | 'city' | 'color' | 'description' | 'recruiting'>): SquadForm => ({
  name: s.name,
  tag: s.tag,
  city: s.city ?? '',
  color: validColor(s.color),
  description: s.description ?? '',
  recruiting: s.recruiting,
});

/** Solo lo que cambió (null si nada). */
export function squadPatchOf(s: Pick<SquadPage, 'name' | 'tag' | 'city' | 'color' | 'description' | 'recruiting'>, f: SquadForm): SquadPatch | null {
  const patch: SquadPatch = {};
  if (f.name.trim() !== s.name) patch.name = f.name.trim();
  if (cleanTag(f.tag) !== s.tag) patch.tag = cleanTag(f.tag);
  if ((f.city.trim() || null) !== (s.city?.trim() || null)) patch.city = f.city.trim() || null;
  if (validColor(f.color) !== validColor(s.color)) patch.color = validColor(f.color);
  if (f.description.trim() !== (s.description ?? '').trim()) patch.description = f.description.trim();
  if (f.recruiting !== s.recruiting) patch.recruiting = f.recruiting;
  return Object.keys(patch).length ? patch : null;
}

export function SquadFields({
  form,
  onChange,
  sport,
  onTagTyped,
}: {
  form: SquadForm;
  onChange: (patch: Partial<SquadForm>) => void;
  sport: string;
  /** Escribió su propio tag (deja de salir solo del nombre). */
  onTagTyped?: () => void;
}) {
  return (
    <>
      <Field label="Nombre del equipo">
        <Input className="h-11" maxLength={SQUAD_NAME_MAX} autoComplete="off" value={form.name} placeholder="Los Tigres del Este" onChange={(e) => onChange({ name: e.target.value })} />
      </Field>
      <Field label="Tag" hint="De 2 a 5 letras o números: sale como [TGR] al lado del nombre.">
        <Input
          className="h-11 font-semibold tracking-[0.08em] uppercase"
          maxLength={5}
          autoComplete="off"
          autoCapitalize="characters"
          value={form.tag}
          placeholder="TGR"
          onChange={(e) => {
            onTagTyped?.();
            onChange({ tag: cleanTag(e.target.value).slice(0, 5) });
          }}
        />
      </Field>
      <Field label="Ciudad (opcional)">
        <Input className="h-11" maxLength={SQUAD_CITY_MAX} autoComplete="address-level2" value={form.city} placeholder="Santo Domingo" onChange={(e) => onChange({ city: e.target.value })} />
      </Field>
      <ColorPicker value={form.color} sport={sport} onChange={(color) => onChange({ color })} />
      <Field label="Descripción (opcional)">
        <Textarea
          rows={2}
          maxLength={SQUAD_DESCRIPTION_MAX}
          value={form.description}
          placeholder="Jugamos los domingos en la mañana. Buscamos un portero…"
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </Field>
      <SwitchRow
        icon={<Megaphone className="size-5" />}
        title="Busca jugadores"
        text="Se ve en el equipo y en la búsqueda: así te encuentran."
        on={form.recruiting}
        onChange={(recruiting) => onChange({ recruiting })}
      />
    </>
  );
}

/** El color del equipo: el del deporte (el de entrada) o uno de la lista. Cada uno se ve de 36 px y se toca en 44. */
export function ColorPicker({ value, sport, onChange }: { value: string | null; sport: string; onChange: (hex: string | null) => void }) {
  const current = validColor(value);
  const swatch = (on: boolean) =>
    cx(
      "relative grid size-9 place-items-center rounded-full text-white transition after:absolute after:-inset-1 after:content-[''] active:scale-95",
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
      on && 'ring-2 ring-fg ring-offset-2 ring-offset-surface',
    );
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted" id="color-equipo">
        Color
      </span>
      <div role="radiogroup" aria-labelledby="color-equipo" className="flex flex-wrap gap-2.5">
        <SportTint sport={sport} className="contents">
          <button type="button" role="radio" aria-checked={current === null} aria-label="El color del deporte" title="El del deporte" onClick={() => onChange(null)} className={cx(swatch(current === null), 'bg-accent text-accent-fg')}>
            {current === null && <Check aria-hidden="true" className="size-4" strokeWidth={3} />}
          </button>
        </SportTint>
        {SQUAD_COLORS.map((c) => {
          const on = current === c.hex;
          return (
            <button key={c.hex} type="button" role="radio" aria-checked={on} aria-label={c.name} title={c.name} onClick={() => onChange(c.hex)} className={swatch(on)} style={{ backgroundColor: c.hex }}>
              {on && <Check aria-hidden="true" className="size-4" strokeWidth={3} />}
            </button>
          );
        })}
      </div>
      <span className="text-xs text-muted">El primero es el del deporte. Se ve en la página del equipo y en su logo.</span>
    </div>
  );
}

/** Interruptor en tarjeta («Busca jugadores»). */
export function SwitchRow({ icon, title, text, on, onChange }: { icon: ReactNode; title: string; text: ReactNode; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-center gap-3.5 rounded-2xl bg-surface-2 p-4 text-left transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold">{title}</span>
        <span className="mt-0.5 block text-sm text-muted">{text}</span>
      </span>
      <span aria-hidden="true" className={cx('flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors', on ? 'bg-accent' : 'bg-line')}>
        <span className={cx('size-5 rounded-full bg-white shadow-sm transition-transform', on && 'translate-x-5')} />
      </span>
    </button>
  );
}
