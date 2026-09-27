import { useState, type CSSProperties } from 'react';
import { Check, Pause, Repeat, RotateCcw } from 'lucide-react';
import { ACCENT_PRESETS, DEFAULT_ACCENT, brandColors, loadTheme } from '../lib/theme';
import { Badge, Button, Card, cx } from '../components/ui';
import { Logo, Wordmark } from '../components/Logo';
import { SportSplash } from '../components/splash/SportSplash';
import { BRAND } from '../components/splash/brand';
import { LIVE_SCENES, SCENES, SCENE_ORDER } from '../components/splash/scenes';

const MODES = ['light', 'dark'] as const;
type Mode = (typeof MODES)[number];
const MODE_LABEL: Record<Mode, string> = { light: 'Claro', dark: 'Oscuro' };

/** Fondo y colores de un recuadro en claro u oscuro, sin importar el modo de la pantalla. */
function boxStyle(mode: Mode, accent: string | null): CSSProperties {
  const c = brandColors(accent)[mode];
  return { background: BRAND[mode].bg, color: BRAND[mode].text, '--accent': c.accent, '--accent-fg': c.fg } as CSSProperties;
}

/**
 * Vista previa de la marca (superadmin): el logo y todas las animaciones de apertura en claro y en oscuro,
 * con el color elegido, repetidas o quietas (lo que se ve con movimiento reducido). Para aprobarlas antes
 * de encender cada deporte (LIVE_SCENES en src/components/splash/scenes.ts).
 */
export default function SplashPreviewPage() {
  const [run, setRun] = useState(0);
  const [loop, setLoop] = useState(false);
  const [still, setStill] = useState(false);
  const [accent, setAccent] = useState<string | null>(() => loadTheme().accent);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 pb-safe">
      <header className="flex flex-wrap items-center gap-3">
        <Logo className="size-10" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight">Marca y animaciones</h1>
          <p className="text-sm text-muted">Así abre la app con cada deporte. Las que dicen «Activa» ya salen; las demás, cuando se encienda su deporte.</p>
        </div>
        <Button variant="primary" icon={<RotateCcw className="size-4" />} onClick={() => setRun((r) => r + 1)}>
          Repetir
        </Button>
      </header>

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={loop ? 'primary' : 'secondary'} icon={<Repeat className="size-4" />} onClick={() => setLoop((v) => !v)} aria-pressed={loop}>
            En bucle
          </Button>
          <Button size="sm" variant={still ? 'primary' : 'secondary'} icon={<Pause className="size-4" />} onClick={() => setStill((v) => !v)} aria-pressed={still}>
            Sin movimiento
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Color">
          {ACCENT_PRESETS.map((p) => {
            const on = (accent ?? DEFAULT_ACCENT).toLowerCase() === p.hex.toLowerCase();
            return (
              <button
                key={p.hex}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={p.name}
                title={p.name}
                onClick={() => setAccent(p.hex === DEFAULT_ACCENT ? null : p.hex)}
                className={cx('flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition active:scale-95', on && 'ring-2 ring-fg')}
                style={{ background: p.hex }}
              >
                {on && <Check className="size-4 text-white drop-shadow" />}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="font-semibold">Logo</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {MODES.map((m) => (
            <div key={m} className="flex flex-wrap items-center gap-4 rounded-xl p-4" style={boxStyle(m, accent)}>
              <Logo className="size-16" />
              <Logo className="size-10" />
              <Logo className="size-6" />
              <Logo className="size-4" />
              <Wordmark className="text-2xl" />
              <span className="w-full text-xs opacity-60">{MODE_LABEL[m]}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {SCENE_ORDER.map((id) => (
          <Card key={id} className="flex flex-col gap-3 p-3">
            <div className="flex items-center justify-between gap-2 px-1">
              <h2 className="font-semibold">{SCENES[id].label}</h2>
              <Badge tone={LIVE_SCENES.includes(id) ? 'ok' : 'neutral'}>{LIVE_SCENES.includes(id) ? 'Activa' : 'Vista previa'}</Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {MODES.map((m) => (
                <div key={m} className="relative overflow-hidden rounded-xl py-5" style={{ background: BRAND[m].bg }}>
                  <SportSplash key={`${id}-${m}-${run}`} scene={id} mode={m} accent={accent} loop={loop} still={still} width={200} label={`${SCENES[id].label}, ${MODE_LABEL[m].toLowerCase()}`} />
                  <span className="absolute top-2 left-3 text-[11px] font-medium" style={{ color: BRAND[m].text, opacity: 0.5 }}>
                    {MODE_LABEL[m]}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
