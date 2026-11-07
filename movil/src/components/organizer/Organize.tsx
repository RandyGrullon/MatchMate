import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  Award,
  BadgeCheck,
  Calendar,
  Check,
  ChevronDown,
  ClipboardCheck,
  Flag,
  Hourglass,
  Inbox,
  ListChecks,
  Pencil,
  Plus,
  Send,
  Settings,
  Settings2,
  Shield,
  Swords,
  Trophy,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { useLeagueCtx } from '@mm/lib/league';
import type { League } from '@mm/lib/types';
import { leagueSport, sportMeta } from '@mm/sports/registry';
import { leagueOwnTabs, useLeagueRowItems, useToDoItems, useToDoSummary } from '@mm/components/organizer/hubData';
import { type LeagueRowItem, type LeagueRowKind, type ToDoItem, type ToDoKind } from '@mm/components/organizer/hubLogic';
import { openLink } from '@/lib/links';
import { ScorersSheet } from '@/components/scorers/ScorersSheet';
import { Card, Divider, ListRow, Loading, RowIcon, SectionHeader, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * Organizar en la app del teléfono (src/components/organizer/Hub.tsx y LeaguePicker.tsx de la web, con los mismos
 * datos: src/components/organizer/hubData.ts): «Por hacer» (solo lo que tiene algo, con su número), «La liga» (cada
 * fila a su pantalla de Organizar) y la ficha de la liga con «Lo que organizas» para cambiar de liga.
 */

/** El globo con el número (en el color del deporte). */
export function CountBubble({ n }: { n: number }) {
  const c = useColors();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no" style={[styles.bubble, { backgroundColor: c.accent }]}>
      <Txt style={{ color: c.accentFg, fontFamily: font.bold, fontSize: 13 }}>{n > 99 ? '99+' : n}</Txt>
    </View>
  );
}

const TODO_ICONS: Record<ToDoKind, LucideIcon> = {
  aprobar: ClipboardCheck,
  disputes: Swords,
  overdue: Hourglass,
  reclamos: UserCheck,
  buzon: Inbox,
  waitlists: Users,
  reportes: Flag,
  confirmar: BadgeCheck,
  equipos: Trophy,
  paso: ListChecks,
};

const LEAGUE_ICONS: Record<LeagueRowKind, LucideIcon> = {
  own: Settings2,
  gente: Users,
  temporada: Calendar,
  anotadores: Pencil,
  avisar: Send,
  insignias: Award,
  ajustes: Settings,
  buzon: Inbox,
  reportes: Flag,
};

/** Los íconos de las pantallas propias del deporte (los mismos de la web). */
const OWN_ICONS: Record<string, LucideIcon> = { equipos: Shield, campos: Flag, nadadores: Users, clubes: Shield, parejas: Users };

/** «Por hacer»: una fila por cosa, con su número (o flecha). Nada si no hay nada (mientras carga, la ruedita). */
function ToDoSection({ items, loading }: { items: readonly ToDoItem[]; loading: boolean }) {
  const c = useColors();
  if (!items.length && !loading) return null;
  return (
    <View style={{ gap: 8 }}>
      <SectionHeader title="Por hacer" />
      {!items.length ? (
        <Loading label="Cargando lo que espera" />
      ) : (
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {items.map((it, i) => {
            const Icon = TODO_ICONS[it.kind];
            const warn = it.kind === 'aprobar';
            return (
              <View key={it.key}>
                {i > 0 && <Divider inset={68} />}
                <ListRow
                  icon={
                    warn ? (
                      <View style={[styles.icon, { backgroundColor: c.warnSoft }]}>
                        <Icon size={20} color={c.warn} />
                      </View>
                    ) : (
                      <RowIcon>
                        <Icon size={20} color={c.accent} />
                      </RowIcon>
                    )
                  }
                  title={it.title}
                  subtitle={it.subtitle || null}
                  accessibilityLabel={it.count ? `${it.title}: ${it.count}` : undefined}
                  right={it.count ? <CountBubble n={it.count} /> : undefined}
                  chevron={!it.count}
                  onPress={() => openLink(it.to)}
                />
              </View>
            );
          })}
        </Card>
      )}
    </View>
  );
}

