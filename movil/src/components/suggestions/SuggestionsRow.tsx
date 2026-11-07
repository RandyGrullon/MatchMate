import { View } from 'react-native';
import { router } from 'expo-router';
import { Inbox } from 'lucide-react-native';
import { useSuggestions } from '@mm/lib/data';
import { countLabel } from '@mm/lib/organize';
import type { League } from '@mm/lib/types';
import { leagueRows, toDoItems } from '@mm/components/organizer/hubLogic';
import { leaguePhotos } from '@mm/components/league/settings';
import { ListRow, RowIcon, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * La fila del buzón en Organizar (las mismas filas de la web, hubLogic.ts): con notas sin leer, la de «Por hacer»
 * («Buzón» con la más nueva entre comillas y cuántas, en el globo); si no, la de «La liga» («Las notas que dejan los
 * jugadores»). Abre Organizar › Buzón en la app. Para quien organiza la liga.
 */
export function SuggestionsRow({ lid, league }: { lid: string; league: League }) {
  const c = useColors();
  const suggestions = useSuggestions(lid);
  const unread = suggestions.data.filter((s) => !s.read);
  const todo = toDoItems({ lid, kind: league.kind, pending: null, submissions: null, claims: null, suggestions: unread, reports: 0, reviews: 0, teams: [] }).find((t) => t.kind === 'buzon');
  const row =
    todo ??
    leagueRows({
      kind: league.kind,
      photos: leaguePhotos(league),
      players: null,
      accounts: null,
      members: null,
      own: [],
      playersMerged: false,
      buzonInToDo: false,
      reportsTab: false,
    }).find((r) => r.kind === 'buzon');
  if (!row) return null;
  const count = todo?.count ?? 0;
  return (
    <ListRow
      icon={
        <RowIcon>
          <Inbox size={20} color={c.accent} />
        </RowIcon>
      }
      title={row.title}
      subtitle={row.subtitle ?? null}
      accessibilityLabel={count ? `${row.title}: ${count} ${count === 1 ? 'pendiente' : 'pendientes'}. ${row.subtitle ?? ''}` : undefined}
      right={
        count ? (
          <View style={{ minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent }}>
            <Txt style={{ color: c.accentFg, fontFamily: font.bold, fontSize: 13 }}>{countLabel(count)}</Txt>
          </View>
        ) : undefined
      }
      onPress={() => router.push({ pathname: '/l/[lid]/buzon' as never, params: { lid } } as never)}
    />
  );
}
