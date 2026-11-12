import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Send, SquarePen } from 'lucide-react-native';
import { eventTitle, formatDateLong } from '@mm/lib/format';
import { nextGameLabel, partialGame, type GameCell } from '@mm/lib/useNextGame';
import { useEventEntries } from '@mm/lib/data/entries';
import { useEventLive } from '@mm/lib/data/liveScores';
import { usePlayers } from '@mm/lib/data/players';
import { useEventSubmissions } from '@mm/lib/data/submissions';
import { liveInfo } from '@mm/lib/live';
import { useIsPro } from '@mm/lib/useMode';
import { useNow } from '@mm/lib/useNow';
import { boardRows } from '@mm/components/event/board';
import { PRO_ONLY_TEXT, currentEventTab, eventMeta, eventTabOf, eventTabs, liveWhenText, showsPro, type EventTab } from '@mm/components/event/eventPro';
import { gameKey, readGameDraft } from '@mm/components/frames/draftMemory';
import { useSwitchMode } from '@mm/components/mode/toast';
import type { Entry } from '@mm/lib/types';
import { ApprovalCard } from '@/components/bowling/ApprovalCard';
import { EventBoard } from '@/components/bowling/EventBoard';
import { EventGameDetail } from '@/components/bowling/GameDetail';
import { LaneChip } from '@/components/bowling/LaneChip';
import { Standings } from '@/components/bowling/Standings';
import { TourneyAnnouncement } from '@/components/bowling/TourneyAnnouncement';
import { BowlingEventMenu } from '@/components/event/BowlingEventMenu';
import { EventProTabs } from '@/components/event/EventProTabs';
import { EventToolsRows } from '@/components/event/EventToolsRows';
import { EventPrizes } from '@/components/prizes/SportPrizes';
import { BowlingReport } from '@/components/tournamentReport/SportReports';
import { Badge, Button, Card, Empty, Loading, Screen, SectionHeader, Txt } from '@/components/ui';
import { LeagueScope } from '@/components/league/LeagueScope';
import { canScoreEvent } from '@mm/lib/league';
import { useMyGames } from '@/lib/useMyGames';
import { useColors } from '@/theme/theme';
import { font, radius } from '@/theme/tokens';

/** Un juego de «Tus juegos»: su número, los pinos y en qué va. `compact` (Pro): más chico, en fila de hasta 5. */
function Cell({ n, cell, compact }: { n: number; cell: GameCell; compact?: boolean }) {
  const c = useColors();
  const value = cell.kind === 'vacio' ? '–' : cell.kind === 'medias' ? (cell.score ?? '…') : cell.score;
  const note =
    cell.kind === 'tabla' ? (cell.counted ? 'cuenta' : 'por aprobar') : cell.kind === 'telefono' ? 'en el teléfono' : cell.kind === 'enviado' ? 'enviado' : cell.kind === 'medias' ? 'a medias' : 'por anotar';
  const strong = cell.kind === 'tabla' || cell.kind === 'telefono' || cell.kind === 'enviado';
  return (
    <View
      accessible
      accessibilityLabel={`Juego ${n}: ${cell.kind === 'vacio' ? 'por anotar' : `${value}, ${note}`}`}
      style={[styles.cell, { backgroundColor: c.surface2 }, compact && styles.cellCompact]}
    >
      <Txt variant="small" tone="muted">
        J{n}
      </Txt>
      <Txt style={{ fontFamily: font.bold, fontSize: compact ? 21 : 26, color: strong ? c.fg : c.faint }}>{String(value)}</Txt>
      <Txt variant="small" tone={cell.kind === 'telefono' ? 'warn' : cell.kind === 'tabla' && cell.counted ? 'ok' : 'muted'} numberOfLines={1} style={compact ? { fontSize: 11 } : undefined}>
        {note}
      </Txt>
    </View>
  );
}

