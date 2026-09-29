import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ClipboardList, Flag, ListOrdered, Lock, LockOpen, Settings2, Share2, Signature, Trash2, Trophy, Users } from 'lucide-react';
import { deleteEvent, useEvent, useEvents, usePlayers } from '../../../lib/data';
import { closeGolfRound, pendingGolfSign, queueGolfSign, useGolfEvent, useGolfTournament, useGolfTournaments, type GolfCardDoc } from '../../../lib/data/golf';
import { sentOrQueued, useOutboxSnapshot } from '../../../lib/data/client';
import { eventLabel, formatDateLong, toIsoDate } from '../../../lib/format';
import { useLeagueCtx } from '../../../lib/league';
import { BackLink } from '../../../components/BackLink';
import { saveErrorMessage, useAction, useFeedback } from '../../../components/feedback';
import { shareLink } from '../../../components/share';
import { ReportButton } from '../../../components/tournamentReport/ReportButton';
import { golfComp } from '../../../prizes/sports';
import { Badge, Button, Empty, LoadError, PageSkeleton, Tabs } from '../../../components/ui';
import { ScorersButton } from '../../../components/scorers/ScorersButton';
import { CardModal } from './bits';
import { cardWire, markSent, mergeCard, sendPending, useCourtLog } from './courtLog';
import { GolfBoard } from './GolfBoard';
import { GolfCourt } from './GolfCourt';
import { GolfPrizes } from './GolfPrizes';
import { GolfPlayers } from './GolfPlayers';
import { RoundForm } from './RoundForm';
import { formatLabel, holesDone, isComplete, nineLabel } from './logic';

type TabKey = 'tarjeta' | 'leaderboard' | 'jugadores';

/**
 * Una ronda de golf: la tarjeta del grupo (en el campo), el leaderboard en vivo y los jugadores (inscribirse,
 * grupos). El admin elige campo y formato, cierra la ronda o la borra.
 */
