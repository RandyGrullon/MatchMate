import { useState } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import type { Match, MatchSide } from '@mm/lib/data/matches';
import { racketResultParser } from '@mm/components/match/parsers';
import { engineRules } from '@mm/pages/sports/racket/court/adapters';
import { racketColumns } from '@mm/pages/sports/racket/view';
import type { StandingRow } from '@mm/sports/types';
import { MatchCard } from '@/components/match/MatchCard';
import { ResultSheet, Scoreboard } from '@/components/match/ResultParts';
import { StandingsTable } from '@/components/match/StandingsTable';
import { TwoHalves } from '@/components/court/CourtShell';
import { Button, Screen, SectionHeader } from '@/components/ui';

const side = (n: 1 | 2, label: string): MatchSide => ({ side: n, label, teamId: null, players: [] }) as unknown as MatchSide;
const MATCH = {
  id: 'prueba-partido',
  leagueId: 'prueba',
  eventId: null,
  round: 3,
  stage: '',
  bracketKey: null,
  court: 'Cancha 2',
  scheduledAt: null,
  status: 'confirmed',
  format: 'sets',
  requireConfirm: true,
  score: { text: '6-4 3-6 10-7', sets: [[6, 4], [3, 6], [10, 7]] },
  winner: 1,
  walkoverSide: null,
  seq: 1,
  version: 1,
  sides: [side(1, 'Ana / Luis'), side(2, 'Otra / Nuevo')],
} as unknown as Match;
const row = (id: string, rank: number, points: number, won: number, lost: number): StandingRow =>
  ({ id, rank, points, played: won + lost, won, drawn: 0, lost, for: 30, against: 20, diff: 10, extra: { setsDiff: 2 }, decidedBy: null }) as unknown as StandingRow;
const ROWS = [row('a', 1, 9, 3, 0), row('b', 2, 6, 2, 1), row('c', 3, 0, 0, 3)];
const NAMES: Record<string, string> = { a: 'Ana / Luis', b: 'Otra / Nuevo', c: 'Mía / Tuyo' };

/**
 * Solo en desarrollo: las piezas de raqueta sin cuenta ni liga (para probarlas en la vista previa web): la tarjeta y el
 * marcador de un partido, la tabla, «Solo el resultado» y las mitades del modo cancha. En la app publicada lleva a Hoy.
 */
export default function DevRacket() {
  const [entry, setEntry] = useState(false);
  const [score, setScore] = useState<[number, number]>([0, 0]);
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <Screen>
      <SectionHeader title="Tarjeta" />
      <MatchCard match={MATCH} mySide={1} roundWord="Jornada" />
      <SectionHeader title="Marcador" />
      <Scoreboard match={MATCH} mySide={1} rules="Al mejor de 3 sets · súper tie-break" />
      <SectionHeader title="Tabla" />
      <StandingsTable rows={ROWS} nameOf={(id) => NAMES[id] ?? id} columns={racketColumns('padel')} highlight={['a']} />
      <Button onPress={() => setEntry(true)}>Solo el resultado</Button>
      <SectionHeader title="Cancha" />
      <View style={{ height: 360 }}>
        <TwoHalves
          a={{ label: 'Ana / Luis', big: score[0], sub: 'Saca', onTap: () => setScore(([x, y]) => [x + 1, y]), ariaLabel: 'Punto para Ana / Luis' }}
          b={{ label: 'Otra / Nuevo', big: score[1], sub: ' ', onTap: () => setScore(([x, y]) => [x, y + 1]), ariaLabel: 'Punto para Otra / Nuevo' }}
        />
      </View>
      {entry && <ResultSheet open onClose={() => setEntry(false)} lid="prueba" match={{ ...MATCH, status: 'scheduled', score: null, winner: null }} parser={racketResultParser(engineRules('padel', {}))} hint="Set por set, separados por espacio. El súper tie-break va con sus puntos (10-7)." />}
    </Screen>
  );
}
