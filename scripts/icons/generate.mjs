// Iconos de MatchMate (logo «Dúo») en public/, desde src/components/splash/brand.ts.
// Uso: node scripts/icons/generate.mjs   (los archivos generados se suben al repo)
//
// - favicon.svg: sigue el modo claro/oscuro del sistema.
// - favicon.ico (32 px, PNG dentro): para lo que pide /favicon.ico y navegadores viejos.
// - icon-192.png, icon-512.png: con esquinas redondeadas (purpose "any").
// - icon-maskable-512.png: cuadro completo (rx 0); el dibujo cabe en la zona segura (círculo de radio 40 %).
// - apple-touch-icon.png (180): cuadro completo y sin transparencia (iOS pone sus esquinas).
// - badge-96.png: blanco sobre transparente, sin cuadro: el iconito de las notificaciones en Android.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { ROOT, loadTs } from './load-ts.mjs';

const { BRAND, duoSvg, duoFaviconSvg } = await loadTs('/src/components/splash/brand.ts');
const out = (name) => join(ROOT, 'public', name);
const png = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();

/** Un .ico con un solo PNG adentro (válido desde Windows Vista y en todos los navegadores). */
function ico(pngData, size) {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); // reservado
  head.writeUInt16LE(1, 2); // 1 = icono
  head.writeUInt16LE(1, 4); // una imagen
  head.writeUInt8(size, 6);
  head.writeUInt8(size, 7);
  head.writeUInt8(0, 8); // sin paleta
  head.writeUInt8(0, 9);
  head.writeUInt16LE(1, 10); // planos
  head.writeUInt16LE(32, 12); // bits por píxel
  head.writeUInt32LE(pngData.length, 14);
  head.writeUInt32LE(22, 18); // dónde empieza la imagen
  return Buffer.concat([head, pngData]);
}

const { accent, onAccent } = BRAND.light;
const rounded = duoSvg({ tile: accent, ink: onAccent });
const square = duoSvg({ tile: accent, ink: onAccent, rx: 0 });
const files = {
  'favicon.svg': duoFaviconSvg(),
  'favicon.ico': ico(png(rounded, 32), 32),
  'icon-192.png': png(rounded, 192),
  'icon-512.png': png(rounded, 512),
  'icon-maskable-512.png': png(square, 512),
  'apple-touch-icon.png': png(square, 180),
  // Sin cuadro el dibujo va más grande (recorte alrededor de la M y las cabezas).
  'badge-96.png': png(duoSvg({ tile: null, ink: '#ffffff', viewBox: '88 88 336 336' }), 96),
};
for (const [name, data] of Object.entries(files)) {
  writeFileSync(out(name), data);
  console.log(`public/${name}`, `${Buffer.byteLength(data)} B`);
}
