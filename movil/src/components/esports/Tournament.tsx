/**
 * La página del torneo de esports (TournamentPage.tsx de la web, Lite, con su misma lógica: logic.ts y
 * tournamentData.ts): el juego, la fase, el inicio, el formato y el cupo; UNA acción principal (anotar o confirmar mi
 * serie, hacer check-in, inscribirme); mi inscripción; el aviso de la pantalla (lo que le falta a tu ID, «Tu inscripción
 * está por aprobar», cuándo abre el check-in) y las vistas del formato: Cuadro, Grupos, Playoffs, Tabla, Partidos,
 * Partidas, Equipos (o Jugadores) e Info. Tocar una serie abre el partido. Quien organiza (en el teléfono no hay Pro: los
 * admins de la liga), lo de la web: revisar inscripciones, sembrar, armar el cuadro o empezar, pasar a playoffs, los
 * agentes libres, anotar partidas de battle royale, editar, rehacer el cuadro, los anotadores, el logo, cerrar, cancelar
 * o volver a abrir (las hojas de admin/*.tsx, con la lógica de admin/logic.ts).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, Share, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ban, CheckCircle2, ClipboardPen, Crosshair, Flag, GitFork, ImageIcon, ListOrdered, MoreHorizontal, Play, RotateCcw, Settings2, Share2, Swords, Trophy, UserPlus, Users } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { checkIn, deleteStage, esportsErrorText, setTournamentStatus, syncBracket, type BrGame, type EsportsEntry, type EsportsTournament } from '@mm/lib/data/esports';
import { useMyGameIds } from '@mm/lib/data/esportsIds';
import type { Match } from '@mm/lib/data/matches';
import type { Notice } from '@mm/lib/notices';
import { useLeagueCtx } from '@mm/lib/league';
import { shareOrigin } from '@mm/lib/origin';
import { useNow } from '@mm/lib/useNow';
import { whenText } from '@mm/components/match/format';
import { canCheckIn, canRegister, champion, formatLine, gameLabel, isIndividualMode, platformLabel, rankKeyFor, resolvePlan, tiebreakText, type StageKind } from '@mm/sports/esports';
import { groupLetter } from '@mm/sports/formats/groups';
import { localParts } from '@mm/pages/sports/racket/logic/time';
import { myIdLink } from '@mm/pages/esports/logic';
import {
  brTable,
  cardMatch,
  checkinDay,
  checkinOpensAt,
  competitors,
  countLine,
  freeAgents,
  groupTablesOf,
  idNotice,
  infoInTeams,
  lastStage,
  memberProblem,
  myActionMatches,
  myEntryOf,
  needsSync,
  organizerAction,
  pendingEntries,
  phaseOf,
  pickView,
  planFromStage,
  platformOf,
  playsOnOf,
  primaryAction,
  resultsByKey,
  sideOfTeams,
  stageDone,
  stageMatches,
  stageUntouched,
  stagesCreated,
  standingsColumns,
  tableOf,
  tournamentIdFor,
  tournamentPathFor,
  viewsFor,
  type Primary,
  type View as TournamentViewKey,
} from '@mm/pages/sports/esports/logic';
import { REDO_ASK, REDO_OK, STATUS_CHANGE, organizerMenu, type TournamentMenuKey } from '@mm/pages/sports/esports/admin/logic';
import { useEntryNames, useMyTeams, useTournament, type TournamentData } from '@mm/pages/sports/esports/tournamentData';
import { ScorersSheet } from '../scorers/ScorersSheet';
import { DateBlock } from '../DateBlock';
import { MatchCard } from '../match/MatchCard';
import { StandingsTable } from '../match/StandingsTable';
import { confirmAsync, toast } from '../feedback';
import { BackBar, Button, Card, Empty, ListRow, LoadError, Loading, Segmented, SectionHeader, Sheet, Txt } from '../ui';
import { BrGamesList, BrLeaderboard } from './Br';
import { EsportsBracket } from './Bracket';
import { EntriesView, TournamentInfo } from './Entries';
import { EntryStatusChip, GameMark, PhaseChip, ScreenNotice } from './bits';
import { FinePrint, MenuRow } from './inputs';
import { RegisterSheet } from './RegisterSheet';
import { BrGameSheet } from './BrGameSheet';
import { EditTournamentSheet } from './EditTournamentSheet';
import { FreeAgentsSheet, SeedSheet, StageSheet } from './StageSheets';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

type SheetKey = 'menu' | 'register' | 'seed' | 'stage' | 'playoffs' | 'agents' | 'br' | 'edit' | 'scorers';

/** El ícono de cada opción del organizador en «•••» (las opciones salen de organizerMenu, admin/logic.ts). */
const MENU_ICON: Record<TournamentMenuKey, typeof Settings2> = {
  editar: Settings2,
  sembrar: ListOrdered,
  agentes: UserPlus,
  cuadro: GitFork,
  rehacer: RotateCcw,
  anotadores: ClipboardPen,
  logo: ImageIcon,
  cerrar: Flag,
  reabrir: Play,
  cancelar: Ban,
};

