/**
 * Por dónde se llega a Equipos, como en la web: en Ligas (LeaguesPage: «Tus equipos» con «Ver todos» y hasta 3 de tus
 * equipos en su color, o la fila «Equipos» si no tienes ninguno; la parte de la web es `squadsSectionMode`) y en Yo
 * («Mis equipos» con `myTeamsLine`: los tuyos y los de esports). Las dos llevan a `/equipos`.
 */
import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { ChevronRight, Shield } from 'lucide-react-native';
import { useMyEsportsTeams } from '@mm/lib/data/esports';
import { useMySquads, type MySquad } from '@mm/lib/data/squads';
import { mySquadLine, myTeamsLine, squadTitle, squadsSectionMode } from '@mm/components/squads/logic';
import { Card, ListRow, RowIcon, SectionHeader, Txt } from '../ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { openSquad, SquadLogo, useSquadColors } from './bits';

const toSquads = () => router.push('/equipos' as Href);

/** Ligas › los equipos (sin filtro de deporte, como Ligas de la app). Sin cuenta: la fila «Equipos». */
export function SquadsLeaguesSection({ sport = null }: { sport?: string | null }) {
  const c = useColors();
  const squads = useMySquads();
  const list = sport ? squads.data.filter((s) => s.sport === sport) : squads.data;
  const mode = squadsSectionMode({ inSport: list.length, total: squads.data.length, loading: squads.loading, sport });
  if (mode === 'list') {
    return (
      <View style={{ gap: 10 }}>
        <SectionHeader
          title="Tus equipos"
          action={
            <Pressable accessibilityRole="link" onPress={toSquads} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }}>
                Ver todos
              </Txt>
            </Pressable>
          }
        />
        <View style={{ gap: 10 }}>
          {list.slice(0, 3).map((s) => (
            <SquadCard key={s.id} squad={s} />
          ))}
        </View>
      </View>
    );
  }
  if (mode === 'row') {
    return (
      <Card padded={false}>
        <ListRow
          icon={
            <RowIcon>
              <Shield size={20} color={c.accent} />
            </RowIcon>
          }
          title="Equipos"
          subtitle="Crea tu equipo competitivo, con o sin liga"
          onPress={toSquads}
        />
      </Card>
    );
  }
  return null;
}

/** Uno de mis equipos en su color (o el de su deporte): logo, «Nombre [TAG]» y «Fútbol · 12 miembros · Capitán». */
function SquadCard({ squad }: { squad: MySquad }) {
  const tint = useSquadColors(squad.color, squad.sport);
  const line = mySquadLine(squad);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${squadTitle(squad)}. ${line}`}
      onPress={() => openSquad(squad.id)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 12, paddingRight: 14, backgroundColor: tint.accentSoft, opacity: pressed ? 0.85 : 1 })}
    >
      <SquadLogo squad={squad} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyStrong" numberOfLines={1}>
          {squadTitle(squad)}
        </Txt>
        <Txt variant="meta" tone="fg2" numberOfLines={1}>
          {line}
        </Txt>
      </View>
      <ChevronRight size={20} color={tint.accent} />
    </Pressable>
  );
}

/** Yo › «Mis equipos» (los de fuera de una liga y los de esports): a /equipos. */
export function MySquadsRow({ uid }: { uid: string }) {
  const c = useColors();
  const squads = useMySquads();
  const esports = useMyEsportsTeams(uid);
  const names = [...squads.data.map((s) => s.name), ...esports.data.map((t) => t.name)];
  return (
    <Card padded={false}>
      <ListRow
        icon={
          <RowIcon>
            <Shield size={20} color={c.accent} />
          </RowIcon>
        }
        title="Mis equipos"
        subtitle={myTeamsLine(names)}
        onPress={toSquads}
      />
    </Card>
  );
}
