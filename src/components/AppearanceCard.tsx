import { useState } from 'react';
import { Leaf, Monitor, Moon, Sun, Zap } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { loadTheme, saveTheme, type ThemeMode, type ThemePrefs } from '../lib/theme';
import { useMode } from '../lib/useMode';
import { openModeSheet } from './mode/modeSheet';
import { Card, ListRow, RowIcon, SectionHeader, Segmented, type SegmentedOption } from './ui';

/** «Auto» (como el teléfono), claro u oscuro: cortos para que quepan los tres en un teléfono de 360 px. */
export const THEME_OPTIONS: readonly SegmentedOption<ThemeMode>[] = [
  { key: 'system', label: 'Auto', ariaLabel: 'Automático, como el teléfono', icon: <Monitor aria-hidden="true" className="size-4" /> },
  { key: 'light', label: 'Claro', icon: <Sun aria-hidden="true" className="size-4" /> },
  { key: 'dark', label: 'Oscuro', icon: <Moon aria-hidden="true" className="size-4" /> },
];

/**
 * Configuración › Apariencia: claro, oscuro o como el teléfono (en este dispositivo; el color lo pone cada deporte) y
 * cómo ver la app (Lite o Pro: abre la hoja «Elige cómo ver la app», la misma del selector de Yo).
 */
export function AppearanceCard({ className }: { className?: string }) {
  const [prefs, setPrefs] = useState<ThemePrefs>(loadTheme);
  const { user } = useAuth();
  const { mode, isPro } = useMode();

  function update(next: Partial<ThemePrefs>) {
    const p = { ...prefs, ...next };
    setPrefs(p);
    saveTheme(p);
  }

  return (
    <section aria-labelledby="cfg-apariencia" className={className}>
      <SectionHeader id="cfg-apariencia" title="Apariencia" />
      <Card className="overflow-hidden">
        {/* mm-row: la fila de abajo lleva su línea, como entre dos filas. */}
        <div className="mm-row relative px-5 pt-[18px] pb-4">
          <Segmented full label="Tema" options={THEME_OPTIONS} value={prefs.mode} onChange={(m) => update({ mode: m })} />
          <p className="mx-1 mt-2.5 text-[13px] text-muted">En este teléfono. El color es el de tu deporte.</p>
        </div>
        <ListRow
          dense={isPro}
          leading={<RowIcon tone="accent">{isPro ? <Zap className="size-5" /> : <Leaf className="size-5" />}</RowIcon>}
          title="Cómo ver la app"
          subtitle={isPro ? 'Pro: con todo' : 'Lite: lo esencial'}
          onClick={() => openModeSheet(mode, user?.uid)}
          ariaLabel={`Cómo ver la app: ${isPro ? 'Pro' : 'Lite'}. Cambiar`}
        />
      </Card>
    </section>
  );
}
