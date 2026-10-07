import { ModeSheet } from '../home/HomeSheets';
import { closeModeSheet, useModeSheetState } from './modeSheet';

/**
 * La hoja «Elige cómo ver la app» de cualquier pantalla (una vez, en el marco de la app, como ModeToast): la abren el
 * primer toque en «Pro» del selector de Yo y «Probar Pro» (openModeSheet). No va en index.ts: HomeSheets usa el módulo
 * del modo y así no se cierra el círculo.
 */
export function ModeSheetHost() {
  const state = useModeSheetState();
  // Cerrada no deja nada en la página.
  if (!state) return null;
  return <ModeSheet open initial={state.initial} onClose={closeModeSheet} />;
}
