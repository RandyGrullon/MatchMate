import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { blockZoom } from './lib/noZoom';
import { applyTheme, loadTheme } from './lib/theme';

blockZoom();
// Apariencia elegida (index.html ya la puso antes de pintar; esto ajusta la barra del teléfono).
applyTheme(loadTheme());
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme(loadTheme()));
// Que el navegador no borre la copia de los datos ni la cola sin conexión (sobre todo en iPhone) si falta espacio.
void navigator.storage?.persist?.().catch(() => undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
