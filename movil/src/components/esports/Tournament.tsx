/**
 * La página del torneo de esports (TournamentPage.tsx de la web, Lite, con su misma lógica: logic.ts y
 * tournamentData.ts): el juego, la fase, el inicio, el formato y el cupo; UNA acción principal (anotar o confirmar mi
 * serie, hacer check-in, inscribirme); mi inscripción; el aviso de la pantalla (lo que le falta a tu ID, «Tu inscripción
 * está por aprobar», cuándo abre el check-in) y las vistas del formato: Cuadro, Grupos, Playoffs, Tabla, Partidos,
 * Partidas, Equipos (o Jugadores) e Info. Tocar una serie abre el partido. Lo del organizador (revisar inscripciones,
 * armar el cuadro, anotar partidas de battle royale, editar o cerrar el torneo), en la web.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, Share, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CheckCircle2, Crosshair, GitFork, Globe, ListOrdered, MoreHorizontal, Share2, Swords, Trophy, Users } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { checkIn, esportsErrorText, syncBracket, type EsportsEntry, type EsportsTournament } from '@mm/lib/data/esports';
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
  groupTablesOf,
  idNotice,
  infoInTeams,
  memberProblem,
  myActionMatches,
  myEntryOf,
  needsSync,
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
  stagesCreated,
  standingsColumns,
  tableOf,
  tournamentIdFor,
  tournamentPathFor,
  viewsFor,
  type Primary,
  type View as TournamentViewKey,
} from '@mm/pages/sports/esports/logic';
import { useEntryNames, useMyTeams, useTournament, type TournamentData } from '@mm/pages/sports/esports/tournamentData';
import { openOnWeb } from '@/lib/web';
import { DateBlock } from '../DateBlock';
import { MatchCard } from '../match/MatchCard';
import { StandingsTable } from '../match/StandingsTable';
import { toast } from '../feedback';
import { BackBar, Button, Card, Empty, ListRow, LoadError, Loading, Segmented, SectionHeader, Sheet, Txt } from '../ui';
import { BrGamesList, BrLeaderboard } from './Br';
import { EsportsBracket } from './Bracket';
import { EntriesView, TournamentInfo } from './Entries';
import { EntryStatusChip, GameMark, PhaseChip, ScreenNotice } from './bits';
import { FinePrint, MenuRow } from './inputs';
import { RegisterSheet } from './RegisterSheet';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

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
  const [sheet, setSheet] = useState<null | 'menu' | 'register'>(null);
  const [wanted, setWanted] = useState<string | null>(params.ver ?? null);
  const [busy, setBusy] = useState(false);
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
  const { toConfirm, toScore } = myActionMatches(d.matches, myTeams.act, now);
  const individual = isIndividualMode(t.mode);
  // En el teléfono no hay Pro: lo del organizador (revisar, armar el cuadro, anotar partidas) queda en la web.
  const primary = primaryAction({
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
    organizer: false,
    pending: pendingEntries(d.entries).length,
    approved: approved.length,
    hasStage: created.size > 0,
    groupsDone: stageDone(stageMatches('groups', d.matches, d.links), now),
    hasPlayoffs: created.has('playoffs'),
  });
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
    setBusy(true);
    try {
      await checkIn(myEntry.id);
      toast('Check-in hecho');
    } catch (e) {
      toast(esportsErrorText(e, t.game, 'inscripcion'), 'error');
    } finally {
      setBusy(false);
    }
  }
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
      default:
        // Lo del organizador (no sale en el teléfono): la web.
        return void openOnWeb(path);
    }
  };
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
        <Button variant="primary" size="xl" full icon={primaryIcon(primary, c.accentFg)} loading={busy} onPress={() => runPrimary(primary)}>
          {primary.label}
        </Button>
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

      <ViewBody view={view} t={t} d={d} myTeams={myTeams.all} myEntry={myEntry} nameOf={nameOf} now={now} onOpen={openMatch} canScoreBr={!!member?.scorer} path={path} />

      {!embedded && <ScreenNotice notices={notices} />}

      <Sheet open={sheet === 'menu'} onClose={() => setSheet(null)} title={t.name}>
        <MenuRow icon={<Share2 size={20} color={c.fg2} />} label="Compartir el torneo" onPress={() => void share()} />
      </Sheet>
      <RegisterSheet open={sheet === 'register'} onClose={() => setSheet(null)} t={t} entry={myEntry} />
    </View>
  );
}

function primaryIcon(p: Primary, color: string): ReactNode {
  switch (p.kind) {
    case 'checkin':
      return <CheckCircle2 size={20} color={color} />;
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
  myTeams,
  myEntry,
  nameOf,
  now,
  onOpen,
  canScoreBr,
  path,
}: {
  view: TournamentViewKey;
  t: EsportsTournament;
  d: TournamentData;
  myTeams: ReadonlySet<string>;
  myEntry: EsportsEntry | null;
  nameOf: (id: string | null | undefined) => string;
  now: number;
  onOpen: (matchId: string) => void;
  canScoreBr: boolean;
  path: string;
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
          {canScoreBr && t.status !== 'finished' && t.status !== 'cancelled' && (
            // Anotar una partida (la hoja del organizador y del anotador) es de la web.
            <Button variant="soft" size="lg" full icon={<Globe size={20} color={c.accent} />} onPress={() => void openOnWeb(`${path}?ver=partidas`)}>
              Anotar partida
            </Button>
          )}
          <BrGamesList games={d.br} settings={t.settings} nameOf={nameOf} />
        </View>
      );
    case 'equipos':
      return (
        <View style={{ gap: 30 }}>
          <EntriesView t={t} entries={d.entries} myEntryId={myEntry?.id ?? null} />
          {infoInTeams(t.format) && <TournamentInfo t={t} />}
        </View>
      );
    case 'info':
      return <TournamentInfo t={t} />;
  }
}
