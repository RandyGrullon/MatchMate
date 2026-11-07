/**
 * Las ligas de equipos en la app (baloncesto, fútbol y sala), con la lógica de la web (src/pages/sports/team y las
 * temporadas de cada deporte: useTeamLeague, useBasketballSeason, useFootballSeason, lists.ts, matchView.ts):
 * - TeamHome (TeamHome.tsx, BasketballHome y FootballHome de la web): «Primero, los equipos» para quien organiza, en
 *   vivo, «Tu próximo partido» con la convocatoria (y si estás suspendido), pasar a la fase final y los suspendidos
 *   (fútbol), próximos y resultados como filas, «Armar calendario» cuando no hay partidos y la tabla corta con el
 *   máximo anotador o el goleador. En un torneo suelto, el torneo relámpago (tournament/TeamTournament).
 * - TeamGames (GamesList): Por jugar | Resultados | Mi equipo, por jornada.
 * - TeamMatch (MatchDetail de cada deporte): el «•••» del admin, «Ver en vivo», el marcador con el en vivo, confirmar o
 *   reclamar, el reclamo para el admin, la mesa anotadora o el acta (a pantalla completa en `/l/<liga>/mesa/<partido>`),
 *   el anotador designado, los suspendidos, la convocatoria, por cuarto y los puntos (baloncesto; en Pro, con triples,
 *   tiros libres y faltas), goles y tarjetas, los jugadores (Pro) y el acta completa (fútbol y sala) y compartir el
 *   resultado.
 * - TeamStandings: la tabla completa (standings/TeamStandingsView), con el `?ver=` y la `?temporada=` de la dirección.
 * - TeamMine (Mi equipo) y TeamEventBody (una jornada especial o el torneo relámpago), listos para sus rutas.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CalendarDays, CalendarPlus, ChevronRight, ClipboardList, ClipboardPen, FileText, Share2, Shirt, Trophy } from 'lucide-react-native';
import { hasResult, isOpen, useMatch, useMatches, type Match } from '@mm/lib/data/matches';
import { useEvent } from '@mm/lib/data';
import { rsvpSummary, setMatchRsvp, useMatchRsvps, type RsvpStatus } from '@mm/lib/data/teamSports';
import { saveErrorMessage } from '@mm/lib/errorText';
import { formatDateLong } from '@mm/lib/format';
import { shareOrigin } from '@mm/lib/origin';
import { useIsPro } from '@mm/lib/useMode';
import { useNow } from '@mm/lib/useNow';
import { groupSchedule } from '@mm/components/match/schedule';
import { statusInfo, whenText } from '@mm/components/match/format';
import { forfeitScore } from '@mm/pages/sports/basketball/adapter';
import { basketballParser } from '@mm/pages/sports/basketball/matchView';
import { useBasketballSeason } from '@mm/pages/sports/basketball/season';
import { basketballConfigFrom, basketballTeamRules } from '@mm/pages/sports/basketball/rules';
import { decodeLines as decodeFootballLines, decodeTimeline, footballResultParser, walkoverScore } from '@mm/pages/sports/football/adapter';
import { disciplineFrom, footballConfigFrom, footballTeamRules, matchMinutes, variantOf } from '@mm/pages/sports/football/rules';
import { suspendedIn, useFootballSeason } from '@mm/pages/sports/football/season';
import { canOpenTable, rosterOf, rosterSide, upcomingFor } from '@mm/pages/sports/team/logic';
import { defaultGamesFilter, editableRsvp, filterGames, homeMatches, matchHeading, sideNames, type GamesFilter } from '@mm/pages/sports/team/lists';
import { useTeamLeague, type TeamLeague } from '@mm/pages/sports/team/useTeamLeague';
import { matchWhen, recordLine, rsvpLine, todayIn, vsTitle } from '@mm/pages/sports/team/view';
import { leagueSport } from '@mm/sports/registry';
import { MatchCard, MatchStatus } from '../match/MatchCard';
import { ConfirmResult, Scoreboard } from '../match/ResultParts';
import { ShareResultSheet } from '../match/ShareResult';
import { ActaEditorSheet } from '../court/team/ActaEditorSheet';
import { toast } from '../feedback';
import { Button, Card, Divider, Empty, ListRow, LoadError, RowIcon, SectionHeader, Segmented, Sheet, Txt, BackBar, Loading } from '../ui';
import { LogoSpinner } from '../Logo';
import { FootballHomeAdvance, HomeBuildSheet, homeBuild } from './admin/HomeBuild';
import { RosterEditor } from './admin/TeamsManager';
import { BoxScore, Convocatoria, FullActa, LiveStrip, LiveWatchPill, MatchTimeline, PeriodsLine, PeriodsTable, PlayersTable, RsvpButtons, SuspendedNotice } from './MatchParts';
import { DisputeCard, MatchMenu } from './MatchMenu';
import { MatchRows, VsTitle } from './player/MatchRows';
import { TeamMyProfile } from './player/TeamProfile';
import { SuspendedCard, TeamStandingsView } from './standings/TeamStandingsView';
import { BasketballTournament, FootballTournament } from './tournament/TeamTournament';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

const matchRoute = (lid: string, matchId: string) => ({ pathname: '/l/[lid]/partido/[matchId]' as const, params: { lid, matchId } });
/** La mesa anotadora (o el acta) a pantalla completa: el `&mesa=1` de la web. */
const tableRoute = (lid: string, matchId: string) => ({ pathname: '/l/[lid]/mesa/[matchId]', params: { lid, matchId } }) as never;
const isBasketball = (tl: TeamLeague) => leagueSport(tl.league) === 'basketball';
const Spinner = ({ label }: { label: string }) => (
  <View style={{ paddingVertical: 24, alignItems: 'center' }}>
    <LogoSpinner size={32} label={label} />
  </View>
);

