import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  Ban,
  CheckCircle2,
  ClipboardPen,
  Crosshair,
  Flag,
  GitFork,
  ImageIcon,
  ListOrdered,
  Play,
  RotateCcw,
  Settings2,
  Share2,
  Swords,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import { useAuth } from '../../../lib/auth';
import {
  checkIn,
  deleteStage,
  esportsErrorText,
  setTournamentStatus,
  syncBracket,
  type BrGame,
  type EsportsEntry,
  type EsportsTournament,
} from '../../../lib/data/esports';
import { useMyGameIds } from '../../../lib/data/esportsIds';
import type { Match } from '../../../lib/data/matches';
import { useLeagueCtx } from '../../../lib/league';
import { useNow } from '../../../lib/useNow';
import {
  GAMES,
  canCheckIn,
  canRegister,
  champion,
  formatLine,
  isIndividualMode,
  rankKeyFor,
  resolvePlan,
  tiebreakText,
  type StageKind,
} from '../../../sports/esports';
import { groupLetter } from '../../../sports/formats';
import { EntryStatusChip, GameMark, PhaseChip } from '../../../components/esports/bits';
import { useBusy } from '../../../components/busy';
import { useFeedback } from '../../../components/feedback';
import { EventMenu, EventTopBar, MoreButton, type MenuItem } from '../../../components/event/EventHeader';
import { MatchCard, StandingsTable, whenText } from '../../../components/match';
import { useIsPro } from '../../../components/mode';
import { NoticeSlot, useNotice } from '../../../components/NoticeSlot';
import { shareLink } from '../../../components/share';
import { Button, Card, DateBlock, Empty, ListRow, LoadError, PageSkeleton, Segmented, SectionHeader, cx } from '../../../components/ui';
import { FinePrint } from '../racket/bits';
import { ScorersSheet, useOrganizePro } from '../racket/frame';
import { localParts } from '../racket/logic/time';
import { BrGameSheet } from './admin/BrGameSheet';
import { EditTournamentSheet } from './admin/EditTournamentSheet';
import { FreeAgentsSheet } from './admin/FreeAgentsSheet';
import { SeedSheet } from './admin/SeedSheet';
import { StageSheet } from './admin/StageSheet';
import { BrGamesList } from './br/BrGamesList';
import { BrLeaderboard } from './br/BrLeaderboard';
import { EsportsBracket } from './bracket/EsportsBracket';
import { EntriesView, TournamentInfo } from './EntriesView';
import {
  brTable,
  cardMatch,
  competitors,
  countLine,
  freeAgents,
  groupTablesOf,
  infoInTeams,
  lastStage,
  MEMBER_PROBLEM,
  memberProblem,
  myActionMatches,
  myEntryOf,
  needsSync,
  organizerAction,
  pendingEntries,
  phaseOf,
  pickView,
  planFromStage,
  primaryAction,
  resultsByKey,
  sideOfTeams,
  stageDone,
  stageMatches,
  stageUntouched,
  stagesCreated,
  standingsColumns,
  tableOf,
  tournamentPathFor,
  viewsFor,
  type Primary,
  type View,
} from './logic';
import { MatchSheet } from './match/MatchSheet';
import { useEntryNames, useMyTeams, useTournament, type TournamentData } from './parts';
import { RegisterSheet } from './register/RegisterSheet';

type SheetKey = 'menu' | 'register' | 'seed' | 'stage' | 'playoffs' | 'agents' | 'br' | 'edit' | 'scorers';

/**
 * La página del torneo de esports (§12.8). `embedded`: es el inicio de un torneo suelto (`/l/:lid`, debajo del nombre de
 * la liga que pone LeagueShell): sin «‹ atrás» ni título propio.
 */
export function TournamentView({ eventId, embedded }: { eventId: string; embedded?: boolean }) {
  const { lid } = useLeagueCtx();
  const d = useTournament(lid, eventId);
  const [params, setParams] = useSearchParams();
  const matchId = params.get('partido');
  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v === null) p.delete(k);
    else p.set(k, v);
    setParams(p, { replace: k === 'ver' });
  };
  if (d.error) return <LoadError error={d.error} />;
  if (d.loading) return <PageSkeleton />;
  if (!d.t) {
    return (
      <Empty icon={<Trophy className="size-8" />} title="Este torneo no existe">
        Puede que lo hayan borrado.
      </Empty>
    );
  }
  if (matchId) return <MatchSheet matchId={matchId} onBack={() => setParam('partido', null)} backLabel={d.t.name} />;
  return <Tournament t={d.t} d={d} embedded={!!embedded} view={params.get('ver')} setParam={setParam} />;
}

