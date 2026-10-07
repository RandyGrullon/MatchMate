import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ClipboardPen, FileDown, FileSpreadsheet, ListOrdered, Megaphone, Settings, Share2, Trash2, Zap } from 'lucide-react';
import {
  deleteEvent,
  useCommentsOfEvents,
  useEvent,
  useEventEntries,
  useEventLive,
  useEventSubmissions,
  useEvents,
  usePlayerSubmissions,
  usePlayers,
  useReactionsOfEvents,
} from '../lib/data';
import { useBowlingGameContext } from '../lib/data/bowlingContext';
import { getUserId } from '../lib/data/client';
import { entryMarks } from '../lib/bowlingSeason';
import { eventLabel, toIsoDate } from '../lib/format';
import { canScoreEvent, useLeagueCtx } from '../lib/league';
import { liveInfo } from '../lib/live';
import { partialGame, useMemoryTick } from '../lib/useNextGame';
import { useNow } from '../lib/useNow';
import { Announcements, TourneyContact } from '../components/AnnouncementCard';
import { EventFormModal } from '../components/EventFormModal';
import { SubmitGamesModal } from '../components/SubmitGamesModal';
import { useAction, useFeedback } from '../components/feedback';
import { useBusy } from '../components/busy';
import { Card, Empty, ListSkeleton, LoadError, PageSkeleton, Segmented, SectionHeader, Sheet, Tabs, cx } from '../components/ui';
import { shareLink } from '../components/share';
import { NoticeSlot, useNotice } from '../components/NoticeSlot';
import { useIsPro, useSwitchMode } from '../components/mode';
import { gameKey, myGamesPlace, readGameDraft } from '../components/frames/draftMemory';
import { todayTitle } from '../components/home/logic';
import { GameDetailModal } from '../components/event/GameDetailModal';
import { GamesTab } from '../components/event/GamesTab';
import { ApprovalCard } from '../components/event/ApprovalCard';
import { EventBoard } from '../components/event/EventBoard';
import { EventMenu, EventTopBar, ExcelButton, LaneChip, LiveWhen, MoreButton, eventMeta, type MenuItem } from '../components/event/EventHeader';
import { EventTheme } from '../components/event/eventTheme';
import { boardRows } from '../components/event/board';
import { PostSocial } from '../components/social/Social';
import { MyGamesPanel } from '../components/event/MyGamesPanel';
import { EventBadges } from '../components/badges/LeagueBadges';
import { EventPrizes } from '../components/event/EventPrizes';
import { ReportButton } from '../components/tournamentReport/ReportButton';
import { todayIn } from '../badges/rules/periods';
import { bowlingComp } from '../prizes/catalog';
import { bowlingFinished } from '../prizes/ready';
import { RosterTab } from '../components/event/RosterTab';
import { StandingsTab } from '../components/event/StandingsTab';
import { TeamsTab } from '../components/event/TeamsTab';
import { LanesPanel } from '../components/lanes/LanesPanel';
import type { Entry } from '../lib/types';
import { dispatchLeague, SportRoute } from '../sports/screens';

const SportComingSoon = lazy(() => import('./sports/SportComingSoon'));
const UpdateAppScreen = lazy(() => import('./sports/UpdateAppScreen'));
// Las hojas de «•••» se bajan al tocarlas.
const ScorersSheet = lazy(() => import('../components/scorers/ScorersSheet'));
const ReportSheet = lazy(() => import('../components/tournamentReport/ReportSheet'));

type TabKey = 'inscritos' | 'equipos' | 'pistas' | 'juegos' | 'clasificacion';

/**
 * Un evento de la liga. Punto de desvío por deporte (el otro es LeagueShell): el boliche ve sus pantallas
 * de siempre; un deporte sin pantallas todavía, «Pronto»; uno que esta versión no conoce, «Actualiza la app».
 */
export default function EventPage(props: { eventId?: string }) {
  const { league } = useLeagueCtx();
  const sport = dispatchLeague(league);
  if (sport.kind === 'ready') return <SportRoute slot="Event" bowling={<BowlingEventPage {...props} />} />;
  return (
    <Suspense fallback={<PageSkeleton />}>
      {sport.kind === 'unknown' ? (
        <UpdateAppScreen sport={sport.sport} leagueName={league.name} />
      ) : (
        <SportComingSoon sport={sport.sport} leagueName={league.name} kind={league.kind ?? 'liga'} />
      )}
    </Suspense>
  );
}

