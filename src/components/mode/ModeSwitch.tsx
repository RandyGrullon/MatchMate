import { Leaf, Zap } from 'lucide-react';
import type { UiMode } from '../../lib/mode';
import { useMode } from '../../lib/useMode';
import { Segmented, type SegmentedOption } from '../ui';
import { useSwitchMode } from './ModeToast';

export const MODE_OPTIONS: readonly SegmentedOption<UiMode>[] = [
  { key: 'lite', label: 'Lite', icon: <Leaf aria-hidden="true" className="size-[17px]" /> },
  { key: 'pro', label: 'Pro', icon: <Zap aria-hidden="true" className="size-[17px]" /> },
];

/**
 * El selector «Lite | Pro» de arriba de Yo. Cambia al momento (se guarda en la cuenta) y lo anuncia abajo con
 * «Deshacer» (ModeToast). Con `onPick`, quien lo pone decide qué pasa al tocar (p. ej. abrir la hoja «Elige cómo ver la
 * app» la primera vez que se toca Pro).
 */
export function ModeSwitch({ onPick, className }: { onPick?: (mode: UiMode) => void; className?: string }) {
  const { mode } = useMode();
  const switchMode = useSwitchMode();
  return (
    <Segmented
      label="Cómo ver la app"
      options={MODE_OPTIONS}
      value={mode}
      onChange={(next) => (onPick ? onPick(next) : void switchMode(next))}
      className={className}
    />
  );
}
