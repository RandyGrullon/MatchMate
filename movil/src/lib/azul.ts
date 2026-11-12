/**
 * Pagar con Azul desde el teléfono (docs/empresas.md › Pagos con Azul). La web manda el formulario firmado a la
 * Página de Pagos con un POST desde el navegador (sendToAzul); Azul no acepta otra cosa, y una pestaña del navegador
 * del sistema (expo-web-browser) no puede abrirse con un POST. Así que en el teléfono la página de Azul se abre dentro
 * de la app (movil/src/app/empresa/azul.tsx, con WebView): el POST lo hace la WebView y la vuelta (ApprovedUrl,
 * DeclinedUrl o CancelUrl, `/empresa/pago` de la web) no se carga: se lleva a la pantalla de la app que la confirma
 * (movil/src/app/empresa/pago.tsx). Los datos de la tarjeta se escriben en la página de Azul: la app no los toca.
 * Lo puro (el formulario, el POST y reconocer la vuelta) está en azulForm.ts.
 */
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { sendToAzul, type AzulForm } from '@mm/lib/data/business';

/** Lleva a pagar: el simulador de la demostración, el POST de la web (vista previa) o la página de Azul en la app. */
export function openAzul(form: AzulForm) {
  // La demostración (movil/src/platform/demoBackend.ts) devuelve la ruta de su simulador, como el modo local de la web.
  if (form.url.startsWith('/')) router.push({ pathname: '/dev/azul', params: form.fields });
  else if (Platform.OS === 'web') sendToAzul(form);
  else router.push({ pathname: '/empresa/azul', params: { form: JSON.stringify(form) } });
}

/**
 * A confirmar la vuelta (movil/src/app/empresa/pago.tsx). El query de Azul va entero en `q`: está firmado, y así llega
 * tal cual (sin que el router decida qué hacer con los `+` y los espacios).
 */
export function goToPaymentReturn(query: string) {
  router.replace({ pathname: '/empresa/pago', params: { q: query } });
}