function Tournament({
  t,
  d,
  embedded,
  view: wanted,
  setParam,
}: {
  t: EsportsTournament;
  d: TournamentData;
  embedded: boolean;
  view: string | null;
  setParam: (k: string, v: string | null) => void;
}) {
  const { lid, league, base, isAdmin, member } = useLeagueCtx();
  const pro = useIsPro();
  const organizer = pro && isAdmin;
  const uid = useAuth().user?.uid ?? null;
  const navigate = useNavigate();
  const now = useNow().getTime();
  const { toast, confirm } = useFeedback();
  const busy = useBusy<'accion' | 'checkin' | 'estado' | 'rehacer'>();
  const [sheet, setSheet] = useState<SheetKey | null>(null);
  const [editingBr, setEditingBr] = useState<BrGame | null>(null);
  const myTeams = useMyTeams(d.entries);
  const nameOf = useEntryNames(d.entries);
  const myIds = useMyGameIds(uid);
  const meta = GAMES[t.game];

  // Una vez por visita: lo que pasó a final por las 48 h sin que nadie escribiera avanza el cuadro. Solo los de la liga
  // (la base no deja a los demás): quien mira un torneo público sin ser de la liga no llama.
  const synced = useRef(false);
  const canSync = !!uid && (!!member || isAdmin);
  useEffect(() => {
    if (!canSync || synced.current || !d.links.length || !needsSync(d.matches, d.links, now)) return;
    synced.current = true;
    syncBracket(t.eventId).catch((e: unknown) => console.warn('[esports] sync', e));
  }, [canSync, d.links, d.matches, now, t.eventId]);

  const phase = phaseOf(t, now);
  const phaseInput = { status: t.status, startsAt: t.startsAt, registrationOpensAt: t.registrationOpensAt, registrationClosesAt: t.registrationClosesAt, checkinMinutes: t.checkinMinutes };
  const registrationOpen = canRegister(phaseInput, now);
  const checkinOpen = canCheckIn(phaseInput, now);
  const approved = competitors(d.entries);
  const pending = pendingEntries(d.entries);
  const myEntry = myEntryOf(d.entries, uid);
  const created = stagesCreated(d.links);
  const hasStage = created.size > 0;
  const groupsRows = stageMatches('groups', d.matches, d.links);
  const groupsDone = stageDone(groupsRows, now);
  const { toConfirm, toScore } = myActionMatches(d.matches, myTeams.act, now);
  const individual = isIndividualMode(t.mode);
  const input = {
    format: t.format,
    entryType: t.entryType,
    mode: t.mode,
    status: t.status,
    signedIn: !!uid,
    registrationOpen,
    checkinOpen,
    myEntry,
    uid,
    toConfirm,
    toScore,
    organizer,
    pending: pending.length,
    approved: approved.length,
    hasStage,
    groupsDone,
    hasPlayoffs: created.has('playoffs'),
  };
  const primary = primaryAction(input);
  const orgAction = primary && organizer && (primary.kind === 'register' || primary.kind === 'signin') ? organizerAction(input) : null;
  const path = tournamentPathFor(lid, t.eventId, league.kind);

  // ---- Avisos (uno por pantalla: el NoticeSlot elige) ----
  // Lo que le falta a tu ID para inscribirte: ponerlo; o, si el torneo lo pide y el juego lo puede comprobar, comprobarlo
  // (o el rango verificado, solo en LoL).
  const myId = myIds.data.find((r) => r.game === t.game && r.platform === (t.game === 'nba_2k' ? t.settings.platform : ''));
  const idProblem = memberProblem(myId, t.settings, rankKeyFor(t.game, t.mode), t.game);
  useNotice(
    !!uid &&
      registrationOpen &&
      !myEntry &&
      !myIds.loading &&
      !!idProblem && {
        id: `esports-id:${t.game}:${idProblem === MEMBER_PROBLEM.noId ? 'poner' : idProblem === MEMBER_PROBLEM.unchecked ? 'comprobar' : 'rango'}`,
        kind: 'tip',
        title:
          idProblem === MEMBER_PROBLEM.noId
            ? `Pon tu ID de ${meta.name}`
            : idProblem === MEMBER_PROBLEM.unchecked
              ? `Comprueba tu ID de ${meta.name}`
              : `Este torneo pide tu rango verificado de ${meta.name}`,
        text: idProblem === MEMBER_PROBLEM.noId ? 'Lo necesitas para inscribirte.' : idProblem === MEMBER_PROBLEM.unchecked ? 'Este torneo lo pide comprobado.' : 'El que da Riot al comprobar tu ID.',
        action: { label: idProblem === MEMBER_PROBLEM.noId ? 'Poner mi ID' : 'Ir a Mi ID', to: `/esports/mi-id?juego=${t.game}&volver=${encodeURIComponent(path)}` },
      },
  );
  useNotice(
    myEntry?.status === 'pending' && {
      id: `esports-pendiente:${myEntry.id}`,
      kind: 'tip',
      title: 'Tu inscripción está por aprobar',
      text: 'Te avisamos cuando el organizador la revise.',
    },
  );
  const checkinAt = t.checkinMinutes ? Date.parse(t.startsAt) - t.checkinMinutes * 60_000 : null;
  useNotice(
    myEntry?.status === 'approved' &&
      checkinAt !== null &&
      now < checkinAt &&
      t.status === 'registration' && {
        id: `esports-checkin:${t.eventId}`,
        kind: 'tip',
        title: `El check-in abre el ${checkinDay(checkinAt, league.tz)}`,
        text: 'Hazlo antes de empezar o te pueden dejar fuera.',
      },
  );
  const finished = t.status === 'finished' || t.status === 'cancelled';
  const proItem = useOrganizePro(isAdmin && !finished, {
    id: `esports-torneo-pro:${t.eventId}`,
    title: 'Organizas este torneo',
    text: 'Inscripciones y cuadro se manejan en Pro',
    menu: 'Revisar inscripciones y armar el cuadro',
  });

  // ---- Acciones ----
  const openMatch = (id: string) => setParam('partido', id);
  const doCheckIn = () =>
    busy.run('checkin', async () => {
      if (!myEntry) return;
      try {
        await checkIn(myEntry.id);
        toast('Check-in hecho');
      } catch (e) {
        toast(esportsErrorText(e, t.game, 'inscripcion'), 'error');
      }
    });
  const setStatus = async (status: EsportsTournament['status'], ask: { title: string; message: string; confirmText: string; danger?: boolean } | null, ok: string) => {
    setSheet(null);
    if (ask && !(await confirm(ask))) return;
    await busy.run('estado', async () => {
      try {
        await setTournamentStatus(t.eventId, status);
        toast(ok);
      } catch (e) {
        toast(esportsErrorText(e, t.game, 'torneo'), 'error');
      }
    });
  };
  const redo = lastStage(created);
  const redoable = !!redo && stageUntouched(stageMatches(redo, d.matches, d.links));
  const doRedo = async () => {
    setSheet(null);
    if (!redo) return;
    if (!(await confirm({ title: '¿Rehacer el cuadro?', message: 'Se borran sus series (todavía sin resultados) y lo armas de nuevo.', confirmText: 'Rehacer', danger: true }))) return;
    await busy.run('rehacer', async () => {
      try {
        await deleteStage(lid, t.eventId, redo);
        toast('Listo: arma el cuadro otra vez');
      } catch (e) {
        toast(esportsErrorText(e, t.game, 'cuadro'), 'error');
      }
    });
  };
  const runPrimary = (p: Primary) => {
    switch (p.kind) {
      case 'confirm':
      case 'score':
        return p.matchId && openMatch(p.matchId);
      case 'checkin':
        return void doCheckIn();
      case 'register':
        return setSheet('register');
      case 'signin':
        return navigate(`/login?next=${encodeURIComponent(path)}`);
      case 'review':
        return setParam('ver', 'equipos');
      case 'stage':
        return setSheet('stage');
      case 'playoffs':
        return setSheet('playoffs');
      case 'start':
        return void setStatus('live', { title: '¿Empezar el torneo?', message: 'Se cierra la inscripción y ya puedes anotar las partidas.', confirmText: 'Empezar' }, 'El torneo empezó');
      case 'brGame':
        return openBr(null);
    }
  };
  const openBr = (g: BrGame | null) => {
    setEditingBr(g);
    setSheet('br');
  };
  const share = async () => {
    setSheet(null);
    if (await shareLink(`${location.origin}${path}`, t.name)) toast('Link copiado');
  };

  const menu: MenuItem[] = [
    { key: 'compartir', icon: Share2, label: 'Compartir el torneo', onClick: () => void share() },
    ...(proItem ? [proItem] : []),
    ...(organizer
      ? [
          { key: 'editar', icon: Settings2, label: 'Editar torneo', hint: hasStage ? 'Nombre, fechas, cupo y reglas' : 'También el formato', onClick: () => setSheet('edit') },
          ...(t.status === 'registration' && !hasStage && t.format !== 'br' && approved.length > 1
            ? [{ key: 'sembrar', icon: ListOrdered, label: 'Sembrar', hint: 'A mano, al azar o por rango', onClick: () => setSheet('seed') }]
            : []),
          ...(t.entryType === 'open' && !individual && freeAgents(d.entries).length > 0
            ? [{ key: 'agentes', icon: UserPlus, label: 'Agentes libres', hint: 'Sumar o balancear por rango', onClick: () => setSheet('agents') }]
            : []),
          ...(t.status === 'registration' && !hasStage && t.format !== 'br' ? [{ key: 'cuadro', icon: GitFork, label: 'Armar el cuadro', onClick: () => setSheet('stage') }] : []),
          ...(redoable ? [{ key: 'rehacer', icon: RotateCcw, label: 'Rehacer el cuadro', hint: 'Solo sin resultados', onClick: () => void doRedo(), busy: busy.isBusy('rehacer') }] : []),
          ...(t.format === 'br' ? [{ key: 'anotadores', icon: ClipboardPen, label: 'Anotadores', hint: 'Quién anota las partidas', onClick: () => setSheet('scorers') }] : []),
          { key: 'logo', icon: ImageIcon, label: 'Logo', hint: 'El del torneo', onClick: () => navigate(`${base}/admin?tab=liga`) },
          ...(t.status === 'live'
            ? [{ key: 'cerrar', icon: Flag, label: 'Cerrar torneo', hint: 'Queda terminado', onClick: () => void setStatus('finished', { title: '¿Cerrar el torneo?', message: 'Queda como terminado.', confirmText: 'Cerrar' }, 'Torneo cerrado') }]
            : []),
          ...(t.status === 'cancelled' ? [{ key: 'reabrir', icon: Play, label: 'Volver a abrir', hint: 'Vuelve a la inscripción', onClick: () => void setStatus('registration', null, 'Torneo abierto otra vez') }] : []),
          ...(t.status === 'registration' || t.status === 'live'
            ? [
                {
                  key: 'cancelar',
                  icon: Ban,
                  label: 'Cancelar torneo',
                  danger: true,
                  onClick: () => void setStatus('cancelled', { title: '¿Cancelar el torneo?', message: 'Les llega a los inscritos. Lo puedes volver a abrir.', confirmText: 'Cancelar torneo', danger: true }, 'Torneo cancelado'),
                },
              ]
            : []),
        ]
      : []),
  ];

  // ---- Lo que se ve ----
  const views = viewsFor(t.format, t.mode);
  const view = pickView(t.format, t.mode, wanted);
  const startDay = whenText(t.startsAt, league.tz, true);
  const metaLine = [formatLine(t), `${countLine(approved.length, t.maxEntries)} ${individual ? 'jugadores' : 'equipos'}`].join(' · ');
  const head = (
    <div className="flex items-center gap-3.5">
      <DateBlock date={localParts(t.startsAt, league.tz)?.date ?? t.startsAt} />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 flex-wrap items-center gap-2">
          <GameMark game={t.game} size="sm" />
          <PhaseChip phase={phase} />
          {startDay && <span className="text-[13.5px] text-muted">{startDay}</span>}
        </p>
        <p className="mt-1 text-[14px] leading-snug text-muted">{metaLine}</p>
      </div>
      {embedded && <MoreButton onClick={() => setSheet('menu')} />}
    </div>
  );

  return (
    <div className={cx('flex flex-col', !embedded && 'px-2')}>
      {!embedded && (
        <>
          <EventTopBar back={{ label: league.name, fallback: base }} right={<MoreButton onClick={() => setSheet('menu')} />} />
          <h1 className={cx('break-words', pro ? 'mt-0.5 text-title-pro' : 'mt-1 text-title')}>{t.name}</h1>
        </>
      )}
      <div className={embedded ? '' : 'mt-3'}>{head}</div>
      {t.prizeText.trim() && (
        <p className="mt-3 inline-flex items-center gap-2 text-[14.5px] font-semibold text-fg-2">
          <Trophy aria-hidden="true" className="size-4 shrink-0 text-gold" />
          <span className="min-w-0">{t.prizeText}</span>
        </p>
      )}

      {primary && (
        <div className="mt-[22px] flex flex-col gap-2.5">
          <Button
            variant="primary"
            size={pro ? 'lg' : 'xl'}
            className="w-full"
            icon={primaryIcon(primary)}
            loading={busy.isBusy('checkin') || busy.isBusy('estado')}
            onClick={() => runPrimary(primary)}
          >
            {primary.label}
          </Button>
          {orgAction && (
            <Button variant="soft" size="lg" className="w-full" onClick={() => runPrimary(orgAction)}>
              {orgAction.label}
            </Button>
          )}
        </div>
      )}

      {myEntry && (
        <Card className="mt-3.5 overflow-hidden">
          <ListRow
            dense={pro}
            leading={
              <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                {individual ? <Crosshair className="size-5" /> : <Users className="size-5" />}
              </span>
            }
            title="Tu inscripción"
            subtitle={myEntry.kind === 'free_agent' ? 'Agente libre' : myEntry.name}
            trailing={<EntryStatusChip status={myEntry.status} checkedIn={!!myEntry.checkedInAt} />}
            onClick={() => setSheet('register')}
          />
        </Card>
      )}

      {views.length > 1 && (
        <Segmented full label="Qué ver" className="mt-[26px]" options={views.map((v) => ({ key: v.key, label: v.label }))} value={view} onChange={(k) => setParam('ver', k)} />
      )}

      <div className="mt-[22px]">
        <ViewBody
          view={view}
          t={t}
          d={d}
          organizer={organizer}
          myTeams={myTeams.all}
          myEntry={myEntry}
          nameOf={nameOf}
          now={now}
          onOpen={openMatch}
          onAgents={() => setSheet('agents')}
          onBrEdit={openBr}
          onBrNew={() => openBr(null)}
          canScoreBr={organizer || !!member?.scorer}
        />
      </div>

      {!embedded && <NoticeSlot className="mt-6" />}

      <EventMenu open={sheet === 'menu'} onClose={() => setSheet(null)} title={t.name} items={menu} />
      <RegisterSheet open={sheet === 'register'} onClose={() => setSheet(null)} t={t} entry={myEntry} />
      {organizer && (
        <>
          <SeedSheet open={sheet === 'seed'} onClose={() => setSheet(null)} t={t} entries={d.entries} />
          <StageSheet open={sheet === 'stage' || sheet === 'playoffs'} onClose={() => setSheet(null)} mode={sheet === 'playoffs' ? 'playoffs' : 'create'} t={t} entries={d.entries} matches={d.matches} links={d.links} />
          <FreeAgentsSheet open={sheet === 'agents'} onClose={() => setSheet(null)} t={t} entries={d.entries} />
          <EditTournamentSheet open={sheet === 'edit'} onClose={() => setSheet(null)} t={t} tz={league.tz} approved={approved.length} formatEditable={t.status === 'registration' && !hasStage} />
          {t.format === 'br' && (
            <ScorersSheet open={sheet === 'scorers'} onClose={() => setSheet(null)} target={{ scope: 'evento', refId: t.eventId, title: t.name }} participants={approved.flatMap((e) => e.members.map((m) => m.playerId ?? '')).filter(Boolean)} />
          )}
        </>
      )}
      {t.format === 'br' && (organizer || !!member?.scorer) && (
        <BrGameSheet open={sheet === 'br'} onClose={() => setSheet(null)} t={t} entries={d.entries} games={d.br} editing={editingBr} />
      )}
    </div>
  );
}

