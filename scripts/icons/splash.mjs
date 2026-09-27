// Pone en index.html el CSS, las escenas activas y el script de la animación de apertura,
// desde src/components/splash/scenes.ts (la única fuente de las escenas).
// Uso: node scripts/icons/splash.mjs   (después de cambiar una escena o de encender un deporte en LIVE_SCENES)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadTs } from './load-ts.mjs';

const { injectSplash } = await loadTs('/src/components/splash/scenes.ts');
const file = join(ROOT, 'index.html');
const before = readFileSync(file, 'utf8');
const after = injectSplash(before);
if (after === before) {
  console.log('index.html ya estaba al día');
} else {
  writeFileSync(file, after);
  console.log('index.html actualizado');
}
