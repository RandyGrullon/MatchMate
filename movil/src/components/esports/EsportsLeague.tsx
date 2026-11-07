/**
 * Las pantallas de la liga de esports (src/pages/sports/esports/screens.tsx de la web, Lite): el inicio (un torneo
 * suelto es la página de su torneo; una liga, sus torneos en «Inscripción abierta», «En curso» y «Terminados»), un
 * torneo, «Partidos» (todas las series), «Tabla» (grupos, todos contra todos o battle royale) y «Lo mío» (mis
 * inscripciones y mis series). Las pestañas de la web: Torneo · Partidos · Tabla · Lo mío. Quien organiza la liga (en el
 * teléfono no hay Pro: sus admins) tiene «Crear torneo» (el asistente con `?liga=`).
 */
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Crosshair, ListOrdered, Plus, Swords, Trophy, Users } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { useLeagueTournaments, useMyEsportsEntries, type EsportsTournament } from '@mm/lib/data/esports';
import { useMatches, type Match } from '@mm/lib/data/matches';
import { useLeagueRules } from '@mm/lib/data/teamSports';
import { useLeagueCtx } from '@mm/lib/league';
import { useNow } from '@mm/lib/useNow';
import { isGameId, platformLabel, formatLine, tiebreakText } from '@mm/sports/esports';
import { groupLetter } from '@mm/sports/formats/groups';
import { localParts } from '@mm/pages/sports/racket/logic/time';
import {
  brTable,
  cardMatch,
  competitors,
  groupTablesOf,
  hasTable,
  mineToConfirmCount,
  myEntryOf,
  myLeagueEntryLine,
  mySeriesGroups,
  phaseOf,
  pickTableTournament,
  planFromStage,
  seriesGroups,
  sideOfTeams,
  stageMatches,
  standingsColumns,
  tableOf,
  tournamentPathFor,
  type SeriesFilter,
} from '@mm/pages/sports/esports/logic';
import { useEntryNames, useMyTeams, useTournament } from '@mm/pages/sports/esports/tournamentData';
import { DateBlock } from '../DateBlock';
import { MatchCard } from '../match/MatchCard';
import { StandingsTable } from '../match/StandingsTable';
import { Button, Card, Empty, ListRow, LoadError, Loading, Segmented, SectionHeader, Txt } from '../ui';
import { BrLeaderboard } from './Br';
import { EntryStatusChip, GameMark, PhaseChip } from './bits';
import { ChoiceChips, FinePrint } from './inputs';
import { TournamentView, esportsMatchRoute } from './Tournament';
import { useColors } from '@/theme/theme';

const PAGE = 20;

/** El inicio de la liga de esports (`/l/<liga>`): un torneo suelto es la página de su torneo; una liga, sus torneos. */
export function EsportsHome() {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const list = useLeagueTournaments(lid);
  if (list.error) return <LoadError error={list.error} />;
  if (list.loading && !list.data.length) return <Loading label="Cargando los torneos" />;
  if (league.kind === 'torneo') {
    const t = list.data[0];
    if (!t) return <Empty icon={<Trophy size={28} color={c.accent} />} title="Este torneo todavía no está listo" text="Vuelve en un momento." />;
    return <TournamentView key={t.eventId} eventId={t.eventId} embedded />;
  }
  return <LeagueTournaments list={list.data} />;
}

/** Un torneo dentro de la liga (`/l/<liga>/e/<evento>`). */
export function EsportsEventBody({ eventId }: { eventId: string }) {
  return <TournamentView key={eventId} eventId={eventId} />;
}

