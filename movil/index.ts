// Entrada de la app. Antes que expo-router y que la lógica compartida con la web (../src): `localStorage` del teléfono
// y los polyfills de React Native. Los `import` se evalúan en orden, por eso va en un archivo aparte.
import './src/platform/setup';
import 'expo-router/entry';
