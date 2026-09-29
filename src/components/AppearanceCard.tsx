import { useState } from 'react';
import { Monitor, Moon, Palette, Sun } from 'lucide-react';
import { loadTheme, saveTheme, type ThemeMode, type ThemePrefs } from '../lib/theme';
import { Card, cx } from './ui';

const MODES: { key: ThemeMode; label: string; icon: typeof Sun }[] = [
  { key: 'system', label: 'Automático', icon: Monitor },
  { key: 'light', label: 'Claro', icon: Sun },
  { key: 'dark', label: 'Oscuro', icon: Moon },
];

/** Configuración › Apariencia: claro, oscuro o como el teléfono (en este dispositivo). El color lo pone cada deporte. */
export function AppearanceCard() {
  const [prefs, setPrefs] = useState<ThemePrefs>(loadTheme);

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
        <p className="text-sm text-muted">Se guarda en este teléfono. El color de la app es el del deporte en que estás.</p>
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
    </Card>
  );
}
