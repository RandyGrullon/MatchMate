const path = require('path');

/** El código propio de la app (`movil/src`). Lo compartido con la web (`../src`) no pasa por el React Compiler. */
const APP_SRC = (path.join(__dirname, 'src') + path.sep).toLowerCase();

/**
 * Babel de la app (el de Expo). El React Compiler (`experiments.reactCompiler` en app.json) corre solo en `movil/src`:
 * la lógica compartida de `../src` se escribió para la web, que no lo usa, y hay hooks que leen algo que cambia por
 * fuera de React en cada render (p. ej. `getUserId()` en src/lib/data/follows.ts); compilados, se quedaban con el primer
 * valor (sin cuenta) y los avisos sociales nunca se pedían.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { 'react-compiler': { sources: (filename) => path.normalize(filename).toLowerCase().startsWith(APP_SRC) } }]],
  };
};
