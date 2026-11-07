/**
 * La Tabla del boliche en Pro (RankingPage de la web en Pro): «‹ Liga» con «Excel» y compartir la imagen de la tabla,
 * «Tabla», «Temporada ▾» (con «Ver todas las temporadas…») y Scratch | Con hcp; la tabla completa con columnas que se
 * ordenan tocándolas (se desliza de lado), la fórmula del handicap, los récords y el más mejorado. Una temporada cerrada
 * muestra sus premios y, si la guardó, su tabla tal como quedó. Solo cuentan los juegos aprobados. La lógica es la de
 * la web (src/pages/rankingPro.ts, src/components/ranking/logic.ts, src/lib/bowlingSeason.ts). Va dentro de LeagueScope.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronDown, Medal } from 'lucide-react-native';
import { useEntriesOfEvents, useEvents, usePlayers } from '@mm/lib/data';
import { useLeagueSeasons } from '@mm/lib/data/seasons';
import { readBowlingSnapshot, seasonEvents } from '@mm/lib/bowlingSeason';
import { useLeagueCtx } from '@mm/lib/league';
import { pickSeason, previousSeason } from '@mm/lib/seasons';
import { hcpFormula, leagueHcp, seasonRecords, sortOf, standingsTable, withSnapshot, type SortKey } from '@mm/components/ranking/logic';
import { ALL_SEASONS, byMinimumOf, emptyRankingText, rankingShareCard, seasonPillOptions, seasonTables } from '@mm/pages/rankingPro';
import { ShareIconButton } from '@/components/swimming/ShareImage';
import { BackBar, Card, ChoiceRow, LoadError, Loading, RowIcon, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { LeagueExcelButton } from './LeagueExcel';
import { MostImprovedCard, SeasonAwardsCard, SeasonRecordsCard } from './SeasonExtras';
import { StandingsTable } from './StandingsTable';

/** Scratch | Con hcp, chico (cabe al lado de «Temporada ▾»). */
function HcpToggle({ withHcp, onChange }: { withHcp: boolean; onChange: (on: boolean) => void }) {
  const c = useColors();
  const options = [
    { key: 'scratch', label: 'Scratch', on: !withHcp },
    { key: 'hcp', label: 'Con hcp', on: withHcp },
  ];
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Cómo se cuentan los pinos" style={[styles.toggle, { backgroundColor: c.surface2 }]}>
      {options.map((o) => (
        <Pressable
          key={o.key}
          accessibilityRole="radio"
          accessibilityState={{ selected: o.on }}
          onPress={() => onChange(o.key === 'hcp')}
          style={[styles.toggleItem, o.on && { backgroundColor: c.segOn, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }]}
        >
          <Txt tone={o.on ? 'fg' : 'muted'} style={{ fontSize: 14, fontFamily: font.semibold }}>
            {o.label}
          </Txt>
        </Pressable>
      ))}
    </View>
  );
}

