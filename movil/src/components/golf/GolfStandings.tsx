import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Award, ChevronDown, History, ListOrdered, Medal, Trophy } from 'lucide-react-native';
import { useGolfTournaments } from '@mm/lib/data/golf';
import { useLeagueSeasons } from '@mm/lib/data/seasons';
import { eventLabel, formatDate } from '@mm/lib/format';
import { useLeagueCtx } from '@mm/lib/league';
import { pickSeason, type Season, type SeasonAward } from '@mm/lib/seasons';
import { parseSnapshot, seasonDates } from '@mm/components/season/logic';
import { meritPlace } from '@mm/pages/sports/golf/home';
import { useGolfMerit } from '@mm/pages/sports/golf/seasonTable';
import { SnapshotTables } from '@/components/seasonAdmin/SnapshotTables';
import { Button, Card, ChoiceRow, Empty, ListRow, LoadError, Loading, SectionHeader, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { openGolfer, openRound } from './parts';

/** Rondas que cuentan que se ven antes de «Ver las N» (ShowMore de la web). */
const SHOWN = 3;

/** La temporada cerrada tiene una tabla guardada que mostrar (hasSavedTable de la web). */
const hasSavedTable = (s: Pick<Season, 'status' | 'standings'> | null | undefined) => !!s && s.status === 'closed' && parseSnapshot(s.standings) != null;

/**
 * Orden de mérito de la temporada (GolfStandings de la web, Lite): puntos por puesto en cada ronda cerrada, la temporada
 * (`?temporada=`: la activa con las rondas de sus fechas; una cerrada muestra sus premios y la tabla que se guardó al
 * cerrarla), tu lugar («Vas 3.º de 6, con 41 pts…») y la lista con «Tú» (tocar a uno abre su página de golf), y las
 * rondas que cuentan con quién ganó cada una. La misma lógica de la web (useGolfMerit). La tabla de Pro y la imagen
 * para compartir, en la web.
 */
export function GolfStandings() {
  const c = useColors();
  const { lid, league, myPlayerId } = useLeagueCtx();
  const params = useLocalSearchParams<{ temporada?: string }>();
  const seasons = useLeagueSeasons(lid);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const selected = pickSeason(seasons.data, seasonId ?? params.temporada ?? null);
  const { season, rules, events, players, merit, counted } = useGolfMerit(selected);
  const tournaments = useGolfTournaments(lid);
  const [allCounted, setAllCounted] = useState(false);

  const title = (
    <Txt variant="title" accessibilityRole="header">
      Orden de mérito
    </Txt>
  );
  const bar = <SeasonBar seasons={seasons.data} selected={selected} onChange={setSeasonId} />;
  if (season.error) return <LoadError error={season.error} />;
  if (season.loading) return <Loading label="Cargando el orden de mérito" />;
  if (hasSavedTable(selected)) {
    return (
      <View style={{ gap: 14 }}>
        {title}
        {bar}
        <ClosedSeasonView season={selected!} highlight={myPlayerId ? [myPlayerId] : []} />
      </View>
    );
  }
  const nameOf = (id: string) => players.data.find((p) => p.id === id)?.name ?? '(jugador borrado)';
  const eventName = (id: string) => {
    const e = events.data.find((x) => x.id === id);
    return e ? eventLabel({ type: e.type, name: e.name, date: e.date }, 'golf') : 'Ronda';
  };
  // Sin temporadas (datos de antes): las fechas de la liga.
  const leagueDates = league.seasonStart || league.seasonEnd ? `${league.seasonStart ? formatDate(league.seasonStart) : '…'} – ${league.seasonEnd ? formatDate(league.seasonEnd) : '…'}` : null;
  const place = meritPlace(merit, myPlayerId, nameOf);
  const leader = merit[0];
  const minePts = merit.find((m) => m.id === myPlayerId)?.points ?? 0;
  const shown = allCounted ? counted : counted.slice(0, SHOWN);

  return (
    <View style={{ gap: 14 }}>
      {title}
      {!selected && leagueDates && (
        <Txt variant="meta" tone="muted">
          {`Temporada ${leagueDates}`}
        </Txt>
      )}
      {bar}
      {!merit.length ? (
        <Empty icon={<Medal size={28} color={c.accent} />} title="Todavía no hay rondas cerradas" text="Cuando el admin cierre una ronda, sus resultados suman aquí." />
      ) : (
        <>
          {place && leader && (
            <View accessibilityLabel="Tu lugar" style={[styles.place, { backgroundColor: c.accentSoft }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
                <Txt style={{ fontFamily: font.bold, fontSize: 48, lineHeight: 52, color: c.accent }}>{place.big}</Txt>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="bodyStrong" style={{ fontSize: 17 }}>
                    {place.title}
                  </Txt>
                  <Txt tone="fg2" style={{ fontSize: 14.5, marginTop: 3 }}>
                    {place.subtitle}
                  </Txt>
                </View>
              </View>
              <View style={{ marginTop: 16 }}>
                <View style={[styles.bar, { backgroundColor: `${c.accent}29` }]}>
                  <View style={{ width: `${Math.round(Math.min(1, leader.points ? minePts / leader.points : 0) * 100)}%`, height: '100%', borderRadius: 4, backgroundColor: c.accent }} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 7 }}>
                  <Txt tone="fg2" style={{ fontSize: 12.5 }}>{`Tú · ${minePts}`}</Txt>
                  {leader.id !== myPlayerId && <Txt tone="fg2" numberOfLines={1} style={{ fontSize: 12.5, flexShrink: 1 }}>{`1.º · ${nameOf(leader.id)} ${leader.points}`}</Txt>}
                </View>
              </View>
            </View>
          )}
          <Card padded={false} style={{ overflow: 'hidden' }}>
            {merit.map((m, i) => {
              const me = !!myPlayerId && m.id === myPlayerId;
              return (
                <View key={m.id} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
                  <View style={{ backgroundColor: me ? c.accentSoft : 'transparent' }}>
                    <ListRow
                      chevron={false}
                      accessibilityLabel={`${m.rank}. ${nameOf(m.id)}${me ? ' (tú)' : ''}: ${m.points} puntos. Jugó ${m.events}, ganó ${m.wins}`}
                      icon={<Txt style={{ width: 22, textAlign: 'center', fontFamily: font.bold, color: me ? c.accent : c.muted }}>{m.rank}</Txt>}
                      title={`${nameOf(m.id)}${me ? ' · Tú' : ''}`}
                      subtitle={`Jugó ${m.events} · ganó ${m.wins}`}
                      right={<Txt style={{ fontFamily: font.bold, fontSize: 20 }}>{m.points.toLocaleString('es-DO')}</Txt>}
                      onPress={() => openGolfer(lid, m.id)}
                    />
                  </View>
                </View>
              );
            })}
          </Card>
        </>
      )}
      <Txt tone="muted" style={{ textAlign: 'center', fontSize: 13 }}>{`Puntos por puesto en cada ronda cerrada: ${rules.data.meritPoints.slice(0, 5).join(', ')}…`}</Txt>

      {counted.length > 0 && (
        <View style={{ gap: 8 }}>
          <SectionHeader title={`Rondas que cuentan (${counted.length})`} />
          <Card padded={false} style={{ overflow: 'hidden' }}>
            {shown.map((e) => (
              <ListRow
                key={e.id}
                title={e.kind === 'torneo' ? (tournaments.data.find((t) => t.id === e.id)?.name ?? 'Torneo') : eventName(e.id)}
                subtitle={`${e.kind === 'torneo' ? `${e.eventIds.length} rondas · ` : ''}ganó ${e.rows.filter((r) => r.rank === 1).map((r) => nameOf(r.id)).join(' y ') || '–'}`}
                onPress={() => openRound(lid, e.eventIds[0], 'leaderboard')}
              />
            ))}
          </Card>
          {counted.length > SHOWN && <Button onPress={() => setAllCounted((v) => !v)}>{allCounted ? 'Ver menos' : `Ver las ${counted.length} rondas`}</Button>}
        </View>
      )}
    </View>
  );
}

/**
 * Arriba de la tabla: la temporada («Temporada 2026 ▾») con sus fechas; tocarla deja elegir otra (SeasonBar de la web).
 * Sin temporadas (datos de antes) no sale. Una cerrada sin tabla guardada muestra debajo sus premios.
 */
function SeasonBar({ seasons, selected, onChange }: { seasons: readonly Season[]; selected: Season | null; onChange: (id: string) => void }) {
  const c = useColors();
  const [picking, setPicking] = useState(false);
  if (!selected) return null;
  const many = seasons.length > 1;
  const unsaved = selected.status === 'closed' && !hasSavedTable(selected);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Temporada: ${selected.name}${many ? '. Toca para cambiarla' : ''}`}
        disabled={!many}
        onPress={() => setPicking(true)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}
      >
        <View style={[styles.pill, { backgroundColor: many ? c.surface : 'transparent', borderColor: many ? c.line : 'transparent', paddingHorizontal: many ? 12 : 0 }]}>
          <Txt variant="bodyStrong" tone={many ? 'fg' : 'muted'} numberOfLines={1} style={{ fontSize: 14 }}>
            {selected.name}
          </Txt>
          {many && <ChevronDown size={16} color={c.muted} />}
        </View>
        <Txt tone="muted" numberOfLines={1} style={{ flex: 1, fontSize: 12 }}>{`${selected.status === 'closed' ? 'Cerrada · ' : ''}${seasonDates(selected)}`}</Txt>
      </Pressable>
      <Sheet open={picking} onClose={() => setPicking(false)} title="Temporada">
        {seasons.map((s) => (
          <ChoiceRow
            key={s.id}
            title={`${s.name}${s.status === 'active' ? ' (en curso)' : ''}`}
            subtitle={seasonDates(s)}
            selected={s.id === selected.id}
            onPress={() => {
              onChange(s.id);
              setPicking(false);
            }}
          />
        ))}
      </Sheet>
      {unsaved && <SeasonAwardsCard season={selected} />}
    </>
  );
}

const AWARD_ORDER: Record<SeasonAward['kind'], number> = { campeon: 0, subcampeon: 1, tercero: 2, mvp: 3, mas_mejorado: 4, fair_play: 5, otro: 6 };

/** Premios de una temporada cerrada (SeasonAwardsCard de la web): el campeón arriba con la fecha del cierre. */
function SeasonAwardsCard({ season }: { season: Season }) {
  const c = useColors();
  const awards = [...season.awards].sort((a, b) => AWARD_ORDER[a.kind] - AWARD_ORDER[b.kind]);
  if (season.status !== 'closed') return null;
  const champion = awards.find((a) => a.kind === 'campeon');
  const rest = awards.filter((a) => a !== champion);
  return (
    <Card style={{ gap: 12, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={[styles.trophy, { backgroundColor: c.accentSoft }]}>
          <Trophy size={20} color={c.accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt tone="muted" style={{ fontSize: 12 }}>{`${season.name} · terminó${season.endsOn ? ` el ${formatDate(season.endsOn)}` : ''}`}</Txt>
          <Txt variant="bodyStrong" numberOfLines={1}>
            {champion ? `Campeón: ${champion.name}` : 'Temporada cerrada'}
          </Txt>
        </View>
      </View>
      {rest.map((a) => (
        <View key={a.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Award size={16} color={c.muted} style={{ marginTop: 2 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt style={{ fontSize: 14 }}>
              <Txt tone="muted" style={{ fontSize: 14 }}>{`${a.label}: `}</Txt>
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
    </Card>
  );
}

/** Una temporada cerrada (ClosedSeasonView de la web): sus premios, la tabla que se guardó al cerrarla y las demás. */
function ClosedSeasonView({ season, highlight }: { season: Season; highlight: readonly string[] }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const snapshot = parseSnapshot(season.standings);
  return (
    <View style={{ gap: 16 }}>
      <SeasonAwardsCard season={season} />
      {snapshot ? (
        <SnapshotTables snapshot={snapshot} highlight={highlight} />
      ) : (
        <Empty icon={<ListOrdered size={28} color={c.accent} />} title="Sin tabla guardada" text="Esta temporada se cerró sin tabla." />
      )}
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push({ pathname: '/l/[lid]/temporadas', params: { lid } })}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' }}
      >
        <History size={16} color={c.accent} />
        <Txt tone="accent" style={{ fontSize: 14, fontFamily: font.medium }}>
          Todas las temporadas
        </Txt>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  place: { borderRadius: 24, paddingHorizontal: 22, paddingVertical: 20 },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, borderRadius: 12, borderWidth: 1, flexShrink: 0, maxWidth: 200 },
  trophy: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