/** Mi lado en un partido de equipos (por la plantilla). */
const mySideIn = (tl: TeamLeague, m: Match) => rosterSide(m, tl.allTeams.data, tl.myPlayerId);

/** Las tarjetas de lo que se está jugando, con el en vivo del deporte debajo (el pie de la tarjeta en la web). */
function LiveCards({ tl, matches, now }: { tl: TeamLeague; matches: readonly Match[]; now: number }) {
  const basketball = isBasketball(tl);
  return (
    <View style={{ gap: 10 }}>
      {matches.map((m) => (
        <View key={m.id} style={{ gap: 6 }}>
          <MatchCard match={m} mySide={tl.speakerOf(m)} tz={tl.tz} now={now} roundWord="Jornada" onPress={() => router.push(matchRoute(tl.lid, m.id))} />
          <LiveStrip match={m} names={sideNames(tl, m)} basketball={basketball} />
        </View>
      ))}
    </View>
  );
}

// ---------- Inicio ----------

interface TableTopRow {
  id: string;
  rank: number;
  points: number;
  line: string;
}

interface HomeTable {
  rows: readonly TableTopRow[];
  title?: string;
  footer?: string | null;
}

export function TeamHome() {
  const tl = useTeamLeague();
  const basketball = isBasketball(tl);
  // Torneo sin liga: su inicio es el del torneo (equipos, grupos y eliminatoria), no el calendario de una liga.
  if (tl.league.kind === 'torneo') return basketball ? <BasketballTournament tl={tl} home /> : <FootballTournament tl={tl} home />;
  return basketball ? <BasketballHome tl={tl} /> : <FootballHome tl={tl} />;
}

function BasketballHome({ tl }: { tl: TeamLeague }) {
  const season = useBasketballSeason(tl);
  const played = season.standings.some((r) => r.played > 0);
  const leader = season.leaders[0];
  return (
    <TeamHomeView
      tl={tl}
      minPlayers={basketballTeamRules(tl.rules.data).minPlayers}
      table={{
        rows: played ? season.standings.slice(0, 4).map((r) => ({ id: r.id, rank: r.rank, points: r.points, line: recordLine(r) })) : [],
        footer: leader ? `Máximo anotador: ${tl.nameOf(leader.player)} · ${leader.avg.toLocaleString('es-DO', { maximumFractionDigits: 1 })} por partido` : null,
      }}
    />
  );
}

function FootballHome({ tl }: { tl: TeamLeague }) {
  const season = useFootballSeason(tl);
  const now = useNow(30_000).getTime();
  const discipline = disciplineFrom(tl.rules.data);
  const myTeamIds = tl.myTeams.map((x) => x.team.id);
  const next = upcomingFor(tl.matches.data, myTeamIds, now).find((m) => m.status === 'scheduled' || m.status === 'postponed');
  const nextSuspended = next ? suspendedIn(season.disciplineMatches, next.id, discipline, season.adjustments) : [];
  const mineSusp = nextSuspended.filter((s) => myTeamIds.includes(s.team));
  const meSusp = mineSusp.some((s) => s.player === tl.myPlayerId);
  const played = season.standings.some((r) => r.played > 0);
  const rows = season.groups.length ? season.groups.flatMap((g) => g.rows.slice(0, 2)) : season.standings.slice(0, 4);
  const scorer = season.scorers[0]?.goals > 0 ? season.scorers[0] : null;
  return (
    <TeamHomeView
      tl={tl}
      minPlayers={footballTeamRules(tl.rules.data, variantOf(tl.league.sport)).minPlayers}
      nextAlert={meSusp ? 'Estás suspendido para este partido' : mineSusp.length ? `Suspendidos: ${mineSusp.map((s) => tl.nameOf(s.player)).join(', ')}` : null}
      extra={
        <>
          <FootballHomeAdvance tl={tl} />
          <SuspendedCard tl={tl} season={season} />
        </>
      }
      table={{
        title: season.groups.length ? 'Punteros de los grupos' : 'Tabla',
        rows: played ? rows.map((r) => ({ id: r.id, rank: r.rank, points: r.points, line: recordLine(r, true) })) : [],
        footer: scorer ? `Goleador: ${tl.nameOf(scorer.player)} · ${scorer.goals} ${scorer.goals === 1 ? 'gol' : 'goles'}` : null,
      }}
    />
  );
}

