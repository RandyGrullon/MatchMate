import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { getBackend } from './lib/backend';
import { blockZoom } from './lib/noZoom';
import { startPersistence, watchSessionUser } from './lib/persist';
import { applyTheme, loadTheme } from './lib/theme';

blockZoom();
// Apariencia elegida (index.html ya la puso antes de pintar; esto ajusta la barra del teléfono).
applyTheme(loadTheme());
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme(loadTheme()));
// Sin señal: al entrar a la cuenta, pedir que el navegador no borre la copia de los datos ni la cola sin conexión si
// falta espacio (src/lib/persist.ts) y precargar lo de hoy y mañana de tus ligas (src/lib/prefetch.ts). La precarga
// se baja aparte y solo con una cuenta adentro, para no pesar en la primera carga.
startPersistence(getBackend());
let prefetchLoading = false;
watchSessionUser(getBackend(), (uid) => {
  if (!uid || prefetchLoading) return;
  prefetchLoading = true;
  import('./lib/prefetch')
    .then(({ startPrefetch }) => startPrefetch(getBackend()))
    .catch((e: unknown) => {
      prefetchLoading = false;
      console.warn('[precarga] no se pudo cargar', e);
    });
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
