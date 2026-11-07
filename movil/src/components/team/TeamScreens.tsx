/**
 * Las ligas de equipos en la app (baloncesto, fútbol y sala), con la lógica de la web (src/pages/sports/team y las
 * temporadas de cada deporte: useTeamLeague, useBasketballSeason, useFootballSeason, lists.ts):
 * - TeamHome: en vivo, «Tu próximo partido» con la convocatoria (Voy / Tal vez / No voy), próximos, resultados y la
 *   tabla corta con el máximo anotador (o el goleador).
 * - TeamGames: Por jugar | Resultados | Mi equipo, por jornada.
 * - TeamMatch: el partido con su marcador, confirmar o reclamar y la mesa anotadora (por ahora en la web).
 * - TeamStandings: la tabla y los anotadores (o goleadores).
 * Armar el calendario, los equipos, las actas y los playoffs, por ahora en la web.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { CalendarDays, ClipboardList, Share2 } from 'lucide-react-native';
import { hasResult, useMatch, type Match } from '@mm/lib/data/matches';
import { RSVP_LABEL, rsvpSummary, setMatchRsvp, useMatchRsvps, type RsvpStatus } from '@mm/lib/data/teamSports';
import { saveErrorMessage } from '@mm/lib/errorText';
import { shareOrigin } from '@mm/lib/origin';
import { useNow } from '@mm/lib/useNow';
import { groupSchedule } from '@mm/components/match/schedule';
import { defaultColumns, type StandingsColumn } from '@mm/components/match/standings';
import { statusInfo, whenText } from '@mm/components/match/format';
import { useBasketballSeason } from '@mm/pages/sports/basketball/season';
import { useFootballSeason } from '@mm/pages/sports/football/season';
import { basketballTableFrom, basketballTeamRules } from '@mm/pages/sports/basketball/rules';
import { footballTableFrom, footballTeamRules, variantOf } from '@mm/pages/sports/football/rules';
import { canOpenTable, rosterOf, rosterSide } from '@mm/pages/sports/team/logic';
import { defaultGamesFilter, editableRsvp, filterGames, homeMatches, matchHeading, sideNames, type GamesFilter } from '@mm/pages/sports/team/lists';
import { useTeamLeague, type TeamLeague } from '@mm/pages/sports/team/useTeamLeague';
import { matchWhen, recordLine, rsvpLine, todayIn } from '@mm/pages/sports/team/view';
import { leagueSport } from '@mm/sports/registry';
import { MatchCard, MatchStatus } from '../match/MatchCard';
import { ConfirmResult, Scoreboard } from '../match/ResultParts';
import { ShareResultSheet } from '../match/ShareResult';
import { StandingsTable } from '../match/StandingsTable';
import { toast } from '../feedback';
import { Button, Card, Divider, Empty, ListRow, LoadError, RowIcon, Segmented, SectionHeader, Txt } from '../ui';
import { LogoSpinner } from '../Logo';
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';

const matchRoute = (lid: string, matchId: string) => ({ pathname: '/l/[lid]/partido/[matchId]' as const, params: { lid, matchId } });
const isBasketball = (tl: TeamLeague) => leagueSport(tl.league) === 'basketball';
const Spinner = ({ label }: { label: string }) => (
  <View style={{ paddingVertical: 24, alignItems: 'center' }}>
    <LogoSpinner size={32} label={label} />
  </View>
);

/** Mi lado en un partido de equipos (por la plantilla). */
const mySideIn = (tl: TeamLeague, m: Match) => rosterSide(m, tl.allTeams.data, tl.myPlayerId);

