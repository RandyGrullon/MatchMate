/**
 * Lo primero que corre (index.ts), antes que la lógica compartida con la web: en el teléfono, `localStorage` (vacío hasta
 * que _layout.tsx espere a hydrateStorage), los avisos de `window` (events.ts) y los polyfills que pide Supabase. En la
 * vista previa web no hace falta nada de esto.
 */
import './polyfills';
import { installWindowEvents } from './events';
import { installLocalStorage } from './storage';

installLocalStorage();
installWindowEvents();
