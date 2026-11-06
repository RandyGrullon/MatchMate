/**
 * Lo que abre la app si se toca un link de matchmate.grullonb.com (lo demás sigue en el navegador): los enlaces
 * universales del iPhone y los App Links de Android. Tiene que coincidir con app.json › android.intentFilters;
 * movil/scripts/enlaces-universales.mjs lo revisa y arma con esto los archivos de public/.well-known/.
 * El script lo lee como texto: dejarlo así, una lista de textos entre comillas simples.
 */
export const APP_LINK_PATHS = ['/unirse/', '/l/', '/p/', '/u/', '/canchas/', '/esports/unirse/'] as const;