export function RankingPro({
  backLabel,
  backFallback,
  initialSeasonId,
  initialSort,
  initialHcp,
}: {
  backLabel: string;
  backFallback: string;
  initialSeasonId?: string | null;
  /** `?ver=` de la dirección: la columna ordenada. */
  initialSort?: string | null;
  /** `?hcp=1`: con handicap. */
  initialHcp?: boolean;
}) {
  const c = useColors();
  const { lid, myPlayerId, member, league } = useLeagueCtx();
  const events = useEvents(lid);
  const players = usePlayers(lid);
  const seasons = useLeagueSeasons(lid);
  const [seasonId, setSeasonId] = useState<string | null>(initialSeasonId ?? null);
  const [sort, setSort] = useState<SortKey>(sortOf(initialSort));
  const [withHcp, setWithHcp] = useState(!!initialHcp);
  const [picking, setPicking] = useState(false);
  const season = pickSeason(seasons.data, seasonId);
  const prev = previousSeason(seasons.data, season);

  // Sin temporadas (no se pudieron leer): toda la liga.
  const seasonIds = seasonEvents(events.data, season).map((e) => e.id);
  const prevIds = prev ? seasonEvents(events.data, prev).map((e) => e.id) : [];
  const entries = useEntriesOfEvents(lid, [...seasonIds, ...prevIds]);
  const { rows, improved, played } = seasonTables({ entries: entries.data, players: players.data, seasonIds, prevIds, hasPrev: !!prev });
  // El handicap de la tabla: el del último torneo con handicap de la temporada (o de la liga; o 80 % de 230).
  const hcp = leagueHcp(events.data, new Set(seasonIds));

  // Temporada cerrada con su tabla guardada: el promedio y el mejor juego se ven tal como quedaron al cerrarla.
  const closed = season?.status === 'closed';
  const snapshot = closed ? readBowlingSnapshot(season.standings) : null;
  const proRows = withSnapshot(rows, snapshot);
  const table = standingsTable(proRows, { sort, withHcp, hcp });

  const error = events.error ?? players.error ?? entries.error;
  const loading = events.loading || players.loading || (seasons.loading && !seasons.data.length) || (entries.loading && !entries.data.length);
  const seasonName = season?.name ?? 'la temporada';
  const byMinimum = byMinimumOf(true, sort, 'promedio');
  // La imagen va con el link de la tabla que se ve (temporada, columna y con o sin hcp).
  const query = [season && `temporada=${encodeURIComponent(season.id)}`, sort !== 'promedio' && `ver=${sort}`, withHcp && 'hcp=1'].filter(Boolean).join('&');

  return (
    <>
      <BackBar
        label={backLabel}
        fallback={backFallback}
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {!!member && events.data.length > 0 && <LeagueExcelButton season={season} events={events.data} players={players.data} />}
            {table.length > 0 && (
              <ShareIconButton
                label="Compartir la tabla"
                round
                path={`/l/${lid}/ranking${query ? `?${query}` : ''}`}
                card={() => rankingShareCard({ leagueName: league.name, season, sort, withHcp, hcp, table, played })}
              />
            )}
          </View>
        }
      />
      <View style={{ gap: 14 }}>
        <Txt accessibilityRole="header" style={{ fontSize: 28, lineHeight: 34, letterSpacing: -0.84, fontFamily: font.bold }}>
          Tabla
        </Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {season && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Temporada: ${season.name}`}
              onPress={() => setPicking(true)}
              style={({ pressed }) => [styles.pill, { backgroundColor: c.surface2, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
            >
              <Txt numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, fontFamily: font.semibold }}>
                {season.name}
              </Txt>
              <ChevronDown size={16} strokeWidth={2.25} color={c.fg} />
            </Pressable>
          )}
          <HcpToggle withHcp={withHcp} onChange={setWithHcp} />
        </View>

        <Sheet open={picking} onClose={() => setPicking(false)} title="Temporada">
          {seasonPillOptions(seasons.data).map((o) => (
            <ChoiceRow
              key={o.key}
              title={o.option}
              selected={o.key === season?.id}
              onPress={() => {
                setPicking(false);
                if (o.key === ALL_SEASONS) router.push({ pathname: '/l/[lid]/temporadas', params: { lid } });
                else setSeasonId(o.key);
              }}
            />
          ))}
        </Sheet>

        {closed && season && <SeasonAwardsCard season={season} />}

        {error ? (
          <LoadError error={error} />
        ) : loading ? (
          <Loading label="Cargando la tabla" />
        ) : (
          <>
            {table.length > 0 ? (
              <StandingsTable lid={lid} rows={table} sort={sort} onSort={setSort} me={myPlayerId} totalEvents={played} />
            ) : (
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <RowIcon>
                  <Medal size={20} color={c.accent} />
                </RowIcon>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="bodyStrong">Todavía no sale nadie</Txt>
                  <Txt variant="meta" tone="muted">
                    {emptyRankingText(byMinimum, seasonName)}
                  </Txt>
                </View>
              </Card>
            )}
            <Txt tone="muted" style={{ fontSize: 12.5, lineHeight: 17, marginHorizontal: 4, marginTop: -8 }}>
              {hcpFormula(hcp)}
            </Txt>
            <View style={{ marginTop: 10 }}>
              <SeasonRecordsCard records={seasonRecords(proRows, played, myPlayerId)} />
            </View>
            {sort === 'promedio' && season && prev && improved.length > 0 && (
              <View style={{ marginTop: 16 }}>
                <MostImprovedCard lid={lid} list={improved} season={season} previous={prev} myPlayerId={myPlayerId} />
              </View>
            )}
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, maxWidth: '100%', borderRadius: 18, paddingLeft: 13, paddingRight: 12 },
  toggle: { flexDirection: 'row', borderRadius: 12, padding: 3, gap: 2 },
  toggleItem: { height: 32, paddingHorizontal: 12, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