export default function GolfEvent({ eventId: fixed }: { eventId?: string }) {
  const params = useParams();
  const eventId = fixed ?? params.eventId;
  const { lid, base, isAdmin, member, myPlayerId, league } = useLeagueCtx();
  const standalone = league.kind === 'torneo';
  const navigate = useNavigate();
  const run = useAction();
  const { confirm, toast } = useFeedback();
  const [search, setSearch] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [signing, setSigning] = useState<GolfCardDoc | null>(null);
  const event = useEvent(lid, eventId);
  const golf = useGolfEvent(lid, eventId);
  const players = usePlayers(lid);
  const tournaments = useGolfTournaments(lid);
  // Una ronda de un torneo reporta el torneo entero (como los premios): sus rondas, tarjetas y días.
  const tid = golf.data.round?.tournamentId ?? null;
  const tournamentData = useGolfTournament(lid, tid);
  const tournamentEvents = useEvents(tid ? lid : undefined);
  const [log, updateLog] = useCourtLog(eventId ?? '');
  // La firma pendiente en la cola cambia lo que se ofrece (se vuelve a dibujar cuando la cola cambia).
  useOutboxSnapshot();

  // Lo anotado en este teléfono se ve en todas las pestañas aunque no haya llegado al servidor.
  const cards = useMemo(() => golf.data.cards.map((c) => mergeCard(c, log)), [golf.data.cards, log]);
  const nameOf = useMemo(() => {
    const m = new Map(players.data.map((p) => [p.id, p.name] as const));
    return (pid: string) => m.get(pid) ?? '(jugador borrado)';
  }, [players.data]);

  const err = event.error ?? golf.error;
  if (err) return <LoadError error={err} />;
  if (event.loading || (golf.loading && !golf.data.round)) return <PageSkeleton />;
  if (!event.data || !eventId) {
    return (
      <Empty title="Esta ronda no existe">
        <Link to={base} className="text-accent">
          Volver
        </Link>
      </Empty>
    );
  }

  const ev = event.data;
  const round = golf.data.round;
  const myCard = myPlayerId ? (cards.find((c) => c.playerId === myPlayerId) ?? null) : null;
  const staff = isAdmin || !!member?.scorer;
  const today = toIsoDate(new Date());
  const started = cards.some((c) => holesDone(c) > 0);
  const tournament = round?.tournamentId ? tournaments.data.find((t) => t.id === round.tournamentId) : null;
  const title = eventLabel({ type: ev.type, name: ev.name, date: ev.date }, 'golf');

  // Reporte del torneo (PDF o Excel), para todos: el leaderboard y las tarjetas de la ronda (o de todo el torneo).
  const roundIds = new Set(tournamentData.data.rounds.map((r) => r.eventId));
  const dates = tid ? tournamentEvents.data.filter((e) => roundIds.has(e.id)).map((e) => e.date) : [ev.date];
  const report = round
    ? {
        report: () =>
          import('../../../lib/report/golf').then((m) =>
            m.golfReport({
              lid,
              league,
              event: { id: eventId, name: ev.name, date: ev.date },
              title,
              round,
              cards,
              tournament: tid ? { id: tid, name: tournament?.name ?? '', rounds: tournamentData.data.rounds, cards: tournamentData.data.cards, dates } : null,
              nameOf,
            }),
          ),
        comp: golfComp(lid, { eventId, tournamentId: tid, name: tid ? (tournament?.name ?? '') : ev.name, date: dates.reduce((d, x) => (x > d ? x : d), ev.date) }),
        // En un torneo espera también sus días y su nombre: si no, el reporte sale con la fecha de esta ronda sola.
        disabled: players.loading || (!!tid && (tournamentData.loading || tournamentEvents.loading || tournaments.loading)),
      }
    : null;
  const finished = !!round && (tid ? tournamentData.data.rounds.length > 0 && tournamentData.data.rounds.every((r) => (r.eventId === round.eventId ? round.closed : r.closed)) : round.closed);

  const tabs: { key: TabKey; label: string; icon: ReactNode }[] = round
    ? [
        ...(!round.closed && (staff || myCard) ? [{ key: 'tarjeta' as const, label: 'Tarjeta', icon: <ClipboardList className="size-4" /> }] : []),
        { key: 'leaderboard', label: 'Leaderboard', icon: <ListOrdered className="size-4" /> },
        { key: 'jugadores', label: 'Jugadores', icon: <Users className="size-4" /> },
      ]
    : [];
  const requested = search.get('tab') as TabKey | null;
  const fallback: TabKey =
    tabs.some((t) => t.key === 'tarjeta') && (ev.date === today || (myCard && holesDone(myCard) > 0))
      ? 'tarjeta'
      : started || round?.closed
        ? 'leaderboard'
        : 'jugadores';
  const tab: TabKey = requested && tabs.some((t) => t.key === requested) ? requested : tabs.some((t) => t.key === fallback) ? fallback : 'leaderboard';

  async function sign(card: GolfCardDoc) {
    try {
      // Primero sale lo anotado que falte (una operación por tarjeta). La firma lleva además la tarjeta tal
      // como se revisó: el servidor la guarda y firma a la vez, sin depender del orden de la cola.
      sendPending(lid, eventId!, golf.data.cards, { isAdmin, staff, myCard })?.catch((e) => toast(saveErrorMessage(e), 'error'));
      const reviewed = { cardId: card.id, holes: cardWire(cards.find((c) => c.id === card.id) ?? card) };
      const { done } = queueGolfSign(lid, eventId!, card.id, { holes: reviewed.holes });
      void done.then(() => updateLog((l) => markSent(l, [reviewed], Date.now()))).catch(() => undefined);
      await sentOrQueued(done);
      toast('Tarjeta firmada');
      setSigning(null);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `¿Eliminar ${title}?`,
      message: 'Se borran sus inscritos y tarjetas. No se puede deshacer.',
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    navigate(standalone ? `${base}/admin?tab=liga` : base);
    await run(() => deleteEvent(lid, eventId!), 'Ronda eliminada');
  }

  async function toggleClosed() {
    if (!round) return;
    if (!round.closed) {
      const unsigned = cards.filter((c) => !c.signed && !c.dq && holesDone(c) > 0).length;
      const unfinished = cards.filter((c) => !c.dq && !isComplete(c)).length;
      const ok = await confirm({
        title: '¿Cerrar la ronda?',
        message: (
          <>
            Quedan los resultados finales y cuentan para el orden de mérito. Nadie anota más (se puede volver a abrir).
            {unfinished > 0 && <span className="mt-2 block text-warn">{unfinished} sin terminar: salen como «No terminó».</span>}
            {unsigned > 0 && <span className="mt-2 block text-warn">{unsigned} tarjetas sin firmar (cuentan igual; puedes descalificarlas).</span>}
          </>
        ),
        confirmText: 'Cerrar ronda',
      });
      if (!ok) return;
    }
    await run(() => closeGolfRound(lid, eventId!, !round.closed), round.closed ? 'Ronda abierta' : 'Ronda cerrada');
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        {!standalone && <BackLink fallback={base} className="mt-1" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>
            {tournament && (
              <Badge tone="accent">
                <Trophy className="size-3" />
                {tournament.name}
                {round?.roundNo ? ` · R${round.roundNo}` : ''}
              </Badge>
            )}
            {round?.closed ? (
              <Badge tone="ok">
                <Lock className="size-3" /> Cerrada
              </Badge>
            ) : started ? (
              <Badge tone="ok">
                <span className="live-dot" /> En juego
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted first-letter:uppercase">
            {formatDateLong(ev.date)}
            {ev.startTime ? ` · ${ev.startTime.slice(0, 5)}` : ''}
            {round && ` · ${round.courseName} · ${nineLabel(round.nine, round.holes)} · ${formatLabel(round.competition)}${round.shotgun ? ' · salida simultánea' : ''}`}
          </p>
        </div>
        <Button
          variant="ghost"
          aria-label="Compartir"
          title="Compartir"
          icon={<Share2 className="size-5" />}
          onClick={async () => {
            if (await shareLink(`${location.origin}${standalone ? base : `${base}/e/${eventId}`}`, `${title} · MatchMate`)) toast('Link copiado');
          }}
        />
        {report && <ReportButton {...report} />}
      </div>

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Settings2 className="size-4" />} onClick={() => setEditing(true)} disabled={round?.closed}>
            {round ? 'Campo y formato' : 'Elegir campo'}
          </Button>
          {round && (
            <Button size="sm" icon={round.closed ? <LockOpen className="size-4" /> : <Lock className="size-4" />} onClick={toggleClosed}>
              {round.closed ? 'Volver a abrir' : 'Cerrar ronda'}
            </Button>
          )}
          <ScorersButton
            labeled
            target={{ scope: 'evento', refId: ev.id, title: ev.name || (league.kind === 'torneo' ? league.name : title) }}
            participants={golf.data.cards.map((c) => c.playerId)}
          />
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={remove}>
            Eliminar
          </Button>
        </div>
      )}

      {!round ? (
        <Empty icon={<Flag className="size-8" />} title="Esta ronda todavía no tiene campo">
          {isAdmin ? 'Toca «Elegir campo» para decir en qué campo y con qué formato se juega.' : 'El admin tiene que elegir el campo y el formato.'}
        </Empty>
      ) : (
        <>
          {myCard && !myCard.signed && !pendingGolfSign(lid, myCard.id) && !round.closed && isComplete(myCard) && tab !== 'tarjeta' && (
            <Button variant="primary" className="h-12" icon={<Signature className="size-5" />} onClick={() => setSigning(myCard)}>
              Terminaste: revisa y firma tu tarjeta
            </Button>
          )}
          {/* Cerrada la ronda (o el torneo), el admin tiene el reporte a la mano (para todos está el botón de arriba). */}
          {report && isAdmin && finished && <ReportButton {...report} look="card" />}
          <GolfPrizes eventId={eventId} name={ev.name} date={ev.date} round={round} cards={golf.data.cards} tournamentName={tournament?.name} nameOf={nameOf} />
          <Tabs items={tabs} active={tab} onChange={(k) => setSearch({ tab: k }, { replace: true })} />
          <div key={tab} className="animate-fade-up">
            {tab === 'tarjeta' ? (
              <GolfCourt round={round} cards={golf.data.cards} nameOf={nameOf} myCard={myCard} staff={staff} isAdmin={isAdmin} onSign={setSigning} />
            ) : tab === 'leaderboard' ? (
              <GolfBoard round={round} cards={cards} nameOf={nameOf} />
            ) : (
              <GolfPlayers round={round} cards={cards} players={players.data} onSign={setSigning} />
            )}
          </div>
          <CardModal
            open={!!signing}
            onClose={() => setSigning(null)}
            name={signing ? `Firmar: ${nameOf(signing.playerId)}` : ''}
            round={round}
            card={signing ? (cards.find((c) => c.id === signing.id) ?? signing) : null}
            footer={
              <>
                <Button onClick={() => setSigning(null)}>Todavía no</Button>
                <Button variant="primary" icon={<Signature className="size-4" />} onClick={() => signing && sign(signing)}>
                  Firmo: está correcta
                </Button>
              </>
            }
          />
        </>
      )}
      {isAdmin && <RoundForm open={editing} onClose={() => setEditing(false)} edit={{ eventId, round, started }} />}
    </div>
  );
}