function TeamHomeView({ tl, minPlayers, table, nextAlert, extra }: { tl: TeamLeague; minPlayers: number; table: HomeTable; nextAlert?: string | null; extra?: ReactNode }) {
  const c = useColors();
  const now = useNow(30_000).getTime();
  const [building, setBuilding] = useState(false);
  const matches = tl.matches.data;
  const myTeamIds = tl.myTeams.map((x) => x.team.id);
  const myKey = myTeamIds.join();
  const { live, next, upcoming, results } = useMemo(() => homeMatches(matches, myKey ? myKey.split(',') : [], now), [matches, myKey, now]);
  if (tl.matches.error) return <LoadError error={tl.matches.error} />;
  const loading = tl.matches.loading && !matches.length;
  const noTeams = tl.isAdmin && !tl.teams.loading && tl.teams.data.length < 2;
  const build = homeBuild(tl);
  const seeAll = (ver?: string) => (
    <Txt variant="meta" tone="accent" style={{ fontWeight: '600' }} onPress={() => router.push({ pathname: '/l/[lid]/partidos', params: ver ? { lid: tl.lid, ver } : { lid: tl.lid } })}>
      Ver todos
    </Txt>
  );
  return (
    <View style={{ gap: 24 }}>
      {noTeams && (
        <Card style={{ gap: 16 }}>
          <View style={{ gap: 4 }}>
            <Txt variant="cardTitle">Primero, los equipos</Txt>
            <Txt variant="meta" tone="muted">
              Cada equipo con su color y su plantilla. Después armas el calendario.
            </Txt>
          </View>
          <Button variant="primary" size="lg" full icon={<Shirt size={20} color={c.accentFg} />} onPress={() => router.push({ pathname: '/l/[lid]/equipos', params: { lid: tl.lid, parte: 'equipos' } })}>
            Crear los equipos
          </Button>
        </Card>
      )}
      {live.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionHeader title="En vivo" />
          <LiveCards tl={tl} matches={live} now={now} />
        </View>
      )}
      {next && <NextMatchCard tl={tl} match={next} minPlayers={minPlayers} alert={nextAlert} />}
      {extra}
      <View style={{ gap: 10 }}>
        <SectionHeader title="Próximos partidos" action={matches.length > 0 ? seeAll() : undefined} />
        {loading ? (
          <Spinner label="Cargando partidos" />
        ) : upcoming.length ? (
          <MatchRows tl={tl} matches={upcoming} now={now} />
        ) : !matches.length ? (
          <Card style={{ gap: 16 }}>
            <View style={{ gap: 4 }}>
              <Txt variant="cardTitle">Todavía no hay calendario</Txt>
              <Txt variant="meta" tone="muted">
                {tl.isAdmin ? (build.relampago ? 'Grupos de todos contra todos y después la final, en un día.' : 'Todos contra todos, de ida o de ida y vuelta.') : 'Cuando el admin arme el calendario, los partidos salen aquí.'}
              </Txt>
            </View>
            {tl.isAdmin && tl.teams.data.length >= 2 && (
              <Button
                variant="primary"
                size="lg"
                full
                icon={build.relampago ? <Trophy size={20} color={c.accentFg} /> : <CalendarPlus size={20} color={c.accentFg} />}
                onPress={() => setBuilding(true)}
              >
                {build.label}
              </Button>
            )}
          </Card>
        ) : (
          <Txt variant="meta" tone="muted">
            {next || live.length ? 'No hay más partidos por jugar.' : 'No hay partidos por jugar.'}
          </Txt>
        )}
      </View>
      {results.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionHeader title="Resultados" action={seeAll('resultados')} />
          <MatchRows tl={tl} matches={results} now={now} />
        </View>
      )}
      {tl.season && table.rows.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionHeader
            title={table.title ?? 'Tabla'}
            action={
              <Txt variant="meta" tone="accent" style={{ fontWeight: '600' }} onPress={() => router.push({ pathname: '/l/[lid]/tabla', params: { lid: tl.lid } })}>
                Ver toda
              </Txt>
            }
          />
          <TableTop tl={tl} rows={table.rows} mine={myTeamIds} footer={table.footer} />
        </View>
      )}
      <HomeBuildSheet tl={tl} open={building} onClose={() => setBuilding(false)} />
    </View>
  );
}

