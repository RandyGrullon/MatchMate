import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Award, ChevronDown, Crown, Medal } from 'lucide-react-native';
import { todayIn } from '@mm/badges/rules/periods';
import { useBadgeStats, useEventAwards, useLeagueAwards, usePlayerAwards, useTitleAwards, type BadgeAward } from '@mm/lib/data/badges';
import { usePlayers } from '@mm/lib/data/players';
import { useLeagueCtx } from '@mm/lib/league';
import { useNow } from '@mm/lib/useNow';
import { countText, eventAwards, groupTiles, monthAwards, seasonAwards, viewAward, type WinnerGroup } from '@mm/components/badges/logic';
import { attendanceText, badgesHiddenIn, currentTitle, hasEventAwards } from '@mm/components/badges/league';
import { awardSubject, tileSub, type SheetSubject } from '@mm/components/badges/sheet';
import { awardTileLabel } from '@mm/components/badges/tab';
import { Card, Divider, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { BadgeSheet } from './BadgeSheet';
import { BadgeGrid, BadgeTile } from './BadgeTile';
import { Insignia } from './Insignia';

/**
 * Las insignias dentro de la liga en la app (LeagueBadges y LeagueBadgePanels de la web, docs/insignias.md §6.2): «Premios
 * de {octubre}» y «Campeones» en el inicio, las de un jugador en su página, las de un evento en el suyo y el escudo del
 * título vigente. Van dentro de LeagueScope (leen la liga con useLeagueCtx). En una liga con menores las ven solo los
 * miembros.
 */

type Names = ReadonlyMap<string, string>;

function useNames(lid: string): Names {
  const players = usePlayers(lid);
  return new Map(players.data.map((p) => [p.id, p.name]));
}

const openPlayer = (lid: string, playerId: string) => router.push({ pathname: '/l/[lid]/j/[playerId]', params: { lid, playerId } });

function SectionTitle({ icon, children }: { icon: typeof Award; children: string }) {
  const c = useColors();
  const Icon = icon;
  return (
    <View style={styles.title}>
      <Icon size={20} color={c.accent} />
      <Txt variant="section" accessibilityRole="header" style={{ flexShrink: 1 }}>
        {children}
      </Txt>
    </View>
  );
}

/**
 * Una lista de ganadores: la insignia a 40 (tocarla abre el detalle), su nombre, el grupo (caja, equipo, puesto),
 * quiénes la ganaron (a su página) y la línea de evidencia («Promedio 187 en 12 juegos»).
 */
export function WinnersList({ groups, names, lid, onOpen }: { groups: readonly WinnerGroup[]; names: Names; lid: string; onOpen: (awardId: string) => void }) {
  const c = useColors();
  return (
    <View>
      {groups.map((g, i) => (
        <View key={g.id}>
          {i > 0 && <Divider />}
          <View style={styles.winner}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ver ${g.view.label}`}
              onPress={() => onOpen(g.winners[0]?.awardId ?? g.view.award.id)}
              style={({ pressed }) => [styles.badgeButton, { backgroundColor: pressed ? c.surface2 : 'transparent' }]}
            >
              <Insignia badge={g.view.look} size={40} />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="meta" style={{ fontFamily: font.semibold }}>
                {g.view.name}
                {!!g.subtitle && <Txt variant="meta" tone="muted">{` · ${g.subtitle}`}</Txt>}
              </Txt>
              {g.winners.map((w) => {
                const who = (
                  <>
                    <Txt variant="meta" style={{ fontFamily: font.medium }}>
                      {w.playerId ? (names.get(w.playerId) ?? 'Jugador') : 'Jugador'}
                    </Txt>
                    {!!w.evidence && (
                      <Txt variant="small" tone="muted">
                        {w.evidence}
                      </Txt>
                    )}
                  </>
                );
                return w.playerId ? (
                  <Pressable
                    key={w.awardId}
                    accessibilityRole="link"
                    onPress={() => openPlayer(lid, w.playerId!)}
                    style={({ pressed }) => [styles.who, { backgroundColor: pressed ? c.surface2 : 'transparent' }]}
                  >
                    {who}
                  </Pressable>
                ) : (
                  <View key={w.awardId} style={styles.who}>
                    {who}
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

/** «Asistencia perfecta: 12 jugadores», plegada. */
export function AttendanceFold({ list, names, lid }: { list: readonly { playerId: string | null; awardId: string }[]; names: Names; lid: string }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  if (!list.length) return null;
  return (
    <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [styles.fold, { backgroundColor: pressed ? c.surface2 : 'transparent' }]}
      >
        <Txt variant="meta" style={{ flex: 1, fontFamily: font.medium }}>
          {attendanceText(list.length)}
        </Txt>
        <ChevronDown size={16} color={c.muted} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </Pressable>
      {open && (
        <View style={styles.names}>
          {list.map((a) =>
            a.playerId ? (
              <Pressable
                key={a.awardId}
                accessibilityRole="link"
                onPress={() => openPlayer(lid, a.playerId!)}
                style={({ pressed }) => [styles.name, { backgroundColor: pressed ? c.surface2 : 'transparent' }]}
              >
                <Txt variant="meta">{names.get(a.playerId) ?? 'Jugador'}</Txt>
              </Pressable>
            ) : (
              <View key={a.awardId} style={styles.name}>
                <Txt variant="meta">Jugador</Txt>
              </View>
            ),
          )}
        </View>
      )}
    </View>
  );
}

/** Lo que se abre en el detalle (una sola fila de la liga). */
function useAwardSheet(awards: readonly BadgeAward[], now: number) {
  const [open, setOpen] = useState<string | null>(null);
  const subject: SheetSubject | null = awardSubject(awards, open, now);
  return { subject, openAward: setOpen, close: () => setOpen(null) };
}

/** «Premios de {octubre}» (días 3 a 9) y «Campeones de {temporada}» (14 días) con sus ganadores (§6.2). */
function LeagueAwardsPanel({ awards }: { awards: readonly BadgeAward[] }) {
  const { lid, league, base, isAdmin } = useLeagueCtx();
  const names = useNames(lid);
  const now = useNow().getTime();
  const today = todayIn(now, league.tz || undefined);
  const month = monthAwards(awards, today);
  const season = seasonAwards(awards, now);
  const stats = useBadgeStats(!!month || !!season);
  const sheet = useAwardSheet(awards, now);
  if (!month && !season) return null;
  return (
    <View style={{ gap: 20 }}>
      {season && (
        <View style={{ gap: 8 }}>
          <SectionTitle icon={Crown}>{season.title}</SectionTitle>
          <Card padded={false}>
            <WinnersList groups={season.groups} names={names} lid={lid} onOpen={sheet.openAward} />
          </Card>
        </View>
      )}
      {month && (
        <View style={{ gap: 8 }}>
          <SectionTitle icon={Medal}>{month.title}</SectionTitle>
          <Card padded={false}>
            {month.groups.length > 0 && <WinnersList groups={month.groups} names={names} lid={lid} onOpen={sheet.openAward} />}
            <AttendanceFold list={month.attendance} names={names} lid={lid} />
          </Card>
        </View>
      )}
      <BadgeSheet subject={sheet.subject} onClose={sheet.close} stats={stats.data} announce={isAdmin && !league.hasMinors} webPath={() => base} />
    </View>
  );
}

/**
 * «Premios de {octubre}» del día 3 al 9 y «Campeones de {temporada}» por 14 días, en el inicio de la liga (LeagueBadgeAwards
 * de la web, en LeagueHomeBottom antes de «Campeones» de las temporadas). Sin nada que mostrar, no ocupa lugar.
 */
export function LeagueBadgeAwards() {
  const { lid, league, member } = useLeagueCtx();
  const hide = badgesHiddenIn(league, member);
  const awards = useLeagueAwards(hide ? null : lid);
  if (hide || !awards.data.length) return null;
  return <LeagueAwardsPanel awards={awards.data} />;
}

/**
 * Las insignias de un jugador en su página (`/l/<liga>/j/<jugador>`, LeaguePlayerBadges de la web): las de la liga y,
 * si no tiene cuenta, sus copias de respaldo. «Ver todas» lleva a su perfil.
 */
export function LeaguePlayerBadges({ playerId }: { playerId: string }) {
  const { lid, league, member, base, isAdmin, myPlayerId } = useLeagueCtx();
  const c = useColors();
  const hide = badgesHiddenIn(league, member);
  const awards = usePlayerAwards(hide ? null : lid, playerId);
  const players = usePlayers(lid);
  const now = useNow().getTime();
  const tiles = groupTiles(awards.data, { own: false, now });
  const stats = useBadgeStats(tiles.length > 0);
  const [subject, setSubject] = useState<SheetSubject | null>(null);
  if (hide || !tiles.length) return null;
  const player = players.data.find((p) => p.id === playerId);
  const mine = !!myPlayerId && myPlayerId === playerId;
  return (
    <View style={{ gap: 8 }}>
      <View style={[styles.title, { justifyContent: 'space-between' }]}>
        <View style={[styles.title, { flexShrink: 1 }]}>
          <Award size={20} color={c.accent} />
          <Txt variant="section" accessibilityRole="header">
            Insignias
          </Txt>
          <Txt variant="meta" tone="muted" style={{ fontFamily: font.medium }}>
            {countText(awards.data.length)}
          </Txt>
        </View>
        {!!player?.uid && (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push({ pathname: '/u/[userId]', params: { userId: player.uid!, tab: 'insignias' } })}
            style={({ pressed }) => [styles.more, { backgroundColor: pressed ? c.accentSoft : 'transparent' }]}
          >
            <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }}>
              {mine ? 'Todas las mías' : 'Ver todas'}
            </Txt>
          </Pressable>
        )}
      </View>
      <Card padded={false} style={{ padding: 8 }}>
        <BadgeGrid>
          {tiles.map((t) => (
            <BadgeTile
              key={t.id}
              look={t.top.look}
              state={t.state}
              name={t.top.name}
              sub={tileSub(t)}
              count={t.count}
              label={awardTileLabel(t)}
              onOpen={() => setSubject({ kind: 'award', tile: t })}
            />
          ))}
        </BadgeGrid>
      </Card>
      <BadgeSheet
        subject={subject}
        onClose={() => setSubject(null)}
        stats={stats.data}
        canShare={mine && !league.hasMinors}
        announce={isAdmin && !mine && !league.hasMinors}
        webPath={() => `${base}/j/${playerId}`}
      />
    </View>
  );
}

/** «Insignias del evento» en su página: el podio (y categorías y equipos) con sus insignias, cuando ya se dieron. */
export function EventBadges({ eventId, date }: { eventId: string; date: string }) {
  const { lid, league, member, base, isAdmin } = useLeagueCtx();
  const hide = badgesHiddenIn(league, member);
  const awards = useEventAwards(hide ? null : lid, eventId, date);
  const names = useNames(lid);
  const now = useNow().getTime();
  const groups = eventAwards(awards.data, eventId);
  const stats = useBadgeStats(groups.length > 0);
  const sheet = useAwardSheet(awards.data, now);
  if (hide || !hasEventAwards(awards.data, eventId) || !groups.length) return null;
  return (
    <View style={{ gap: 8 }}>
      <SectionTitle icon={Award}>Insignias del evento</SectionTitle>
      <Card padded={false}>
        <WinnersList groups={groups} names={names} lid={lid} onOpen={sheet.openAward} />
      </Card>
      <BadgeSheet subject={sheet.subject} onClose={sheet.close} stats={stats.data} announce={isAdmin && !league.hasMinors} webPath={() => `${base}/e/${eventId}`} />
    </View>
  );
}

/** El título vigente de la liga de la pantalla (para la tabla de posiciones). */
export function useCurrentTitle(): ReturnType<typeof currentTitle> {
  const { lid, league, member } = useLeagueCtx();
  const hide = badgesHiddenIn(league, member);
  const awards = useTitleAwards(hide ? null : lid);
  return hide ? null : currentTitle(awards.data);
}

/** El escudo de 24 del título vigente al lado de un jugador («Título vigente»). Nada si no es el campeón. */
export function TitleMark({ title, playerId }: { title: ReturnType<typeof currentTitle>; playerId: string }) {
  if (!title || !title.players.has(playerId)) return null;
  const view = viewAward(title.award);
  if (!view) return null;
  return <Insignia badge={view.look} size={24} label={`Título vigente: ${view.name}`} />;
}

const styles = StyleSheet.create({
  title: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  winner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  badgeButton: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', margin: -2 },
  who: { minHeight: 44, justifyContent: 'center', borderRadius: 8, marginHorizontal: -4, paddingHorizontal: 4 },
  fold: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, paddingVertical: 8 },
  names: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingHorizontal: 8, paddingBottom: 8 },
  name: { minHeight: 44, justifyContent: 'center', borderRadius: 8, paddingHorizontal: 8 },
  more: { minHeight: 44, justifyContent: 'center', borderRadius: 12, paddingHorizontal: 12 },
});
