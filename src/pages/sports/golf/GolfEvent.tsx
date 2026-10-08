import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ClipboardPen, FileDown, Flag, Lock, LockOpen, Settings2, Share2, Signature, Trash2, Trophy, Users } from 'lucide-react';
import { deleteEvent, useEvent, useEvents, usePlayers } from '../../../lib/data';
import { closeGolfRound, pendingGolfSign, queueGolfSign, useGolfEvent, useGolfTournament, useGolfTournaments, type GolfCardDoc } from '../../../lib/data/golf';
import { sentOrQueued, useOutboxSnapshot } from '../../../lib/data/client';
import { eventLabel, toIsoDate } from '../../../lib/format';
import { useLeagueCtx } from '../../../lib/league';
import { formatTime } from '../../../lib/schedule';
import { useNow } from '../../../lib/useNow';
import { useBusy } from '../../../components/busy';
import { EventMenu, EventTopBar, LiveWhen, MoreButton, eventDay, type MenuItem } from '../../../components/event/EventHeader';
import { saveErrorMessage, useAction, useFeedback } from '../../../components/feedback';
import { useIsPro, useSwitchMode } from '../../../components/mode';
import { shareLink } from '../../../components/share';
import { ReportButton } from '../../../components/tournamentReport/ReportButton';
import { golfComp } from '../../../prizes/sports';
import { Button, Empty, LoadError, PageSkeleton, Segmented, cx } from '../../../components/ui';
import { EmptyCard, MenuSheets, useMenuSheet } from '../FieldChrome';
import { CardModal } from './bits';
import { cardWire, markSent, mergeCard, sendPending, useCourtLog } from './courtLog';
import { GolfBoard } from './GolfBoard';
import { GolfCourt } from './GolfCourt';
import { GolfPrizes } from './GolfPrizes';
import { GolfPlayers } from './GolfPlayers';
import { RoundForm } from './RoundForm';
import { formatLabel, holesDone, isComplete, nineLabel } from './logic';

type TabKey = 'tarjeta' | 'leaderboard' | 'jugadores';

const TAB_LABEL: Record<TabKey, string> = { tarjeta: 'Tarjeta', leaderboard: 'Leaderboard', jugadores: 'Jugadores' };

/**
 * Una ronda de golf (rediseño «Calma y foco», con la forma de la práctica del boliche): «‹ Golf del Club» y «•••» arriba,
 * el título grande y una línea con el día, la hora, el campo y el formato (y «En juego» o «Cerrada»). Debajo, las partes
 * de la ronda en un segmentado: Tarjeta (la del grupo, en el campo) · Leaderboard · Jugadores (inscribirse, grupos).
 * - «•••»: Compartir, Reporte y, para el admin, Campo y formato, Anotadores, Cerrar o abrir la ronda y Eliminar (nunca al
 *   final de la pantalla).
 * - Lite: el leaderboard con lo oficial y los jugadores sin herramientas del admin («Inscribir y armar grupos» está en
 *   Pro, con «Usar Pro»). Pro: los otros modos del leaderboard (neto, bruto, Stableford), sus columnas y las
 *   herramientas del admin.
 * Como portada de un torneo de una sola ronda (`eventId` fijo) no lleva barra ni título: los pone el inicio de la liga.
 */
