// MatchMate móvil comparte la lógica de la web (../src: motores de los deportes, insignias, capa de datos, Supabase).
// Metro la ve como una carpeta más y la resuelve así:
// - `@mm/...` es ../src/... y `@movil/...` es ./src/... (lo mismo que tsconfig.json).
// - Lo que importa el código compartido de node_modules (react, @supabase/supabase-js, idb…) sale SIEMPRE de los
//   node_modules de la app: si saliera de los de la web habría dos React y los hooks fallarían.
// - `lucide-react` (los íconos de la web, p. ej. en src/sports/registry.ts) es `lucide-react-native`: mismos nombres.
// - Un archivo compartido con hermano `.native.ts` usa ese hermano en el teléfono (lo hace Metro) y también en la vista
//   previa web de la app (lo hace esta función), para probar en el navegador lo mismo que corre en el teléfono.
const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../src');
// La palabra de confirmar el borrado de la cuenta vive con su Edge Function (TypeScript puro, sin imports).
const deleteAccountCore = path.resolve(projectRoot, '../supabase/functions/delete-account');
// Leer la foto del marcador con la IA (src/lib/scan-result.ts): sus tipos y su revisión viven con la Edge Function
// scan-bowling (_shared/scan-core.ts, TypeScript puro, sin imports).
const scanCore = path.resolve(projectRoot, '../supabase/functions/_shared');
// Pagar con Azul en la demostración y su simulador (src/lib/azulLocal.ts, movil/src/app/dev/azul.tsx): la firma y la
// lógica de la Edge Function azul-pay (core.ts, TypeScript puro, sin imports).
const azulPayCore = path.resolve(projectRoot, '../supabase/functions/azul-pay');
const config = getDefaultConfig(projectRoot);

config.watchFolders = [...(config.watchFolders ?? []), sharedRoot, deleteAccountCore, scanCore, azulPayCore];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

const inShared = (file) => file.startsWith(sharedRoot + path.sep) || file === sharedRoot;
const isBare = (name) => !name.startsWith('.') && !path.isAbsolute(name) && !name.startsWith('@mm/') && !name.startsWith('@movil/');
const ALIASES = { 'lucide-react': 'lucide-react-native' };
// jsPDF (el PDF del reporte del torneo) trae html2canvas, dompurify y canvg para doc.html() y los SVG, que no se usan:
// van al mismo archivo vacío que en la web (vite.config.ts), y no entran a la app.
const UNUSED = path.join(sharedRoot, 'lib', 'report', 'unused.ts');
const UNUSED_DEPS = new Set(['html2canvas', 'dompurify', 'canvg']);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (UNUSED_DEPS.has(moduleName)) return { type: 'sourceFile', filePath: UNUSED };
  let name = ALIASES[moduleName] ?? moduleName;
  let ctx = context;
  if (name.startsWith('@mm/')) name = path.join(sharedRoot, name.slice(4));
  else if (name.startsWith('@movil/')) name = path.join(projectRoot, 'src', name.slice(7));
  else if (isBare(name) && inShared(context.originModulePath)) {
    // Como si lo importara la app: así sale de sus node_modules.
    ctx = { ...context, originModulePath: path.join(projectRoot, 'package.json') };
  }
  const result = ctx.resolveRequest(ctx, name, platform);
  if (platform === 'web' && result.type === 'sourceFile' && inShared(result.filePath)) {
    const native = result.filePath.replace(/\.(tsx?)$/, '.native.$1');
    if (native !== result.filePath && fs.existsSync(native)) return { ...result, filePath: native };
  }
  return result;
};

module.exports = config;
