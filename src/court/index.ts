/**
 * Modo cancha común a los deportes de partido (raqueta y equipos). Contrato: docs/partidos.md.
 *
 * - `useCourt` + un `CourtAdapter` (motor puro de src/sports + marcador resumido + hitos): lista de jugadas en el
 *   teléfono (IndexedDB `mm-cancha`, clave `mm:cancha:<liga>:<partido>`), deshacer, un solo anotador y
 *   publicación con tope por la cola sin conexión.
 * - `CourtLayout`: pantalla completa con Wake Lock, modo sol, Deshacer siempre a la vista, Terminar y Suspender
 *   (`CourtNote`: las líneas de aviso de arriba: quién saca, cambio de lado).
 * - `TwoHalves`: dos mitades gigantes para tocar el lado que ganó el punto.
 */
export type { CourtAdapter, CourtParent, CourtSnapshot } from './types';
export { applyEvent, canUndo, compact, isSnapshot, outcome, pickSnapshot, snapshotState, startSnapshot, undoEvent, withOrigin, KEEP_UNDO, MAX_LOG } from './session';
export { courtKey, courtOrigin, courtStore, createCourtStore, pruneCourtLogs, type CourtRecord, type CourtStore } from './log';
export { createPublisher, IDLE_MS, MIN_GAP_MS, type Publisher, type PublisherOptions } from './publisher';
export { createCourtMachine, type CourtDeps, type CourtMachine, type CourtView, type LeaseState } from './machine';
export { courtDeps, useCourt, type CourtController, type UseCourtOptions } from './useCourt';
export { courtVars, isAndroid, isIOS, tap, useFullscreen, useSunMode, useWakeLock, wakeLockSupported } from './device';
export { CourtLayout, CourtNote } from './CourtLayout';
export { LeaseBanner } from './LeaseBanner';
export { TwoHalves, type HalfProps } from './TwoHalves';