export default function GolfEvent({ eventId: fixed }: { eventId?: string }) {
  const params = useParams();
  const eventId = fixed ?? params.eventId;
  const { lid, base, isAdmin, member, myPlayerId, league } = useLeagueCtx();
  const standalone = league.kind === 'torneo';
  const navigate = useNavigate();
  const run = useAction();
  const { confirm, toast } = useFeedback();
  const isPro = useIsPro();
  const switchMode = useSwitchMode();
  // La ruedita en lo que espera: compartir (el menú del teléfono), cerrar o abrir la ronda y firmar.
  const sharing = useBusy();
  const busy = useBusy<'cerrar' | 'firmar'>();
  const sheet = useMenuSheet();
  const [search, setSearch] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
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
  const today = toIsoDate(useNow());
  // La firma pendiente en la cola cambia lo que se ofrece (se vuelve a dibujar cuando la cola cambia).
  useOutboxSnapshot();

  // Lo anotado en este teléfono se ve en todas las partes aunque no haya llegado al servidor.
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
  const embedded = !!fixed;
  const myCard = myPlayerId ? (cards.find((c) => c.playerId === myPlayerId) ?? null) : null;
  const staff = isAdmin || !!member?.scorer;
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

  const tabs: { key: TabKey; label: string }[] = round
    ? ([...(!round.closed && (staff || myCard) ? ['tarjeta' as const] : []), 'leaderboard', 'jugadores'] as TabKey[]).map((key) => ({ key, label: TAB_LABEL[key] }))
    : [];
  const requested = search.get('tab') as TabKey | null;
  const fallback: TabKey =
    tabs.some((t) => t.key === 'tarjeta') && (ev.date === today || (myCard && holesDone(myCard) > 0))
      ? 'tarjeta'
      : started || round?.closed
        ? 'leaderboard'
        : 'jugadores';
  const tab: TabKey = requested && tabs.some((t) => t.key === requested) ? requested : tabs.some((t) => t.key === fallback) ? fallback : 'leaderboard';

  const sign = (card: GolfCardDoc) =>
    busy.run('firmar', async () => {
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
    });

  async function remove() {
    setMenu(false);
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
    await busy.run('cerrar', () => run(() => closeGolfRound(lid, eventId!, !round.closed), round.closed ? 'Ronda abierta' : 'Ronda cerrada'));
  }

  const share = () =>
    void sharing.run('compartir', async () => {
      if (await shareLink(`${location.origin}${standalone && embedded ? base : `${base}/e/${eventId}`}`, `${title} · MatchMate`)) toast('Link copiado');
      setMenu(false);
    });

  const closeMenu = () => setMenu(false);
  const menuItems: MenuItem[] = [
    { key: 'compartir', icon: Share2, label: 'Compartir', hint: 'Manda el link de la ronda', onClick: share, busy: sharing.isBusy() },
    ...(report
      ? [
          {
            key: 'reporte',
            icon: FileDown,
            label: tid ? 'Reporte del torneo' : 'Reporte de la ronda',
            hint: 'PDF para WhatsApp o imprimir, o Excel',
            onClick: () => sheet.show('reporte', closeMenu),
            busy: sheet.isBusy('reporte'),
          },
        ]
      : []),
    ...(isAdmin
      ? [
          ...(!round?.closed
            ? [
                {
                  key: 'campo',
                  icon: Settings2,
                  label: round ? 'Campo y formato' : 'Elegir campo',
                  hint: round ? 'Campo, hoyos y formato' : 'En qué campo y con qué formato',
                  onClick: () => {
                    closeMenu();
                    setEditing(true);
                  },
                },
              ]
            : []),
          ...(!isPro && round && !round.closed
            ? [
                {
                  key: 'pro',
                  icon: Users,
                  label: 'Inscribir y armar grupos',
                  hint: 'Están en Pro · Usar Pro',
                  onClick: () => {
                    closeMenu();
                    void switchMode('pro');
                  },
                },
              ]
            : []),
          {
            key: 'anotadores',
            icon: ClipboardPen,
            label: 'Anotadores',
            hint: 'Quién anota esta ronda',
            onClick: () => sheet.show('anotadores', closeMenu),
            busy: sheet.isBusy('anotadores'),
          },
          ...(round
            ? [
                {
                  key: 'cerrar',
                  icon: round.closed ? LockOpen : Lock,
                  label: round.closed ? 'Volver a abrir la ronda' : 'Cerrar la ronda',
                  hint: round.closed ? 'Para corregir tarjetas' : 'Resultados finales y orden de mérito',
                  onClick: () => void toggleClosed().then(closeMenu),
                  busy: busy.isBusy('cerrar'),
                },
              ]
            : []),
          { key: 'eliminar', icon: Trash2, label: 'Eliminar ronda', onClick: () => void remove(), danger: true },
        ]
      : []),
  ];

  const status =
    round?.closed ? (
      <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-fg-2">
        <Lock aria-hidden="true" className="size-3.5" />
        Cerrada
      </span>
    ) : started ? (
      <LiveWhen startsSoon={false} startLabel={null} />
    ) : null;
  const meta = [
    eventDay(ev.date, today, isPro),
    ev.startTime ? formatTime(ev.startTime.slice(0, 5)) : null,
    // El campo, si no es el de siempre de la liga (o en Pro).
    round && (isPro || round.courseName !== league.venue) ? round.courseName : null,
    round ? (round.nine === 'all' ? formatLabel(round.competition) : `${nineLabel(round.nine, round.holes)} · ${formatLabel(round.competition)}`) : null,
    isPro && round?.shotgun ? 'salida simultánea' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const metaLine = (
    <p className={cx('min-w-0 text-meta text-muted', embedded ? 'min-w-0 flex-1' : isPro ? 'mt-1' : 'mt-1.5')}>
      {/* En línea (no flex): al partirse a 360 px el texto sigue tras el «·» en vez de dejarlo colgando. */}
      {status && (
        <>
          <span className="inline-flex align-middle">{status}</span>
          <span aria-hidden="true"> · </span>
        </>
      )}
      {meta}
    </p>
  );
  const eyebrow = tournament && (
    <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-accent">
      <Trophy aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">
        {tournament.name}
        {round?.roundNo ? ` · Ronda ${round.roundNo}` : ''}
      </span>
    </p>
  );
  const more = <MoreButton onClick={() => setMenu(true)} />;

  return (
    <div className={cx('flex flex-col', !embedded && 'px-2')}>
      {embedded ? (
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {eyebrow}
            {metaLine}
          </div>
          {more}
        </div>
      ) : (
        <>
          <EventTopBar back={{ label: league.name, fallback: base }} right={more} />
          {eyebrow && <div className="mt-1">{eyebrow}</div>}
          <h1 className={isPro ? 'mt-0.5 text-title-pro' : 'mt-1 text-title'}>{title}</h1>
          {metaLine}
        </>
      )}

      {!round ? (
        <EmptyCard
          className="mt-[22px]"
          icon={<Flag className="size-5" />}
          title="Esta ronda todavía no tiene campo"
          text={isAdmin ? 'Elige en qué campo y con qué formato se juega.' : 'El admin tiene que elegir el campo y el formato.'}
          action={
            isAdmin && (
              <Button variant="primary" size="lg" icon={<Settings2 className="size-5" />} onClick={() => setEditing(true)}>
                Elegir campo
              </Button>
            )
          }
        />
      ) : (
        <>
          {myCard && !myCard.signed && !pendingGolfSign(lid, myCard.id) && !round.closed && isComplete(myCard) && tab !== 'tarjeta' && (
            <Button variant="primary" size="xl" className="mt-[22px] w-full" icon={<Signature className="size-5" />} onClick={() => setSigning(myCard)}>
              Terminaste: revisa y firma tu tarjeta
            </Button>
          )}
          <div className="mt-[22px]">
            <Segmented full label="Partes de la ronda" options={tabs} value={tab} onChange={(k) => setSearch({ tab: k }, { replace: true })} />
          </div>
          <div key={tab} className="animate-fade-up mt-4">
            {tab === 'tarjeta' ? (
              <GolfCourt round={round} cards={golf.data.cards} nameOf={nameOf} myCard={myCard} staff={staff} isAdmin={isAdmin} onSign={setSigning} />
            ) : tab === 'leaderboard' ? (
              <GolfBoard round={round} cards={cards} nameOf={nameOf} />
            ) : (
              <GolfPlayers round={round} cards={cards} players={players.data} onSign={setSigning} />
            )}
          </div>
          {/* Lo del torneo, en los dos modos: el reporte a la mano del admin al terminar (para todos está en «•••») y los premios. */}
          <div className="mt-[30px] flex flex-col gap-4 empty:hidden">
            {report && isAdmin && finished && <ReportButton {...report} look="card" />}
            <GolfPrizes eventId={eventId} name={ev.name} date={ev.date} round={round} cards={golf.data.cards} tournamentName={tournament?.name} nameOf={nameOf} />
          </div>
          <CardModal
            open={!!signing}
            onClose={() => setSigning(null)}
            name={signing ? `Firmar: ${nameOf(signing.playerId)}` : ''}
            round={round}
            card={signing ? (cards.find((c) => c.id === signing.id) ?? signing) : null}
            footer={
              <>
                <Button className="h-11" onClick={() => setSigning(null)} disabled={busy.isBusy('firmar')}>
                  Todavía no
                </Button>
                <Button variant="primary" className="h-11" icon={<Signature className="size-4" />} loading={busy.isBusy('firmar')} onClick={() => signing && void sign(signing)}>
                  Firmo: está correcta
                </Button>
              </>
            }
          />
        </>
      )}

      <EventMenu open={menu} onClose={closeMenu} title={title} items={menuItems} />
      <MenuSheets
        open={sheet.open}
        onClose={sheet.close}
        scorers={
          isAdmin
            ? { target: { scope: 'evento', refId: ev.id, title: ev.name || (league.kind === 'torneo' ? league.name : title) }, participants: golf.data.cards.map((c) => c.playerId) }
            : null
        }
        report={report}
      />
      {isAdmin && <RoundForm open={editing} onClose={() => setEditing(false)} edit={{ eventId, round, started }} />}
    </div>
  );
}
