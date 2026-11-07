/**
 * Organizar › Insignias › «Insignias de la liga» en la app (MakerAdmin de la web, docs/insignias.md §6.5): los diseños
 * de la liga (activos, archivados y los escondidos por moderación), «Nueva insignia», «Dar insignia», las últimas que
 * se dieron y, al tocar una, quién la tiene y qué se puede hacer con ella. Va debajo de «¿Quién diseña y da
 * insignias?» (como en la web) y solo para quien diseña y da insignias (`private.can_badges`). Necesita LeagueScope.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Award, ChevronDown, Gift, Plus } from 'lucide-react-native';
import { usePlayers } from '@mm/lib/data/players';
import { MAX_ACTIVE_DESIGNS, canMakeBadges, useLeagueBadges, type LeagueBadge } from '@mm/lib/data/leagueBadges';
import { useLeagueCtx } from '@mm/lib/league';
import { leagueSport } from '@mm/sports/registry';
import { templateName, templatesFor } from '@mm/components/badges/maker/templates';
import { FULL_DESIGNS_TEXT, activeTitle, archivedTitle, designGroups, hasGiven, makerIntro, policyLine } from '@mm/components/badges/maker/view';
import { LogoSpinner } from '@/components/Logo';
import { Button, Card, Empty, LoadError, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { DesignRow, MakerModals, RecentAwards, useMaker, type MakerState } from './MakerHost';
import { Chip, Chips } from './parts';

export function MakerAdmin() {
  const c = useColors();
  const ctx = useLeagueCtx();
  const { lid, league } = ctx;
  const data = useLeagueBadges(lid);
  const players = usePlayers(lid);
  const m = useMaker();
  const sport = leagueSport(league);
  const names = new Map(players.data.map((p) => [p.id, p.name] as const));
  const can = canMakeBadges(ctx);
  const { designs } = data.data;
  const { active, archived, hidden } = designGroups(designs);
  const policy = policyLine(league, ctx.isOwner);
  const [showArchived, setShowArchived] = useState(false);

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 4 }}>
        <View style={styles.title}>
          <Award size={20} color={c.accent} />
          <Txt variant="section" accessibilityRole="header">
            Insignias de la liga
          </Txt>
        </View>
        <Txt variant="meta" tone="muted">
          {makerIntro(league.name)}
        </Txt>
      </View>

      {can && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button variant="primary" icon={<Plus size={16} color={c.accentFg} />} disabled={active.length >= MAX_ACTIVE_DESIGNS} onPress={() => m.openEditor({ kind: 'new' })}>
            Nueva insignia
          </Button>
          <Button icon={<Gift size={16} color={c.fg} />} disabled={!active.length} onPress={() => m.openGive(null)}>
            Dar insignia
          </Button>
        </View>
      )}
      {can && active.length >= MAX_ACTIVE_DESIGNS && (
        <Txt variant="small" tone="muted" style={{ fontFamily: font.regular }}>
          {FULL_DESIGNS_TEXT}
        </Txt>
      )}

      {data.error ? (
        <LoadError error={data.error} />
      ) : data.loading && !designs.length ? (
        <View style={{ alignItems: 'center', paddingVertical: 16 }}>
          <LogoSpinner size={32} />
        </View>
      ) : !designs.length ? (
        <MakerEmpty can={can} kind={league.kind} sport={sport} m={m} />
      ) : (
        <>
          <DesignList title={activeTitle(active.length)} list={active} sport={sport} onOpen={m.openSheet} empty="No hay insignias activas." />
          {hasGiven(data.data.awards) && (
            <View style={{ gap: 6 }}>
              <Txt variant="meta" accessibilityRole="header" style={{ fontFamily: font.semibold }}>
                Las últimas que se dieron
              </Txt>
              <Card padded={false} style={{ padding: 8 }}>
                <RecentAwards awards={data.data.awards} designs={designs} names={names} sport={sport} tz={league.tz} onOpen={m.openSheet} />
              </Card>
            </View>
          )}
          {archived.length > 0 && (
            <View style={{ gap: 6 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showArchived }}
                onPress={() => setShowArchived((o) => !o)}
                style={({ pressed }) => [styles.fold, { opacity: pressed ? 0.7 : 1 }]}
              >
                <ChevronDown size={16} color={c.muted} style={{ transform: [{ rotate: showArchived ? '180deg' : '0deg' }] }} />
                <Txt variant="meta" style={{ fontFamily: font.semibold }}>
                  {archivedTitle(archived.length)}
                </Txt>
              </Pressable>
              {showArchived && <DesignList list={archived} sport={sport} onOpen={m.openSheet} />}
            </View>
          )}
          {hidden.length > 0 && <DesignList title="Escondidas por moderación" list={hidden} sport={sport} onOpen={m.openSheet} />}
        </>
      )}

      {policy && (
        <Txt variant="small" tone="muted" style={{ fontFamily: font.regular }}>
          {'Las diseñan y las dan: '}
          <Txt variant="small" style={{ fontFamily: font.bold, color: c.fg }}>
            {policy.who}
          </Txt>
          {`. ${policy.text}`}
        </Txt>
      )}

      <MakerModals m={m} data={data.data} />
    </View>
  );
}

function DesignList({ title, list, sport, onOpen, empty }: { title?: string; list: readonly LeagueBadge[]; sport: string; onOpen: (b: LeagueBadge) => void; empty?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {!!title && (
        <Txt variant="meta" accessibilityRole="header" style={{ fontFamily: font.semibold }}>
          {title}
        </Txt>
      )}
      {list.length ? (
        <Card padded={false}>
          {list.map((b, i) => (
            <DesignRow key={b.id} badge={b} sport={sport} reports first={i === 0} onOpen={() => onOpen(b)} />
          ))}
        </Card>
      ) : (
        !!empty && (
          <Txt variant="meta" tone="muted">
            {empty}
          </Txt>
        )
      )}
    </View>
  );
}

/** Sin diseños todavía: las plantillas para arrancar. */
function MakerEmpty({ can, kind, sport, m }: { can: boolean; kind?: string; sport: string; m: Pick<MakerState, 'openEditor'> }) {
  const c = useColors();
  return (
    <Empty
      icon={<Award size={32} color={c.accent} />}
      title="Todavía no hay insignias de la liga"
      text={can ? 'Empieza con una plantilla o diseña la tuya desde cero.' : 'Cuando la liga cree insignias, salen aquí.'}
      action={
        can ? (
          <Chips center>
            {templatesFor(kind)
              .slice(0, 6)
              .map((t) => (
                <Chip key={t.key} on={false} onPress={() => m.openEditor({ kind: 'new', template: t.key })} text={templateName(t.key, sport, kind === 'torneo')} />
              ))}
          </Chips>
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  title: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fold: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
});
