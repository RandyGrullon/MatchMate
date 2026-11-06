import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Award, ChevronDown, ChevronUp, History, ListOrdered, Settings2, Trophy } from 'lucide-react-native';
import { useLeagueChampions, useLeagueSeasons } from '@mm/lib/data/seasons';
import { useLeagueCtx } from '@mm/lib/league';
import type { Season } from '@mm/lib/seasons';
import { AWARD_LABEL, parseSnapshot, seasonDates } from '@mm/components/season/logic';
import { SnapshotTables } from '@/components/seasonAdmin/SnapshotTables';
import { Badge, Card, Empty, LoadError, Loading, SectionHeader, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** El parámetro de la temporada en la Tabla (SEASON_PARAM de la web). */
const SEASON_PARAM = 'temporada';
/** Cuántas temporadas salen en el inicio (las demás, en /temporadas). */
const SHOWN = 3;

const openSeasons = (lid: string) => router.push({ pathname: '/l/[lid]/temporadas', params: { lid } });

/**
 * «Campeones» en el inicio de la liga (ChampionsSection de la web, todos los deportes): el campeón de cada temporada
 * cerrada, la más nueva primero, con «Temporadas». Sin temporadas cerradas no sale.
 */
export function ChampionsSection() {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const champions = useLeagueChampions(league.kind === 'torneo' ? null : lid);
  const list = champions.data;
  if (!list.length) return null;
  return (
    <View style={{ gap: 8 }}>
      <SectionHeader
        title="Campeones"
        action={
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => openSeasons(lid)}>
            <Txt tone="accent" variant="bodyStrong">
              Temporadas
            </Txt>
          </Pressable>
        }
      />
      <Card padded={false} style={{ overflow: 'hidden' }}>
        {list.slice(0, SHOWN).map((ch, i) => (
          <Pressable
            key={ch.seasonId}
            accessibilityRole="button"
            onPress={() => openSeasons(lid)}
            style={[styles.row, i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null]}
          >
            <Trophy size={20} color={ch.champion ? c.gold : c.muted} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="bodyStrong" numberOfLines={1}>
                {ch.champion ? ch.champion.name : 'Sin campeón anotado'}
              </Txt>
              <Txt tone="muted" numberOfLines={1} style={{ fontSize: 12 }}>
                {`${ch.name} · ${seasonDates(ch)}`}
              </Txt>
            </View>
          </Pressable>
        ))}
      </Card>
    </View>
  );
}

/**
 * Historial de temporadas de la liga (SeasonsPage de la web, `/l/<liga>/temporadas`): cada temporada con sus fechas,
 * el campeón y los demás premios, el campeón del playoff y la tabla que se guardó al cerrarla. La en curso lleva a su
 * tabla.
 */
export function SeasonsList() {
  const c = useColors();
  const { lid, isAdmin, league } = useLeagueCtx();
  const seasons = useLeagueSeasons(lid);
  const standalone = league.kind === 'torneo';
  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <History size={22} color={c.accent} />
          <Txt variant="title">Temporadas</Txt>
        </View>
        <Txt tone="muted" style={{ fontSize: 14 }}>{`Los campeones y las tablas de cada temporada de ${league.name}.`}</Txt>
      </View>
      {seasons.error && !seasons.data.length ? (
        <LoadError error={seasons.error} />
      ) : seasons.loading && !seasons.data.length ? (
        <Loading label="Cargando las temporadas" />
      ) : !seasons.data.length ? (
        <Empty icon={<History size={28} color={c.accent} />} title="Todavía no hay temporadas" text="Cuando la liga cierre su primera temporada, su campeón sale aquí." />
      ) : (
        <View style={{ gap: 12 }}>
          {seasons.data.map((s) => (
            <SeasonCard key={s.id} season={s} lid={lid} standalone={standalone} />
          ))}
        </View>
      )}
      {isAdmin && !standalone && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/l/[lid]/temporada', params: { lid } })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' }}
        >
          <Settings2 size={16} color={c.accent} />
          <Txt tone="accent" style={{ fontSize: 14, fontFamily: font.medium }}>
            Cerrar o empezar temporada
          </Txt>
        </Pressable>
      )}
    </View>
  );
}