/**
 * Un torneo o una práctica de boliche (rediseño «Calma y foco»): «‹ Liga de los martes», el título grande y una línea con
 * el día, la hora y la bolera; «•••» con Compartir, Resultados, Reporte, Anotadores, Ajustes y Eliminar (nunca al final de
 * la pantalla).
 * - Lite (cualquiera): «Tu pista», «Tus juegos» (UN botón y la foto del marcador a la vista) y «Cómo van todos», donde lo
 *   que falta por aprobar sale en gris y no suma.
 * - Pro: pestañas Planilla · Resultados · Pistas (en un torneo, además Inscritos y Equipos) y «Excel». La Planilla es la
 *   tabla en vivo y donde se anota; arriba, «Por aprobar» con la foto y Rechazar / Aprobar. Quien no organiza ni anota ve
 *   la Planilla sin herramientas y su «Tus juegos» compacta.
 * Lite solo oculta: un link de Pro (`?tab=juegos`) abre lo de Pro igual, con «Esto es de Pro · Usar Pro».
 */
function BowlingEventPage({ eventId: fixed }: { eventId?: string }) {
  const params0 = useParams();
  const eventId = fixed ?? params0.eventId;
  const ctx = useLeagueCtx();
  const { lid, base, isAdmin, myPlayerId, league } = ctx;
  // Torneo sin liga: el evento es la portada, no hay a dónde volver.
  const standalone = league.kind === 'torneo';
  const navigate = useNavigate();
  const run = useAction();
  const { confirm, toast } = useFeedback();
  const [params, setParams] = useSearchParams();
  // Anotar abierto desde otra pantalla de la app (Hoy, la Liga: `?anotar=1`): al cerrar esa hoja se vuelve allá. Si se
  // entró directo (un link, la app recién abierta), no hay a dónde volver y se queda aquí.
  const [backAfterScore] = useState(
    () => params.get('anotar') === '1' && typeof window !== 'undefined' && ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0,
  );
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const sharing = useBusy();
  const [detail, setDetail] = useState<Entry | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<'resultados' | 'anotadores' | 'reporte' | null>(null);
  // Tu juego a medias, abierto desde tu fila de la Planilla (Pro): sigue en la hoja de «Tus juegos».
  const [mineRequest, setMineRequest] = useState<{ game: number; at: number } | null>(null);
  const isPro = useIsPro();
  const switchMode = useSwitchMode();
  const event = useEvent(lid, eventId);
  const entries = useEventEntries(lid, eventId);
  const players = usePlayers(lid);
  const events = useEvents(myPlayerId ? lid : undefined);
  const mySubs = usePlayerSubmissions(lid, myPlayerId ?? undefined);
  // Lo enviado por todos (lo que falta por aprobar) y lo que cada uno lleva en su teléfono: «Cómo van todos» y la Planilla.
  const eventSubs = useEventSubmissions(lid, eventId);
  const eventLive = useEventLive(lid, eventId);
  // Me gusta y comentarios de los juegos (se ven al abrir el juego de alguien).
  const reactions = useReactionsOfEvents(lid, eventId ? [eventId] : []);
  const comments = useCommentsOfEvents(lid, eventId ? [eventId] : []);
  // Lo jugado antes de este evento por cada inscrito: marca «Récord personal» y «+15 sobre tu promedio».
  const context = useBowlingGameContext(
    entries.data.map((e) => e.id),
    lid,
  );
  const now = useNow();
  // Tu juego a medias en la hoja de anotar: «jugando el 3» en «Cómo van todos».
  useMemoryTick();

  // Lite, quien organiza: lo que espera por él aquí, en el único aviso de la pantalla («2 juegos por aprobar · Usar Pro»).
  const pendingSubs = eventSubs.data.filter((s) => s.status === 'pendiente');
  const pendingGames = pendingSubs.reduce((n, s) => n + s.scores.filter((v) => v != null).length, 0);
  useNotice(
    !isPro &&
      isAdmin &&
      pendingGames > 0 && {
        id: `por-aprobar:${eventId}:${pendingGames}`,
        kind: 'admin',
        title: `${pendingGames} ${pendingGames === 1 ? 'juego' : 'juegos'} por aprobar`,
        text: 'Se aprueban en Pro',
        action: { label: 'Usar Pro', onClick: () => switchMode('pro') },
      },
  );

  const loadError = event.error ?? entries.error ?? players.error;
  if (loadError) return <LoadError error={loadError} />;
  if (event.loading) return <PageSkeleton />;
  if (!event.data) {
    return (
      <Empty title="Este evento no existe">
        <Link to={base} className="text-accent">
          Volver
        </Link>
      </Empty>
    );
  }

  const ev = event.data;
  const isTorneo = ev.type === 'torneo';
  // Anota los juegos de todos: el admin y, en un torneo, el anotador de la liga (en la práctica, cada jugador los suyos).
  const canScore = canScoreEvent(ctx, ev.type);
  const back = isTorneo ? base : `${base}?ver=practicas`;
  const mine = myPlayerId ? entries.data.find((e) => e.playerId === myPlayerId) ?? null : null;
  // En un torneo, quien lo organiza (o anota) juega solo si está inscrito; en una práctica, todos.
  const playsHere = !!myPlayerId && (!isTorneo || !canScore || !!mine);
  const nameOf = (e: Entry) => players.data.find((p) => p.id === e.playerId)?.name ?? '(jugador borrado)';
  const me = myPlayerId ? players.data.find((p) => p.id === myPlayerId) : undefined;
  const today = toIsoDate(now);
  const upcoming = ev.date >= today;
  const liveNow = liveInfo(ev, league, now);
  const requested = params.get('tab') as TabKey | null;
  // Pro, o un link de Pro (la Planilla desde un aviso) para quien organiza o anota: lo de Pro se abre igual.
  const pro = isPro || (canScore && requested != null);

  // Pro: quien organiza o anota tiene sus pestañas; los demás, la Planilla (solo mirar) y los resultados.
  const results: TabKey = 'clasificacion';
  const tabs: { key: TabKey; label: string }[] = !canScore
    ? [
        { key: 'juegos', label: 'Planilla' },
        { key: results, label: isTorneo ? 'Clasificación' : 'Resultados' },
      ]
    : !isAdmin
      ? [
          { key: 'juegos', label: 'Planilla' },
          { key: results, label: 'Clasificación' },
          { key: 'pistas', label: 'Pistas' },
        ]
      : isTorneo
        ? [
            { key: 'inscritos', label: 'Inscritos' },
            { key: 'equipos', label: 'Equipos' },
            { key: 'pistas', label: 'Pistas' },
            { key: 'juegos', label: 'Planilla' },
            { key: results, label: 'Clasificación' },
          ]
        : [
            { key: 'juegos', label: 'Planilla' },
            { key: results, label: 'Resultados' },
            { key: 'pistas', label: 'Pistas' },
          ];
  // Un torneo se abre en Inscritos antes de jugarse y en la Planilla el día que se juega.
  const firstTab: TabKey = isAdmin && isTorneo && !liveNow.live ? 'inscritos' : 'juegos';
  const tab: TabKey = tabs.some((t) => t.key === requested) ? requested! : firstTab;

  async function remove() {
    setMenu(false);
    const ok = await confirm({
      title: `¿Eliminar ${eventLabel(ev)}?`,
      message: 'Se borran sus inscritos, equipos, juegos, fotos y envíos pendientes. No se puede deshacer.',
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    setEditing(false);
    navigate(standalone ? `${base}/admin?tab=liga` : back);
    await run(() => deleteEvent(lid, ev.id), 'Evento eliminado');
  }

  async function exportExcel() {
    setExporting(true);
    await run(async () => {
      const { exportEventToExcel } = await import('../lib/exportExcel');
      await exportEventToExcel(ev, entries.data, players.data);
      return true;
    }, 'Excel descargado');
    setExporting(false);
  }

  const share = () =>
    void sharing.run('compartir', async () => {
      if (await shareLink(`${location.origin}${standalone ? base : `${base}/e/${ev.id}`}`, `${eventLabel(ev)} · MatchMate`)) toast('Link copiado');
      setMenu(false);
    });

  const props = { event: ev, entries: entries.data, players: players.data };
  const loadingList = entries.loading || players.loading;

  // Reporte del torneo (PDF o Excel), para todos; el boliche se arma al tocar, con la clasificación oficial.
  const leagueToday = todayIn(now.getTime(), league.tz);
  const report = isTorneo
    ? {
        report: () =>
          import('../lib/report/bowling').then((m) =>
            m.bowlingReport({ lid, league, event: ev, entries: entries.data, players: players.data, today: leagueToday }),
          ),
        comp: bowlingComp(lid, ev),
        disabled: entries.loading || players.loading,
      }
    : null;
  const finished = isTorneo && !entries.loading && bowlingFinished(ev, entries.data, leagueToday);

  // Cómo van todos (Lite): lo que cuenta suma; lo enviado, lo del teléfono y tu juego a medias se ven aparte.
  const uid = getUserId();
  const myPlace = myPlayerId ? myGamesPlace(uid, lid, myPlayerId, ev.id) : null;
  const board = boardRows(ev, entries.data, eventSubs.data, eventLive.data, {
    partial: (playerId, _entry, game) => (playerId === myPlayerId && myPlace ? partialGame(readGameDraft(gameKey(myPlace, game))) : null),
  });

  const menuItems: MenuItem[] = [
    { key: 'compartir', icon: Share2, label: 'Compartir', hint: 'Manda el link del evento', onClick: share, busy: sharing.isBusy() },
    ...(!pro
      ? [
          {
            key: 'resultados',
            icon: ListOrdered,
            label: isTorneo ? 'Clasificación' : 'Resultados',
            hint: isTorneo ? 'Con handicap y por equipos' : 'Promedio y total de cada uno',
            onClick: () => {
              setMenu(false);
              setSheet('resultados');
            },
          },
        ]
      : []),
    ...(report
      ? [
          {
            key: 'reporte',
            icon: FileDown,
            label: 'Reporte del torneo',
            hint: 'PDF para WhatsApp o imprimir, o Excel',
            onClick: () => {
              setMenu(false);
              setSheet('reporte');
            },
          },
        ]
      : []),
    ...(!pro && isAdmin && !isTorneo
      ? [{ key: 'excel', icon: FileSpreadsheet, label: 'Excel', hint: 'Los juegos de todos', onClick: () => void exportExcel(), busy: exporting }]
      : []),
    ...(!pro && canScore
      ? [
          {
            key: 'pro',
            icon: Zap,
            label: isTorneo ? 'Planilla, inscritos y pistas' : 'Planilla, aprobar y pistas',
            hint: 'Están en Pro · Usar Pro',
            onClick: () => {
              setMenu(false);
              void switchMode('pro');
            },
          },
        ]
      : []),
    ...(isAdmin && isTorneo
      ? [
          {
            key: 'anotadores',
            icon: ClipboardPen,
            label: 'Anotadores',
            hint: 'Quién anota este torneo',
            onClick: () => {
              setMenu(false);
              setSheet('anotadores');
            },
          },
        ]
      : []),
    ...(isAdmin
      ? [
          {
            key: 'ajustes',
            icon: Settings,
            label: isTorneo ? 'Ajustes del torneo' : 'Ajustes de la práctica',
            hint: 'Fecha, juegos y más',
            onClick: () => {
              setMenu(false);
              setEditing(true);
            },
          },
          { key: 'eliminar', icon: Trash2, label: `Eliminar ${isTorneo ? 'torneo' : 'práctica'}`, onClick: () => void remove(), danger: true },
        ]
      : []),
  ];

  const title = isTorneo ? eventLabel(ev) : todayTitle(ev, today);
  const live = liveNow.live && !liveNow.startsSoon;
  // «Tus juegos»: grande en Lite; en Pro compacta y, para quien lleva la Planilla, solo su hoja (su fila está en la tabla).
  const myGames = playsHere && !entries.loading && !mySubs.loading && (
    <MyGamesPanel
      event={ev}
      playerId={myPlayerId}
      entry={mine}
      subs={mySubs.data.filter((s) => s.eventId === ev.id)}
      live={liveNow}
      today={today}
      autoStart={params.get('anotar') === '1'}
      onAutoStarted={() =>
        setParams(
          (p) => {
            p.delete('anotar');
            return p;
          },
          { replace: true },
        )
      }
      onOpenEntry={() => mine && setDetail(mine)}
      onSend={() => setSubmitting(true)}
      marks={mine ? entryMarks(mine, context.data[mine.id]) : null}
      onAutoDone={backAfterScore ? () => navigate(-1) : undefined}
      look={!pro ? 'lite' : canScore ? 'sheet' : 'pro'}
      openRequest={mineRequest}
      className={pro ? 'mt-4' : 'mt-[22px]'}
    />
  );

  // Torneo que viene: su anuncio y, si la liga tiene el teléfono de su contacto, «Escribir a Ana» por WhatsApp para
  // entrar (en un torneo sin liga, la tarjeta del anuncio ya lo trae).
  const announcement =
    isTorneo &&
    upcoming &&
    (standalone ? (
      <Announcements events={[ev]} hideLink />
    ) : (
      (ev.announcement?.trim() || league.contactPhone) && (
        <Card soft className="flex flex-col gap-3 p-4 text-sm">
          {ev.announcement?.trim() && (
            <div className="flex gap-3">
              <Megaphone aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
              <p className="whitespace-pre-line">{ev.announcement.trim()}</p>
            </div>
          )}
          <TourneyContact league={league} eventName={title} className="self-start" />
        </Card>
      )
    ));

  // Lo del torneo (premios, reporte al terminar) y las insignias del podio, en los dos modos.
  const extras = (
    <>
      {/* Terminado el torneo, el admin tiene el reporte a la mano (para todos está en «•••»). */}
      {report && isAdmin && finished && <ReportButton {...report} look="card" />}
      {/* Los premios que eligió la liga (equipos por scratch, individual con handicap): se ven desde que se crea el torneo. */}
      {isTorneo && <EventPrizes event={ev} entries={entries.data} players={players.data} now={now} />}
      {/* El podio con sus insignias oficiales, cuando ya se dieron (a los 3 días del evento). */}
      {!upcoming && <EventBadges eventId={ev.id} date={ev.date} />}
    </>
  );

  const tabContent =
    loadingList ? (
      <ListSkeleton rows={6} />
    ) : (
      // key = pestaña: el contenido entra con una transición al cambiar
      <div key={tab} className="animate-fade-up flex flex-col gap-3">
        {tab === 'inscritos' ? (
          <RosterTab {...props} />
        ) : tab === 'equipos' ? (
          <TeamsTab {...props} />
        ) : tab === 'pistas' ? (
          <LanesPanel {...props} />
        ) : tab === 'juegos' ? (
          <>
            {isAdmin && <ApprovalCard event={ev} subs={pendingSubs} entries={entries.data} players={players.data} />}
            <GamesTab
              {...props}
              subs={eventSubs.data}
              live={eventLive.data}
              onOpen={setDetail}
              onOpenMine={playsHere ? (game) => setMineRequest({ game, at: Date.now() }) : undefined}
              readOnly={!canScore}
            />
          </>
        ) : (
          <StandingsTab {...props} readOnly={!isAdmin} onOpen={setDetail} />
        )}
      </div>
    );

  return (
    <div className="flex flex-col px-2">
      <EventTheme />
      <EventTopBar
        back={standalone ? null : { label: league.name, fallback: back }}
        right={
          <>
            {pro && isAdmin && !isTorneo && <ExcelButton onClick={() => void exportExcel()} busy={exporting} />}
            <MoreButton onClick={() => setMenu(true)} compact={pro && isAdmin && !isTorneo} />
          </>
        }
      />

      <h1 className={pro ? 'mt-0.5 text-title-pro' : 'mt-1 text-title'}>{title}</h1>
      <p className={cx('flex min-w-0 flex-wrap items-center gap-x-1.5 text-meta text-muted', pro ? 'mt-1' : 'mt-1.5')}>
        {pro && liveNow.live && (
          <>
            <LiveWhen startsSoon={liveNow.startsSoon} startLabel={liveNow.startLabel} />
            <span aria-hidden="true">·</span>
          </>
        )}
        <span className="min-w-0">{eventMeta(ev, league, today, pro)}</span>
      </p>

      {/* Su pista, cuando el admin ya las publicó (el evento de hoy o uno que viene); en Pro, quien organiza la ve en Pistas. */}
      {myPlayerId && upcoming && !(pro && canScore) && <LaneChip lid={lid} eventId={ev.id} playerId={myPlayerId} className="mt-3.5" />}

      {pro ? (
        <>
          {!isPro && (
            <p className="mt-3.5 flex items-center gap-3 rounded-[20px] py-1 pr-1 pl-4 text-meta shadow-[inset_0_0_0_1px_var(--line)]">
              <span className="min-w-0 flex-1 font-semibold">Esto es de Pro</span>
              <button
                type="button"
                onClick={() => void switchMode('pro')}
                className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 font-[650] text-accent focus-visible:outline-2 focus-visible:outline-accent"
              >
                Usar Pro
              </button>
            </p>
          )}
          {announcement && <div className="mt-4">{announcement}</div>}
          {myGames}
          {isTorneo && <div className="mt-4 flex flex-col gap-4 empty:hidden">{extras}</div>}
          <div className="mt-3.5">
            {tabs.length <= 3 ? (
              <Segmented
                full
                label="Secciones del evento"
                options={tabs}
                value={tab}
                onChange={(k) => setParams({ tab: k }, { replace: true })}
              />
            ) : (
              <Tabs items={tabs} active={tab} onChange={(k) => setParams({ tab: k }, { replace: true })} />
            )}
          </div>
          <div className="mt-4">{tabContent}</div>
          {!isTorneo && <div className="mt-6 flex flex-col gap-4 empty:hidden">{extras}</div>}
        </>
      ) : (
        <>
          {announcement && <div className="mt-[22px]">{announcement}</div>}
          {myGames}
          {loadingList ? (
            <div className="mt-[30px]">
              <ListSkeleton rows={4} />
            </div>
          ) : isTorneo && ev.date < today ? (
            <section className="mt-[30px]" aria-labelledby="clasificacion">
              <SectionHeader id="clasificacion" title="Clasificación" />
              <StandingsTab {...props} readOnly onOpen={setDetail} />
            </section>
          ) : (
            ev.date <= today && (
              <EventBoard
                rows={board}
                players={players.data}
                me={myPlayerId}
                live={live}
                past={ev.date < today}
                onOpen={(r) => r.entry && setDetail(r.entry)}
                className="mt-[30px]"
              />
            )
          )}
          <div className="mt-[30px] flex flex-col gap-4 empty:hidden">{extras}</div>
        </>
      )}

      {/* El único aviso de la pantalla, al final (como en la Liga): «2 juegos por aprobar · Usar Pro», instalar… */}
      <NoticeSlot className="mt-4" />

      <EventMenu open={menu} onClose={() => setMenu(false)} title={title} items={menuItems} />
      <Sheet open={sheet === 'resultados'} onClose={() => setSheet(null)} title={isTorneo ? 'Clasificación' : 'Resultados'} subtitle={title}>
        {sheet === 'resultados' && <StandingsTab {...props} readOnly onOpen={setDetail} />}
      </Sheet>
      {sheet === 'anotadores' && (
        <Suspense fallback={null}>
          <ScorersSheet
            open
            onClose={() => setSheet(null)}
            target={{ scope: 'evento', refId: ev.id, title: ev.name || (standalone ? league.name : eventLabel(ev)) }}
            participants={entries.data.map((e) => e.playerId)}
          />
        </Suspense>
      )}
      {sheet === 'reporte' && report && (
        <Suspense fallback={null}>
          <ReportSheet open onClose={() => setSheet(null)} report={report.report} comp={report.comp ?? null} />
        </Suspense>
      )}
      {isAdmin && <EventFormModal open={editing} onClose={() => setEditing(false)} type={ev.type} event={ev} />}

      <GameDetailModal
        event={ev}
        entries={entries.data}
        entry={detail ? entries.data.find((e) => e.id === detail.id) ?? detail : null}
        name={detail ? nameOf(detail) : ''}
        onClose={() => setDetail(null)}
        marks={detail ? entryMarks(entries.data.find((e) => e.id === detail.id) ?? detail, context.data[detail.id]) : null}
        mine={!!detail && detail.playerId === myPlayerId}
      >
        {detail && (
          <PostSocial
            entry={detail}
            reactions={reactions.data.filter((r) => r.entryId === detail.id)}
            comments={comments.data.filter((c) => c.entryId === detail.id)}
            isMine={detail.playerId === myPlayerId}
          />
        )}
      </GameDetailModal>
      {me && (
        <SubmitGamesModal
          open={submitting}
          onClose={() => setSubmitting(false)}
          player={me}
          events={events.data}
          myEntries={mine ? [mine] : []}
          preferEventId={ev.id}
        />
      )}
    </div>
  );
}