function TableTop({ tl, rows, mine, footer }: { tl: TeamLeague; rows: readonly TableTopRow[]; mine: readonly string[]; footer?: string | null }) {
  const c = useColors();
  return (
    <Card padded={false}>
      {rows.map((r, i) => (
        <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: c.line, backgroundColor: mine.includes(r.id) ? c.accentSoft : 'transparent' }}>
          <Txt style={{ width: 22, fontWeight: '600', color: c.muted }}>{r.rank}</Txt>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="bodyStrong" numberOfLines={1}>
              {tl.teamOf(r.id)?.name ?? '(equipo borrado)'}
            </Txt>
            <Txt variant="small" tone="muted">
              {r.line}
            </Txt>
          </View>
          <Txt style={{ fontSize: 19, fontWeight: '700' }}>{r.points}</Txt>
        </View>
      ))}
      {!!footer && (
        <Txt variant="small" tone="muted" style={{ paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.line }}>
          {footer}
        </Txt>
      )}
    </Card>
  );
}

/**
 * «Tu próximo partido»: cuándo, «● Tigres vs. ● Leones» (abre el partido), dónde y qué jornada, `alert` en rojo (estás
 * suspendido) y tu convocatoria en un toque (por la cola sin señal) con cómo va tu equipo.
 */
