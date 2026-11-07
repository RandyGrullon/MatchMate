import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ClipboardPen, Newspaper, Settings, Share2, Trash2 } from 'lucide-react-native';
import { deleteEvent } from '@mm/lib/data';
import { eventLabel } from '@mm/lib/format';
import { shareOrigin } from '@mm/lib/origin';
import type { BowlingEvent, Entry, League, Member } from '@mm/lib/types';
import { leagueShareTarget, bowlingPostText } from '@mm/components/posts/shareGame';
import { EVENT_DELETED, EVENT_SETTINGS_HINT, canPublishEvent, deleteEventConfirm, deleteEventLabel, eventSettingsLabel, publishableScores } from '@mm/components/event/eventActions';
import { confirmAsync } from '@/components/feedback';
import { ScorersSheet } from '@/components/scorers/ScorersSheet';
import { ScoreChips } from '@/components/social/GameCard';
import { PublishGameSheet } from '@/components/social/ShareToSocial';
import { MenuSheet, MoreButton, runAction, type MenuItem } from '@/components/swimming/parts';
import { Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { EventFormSheet } from './EventFormSheet';

/**
 * «•••» de un evento del boliche (EventMenu de EventPage en la web), con lo que hay en Lite: Compartir (el link del
 * evento), «Publicar en Social» (tus juegos, si la liga deja y ya anotaste alguno) y, para quien organiza, Anotadores (en
 * un torneo), Ajustes de la práctica o del torneo (EventFormSheet) y Eliminar (pregunta antes y vuelve a la liga).
 * Pinta el botón «•••» y sus hojas.
 */
export function BowlingEventMenu({
  league,
  member,
  event,
  entries,
  mine,
  title,
}: {
  league: League;
  member: Member | null;
  event: BowlingEvent;
  entries: readonly Entry[];
  /** Tu participación en el evento (si juegas). */
  mine: Entry | null;
  /** El título de la pantalla (va en la hoja y en lo que se publica). */
  title: string;
}) {
  const c = useColors();
  const lid = league.id;
  const isAdmin = member?.role === 'owner' || member?.role === 'admin';
  const isTorneo = event.type === 'torneo';
  // Torneo sin liga: el evento es la portada (el link es el del torneo).
  const standalone = league.kind === 'torneo';
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<'ajustes' | 'publicar' | 'anotadores' | null>(null);

  // Tus juegos de este evento como publicación: si eres miembro de una liga sin menores y ya anotaste alguno.
  const shareTarget = leagueShareTarget({ lid, league, member });
  const canPublish = canPublishEvent(shareTarget, mine);

  const open = (s: 'ajustes' | 'publicar' | 'anotadores') => {
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

  const items: MenuItem[] = [
    { key: 'compartir', icon: Share2, label: 'Compartir', hint: 'Manda el link del evento', onPress: () => void share() },
    ...(canPublish ? [{ key: 'publicar', icon: Newspaper, label: 'Publicar en Social', hint: 'Tus juegos, con lo que quieras contar', onPress: () => open('publicar') }] : []),
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
      <MoreButton onPress={() => setMenu(true)} />
      <MenuSheet open={menu} onClose={() => setMenu(false)} title={title} items={items} />
      {sheet === 'ajustes' && isAdmin && <EventFormSheet lid={lid} type={event.type} event={event} onClose={() => setSheet(null)} />}
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
});
