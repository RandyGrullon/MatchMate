import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ArrowDownRight, Medal, Plus, TrendingDown, Waves } from 'lucide-react-native';
import { useSwimHistory, useSwimmers } from '@mm/lib/data/swimming';
import { formatDate } from '@mm/lib/format';
import { personalBests, STROKE_LABEL, type PersonalBest } from '@mm/sports/swimming';
import { groupLabel, pctText, raceName } from '@mm/pages/sports/swimming/logic';
import { clubMap, useNames, useSwim } from '@mm/pages/sports/swimming/swim';
import { DateBlock } from '@/components/DateBlock';
import { initials } from '@/components/social/Avatar';
import { BackBar, Badge, Card, Empty, ListRow, LoadError, Loading, SectionHeader, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { SectionAdd } from './adminParts';
import { BestTile, ClubTag, Lines, ShowMore, StatusBadge, TileGrid, openMeet, openSwimmer, swimTime } from './parts';
import { SwimmerFormSheet } from './SwimmersAdmin';

/**
 * Mis marcas (SwimMyProfile de la web): las del nadador de la cuenta y, si entrena un club, sus nadadores con «+
 * Registrar» (uno nuevo, en su club).
 */
export function SwimMyProfile() {
  const c = useColors();
  const { myPlayerId, coachOf } = useSwim();
  return (
    <View style={{ gap: 30 }}>
      {myPlayerId ? (
        <SwimmerProfile playerId={myPlayerId} mine />
      ) : (
        !coachOf.size && (
          <View style={{ gap: 20 }}>
            <Txt variant="title">Mis marcas</Txt>
            <Empty
              icon={<Waves size={28} color={c.accent} />}
              title="Aquí salen tus marcas"
              text="Cuando nades en un encuentro de la liga, tus mejores tiempos por estilo, distancia y piscina salen aquí."
            />
          </View>
        )
      )}
      {[...coachOf].map((clubId) => (
        <CoachClub key={clubId} clubId={clubId} />
      ))}
    </View>
  );
}

/** La página de un nadador (/l/<liga>/j/<jugador>, SwimPlayer de la web): «‹ Club Acuático» vuelve a donde estabas. */
export function SwimPlayer({ playerId }: { playerId: string }) {
  const { lid, league } = useSwim();
  return (
    <View style={{ gap: 4 }}>
      <BackBar label={league.name} fallback={`/l/${lid}`} />
      <SwimmerProfile playerId={playerId} />
    </View>
  );
}

/**
 * Las marcas de un nadador: el título con su club y categoría, sus marcas personales por piscina como fichas (tocar una
 * muestra cómo fue bajando) y lo que ha nadado (lo último, con «Ver las 8»).
 */
function SwimmerProfile({ playerId, mine }: { playerId: string; mine?: boolean }) {
  const c = useColors();
  const { lid, clubs } = useSwim();
  const { name, players } = useNames(lid);
  const swimmers = useSwimmers(lid);
  const history = useSwimHistory(lid, playerId);
  const info = swimmers.data.find((s) => s.playerId === playerId);
  const club = info?.clubId ? clubMap(clubs.data).get(info.clubId) : null;
  const bests = useMemo(() => personalBests(history.data), [history.data]);
  const [open, setOpen] = useState<string | null>(null);
  const selected = bests.find((b) => b.key === open) ?? null;
  const swims = useMemo(() => [...history.data].reverse(), [history.data]);
  const pools = ([25, 50] as const).filter((p) => bests.some((b) => b.pool === p));
  const exists = players.data.some((p) => p.id === playerId);

  if (history.error) return <LoadError error={history.error} />;
  if (!players.loading && !exists) return <Empty title="Este nadador ya no está en la liga" />;

  const swimRows = (list: readonly (typeof swims)[number][]) => (
    <Lines>
      {list.map((s) => (
        <ListRow
          key={s.entryId}
          icon={<DateBlock date={s.date} />}
          title={`${raceName(s)} · ${s.pool} m`}
          subtitle={s.meetName || (s.meetType === 'control' ? 'Control de marcas' : 'Encuentro')}
          chevron={false}
          onPress={() => openMeet(lid, s.meetId, 'resultados')}
          right={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <StatusBadge status={s.status} />
              <Txt style={{ fontFamily: font.bold, fontSize: 17, fontVariant: ['tabular-nums'] }}>{swimTime(s.time, '')}</Txt>
            </View>
          }
        />
      ))}
    </Lines>
  );

  return (
    <View>
      <Txt variant="title" numberOfLines={1}>
        {mine ? 'Mis marcas' : name(playerId)}
      </Txt>
      <View style={{ marginTop: 6, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4 }}>
        {mine && (
          <Txt variant="meta" tone="muted">
            {name(playerId)}
          </Txt>
        )}
        <ClubTag club={club} size={14} />
        {!!info?.category && <Badge tone="muted">{groupLabel(info.category)}</Badge>}
      </View>

      {history.loading && !history.data.length ? (
        <View style={{ marginTop: 20 }}>
          <Loading label="Cargando las marcas" />
        </View>
      ) : !bests.length ? (
        <View style={{ marginTop: 20 }}>
          <Empty icon={<Medal size={28} color={c.accent} />} title="Todavía sin marcas" text="Salen de los tiempos válidos de los encuentros (DQ, DNS y DNF no cuentan)." />
        </View>
      ) : (
        <>
          {pools.map((pool) => (
            <View key={pool} style={{ marginTop: 26, gap: 10 }}>
              <SectionHeader title={`Piscina de ${pool} m`} />
              <TileGrid>
                {bests
                  .filter((b) => b.pool === pool)
                  .map((b) => (
                    <BestTile key={b.key} best={b} raised hidePool active={open === b.key} onPress={() => setOpen(open === b.key ? null : b.key)} />
                  ))}
              </TileGrid>
            </View>
          ))}
          {selected ? (
            <Progression best={selected} />
          ) : (
            <Txt tone="muted" style={{ marginTop: 12, marginHorizontal: 4, fontSize: 13 }}>
              Toca una marca para ver cómo fue bajando.
            </Txt>
          )}
        </>
      )}

      {swims.length > 0 && (
        <View style={{ marginTop: 30, gap: 10 }}>
          <SectionHeader title={mine ? 'Lo que has nadado' : 'Lo que ha nadado'} />
          <ShowMore items={swims} max={5} noun="pruebas" render={(shown) => swimRows(shown)} />
        </View>
      )}
    </View>
  );
}

/** Cómo fue bajando una marca: cada vez que la bajó, con el % (sin gráficas, como la web). */
function Progression({ best }: { best: PersonalBest }) {
  const c = useColors();
  return (
    <Card padded={false} style={{ marginTop: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
        <TrendingDown size={20} color={c.ok} style={{ marginTop: 2 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="bodyStrong">{`${best.distance} m ${STROKE_LABEL[best.stroke]} · piscina ${best.pool} m`}</Txt>
          <Txt tone="muted" style={{ fontSize: 14 }}>
            {`${best.swims === 1 ? 'Nadada 1 vez' : `Nadada ${best.swims} veces`}${best.improvementPct > 0 ? ` · bajó ${pctText(best.improvementPct)} desde su primer tiempo` : ''}`}
          </Txt>
        </View>
      </View>
      {[...best.progression].reverse().map((p, k) => (
        <View key={`${p.date}-${p.time}`} style={[styles.step, { borderTopColor: c.line }]}>
          <Txt tone="muted" style={{ width: 96, fontSize: 14 }}>
            {formatDate(p.date)}
          </Txt>
          <Txt style={{ fontFamily: k === 0 ? font.bold : font.regular, fontVariant: ['tabular-nums'] }}>{swimTime(p.time)}</Txt>
          <View style={{ flex: 1 }} />
          {p.pct != null ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <ArrowDownRight size={14} color={c.ok} />
              <Txt tone="ok" style={{ fontSize: 12, fontFamily: font.medium }}>
                {pctText(p.pct)}
              </Txt>
            </View>
          ) : (
            <Txt tone="muted" style={{ fontSize: 12 }}>
              Primer tiempo
            </Txt>
          )}
        </View>
      ))}
    </Card>
  );
}

/** Para el entrenador: los nadadores de su club y registrar uno nuevo. */
function CoachClub({ clubId }: { clubId: string }) {
  const c = useColors();
  const { lid, clubs } = useSwim();
  const { players } = useNames(lid);
  const swimmers = useSwimmers(lid);
  const [adding, setAdding] = useState(false);
  const club = clubs.data.find((x) => x.id === clubId);
  const mine = swimmers.data.filter((s) => s.clubId === clubId);
  const byId = new Map(players.data.map((p) => [p.id, p] as const));
  if (!club) return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title={`Mi club: ${club.name}`} action={<SectionAdd label="Registrar" onPress={() => setAdding(true)} />} />
      {!mine.length ? (
        <Empty
          icon={<Plus size={28} color={c.accent} />}
          title="Tu club todavía no tiene nadadores"
          text="Registra a los tuyos (los menores con el permiso de su padre, madre o tutor) para inscribirlos en los encuentros."
        />
      ) : (
        <Lines>
          {mine
            .map((s) => ({ s, p: byId.get(s.playerId) }))
            .filter((x) => x.p)
            .sort((a, b) => a.p!.name.localeCompare(b.p!.name))
            .map(({ s, p }) => (
              <ListRow
                key={s.playerId}
                icon={
                  <View style={[styles.initials, { backgroundColor: c.surface2 }]}>
                    <Txt style={{ fontFamily: font.semibold, fontSize: 14, color: c.fg2 }}>{initials(p!.name)}</Txt>
                  </View>
                }
                title={p!.name}
                right={s.category ? <Badge tone="muted">{groupLabel(s.category)}</Badge> : undefined}
                onPress={() => openSwimmer(lid, s.playerId)}
              />
            ))}
        </Lines>
      )}
      <SwimmerFormSheet open={adding} onClose={() => setAdding(false)} fixedClub={clubId} />
    </View>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 8, paddingHorizontal: 20, borderTopWidth: StyleSheet.hairlineWidth },
  initials: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
