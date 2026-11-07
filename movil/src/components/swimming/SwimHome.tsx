import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight, Megaphone, Plus, Timer, Trophy, Waves } from 'lucide-react-native';
import { useSwimHistory, useSwimMeets, useSwimRules, type SwimMeet } from '@mm/lib/data/swimming';
import { toIsoDate } from '@mm/lib/format';
import { useNow } from '@mm/lib/useNow';
import { latestBests, meetRowLine, nextMeetView } from '@mm/pages/sports/swimming/home';
import { meetTitle, useSwim } from '@mm/pages/sports/swimming/swim';
import { DateBlock } from '@/components/DateBlock';
import { Button, Card, Empty, ListRow, LoadError, Loading, SectionHeader, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { SectionAdd } from './adminParts';
import { MeetFormSheet } from './MeetForm';
import { BestTile, Lines, ShowMore, TileGrid, openMeet } from './parts';
import { SwimEventBody } from './SwimEvent';

/**
 * Inicio de la liga de natación (SwimHome de la web, Lite): el próximo encuentro una sola vez (hoy: con «Cronometrar»
 * para quien toma los tiempos), tus marcas, «Próximos encuentros» con su fecha y «+ Nuevo» para el admin (o «Nuevo
 * encuentro» si no hay ninguno por venir), y los anteriores. Un torneo sin liga abre su encuentro.
 */
export function SwimHome() {
  const { league } = useSwim();
  // Torneo sin liga: el encuentro es la portada.
  return league.kind === 'torneo' ? <SingleMeet /> : <MeetsCalendar />;
}

function SingleMeet() {
  const c = useColors();
  const { lid } = useSwim();
  const meets = useSwimMeets(lid);
  if (meets.error) return <LoadError error={meets.error} />;
  if (meets.loading && !meets.data.length) return <Loading label="Cargando el encuentro" />;
  const m = meets.data[0];
  if (!m) return <Empty icon={<Trophy size={28} color={c.accent} />} title="Este torneo no tiene encuentro" text="Un admin puede borrarlo y crearlo otra vez." />;
  return <SwimEventBody eventId={m.id} embedded />;
}

function MeetsCalendar() {
  const c = useColors();
  const { lid, isAdmin, myPlayerId } = useSwim();
  const meets = useSwimMeets(lid);
  const rules = useSwimRules(lid).data;
  const today = toIsoDate(useNow());
  const [creating, setCreating] = useState(false);
  if (meets.error) return <LoadError error={meets.error} />;
  if (meets.loading && !meets.data.length) return <Loading label="Cargando los encuentros" />;
  const upcoming = meets.data.filter((m) => m.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = meets.data.filter((m) => m.date < today).sort((a, b) => b.date.localeCompare(a.date));
  const next = upcoming[0];
  const rest = upcoming.slice(1);

  return (
    <View style={{ gap: 30 }}>
      {next && <NextMeetCard meet={next} today={today} />}

      {myPlayerId && <MyBestsCard playerId={myPlayerId} />}

      <View style={{ gap: 10 }}>
        <SectionHeader title="Próximos encuentros" action={isAdmin && next ? <SectionAdd onPress={() => setCreating(true)} /> : undefined} />
        {rest.length ? (
          <MeetList meets={rest} today={today} />
        ) : next ? (
          <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4 }}>
            No hay más encuentros por ahora.
          </Txt>
        ) : (
          <Empty
            icon={<Waves size={28} color={c.accent} />}
            title="No hay encuentros por venir"
            text={isAdmin ? 'Crea el primero: puedes empezar con las pruebas de un encuentro de club.' : 'Cuando el organizador cree el próximo, sale aquí.'}
            action={
              isAdmin ? (
                <Button variant="primary" size="lg" icon={<Plus size={20} color={c.accentFg} />} onPress={() => setCreating(true)}>
                  Nuevo encuentro
                </Button>
              ) : undefined
            }
          />
        )}
      </View>

      {past.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionHeader title="Anteriores" />
          <ShowMore items={past} noun="encuentros" render={(shown) => <MeetList meets={shown} today={today} />} />
        </View>
      )}

      <MeetFormSheet open={creating} onClose={() => setCreating(false)} lid={lid} defaults={rules} onCreated={(id) => openMeet(lid, id)} />
    </View>
  );
}

