import { Leaf, Zap } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import type { UiMode } from '../../lib/mode';
import { useMode } from '../../lib/useMode';
import { Segmented, type SegmentedOption } from '../ui';
import { modeSheetSeen, openModeSheet, pickAction } from './modeSheet';
import { useSwitchMode } from './ModeToast';

export const MODE_OPTIONS: readonly SegmentedOption<UiMode>[] = [
  { key: 'lite', label: 'Lite', icon: <Leaf aria-hidden="true" className="size-[17px]" /> },
  { key: 'pro', label: 'Pro', icon: <Zap aria-hidden="true" className="size-[17px]" /> },
];

/**
 * El selector «Lite | Pro» de arriba de Yo. La primera vez que se toca «Pro» abre la hoja «Elige cómo ver la app» (con
 * Pro marcado: se compara y se cambia desde ahí); después cambia al momento (se guarda en la cuenta) y lo anuncia abajo
 * con «Deshacer» (ModeToast). Con `onPick`, quien lo pone decide qué pasa al tocar.
 */
export function ModeSwitch({ onPick, className }: { onPick?: (mode: UiMode) => void; className?: string }) {
  const { mode } = useMode();
  const { user } = useAuth();
  const switchMode = useSwitchMode();
  const pick = (next: UiMode) => {
    if (onPick) return onPick(next);
    if (pickAction(next, modeSheetSeen(user?.uid)) === 'sheet') return openModeSheet(next, user?.uid);
    void switchMode(next);
  };
  return <Segmented label="Cómo ver la app" options={MODE_OPTIONS} value={mode} onChange={pick} className={className} />;
}
