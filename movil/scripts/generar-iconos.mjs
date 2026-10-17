// Íconos de la app del teléfono, del mismo dibujo de la marca que la web (src/components/splash/brand.ts):
//   node movil/scripts/generar-iconos.mjs   (desde la raíz del repo, con `pnpm install` hecho: usa @resvg/resvg-js)
// - icon.png 1024 × 1024 cuadrado y sin transparencia (la App Store no los acepta redondeados ni transparentes);
// - android-icon-foreground.png: solo el dibujo, dentro de la zona segura del ícono adaptable (el fondo es el color
//   de app.json › android.adaptiveIcon.backgroundColor);
// - splash-icon.png (el logo redondeado) y favicon.png (la vista previa web).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { loadTs } from '../../scripts/icons/load-ts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'assets', 'images');
mkdirSync(outDir, { recursive: true });

const { BRAND, duoSvg } = await loadTs('/src/components/splash/brand.ts');
const png = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
const { accent, onAccent } = BRAND.light;

const files = {
  'icon.png': png(duoSvg({ tile: accent, ink: onAccent, rx: 0 }), 1024),
  // El dibujo ocupa ~2/3 del lado: el resto es la zona que Android recorta según la forma del teléfono.
  'android-icon-foreground.png': png(duoSvg({ tile: null, ink: onAccent, viewBox: '-128 -128 768 768' }), 1024),
  'splash-icon.png': png(duoSvg({ tile: accent, ink: onAccent }), 512),
  'favicon.png': png(duoSvg({ tile: accent, ink: onAccent }), 48),
};
for (const [name, data] of Object.entries(files)) {
  writeFileSync(join(outDir, name), data);
  console.log(`movil/assets/images/${name}`, `${data.length} B`);
}
