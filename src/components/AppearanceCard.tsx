import { useState } from 'react';
import { Check, Monitor, Moon, Palette, RotateCcw, Sun } from 'lucide-react';
import { ACCENT_PRESETS, DEFAULT_ACCENT, loadTheme, saveTheme, type ThemeMode, type ThemePrefs } from '../lib/theme';
import { Card, cx } from './ui';

const MODES: { key: ThemeMode; label: string; icon: typeof Sun }[] = [
  { key: 'system', label: 'Automático', icon: Monitor },
  { key: 'light', label: 'Claro', icon: Sun },
  { key: 'dark', label: 'Oscuro', icon: Moon },
];

/** Configuración › Apariencia: claro, oscuro o como el teléfono, y el color de la app (en este dispositivo). */
export function AppearanceCard() {
  const [prefs, setPrefs] = useState<ThemePrefs>(loadTheme);
  const accent = (prefs.accent ?? DEFAULT_ACCENT).toLowerCase();
  const custom = !ACCENT_PRESETS.some((p) => p.hex === accent);

  function update(next: Partial<ThemePrefs>) {
    const p = { ...prefs, ...next };
    setPrefs(p);
    saveTheme(p);
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <Palette className="size-5 text-accent" /> Apariencia
        </h2>
        <p className="text-sm text-muted">Se guarda en este teléfono.</p>
      </div>

      <div role="radiogroup" aria-label="Modo" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
        {MODES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={prefs.mode === key}
            onClick={() => update({ mode: key })}
            className={cx(
              'flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition',
              prefs.mode === key ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Color de la app</span>
        <div role="radiogroup" aria-label="Color de la app" className="flex flex-wrap gap-2.5">
          {ACCENT_PRESETS.map((p) => {
            const on = p.hex === accent;
            return (
              <button
                key={p.hex}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={p.name}
                title={p.name}
                onClick={() => update({ accent: p.hex === DEFAULT_ACCENT ? null : p.hex })}
                className={cx(
                  'flex size-10 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition active:scale-95',
                  on && 'ring-2 ring-fg',
                )}
                style={{ background: p.hex }}
              >
                {on && <Check className="size-5 text-white drop-shadow" />}
              </button>
            );
          })}
          {/* Cualquier color: el selector del teléfono. */}
          <label
            title="Otro color"
            className={cx(
              'relative flex size-10 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-line ring-offset-2 ring-offset-surface',
              custom && 'border-solid ring-2 ring-fg',
            )}
            style={custom ? { background: accent } : undefined}
          >
            {custom ? <Check className="size-5 text-white drop-shadow" /> : <Palette className="size-4 text-muted" />}
            <input
              type="color"
              value={accent}
              onChange={(e) => update({ accent: e.target.value })}
              aria-label="Elegir otro color"
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </div>
        {prefs.accent && (
          <button type="button" onClick={() => update({ accent: null })} className="flex items-center gap-1.5 self-start text-sm font-medium text-accent">
            <RotateCcw className="size-3.5" /> Volver al morado de BowlingX
          </button>
        )}
      </div>

      {/* Vista previa con el color elegido. */}
      <div className="flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2.5 text-sm">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent font-bold text-accent-fg">X</span>
        <span className="flex-1 font-medium text-accent">Así se ven los botones y los enlaces</span>
      </div>
    </Card>
  );
}
