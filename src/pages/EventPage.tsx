import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  CalendarDays,
  ClipboardList,
  FileSpreadsheet,
  ListOrdered,
  Megaphone,
  Settings,
  Share2,
  Shield,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import {
  deleteEvent,
  useCommentsOfEvents,
  useEvent,
  useEventEntries,
  useEvents,
  usePlayerSubmissions,
  usePlayers,
  useReactionsOfEvents,
} from '../lib/data';
import { eventLabel, formatDateLong, toIsoDate, typeLabel } from '../lib/format';
import { useLeagueCtx } from '../lib/league';
import { liveInfo } from '../lib/live';
import { useNow } from '../lib/useNow';
import { Announcements } from '../components/AnnouncementCard';
import { BackLink } from '../components/BackLink';
import { EventFormModal } from '../components/EventFormModal';
import { SubmitGamesModal } from '../components/SubmitGamesModal';
import { useAction, useFeedback } from '../components/feedback';
import { Badge, Button, Card, Empty, ListSkeleton, LoadError, PageSkeleton, Tabs } from '../components/ui';
import { shareLink } from '../components/share';
import { GameDetailModal } from '../components/event/GameDetailModal';
import { GamesTab } from '../components/event/GamesTab';
import { PostSocial } from '../components/social/Social';
import { LiveBoard } from '../components/LiveBoard';
import { Tour } from '../components/Tour';
import { EVENT_TOUR } from '../lib/tours';
import { MyGamesPanel } from '../components/event/MyGamesPanel';
import { RosterTab } from '../components/event/RosterTab';
import { StandingsTab } from '../components/event/StandingsTab';
import { TeamsTab } from '../components/event/TeamsTab';
import type { Entry } from '../lib/types';

type TabKey = 'inscritos' | 'equipos' | 'juegos' | 'clasificacion';

/**
 * Un torneo o una práctica. El admin lo maneja todo; el anotador del torneo anota los juegos;
 * el jugador ve la clasificación en vivo y anota los suyos para enviarlos a revisión.
 */
