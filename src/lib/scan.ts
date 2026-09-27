import { initializeApp } from 'firebase/app';
import { AIError, getAI, getGenerativeModel, GoogleAIBackend, Schema, type AI, type GenerativeModel } from 'firebase/ai';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { firebaseConfig } from './firebase';
import { parseScanResult, ScanError, type ScanErrorKind, type ScanRow } from './scan-result';

export { ScanError, type ScanRow };

/**
 * Modelos en orden de preferencia. La capa gratuita de cada uno tiene su propio cupo por minuto/día:
 * si el primero se queda sin cupo (429) se intenta con el siguiente. Flash-Lite leyó bien las 32 fotos
 * de prueba con juegos (2,4 s de media) y tiene más cupo gratis que Flash.
 */
const MODELS = [import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.5-flash-lite', 'gemini-3.8-flash'].filter(
  (m, i, all) => all.indexOf(m) === i,
);

const schema = Schema.object({
  properties: {
    esPantallaDeBoliche: Schema.boolean({
      description: 'true si la foto muestra resultados o marcador de boliche',
    }),
    soloTotales: Schema.boolean({
      description: 'true si la pantalla solo muestra totales o promedios por jugador, sin los juegos uno por uno',
    }),
    jugadores: Schema.array({
      items: Schema.object({
        properties: {
          nombre: Schema.string({ description: 'Nombre del jugador tal como aparece' }),
          handicap: Schema.integer({ nullable: true, description: 'Handicap mostrado, o null' }),
          juegos: Schema.array({
            items: Schema.integer(),
            description: 'Pinos scratch de cada juego en su posición (Game 1, Game 2...); 0 si no lo jugó',
          }),
          total: Schema.integer({ nullable: true, description: 'Total scratch que muestra la pantalla, o null' }),
        },
      }),
    }),
  },
});

const PROMPT = `Esta foto es de la pantalla de una bolera (boliche / bowling). Puede estar en español o en inglés,
tomada en ángulo, con reflejos o con varios jugadores.

Extrae, para cada jugador que aparezca:
- nombre: exactamente como se ve en pantalla.
- handicap: el handicap que muestre la pantalla (columna "Handicap"/"Hdcp"), o null si no aparece.
- juegos: la puntuación SCRATCH (sin handicap) de cada juego, uno por columna y en su posición: Game 1, Game 2,
  Game 3... En pantallas en español es la fila "Puntuación real". Si un juego aparece en 0 o vacío, pon 0 en esa
  posición (no lo saltes). NO incluyas totales, series, promedios ni la suma con handicap.
  Si es un marcador cuadro por cuadro (frames) de un juego terminado, devuelve solo el total final de ese juego.
- total: el total scratch del jugador que muestre la pantalla ("Scratch", "Total", "Puntuación real"), o null.

Si la pantalla muestra un solo jugador a la vez (por ejemplo una pestaña de "Estadísticas"), devuelve solo ese jugador.
Si la pantalla solo tiene totales o promedios (por ejemplo "Statistics": Games, Total score, Average) sin los juegos
uno por uno, pon soloTotales=true, juegos vacío y el total de cada jugador.
Solo incluye números que se lean con claridad. Cada juego vale entre 0 y 300.
Si la foto no es de una pantalla de resultados de boliche, devuelve esPantallaDeBoliche=false y jugadores vacío.`;

let ai: AI | null = null;
const models = new Map<string, GenerativeModel>();

/**
 * AI Logic exige App Check. Va en una instancia aparte de Firebase que se crea al primer escaneo:
 * así Auth y Firestore no esperan el token de App Check ni cargan reCAPTCHA en cada página.
 */
function getModel(name: string) {
  ai ??= createAI();
  if (!models.has(name)) {
    models.set(
      name,
      getGenerativeModel(ai, {
        model: name,
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0 },
      }),
    );
  }
  return models.get(name)!;
}

function createAI() {
  const aiApp = initializeApp(firebaseConfig, 'ai');
  // El token de depuración solo existe en `pnpm dev`: en el build de producción Vite elimina esta rama,
  // así nunca queda publicado aunque la variable esté definida en Vercel.
  const debugToken = import.meta.env.DEV && location.hostname === 'localhost' ? import.meta.env.VITE_APPCHECK_DEBUG_TOKEN : undefined;
  if (debugToken) {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  }
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
  const appCheck = Boolean(siteKey || debugToken);
  if (appCheck) {
    initializeAppCheck(aiApp, {
      provider: new ReCaptchaEnterpriseProvider(siteKey || 'debug'),
      isTokenAutoRefreshEnabled: false,
    });
  }
  return getAI(aiApp, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: appCheck });
}

/** Lee los pinos de una foto (data URL JPEG) con Gemini vía Firebase AI Logic. */
export async function scanScoreboard(dataUrl: string, modelNames: string[] = MODELS): Promise<ScanRow[]> {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  let text = '';
  for (let i = 0; i < modelNames.length; i++) {
    try {
      const result = await getModel(modelNames[i]).generateContent([
        PROMPT,
        { inlineData: { mimeType: 'image/jpeg', data: base64 } },
      ]);
      text = result.response.text();
      break;
    } catch (e) {
      console.warn(`[escaneo] ${modelNames[i]}`, e);
      if (statusOf(e) === 429 && i < modelNames.length - 1) continue;
      const { message, kind } = explain(e);
      throw new ScanError(message, kind);
    }
  }
  return parseScanResult(text);
}

function statusOf(e: unknown): number | undefined {
  return e instanceof AIError ? e.customErrorData?.status : undefined;
}

function explain(e: unknown): { message: string; kind: ScanErrorKind } {
  const msg = e instanceof Error ? e.message : String(e);
  const status = statusOf(e);
  if ((e instanceof AIError && e.code === 'api-not-enabled') || /has not been used|SERVICE_DISABLED/i.test(msg)) {
    return { message: 'El escaneo con IA no está activado en Firebase (AI Logic).', kind: 'config' };
  }
  if (status === 429 || /quota|resource.?exhausted/i.test(msg)) {
    return { message: 'Se alcanzó el límite gratuito del escaneo por ahora. Intenta en un minuto.', kind: 'cupo' };
  }
  if (/app.?check|attestation/i.test(msg) || status === 401 || status === 403) {
    return { message: 'El escaneo fue bloqueado por App Check. Revisa la configuración de App Check en Firebase.', kind: 'config' };
  }
  // La IA respondió pero no quiso o no pudo leerla (bloqueo o respuesta cortada): reintentar da lo mismo.
  if (e instanceof AIError && e.code === 'response-error') {
    return { message: 'La IA no pudo leer esta foto. Prueba con otra foto.', kind: 'foto' };
  }
  if (status == null && !navigator.onLine) return { message: 'Sin conexión para escanear la foto.', kind: 'red' };
  // Sin respuesta (la señal se cayó a medias) o el servidor falló: vale la pena reintentar.
  return { message: 'No se pudo escanear la foto.', kind: status == null || status >= 500 ? 'red' : 'config' };
}
