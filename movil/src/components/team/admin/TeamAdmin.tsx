/**
 * Organizar › Equipos de baloncesto, fútbol y sala en la app (BasketballAdmin.tsx y FootballAdmin.tsx de la web): un
 * segmentado Equipos · Partidos · Reglas (· Comité en fútbol y sala) en la dirección (`?parte=`, para que no se pierda
 * al volver de un partido); los equipos y sus plantillas, armar el calendario, el torneo relámpago (fútbol y sala) o un
 * partido suelto con el anotador de mesa de cada partido, las reglas (una plantilla de un toque o a mano) y las
 * sanciones del comité.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CalendarPlus, Plus, Trophy } from 'lucide-react-native';
import { useNow } from '@mm/lib/useNow';
import { teamPositions } from '@mm/components/players/logic';
import { basketballConfigFrom } from '@mm/pages/sports/basketball/rules';
import { footballConfigFrom, knockoutRules, matchMinutes, templateOf, variantOf } from '@mm/pages/sports/football/rules';
import { groupRanking, useFootballSeason } from '@mm/pages/sports/football/season';
import { useTeamLeague, type TeamLeague } from '@mm/pages/sports/team/useTeamLeague';
import { leagueSport } from '@mm/sports/registry';
import { SectionHeader, Segmented, Txt } from '@/components/ui';
import { CommitteeAdmin } from './Committee';
import { OfficialsList } from './Officials';
import { AdminActions } from './parts';
import { BasketballRules, FootballRules } from './Rules';
import { ScheduleBuilderSheet, SingleMatchSheet } from './ScheduleBuilder';
import { TeamsManager } from './TeamsManager';
import { TournamentAdvance, TournamentBuilderSheet } from './TournamentBuilder';

type Part = 'equipos' | 'partidos' | 'reglas' | 'comite';
const BASKETBALL_PARTS: { key: Part; label: string }[] = [
  { key: 'equipos', label: 'Equipos' },
  { key: 'partidos', label: 'Partidos' },
  { key: 'reglas', label: 'Reglas' },
];
const FOOTBALL_PARTS: { key: Part; label: string }[] = [...BASKETBALL_PARTS, { key: 'comite', label: 'Comité' }];

/** La parte que se ve (`?parte=`); la primera si no dice o no existe. */
function useAdminPart(keys: readonly Part[]): [Part, (k: Part) => void] {
  const { parte } = useLocalSearchParams<{ parte?: string }>();
  const part = parte && (keys as readonly string[]).includes(parte) ? (parte as Part) : keys[0];
  return [part, (k) => router.setParams({ parte: k })];
}

/** Organizar › Equipos (la pantalla propia de los deportes de equipo). */
export function TeamAdmin() {
  const tl = useTeamLeague();
  const basketball = leagueSport(tl.league) === 'basketball';
  const parts = basketball ? BASKETBALL_PARTS : FOOTBALL_PARTS;
  const [part, setPart] = useAdminPart(parts.map((p) => p.key));
  const positions = teamPositions(leagueSport(tl.league));
  return (
    <View style={{ gap: 26 }}>
      <Segmented<Part> label="Qué organizar" options={parts} value={part} onChange={setPart} />
      {part === 'equipos' && <TeamsManager tl={tl} positions={positions} />}
      {part === 'partidos' && (basketball ? <BasketballCalendar tl={tl} /> : <FootballCalendar tl={tl} />)}
      {part === 'reglas' && (basketball ? <BasketballRules tl={tl} /> : <FootballRules tl={tl} />)}
      {part === 'comite' && !basketball && <CommitteeAdmin tl={tl} />}
    </View>
  );
}

const FEW_TEAMS = 'Hacen falta 2 equipos o más.';

/** «Anotador de mesa» con su línea y los partidos por jugar. */
function OfficialsSection({ tl }: { tl: TeamLeague }) {
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title="Anotador de mesa" />
      <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4, marginTop: -6 }}>
        Si termina el partido quien está designado, el resultado queda final.
      </Txt>
      <OfficialsList tl={tl} />
    </View>
  );
}

/** Partidos del baloncesto: armar el calendario o un partido suelto, y el anotador de mesa de cada uno. */
function BasketballCalendar({ tl }: { tl: TeamLeague }) {
  const [building, setBuilding] = useState(false);
  const [single, setSingle] = useState(false);
  const config = basketballConfigFrom(tl.rules.data);
  const format = config.variant === '3x3' ? '3x3' : 'fiba';
  const few = tl.teams.data.length < 2;
  return (
    <View style={{ gap: 30 }}>
      <AdminActions
        hint={few ? FEW_TEAMS : undefined}
        actions={[
          { key: 'calendario', icon: CalendarPlus, title: 'Armar calendario', subtitle: 'Todos contra todos, con horas y canchas', onPress: () => setBuilding(true), disabled: few },
          { key: 'suelto', icon: Plus, title: 'Partido suelto', subtitle: 'Un amistoso, una final o uno aplazado', onPress: () => setSingle(true), disabled: few },
        ]}
      />
      <OfficialsSection tl={tl} />
      <ScheduleBuilderSheet tl={tl} open={building} onClose={() => setBuilding(false)} format={format} />
      <SingleMatchSheet tl={tl} open={single} onClose={() => setSingle(false)} format={format} />
    </View>
  );
}

/** Partidos del fútbol y la sala: el calendario de la liga, el torneo relámpago o un partido suelto; pasar a la fase final y el anotador de mesa. */
function FootballCalendar({ tl }: { tl: TeamLeague }) {
  const now = useNow(30_000).getTime();
  const [building, setBuilding] = useState<'liga' | 'relampago' | null>(null);
  const [single, setSingle] = useState(false);
  const season = useFootballSeason(tl);
  const variant = variantOf(tl.league.sport);
  const config = footballConfigFrom(tl.rules.data, variant);
  const template = templateOf(tl.rules.data, variant);
  const few = tl.teams.data.length < 2;
  return (
    <View style={{ gap: 30 }}>
      <AdminActions
        hint={few ? FEW_TEAMS : undefined}
        actions={[
          { key: 'calendario', icon: CalendarPlus, title: 'Armar calendario (liga)', subtitle: 'Todos contra todos, con horas y canchas', onPress: () => setBuilding('liga'), disabled: few },
          { key: 'relampago', icon: Trophy, title: 'Torneo relámpago', subtitle: 'Grupos y la final, en un día', onPress: () => setBuilding('relampago'), disabled: few },
          { key: 'suelto', icon: Plus, title: 'Partido suelto', subtitle: 'Un amistoso, una final o uno aplazado', onPress: () => setSingle(true), disabled: few },
        ]}
      />
      <TournamentAdvance tl={tl} rankGroup={(stage) => groupRanking(season, tl.matches.data, stage, now)} />
      <OfficialsSection tl={tl} />
      <ScheduleBuilderSheet
        tl={tl}
        open={building === 'liga'}
        onClose={() => setBuilding(null)}
        format={variant}
        minutes={matchMinutes(config)}
        defaultDouble={template?.double ?? variant === 'football'}
      />
      <TournamentBuilderSheet
        tl={tl}
        open={building === 'relampago'}
        onClose={() => setBuilding(null)}
        format={variant}
        slotMinutes={matchMinutes(config) - 5}
        knockoutRules={knockoutRules(tl.rules.data, variant)}
      />
      <SingleMatchSheet tl={tl} open={single} onClose={() => setSingle(false)} format={variant} minutes={matchMinutes(config)} />
    </View>
  );
}