export function NextMatchCard({ tl, match: m, minPlayers, alert, label = 'Tu próximo partido', roundWord = 'Jornada' }: { tl: TeamLeague; match: Match; minPlayers: number; alert?: string | null; label?: string; roundWord?: string }) {
  const c = useColors();
  const rsvps = useMatchRsvps(tl.lid, [m.id]);
  const teams = tl.allTeams.data;
  const mySide = rosterSide(m, teams, tl.myPlayerId);
  const today = todayIn(tl.tz);
  const mine = tl.myPlayerId ? rsvps.data.find((r) => r.matchId === m.id && r.playerId === tl.myPlayerId) : undefined;
  const roster = mySide ? rosterOf(teams, m.sides[mySide - 1].teamId).map((r) => r.playerId) : [];
  const sum = mySide ? rsvpSummary(rsvps.data, m.id, mySide, roster) : null;
  const where = [m.court, m.stage || (m.round != null ? `${roundWord} ${m.round}` : '')].filter(Boolean).join(' · ');
  async function set(status: RsvpStatus | null) {
    if (!mySide || !tl.myPlayerId) return;
    try {
      await setMatchRsvp(tl.lid, m.id, tl.myPlayerId, mySide, status);
      if (!status) toast('Convocatoria quitada');
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    }
  }
  return (
    <Card style={{ gap: 6, backgroundColor: c.accentSoft }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Txt variant="meta" tone="accent" style={{ fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>
          {m.status === 'live' ? '● Se está jugando' : m.status === 'suspended' ? `● ${label}` : label}
        </Txt>
        <Txt variant="meta" tone="fg2">
          {matchWhen(m.scheduledAt, tl.tz, today)}
        </Txt>
      </View>
      <Pressable accessibilityRole="link" accessibilityLabel={vsTitle(sideNames(tl, m))} onPress={() => router.push(matchRoute(tl.lid, m.id))} style={{ gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <VsTitle tl={tl} match={m} size={21} />
          </View>
          <ChevronRight size={20} color={c.accent} />
        </View>
        {!!where && (
          <Txt variant="meta" tone="fg2">
            {where}
          </Txt>
        )}
      </Pressable>
      {!!alert && (
        <Txt variant="meta" tone="danger" style={{ fontFamily: font.semibold, marginTop: 6 }}>
          {alert}
        </Txt>
      )}
      {mySide && tl.myPlayerId && editableRsvp(m) && (
        <View style={{ gap: 8, marginTop: 8 }}>
          <RsvpButtons raised value={mine?.status} onChange={set} label="Mi convocatoria" />
          {sum && (
            <Txt variant="small" tone="fg2">
              {`Tu equipo: ${rsvpLine(sum, minPlayers)}`}
            </Txt>
          )}
        </View>
      )}
    </Card>
  );
}

// ---------- Partidos ----------

export function TeamGames({ initial }: { initial?: GamesFilter }) {
  const c = useColors();
  const tl = useTeamLeague();
  const now = useNow(30_000).getTime();
  const all = tl.matches.data;
  const myTeamIds = tl.myTeams.map((x) => x.team.id);
  const [picked, setPicked] = useState<GamesFilter | null>(initial === 'mios' && !myTeamIds.length ? null : (initial ?? null));
  const filter: GamesFilter = picked ?? defaultGamesFilter(all);
  const live = all.filter((m) => m.status === 'live' || m.status === 'suspended');
  const list = filterGames(all, filter, myTeamIds).filter((m) => !live.includes(m));
  const groups = groupSchedule(list, 'round', { roundWord: 'Jornada', tz: tl.tz });
  const shown = filter === 'resultados' ? [...groups].reverse() : groups;
  if (tl.matches.error) return <LoadError error={tl.matches.error} />;
  const empty =
    filter === 'proximos'
      ? tl.isAdmin
        ? 'Arma el calendario en Organizar › Equipos.'
        : 'Cuando el admin arme el calendario, los partidos salen aquí.'
      : filter === 'resultados'
        ? 'Todavía no se ha jugado ningún partido.'
        : 'Tu equipo no tiene partidos todavía.';
  return (
    <View style={{ gap: 20 }}>
      <Txt variant="title">Partidos</Txt>
      <Segmented<GamesFilter>
        label="Qué partidos ver"
        value={filter}
        onChange={setPicked}
        options={[{ key: 'proximos', label: 'Por jugar' }, { key: 'resultados', label: 'Resultados' }, ...(myTeamIds.length ? [{ key: 'mios' as GamesFilter, label: 'Mi equipo' }] : [])]}
      />
      {tl.matches.loading && !all.length ? (
        <Spinner label="Cargando partidos" />
      ) : (
        <>
          {live.length > 0 && (
            <View style={{ gap: 10 }}>
              <SectionHeader title="En vivo" />
              <LiveCards tl={tl} matches={live} now={now} />
            </View>
          )}
          {shown.length ? (
            shown.map((g) => (
              <View key={g.key} style={{ gap: 10 }}>
                <SectionHeader title={g.title.charAt(0).toUpperCase() + g.title.slice(1)} />
                <MatchRows tl={tl} matches={filter === 'resultados' ? [...g.matches].reverse() : g.matches} now={now} round={false} />
              </View>
            ))
          ) : (
            <Empty icon={<CalendarDays size={28} color={c.accent} />} title="Nada por aquí" text={empty} />
          )}
        </>
      )}
    </View>
  );
}

// ---------- Un partido ----------

export function TeamMatch({ matchId }: { matchId: string }) {
  const tl = useTeamLeague();
  const q = useMatch(tl.lid, matchId);
  const listed = tl.matches.data.find((x) => x.id === matchId) ?? null;
  // Lo de la lista llega por tiempo real; el partido completo (reglas y el acta) para el acta completa y corregirla.
  const m: Match | null = q.data ?? listed;
  if (q.error && !m) return <LoadError error={q.error} />;
  if (!m) {
    if (q.loading || tl.matches.loading) return <Spinner label="Cargando el partido" />;
    return <Empty title="Este partido ya no existe" text="Puede que el admin lo haya borrado." />;
  }
  return isBasketball(tl) ? <BasketballMatch tl={tl} match={m} full={q.data} /> : <FootballMatch tl={tl} match={m} full={q.data} />;
}

/** El título del partido («Jornada 3»), el «•••» y el estado con cuándo es. */
function MatchHeader({ tl, match: m, menu }: { tl: TeamLeague; match: Match; menu: ReactNode }) {
  const now = useNow(30_000).getTime();
  const status = statusInfo(m, now);
  const when = whenText(m.scheduledAt, tl.tz, true);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Txt variant="title" style={{ flex: 1, fontSize: 28, lineHeight: 33 }}>
          {matchHeading(m)}
        </Txt>
        {menu}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {m.status !== 'scheduled' && <MatchStatus label={status.label} tone={status.tone} live={status.live} />}
        {!!when && (
          <Txt variant="meta" tone="muted">
            {m.status !== 'scheduled' ? `· ${when}` : when}
          </Txt>
        )}
      </View>
    </View>
  );
}

/** Lo que comparten los dos deportes: el marcador, confirmar, la mesa, el anotador designado y compartir. */
function useMatchBits(tl: TeamLeague, m: Match) {
  const names = sideNames(tl, m);
  const speaker = tl.speakerOf(m);
  const official = tl.officialOf(m.id);
  const canTable = canOpenTable({ match: m, isAdmin: tl.isAdmin, isScorer: !!tl.member?.scorer, userId: tl.userId, official, speaker });
  const live = m.status === 'live' || m.status === 'suspended';
  // Los nombres de los equipos en el marcador y en la imagen del resultado.
  const shown: Match = { ...m, sides: [{ ...m.sides[0], label: names[0] }, { ...m.sides[1], label: names[1] }] as Match['sides'] };
  return { names, speaker, official, canTable, live, shown };
}

function MatchTop({ tl, match: m, shown, speaker, live, basketball }: { tl: TeamLeague; match: Match; shown: Match; speaker: 1 | 2 | null; live: boolean; basketball: boolean }) {
  const now = useNow(30_000).getTime();
  return (
    <>
      {/* Si el partido se está transmitiendo: «Ver en vivo». */}
      <LiveWatchPill lid={tl.lid} matchId={m.id} />
      <View style={{ gap: 12 }}>
        <Scoreboard match={shown} mySide={mySideIn(tl, m)} />
        {live ? <LiveStrip match={m} names={sideNames(tl, m)} basketball={basketball} /> : !basketball && <PeriodsLine match={m} />}
      </View>
      <ConfirmResult lid={tl.lid} match={m} mySide={speaker} isAdmin={tl.isAdmin} now={now} />
    </>
  );
}

/** UN botón para quien puede anotar y, debajo, el anotador designado. */
function TableButton({ tl, match: m, canTable, label }: { tl: TeamLeague; match: Match; canTable: boolean; label: string }) {
  const c = useColors();
  const official = tl.officialOf(m.id);
  return (
    <>
      {canTable && (
        <Button variant="primary" size="xl" full icon={<ClipboardList size={20} color={c.accentFg} />} onPress={() => router.push(tableRoute(tl.lid, m.id))}>
          {label}
        </Button>
      )}
      {official && (
        <Txt variant="meta" tone="muted" style={{ textAlign: canTable ? 'center' : 'left', paddingHorizontal: canTable ? 0 : 4 }}>
          {'Anotador de mesa: '}
          <Txt variant="meta" tone="fg2" style={{ fontFamily: font.semibold }}>
            {official.name || 'designado'}
          </Txt>
        </Txt>
      )}
    </>
  );
}

/** Compartir el resultado (imagen o texto para WhatsApp) con el color de cada equipo. */
function ShareSheet({ tl, match: m, shown, open, onClose }: { tl: TeamLeague; match: Match; shown: Match; open: boolean; onClose: () => void }) {
  if (!open) return null;
  const path = `/l/${tl.lid}/juegos?partido=${m.id}`;
  const sideExtra = (s: 1 | 2) => ({ dot: tl.teamOf(m.sides.find((x) => x.side === s)?.teamId ?? null)?.color ?? null });
  return (
    <ShareResultSheet onClose={onClose} match={shown} title={tl.league.name} subtitle={matchHeading(m)} roundWord="Jornada" url={`${shareOrigin(null)}${path}`} sideExtra={sideExtra} mySide={mySideIn(tl, m)} />
  );
}

function ShareRow({ onPress }: { onPress: () => void }) {
  const c = useColors();
  return (
    <ListRow
      icon={
        <RowIcon>
          <Share2 size={20} color={c.accent} />
        </RowIcon>
      }
      title="Compartir el resultado"
      subtitle="Imagen o texto para WhatsApp"
      onPress={onPress}
    />
  );
}

const leaveMatch = (lid: string) => (router.canGoBack() ? router.back() : router.replace({ pathname: '/l/[lid]/partidos', params: { lid } }));

/**
 * Un partido de baloncesto (MatchDetail.tsx de la web): el «•••», el marcador y, en vivo, el cuarto, el reloj y las
 * faltas; confirmar o reclamar; UN botón para quien puede anotar; la convocatoria; los puntos por cuarto y por jugador
 * (en Lite, solo los puntos; en Pro, también triples, tiros libres y faltas) y «Compartir el resultado».
 */
function BasketballMatch({ tl, match: m, full }: { tl: TeamLeague; match: Match; full: Match | null }) {
  const pro = useIsPro();
  const [sharing, setSharing] = useState(false);
  const rules = full?.rules ?? tl.rules.data;
  const config = basketballConfigFrom(rules);
  const teamRules = basketballTeamRules(rules);
  const { names, speaker, canTable, live, shown } = useMatchBits(tl, m);
  const played = hasResult(m) || live;
  return (
    <View style={{ gap: 16 }}>
      <MatchHeader
        tl={tl}
        match={m}
        menu={
          <MatchMenu
            tl={tl}
            match={m}
            title={vsTitle(names)}
            parser={basketballParser}
            placeholder="78-72"
            walkoverScore={(absent) => forfeitScore(config.forfeitScore, absent)}
            onDeleted={() => leaveMatch(tl.lid)}
          />
        }
      />
      <MatchTop tl={tl} match={m} shown={shown} speaker={speaker} live={live} basketball />
      <DisputeCard tl={tl} match={m} parser={basketballParser} placeholder="78-72" />
      <TableButton tl={tl} match={m} canTable={canTable} label={live ? 'Seguir en la mesa anotadora' : 'Abrir la mesa anotadora'} />
      {(m.status === 'scheduled' || m.status === 'postponed') && <Convocatoria tl={tl} match={m} minPlayers={teamRules.minPlayers} />}
      {played && (
        <>
          <PeriodsTable match={m} names={names} periodsPerGame={config.periods} />
          <View style={{ gap: 10 }}>
            <SectionHeader title="Puntos" />
            <BoxScore tl={tl} match={m} full={pro} />
            {!m.score?.lines && hasResult(m) && (
              <Txt variant="meta" tone="muted" style={{ paddingHorizontal: 4 }}>
                Sin puntos por jugador: el resultado se anotó sin la mesa.
              </Txt>
            )}
          </View>
        </>
      )}
      {hasResult(m) && (
        <Card padded={false}>
          <ShareRow onPress={() => setSharing(true)} />
        </Card>
      )}
      <ShareSheet tl={tl} match={m} shown={shown} open={sharing} onClose={() => setSharing(false)} />
    </View>
  );
}

/**
 * Un partido de fútbol o sala (FootballMatchDetail de la web): el «•••» (con «Corregir el acta»), el marcador y, en vivo,
 * el minuto, las faltas y las rojas (si no, los goles por tiempo); confirmar o reclamar; UN botón para quien puede anotar;
 * los suspendidos; la convocatoria; goles y tarjetas con su minuto (en Pro, también los jugadores con goles, asistencias y
 * tarjetas); el acta completa y «Compartir el resultado».
 */
function FootballMatch({ tl, match: m, full }: { tl: TeamLeague; match: Match; full: Match | null }) {
  const c = useColors();
  const pro = useIsPro();
  const [sheet, setSheet] = useState<'acta' | 'editar' | 'compartir' | null>(null);
  const variant = variantOf(tl.league.sport);
  const rules = full?.rules ?? tl.rules.data;
  const config = footballConfigFrom(rules, variant);
  const teamRules = footballTeamRules(rules, variant);
  const season = useFootballSeason(tl);
  const discipline = disciplineFrom(tl.rules.data);
  const suspended = isOpen(m) || m.status === 'postponed' ? suspendedIn(season.disciplineMatches, m.id, discipline, season.adjustments) : [];
  const flags = new Map(suspended.map((s) => [s.player, 'Suspendido'] as const));
  const { names, speaker, canTable, live, shown } = useMatchBits(tl, m);
  const parser = footballResultParser({ keep: m.score });
  const showActa = hasResult(m) || live;
  const hasLines = !!m.score?.lines;
  const fullRow = showActa && (hasLines || !hasResult(m));
  const noEvents = hasLines && !decodeTimeline(m.score?.tl, decodeFootballLines(m.score?.lines)).length;
  return (
    <View style={{ gap: 16 }}>
      <MatchHeader
        tl={tl}
        match={m}
        menu={
          <MatchMenu
            tl={tl}
            match={m}
            title={vsTitle(names)}
            parser={parser}
            placeholder="2-1 (o 1-1 pen 4-3)"
            walkoverScore={(absent) => walkoverScore(config.walkoverScore, absent)}
            minutes={matchMinutes(config)}
            onDeleted={() => leaveMatch(tl.lid)}
            extraAdmin={hasResult(m) && m.status !== 'walkover' ? [{ key: 'acta', icon: ClipboardPen, label: 'Corregir el acta', hint: 'Goleadores y tarjetas', onPress: () => setSheet('editar') }] : []}
          />
        }
      />
      <MatchTop tl={tl} match={m} shown={shown} speaker={speaker} live={live} basketball={false} />
      <DisputeCard tl={tl} match={m} parser={parser} placeholder="2-1 (o 1-1 pen 4-3)" />
      <TableButton tl={tl} match={m} canTable={canTable} label={live ? 'Seguir con el acta' : 'Abrir el acta del partido'} />
      <SuspendedNotice tl={tl} list={suspended} />
      {(m.status === 'scheduled' || m.status === 'postponed') && <Convocatoria tl={tl} match={m} minPlayers={teamRules.minPlayers} flags={flags} />}
      {showActa && (
        <View style={{ gap: 10 }}>
          <SectionHeader title="Goles y tarjetas" />
          <MatchTimeline tl={tl} match={m} names={names} />
          {!hasLines && hasResult(m) && m.status !== 'walkover' && (
            <Txt variant="meta" tone="muted" style={{ paddingHorizontal: 4 }}>
              Sin goleadores ni tarjetas: el resultado se anotó sin el acta.
            </Txt>
          )}
          {noEvents && (
            <Txt variant="meta" tone="muted" style={{ paddingHorizontal: 4 }}>
              Sin goles ni tarjetas.
            </Txt>
          )}
        </View>
      )}
      {showActa && pro && hasLines && (
        <View style={{ gap: 10 }}>
          <SectionHeader title="Jugadores" />
          <PlayersTable tl={tl} match={m} />
        </View>
      )}
      {(fullRow || hasResult(m)) && (
        <Card padded={false}>
          {fullRow && (
            <ListRow
              icon={
                <RowIcon>
                  <FileText size={20} color={c.accent} />
                </RowIcon>
              }
              title="Acta completa"
              subtitle="Cambios, porteros y penales"
              onPress={() => setSheet('acta')}
            />
          )}
          {fullRow && hasResult(m) && <Divider inset={68} />}
          {hasResult(m) && <ShareRow onPress={() => setSheet('compartir')} />}
        </Card>
      )}
      <Sheet open={sheet === 'acta'} onClose={() => setSheet(null)} title="Acta completa" subtitle={vsTitle(names)}>
        {sheet === 'acta' && (full ? <FullActa tl={tl} match={full} names={names} /> : <Loading label="Bajando el acta…" />)}
      </Sheet>
      <ShareSheet tl={tl} match={m} shown={shown} open={sheet === 'compartir'} onClose={() => setSheet(null)} />
      {tl.isAdmin && sheet === 'editar' && <ActaEditorSheet tl={tl} match={full ?? m} onClose={() => setSheet(null)} />}
    </View>
  );
}

// ---------- Tabla ----------

/** La tabla completa de la liga (con el `?ver=` y la `?temporada=` de la dirección, como la web). */
export function TeamStandings() {
  const { ver, temporada } = useLocalSearchParams<{ ver?: string; temporada?: string }>();
  return <TeamStandingsView ver={ver ?? null} temporada={temporada ?? null} />;
}

// ---------- Mi equipo ----------

/**
 * «Mi equipo» (`/l/<liga>/perfil`, la pestaña de perfil de la web): con «Tu próximo partido» del inicio y la plantilla
 * que maneja el capitán o el delegado (la de Organizar › Equipos).
 */
export function TeamMine() {
  return (
    <TeamMyProfile
      renderNext={(match, minPlayers, alert) => <NextMatchSlot match={match} minPlayers={minPlayers} alert={alert} />}
      renderRoster={(team, opts) => <MineRoster team={team} {...opts} />}
    />
  );
}

function NextMatchSlot({ match, minPlayers, alert }: { match: Match; minPlayers: number; alert?: string }) {
  const tl = useTeamLeague();
  return <NextMatchCard tl={tl} match={match} minPlayers={minPlayers} alert={alert} />;
}

function MineRoster({ team, canRoles, readOnly, positions }: { team: Parameters<typeof RosterEditor>[0]['team']; canRoles: boolean; readOnly: boolean; positions: readonly string[] }) {
  const tl = useTeamLeague();
  return <RosterEditor tl={tl} team={team} canRoles={canRoles} readOnly={readOnly} positions={positions} />;
}

// ---------- Un evento ----------

/**
 * Un evento de una liga de equipos (`/l/<liga>/e/<evento>`, EventView.tsx y BasketballEvent / FootballEvent de la web):
 * en un torneo suelto, la pantalla del torneo relámpago; si no, «‹ Liga», el nombre de la jornada, el día y el aviso del
 * admin, y sus partidos por jornada (una jornada especial). Va dentro de LeagueScope.
 */
export function TeamEventBody({ eventId }: { eventId: string }) {
  const tl = useTeamLeague();
  if (tl.league.kind === 'torneo') return isBasketball(tl) ? <BasketballTournament tl={tl} home={false} eventId={eventId} /> : <FootballTournament tl={tl} home={false} eventId={eventId} />;
  return <LeagueTeamEvent tl={tl} eventId={eventId} />;
}

function LeagueTeamEvent({ tl, eventId }: { tl: TeamLeague; eventId: string }) {
  const now = useNow(30_000).getTime();
  const event = useEvent(tl.lid, eventId);
  const matches = useMatches({ lid: tl.lid, eventId });
  const e = event.data;
  const groups = groupSchedule(matches.data, 'round', { roundWord: 'Jornada', tz: tl.tz });
  const date = e?.date ? formatDateLong(e.date) : '';
  return (
    <View style={{ gap: 20 }}>
      <BackBar label={tl.league.name} fallback={`/l/${tl.lid}`} />
      <View style={{ gap: 6 }}>
        <Txt variant="title">{e?.name || 'Jornada'}</Txt>
        {!!date && (
          <Txt variant="meta" tone="muted">
            {date.charAt(0).toUpperCase() + date.slice(1)}
          </Txt>
        )}
        {!!e?.announcement && <Txt tone="fg2">{e.announcement}</Txt>}
      </View>
      {matches.loading && !matches.data.length ? (
        <Spinner label="Cargando partidos" />
      ) : !matches.data.length ? (
        <Card style={{ gap: 4 }}>
          <Txt variant="bodyStrong">Sin partidos en este evento</Txt>
          <Txt variant="meta" tone="muted">
            {'Los partidos de la liga están en su '}
            <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }} onPress={() => router.push({ pathname: '/l/[lid]', params: { lid: tl.lid } })}>
              inicio
            </Txt>
            .
          </Txt>
        </Card>
      ) : (
        groups.map((g) => (
          <View key={g.key} style={{ gap: 10 }}>
            <SectionHeader title={g.title.charAt(0).toUpperCase() + g.title.slice(1)} />
            {g.matches.map((m) => (
              <View key={m.id} style={{ gap: 6 }}>
                <MatchCard match={m} mySide={tl.speakerOf(m)} tz={tl.tz} now={now} roundWord="Jornada" onPress={() => router.push(matchRoute(tl.lid, m.id))} />
                {(m.status === 'live' || m.status === 'suspended') && <LiveStrip match={m} names={sideNames(tl, m)} basketball={isBasketball(tl)} />}
              </View>
            ))}
          </View>
        ))
      )}
    </View>
  );
}