function primaryIcon(p: Primary): ReactNode {
  switch (p.kind) {
    case 'checkin':
      return <CheckCircle2 className="size-5" />;
    case 'stage':
    case 'playoffs':
      return <GitFork className="size-5" />;
    case 'start':
      return <Play className="size-5" />;
    case 'brGame':
      return <Crosshair className="size-5" />;
    case 'score':
    case 'confirm':
      return <Swords className="size-5" />;
    default:
      return null;
  }
}

/** «sábado 12 oct a las 6:30 p. m.» en la zona de la liga. */
function checkinDay(ts: number, tz?: string): string {
  const d = new Date(ts);
  const day = new Intl.DateTimeFormat('es-DO', { weekday: 'long', day: 'numeric', month: 'short', timeZone: tz || undefined }).format(d).replace(/\./g, '');
  const time = new Intl.DateTimeFormat('es-DO', { hour: 'numeric', minute: '2-digit', timeZone: tz || undefined }).format(d);
  return `${day} a las ${time}`;
}

/** Lo de cada vista (Cuadro, Grupos, Playoffs, Tabla, Partidos, Partidas, Equipos, Info). */
function ViewBody({
  view,
  t,
  d,
  organizer,
  myTeams,
  myEntry,
  nameOf,
  now,
  onOpen,
  onAgents,
  onBrEdit,
  onBrNew,
  canScoreBr,
}: {
  view: View;
  t: EsportsTournament;
  d: TournamentData;
  organizer: boolean;
  myTeams: ReadonlySet<string>;
  myEntry: EsportsEntry | null;
  nameOf: (id: string | null | undefined) => string;
  now: number;
  onOpen: (matchId: string) => void;
  onAgents: () => void;
  onBrEdit: (g: BrGame) => void;
  onBrNew: () => void;
  canScoreBr: boolean;
}) {
  const { league } = useLeagueCtx();
  const highlight = useMemo(() => new Set(myEntry ? [myEntry.id] : []), [myEntry]);
  const card = (m: Match) => <MatchCard key={m.id} match={cardMatch(m)} mySide={sideOfTeams(m, myTeams)} onClick={() => onOpen(m.id)} tz={league.tz} now={now} roundWord="Jornada" />;
  const seedOf = (id: string) => d.byId.get(id)?.seed ?? null;
  const bracket = (stage: StageKind, empty: ReactNode) => {
    const rows = stageMatches(stage, d.matches, d.links);
    if (!rows.length) return empty;
    const plan = planFromStage(stage, d.matches, d.links, d.entryOf);
    const results = resultsByKey(d.matches, d.entryOf, now);
    const byKey = new Map(rows.map(({ match }) => [match.bracketKey ?? match.id, match]));
    return (
      <EsportsBracket
        matches={resolvePlan(plan, results)}
        nameOf={nameOf}
        seedOf={seedOf}
        matchOf={(k) => byKey.get(k)}
        champion={champion(plan, results)}
        onOpen={(m) => onOpen(m.id)}
        highlight={highlight}
      />
    );
  };
  const columns = standingsColumns(t.game);
  const info = <TournamentInfo t={t} className="mt-[30px]" />;

  switch (view) {
    case 'cuadro':
      return bracket(
        'bracket',
        <Empty icon={<GitFork className="size-8" />} title="El cuadro todavía no está">
          {t.status === 'registration' ? 'Se arma cuando cierre la inscripción.' : 'El organizador todavía no lo arma.'}
        </Empty>,
      );
    case 'playoffs':
      return bracket(
        'playoffs',
        <Empty icon={<Trophy className="size-8" />} title="Los playoffs todavía no están">
          {`Pasan ${t.settings.perGroup} de cada grupo cuando terminen los grupos.`}
        </Empty>,
      );
    case 'grupos': {
      const rows = stageMatches('groups', d.matches, d.links);
      if (!rows.length) {
        return (
          <Empty icon={<ListOrdered className="size-8" />} title="Los grupos todavía no están">
            Se arman cuando cierre la inscripción.
          </Empty>
        );
      }
      const plan = planFromStage('groups', d.matches, d.links, d.entryOf);
      const groupOfMatch = new Map(rows.map(({ match, link }) => [match.id, link.groupNo ?? 0]));
      const tables = groupTablesOf(t.game, plan, d.matches, d.entryOf, now, t.eventId);
      return (
        <div className="flex flex-col gap-[30px]">
          {tables.map((g, i) => (
            <section key={i} aria-label={`Grupo ${groupLetter(i)}`}>
              <SectionHeader title={`Grupo ${groupLetter(i)}`} />
              <StandingsTable rows={g.rows} nameOf={nameOf} columns={columns} highlight={myEntry ? [myEntry.id] : []} />
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {d.matches
                  .filter((m) => groupOfMatch.get(m.id) === i)
                  .sort((a, b) => (a.round ?? 0) - (b.round ?? 0))
                  .map(card)}
              </div>
            </section>
          ))}
          <FinePrint>{tiebreakText(t.game)}</FinePrint>
        </div>
      );
    }
    case 'tabla': {
      if (t.format === 'br') {
        const ids = competitors(d.entries).map((e) => e.id);
        return <BrLeaderboard rows={brTable(ids, d.br, t.settings, t.game, t.eventId)} nameOf={nameOf} highlight={highlight} />;
      }
      const ids = competitors(d.entries).map((e) => e.id);
      if (!stageMatches('league', d.matches, d.links).length) {
        return (
          <Empty icon={<ListOrdered className="size-8" />} title="La tabla todavía no está">
            Se arma cuando el organizador cree los partidos.
          </Empty>
        );
      }
      return (
        <div className="flex flex-col gap-2">
          <StandingsTable rows={tableOf(t.game, ids, d.matches, d.entryOf, now, t.eventId)} nameOf={nameOf} columns={columns} highlight={myEntry ? [myEntry.id] : []} />
          <FinePrint>{tiebreakText(t.game)}</FinePrint>
        </div>
      );
    }
    case 'partidos': {
      const rows = stageMatches('league', d.matches, d.links).map((r) => r.match);
      if (!rows.length) {
        return (
          <Empty icon={<Swords className="size-8" />} title="Todavía no hay partidos">
            Salen aquí cuando el organizador los cree.
          </Empty>
        );
      }
      const rounds = [...new Set(rows.map((m) => m.round ?? 1))].sort((a, b) => a - b);
      return (
        <div className="flex flex-col gap-[30px]">
          {rounds.map((r) => (
            <section key={r} aria-label={`Jornada ${r}`}>
              <SectionHeader title={`Jornada ${r}`} />
              <div className="grid gap-2.5 sm:grid-cols-2">{rows.filter((m) => (m.round ?? 1) === r).map(card)}</div>
            </section>
          ))}
        </div>
      );
    }
    case 'partidas':
      return (
        <div className="flex flex-col gap-4">
          {canScoreBr && t.status !== 'finished' && t.status !== 'cancelled' && !organizer && (
            <Button variant="soft" size="lg" className="w-full" icon={<Crosshair className="size-5" />} onClick={onBrNew}>
              Anotar partida
            </Button>
          )}
          <BrGamesList games={d.br} settings={t.settings} nameOf={nameOf} onEdit={canScoreBr ? onBrEdit : undefined} />
        </div>
      );
    case 'equipos':
      return (
        <>
          <EntriesView t={t} entries={d.entries} organizer={organizer} myEntryId={myEntry?.id ?? null} onFreeAgents={onAgents} />
          {infoInTeams(t.format) && info}
        </>
      );
    case 'info':
      return <TournamentInfo t={t} />;
  }
}

/** El torneo dentro de una liga de esports, en una fila (con su fecha, el formato, los inscritos y la fase). */
export function TournamentRow({ t, approved, to, dense }: { t: EsportsTournament; approved?: number; to: string; dense?: boolean }) {
  const now = useNow().getTime();
  const { league } = useLeagueCtx();
  return (
    <ListRow
      dense={dense}
      leading={<DateBlock date={localParts(t.startsAt, league.tz)?.date ?? t.startsAt} />}
      title={t.name}
      subtitle={[formatLine(t), approved != null ? countLine(approved, t.maxEntries) : null].filter(Boolean).join(' · ')}
      trailing={<PhaseChip phase={phaseOf(t, now)} />}
      to={to}
    />
  );
}
