// Los archivos que hacen que un link de matchmate.grullonb.com abra la app en vez del navegador (enlaces universales
// del iPhone y App Links de Android). Se corren una vez, cuando ya existen la cuenta de Apple y la app en Google Play:
//
//   node movil/scripts/enlaces-universales.mjs --team ABCDE12345 --sha256 AA:BB:…[,CC:DD:…]
//
// - --team: el Team ID de Apple (developer.apple.com › Membership, 10 letras y números).
// - --sha256: la huella SHA-256 del certificado con que Android firma la app. Van dos, separadas por coma: la de EAS
//   (`npx eas-cli@latest credentials -p android`) y la de «Firma de apps de Google Play» (Play Console › Integridad
//   de la app). Sin la de Play, los links no abren la app instalada desde la tienda.
//
// Escribe public/.well-known/apple-app-site-association y public/.well-known/assetlinks.json (la web los publica al
// desplegar; vercel.json les pone Content-Type: application/json). Qué rutas abren la app: APP_LINK_PATHS
// (movil/src/lib/appLinkPaths.ts), que tiene que coincidir con app.json › android.intentFilters (aquí se revisa).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadTs, ROOT } from '../../scripts/icons/load-ts.mjs';

const { values } = parseArgs({ options: { team: { type: 'string' }, sha256: { type: 'string' } } });
const team = (values.team ?? '').trim().toUpperCase();
const prints = (values.sha256 ?? '')
  .split(',')
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

const fail = (msg) => {
  console.error(`enlaces-universales: ${msg}`);
  process.exit(1);
};
if (!/^[A-Z0-9]{10}$/.test(team)) fail('falta --team (el Team ID de Apple: 10 letras y números).');
if (!prints.length || !prints.every((p) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(p))) {
  fail('falta --sha256 (huellas SHA-256 con dos puntos, AA:BB:…; varias separadas por coma).');
}

const app = JSON.parse(readFileSync(join(ROOT, 'movil', 'app.json'), 'utf8')).expo;
// Se lee como texto: con loadTs, Vite buscaría el tsconfig de Expo (movil/tsconfig.json) en los node_modules de la web.
const linksSource = readFileSync(join(ROOT, 'movil', 'src', 'lib', 'appLinkPaths.ts'), 'utf8');
const APP_LINK_PATHS = [...(/APP_LINK_PATHS = \[([^\]]*)\]/.exec(linksSource)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
if (!APP_LINK_PATHS.length) fail('no se encontró APP_LINK_PATHS en movil/src/lib/appLinkPaths.ts.');
const bundleId = app.ios.bundleIdentifier;
const pkg = app.android.package;

// Lo que dice app.json tiene que ser lo mismo que APP_LINK_PATHS (si no, un sistema abre la app y el otro no).
const host = new URL((await loadTs('/src/lib/origin.ts')).APP_ORIGIN).host;
if (!app.ios.associatedDomains?.includes(`applinks:${host}`)) fail(`app.json › ios.associatedDomains no tiene applinks:${host}.`);
const prefixes = app.android.intentFilters.flatMap((f) => f.data.filter((d) => d.host === host).map((d) => d.pathPrefix)).sort();
if (JSON.stringify(prefixes) !== JSON.stringify([...APP_LINK_PATHS].sort())) {
  fail(`app.json › android.intentFilters (${prefixes.join(' ')}) no coincide con APP_LINK_PATHS (${APP_LINK_PATHS.join(' ')}).`);
}

const aasa = {
  applinks: {
    details: [{ appIDs: [`${team}.${bundleId}`], components: APP_LINK_PATHS.map((p) => ({ '/': `${p}*` })) }],
  },
};
const assetlinks = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: prints },
  },
];

const dir = join(ROOT, 'public', '.well-known');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'apple-app-site-association'), `${JSON.stringify(aasa, null, 2)}\n`);
writeFileSync(join(dir, 'assetlinks.json'), `${JSON.stringify(assetlinks, null, 2)}\n`);
console.log(`public/.well-known/apple-app-site-association → ${team}.${bundleId}: ${APP_LINK_PATHS.join(' ')}`);
console.log(`public/.well-known/assetlinks.json → ${pkg} (${prints.length} huella${prints.length === 1 ? '' : 's'})`);
console.log(`Después de desplegar la web: https://${host}/.well-known/apple-app-site-association y …/assetlinks.json`);
