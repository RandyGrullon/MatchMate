/**
 * Las pestañas del evento del boliche en Pro (las de EventPage de la web, con su misma lógica: eventPro.ts): quien
 * organiza una práctica, Planilla · Resultados · Pistas; quien organiza un torneo, Inscritos · Equipos · Pistas · Planilla
 * · Clasificación; el anotador del torneo, Planilla · Clasificación · Pistas; los demás, la Planilla (solo mirar) y los
 * resultados. Lo de cada una va aquí mismo: la Planilla (con «Por aprobar» arriba para el admin), la clasificación, las
 * pistas, los equipos y los inscritos. Hasta 3, en un segmentado; con 5, en una fila de píldoras que se desliza. La
 * elegida va en `?tab=` (la pone quien la usa). Va dentro de LeagueScope.
 */
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { BowlingEvent, Entry, LiveScore, Player, Submission } from '@mm/lib/types';
import { useLeagueCtx } from '@mm/lib/league';
import type { EventTab } from '@mm/components/event/eventPro';
import { ApprovalCard } from '@/components/bowling/ApprovalCard';
import { Standings } from '@/components/bowling/Standings';
import { LanesPanel } from '@/components/lanes/LanesPanel';
import { Loading, Segmented, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { EventSheet } from './EventSheet';
import { EventTeams } from './EventTeams';
import { RosterTab } from './RosterTab';

export function EventProTabs({
  tabs,
  tab,
  onTab,
  event,
  entries,
  players,
  subs,
  live,
  canScore,
  loading,
  onOpen,
}: {
  tabs: readonly { key: EventTab; label: string }[];
  tab: EventTab;
  onTab: (tab: EventTab) => void;
  event: BowlingEvent;
  entries: Entry[];
  players: Player[];
  /** Los envíos del evento (los pendientes van en «Por aprobar»; los demás, en la Planilla). */
  subs: Submission[];
  live: LiveScore[];
  canScore: boolean;
  /** Todavía llegan los inscritos o los jugadores. */
  loading: boolean;
  /** Tocar un nombre de la Planilla abre su juego (el detalle). */
  onOpen?: (entry: Entry) => void;
}) {
  const c = useColors();
  const { lid, league, isAdmin, myPlayerId } = useLeagueCtx();
  return (
    <View style={{ gap: 16 }}>
      {tabs.length <= 3 ? (
        <Segmented label="Secciones del evento" options={[...tabs]} value={tab} onChange={onTab} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" accessibilityLabel="Secciones del evento" contentContainerStyle={{ gap: 8 }}>
          {tabs.map((t) => {
            const on = t.key === tab;
            return (
              <Pressable
                key={t.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => onTab(t.key)}
                style={[styles.chip, { backgroundColor: on ? c.accent : c.surface2 }]}
              >
                <Txt style={{ fontFamily: font.semibold, fontSize: 14, color: on ? c.accentFg : c.fg }}>{t.label}</Txt>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {loading ? (
        <Loading />
      ) : tab === 'inscritos' ? (
        <RosterTab event={event} entries={entries} players={players} />
      ) : tab === 'equipos' ? (
        <EventTeams event={event} entries={entries} players={players} />
      ) : tab === 'pistas' ? (
        <LanesPanel event={event} entries={entries} players={players} />
      ) : tab === 'juegos' ? (
        <View style={{ gap: 12 }}>
          {isAdmin && <ApprovalCard league={league} event={event} subs={subs.filter((s) => s.status === 'pendiente')} entries={entries} players={players} />}
          <EventSheet event={event} entries={entries} players={players} subs={subs} live={live} readOnly={!canScore} onOpen={onOpen} />
        </View>
      ) : (
        <Standings lid={lid} event={event} entries={entries} players={players} me={myPlayerId} readOnly={!isAdmin} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { height: 36, borderRadius: 18, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
});
