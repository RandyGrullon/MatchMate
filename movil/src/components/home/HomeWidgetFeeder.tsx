import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { useAuth } from '@mm/lib/auth';
import { useActivity, useMyLeagues } from '@mm/components/home/activity';
import { homeWidgetKey, homeWidgetTimeline, type HomeWidgetEntry } from '@mm/components/home/homeWidget';
import { appRoute } from '@/lib/links';
import type { HoyWidgetSurface } from '@/widgets/surface';

/**
 * Le manda al widget del iPhone (movil/src/widgets/hoyWidget.tsx) lo de Hoy de todas tus ligas, ya en texto
 * (src/components/home/homeWidget.ts). El widget no busca datos solo: se le manda al cambiar algo, cada 15 minutos
 * aunque nada cambie y al salir de la app. Sin cuenta (o al cerrar la sesión) le manda la portada: nada de la cuenta
 * anterior se queda en la pantalla de inicio. En Android, en la vista previa web y en Expo Go no hace nada: no hay
 * módulo nativo de expo-widgets (o, en Android, no hay widget).
 */

function load(): HoyWidgetSurface | null {
  if (Platform.OS !== 'ios') return null;
  try {
    if (!requireOptionalNativeModule('ExpoWidgets')) return null;
    // Tarde a propósito: importar expo-widgets sin su módulo nativo (Expo Go) rompe la app.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('@/widgets/surface') as typeof import('@/widgets/surface')).hoyWidgetSurface;
  } catch {
    return null;
  }
}

const surface = load();
/** Aunque nada cambie, cada tanto se manda otra vez (las medianoches de la línea de tiempo se corren). */
const REFRESH_MS = 15 * 60_000;

/** De una dirección de MatchMate (`/l/…/e/…`) al link que abre esa pantalla en la app (`matchmate://l/…`). */
function widgetLink(href: string): string {
  const route = appRoute(href) ?? href;
  return `matchmate://${route.replace(/^\//, '')}`;
}

export function HomeWidgetFeeder() {
  return surface ? <Feeder surface={surface} /> : null;
}

function Feeder({ surface }: { surface: HoyWidgetSurface }) {
  const auth = useAuth();
  const mine = useMyLeagues();
  const act = useActivity(mine.all, mine.uid);
  const signedIn = !!auth.user;
  // Se espera a tener lo de la cuenta: así no se manda «Nada programado» mientras carga.
  const ready = !auth.loading && (!signedIn || (!mine.loading && !act.loading));
  const nextEvent = act.next?.kind === 'event' ? act.next.event : null;
  const nextMatch = act.next?.kind === 'match' ? act.next.match : null;
  const entries = homeWidgetTimeline(
    {
      signedIn,
      today: act.today,
      // Las prácticas de anoche no: piden anotar, y si ya se anotó lo sabe la app (useNextGame).
      games: act.games.filter((g) => !g.late),
      liveItems: act.liveItems,
      nextMatch,
      nextEvent,
      upcoming: act.upcoming,
      showLeague: mine.all.length > 1,
      link: widgetLink,
    },
    act.now,
  );
  const key = homeWidgetKey(entries);
  const latest = useRef<HomeWidgetEntry[] | null>(null);
  const sent = useRef({ key: '', at: 0 });

  useEffect(() => {
    if (!ready) return;
    latest.current = entries;
    const now = Date.now();
    if (key === sent.current.key && now - sent.current.at < REFRESH_MS) return;
    sent.current = { key, at: now };
    try {
      surface.update(entries);
    } catch {
      // El widget nunca tumba la app.
    }
  }, [entries, key, ready, surface]);

  // Al salir de la app, lo último (con las horas al día).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'background' || !latest.current) return;
      try {
        surface.update(latest.current);
        sent.current = { key: homeWidgetKey(latest.current), at: Date.now() };
      } catch {
        // El widget nunca tumba la app.
      }
    });
    return () => sub.remove();
  }, [surface]);

  return null;
}