export default function EventPage({ eventId: fixed }: { eventId?: string }) {
  const params0 = useParams();
  const eventId = fixed ?? params0.eventId;
  const { lid, base, isAdmin, canScore, myPlayerId, league } = useLeagueCtx();
  // Torneo sin liga: el evento es la portada, no hay a dónde volver.
  const standalone = league.kind === 'torneo';
  const navigate = useNavigate();
  const run = useAction();
  const { confirm, toast } = useFeedback();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [detail, setDetail] = useState<Entry | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const event = useEvent(lid, eventId);
  const entries = useEventEntries(lid, eventId);
  const players = usePlayers(lid);
  const events = useEvents(myPlayerId ? lid : undefined);
  const mySubs = usePlayerSubmissions(lid, myPlayerId ?? undefined);
  // Me gusta y comentarios de los juegos (se ven al abrir el juego de alguien).
  const reactions = useReactionsOfEvents(lid, eventId ? [eventId] : []);
  const comments = useCommentsOfEvents(lid, eventId ? [eventId] : []);
  const now = useNow();

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
  const back = isTorneo ? base : `${base}?ver=practicas`;
  const mine = myPlayerId ? entries.data.find((e) => e.playerId === myPlayerId) ?? null : null;
  // En un torneo, quien lo organiza (o anota) juega solo si está inscrito; en una práctica, todos.
  const playsHere = !!myPlayerId && (!isTorneo || !canScore || !!mine);
  const nameOf = (e: Entry) => players.data.find((p) => p.id === e.playerId)?.name ?? '(jugador borrado)';
  const me = myPlayerId ? players.data.find((p) => p.id === myPlayerId) : undefined;
  const today = toIsoDate(now);
  const upcoming = ev.date >= today;
  const liveNow = liveInfo(ev, league, now);

  // Anotador (no admin): solo anota juegos y ve la clasificación.
  const tabs: { key: TabKey; label: string; icon: ReactNode }[] = !canScore
    ? []
    : !isAdmin
      ? [
          { key: 'juegos', label: 'Juegos', icon: <ClipboardList className="size-4" /> },
          { key: 'clasificacion', label: 'Clasificación', icon: <ListOrdered className="size-4" /> },
        ]
      : isTorneo
      ? [
          { key: 'inscritos', label: 'Inscritos', icon: <Users className="size-4" /> },
          { key: 'equipos', label: 'Equipos', icon: <Shield className="size-4" /> },
          { key: 'juegos', label: 'Juegos', icon: <ClipboardList className="size-4" /> },
          { key: 'clasificacion', label: 'Clasificación', icon: <ListOrdered className="size-4" /> },
        ]
      : [
          { key: 'juegos', label: 'Juegos', icon: <ClipboardList className="size-4" /> },
          { key: 'clasificacion', label: 'Resultados', icon: <ListOrdered className="size-4" /> },
        ];
  const requested = params.get('tab') as TabKey | null;
  const tab: TabKey = tabs.length ? (tabs.some((t) => t.key === requested) ? requested! : tabs[0].key) : 'clasificacion';

  async function remove() {
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

  const props = { event: ev, entries: entries.data, players: players.data };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        {!standalone && <BackLink fallback={back} className="mt-1" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold tracking-tight">{eventLabel(ev)}</h1>
            <Badge tone="accent">
              {isTorneo ? <Trophy className="size-3" /> : <CalendarDays className="size-3" />}
              {typeLabel(ev.type)}
            </Badge>
            {!isAdmin && entries.data.some((e) => e.scores?.some((s, i) => s != null && e.photos?.[i] != null)) && (
              <Badge tone="ok">
                <span className="live-dot" /> En vivo
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted first-letter:uppercase">
            {formatDateLong(ev.date)} · {ev.games} juegos
            {isTorneo && (ev.hcpPercent > 0 ? ` · Hcp ${ev.hcpPercent}% de ${ev.hcpBase}` : ' · Sin handicap')}
            {isTorneo && !!ev.teamSize && ` · Equipos de ${ev.teamSize}`}
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={async () => {
            if (await shareLink(`${location.origin}${standalone ? base : `${base}/e/${ev.id}`}`, `${eventLabel(ev)} · BowlingX`)) toast('Link copiado');
          }}
          aria-label="Compartir"
          data-tour="compartir"
          title="Compartir"
          icon={<Share2 className="size-5" />}
        />
        {isAdmin && (
          <>
            <Button
              variant="ghost"
              loading={exporting}
              onClick={async () => {
                setExporting(true);
                await run(async () => {
                  const { exportEventToExcel } = await import('../lib/exportExcel');
                  await exportEventToExcel(ev, entries.data, players.data);
                  return true;
                }, 'Excel descargado');
                setExporting(false);
              }}
              aria-label="Exportar a Excel"
              title="Exportar a Excel"
              icon={<FileSpreadsheet className="size-5" />}
            />
            <Button variant="ghost" onClick={() => setEditing(true)} aria-label="Configurar" title="Configurar" icon={<Settings className="size-5" />} />
          </>
        )}
      </div>

      {isTorneo && upcoming && (standalone ? (
        <Announcements events={[ev]} hideLink />
      ) : (
        ev.announcement?.trim() && (
          <Card className="flex gap-3 border-accent/30 bg-accent-soft/40 p-3 text-sm">
            <Megaphone className="mt-0.5 size-4 shrink-0 text-accent" />
            <p className="whitespace-pre-line">{ev.announcement.trim()}</p>
          </Card>
        )
      ))}

      <Tour name="evento" steps={EVENT_TOUR} when={playsHere && ev.date <= today} />
      {/* Sus juegos primero (los anota mientras juega y los envía a revisión). El dueño y los admins también juegan. */}
      {playsHere && !entries.loading && !mySubs.loading && (
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
        />
      )}

      {/* En juego: cómo va cada uno (lo que está en la tabla, lo enviado y lo que anotan en su teléfono). */}
      {liveNow.live && (
        <LiveBoard
          event={ev}
          info={liveNow}
          onOpen={(id) => {
            const e = entries.data.find((x) => x.id === id);
            if (e) setDetail(e);
          }}
        />
      )}

      {tabs.length > 0 && <Tabs items={tabs} active={tab} onChange={(k) => setParams({ tab: k }, { replace: true })} />}

      {entries.loading || players.loading ? (
        <ListSkeleton rows={6} />
      ) : (
        // key = pestaña: el contenido entra con una transición al cambiar
        <div key={tab} className="animate-fade-up">
          {tab === 'inscritos' ? (
            <RosterTab {...props} />
          ) : tab === 'equipos' ? (
            <TeamsTab {...props} />
          ) : tab === 'juegos' ? (
            <GamesTab {...props} />
          ) : (
            <StandingsTab {...props} readOnly={!isAdmin} onOpen={setDetail} />
          )}
        </div>
      )}

      {isAdmin && (
        <>
          <EventFormModal open={editing} onClose={() => setEditing(false)} type={ev.type} event={ev} />
          <div className="flex justify-center pt-4">
            <Button variant="ghost" className="text-danger" icon={<Trash2 className="size-4" />} onClick={remove}>
              Eliminar {isTorneo ? 'torneo' : 'práctica'}
            </Button>
          </div>
        </>
      )}

      <GameDetailModal
        event={ev}
        entries={entries.data}
        entry={detail ? entries.data.find((e) => e.id === detail.id) ?? detail : null}
        name={detail ? nameOf(detail) : ''}
        onClose={() => setDetail(null)}
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