function LeagueTournaments({ list }: { list: readonly EsportsTournament[] }) {
  const c = useColors();
  const { lid, isAdmin } = useLeagueCtx();
  const rules = useLeagueRules(lid);
  // En el teléfono no hay Pro: «Crear torneo» es de los admins de la liga.
  const organizer = isAdmin;
  const game = isGameId(rules.data.game) ? rules.data.game : (list[0]?.game ?? null);
  const live = list.filter((t) => t.status !== 'cancelled');
  const open = live.filter((t) => t.status === 'registration');
  const playing = live.filter((t) => t.status === 'live');
  const done = live.filter((t) => t.status === 'finished').reverse();
  const createButton = (full: boolean) =>
    organizer && game ? (
      <Button variant="primary" size="xl" full={full} icon={<Plus size={20} color={c.accentFg} />} onPress={() => router.push({ pathname: '/esports/[game]/nuevo-torneo', params: { game, liga: lid } } as never)}>
        Crear torneo
      </Button>
    ) : null;
  const create = createButton(true);
  if (!live.length) {
    return create ? (
      <Empty icon={<Trophy size={28} color={c.accent} />} title="Todavía no hay torneos" action={createButton(false)} />
    ) : (
      <Empty icon={<Trophy size={28} color={c.accent} />} title="Todavía no hay torneos" text="Cuando el organizador cree uno, sale aquí." />
    );
  }
  const section = (title: string, ts: EsportsTournament[]) =>
    ts.length > 0 && (
      <View style={{ gap: 10 }}>
        <SectionHeader title={title} />
        <Card padded={false}>
          {ts.map((t, i) => (
            <View key={t.eventId} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
              <TournamentRow t={t} />
            </View>
          ))}
        </Card>
      </View>
    );
  return (
    <View style={{ gap: 30 }}>
      {create}
      {section('Inscripción abierta', open)}
      {section('En curso', playing)}
      {section('Terminados', done)}
    </View>
  );
}

/** El torneo en una fila (con su fecha, la plataforma, el formato y la fase). */
function TournamentRow({ t }: { t: EsportsTournament }) {
  const { lid, league } = useLeagueCtx();
  const now = useNow().getTime();
  return (
    <ListRow
      icon={<DateBlock date={localParts(t.startsAt, league.tz)?.date ?? t.startsAt} />}
      title={t.name}
      subtitle={[platformLabel(t.game, t.settings.platform), formatLine(t)].filter(Boolean).join(' · ')}
      right={<PhaseChip phase={phaseOf(t, now)} />}
      onPress={() => router.push({ pathname: '/l/[lid]/e/[eventId]', params: { lid, eventId: t.eventId } })}
    />
  );
}

/** «Partidos» (`/l/<liga>/partidos`, el `/juegos` de la web): en vivo, por confirmar, próximos y resultados; Todos · Míos. */
export function EsportsMatches({ initial = 'todos' }: { initial?: SeriesFilter }) {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const q = useMatches({ lid });
  const myTeams = useMyTeams();
  const now = useNow().getTime();
  const [filter, setFilter] = useState<SeriesFilter>(initial);
  const [shown, setShown] = useState(PAGE);
  const shownFilter: SeriesFilter = myTeams.all.size > 0 ? filter : 'todos';
  const groups = useMemo(() => seriesGroups(q.data, shownFilter, myTeams.all, now), [q.data, shownFilter, myTeams.all, now]);
  if (q.error) return <LoadError error={q.error} />;
  const mineToConfirm = mineToConfirmCount(q.data, myTeams.act, now);
  const list = (ms: Match[]) => (
    <View style={{ gap: 10 }}>
      {ms.map((m) => (
        <MatchCard key={m.id} match={cardMatch(m)} mySide={sideOfTeams(m, myTeams.all)} onPress={() => router.push(esportsMatchRoute(lid, m.id))} tz={league.tz} now={now} roundWord="Jornada" />
      ))}
    </View>
  );
  const empty = !groups.live.length && !groups.toConfirm.length && !groups.upcoming.length && !groups.results.length;
  const section = (title: string, ms: Match[]) =>
    ms.length > 0 && (
      <View style={{ gap: 10 }}>
        <SectionHeader title={title} />
        {list(ms)}
      </View>
    );
  return (
    <View style={{ gap: 20 }}>
      <Txt variant="title">Partidos</Txt>
      {myTeams.all.size > 0 && (
        <Segmented<SeriesFilter>
          label="Qué partidos ver"
          options={[
            { key: 'todos', label: 'Todos' },
            { key: 'mios', label: mineToConfirm ? `Míos (${mineToConfirm})` : 'Míos' },
          ]}
          value={shownFilter}
          onChange={(k) => {
            setFilter(k);
            setShown(PAGE);
          }}
        />
      )}
      {q.loading && !q.data.length ? (
        <Loading label="Cargando partidos" />
      ) : empty ? (
        <Empty
          icon={<Swords size={28} color={c.accent} />}
          title="Todavía no hay partidos"
          text={shownFilter === 'mios' ? 'Cuando te toque jugar, tus series salen aquí.' : 'Las series salen aquí cuando el organizador arme el cuadro.'}
        />
      ) : (
        <View style={{ gap: 30 }}>
          {section('En vivo', groups.live)}
          {section('Por confirmar', groups.toConfirm)}
          {section('Próximos', groups.upcoming.slice(0, shown))}
          {section('Resultados', groups.results.slice(0, shown))}
          {(groups.results.length > shown || groups.upcoming.length > shown) && (
            <Button size="lg" full onPress={() => setShown(shown + PAGE)}>
              Ver más
            </Button>
          )}
        </View>
      )}
    </View>
  );
}

