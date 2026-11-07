import { useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ClipboardPen, Download, FileSpreadsheet, ListOrdered, Newspaper, Settings, Share2, Trash2, Zap } from 'lucide-react-native';
import { deleteEvent } from '@mm/lib/data';
import { bowlingEventSheets } from '@mm/lib/exportExcel';
import { eventLabel } from '@mm/lib/format';
import { shareOrigin } from '@mm/lib/origin';
import type { BowlingEvent, Entry, League, Member, Player } from '@mm/lib/types';
import { leagueShareTarget, bowlingPostText } from '@mm/components/posts/shareGame';
import { EVENT_DELETED, EVENT_SETTINGS_HINT, canPublishEvent, deleteEventConfirm, deleteEventLabel, eventSettingsLabel, publishableScores } from '@mm/components/event/eventActions';
import { EXCEL_DONE, EXCEL_HINT, EXCEL_LABEL, PRO_TOOLS_HINT, eventExcelName, proToolsLabel, resultsHint, resultsTitle } from '@mm/components/event/eventPro';
import { useSwitchMode } from '@mm/components/mode/toast';
import { shareExcel } from '@/components/bowling/shareExcel';
import { Standings } from '@/components/bowling/Standings';
import { confirmAsync } from '@/components/feedback';
import { ScorersSheet } from '@/components/scorers/ScorersSheet';
import { ScoreChips } from '@/components/social/GameCard';
import { PublishGameSheet } from '@/components/social/ShareToSocial';
import { MenuSheet, MoreButton, runAction, type MenuItem } from '@/components/swimming/parts';
import { Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { EventFormSheet } from './EventFormSheet';

/**
 * «•••» de un evento del boliche (EventMenu de EventPage en la web): Compartir (el link del evento), «Publicar en Social»
 * (tus juegos, si la liga deja y ya anotaste alguno) y, para quien organiza, Anotadores (en un torneo), Ajustes de la
 * práctica o del torneo (EventFormSheet) y Eliminar (pregunta antes y vuelve a la liga). Lo que cambia con el modo (`pro`:
 * Pro o un link de Pro), como la web: fuera de Pro, «Resultados» / «Clasificación» (una hoja con la tabla), «Excel» de la
 * práctica para quien organiza y, para quien organiza o anota, «Planilla, aprobar y pistas · Están en Pro · Usar Pro»; en
 * Pro, el botón «Excel» de la práctica va arriba, junto a «•••». Pinta los botones y sus hojas.
 */
export function BowlingEventMenu({
  league,
  member,
  event,
  entries,
  players,
  mine,
  title,
  pro,
  canScore,
}: {
  league: League;
  member: Member | null;
  event: BowlingEvent;
  entries: readonly Entry[];
  players: readonly Player[];
  /** Tu participación en el evento (si juegas). */
  mine: Entry | null;
  /** El título de la pantalla (va en la hoja y en lo que se publica). */
  title: string;
  /** Se ve lo de Pro (Pro, o un link de Pro de quien organiza o anota). */
  pro: boolean;
  /** Anota los juegos de todos (canScoreEvent). */
  canScore: boolean;
}) {
  const c = useColors();
  const lid = league.id;
  const isAdmin = member?.role === 'owner' || member?.role === 'admin';
  const isTorneo = event.type === 'torneo';
  // Torneo sin liga: el evento es la portada (el link es el del torneo).
  const standalone = league.kind === 'torneo';
  const switchMode = useSwitchMode();
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<'ajustes' | 'publicar' | 'anotadores' | 'resultados' | null>(null);
  const [exporting, setExporting] = useState(false);

  // Tus juegos de este evento como publicación: si eres miembro de una liga sin menores y ya anotaste alguno.
  const shareTarget = leagueShareTarget({ lid, league, member });
  const canPublish = canPublishEvent(shareTarget, mine);

  const open = (s: 'ajustes' | 'publicar' | 'anotadores' | 'resultados') => {
    setMenu(false);
    setSheet(s);
  };

  async function share() {
    setMenu(false);
    const url = `${shareOrigin(null)}${standalone ? `/l/${lid}` : `/l/${lid}/e/${event.id}`}`;
    await Share.share({ message: `${eventLabel(event)} · MatchMate\n${url}`, url }).catch(() => undefined);
  }

  async function remove() {
    setMenu(false);
    const ok = await confirmAsync(deleteEventConfirm(eventLabel(event)));
    if (!ok) return;
    // Un torneo sin liga va a sus ajustes (de ahí se borra el torneo); si no, a la liga.
    if (standalone) router.navigate({ pathname: '/l/[lid]/ajustes', params: { lid } });
    else router.navigate({ pathname: '/l/[lid]', params: { lid } });
    await runAction(() => deleteEvent(lid, event.id), EVENT_DELETED);
  }

  // El Excel de la práctica (los juegos de todos): las mismas hojas de la web, con la hoja de compartir del teléfono.
  async function exportExcel() {
    if (exporting) return;
    setExporting(true);
    await runAction(() => shareExcel(eventExcelName(event), bowlingEventSheets(event, [...entries], [...players]), `${eventLabel(event)} · ${EXCEL_LABEL}`), EXCEL_DONE);
    setExporting(false);
    setMenu(false);
  }

  const items: MenuItem[] = [
    { key: 'compartir', icon: Share2, label: 'Compartir', hint: 'Manda el link del evento', onPress: () => void share() },
    ...(canPublish ? [{ key: 'publicar', icon: Newspaper, label: 'Publicar en Social', hint: 'Tus juegos, con lo que quieras contar', onPress: () => open('publicar') }] : []),
    ...(!pro ? [{ key: 'resultados', icon: ListOrdered, label: resultsTitle(isTorneo), hint: resultsHint(isTorneo), onPress: () => open('resultados') }] : []),
    ...(!pro && isAdmin && !isTorneo ? [{ key: 'excel', icon: FileSpreadsheet, label: EXCEL_LABEL, hint: EXCEL_HINT, onPress: () => void exportExcel(), busy: exporting }] : []),
    ...(!pro && canScore
      ? [
          {
            key: 'pro',
            icon: Zap,
            label: proToolsLabel(isTorneo),
            hint: PRO_TOOLS_HINT,
            onPress: () => {
              setMenu(false);
              void switchMode('pro');
            },
          },
        ]
      : []),
    ...(isAdmin && isTorneo ? [{ key: 'anotadores', icon: ClipboardPen, label: 'Anotadores', hint: 'Quién anota este torneo', onPress: () => open('anotadores') }] : []),
    ...(isAdmin
      ? [
          { key: 'ajustes', icon: Settings, label: eventSettingsLabel(isTorneo), hint: EVENT_SETTINGS_HINT, onPress: () => open('ajustes') },
          { key: 'eliminar', icon: Trash2, label: deleteEventLabel(isTorneo), onPress: () => void remove() },
        ]
      : []),
  ];

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {/* Pro: «Excel» con texto junto a «•••» (quien organiza una práctica). */}
        {pro && isAdmin && !isTorneo && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Descargar Excel"
            accessibilityState={{ busy: exporting, disabled: exporting }}
            disabled={exporting}
            hitSlop={{ top: 4, bottom: 4 }}
            onPress={() => void exportExcel()}
            style={({ pressed }) => [styles.excel, { backgroundColor: c.surface2, opacity: exporting ? 0.7 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
          >
            {exporting ? <ActivityIndicator size="small" color={c.fg} /> : <Download size={16} color={c.fg} />}
            <Txt style={{ fontSize: 14, fontFamily: font.semibold }}>{EXCEL_LABEL}</Txt>
          </Pressable>
        )}
        <MoreButton onPress={() => setMenu(true)} />
      </View>
      <MenuSheet open={menu} onClose={() => setMenu(false)} title={title} items={items} />
      {sheet === 'ajustes' && isAdmin && <EventFormSheet lid={lid} type={event.type} event={event} onClose={() => setSheet(null)} />}
      {/* Lite: la clasificación (o los resultados) del evento en una hoja, solo mirar. */}
      <Sheet open={sheet === 'resultados'} onClose={() => setSheet(null)} title={resultsTitle(isTorneo)} subtitle={title}>
        {sheet === 'resultados' && <Standings lid={lid} event={event} entries={[...entries]} players={[...players]} me={member?.playerId ?? null} />}
      </Sheet>
      {canPublish && mine && shareTarget && (
        <PublishGameSheet
          open={sheet === 'publicar'}
          onClose={() => setSheet(null)}
          league={shareTarget}
          game={{ kind: 'bowling', id: mine.id, playerId: mine.playerId }}
          text={bowlingPostText(mine.scores)}
          preview={
            <View style={[styles.preview, { borderColor: c.line, backgroundColor: c.surface }]}>
              <Txt numberOfLines={1} style={{ fontSize: 14, fontFamily: font.semibold }}>
                {title}
              </Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <ScoreChips scores={publishableScores(mine)} />
              </View>
            </View>
          }
        />
      )}
      {isAdmin && isTorneo && (
        <ScorersSheet
          league={league}
          open={sheet === 'anotadores'}
          onClose={() => setSheet(null)}
          target={{ scope: 'evento', refId: event.id, title: event.name || (standalone ? league.name : eventLabel(event)) }}
          participants={entries.map((e) => e.playerId)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  preview: { gap: 8, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  excel: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, borderRadius: 18, paddingHorizontal: 13 },
});
