/**
 * «•••» de una ronda de golf (el EventMenu de GolfEvent.tsx de la web): Compartir, Publicar en Social (tu tarjeta),
 * Transmitir en vivo y, para el admin, Campo y formato, en Lite «Inscribir y armar grupos · Están en Pro · Usar Pro»
 * (cambia a Pro, como la web), Anotadores, Cerrar o volver a abrir la ronda y Eliminar ronda. El reporte sigue abajo de
 * la ronda (GolfReport). Pone «•••» donde va y, a la vista, sus hojas.
 */
import { useState } from 'react';
import { Platform, Share, View } from 'react-native';
import { router } from 'expo-router';
import { ClipboardPen, Lock, LockOpen, Newspaper, Radio, Settings2, Share2, Trash2, Users } from 'lucide-react-native';
import { deleteEvent } from '@mm/lib/data';
import { closeGolfRound, type GolfCardDoc, type GolfRoundFull } from '@mm/lib/data/golf';
import { streamFor, useLeagueStreams } from '@mm/lib/data/streams';
import { useLeagueCtx } from '@mm/lib/league';
import { shareOrigin } from '@mm/lib/origin';
import type { BowlingEvent } from '@mm/lib/types';
import { useIsPro } from '@mm/lib/useMode';
import { canStartStream } from '@mm/components/live/logic';
import { useSwitchMode } from '@mm/components/mode/toast';
import { golfPostText, leagueShareTarget } from '@mm/components/posts/shareGame';
import { holesDone, isComplete } from '@mm/pages/sports/golf/logic';
import { confirmAsync, toast } from '@/components/feedback';
import { MenuRow } from '@/components/esports/inputs';
import { StartStreamSheet } from '@/components/live/StartStreamSheet';
import { ScorersSheet } from '@/components/scorers/ScorersSheet';
import { PublishGameSheet } from '@/components/social/ShareToSocial';
import { Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { MoreButton, SHEET_CLOSE_MS, golfAction } from './parts';

type MenuKey = 'menu' | 'publicar' | 'vivo' | 'anotadores';

export function GolfEventMenu({
  eventId,
  event,
  title,
  round,
  cards,
  serverCards,
  myCard,
  embedded,
  onEdit,
}: {
  eventId: string;
  event: BowlingEvent;
  /** El nombre de la ronda en pantalla. */
  title: string;
  round: GolfRoundFull | null;
  /** Las tarjetas con lo anotado en este teléfono. */
  cards: readonly GolfCardDoc[];
  /** Las del servidor (quién juega, para «Anotadores»). */
  serverCards: readonly GolfCardDoc[];
  myCard: GolfCardDoc | null;
  /** La ronda es la portada de un torneo sin liga (el link compartido es el del torneo). */
  embedded: boolean;
  /** Abrir «Campo y formato». */
  onEdit: () => void;
}) {
  const c = useColors();
  const ctx = useLeagueCtx();
  const { lid, league, isAdmin, member } = ctx;
  const standalone = league.kind === 'torneo';
  const streams = useLeagueStreams(lid).data ?? [];
  const canStream = canStartStream(ctx);
  const canLive = canStream && !streamFor(streams, { eventId });
  const isPro = useIsPro();
  const switchMode = useSwitchMode();
  const [open, setOpen] = useState<MenuKey | null>(null);

  // Tu tarjeta como publicación: miembro de una liga sin menores, con la tarjeta terminada, firmada o la ronda cerrada.
  const shareTarget = leagueShareTarget({ lid, league, member });
  const myGross = myCard ? myCard.strokes.reduce<number>((n, s) => n + (s ?? 0), 0) : 0;
  const canPublish = !!shareTarget && !!round && !!myCard && holesDone(myCard) > 0 && (round.closed || myCard.signed || isComplete(myCard));

  const close = () => setOpen(null);
  // Lo que sale del menú espera a que la hoja se vaya (el aviso del sistema o compartir no salen encima de otra hoja).
  const after = (fn: () => void) => {
    close();
    setTimeout(fn, SHEET_CLOSE_MS);
  };

  async function share() {
    const url = `${shareOrigin(null)}${standalone && embedded ? `/l/${lid}` : `/l/${lid}/e/${eventId}`}`;
    const name = `${title} · MatchMate`;
    try {
      await Share.share(Platform.OS === 'ios' ? { url, title: name } : { message: url, title: name }, { dialogTitle: name, subject: name });
    } catch {
      toast('No se pudo compartir.', 'error');
    }
  }

  async function toggleClosed() {
    if (!round) return;
    if (!round.closed) {
      const unsigned = cards.filter((x) => !x.signed && !x.dq && holesDone(x) > 0).length;
      const unfinished = cards.filter((x) => !x.dq && !isComplete(x)).length;
      const ok = await confirmAsync({
        title: '¿Cerrar la ronda?',
        message: [
          'Quedan los resultados finales y cuentan para el orden de mérito. Nadie anota más (se puede volver a abrir).',
          unfinished > 0 ? `${unfinished} sin terminar: salen como «No terminó».` : null,
          unsigned > 0 ? `${unsigned} tarjetas sin firmar (cuentan igual; puedes descalificarlas).` : null,
        ]
          .filter(Boolean)
          .join('\n\n'),
        confirmText: 'Cerrar ronda',
      });
      if (!ok) return;
    }
    await golfAction(() => closeGolfRound(lid, eventId, !round.closed), round.closed ? 'Ronda abierta' : 'Ronda cerrada');
  }

  async function remove() {
    const ok = await confirmAsync({ title: `¿Eliminar ${title}?`, message: 'Se borran sus inscritos y tarjetas. No se puede deshacer.', confirmText: 'Eliminar', danger: true });
    if (!ok) return;
    // Primero se sale de la ronda (a la liga; en un torneo sin liga, a sus ajustes), como la web.
    router.dismissTo(standalone ? { pathname: '/l/[lid]/ajustes', params: { lid } } : { pathname: '/l/[lid]', params: { lid } });
    await golfAction(() => deleteEvent(lid, eventId), 'Ronda eliminada');
  }

  const icon = (I: typeof Share2, danger = false) => <I size={20} color={danger ? c.danger : c.fg2} />;

  return (
    <>
      <MoreButton onPress={() => setOpen('menu')} />
      <Sheet open={open === 'menu'} onClose={close} title={title}>
        <View style={{ gap: 2 }}>
          <MenuRow icon={icon(Share2)} label="Compartir" hint="Manda el link de la ronda" onPress={() => after(() => void share())} />
          {canPublish && <MenuRow icon={icon(Newspaper)} label="Publicar en Social" hint="Tu tarjeta, con lo que quieras contar" onPress={() => setOpen('publicar')} />}
          {canLive && <MenuRow icon={icon(Radio)} label="Transmitir en vivo" hint="Pon el link de YouTube, Twitch, Facebook…" onPress={() => setOpen('vivo')} />}
          {isAdmin && !round?.closed && (
            <MenuRow
              icon={icon(Settings2)}
              label={round ? 'Campo y formato' : 'Elegir campo'}
              hint={round ? 'Campo, hoyos y formato' : 'En qué campo y con qué formato'}
              onPress={() => after(onEdit)}
            />
          )}
          {/* En Lite, las herramientas de «Jugadores» del admin están en Pro: cambia el modo (con «Deshacer»). */}
          {isAdmin && !isPro && round && !round.closed && (
            <MenuRow
              icon={icon(Users)}
              label="Inscribir y armar grupos"
              hint="Están en Pro · Usar Pro"
              onPress={() => {
                close();
                void switchMode('pro');
              }}
            />
          )}
          {isAdmin && <MenuRow icon={icon(ClipboardPen)} label="Anotadores" hint="Quién anota esta ronda" onPress={() => setOpen('anotadores')} />}
          {isAdmin && round && (
            <MenuRow
              icon={icon(round.closed ? LockOpen : Lock)}
              label={round.closed ? 'Volver a abrir la ronda' : 'Cerrar la ronda'}
              hint={round.closed ? 'Para corregir tarjetas' : 'Resultados finales y orden de mérito'}
              onPress={() => after(() => void toggleClosed())}
            />
          )}
          {isAdmin && <MenuRow icon={icon(Trash2, true)} label="Eliminar ronda" danger onPress={() => after(() => void remove())} />}
        </View>
      </Sheet>
      {canPublish && myCard && round && (
        <PublishGameSheet
          open={open === 'publicar'}
          onClose={close}
          league={shareTarget}
          game={{ kind: 'golf', id: myCard.id, playerId: myCard.playerId }}
          text={golfPostText(myGross, round.courseName)}
          preview={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingHorizontal: 14, paddingVertical: 12 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="bodyStrong" numberOfLines={1} style={{ fontSize: 14 }}>
                  {title}
                </Txt>
                <Txt tone="muted" numberOfLines={1} style={{ fontSize: 12, marginTop: 2 }}>
                  {[round.courseName, `${holesDone(myCard)} hoyos`].filter(Boolean).join(' · ')}
                </Txt>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Txt style={{ fontFamily: font.bold, fontSize: 24 }}>{myCard.dq ? 'DQ' : String(myGross)}</Txt>
                <Txt tone="muted" style={{ fontSize: 11 }}>
                  Golpes
                </Txt>
              </View>
            </View>
          }
        />
      )}
      {/* La hoja sigue abierta aunque la opción se vaya al empezar («Ya estás en vivo»). */}
      {(canStream || open === 'vivo') && <StartStreamSheet lid={lid} eventId={eventId} defaultTitle={title} open={open === 'vivo'} onClose={close} />}
      {isAdmin && (
        <ScorersSheet
          league={league}
          open={open === 'anotadores'}
          onClose={close}
          target={{ scope: 'evento', refId: event.id, title: event.name || (league.kind === 'torneo' ? league.name : title) }}
          participants={serverCards.map((x) => x.playerId)}
        />
      )}
    </>
  );
}