/** El partido de la liga (`/l/<liga>/partido/<id>`, el `?partido=` de la web). */
export const esportsMatchRoute = (lid: string, matchId: string) => ({ pathname: '/l/[lid]/partido/[matchId]' as const, params: { lid, matchId } });

/**
 * La página del torneo. `embedded`: es el inicio de un torneo suelto (`/l/<liga>`, debajo del nombre de la liga): sin
 * «‹ atrás» ni título propio.
 */
export function TournamentView({ eventId, embedded = false }: { eventId: string; embedded?: boolean }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const d = useTournament(lid, eventId);
  if (d.error) return <LoadError error={d.error} />;
  if (d.loading) return <Loading label="Cargando el torneo" />;
  if (!d.t) return <Empty icon={<Trophy size={28} color={c.accent} />} title="Este torneo no existe" text="Puede que lo hayan borrado." />;
  return <Tournament key={d.t.eventId} t={d.t} d={d} embedded={embedded} />;
}

function Tournament({ t, d, embedded }: { t: EsportsTournament; d: TournamentData; embedded: boolean }) {
  const c = useColors();
  const { lid, league, isAdmin, member } = useLeagueCtx();
  const params = useLocalSearchParams<{ ver?: string }>();
  const uid = useAuth().user?.uid ?? null;
  const now = useNow().getTime();
  const [sheet, setSheet] = useState<SheetKey | null>(null);
  const [editingBr, setEditingBr] = useState<BrGame | null>(null);
  const [wanted, setWanted] = useState<string | null>(params.ver ?? null);
  const [busy, setBusy] = useState<null | 'checkin' | 'estado' | 'rehacer'>(null);
  // En el teléfono no hay Pro: lo del organizador es de los admins de la liga.
  const organizer = isAdmin;
  const myTeams = useMyTeams(d.entries);
  const nameOf = useEntryNames(d.entries);
  const myIds = useMyGameIds(uid);

  // Una vez por visita: lo que pasó a final por las 48 h sin que nadie escribiera avanza el cuadro (solo los de la liga).
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
  const myEntry = myEntryOf(d.entries, uid);
  const created = stagesCreated(d.links);
  const hasStage = created.size > 0;
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
    pending: pendingEntries(d.entries).length,
    approved: approved.length,
    hasStage,
    groupsDone: stageDone(stageMatches('groups', d.matches, d.links), now),
    hasPlayoffs: created.has('playoffs'),
  };
  const primary = primaryAction(input);
  const orgAction = primary && organizer && (primary.kind === 'register' || primary.kind === 'signin') ? organizerAction(input) : null;
  const path = tournamentPathFor(lid, t.eventId, league.kind);

  // ---- Avisos (uno por pantalla) ----
  const platform = platformOf(t);
  const myId = tournamentIdFor(myIds.data, t, uid);
  const idProblem = memberProblem(myId, t.settings, rankKeyFor(t.game, t.mode), t.game);
  const idTip = idProblem ? idNotice(idProblem, t.game, platform, playsOnOf(t.game, myId)) : null;
  const checkinAt = checkinOpensAt(t);
  const notices: (Notice | false | null)[] = [
    !!uid &&
      registrationOpen &&
      !myEntry &&
      !myIds.loading &&
      !!idTip && { id: `esports-id:${t.game}:${idTip.key}`, kind: 'tip', title: idTip.title, text: idTip.text, action: { label: idTip.action, to: myIdLink(t.game, path, platform) } },
    myEntry?.status === 'pending' && { id: `esports-pendiente:${myEntry.id}`, kind: 'tip', title: 'Tu inscripción está por aprobar', text: 'Te avisamos cuando el organizador la revise.' },
    myEntry?.status === 'approved' &&
      checkinAt !== null &&
      now < checkinAt &&
      t.status === 'registration' && { id: `esports-checkin:${t.eventId}`, kind: 'tip', title: `El check-in abre el ${checkinDay(checkinAt, league.tz)}`, text: 'Hazlo antes de empezar o te pueden dejar fuera.' },
  ];

  const openMatch = (id: string) => router.push(esportsMatchRoute(lid, id));
  async function doCheckIn() {
    if (!myEntry) return;
    setBusy('checkin');
    try {
      await checkIn(myEntry.id);
      toast('Check-in hecho');
    } catch (e) {
      toast(esportsErrorText(e, t.game, 'inscripcion'), 'error');
    } finally {
      setBusy(null);
    }
  }
  async function setStatus(status: keyof typeof STATUS_CHANGE) {
    const { ask, ok } = STATUS_CHANGE[status];
    setSheet(null);
    if (ask && !(await confirmAsync(ask))) return;
    setBusy('estado');
    try {
      await setTournamentStatus(t.eventId, status);
      toast(ok);
    } catch (e) {
      toast(esportsErrorText(e, t.game, 'torneo'), 'error');
    } finally {
      setBusy(null);
    }
  }
  const redo = lastStage(created);
  const redoable = !!redo && stageUntouched(stageMatches(redo, d.matches, d.links));
  async function doRedo() {
    setSheet(null);
    if (!redo) return;
    if (!(await confirmAsync(REDO_ASK))) return;
    setBusy('rehacer');
    try {
      await deleteStage(lid, t.eventId, redo);
      toast(REDO_OK);
    } catch (e) {
      toast(esportsErrorText(e, t.game, 'cuadro'), 'error');
    } finally {
      setBusy(null);
    }
  }
  const openBr = (g: BrGame | null) => {
    setEditingBr(g);
    setSheet('br');
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
        return router.push('/login');
      case 'review':
        return setWanted('equipos');
      case 'stage':
        return setSheet('stage');
      case 'playoffs':
        return setSheet('playoffs');
      case 'start':
        return void setStatus('live');
      case 'brGame':
        return openBr(null);
    }
  };
  const runMenu = (key: TournamentMenuKey) => {
    switch (key) {
      case 'editar':
        return setSheet('edit');
      case 'sembrar':
        return setSheet('seed');
      case 'agentes':
        return setSheet('agents');
      case 'cuadro':
        return setSheet('stage');
      case 'rehacer':
        return void doRedo();
      case 'anotadores':
        return setSheet('scorers');
      case 'logo':
        // El logo es el de la liga (Organizar › Ajustes de la liga, como `?tab=liga` en la web).
        setSheet(null);
        return router.push({ pathname: '/l/[lid]/ajustes', params: { lid } });
      case 'cerrar':
        return void setStatus('finished');
      case 'reabrir':
        return void setStatus('registration');
      case 'cancelar':
        return void setStatus('cancelled');
    }
  };
  const menuItems = organizer ? organizerMenu(t, { hasStage, approved: approved.length, freeAgents: freeAgents(d.entries).length, individual, redoable }) : [];
  async function share() {
    setSheet(null);
    const url = `${shareOrigin(null)}${path}`;
    try {
      await Share.share({ message: `${t.name}\n${url}`, url });
    } catch {
      toast('No se pudo compartir.', 'error');
    }
  }

  const views = viewsFor(t.format, t.mode);
  const view = pickView(t.format, t.mode, wanted);
  const startDay = whenText(t.startsAt, league.tz, true);
  const metaLine = [formatLine(t), `${countLine(approved.length, t.maxEntries)} ${individual ? 'jugadores' : 'equipos'}`].join(' · ');
  const platformText = platformLabel(t.game, t.settings.platform);
  const more = (
    <Pressable accessibilityRole="button" accessibilityLabel="Más opciones" hitSlop={6} onPress={() => setSheet('menu')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <MoreHorizontal size={22} color={c.fg} />
    </Pressable>
  );

  return (
    <View style={{ gap: 16 }}>
      {!embedded && (
        <>
          <BackBar label={league.name} fallback={`/l/${lid}`} right={more} />
          <Txt variant="title">{t.name}</Txt>
        </>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <DateBlock date={localParts(t.startsAt, league.tz)?.date ?? t.startsAt} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <GameMark game={t.game} size="sm" decorative />
            <PhaseChip phase={phase} />
            {!!startDay && <Txt tone="muted" style={{ fontSize: 13.5 }}>{startDay}</Txt>}
          </View>
          <Txt tone="muted" style={{ fontSize: 14, lineHeight: 19 }}>
            <Txt tone="fg2" style={{ fontSize: 14, fontFamily: font.semibold }}>
              {[gameLabel(t.game), platformText].filter(Boolean).join(' · ')}
            </Txt>
            {` · ${metaLine}`}
          </Txt>
        </View>
        {embedded && more}
      </View>
      {!!t.prizeText.trim() && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Trophy size={16} color={c.gold} />
          <Txt tone="fg2" style={{ flex: 1, fontSize: 14.5, fontFamily: font.semibold }}>
            {t.prizeText}
          </Txt>
        </View>
      )}

      {embedded && <ScreenNotice notices={notices} />}

      {primary && (
        <View style={{ gap: 10 }}>
          <Button variant="primary" size="xl" full icon={primaryIcon(primary, c.accentFg)} loading={busy === 'checkin' || busy === 'estado'} onPress={() => runPrimary(primary)}>
            {primary.label}
          </Button>
          {orgAction && (
            <Button variant="soft" size="lg" full onPress={() => runPrimary(orgAction)}>
              {orgAction.label}
            </Button>
          )}
        </View>
      )}

      {myEntry && (
        <Card padded={false}>
          <ListRow
            icon={<View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>{individual ? <Crosshair size={20} color={c.accent} /> : <Users size={20} color={c.accent} />}</View>}
            title="Tu inscripción"
            subtitle={myEntry.kind === 'free_agent' ? 'Agente libre' : myEntry.name}
            right={<EntryStatusChip status={myEntry.status} checkedIn={!!myEntry.checkedInAt} />}
            onPress={() => setSheet('register')}
          />
        </Card>
      )}

      {views.length > 1 && <Segmented<TournamentViewKey> label="Qué ver" options={views.map((v) => ({ key: v.key, label: v.label }))} value={view} onChange={setWanted} />}

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

      {!embedded && <ScreenNotice notices={notices} />}

      <Sheet open={sheet === 'menu'} onClose={() => setSheet(null)} title={t.name}>
        <MenuRow icon={<Share2 size={20} color={c.fg2} />} label="Compartir el torneo" onPress={() => void share()} />
        {menuItems.map((it) => {
          const I = MENU_ICON[it.key];
          return (
            <MenuRow
              key={it.key}
              icon={<I size={20} color={it.danger ? c.danger : c.fg2} />}
              label={it.label}
              hint={it.hint}
              danger={it.danger}
              disabled={it.key === 'rehacer' && busy === 'rehacer'}
              onPress={() => runMenu(it.key)}
            />
          );
        })}
      </Sheet>
      <RegisterSheet open={sheet === 'register'} onClose={() => setSheet(null)} t={t} entry={myEntry} />
      {organizer && (
        <>
          <SeedSheet open={sheet === 'seed'} onClose={() => setSheet(null)} t={t} entries={d.entries} />
          <StageSheet open={sheet === 'stage' || sheet === 'playoffs'} onClose={() => setSheet(null)} mode={sheet === 'playoffs' ? 'playoffs' : 'create'} t={t} entries={d.entries} matches={d.matches} links={d.links} />
          <FreeAgentsSheet open={sheet === 'agents'} onClose={() => setSheet(null)} t={t} entries={d.entries} />
          <EditTournamentSheet open={sheet === 'edit'} onClose={() => setSheet(null)} t={t} tz={league.tz} approved={approved.length} formatEditable={t.status === 'registration' && !hasStage} />
          {t.format === 'br' && (
            <ScorersSheet
              league={league}
              open={sheet === 'scorers'}
              onClose={() => setSheet(null)}
              target={{ scope: 'evento', refId: t.eventId, title: t.name }}
              participants={approved.flatMap((e) => e.members.map((m) => m.playerId ?? '')).filter(Boolean)}
            />
          )}
        </>
      )}
      {t.format === 'br' && (organizer || !!member?.scorer) && <BrGameSheet open={sheet === 'br'} onClose={() => setSheet(null)} t={t} entries={d.entries} games={d.br} editing={editingBr} />}
    </View>
  );
}

function primaryIcon(p: Primary, color: string): ReactNode {
  switch (p.kind) {
    case 'checkin':
      return <CheckCircle2 size={20} color={color} />;
    case 'stage':
    case 'playoffs':
      return <GitFork size={20} color={color} />;
    case 'start':
      return <Play size={20} color={color} />;
    case 'brGame':
      return <Crosshair size={20} color={color} />;
    case 'score':
    case 'confirm':
      return <Swords size={20} color={color} />;
    default:
      return null;
  }
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
  view: TournamentViewKey;
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
  const c = useColors();
  const { league } = useLeagueCtx();
  const highlight = useMemo(() => new Set(myEntry ? [myEntry.id] : []), [myEntry]);
  const card = (m: Match) => <MatchCard key={m.id} match={cardMatch(m)} mySide={sideOfTeams(m, myTeams)} onPress={() => onOpen(m.id)} tz={league.tz} now={now} roundWord="Jornada" />;
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
  const mine = myEntry ? [myEntry.id] : [];

  switch (view) {
    case 'cuadro':
      return bracket(
        'bracket',
        <Empty icon={<GitFork size={28} color={c.accent} />} title="El cuadro todavía no está" text={t.status === 'registration' ? 'Se arma cuando cierre la inscripción.' : 'El organizador todavía no lo arma.'} />,
      );
    case 'playoffs':
      return bracket('playoffs', <Empty icon={<Trophy size={28} color={c.accent} />} title="Los playoffs todavía no están" text={`Pasan ${t.settings.perGroup} de cada grupo cuando terminen los grupos.`} />);
    case 'grupos': {
      const rows = stageMatches('groups', d.matches, d.links);
      if (!rows.length) return <Empty icon={<ListOrdered size={28} color={c.accent} />} title="Los grupos todavía no están" text="Se arman cuando cierre la inscripción." />;
      const plan = planFromStage('groups', d.matches, d.links, d.entryOf);
      const groupOfMatch = new Map(rows.map(({ match, link }) => [match.id, link.groupNo ?? 0]));
      const tables = groupTablesOf(t.game, plan, d.matches, d.entryOf, now, t.eventId);
      return (
        <View style={{ gap: 30 }}>
          {tables.map((g, i) => (
            <View key={i} accessibilityLabel={`Grupo ${groupLetter(i)}`} style={{ gap: 10 }}>
              <SectionHeader title={`Grupo ${groupLetter(i)}`} />
              <StandingsTable rows={g.rows} nameOf={nameOf} columns={columns} highlight={mine} />
              <View style={{ gap: 10 }}>
                {d.matches
                  .filter((m) => groupOfMatch.get(m.id) === i)
                  .sort((a, b) => (a.round ?? 0) - (b.round ?? 0))
                  .map(card)}
              </View>
            </View>
          ))}
          <FinePrint>{tiebreakText(t.game)}</FinePrint>
        </View>
      );
    }
    case 'tabla': {
      const ids = competitors(d.entries).map((e) => e.id);
      if (t.format === 'br') return <BrLeaderboard rows={brTable(ids, d.br, t.settings, t.game, t.eventId)} nameOf={nameOf} highlight={highlight} />;
      if (!stageMatches('league', d.matches, d.links).length) return <Empty icon={<ListOrdered size={28} color={c.accent} />} title="La tabla todavía no está" text="Se arma cuando el organizador cree los partidos." />;
      return (
        <View style={{ gap: 8 }}>
          <StandingsTable rows={tableOf(t.game, ids, d.matches, d.entryOf, now, t.eventId)} nameOf={nameOf} columns={columns} highlight={mine} />
          <FinePrint>{tiebreakText(t.game)}</FinePrint>
        </View>
      );
    }
    case 'partidos': {
      const rows = stageMatches('league', d.matches, d.links).map((r) => r.match);
      if (!rows.length) return <Empty icon={<Swords size={28} color={c.accent} />} title="Todavía no hay partidos" text="Salen aquí cuando el organizador los cree." />;
      const rounds = [...new Set(rows.map((m) => m.round ?? 1))].sort((a, b) => a - b);
      return (
        <View style={{ gap: 30 }}>
          {rounds.map((r) => (
            <View key={r} accessibilityLabel={`Jornada ${r}`} style={{ gap: 10 }}>
              <SectionHeader title={`Jornada ${r}`} />
              {rows.filter((m) => (m.round ?? 1) === r).map(card)}
            </View>
          ))}
        </View>
      );
    }
    case 'partidas':
      return (
        <View style={{ gap: 16 }}>
          {canScoreBr && t.status !== 'finished' && t.status !== 'cancelled' && !organizer && (
            <Button variant="soft" size="lg" full icon={<Crosshair size={20} color={c.accent} />} onPress={onBrNew}>
              Anotar partida
            </Button>
          )}
          <BrGamesList games={d.br} settings={t.settings} nameOf={nameOf} onEdit={canScoreBr ? onBrEdit : undefined} />
        </View>
      );
    case 'equipos':
      return (
        <View style={{ gap: 30 }}>
          <EntriesView t={t} entries={d.entries} organizer={organizer} myEntryId={myEntry?.id ?? null} onFreeAgents={onAgents} />
          {infoInTeams(t.format) && <TournamentInfo t={t} />}
        </View>
      );
    case 'info':
      return <TournamentInfo t={t} />;
  }
}
