/**
 * Las insignias del creador dentro de la liga en la app (LeagueMadeBadges y MakerPanels de la web, docs/insignias.md
 * §6.2): el estante «Insignias de la liga» del inicio y las del creador en la página de un jugador («De la liga»: la
 * vitrina de los que no tienen cuenta). Van dentro de LeagueScope. En una liga con menores las ven solo los miembros.
 * Cuándo salen: madeHidden, shelfShown y playerMadeShown de src/components/badges/maker/view.ts.
 */
import { StyleSheet, View } from 'react-native';
import { Award, Gift, Plus } from 'lucide-react-native';
import { badgeLabel } from '@mm/badges/visual/period';
import { usePlayers } from '@mm/lib/data/players';
import { MAX_ACTIVE_DESIGNS, canMakeBadges, useLeagueBadges, type LeagueBadgesData } from '@mm/lib/data/leagueBadges';
import { useLeagueCtx } from '@mm/lib/league';
import { leagueSport } from '@mm/sports/registry';
import { designLook } from '@mm/components/badges/maker/look';
import { madeHidden, playerMadeShown, playerMadeTiles, shelfHoldersText, shelfShown } from '@mm/components/badges/maker/view';
import { BadgeGrid, BadgeTile } from '@/components/badges/BadgeTile';
import { Button, Card, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { MakerModals, RecentAwards, useMaker } from './MakerHost';

function SectionTitle({ children }: { children: string }) {
  const c = useColors();
  return (
    <View style={styles.title}>
      <Award size={20} color={c.accent} />
      <Txt variant="section" accessibilityRole="header" style={{ flexShrink: 1 }}>
        {children}
      </Txt>
    </View>
  );
}

/**
 * «Insignias de la liga» en el inicio: si la liga tiene diseños activos, o para quien los diseña sin ser admin (su
 * única puerta al creador; los admins lo tienen en Organizar › Insignias). Va después de «Campeones».
 */
export function LeagueMadeBadges() {
  const ctx = useLeagueCtx();
  const hide = madeHidden(ctx.league, ctx.member);
  const data = useLeagueBadges(hide ? null : ctx.lid);
  const can = canMakeBadges(ctx);
  if (!shelfShown({ hidden: hide, loading: data.loading, designs: data.data.designs, can, isAdmin: ctx.isAdmin })) return null;
  return <MakerShelf data={data.data} />;
}

/**
 * El estante (§6.2): los diseños activos a 64 con cuántos la tienen, las últimas 5 que se dieron y, para quien diseña y
 * da, «Dar insignia» y «Nueva insignia».
 */
function MakerShelf({ data }: { data: LeagueBadgesData }) {
  const c = useColors();
  const ctx = useLeagueCtx();
  const { lid, league } = ctx;
  const players = usePlayers(lid);
  const names = new Map(players.data.map((p) => [p.id, p.name] as const));
  const m = useMaker();
  const sport = leagueSport(league);
  const can = canMakeBadges(ctx);
  const active = data.designs.filter((d) => d.status === 'activa');

  return (
    <View style={{ gap: 8 }}>
      <View style={[styles.title, { justifyContent: 'space-between' }]}>
        <SectionTitle>Insignias de la liga</SectionTitle>
        {can && active.length > 0 && (
          <Button variant="primary" icon={<Gift size={16} color={c.accentFg} />} onPress={() => m.openGive(null)}>
            Dar insignia
          </Button>
        )}
      </View>
      <Card padded={false} style={{ padding: 8, gap: 8 }}>
        {active.length ? (
          <BadgeGrid>
            {active.map((d) => {
              const look = designLook(d, sport);
              return (
                <BadgeTile
                  key={d.id}
                  look={look}
                  name={d.name}
                  sub={shelfHoldersText(d.active)}
                  label={`${badgeLabel(d.name, look)}: ${shelfHoldersText(d.active)}`}
                  onOpen={() => m.openSheet(d)}
                />
              );
            })}
          </BadgeGrid>
        ) : (
          <Txt variant="meta" tone="muted" style={{ paddingHorizontal: 8, paddingVertical: 12 }}>
            Diseña la primera insignia de la liga: un campeón, la asistencia perfecta o la que ustedes quieran.
          </Txt>
        )}
        <RecentAwards awards={data.awards} designs={data.designs} names={names} sport={sport} tz={league.tz} onOpen={m.openSheet} divided />
        {can && active.length < MAX_ACTIVE_DESIGNS && (
          <View style={{ alignSelf: 'flex-start' }}>
            <Button variant="ghost" icon={<Plus size={16} color={c.fg} />} onPress={() => m.openEditor({ kind: 'new' })}>
              Nueva insignia
            </Button>
          </View>
        )}
      </Card>
      <MakerModals m={m} data={data} />
    </View>
  );
}

/**
 * Las del creador en la página del jugador (`/l/<liga>/j/<jugador>`), una por diseño con ×N. Va después de sus
 * insignias de la liga (LeaguePlayerBadges).
 */
export function LeaguePlayerMadeBadges({ playerId }: { playerId: string }) {
  const ctx = useLeagueCtx();
  const hide = madeHidden(ctx.league, ctx.member);
  const data = useLeagueBadges(hide ? null : ctx.lid);
  if (!playerMadeShown(hide, data.data.awards, playerId)) return null;
  return <PlayerMadeBadges playerId={playerId} data={data.data} />;
}

function PlayerMadeBadges({ playerId, data }: { playerId: string; data: LeagueBadgesData }) {
  const ctx = useLeagueCtx();
  const m = useMaker();
  const sport = leagueSport(ctx.league);
  const tiles = playerMadeTiles(data, playerId);
  if (!tiles.length) return null;
  return (
    <View style={{ gap: 8 }}>
      <SectionTitle>De la liga</SectionTitle>
      <Card padded={false} style={{ padding: 8 }}>
        <BadgeGrid>
          {tiles.map((t) => {
            const look = designLook(t.badge, sport, t.period);
            return (
              <BadgeTile
                key={t.badge.id}
                look={look}
                name={t.badge.name}
                sub={t.period || 'LIGA'}
                count={t.count}
                label={`${badgeLabel(t.badge.name, look)}${t.count > 1 ? `, ${t.count} veces` : ''}`}
                onOpen={() => m.openSheet(t.badge)}
              />
            );
          })}
        </BadgeGrid>
      </Card>
      <MakerModals m={m} data={data} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