/** Los encuentros como filas con su fecha («OCT / 24»): cuándo, la piscina y en qué va. */
function MeetList({ meets, today }: { meets: readonly SwimMeet[]; today: string }) {
  const { lid } = useSwim();
  return (
    <Lines>
      {meets.map((m) => (
        <ListRow key={m.id} icon={<DateBlock date={m.date} />} title={meetTitle(m)} subtitle={meetRowLine(m, today)} onPress={() => openMeet(lid, m.id)} />
      ))}
    </Lines>
  );
}

/**
 * El próximo encuentro, una sola vez: «Hoy · 8:00 am» (o «Próximo encuentro»), el nombre (abre el encuentro), cuándo y en
 * qué va, el anuncio y, el día del encuentro, UN botón para quien toma los tiempos: «Cronometrar».
 */
function NextMeetCard({ meet, today }: { meet: SwimMeet; today: string }) {
  const c = useColors();
  const { lid, isTimer } = useSwim();
  const { isToday, when, line, timing } = nextMeetView(meet, today, isTimer);
  return (
    <Card style={[{ paddingVertical: 18, paddingLeft: 20, paddingRight: 18 }, isToday && { backgroundColor: c.accentSoft }]}>
      <View accessibilityLabel={`${meetTitle(meet)}: ${when}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {isToday && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} />}
        <Txt tone="accent" numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: 14, flexShrink: 1 }}>
          {when}
        </Txt>
      </View>
      <Pressable accessibilityRole="button" onPress={() => openMeet(lid, meet.id)} style={({ pressed }) => ({ marginTop: 8, opacity: pressed ? 0.7 : 1 })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Txt numberOfLines={1} style={{ flex: 1, fontFamily: font.bold, fontSize: 21, lineHeight: 29 }}>
            {meetTitle(meet)}
          </Txt>
          <ChevronRight size={20} color={c.accent} />
        </View>
        <Txt tone="fg2" style={{ fontSize: 14.5, marginTop: 3 }}>
          {line}
        </Txt>
      </Pressable>
      {!!meet.announcement && (
        <View style={[styles.announcement, { borderTopColor: isToday ? `${c.accent}26` : c.line }]}>
          <Megaphone size={16} color={c.accent} style={{ marginTop: 2 }} />
          <Txt tone="fg2" style={{ flex: 1, minWidth: 0, fontSize: 14.5 }}>
            {meet.announcement}
          </Txt>
        </View>
      )}
      {timing && (
        <View style={{ marginTop: 16 }}>
          <Button variant="primary" size="xl" full icon={<Timer size={20} color={c.accentFg} />} onPress={() => openMeet(lid, meet.id, 'cronometro')}>
            Cronometrar
          </Button>
        </View>
      )}
    </Card>
  );
}

/** Tus mejores marcas (de quien nada con cuenta): las 4 más recientes, con «Ver todas». */
function MyBestsCard({ playerId }: { playerId: string }) {
  const { lid } = useSwim();
  const history = useSwimHistory(lid, playerId);
  const bests = useMemo(() => latestBests(history.data), [history.data]);
  if (!bests.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader
        title="Tus marcas"
        action={
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push({ pathname: '/l/[lid]/perfil', params: { lid } })}>
            <Txt tone="accent" variant="bodyStrong">
              Ver todas
            </Txt>
          </Pressable>
        }
      />
      <TileGrid>
        {bests.map((b) => (
          <BestTile key={b.key} best={b} raised />
        ))}
      </TileGrid>
    </View>
  );
}

const styles = StyleSheet.create({
  announcement: { flexDirection: 'row', gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
});