/**
 * Un evento de boliche (práctica o torneo), como la web (src/pages/EventPage.tsx, con la lógica del modo en
 * src/components/event/eventPro.ts): «•••» (compartir, publicar tus juegos, ajustes, eliminar y lo que cambia con el
 * modo: BowlingEventMenu) y `?anotar=1` (un link de Hoy o de la liga) abre de una el próximo juego por anotar.
 * `embedded`: dentro del inicio de un torneo sin liga (TournamentHome de la web), sin «‹ liga» ni su propia pantalla.
 * - Lite: «Tus juegos» con lo que sigue (anotar, seguir el que va a medias, enviar), «Por aprobar» para el admin, para
 *   quien organiza o anota las filas Planilla, Pistas y Equipos (sus pantallas) y «Cómo van todos» o la clasificación.
 * - Pro (o un link de Pro con `?tab=` de quien organiza o anota, con «Esto es de Pro · Usar Pro»): la línea corta con «En
 *   juego», «Tus juegos» compacta (quien lleva la Planilla, solo si tiene juegos sin enviar) y las pestañas de la web aquí
 *   mismo (EventProTabs): Planilla, Resultados o Clasificación, Pistas y, en un torneo, Inscritos y Equipos.
 */
/** La pantalla del evento o, dentro del inicio de un torneo sin liga (`embedded`), solo su contenido con el mismo espacio. */
function Shell({ embedded, children }: { embedded: boolean; children: ReactNode }) {
  return embedded ? <View style={{ gap: 16 }}>{children}</View> : <Screen>{children}</Screen>;
}

