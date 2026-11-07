/**
 * Un evento de raqueta (EventPage.tsx de la web): la liga de parejas (jornadas, tabla y parejas), la noche de americano
 * o mexicano (tu cancha, las canchas de la ronda, cómo van todos y las rondas) y el torneo (grupos, cuadro y partidos).
 * Con la misma lógica de la web (logic/league, night, tourney). La liga por cajas (BoxEvent.tsx), la escalera
 * (LadderEvent.tsx) y el round robin social del pickleball (SocialEvent.tsx). Quien organiza tiene «•••» (EventAdmin.tsx)
 * y, en Pro, arma el calendario (ScheduleBuilder.tsx), las rondas (NightParts.tsx) y los grupos y el cuadro
 * (TourneyPro.tsx); en Lite, el aviso «Usar Pro» (useOrganizePro). Antes de empezar, «Me apunto» (SignupPanel.tsx).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { CalendarDays, LayoutGrid, Trophy, Users } from 'lucide-react-native';
import { useMatches, type Match } from '@mm/lib/data/matches';
import { useRacketEvent, useWithPendingPoints, type RacketEvent } from '@mm/lib/data/racket';
import { useLeagueCtx } from '@mm/lib/league';
import { useIsPro } from '@mm/lib/useMode';
import { useNow } from '@mm/lib/useNow';
import { racketNightReport } from '@mm/lib/report/racket';
import { eventDay } from '@mm/components/event/eventDay';
import { groupSchedule } from '@mm/components/match/schedule';
import { isSocialEvent } from '@mm/pages/sports/pickleball/social/logic';
import { levelText, useLevels } from '@mm/pages/sports/racket/levels';
import { parseLeagueConfig } from '@mm/pages/sports/racket/logic/league';
import {
  fmtPoints,
  isNightType,
  nextNightRound,
  nightConfigJson,
  nightRounds,
  nightTable,
  parseNightConfig,
  pointsLabel,
  redoNightRound,
  roundDrafts,
} from '@mm/pages/sports/racket/logic/night';
import { matchTime, pairStandings } from '@mm/pages/sports/racket/logic/results';
import { pointsText, tiebreakText } from '@mm/pages/sports/racket/logic/tiebreaks';
import { timeLabel, todayIn } from '@mm/pages/sports/racket/logic/time';
import { categoryBracket, groupStage, groupTables, parseTourneyConfig, tourneyStarted } from '@mm/pages/sports/racket/logic/tourney';
import { useMySide } from '@mm/pages/sports/racket/match/side';
import { nightFirstSummary, nightPointsEntry } from '@mm/pages/sports/racket/night/entry';
import { useNames } from '@mm/pages/sports/racket/names';
import { courtWords } from '@mm/pages/sports/racket/sport';
import { eventTypeInfo, racketColumns } from '@mm/pages/sports/racket/view';
import { racketNightComp, racketTourneyFinished } from '@mm/prizes/sports';
import { ScreenNotice } from '../esports/bits';
import { FinePrint } from '../esports/inputs';
import { MatchCard } from '../match/MatchCard';
import { StandingsTable } from '../match/StandingsTable';
import { Badge, Button, Card, Divider, Empty, ListRow, LoadError, RowIcon, Segmented, SectionHeader, Sheet, Txt } from '../ui';
import { LogoSpinner } from '../Logo';
import { useColors } from '@/theme/theme';
import { matchRoute } from './RacketHome';
import { CategoryPrize, NightPrizes, TourneyPrizes } from '@/components/prizes/SportPrizes';
import { ReportButton } from '@/components/tournamentReport/ReportButton';
import { NightReport, TourneyReport } from '@/components/tournamentReport/SportReports';
import { BoxView } from './BoxEvent';
import { LeagueMenu, NightMenu, TourneyMenu } from './EventAdmin';
import { LadderView } from './LadderEvent';
import { FirstRound, MyCourt, PlayersList, Podium, RestCard, RoundCourts, RoundList, RoundsButtons, useRoundsAdmin } from './NightParts';
import { ScheduleBuilder } from './ScheduleBuilder';
import { SignupPanel } from './SignupPanel';
import { SocialView } from './SocialEvent';
import { BracketRounds, TourneyPro } from './TourneyPro';
import { SHEET_CLOSE_MS, ScreenHead, useOrganizePro, useRacketPhone } from './parts';

const Spinner = ({ label }: { label: string }) => (
  <View style={{ paddingVertical: 24, alignItems: 'center' }}>
    <LogoSpinner size={32} label={label} />
  </View>
);

/** El título y lo de ahora, con «•••» a la derecha (`right`) para quien organiza. */
function Head({ title, meta, status, right }: { title: string; meta?: string | null; status?: { text: string; live?: boolean } | null; right?: ReactNode }) {
  return <ScreenHead title={title} meta={meta} status={status} right={right} />;
}