function SeasonCard({ season: s, lid, standalone }: { season: Season; lid: string; standalone: boolean }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const snapshot = useMemo(() => (s.status === 'closed' ? parseSnapshot(s.standings) : null), [s.status, s.standings]);
  const champion = s.awards.find((a) => a.kind === 'campeon');
  const rest = s.awards.filter((a) => a !== champion);
  const playoff = s.playoffs.find((p) => p.champion);
  const link = (label: string, onPress: () => void, icon: ReactNode) => (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}>
      {icon}
      <Txt tone="accent" style={{ fontSize: 14, fontFamily: font.medium }}>
        {label}
      </Txt>
    </Pressable>
  );
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: champion ? c.accentSoft : c.surface2 }}>
          <Trophy size={20} color={champion ? c.accent : c.muted} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <Txt variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
              {s.name}
            </Txt>
            <Badge tone={s.status === 'active' ? 'accent' : 'muted'}>{s.status === 'active' ? 'En curso' : 'Cerrada'}</Badge>
          </View>
          <Txt tone="muted" style={{ fontSize: 12 }}>
            {seasonDates(s)}
          </Txt>
          {champion ? (
            <Txt numberOfLines={1} style={{ fontSize: 14, marginTop: 4 }}>
              <Txt tone="muted" style={{ fontSize: 14 }}>{`${champion.label}: `}</Txt>
              <Txt style={{ fontSize: 14, fontFamily: font.bold }}>{champion.name}</Txt>
            </Txt>
          ) : (
            s.status === 'closed' && (
              <Txt tone="muted" style={{ fontSize: 14, marginTop: 4 }}>
                Sin campeón anotado.
              </Txt>
            )
          )}
        </View>
      </View>
      {rest.length > 0 && (
        <View style={{ gap: 6 }}>
          {rest.map((a) => (
            <View key={a.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Award size={16} color={c.muted} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt style={{ fontSize: 14 }}>
                  <Txt tone="muted" style={{ fontSize: 14 }}>{`${a.kind === 'otro' ? a.label : a.label || AWARD_LABEL[a.kind]}: `}</Txt>
                  <Txt style={{ fontSize: 14, fontFamily: font.medium }}>{a.name}</Txt>
                </Txt>
                {!!a.note && (
                  <Txt tone="muted" style={{ fontSize: 12 }}>
                    {a.note}
                  </Txt>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
      {playoff?.champion && (!champion || champion.teamId !== playoff.champion.teamId) && (
        <Txt tone="muted" style={{ fontSize: 14 }}>
          {`${playoff.name}: ganó `}
          <Txt style={{ fontSize: 14, fontFamily: font.bold }}>{playoff.champion.name}</Txt>
          {`${playoff.runnerUp ? ` a ${playoff.runnerUp.name}` : ''}.`}
        </Txt>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16 }}>
        {snapshot &&
          link(open ? 'Esconder la tabla' : 'Ver la tabla final', () => setOpen((o) => !o), open ? <ChevronUp size={16} color={c.accent} /> : <ChevronDown size={16} color={c.accent} />)}
        {!standalone &&
          (s.status === 'active' || !snapshot) &&
          link(
            s.status === 'active' ? 'Ver cómo va la tabla' : 'Ver la tabla',
            () => router.push({ pathname: '/l/[lid]/tabla', params: s.status === 'active' ? { lid } : { lid, [SEASON_PARAM]: s.id } }),
            <ListOrdered size={16} color={c.accent} />,
          )}
      </View>
      {open && snapshot && <SnapshotTables snapshot={snapshot} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 16, paddingVertical: 10 },
});
