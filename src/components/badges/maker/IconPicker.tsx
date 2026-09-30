import { useState } from 'react';
import { Search } from 'lucide-react';
import { BADGE_ICONS, ICON_TABS, searchIcons, type BadgeIconKey, type IconTab } from '../../../badges/visual';
import { Input, cx } from '../../ui';
import { IconGlyph } from './parts';

/**
 * «Ícono» del editor (§5.4): los 53 curados en 5 pestañas (Deporte, Premios, Esfuerzo, Comunidad, Nuestra tierra) y
 * la búsqueda sin tildes («Busca: trofeo, fuego, cigua…»). Con texto busca en todos; cada botón mide 44 px.
 */
export function IconPicker({ value, onChange, id = 'insignia-icono' }: { value: BadgeIconKey; onChange: (k: BadgeIconKey) => void; id?: string }) {
  const [tab, setTab] = useState<IconTab>(() => BADGE_ICONS[value]?.tab ?? 'deporte');
  const [q, setQ] = useState('');
  // Si el ícono cambia desde afuera (una plantilla), se abre su pestaña para que se vea marcado.
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    if (!q.trim() && BADGE_ICONS[value]) setTab(BADGE_ICONS[value].tab);
  }
  const keys = searchIcons(q, tab);
  const searching = q.trim().length > 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <Input
          id={id}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Busca: trofeo, fuego, cigua…"
          autoComplete="off"
          className="pl-9"
          aria-label="Buscar ícono"
        />
      </div>
      <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1" role="tablist" aria-label="Grupos de íconos">
        {ICON_TABS.map((t) => {
          const on = !searching && tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                setTab(t.key);
                setQ('');
              }}
              className={cx(
                'min-h-11 shrink-0 rounded-xl px-3 text-sm font-medium whitespace-nowrap transition',
                on ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {keys.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1" role="group" aria-label={searching ? `Íconos con «${q.trim()}»` : 'Íconos'}>
          {keys.map((k) => {
            const on = k === value;
            return (
              <button
                key={k}
                type="button"
                onClick={() => onChange(k)}
                aria-pressed={on}
                aria-label={BADGE_ICONS[k].label}
                title={BADGE_ICONS[k].label}
                className={cx(
                  'flex size-11 items-center justify-center justify-self-center rounded-xl border transition active:scale-95',
                  on ? 'border-accent bg-accent text-accent-fg' : 'border-transparent text-fg hover:bg-surface-2',
                )}
              >
                <IconGlyph icon={k} className="size-6" />
              </button>
            );
          })}
        </div>
      ) : (
        <p className="py-3 text-center text-sm text-muted">No encontramos ese ícono. Prueba con «trofeo», «fuego» o «cigua».</p>
      )}
    </div>
  );
}
