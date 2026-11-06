import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight, Medal } from 'lucide-react-native';
import { useSwimSeason } from '@mm/lib/data/swimming';
import { useLeagueSeasons } from '@mm/lib/data/seasons';
import { currentSeason, inSeason } from '@mm/lib/seasons';
import { useNow } from '@mm/lib/useNow';
import { clubsOfMeet, pointsText, seasonTable, seasonYears } from '@mm/pages/sports/swimming/logic';
import { clubMap, meetTitle, useSwim } from '@mm/pages/sports/swimming/swim';
import { DateBlock } from '@/components/DateBlock';
import { Badge, Empty, LoadError, Loading, SectionHeader, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { ClubPointsCard, ClubTag, Lines, PillPicker, ShowMore, openMeet } from './parts';

/**
 * Puntos por club de la temporada (StandingsPage de la web, Lite): la temporada de ahora (sin temporadas, por año con
 * «2026 ▾»), los clubes por puntos con sus medallas y lo que sumó cada encuentro (el control de marcas no cuenta). La
 * misma lógica de la web (seasonTable). Otras temporadas, las cerradas y compartir la imagen, en la web.
 */
export function SwimStandings() {
  const c = useColors();
  const { lid, clubs } = useSwim();
  const season = useSwimSeason(lid);
  const seasons = useLeagueSeasons(lid);
  // Como la web sin ?temporada=: la temporada de ahora.
  const sel = currentSeason(seasons.data);
  const years = useMemo(() => seasonYears(season.data), [season.data]);
  const [year, setYear] = useState<string | null>(null);
  const thisYear = String(useNow().getFullYear());
  const shownYear = sel ? sel.name : (year ?? years[0] ?? thisYear);
  const table = useMemo(() => (sel ? seasonTable(season.data, undefined, (d) => inSeason(sel, d)) : seasonTable(season.data, shownYear)), [season.data, sel, shownYear]);
  const byId = useMemo(() => clubMap(clubs.data), [clubs.data]);

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 6 }}>
        <Txt variant="title" accessibilityRole="header">
          Puntos
        </Txt>
        <Txt variant="meta" tone="muted">
          Lo que suma cada club en los encuentros de la temporada
        </Txt>
      </View>
      {!sel && years.length > 1 && <PillPicker label="Temporada" options={years.map((y) => ({ key: y, label: y }))} value={shownYear} onChange={setYear} />}

      <View style={{ marginTop: 8 }}>
        {season.error ? (
          <LoadError error={season.error} />
        ) : season.loading && !season.data.meets.length ? (
          <Loading label="Cargando los puntos" />
        ) : !table.clubs.length ? (
          <Empty
            icon={<Medal size={28} color={c.accent} />}
            title="Todavía no hay puntos"
            text={`Salen de los resultados de los encuentros de ${sel ? shownYear : `la temporada ${shownYear}`}. Los nadadores tienen que tener club.`}
          />
        ) : (
          <View style={{ gap: 30 }}>
            <ClubPointsCard rows={table.clubs} clubs={byId} title="Clubes" />
            <View style={{ gap: 10 }}>
              <SectionHeader title="Por encuentro" />
              <ShowMore
                items={table.meets}
                max={3}
                noun="encuentros"
                render={(shown) => (
                  <Lines>
                    {shown.map((m) => (
                      <Pressable
                        key={m.id}
                        accessibilityRole="button"
                        accessibilityLabel={meetTitle(m)}
                        onPress={() => openMeet(lid, m.id, 'puntos')}
                        style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surface2 : 'transparent' }]}
                      >
                        <DateBlock date={m.date} />
                        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Txt variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                              {meetTitle(m)}
                            </Txt>
                            {!m.finalizedAt && <Badge tone="warn">Provisional</Badge>}
                          </View>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 2 }}>
                            {clubsOfMeet(table.clubs, m.id).map((x) => (
                              <View key={x.clubId} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <ClubTag club={byId.get(x.clubId)} short />
                                <Txt style={{ fontSize: 12, fontFamily: font.semibold, fontVariant: ['tabular-nums'] }}>{pointsText(x.byMeet[m.id])}</Txt>
                              </View>
                            ))}
                          </View>
                        </View>
                        <ChevronRight size={18} color={c.faint} />
                      </Pressable>
                    ))}
                  </Lines>
                )}
              />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 10 },
});