export function BowlingEventScreen({ lid, eventId, embedded = false }: { lid: string; eventId: string; embedded?: boolean }) {
  const { anotar, tab: tabParam } = useLocalSearchParams<{ anotar?: string; tab?: string }>();
  const c = useColors();
  const isPro = useIsPro();
  const switchMode = useSwitchMode();
  const now = useNow();
  const g = useMyGames(lid, eventId);
  // Lo de todos: lo enviado (lo que falta por aprobar), la planilla y lo que cada uno lleva en su teléfono.
  const subs = useEventSubmissions(lid, eventId);
  const entries = useEventEntries(lid, eventId);
  const live = useEventLive(lid, eventId);
  const players = usePlayers(lid);
  // El detalle de un juego (con me gusta y comentarios): tocar uno de «Tus juegos» que ya está en la tabla (la web).
  const [detail, setDetail] = useState<Entry | null>(null);

  // `?anotar=1` (Hoy, la liga, un link): el próximo juego por anotar sale abierto (MyGamesPanel autoStart de la web). Si
  // se vino de otra pantalla, al cerrar la hoja se vuelve allá (la hoja toma el lugar del evento); si se entró directo,
  // se queda aquí. Ya listo (o si no hay qué anotar), se quita del link.
  const autoStarted = useRef(false);
  const ready = !!g.event.data && !!g.league.data && !!g.playerId && !g.loading && !entries.loading && !subs.loading;
  useEffect(() => {
    if (anotar !== '1' || autoStarted.current || !ready || !g.event.data || !g.league.data) return;
    autoStarted.current = true;
    const first = g.cells.findIndex((x) => x.kind === 'vacio');
    const notYet = g.event.data.date > g.today;
    // En un torneo, quien lo organiza (o anota) juega solo si está inscrito; en una práctica, todos.
    const admin = g.member.data?.role === 'owner' || g.member.data?.role === 'admin';
    const plays = g.event.data.type !== 'torneo' || !canScoreEvent({ isAdmin: admin, member: g.member.data ?? null, league: g.league.data }, 'torneo') || !!g.entry;
    router.setParams({ anotar: undefined });
    if (!plays || notYet || g.closed || first < 0) return;
    const to = { pathname: '/l/[lid]/e/[eventId]/anotar' as const, params: { lid, eventId, juego: String(first + 1) } };
    if (router.canGoBack()) router.replace(to);
    else router.push(to);
  }, [anotar, ready, g.cells, g.event.data, g.league.data, g.member.data, g.entry, g.today, g.closed, lid, eventId]);

  if (g.loading && !g.event.data) return <Loading label="Cargando el evento" />;
  const ev = g.event.data;
  const league = g.league.data;
  if (!ev || !league) {
    return (
      <Shell embedded={embedded}>
        <Empty title="Este evento no existe" action={<Button onPress={() => router.navigate({ pathname: '/l/[lid]', params: { lid } })}>Volver a la liga</Button>} />
      </Shell>
    );
  }
  const inPhone = g.cells.filter((x) => x.kind === 'telefono').length;
  const isAdmin = g.member.data?.role === 'owner' || g.member.data?.role === 'admin';
  const isTorneo = ev.type === 'torneo';
  // Anota los juegos de todos: el admin y, en un torneo, el anotador de la liga (la Planilla y las Pistas).
  const canScore = canScoreEvent({ isAdmin, member: g.member.data ?? null, league }, ev.type);
  // Pro, o un link de Pro (`?tab=`, la Planilla desde un aviso) para quien organiza o anota: lo de Pro se abre igual.
  const requested = tabParam ?? null;
  const pro = showsPro(isPro, canScore, requested);
  const title = eventTitle(ev, 'bowling');
  const pending = subs.data.filter((s) => s.status === 'pendiente');
  // «Cómo van todos»: lo que cuenta suma; lo enviado, lo del teléfono y tu juego a medias se ven aparte.
  const board = boardRows(ev, entries.data, subs.data, live.data, {
    partial: (playerId, _entry, game) => (playerId === g.playerId && g.place ? partialGame(readGameDraft(gameKey(g.place, game))) : null),
  });
  const next = g.next;

  const openEditor = (game: number) => router.push({ pathname: '/l/[lid]/e/[eventId]/anotar', params: { lid, eventId, juego: String(game) } });

  // Enviar: la hoja con la foto del marcador y su lectura con IA (enviar.tsx).
  const send = () => router.push({ pathname: '/l/[lid]/e/[eventId]/enviar', params: { lid, eventId } });

  // Dentro del inicio de un torneo sin liga no hay «‹ liga» (la liga es el torneo): solo el «•••», como la web.
  const topBar = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: embedded ? 'flex-end' : 'space-between', gap: 12 }}>
      {!embedded && (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Volver a ${league.name}`}
        onPress={() => (router.canGoBack() ? router.back() : router.navigate({ pathname: '/l/[lid]', params: { lid } }))}
        style={{ flexDirection: 'row', alignItems: 'center', height: 44, marginLeft: -6, flexShrink: 1 }}
      >
        <ChevronLeft size={24} color={c.accent} />
        <Txt tone="accent" variant="bodyStrong" numberOfLines={1}>
          {league.name}
        </Txt>
      </Pressable>
      )}
      <BowlingEventMenu
        league={league}
        member={g.member.data ?? null}
        event={ev}
        entries={entries.data}
        players={players.data}
        mine={g.entry}
        title={title}
        pro={pro}
        canScore={canScore}
      />
    </View>
  );

  /** «Tus juegos»: grande (Lite) o compacta, con la serie al final (Pro). */
  const myGames = (compact: boolean) => {
    // Pro: la serie y el promedio con lo que ya se sabe (en la tabla, enviado y lo del teléfono), como la web.
    const known = g.cells.flatMap((x) => (x.kind === 'tabla' || x.kind === 'telefono' || x.kind === 'enviado' ? [x.score] : []));
    const average = known.length ? Math.floor(g.series / known.length) : null;
    const columns = Math.max(3, Math.min(g.cells.length + 1, 5));
    return (
      <Card style={{ gap: compact ? 12 : 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <Txt variant="cardTitle" style={compact ? { fontSize: 17, lineHeight: 22 } : undefined}>
            Tus juegos
          </Txt>
          {compact ? (
            average != null && (
              <Txt tone="muted" numberOfLines={1} style={{ fontSize: 13, flexShrink: 1 }}>
                {'Serie '}
                <Txt style={{ fontSize: 13, fontFamily: font.semibold }}>{String(g.series)}</Txt>
                {' · Prom. '}
                <Txt style={{ fontSize: 13, fontFamily: font.semibold }}>{String(average)}</Txt>
              </Txt>
            )
          ) : (
            <Txt variant="meta" tone="muted">
              Serie <Txt variant="bodyStrong">{g.series}</Txt>
            </Txt>
          )}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {g.cells.map((cell, i) => (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityHint={cell.kind === 'tabla' ? undefined : 'Abre ese juego para anotarlo o corregirlo'}
              // Uno que ya está en la tabla abre su detalle (también con la práctica cerrada); los demás, para anotarlo.
              disabled={cell.kind === 'enviado' || (cell.kind !== 'tabla' && g.closed)}
              onPress={() => (cell.kind === 'tabla' ? g.entry && setDetail(g.entry) : openEditor(i + 1))}
              style={compact ? { flexBasis: `${Math.floor(100 / columns) - 3}%`, flexGrow: 1 } : { flexBasis: '30%', flexGrow: 1 }}
            >
              <Cell n={i + 1} cell={cell} compact={compact} />
            </Pressable>
          ))}
          {compact && (
            <View
              accessible
              accessibilityLabel={`Serie: ${g.series || 'sin juegos'}`}
              style={[styles.cell, styles.cellCompact, { backgroundColor: c.accentSoft, flexBasis: `${Math.floor(100 / columns) - 3}%`, flexGrow: 1 }]}
            >
              <Txt variant="small" tone="accent">
                Serie
              </Txt>
              <Txt style={{ fontFamily: font.bold, fontSize: 21, color: c.accent }}>{g.series ? String(g.series) : '–'}</Txt>
            </View>
          )}
        </View>
        {inPhone > 0 && (
          <Txt variant="meta" tone="warn" style={compact ? { fontSize: 13 } : undefined}>
            {inPhone === 1 ? 'Un juego está en tu teléfono, sin enviar.' : `${inPhone} juegos están en tu teléfono, sin enviar.`}
          </Txt>
        )}
        {g.closed && (
          <Txt variant="meta" tone="muted" style={compact ? { fontSize: 13 } : undefined}>
            Esta práctica ya cerró: solo un admin puede anotar.
          </Txt>
        )}
        {next && (next.kind === 'anotar' || next.kind === 'medias') && !g.closed && (
          <Button variant="primary" size={compact ? 'lg' : 'xl'} full icon={<SquarePen size={compact ? 18 : 20} color={c.accentFg} />} onPress={() => openEditor(next.game)}>
            {nextGameLabel(next, { pro: compact })}
          </Button>
        )}
        {inPhone > 0 && !g.closed && (
          <Button
            variant={next?.kind === 'enviar' ? 'primary' : 'quiet'}
            size={compact ? 'lg' : 'xl'}
            full
            icon={<Send size={compact ? 18 : 20} color={next?.kind === 'enviar' ? c.accentFg : c.fg} />}
            onPress={send}
          >
            {inPhone === 1 ? 'Enviar mi juego' : 'Enviar mis juegos'}
          </Button>
        )}
      </Card>
    );
  };

  if (pro) {
    const today = g.today;
    const upcoming = ev.date >= today;
    const liveNow = liveInfo(ev, league, now);
    // En un torneo, quien lo organiza (o anota) juega solo si está inscrito; en una práctica, todos.
    const playsHere = !!g.playerId && (!isTorneo || !canScore || !!g.entry);
    const tabs = eventTabs({ canScore, isAdmin, isTorneo });
    const tab = currentEventTab(tabs, eventTabOf(requested), { isAdmin, isTorneo, live: liveNow.live });
    // Quien lleva la Planilla anota desde su fila: «Tus juegos» sale solo si tiene juegos sin enviar.
    const showMine = playsHere && !entries.loading && (!canScore || inPhone > 0);
    const extras = isTorneo && (
      <LeagueScope lid={lid}>
        {/* El reporte del torneo (PDF o Excel): la tarjeta para quien organiza al terminar; para todos, la fila. */}
        <BowlingReport event={ev} entries={entries.data} players={players.data} loading={entries.loading || players.loading} />
        {/* Los premios que eligió la liga (equipos por scratch, individual con handicap): se ven desde que se crea el torneo. */}
        <EventPrizes event={ev} entries={entries.data} players={players.data} />
      </LeagueScope>
    );
    return (
      <Shell embedded={embedded}>
        {topBar}
        <View style={{ gap: 4 }}>
          <Txt style={styles.titlePro} accessibilityRole="header">
            {title}
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6 }}>
            {liveNow.live && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} />
                  <Txt tone="accent" style={{ fontSize: 14, fontFamily: font.semibold }}>
                    {liveWhenText(liveNow.startsSoon, liveNow.startLabel)}
                  </Txt>
                </View>
                <Txt variant="meta" tone="muted">
                  ·
                </Txt>
              </>
            )}
            <Txt variant="meta" tone="muted" style={{ flexShrink: 1 }}>
              {eventMeta(ev, league, today, true)}
            </Txt>
          </View>
        </View>

        {/* Su pista, cuando el admin ya las publicó; quien organiza o anota la ve en Pistas. */}
        {!!g.playerId && upcoming && !canScore && <LaneChip lid={lid} eventId={eventId} playerId={g.playerId} />}

        {/* Un link de Pro abierto en Lite: lo de Pro se ve igual, con la forma de cambiar. */}
        {!isPro && (
          <View style={[styles.proOnly, { borderColor: c.line }]}>
            <Txt variant="meta" style={{ flex: 1, fontFamily: font.semibold }}>
              {PRO_ONLY_TEXT}
            </Txt>
            <Pressable accessibilityRole="button" hitSlop={4} onPress={() => void switchMode('pro')} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }}>
              <Txt tone="accent" variant="meta" style={{ fontFamily: font.bold }}>
                Usar Pro
              </Txt>
            </Pressable>
          </View>
        )}

        {/* Torneo que viene: su anuncio y «Escribir a…» por WhatsApp (como la web). */}
        <TourneyAnnouncement event={ev} league={league} today={today} />
        {showMine && myGames(true)}
        {extras}

        <LeagueScope lid={lid}>
          <EventProTabs
            tabs={tabs}
            tab={tab}
            onTab={(k: EventTab) => router.setParams({ tab: k })}
            event={ev}
            entries={entries.data}
            players={players.data}
            subs={subs.data}
            live={live.data}
            canScore={canScore}
            loading={(entries.loading && !entries.data.length) || (players.loading && !players.data.length)}
            onOpen={setDetail}
          />
        </LeagueScope>
        {detail && <EventGameDetail lid={lid} event={ev} entries={entries.data} players={players.data} entry={detail} me={g.playerId} onClose={() => setDetail(null)} />}
      </Shell>
    );
  }

  return (
    <Shell embedded={embedded}>
      {topBar}
      <View style={{ gap: 4 }}>
        <Txt variant="title">{title}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {ev.date === g.today && <Badge tone="ok">En juego</Badge>}
          <Txt tone="muted">
            {formatDateLong(ev.date)} · {ev.games} {ev.games === 1 ? 'juego' : 'juegos'}
          </Txt>
        </View>
      </View>

      {!!g.playerId && <LaneChip lid={lid} eventId={eventId} playerId={g.playerId} />}

      {/* Torneo que viene: su anuncio y «Escribir a…» por WhatsApp (como la web). */}
      <TourneyAnnouncement event={ev} league={league} today={g.today} />

      {/* Sin jugador en la liga no hay «Mis juegos» (como la web: «Preparar mi jugador» está en Hoy y en la liga). */}
      {!!g.playerId && myGames(false)}

      {isAdmin && <ApprovalCard league={league} event={ev} subs={pending} entries={entries.data} players={players.data} />}
      {/* Quien organiza o anota: sus pestañas de la web (Equipos del torneo, Pistas y Planilla). */}
      {canScore && (
        <Card padded={false}>
          <EventToolsRows lid={lid} eventId={eventId} torneo={isTorneo} admin={isAdmin} />
        </Card>
      )}
      {/* Un torneo ya jugado: su clasificación (equipos e individual); si no, «Cómo van todos» desde el día del evento. */}
      {isTorneo && ev.date < g.today ? (
        <View style={{ gap: 10 }}>
          <SectionHeader title="Clasificación" />
          <Standings lid={lid} event={ev} entries={entries.data} players={players.data} me={g.playerId} />
        </View>
      ) : (
        ev.date <= g.today && <EventBoard rows={board} players={players.data} me={g.playerId} live={ev.date === g.today} past={ev.date < g.today} onOpen={(r) => r.entry && setDetail(r.entry)} />
      )}
      {/* Los premios que eligió la liga (equipos por scratch, individual con handicap): se ven desde que se crea el torneo. */}
      {isTorneo && (
        <LeagueScope lid={lid}>
          {/* El reporte del torneo (PDF o Excel): la tarjeta para quien organiza al terminar; para todos, la fila. */}
          <BowlingReport event={ev} entries={entries.data} players={players.data} loading={entries.loading || players.loading} />
          <EventPrizes event={ev} entries={entries.data} players={players.data} />
        </LeagueScope>
      )}
      {detail && <EventGameDetail lid={lid} event={ev} entries={entries.data} players={players.data} entry={detail} me={g.playerId} onClose={() => setDetail(null)} />}
    </Shell>
  );
}

const styles = StyleSheet.create({
  cell: { borderRadius: radius.tile, paddingVertical: 10, paddingHorizontal: 12, gap: 2 },
  cellCompact: { borderRadius: 14, paddingVertical: 8, paddingHorizontal: 10 },
  titlePro: { fontSize: 28, lineHeight: 34, letterSpacing: -0.84, fontFamily: font.bold },
  proOnly: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: 1, paddingLeft: 16, paddingRight: 4, paddingVertical: 2 },
});