/**
 * «Tabla» (`/l/<liga>/tabla`, el `/ranking` de la web): las tablas de los grupos, la de todos contra todos o la de
 * battle royale; con varios torneos, se elige arriba. Si ningún torneo tiene tabla (solo cuadros), vuelve al inicio.
 */
export function EsportsStandings() {
  const { lid } = useLeagueCtx();
  const list = useLeagueTournaments(lid);
  const params = useLocalSearchParams<{ torneo?: string }>();
  const [wanted, setWanted] = useState<string | null>(params.torneo ?? null);
  const withTable = useMemo(() => list.data.filter(hasTable), [list.data]);
  if (list.error) return <LoadError error={list.error} />;
  if (list.loading && !list.data.length) return <Loading label="Cargando la tabla" />;
  const picked = pickTableTournament(withTable, wanted);
  if (!picked) return <Redirect href={{ pathname: '/l/[lid]', params: { lid } }} />;
  return (
    <View style={{ gap: 20 }}>
      <Txt variant="title">Tabla</Txt>
      {withTable.length > 1 && <ChoiceChips scroll label="Torneo" items={withTable.map((t) => ({ key: t.eventId, label: t.name }))} value={picked.eventId} onChange={setWanted} />}
      <TournamentTables key={picked.eventId} eventId={picked.eventId} />
    </View>
  );
}

function TournamentTables({ eventId }: { eventId: string }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const d = useTournament(lid, eventId);
  const nameOf = useEntryNames(d.entries);
  const uid = useAuth().user?.uid ?? null;
  const now = useNow().getTime();
  if (d.loading) return <Loading label="Cargando la tabla" />;
  const t = d.t;
  if (!t) return null;
  const mine = myEntryOf(d.entries, uid);
  const highlight = mine ? [mine.id] : [];
  const noTable = <Empty icon={<ListOrdered size={28} color={c.accent} />} title="Sin tabla todavía" text="La tabla sale cuando el organizador arme los partidos." />;
  if (t.format === 'br') {
    const ids = competitors(d.entries).map((e) => e.id);
    return <BrLeaderboard rows={brTable(ids, d.br, t.settings, t.game, t.eventId)} nameOf={nameOf} highlight={new Set(highlight)} />;
  }
  const columns = standingsColumns(t.game);
  if (t.format === 'round_robin') {
    if (!stageMatches('league', d.matches, d.links).length) return noTable;
    const ids = competitors(d.entries).map((e) => e.id);
    return (
      <View style={{ gap: 8 }}>
        <StandingsTable rows={tableOf(t.game, ids, d.matches, d.entryOf, now, t.eventId)} nameOf={nameOf} columns={columns} highlight={highlight} />
        <FinePrint>{tiebreakText(t.game)}</FinePrint>
      </View>
    );
  }
  if (!stageMatches('groups', d.matches, d.links).length) return noTable;
  const plan = planFromStage('groups', d.matches, d.links, d.entryOf);
  const tables = groupTablesOf(t.game, plan, d.matches, d.entryOf, now, t.eventId);
  return (
    <View style={{ gap: 30 }}>
      {tables.map((g, i) => (
        <View key={i} accessibilityLabel={`Grupo ${groupLetter(i)}`} style={{ gap: 10 }}>
          <SectionHeader title={`Grupo ${groupLetter(i)}`} />
          <StandingsTable rows={g.rows} nameOf={nameOf} columns={columns} highlight={highlight} />
        </View>
      ))}
      <FinePrint>{tiebreakText(t.game)}</FinePrint>
    </View>
  );
}