/** «La liga» (o «El torneo»): lo que se configura, cada fila a su pantalla de Organizar. */
function LeagueSection({ toDo }: { toDo: readonly ToDoItem[] }) {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const own = leagueOwnTabs(league);
  const rows = useLeagueRowItems(toDo, own);
  const [scorers, setScorers] = useState(false);
  const open = (r: LeagueRowItem) => {
    // Las pantallas que la app tiene (links.ts, ADMIN_SCREENS) se abren aquí; las demás, en la web.
    if (r.tab) openLink(`/l/${lid}/admin?tab=${r.tab}`);
    // Anotadores abre su hoja aquí mismo.
    else setScorers(true);
  };
  return (
    <View style={{ gap: 8 }}>
      <SectionHeader title={league.kind === 'torneo' ? 'El torneo' : 'La liga'} />
      <Card padded={false} style={{ overflow: 'hidden' }}>
        {rows.map((r, i) => {
          const ownKey = r.kind === 'own' ? r.key.slice('own:'.length) : null;
          const Icon = (ownKey && OWN_ICONS[ownKey]) || LEAGUE_ICONS[r.kind];
          return (
            <View key={r.key}>
              {i > 0 && <Divider inset={68} />}
              <ListRow
                icon={
                  <RowIcon>
                    <Icon size={19} color={c.accent} />
                  </RowIcon>
                }
                title={r.title}
                subtitle={r.subtitle ?? null}
                accessibilityLabel={r.tab ? undefined : `${r.title}: ${r.subtitle ?? ''}`}
                onPress={() => open(r)}
              />
            </View>
          );
        })}
      </Card>
      <ScorersSheet league={league} open={scorers} onClose={() => setScorers(false)} />
    </View>
  );
}

/** Organizar de una liga: «Por hacer» (solo si hay algo) y «La liga». Va dentro de su LeagueContext. */
export function OrganizeHub() {
  const { league } = useLeagueCtx();
  const toDo = useToDoItems(leagueOwnTabs(league));
  return (
    <View style={{ gap: 24 }}>
      <ToDoSection items={toDo.items} loading={toDo.loading} />
      <LeagueSection toDo={toDo.items} />
    </View>
  );
}

/** El ícono del deporte de la liga en su cuadrito. */
function LeagueMark({ league, size }: { league: Pick<League, 'id' | 'sport'>; size: number }) {
  const c = useColors();
  const Icon = sportMeta(leagueSport(league as League))?.icon;
  return Icon ? <Icon size={size} color={c.accent} /> : null;
}

/**
 * La ficha de la liga debajo de «Organizar» («◎ Liga de los martes ⌄»): redonda, en el color del deporte. Abre la lista
 * de lo que organizas.
 */
export function LeaguePickerChip({ league, onOpen }: { league: Pick<League, 'id' | 'sport' | 'name'> | null; onOpen: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={league ? `${league.name}: cambiar de liga` : 'Elegir la liga'}
      onPress={onOpen}
      style={({ pressed }) => [styles.chip, { backgroundColor: c.surface, opacity: pressed ? 0.85 : 1 }]}
    >
      {league && <LeagueMark league={league} size={16} />}
      <Txt variant="bodyStrong" numberOfLines={1} style={{ fontSize: 14, flexShrink: 1 }}>
        {league?.name ?? 'Elegir la liga'}
      </Txt>
      <ChevronDown size={14} color={c.fg2} strokeWidth={2.4} />
    </Pressable>
  );
}

/** Una liga de la lista: lo que espera en ella y su número (o la marca, si es la que se está viendo). */
function PickRow({ league, current, onPick }: { league: League; current: boolean; onPick: () => void }) {
  const c = useColors();
  const todo = useToDoSummary(league.id);
  const total = todo.count;
  return (
    <ListRow
      icon={
        <RowIcon>
          <LeagueMark league={league} size={20} />
        </RowIcon>
      }
      title={league.name}
      subtitle={todo.line || (todo.loading ? null : 'Todo al día')}
      accessibilityLabel={total > 0 ? `${league.name}: ${total} ${total === 1 ? 'pendiente' : 'pendientes'}` : current ? `${league.name} (la que ves)` : league.name}
      right={total > 0 ? <CountBubble n={total} /> : current ? <Check size={16} color={c.accent} strokeWidth={2.6} /> : undefined}
      chevron={false}
      onPress={onPick}
    />
  );
}

/** La hoja «Lo que organizas»: tus ligas y torneos (con lo que espera en cada uno) y «Crear una liga o un torneo». */
export function LeaguePickerSheet({
  open,
  onClose,
  leagues,
  current,
  onPick,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  leagues: readonly League[];
  current: string | null;
  onPick: (lid: string) => void;
  onCreate: () => void;
}) {
  const c = useColors();
  return (
    <Sheet open={open} onClose={onClose} title="Lo que organizas" subtitle="Elige la liga o el torneo">
      <View style={{ marginHorizontal: -16 }}>
        {leagues.map((l) => (
          <PickRow
            key={l.id}
            league={l}
            current={l.id === current}
            onPick={() => {
              onClose();
              onPick(l.id);
            }}
          />
        ))}
        <ListRow
          icon={
            <RowIcon>
              <Plus size={20} color={c.accent} strokeWidth={2.4} />
            </RowIcon>
          }
          title="Crear una liga o un torneo"
          chevron={false}
          onPress={() => {
            onClose();
            onCreate();
          }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  bubble: { minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    height: 36,
    borderRadius: 18,
    paddingLeft: 13,
    paddingRight: 12,
    marginVertical: 4,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
});