/** El evento por su id: elige la vista por su tipo. */
export function RacketEventBody({ eventId }: { eventId: string }) {
  const { lid } = useLeagueCtx();
  const { sport } = useRacketPhone();
  const ev = useRacketEvent(lid, eventId);
  if (ev.error) return <LoadError error={ev.error} />;
  if (ev.loading && !ev.data) return <Spinner label="Cargando el evento" />;
  if (!ev.data) return <Empty title="Este evento no existe" action={<Button onPress={() => router.navigate({ pathname: '/l/[lid]', params: { lid } })}>Volver</Button>} />;
  const e = ev.data;
  if (e.type === 'cajas') return <BoxView event={e} />;
  if (e.type === 'escalera') return <LadderView event={e} />;
  // El round robin social del pickleball (lo que agrega el deporte: `eventPage` de pickleball/screens.tsx).
  if (sport === 'pickleball' && isSocialEvent(e)) return <SocialView event={e} />;
  if (isNightType(e.type)) return <NightView event={e} />;
  if (e.type === 'torneo') return <TourneyView event={e} />;
  return <LeagueView event={e} />;
}

/** Los partidos agrupados por jornada (o ronda), con su título. */
function Schedule({ matches, roundWord }: { matches: readonly Match[]; roundWord: string }) {
  const { lid, league } = useLeagueCtx();
  const mySideOf = useMySide();
  const now = useNow().getTime();
  const groups = groupSchedule(matches, 'round', { roundWord, tz: league.tz });
  return (
    <View style={{ gap: 16 }}>
      {groups.map((g) => (
        <View key={g.key} style={{ gap: 10 }}>
          <Txt variant="bodyStrong" tone="fg2">
            {g.title}
          </Txt>
          {g.matches.map((m) => (
            <MatchCard key={m.id} match={m} mySide={mySideOf(m)} roundWord={roundWord} tz={league.tz} now={now} onPress={() => router.push(matchRoute(lid, m.id))} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Los partidos en una lista, sin agrupar (los del torneo ya dicen su fase). */
function MatchList({ matches }: { matches: readonly Match[] }) {
  const { lid, league } = useLeagueCtx();
  const mySideOf = useMySide();
  const now = useNow().getTime();
  return (
    <View style={{ gap: 10 }}>
      {matches.map((m) => (
        <MatchCard key={m.id} match={m} mySide={mySideOf(m)} tz={league.tz} now={now} onPress={() => router.push(matchRoute(lid, m.id))} />
      ))}
    </View>
  );
}

// ---------- Liga de parejas ----------

type LeagueTab = 'jornadas' | 'tabla' | 'parejas';

function LeagueView({ event }: { event: RacketEvent }) {
  const c = useColors();
  const { lid, league, myPlayerId, isAdmin } = useLeagueCtx();
  const { sport, ext, doubles, side } = useRacketPhone();
  const pro = useIsPro();
  const names = useNames();
  const now = useNow().getTime();
  const q = useMatches({ lid, eventId: event.id });
  const matches = useWithPendingPoints(lid, q.data);
  const mySideOf = useMySide();
  const cfg = useMemo(() => parseLeagueConfig(event.config, event.date), [event.config, event.date]);
  const table = useMemo(() => pairStandings(sport, cfg.pairs, matches, { scheme: cfg.points, lotSeed: event.id, now }), [sport, cfg, matches, event.id, now]);
  const [tab, setTab] = useState<LeagueTab>('jornadas');
  // Lite, quien organiza y todavía no hay calendario: se arma en Pro (el aviso de la pantalla y «•••»).
  const proItem = useOrganizePro(isAdmin && !q.loading && !matches.length, {
    id: `raqueta-liga-pro:${event.id}`,
    title: 'Falta el calendario',
    text: 'Las jornadas se arman en Pro',
    menu: 'Armar el calendario',
  });
  const organize = isAdmin && pro;
  const title = event.name || eventTypeInfo('liga', doubles).label;
  const mine = names.teamsOf(myPlayerId);
  const highlight = doubles ? mine : myPlayerId ? [myPlayerId] : [];
  const today = todayIn(league.tz);
  const day = eventDay(cfg.startDate || event.date, today, pro);
  const count = `${cfg.pairs.length} ${cfg.pairs.length === 1 ? side[0] : side[1]}`;
  const meta = [`Desde ${day.charAt(0).toLowerCase()}${day.slice(1)}`, count, cfg.double ? 'ida y vuelta' : 'solo ida', pro ? pointsText(sport, cfg.points) : null].filter(Boolean).join(' · ');
  const next =
    mine.length || myPlayerId
      ? matches
          .filter((m) => (m.status === 'scheduled' || m.status === 'live' || m.status === 'suspended' || m.status === 'postponed') && mySideOf(m) !== null)
          .sort((a, b) => matchTime(a) - matchTime(b))[0]
      : undefined;

  const tabs = (
    <Segmented<LeagueTab>
      label="Qué ver de la liga"
      value={tab}
      onChange={setTab}
      options={[
        { key: 'jornadas', label: 'Jornadas' },
        { key: 'tabla', label: 'Tabla' },
        { key: 'parejas', label: doubles ? 'Parejas' : 'Jugadores' },
      ]}
    />
  );
  const pairsList = (
    <Card padded={false}>
      {cfg.pairs.map((id, i) => (
        <View key={id}>
          {i > 0 && <Divider inset={16} />}
          <ListRow title={names.entrantName(id)} subtitle={doubles ? names.rosterOf(id).map(names.nameOf).join(' / ') : undefined} chevron={false} right={highlight.includes(id) ? <Badge>Tú</Badge> : undefined} />
        </View>
      ))}
    </Card>
  );

  let body;
  if (q.loading && !matches.length) body = <Spinner label="Cargando las jornadas" />;
  else if (!matches.length)
    body = organize ? (
      <ScheduleBuilder event={event} cfg={cfg} />
    ) : (
      <Empty
        icon={<CalendarDays size={28} color={c.accent} />}
        title="El calendario todavía no está"
        text={`Cuando se armen las jornadas, aquí salen tus partidos con ${courtWords(ext).one} y hora.`}
      />
    );
  else if (pro)
    // Pro: Jornadas · Tabla · Parejas, con la tabla completa y sus desempates (los puntos van arriba, en la línea).
    body = (
      <>
        {tabs}
        {tab === 'jornadas' && <Schedule matches={matches} roundWord="Jornada" />}
        {tab === 'tabla' && (
          <>
            <StandingsTable rows={table} nameOf={names.entrantName} columns={racketColumns(sport)} highlight={highlight} />
            <FinePrint>{`${tiebreakText(sport)} Un resultado por confirmar cuenta a las 48 h.`}</FinePrint>
          </>
        )}
        {tab === 'parejas' && pairsList}
      </>
    );
  else
    body = (
      <>
        {next && (
          <View style={{ gap: 10 }}>
            <SectionHeader title="Tu próximo partido" />
            <MatchCard match={next} mySide={mySideOf(next)} roundWord="Jornada" tz={league.tz} now={now} onPress={() => router.push(matchRoute(lid, next.id))} />
          </View>
        )}
        {tabs}
        {tab === 'jornadas' && <Schedule matches={matches} roundWord="Jornada" />}
        {tab === 'tabla' && (
          <>
            <StandingsTable rows={table} nameOf={names.entrantName} columns={racketColumns(sport)} highlight={highlight} />
            <Txt variant="small" tone="muted">
              Puntos: {pointsText(sport, cfg.points)}
            </Txt>
            <Txt variant="small" tone="muted">
              {tiebreakText(sport)} Un resultado por confirmar cuenta a las 48 h.
            </Txt>
          </>
        )}
        {tab === 'parejas' && pairsList}
      </>
    );

  return (
    <View style={{ gap: 20 }}>
      <Head title={title} meta={meta} right={<LeagueMenu event={event} title={title} matches={matches} table={table} extra={proItem.item} />} />
      {body}
      <ScreenNotice notices={[proItem.notice]} />
    </View>
  );
}

// ---------- Noche de americano o mexicano ----------

type NightTab = 'canchas' | 'tabla' | 'rondas';

function NightView({ event }: { event: RacketEvent }) {
  const c = useColors();
  const { lid, league, myPlayerId, isAdmin } = useLeagueCtx();
  const { sport } = useRacketPhone();
  const pro = useIsPro();
  const names = useNames();
  const { levels, scale } = useLevels();
  const now = useNow().getTime();
  const q = useMatches({ lid, eventId: event.id });
  const matches = useWithPendingPoints(lid, q.data);
  const cfg = useMemo(() => parseNightConfig(event.config, event.type), [event.config, event.type]);
  const rounds = useMemo(() => nightRounds(cfg, matches, now), [cfg, matches, now]);
  const table = useMemo(() => nightTable(cfg, rounds), [cfg, rounds]);
  const [tab, setTab] = useState<NightTab>('canchas');
  // La hoja de «•••» que abre la pantalla (el podio: compartir; «Jugadores»: cambiarlos) y la hoja de los jugadores.
  const [ask, setAsk] = useState<'compartir' | 'jugadores' | 'inscripcion' | null>(null);
  const [players, setPlayers] = useState(false);
  // Lite, quien organiza: armar las rondas y poner marcadores está en Pro (el aviso de la pantalla y «•••»).
  const proItem = useOrganizePro(isAdmin && !cfg.closed, {
    id: `raqueta-noche-pro:${event.id}`,
    title: 'Organizas esta noche',
    text: 'Las rondas se arman en Pro',
    menu: 'Rondas y marcadores',
  });
  const admin = useRoundsAdmin({
    event,
    cfg,
    rounds,
    next: nextNightRound,
    redo: redoNightRound,
    drafts: roundDrafts,
    json: nightConfigJson,
    pendingMessage: 'Los puntos cuentan cuando terminen. ¿Armar la siguiente ronda de todas formas?',
    close: { title: '¿Terminar la noche?', confirmText: 'Terminar la noche', ok: 'Noche terminada' },
    onPublished: () => setTab('canchas'),
  });
  const organize = isAdmin && pro;
  const title = event.name || eventTypeInfo(event.type).label;
  const current = rounds.at(-1) ?? null;
  const finished = cfg.closed || (!!current && current.round >= cfg.rounds && current.done);
  // Como la base: la noche empezó al publicar una ronda o al cerrarse (ya nadie se apunta ni sube de la espera).
  const started = !!current || cfg.round > 0 || cfg.closed;
  const mine = current?.matches.find((m) => [...m.side1, ...m.side2].includes(myPlayerId ?? '')) ?? null;
  const resting = !!myPlayerId && !!current?.rests.includes(myPlayerId);
  const played = table.filter((r) => r.played > 0 || r.points > 0);
  const status = finished ? { text: 'Terminada' } : current ? { text: `Ronda ${current.round} de ${cfg.rounds}`, live: true } : { text: eventTypeInfo(cfg.format).label };
  // Pro: «Jue 7 oct · 7:00 pm · A 24 puntos».
  const meta = pro ? [eventDay(event.date, todayIn(league.tz), true), event.startTime ? timeLabel(event.startTime) : null, pointsLabel(cfg.points)].filter(Boolean).join(' · ') : null;
  const first = nextNightRound(cfg, []);

  const courts =
    q.loading && !matches.length ? (
      <Spinner label="Cargando las canchas" />
    ) : pro ? (
      !current ? (
        <FirstRound
          organize={organize}
          summary={nightFirstSummary(cfg)}
          problem={first.ok ? null : first.reason}
          note={cfg.signup?.open ? 'Al empezar la ronda 1 se cierra la inscripción.' : null}
          busy={admin.pending === 'ronda'}
          onStart={() => void admin.nextRound()}
          onPlayers={() => setAsk('jugadores')}
        />
      ) : (
        <View style={{ gap: 16 }}>
          {finished && <Podium table={table} nameOf={names.nameOf} value={(r) => fmtPoints(r.points)} onShare={() => setAsk('compartir')} />}
          <RoundCourts round={current} organize={organize} entry={nightPointsEntry} />
          {organize && !cfg.closed && <RoundsButtons round={current} rounds={cfg.rounds} admin={admin} finishLabel="Terminar la noche" />}
        </View>
      )
    ) : !current ? (
      <Empty icon={<LayoutGrid size={28} color={c.accent} />} title="Todavía no empieza" text="Cuando se arme la ronda 1, aquí sale tu cancha (y te llega un aviso)." />
    ) : (
      <RoundList round={current} />
    );

  return (
    <View style={{ gap: 20 }}>
      <Head
        title={title}
        status={status}
        meta={meta}
        right={<NightMenu event={event} title={title} cfg={cfg} rounds={rounds} table={table} finished={finished} extra={proItem.item} sheet={ask} onSheetClosed={() => setAsk(null)} />}
      />
      {/* Antes de empezar, «Me apunto» si quien organiza abrió la inscripción. */}
      {cfg.signup && !started && (
        <SignupPanel event={event} settings={cfg.signup} lists={[{ category: null, name: null, listed: cfg.players }]} started={started} onEdit={isAdmin ? () => setAsk('inscripcion') : undefined} />
      )}
      {mine && !finished && current && <MyCourt match={mine.match} round={current.round} />}
      {resting && !finished && current && <RestCard round={current.round} text="Sumas lo que dicen las reglas de la noche." />}
      {/* Pro: terminada la noche, quien organiza tiene el reporte a la mano (para todos está abajo). */}
      {organize && finished && rounds.length > 0 && (
        <ReportButton
          look="card"
          report={() => Promise.resolve(racketNightReport({ lid, league, event, title, cfg, rounds: [...rounds], table: [...table], nameOf: names.nameOf, finished, now }))}
          comp={racketNightComp(lid, event, sport)}
          disabled={(q.loading && !matches.length) || names.loading}
        />
      )}
      <Segmented<NightTab>
        label="Qué ver de la noche"
        value={tab}
        onChange={setTab}
        options={[
          { key: 'canchas', label: 'Canchas' },
          { key: 'tabla', label: 'Tabla' },
          { key: 'rondas', label: 'Rondas' },
        ]}
      />
      {tab === 'canchas' && courts}
      {tab === 'tabla' && (
        <>
          <StandingsTable
            rows={played}
            nameOf={names.nameOf}
            columns={[
              { key: 'played', label: 'PJ', title: 'Partidos jugados', value: (r) => r.played },
              { key: 'won', label: 'G', title: 'Ganados', value: (r) => r.won },
              { key: 'lost', label: 'P', title: 'Perdidos', value: (r) => r.lost },
            ]}
            highlight={myPlayerId ? [myPlayerId] : []}
            primary={['puntos']}
            empty="Cuando termine el primer partido, sale la tabla."
          />
          <Txt variant="small" tone="muted">
            Orden: puntos, partidos ganados y diferencia.{cfg.rest !== 'none' && ' Quien descansa suma según las reglas.'}
          </Txt>
        </>
      )}
      {tab === 'rondas' && (rounds.length ? rounds.slice().reverse().map((r) => <RoundList key={r.round} round={r} />) : <Empty title="Todavía no hay rondas" />)}
      {/* Pro: los jugadores en su fila (con su nivel y sus puntos). */}
      {pro && (
        <Card padded={false}>
          <ListRow
            icon={
              <RowIcon>
                <Users size={20} color={c.accent} />
              </RowIcon>
            }
            title={`Jugadores (${cfg.players.length})`}
            subtitle={`${cfg.courts.length} ${cfg.courts.length === 1 ? 'cancha' : 'canchas'} · ${cfg.rounds} rondas`}
            onPress={() => setPlayers(true)}
          />
        </Card>
      )}
      {/* El reporte de la noche (PDF o Excel) y sus premios, al final (se eligen y se entregan; no son de todos los días). */}
      <NightReport event={event} title={title} cfg={cfg} rounds={rounds} table={table} finished={finished} names={names} loading={q.loading && !matches.length} />
      <NightPrizes event={event} table={table} finished={finished} nameOf={names.nameOf} />
      {/* El único aviso de la pantalla, al final (Lite, quien organiza: armar las rondas y poner marcadores está en Pro). */}
      <ScreenNotice notices={[proItem.notice]} />

      <Sheet
        open={players}
        onClose={() => setPlayers(false)}
        title={`Jugadores (${cfg.players.length})`}
        subtitle={title}
        footer={
          isAdmin ? (
            <Button
              size="lg"
              full
              icon={<Users size={16} color={c.fg} />}
              onPress={() => {
                setPlayers(false);
                setTimeout(() => setAsk('jugadores'), SHEET_CLOSE_MS);
              }}
            >
              Cambiar jugadores
            </Button>
          ) : undefined
        }
      >
        <PlayersList
          ids={cfg.players}
          sub={(id) => (levels[id] != null ? levelText(levels[id], scale) : null)}
          value={(id) => {
            const r = table.find((x) => x.id === id);
            return r ? `${fmtPoints(r.points)} pts` : null;
          }}
        />
      </Sheet>
    </View>
  );
}

// ---------- Torneo ----------

type TourneyTab = 'grupos' | 'cuadro' | 'partidos';

/** Pro: el torneo con lo de armar (TourneyPro.tsx); Lite: grupos, cuadro y partidos para mirar. */
function TourneyView({ event }: { event: RacketEvent }) {
  return useIsPro() ? <TourneyPro event={event} /> : <TourneyLite event={event} />;
}

function TourneyLite({ event }: { event: RacketEvent }) {
  const c = useColors();
  const { lid, myPlayerId, isAdmin } = useLeagueCtx();
  const { sport, doubles } = useRacketPhone();
  const names = useNames();
  const now = useNow().getTime();
  const q = useMatches({ lid, eventId: event.id });
  const matches = useWithPendingPoints(lid, q.data);
  const cfg = useMemo(() => parseTourneyConfig(event.config), [event.config]);
  const [catId, setCatId] = useState<string | null>(null);
  const cat = cfg.categories.find((x) => x.id === catId) ?? cfg.categories[0] ?? null;
  const hasGroups = !!cat?.groupsOf?.length;
  const [view, setView] = useState<TourneyTab | null>(null);
  const [ask, setAsk] = useState<'inscripcion' | null>(null);
  const shown: TourneyTab = view ?? (hasGroups ? 'grupos' : 'cuadro');
  const tables = useMemo(() => (cat && hasGroups ? groupTables(sport, cat, matches, { scheme: cfg.points, now }) : []), [cat, hasGroups, sport, matches, cfg.points, now]);
  const bracket = useMemo(() => (cat ? categoryBracket(cat, matches, now) : null), [cat, matches, now]);
  const title = event.name || eventTypeInfo('torneo').label;
  const highlight = doubles ? names.teamsOf(myPlayerId) : myPlayerId ? [myPlayerId] : [];
  const finished = racketTourneyFinished(cfg.categories, matches, names, now);
  const started = tourneyStarted(cfg) || matches.length > 0;
  // Lite, quien organiza: los grupos y el cuadro se arman en Pro (el aviso de la pantalla y «•••»).
  const proItem = useOrganizePro(isAdmin && !finished, {
    id: `raqueta-torneo-pro:${event.id}`,
    title: 'Organizas este torneo',
    text: 'Grupos y cuadro se arman en Pro',
    menu: 'Armar grupos y cuadro',
  });
  const head = (
    <Head
      title={title}
      status={finished ? { text: 'Terminado' } : null}
      right={<TourneyMenu event={event} title={title} cfg={cfg} started={started} extra={proItem.item} sheet={ask} onSheetClosed={() => setAsk(null)} />}
    />
  );
  const notice = <ScreenNotice notices={[proItem.notice]} />;

  if (!cat) {
    return (
      <View style={{ gap: 20 }}>
        {head}
        <Empty icon={<Trophy size={28} color={c.accent} />} title="Sin categorías" text="El torneo todavía no tiene categorías." />
        {notice}
      </View>
    );
  }
  const catMatches = matches.filter((m) => m.stage.startsWith(`${cat.name} ·`));
  const options = [...(hasGroups ? [{ key: 'grupos' as TourneyTab, label: 'Grupos' }] : []), { key: 'cuadro' as TourneyTab, label: 'Cuadro' }, { key: 'partidos' as TourneyTab, label: 'Partidos' }];

  return (
    <View style={{ gap: 20 }}>
      {head}
      {/* Antes de armar, «Me apunto» por categoría si quien organiza abrió la inscripción. */}
      {cfg.signup && !started && (
        <SignupPanel
          event={event}
          settings={cfg.signup}
          lists={cfg.categories.map((x) => ({ category: x.id, name: x.name, listed: x.pairs }))}
          started={started}
          onEdit={isAdmin ? () => setAsk('inscripcion') : undefined}
        />
      )}
      {cfg.categories.length > 1 && <Segmented<string> label="Categoría" value={cat.id} onChange={setCatId} options={cfg.categories.map((x) => ({ key: x.id, label: x.name }))} />}
      {q.loading && !matches.length ? (
        <Spinner label="Cargando el torneo" />
      ) : !hasGroups && !bracket ? (
        <Empty icon={<Trophy size={28} color={c.accent} />} title={cat.name} text="Cuando se armen los grupos o el cuadro, salen aquí." />
      ) : (
        <>
          <Segmented<TourneyTab> label="Qué ver del torneo" value={shown} onChange={setView} options={options} />
          {shown === 'grupos' &&
            tables.map((rows, g) => (
              <View key={g} style={{ gap: 10 }}>
                <SectionHeader title={groupStage(cat, g)} />
                <StandingsTable rows={rows} nameOf={names.entrantName} columns={racketColumns(sport)} highlight={highlight} />
              </View>
            ))}
          {/* «Se lleva: [insignia] Campeón» de la categoría, arriba del cuadro. */}
          {shown === 'cuadro' && bracket && <CategoryPrize eventId={event.id} catId={cat.id} />}
          {shown === 'cuadro' && (bracket ? <BracketRounds cat={cat} bracket={bracket} matches={matches} /> : <Empty title="El cuadro todavía no está" />)}
          {shown === 'partidos' && (catMatches.length ? <MatchList matches={catMatches} /> : <Empty title="Sin partidos todavía" />)}
        </>
      )}
      {/* El reporte del torneo (PDF o Excel) y los premios, al final. */}
      <TourneyReport event={event} title={title} cfg={cfg} matches={matches} names={names} loading={q.loading && !matches.length} />
      <TourneyPrizes event={event} cfg={cfg} matches={matches} names={names} now={now} />
      {/* El único aviso de la pantalla, al final. */}
      {notice}
    </View>
  );
}