/** «Lo mío» (el `/perfil` de la web): mis inscripciones en los torneos de la liga y mis series («Te toca», «Resultados»). */
export function EsportsMine() {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const uid = useAuth().user?.uid ?? null;
  const entries = useMyEsportsEntries(uid);
  const matches = useMatches({ lid });
  const myTeams = useMyTeams();
  const now = useNow().getTime();
  const mine = useMemo(() => entries.data.filter((e) => e.leagueId === lid), [entries.data, lid]);
  const series = useMemo(() => mySeriesGroups(matches.data, myTeams.all, now), [matches.data, myTeams.all, now]);
  if (entries.error) return <LoadError error={entries.error} />;
  const card = (m: Match) => <MatchCard key={m.id} match={cardMatch(m)} mySide={sideOfTeams(m, myTeams.all)} onPress={() => router.push(esportsMatchRoute(lid, m.id))} tz={league.tz} now={now} roundWord="Jornada" />;
  let body;
  if (!uid) {
    body = <Empty icon={<Users size={28} color={c.accent} />} title="Entra para ver lo tuyo" action={<Button onPress={() => router.push('/login')}>Entrar</Button>} />;
  } else if (entries.loading && !entries.data.length) {
    body = <Loading label="Cargando lo tuyo" />;
  } else if (!mine.length && !series.all.length) {
    body = (
      <Empty
        icon={<Crosshair size={28} color={c.accent} />}
        title="Todavía no juegas aquí"
        text={`Cuando te inscribas en un torneo de ${league.kind === 'torneo' ? 'este torneo' : 'esta liga'}, tu inscripción y tus series salen aquí.`}
      />
    );
  } else {
    body = (
      <View style={{ gap: 30 }}>
        {mine.length > 0 && (
          <View style={{ gap: 10 }}>
            <SectionHeader title={mine.length === 1 ? 'Mi inscripción' : 'Mis inscripciones'} />
            <Card padded={false}>
              {mine.map((e, i) => (
                <View key={e.entryId} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
                  <ListRow
                    icon={<GameMark game={e.game} size="md" />}
                    title={e.tournament}
                    subtitle={myLeagueEntryLine(e) ?? null}
                    right={<EntryStatusChip status={e.entryStatus} />}
                    onPress={() => router.push(tournamentPathFor(lid, e.eventId, league.kind) as never)}
                  />
                </View>
              ))}
            </Card>
          </View>
        )}
        {series.todo.length > 0 && (
          <View style={{ gap: 10 }}>
            <SectionHeader title="Te toca" />
            {series.todo.map(card)}
          </View>
        )}
        {series.done.length > 0 && (
          <View style={{ gap: 10 }}>
            <SectionHeader title="Resultados" />
            {series.done.map(card)}
          </View>
        )}
      </View>
    );
  }
  return (
    <View style={{ gap: 26 }}>
      <Txt variant="title">Lo mío</Txt>
      {body}
    </View>
  );
}