function Cards({ tl, matches, now }: { tl: TeamLeague; matches: readonly Match[]; now: number }) {
  return (
    <View style={{ gap: 10 }}>
      {matches.map((m) => (
        <MatchCard key={m.id} match={m} mySide={mySideIn(tl, m)} tz={tl.tz} now={now} roundWord="Jornada" onPress={() => router.push(matchRoute(tl.lid, m.id))} />
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

export function TeamHome() {
  const tl = useTeamLeague();
  return isBasketball(tl) ? <BasketballHome tl={tl} /> : <FootballHome tl={tl} />;
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
  const played = season.standings.some((r) => r.played > 0);
  const rows = season.groups.length ? season.groups.flatMap((g) => g.rows.slice(0, 2)) : season.standings.slice(0, 4);
  const scorer = season.scorers[0]?.goals > 0 ? season.scorers[0] : null;
  return (
    <TeamHomeView
      tl={tl}
      minPlayers={footballTeamRules(tl.rules.data, variantOf(tl.league.sport)).minPlayers}
      table={{
        title: season.groups.length ? 'Punteros de los grupos' : 'Tabla',
        rows: played ? rows.map((r) => ({ id: r.id, rank: r.rank, points: r.points, line: recordLine(r, true) })) : [],
        footer: scorer ? `Goleador: ${tl.nameOf(scorer.player)} · ${scorer.goals} ${scorer.goals === 1 ? 'gol' : 'goles'}` : null,
      }}
    />
  );
}

function TeamHomeView({ tl, minPlayers, table }: { tl: TeamLeague; minPlayers: number; table: { rows: readonly TableTopRow[]; title?: string; footer?: string | null } }) {
  const now = useNow(30_000).getTime();
  const matches = tl.matches.data;
  const myTeamIds = tl.myTeams.map((x) => x.team.id);
  const myKey = myTeamIds.join();
  const { live, next, upcoming, results } = useMemo(() => homeMatches(matches, myKey ? myKey.split(',') : [], now), [matches, myKey, now]);
  if (tl.matches.error) return <LoadError error={tl.matches.error} />;
  const loading = tl.matches.loading && !matches.length;
  const seeAll = (ver?: string) => (
    <Txt variant="meta" tone="accent" style={{ fontWeight: '600' }} onPress={() => router.push({ pathname: '/l/[lid]/partidos', params: ver ? { lid: tl.lid, ver } : { lid: tl.lid } })}>
      Ver todos
    </Txt>
  );
  return (
    <View style={{ gap: 24 }}>
      {live.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionHeader title="En vivo" />
          <Cards tl={tl} matches={live} now={now} />
        </View>
      )}
      {next && <NextMatchCard tl={tl} match={next} minPlayers={minPlayers} />}
      <View style={{ gap: 10 }}>
        <SectionHeader title="Próximos partidos" action={matches.length > 0 ? seeAll() : undefined} />
        {loading ? (
          <Spinner label="Cargando partidos" />
        ) : upcoming.length ? (
          <Cards tl={tl} matches={upcoming} now={now} />
        ) : !matches.length ? (
          <Card style={{ gap: 6 }}>
            <Txt variant="cardTitle">Todavía no hay calendario</Txt>
            <Txt variant="meta" tone="muted">
              Cuando el admin arme el calendario, los partidos salen aquí.
            </Txt>
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
          <Cards tl={tl} matches={results} now={now} />
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

/** «Tu próximo partido»: cuándo, quiénes, dónde y tu convocatoria en un toque (por la cola sin señal). */
function NextMatchCard({ tl, match: m, minPlayers, label = 'Tu próximo partido', roundWord = 'Jornada' }: { tl: TeamLeague; match: Match; minPlayers: number; label?: string; roundWord?: string }) {
  const c = useColors();
  const rsvps = useMatchRsvps(tl.lid, [m.id]);
  const [busy, setBusy] = useState(false);
  const teams = tl.allTeams.data;
  const mySide = rosterSide(m, teams, tl.myPlayerId);
  const today = todayIn(tl.tz);
  const mine = tl.myPlayerId ? rsvps.data.find((r) => r.matchId === m.id && r.playerId === tl.myPlayerId) : undefined;
  const roster = mySide ? rosterOf(teams, m.sides[mySide - 1].teamId).map((r) => r.playerId) : [];
  const sum = mySide ? rsvpSummary(rsvps.data, m.id, mySide, roster) : null;
  const where = [m.court, m.stage || (m.round != null ? `${roundWord} ${m.round}` : '')].filter(Boolean).join(' · ');
  const names = sideNames(tl, m);
  async function set(status: RsvpStatus | null) {
    if (!mySide || !tl.myPlayerId || busy) return;
    setBusy(true);
    try {
      await setMatchRsvp(tl.lid, m.id, tl.myPlayerId, mySide, status);
      if (!status) toast('Convocatoria quitada');
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card style={{ gap: 6, backgroundColor: c.accentSoft }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Txt variant="meta" tone="accent" style={{ fontWeight: '600' }}>
          {m.status === 'live' ? '● Se está jugando' : label}
        </Txt>
        <Txt variant="meta" tone="fg2">
          {matchWhen(m.scheduledAt, tl.tz, today)}
        </Txt>
      </View>
      <Pressable accessibilityRole="link" onPress={() => router.push(matchRoute(tl.lid, m.id))}>
        <Txt style={{ fontSize: 21, lineHeight: 28, fontWeight: '700' }}>{`${names[0]} vs. ${names[1]}`}</Txt>
        {!!where && (
          <Txt variant="meta" tone="fg2">
            {where}
          </Txt>
        )}
      </Pressable>
      {mySide && tl.myPlayerId && editableRsvp(m) && (
        <View style={{ gap: 8, marginTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }} accessibilityLabel="Mi convocatoria">
            {(['yes', 'maybe', 'no'] as const).map((s) => {
              const active = mine?.status === s;
              const bg = !active ? c.surface : s === 'yes' ? c.accent : s === 'maybe' ? c.warnSoft : c.dangerSoft;
              const fg = !active ? c.fg : s === 'yes' ? c.accentFg : s === 'maybe' ? c.warn : c.danger;
              return (
                <Pressable
                  key={s}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  disabled={busy}
                  onPress={() => void set(active ? null : s)}
                  style={{ flex: 1, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}
                >
                  <Txt variant="bodyStrong" style={{ color: fg }}>
                    {RSVP_LABEL[s]}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
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
  const [picked, setPicked] = useState<GamesFilter | null>(initial ?? null);
  const filter: GamesFilter = picked ?? defaultGamesFilter(all);
  const live = all.filter((m) => m.status === 'live' || m.status === 'suspended');
  const list = filterGames(all, filter, myTeamIds).filter((m) => !live.includes(m));
  const groups = groupSchedule(list, 'round', { roundWord: 'Jornada', tz: tl.tz });
  const shown = filter === 'resultados' ? [...groups].reverse() : groups;
  if (tl.matches.error) return <LoadError error={tl.matches.error} />;
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
              <Cards tl={tl} matches={live} now={now} />
            </View>
          )}
          {shown.length ? (
            shown.map((g) => (
              <View key={g.key} style={{ gap: 10 }}>
                <Txt variant="bodyStrong" tone="fg2">
                  {g.title}
                </Txt>
                <Cards tl={tl} matches={filter === 'resultados' ? [...g.matches].reverse() : g.matches} now={now} />
              </View>
            ))
          ) : (
            <Empty
              icon={<CalendarDays size={28} color={c.accent} />}
              title="Nada por aquí"
              text={filter === 'mios' ? 'Tu equipo no tiene partidos todavía.' : filter === 'resultados' ? 'Todavía no se ha jugado ningún partido.' : 'No hay partidos por jugar.'}
            />
          )}
        </>
      )}
    </View>
  );
}

// ---------- Un partido ----------

export function TeamMatch({ matchId }: { matchId: string }) {
  const c = useColors();
  const tl = useTeamLeague();
  const q = useMatch(tl.lid, matchId);
  const now = useNow(30_000).getTime();
  const [sharing, setSharing] = useState(false);
  const m = q.data;
  if (q.error) return <LoadError error={q.error} />;
  if (q.loading && !m) return <Spinner label="Cargando el partido" />;
  if (!m) return <Empty title="Este partido ya no existe" />;
  const basketball = isBasketball(tl);
  const status = statusInfo(m, now);
  const when = whenText(m.scheduledAt, tl.tz, true);
  const mySide = mySideIn(tl, m);
  const canTable = canOpenTable({ match: m, isAdmin: tl.isAdmin, isScorer: !!tl.member?.scorer, userId: tl.userId, official: tl.officialOf(m.id), speaker: tl.speakerOf(m) });
  const live = m.status === 'live' || m.status === 'suspended';
  const names = sideNames(tl, m);
  const path = `/l/${tl.lid}/juegos?partido=${m.id}`;
  // El color de cada equipo en la imagen del resultado (como la web).
  const sideExtra = (s: 1 | 2) => ({ dot: tl.teamOf(m.sides.find((x) => x.side === s)?.teamId ?? null)?.color ?? null });
  const shown: Match = { ...m, sides: [{ ...m.sides[0], label: names[0] }, { ...m.sides[1], label: names[1] }] as Match['sides'] };
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 6 }}>
        <Txt variant="title" style={{ fontSize: 28, lineHeight: 33 }}>
          {matchHeading(m)}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {m.status !== 'scheduled' && <MatchStatus label={status.label} tone={status.tone} live={status.live} />}
          {!!when && (
            <Txt variant="meta" tone="muted">
              {m.status !== 'scheduled' ? `· ${when}` : when}
            </Txt>
          )}
        </View>
      </View>
      <Scoreboard match={shown} mySide={mySide} />
      <ConfirmResult lid={tl.lid} match={m} mySide={mySide} isAdmin={tl.isAdmin} now={now} />
      {canTable && (
        <Button variant="primary" size="xl" full icon={<ClipboardList size={20} color={c.accentFg} />} onPress={() => openOnWeb(path)}>
          {basketball ? (live ? 'Seguir en la mesa anotadora' : 'Abrir la mesa anotadora') : live ? 'Seguir con el acta' : 'Abrir el acta del partido'}
        </Button>
      )}
      {hasResult(m) && (
        <Card padded={false}>
          <ListRow
            icon={
              <RowIcon>
                <Share2 size={20} color={c.accent} />
              </RowIcon>
            }
            title="Compartir el resultado"
            subtitle="Imagen o texto para WhatsApp"
            onPress={() => setSharing(true)}
          />
        </Card>
      )}
      {sharing && (
        <ShareResultSheet
          onClose={() => setSharing(false)}
          match={shown}
          title={tl.league.name}
          subtitle={matchHeading(m)}
          roundWord="Jornada"
          url={`${shareOrigin(null)}${path}`}
          sideExtra={sideExtra}
          mySide={mySide}
        />
      )}
      <Button full onPress={() => openOnWeb(path)}>
        Ver el partido en la web
      </Button>
    </View>
  );
}

// ---------- Tabla ----------

type TableView = 'tabla' | 'lideres';

export function TeamStandings() {
  const tl = useTeamLeague();
  return isBasketball(tl) ? <BasketballStandings tl={tl} /> : <FootballStandings tl={tl} />;
}

function Leaders({ rows }: { rows: { id: string; name: string; team: string; value: string; sub: string }[] }) {
  const c = useColors();
  if (!rows.length) return <Empty title="Sin estadísticas todavía" />;
  return (
    <Card padded={false}>
      {rows.map((r, i) => (
        <View key={r.id}>
          {i > 0 && <Divider inset={16} />}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
            <Txt style={{ width: 22, fontWeight: '600', color: c.muted }}>{i + 1}</Txt>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="bodyStrong" numberOfLines={1}>
                {r.name}
              </Txt>
              <Txt variant="small" tone="muted" numberOfLines={1}>
                {[r.team, r.sub].filter(Boolean).join(' · ')}
              </Txt>
            </View>
            <Txt style={{ fontSize: 19, fontWeight: '700' }}>{r.value}</Txt>
          </View>
        </View>
      ))}
    </Card>
  );
}

function StandingsFrame({ tl, rows, columns, leadersLabel, leaders, note }: { tl: TeamLeague; rows: Parameters<typeof StandingsTable>[0]['rows']; columns: StandingsColumn[]; leadersLabel: string; leaders: ReactNode; note: string }) {
  const [view, setView] = useState<TableView>('tabla');
  const mine = tl.myTeams.map((x) => x.team.id);
  if (tl.matches.error) return <LoadError error={tl.matches.error} />;
  return (
    <View style={{ gap: 16 }}>
      <Txt variant="title">Tabla</Txt>
      <Segmented<TableView>
        label="Qué ver"
        value={view}
        onChange={setView}
        options={[
          { key: 'tabla', label: 'Tabla' },
          { key: 'lideres', label: leadersLabel },
        ]}
      />
      {tl.matches.loading && !tl.matches.data.length ? (
        <Spinner label="Cargando la tabla" />
      ) : view === 'tabla' ? (
        <>
          <StandingsTable rows={rows} nameOf={(id) => tl.teamOf(id)?.name ?? '(equipo borrado)'} columns={columns} highlight={mine} empty="Cuando haya partidos confirmados, la tabla sale aquí." />
          <Txt variant="small" tone="muted">
            {note}
          </Txt>
        </>
      ) : (
        leaders
      )}
    </View>
  );
}

function BasketballStandings({ tl }: { tl: TeamLeague }) {
  const season = useBasketballSeason(tl);
  const table = basketballTableFrom(tl.rules.data);
  const leaders = season.leaders.slice(0, 20).map((r) => ({
    id: `${r.player}:${r.team}`,
    name: tl.nameOf(r.player),
    team: tl.teamOf(r.team)?.name ?? '',
    value: String(r.points),
    sub: `Prom ${r.avg.toLocaleString('es-DO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} · ${r.games} PJ`,
  }));
  return (
    <StandingsFrame
      tl={tl}
      rows={season.standings}
      columns={defaultColumns({ forLabel: 'PF', againstLabel: 'PC' })}
      leadersLabel="Anotadores"
      leaders={<Leaders rows={leaders} />}
      note={`Ganar ${table.win} · perder ${table.loss} · desempate FIBA`}
    />
  );
}

function FootballStandings({ tl }: { tl: TeamLeague }) {
  const season = useFootballSeason(tl);
  const table = footballTableFrom(tl.rules.data);
  const leaders = season.scorers
    .filter((r) => r.goals > 0)
    .slice(0, 20)
    .map((r) => ({
      id: `${r.player}:${r.team}`,
      name: tl.nameOf(r.player),
      team: tl.teamOf(r.team)?.name ?? '',
      value: String(r.goals),
      sub: `${r.assists} A · ${r.games} PJ`,
    }));
  return (
    <StandingsFrame
      tl={tl}
      rows={season.standings}
      columns={defaultColumns({ draws: true, forLabel: 'GF', againstLabel: 'GC' })}
      leadersLabel="Goleadores"
      leaders={<Leaders rows={leaders} />}
      note={`Ganar ${table.win} · empatar ${table.draw} · perder ${table.loss}`}
    />
  );
}
