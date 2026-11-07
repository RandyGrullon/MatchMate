/**
 * Yo › Pro (ProfilePage de la web en Pro, con su misma lógica: bowlingNumbers.ts, yoCharts.ts, yoTrend.ts y
 * balls/stats.ts): los 6 números, la tendencia por juego o por mes, tus tiros (y qué pinos te quedan), «Por bola», Dónde
 * juego y las filas (Por liga y temporada, Mis juegos, Anotar un juego suelto, Mis publicaciones, Mis equipos,
 * Insignias, Amigos y seguidores y Mis bolas si todavía no tienes). Lo pone Yo (`/yo`) en lugar de lo de Lite.
 */
import { View } from 'react-native';
import type { BowlingNumbersState } from '@mm/components/bowlingNumbers';
import type { PublicProfile } from '@mm/lib/data/follows';
import { BallStatsSection } from '@/components/balls/BallStats';
import { NumbersGrid, ShotsCard, TrendCard, type NumberItem } from '@/components/bowling/ProStats';
import { LoadError } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { NoBowlingNumbers } from './LiteNumbers';
import { PlayerPlaces } from './PlayerPlaces';
import { StatsTab } from './SportStats';
import { YoRows } from './YoRows';

/** Pro: los 6 números, la tendencia y tus tiros (o, sin juegos todavía, cómo empezar). */
export function ProNumbers({ state, today }: { state: BowlingNumbersState; today: string }) {
  const c = useColors();
  if (state.status === 'loading') return <View accessibilityLabel="Cargando tus números" style={{ height: 154, borderRadius: 24, backgroundColor: c.surface2 }} />;
  if (state.status === 'error') return <LoadError error={state.error} />;
  if (state.status === 'none') return <NoBowlingNumbers preparing={state.preparing} />;
  const n = state.data;
  const items: NumberItem[] = [
    { label: 'Promedio', value: n.all.autoAverage ?? '—', accent: true },
    { label: 'Mejor juego', value: n.all.high || '—' },
    { label: 'Mejor serie', value: n.all.highSeries || '—' },
    { label: 'Juegos', value: n.all.games },
    { label: 'Hcp', value: n.hcp ?? '—' },
    { label: 'Asistencia', value: n.held ? `${n.attended}/${n.held}` : '—' },
  ];
  return (
    <>
      <NumbersGrid items={items} />
      <TrendCard games={n.games} average={n.all.autoAverage} today={today} />
      <ShotsCard frames={n.frames} games={n.all.games} />
    </>
  );
}

/**
 * Lo de Yo debajo de tu nombre, en Pro: los números del boliche con «Por bola» (si los ve), «Dónde juego» (y, si no
 * juegas boliche, tu resumen de los otros deportes) y las filas.
 */
export function YoProBody({
  uid,
  profile,
  sports,
  state,
  showBowling,
  othersAlone,
  today,
}: {
  uid: string;
  profile: PublicProfile | null;
  sports: readonly string[];
  state: BowlingNumbersState;
  /** Ve los números del boliche (showsBowling de yoParts.ts). */
  showBowling: boolean;
  /** Tiene ligas de otros deportes y no ve el boliche: su resumen va debajo de «Dónde juego». */
  othersAlone: boolean;
  today: string;
}) {
  return (
    <>
      {showBowling && (
        <View style={{ gap: 14 }}>
          <ProNumbers state={state} today={today} />
          <BallStatsSection />
        </View>
      )}
      <View style={{ gap: 14 }}>
        <PlayerPlaces uid={uid} isMe />
        {othersAlone && <StatsTab userId={uid} skipBowling isMe />}
      </View>
      <YoRows uid={uid} profile={profile} showBowling={showBowling} sports={sports} pro />
    </>
  );
}
