/**
 * Un evento de raqueta (EventPage.tsx de la web): la liga de parejas (jornadas, tabla y parejas), la noche de americano
 * o mexicano (tu cancha, las canchas de la ronda, cómo van todos y las rondas) y el torneo (grupos, cuadro y partidos).
 * Con la misma lógica de la web (logic/league, night, tourney). Lo de organizar (armar el calendario, la siguiente
 * ronda, los grupos), por ahora en la web. La liga por cajas y la escalera, en la web.
 */
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { CalendarDays, Globe, LayoutGrid, Trophy } from 'lucide-react-native';
import { useMatches, type Match } from '@mm/lib/data/matches';
import { useRacketEvent, useWithPendingPoints, type RacketEvent } from '@mm/lib/data/racket';
import { useLeagueCtx } from '@mm/lib/league';
import { useNow } from '@mm/lib/useNow';
import { eventDay } from '@mm/components/event/eventDay';
import { groupSchedule } from '@mm/components/match/schedule';
import { roundName } from '@mm/sports/formats/knockout';
import { parseLeagueConfig } from '@mm/pages/sports/racket/logic/league';
import { isNightType, nightRounds, nightTable, parseNightConfig, type NightRound } from '@mm/pages/sports/racket/logic/night';
import { matchTime, pairStandings } from '@mm/pages/sports/racket/logic/results';
import { pointsText, tiebreakText } from '@mm/pages/sports/racket/logic/tiebreaks';
import { todayIn } from '@mm/pages/sports/racket/logic/time';
import { categoryBracket, groupStage, groupTables, matchAt, parseTourneyConfig } from '@mm/pages/sports/racket/logic/tourney';
import { useMySide } from '@mm/pages/sports/racket/match/side';
import { useNames } from '@mm/pages/sports/racket/names';
import { courtWords, useRacket } from '@mm/pages/sports/racket/sport';
import { eventTypeInfo, racketColumns } from '@mm/pages/sports/racket/view';
import { MatchCard } from '../match/MatchCard';
import { StandingsTable } from '../match/StandingsTable';
import { Badge, Button, Card, Divider, Empty, ListRow, LoadError, Segmented, SectionHeader, Txt } from '../ui';
import { LogoSpinner } from '../Logo';
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';
import { matchRoute } from './RacketHome';
import { CategoryPrize, NightPrizes, TourneyPrizes } from '@/components/prizes/SportPrizes';

const Spinner = ({ label }: { label: string }) => (
  <View style={{ paddingVertical: 24, alignItems: 'center' }}>
    <LogoSpinner size={32} label={label} />
  </View>
);

function Head({ title, meta, status }: { title: string; meta?: string | null; status?: { text: string; live?: boolean } | null }) {
  return (
    <View style={{ gap: 4 }}>
      {status && <Badge tone={status.live ? 'accent' : 'muted'}>{status.text}</Badge>}
      <Txt variant="title" style={{ fontSize: 28, lineHeight: 33 }}>
        {title}
      </Txt>
      {!!meta && (
        <Txt variant="meta" tone="muted">
          {meta}
        </Txt>
      )}
    </View>
  );
}

/** El evento por su id: elige la vista por su tipo. */
export function RacketEventBody({ eventId }: { eventId: string }) {
  const { lid } = useLeagueCtx();
  const ev = useRacketEvent(lid, eventId);
  if (ev.error) return <LoadError error={ev.error} />;
  if (ev.loading && !ev.data) return <Spinner label="Cargando el evento" />;
  if (!ev.data) return <Empty title="Este evento no existe" action={<Button onPress={() => router.navigate({ pathname: '/l/[lid]', params: { lid } })}>Volver</Button>} />;
  const e = ev.data;
  if (e.type === 'cajas' || e.type === 'escalera') return <OnWeb event={e} />;
  if (isNightType(e.type)) return <NightView event={e} />;
  if (e.type === 'torneo') return <TourneyView event={e} />;
  return <LeagueView event={e} />;
}

/** La liga por cajas y la escalera: por ahora en la web. */
function OnWeb({ event }: { event: RacketEvent }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const label = eventTypeInfo(event.type).label;
  return (
    <View style={{ gap: 16 }}>
      <Head title={event.name || label} meta={label} />
      <Button full icon={<Globe size={18} color={c.fg} />} onPress={() => openOnWeb(`/l/${lid}/e/${event.id}`)}>
        Abrir en la web
      </Button>
    </View>
  );
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
  const { lid, league, myPlayerId } = useLeagueCtx();
  const { sport, ext, doubles, side } = useRacket();
  const names = useNames();
  const now = useNow().getTime();
  const q = useMatches({ lid, eventId: event.id });
  const matches = useWithPendingPoints(lid, q.data);
  const mySideOf = useMySide();
  const cfg = useMemo(() => parseLeagueConfig(event.config, event.date), [event.config, event.date]);
  const table = useMemo(() => pairStandings(sport, cfg.pairs, matches, { scheme: cfg.points, lotSeed: event.id, now }), [sport, cfg, matches, event.id, now]);
  const [tab, setTab] = useState<LeagueTab>('jornadas');
  const title = event.name || eventTypeInfo('liga', doubles).label;
  const mine = names.teamsOf(myPlayerId);
  const highlight = doubles ? mine : myPlayerId ? [myPlayerId] : [];
  const today = todayIn(league.tz);
  const day = eventDay(cfg.startDate || event.date, today);
  const count = `${cfg.pairs.length} ${cfg.pairs.length === 1 ? side[0] : side[1]}`;
  const meta = [`Desde ${day.charAt(0).toLowerCase()}${day.slice(1)}`, count, cfg.double ? 'ida y vuelta' : 'solo ida'].join(' · ');
  const next =
    mine.length || myPlayerId
      ? matches
          .filter((m) => (m.status === 'scheduled' || m.status === 'live' || m.status === 'suspended' || m.status === 'postponed') && mySideOf(m) !== null)
          .sort((a, b) => matchTime(a) - matchTime(b))[0]
      : undefined;

  let body;
  if (q.loading && !matches.length) body = <Spinner label="Cargando las jornadas" />;
  else if (!matches.length)
    body = (
      <Empty
        icon={<CalendarDays size={28} color={c.accent} />}
        title="El calendario todavía no está"
        text={`Cuando se armen las jornadas, aquí salen tus partidos con ${courtWords(ext).one} y hora.`}
      />
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
        {tab === 'parejas' && (
          <Card padded={false}>
            {cfg.pairs.map((id, i) => (
              <View key={id}>
                {i > 0 && <Divider inset={16} />}
                <ListRow title={names.entrantName(id)} subtitle={doubles ? names.rosterOf(id).map(names.nameOf).join(' / ') : undefined} chevron={false} right={highlight.includes(id) ? <Badge>Tú</Badge> : undefined} />
              </View>
            ))}
          </Card>
        )}
      </>
    );

  return (
    <View style={{ gap: 20 }}>
      <Head title={title} meta={meta} />
      {body}
    </View>
  );
}

// ---------- Noche de americano o mexicano ----------

type NightTab = 'canchas' | 'tabla' | 'rondas';

function NightView({ event }: { event: RacketEvent }) {
  const c = useColors();
  const { lid, myPlayerId } = useLeagueCtx();
  const names = useNames();
  const now = useNow().getTime();
  const q = useMatches({ lid, eventId: event.id });
  const matches = useWithPendingPoints(lid, q.data);
  const cfg = useMemo(() => parseNightConfig(event.config, event.type), [event.config, event.type]);
  const rounds = useMemo(() => nightRounds(cfg, matches, now), [cfg, matches, now]);
  const table = useMemo(() => nightTable(cfg, rounds), [cfg, rounds]);
  const [tab, setTab] = useState<NightTab>('canchas');
  const title = event.name || eventTypeInfo(event.type).label;
  const current = rounds.at(-1) ?? null;
  const finished = cfg.closed || (!!current && current.round >= cfg.rounds && current.done);
  const mine = current?.matches.find((m) => [...m.side1, ...m.side2].includes(myPlayerId ?? '')) ?? null;
  const resting = !!myPlayerId && !!current?.rests.includes(myPlayerId);
  const played = table.filter((r) => r.played > 0 || r.points > 0);
  const status = finished ? { text: 'Terminada' } : current ? { text: `Ronda ${current.round} de ${cfg.rounds}`, live: true } : { text: eventTypeInfo(cfg.format).label };

  const courts =
    q.loading && !matches.length ? (
      <Spinner label="Cargando las canchas" />
    ) : !current ? (
      <Empty icon={<LayoutGrid size={28} color={c.accent} />} title="Todavía no empieza" text="Cuando se arme la ronda 1, aquí sale tu cancha (y te llega un aviso)." />
    ) : (
      <RoundCard round={current} />
    );

  return (
    <View style={{ gap: 20 }}>
      <Head title={title} status={status} />
      {mine && !finished && current && <MyCourt match={mine.match} round={current.round} />}
      {resting && !finished && current && (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <LayoutGrid size={24} color={c.accent} />
          <Txt style={{ flex: 1 }}>
            <Txt variant="bodyStrong">Ronda {current.round}: descansas.</Txt> <Txt tone="fg2">Sumas lo que dicen las reglas de la noche.</Txt>
          </Txt>
        </Card>
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
      {tab === 'rondas' && (rounds.length ? rounds.slice().reverse().map((r) => <RoundCard key={r.round} round={r} />) : <Empty title="Todavía no hay rondas" />)}
      {/* Los premios de la noche, al final (se eligen y se entregan; no son de todos los días). */}
      <NightPrizes event={event} table={table} finished={finished} nameOf={names.nameOf} />
    </View>
  );
}

/** «Ronda 2: te toca», la cancha y contra quién; «Anotar en la cancha» (o «Ver resultado»). */
function MyCourt({ match, round }: { match: Match; round: number }) {
  const c = useColors();
  const { lid, myPlayerId } = useLeagueCtx();
  const names = useNames();
  const mySide = match.sides.find((s) => s.players.some((p) => p.playerId === myPlayerId));
  const mates = (mySide?.players ?? []).map((p) => p.playerId).filter((p) => p !== myPlayerId);
  const rival = match.sides.find((s) => s !== mySide);
  const open = match.status === 'scheduled' || match.status === 'live' || match.status === 'suspended';
  return (
    <Card style={{ gap: 6, backgroundColor: c.accentSoft }}>
      <Pressable onPress={() => router.push(matchRoute(lid, match.id))} style={{ gap: 6 }}>
        <Txt variant="meta" tone="accent" style={{ fontWeight: '600' }}>
          ● Ronda {round}: te toca
        </Txt>
        <Txt variant="cardTitle">{match.court || 'Cancha'}</Txt>
        <Txt variant="meta" tone="fg2">
          {mates.length ? `Con ${mates.map(names.nameOf).join(' y ')} ` : ''}contra <Txt variant="meta" style={{ fontWeight: '700' }}>{rival?.label ?? 'el rival'}</Txt>
        </Txt>
      </Pressable>
      {open ? (
        <Button variant="primary" size="xl" full onPress={() => router.push({ pathname: '/l/[lid]/partido/[matchId]/cancha', params: { lid, matchId: match.id } })}>
          Anotar en la cancha
        </Button>
      ) : (
        <Button size="lg" full onPress={() => router.push(matchRoute(lid, match.id))}>
          Ver resultado
        </Button>
      )}
    </Card>
  );
}

/** Una ronda: cada cancha con su partido y su marcador; tocarla abre el partido. */
function RoundCard({ round }: { round: NightRound }) {
  const { lid } = useLeagueCtx();
  const names = useNames();
  const pair = (ids: string[]) => ids.map(names.nameOf).join(' / ');
  return (
    <Card padded={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
        <Txt variant="bodyStrong">Ronda {round.round}</Txt>
        {!round.done && <Badge>En juego</Badge>}
      </View>
      {round.matches.map((m, i) => (
        <View key={m.id}>
          {i > 0 && <Divider inset={20} />}
          <Pressable onPress={() => router.push(matchRoute(lid, m.id))} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="small" tone="muted">
                {m.court || 'Cancha'}
              </Txt>
              <Txt numberOfLines={1}>{pair(m.side1)}</Txt>
              <Txt numberOfLines={1}>{pair(m.side2)}</Txt>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Txt style={{ fontSize: 17, fontWeight: '700' }}>{m.score1 ?? '–'}</Txt>
              <Txt style={{ fontSize: 17, fontWeight: '700' }}>{m.score2 ?? '–'}</Txt>
            </View>
          </Pressable>
        </View>
      ))}
    </Card>
  );
}

// ---------- Torneo ----------

type TourneyTab = 'grupos' | 'cuadro' | 'partidos';

function TourneyView({ event }: { event: RacketEvent }) {
  const c = useColors();
  const { lid, myPlayerId } = useLeagueCtx();
  const { sport, doubles } = useRacket();
  const names = useNames();
  const now = useNow().getTime();
  const q = useMatches({ lid, eventId: event.id });
  const matches = useWithPendingPoints(lid, q.data);
  const cfg = useMemo(() => parseTourneyConfig(event.config), [event.config]);
  const [catId, setCatId] = useState<string | null>(null);
  const cat = cfg.categories.find((x) => x.id === catId) ?? cfg.categories[0] ?? null;
  const hasGroups = !!cat?.groupsOf?.length;
  const [view, setView] = useState<TourneyTab | null>(null);
  const shown: TourneyTab = view ?? (hasGroups ? 'grupos' : 'cuadro');
  const tables = useMemo(() => (cat && hasGroups ? groupTables(sport, cat, matches, { scheme: cfg.points, now }) : []), [cat, hasGroups, sport, matches, cfg.points, now]);
  const bracket = useMemo(() => (cat ? categoryBracket(cat, matches, now) : null), [cat, matches, now]);
  const title = event.name || eventTypeInfo('torneo').label;
  const highlight = doubles ? names.teamsOf(myPlayerId) : myPlayerId ? [myPlayerId] : [];

  if (!cat) {
    return (
      <View style={{ gap: 20 }}>
        <Head title={title} />
        <Empty icon={<Trophy size={28} color={c.accent} />} title="Sin categorías" />
      </View>
    );
  }
  const catMatches = matches.filter((m) => m.stage.startsWith(`${cat.name} ·`));
  const options = [...(hasGroups ? [{ key: 'grupos' as TourneyTab, label: 'Grupos' }] : []), { key: 'cuadro' as TourneyTab, label: 'Cuadro' }, { key: 'partidos' as TourneyTab, label: 'Partidos' }];

  return (
    <View style={{ gap: 20 }}>
      <Head title={title} />
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
          {shown === 'cuadro' &&
            (bracket ? (
              Array.from({ length: bracket.rounds }, (_, i) => i + 1).map((r) => (
                <View key={r} style={{ gap: 10 }}>
                  <SectionHeader title={roundName(r, bracket.rounds)} />
                  <Card padded={false}>
                    {bracket.matches
                      .filter((bm) => bm.round === r && !bm.thirdPlace)
                      .map((bm, i) => {
                        const m = matchAt(cat, bm.key, matches);
                        const sideText = (id: string | null) => (id ? names.entrantName(id) : bm.bye ? 'Pase directo' : 'Por definir');
                        return (
                          <View key={bm.key}>
                            {i > 0 && <Divider inset={16} />}
                            <Pressable disabled={!m} onPress={() => m && router.push(matchRoute(lid, m.id))} style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 2 }}>
                              {[bm.side1, bm.side2].map((id, k) => (
                                <Txt key={k} numberOfLines={1} style={{ fontWeight: bm.winner && bm.winner === id ? '700' : '500', color: bm.winner && bm.winner !== id ? c.muted : c.fg }}>
                                  {sideText(id)}
                                </Txt>
                              ))}
                            </Pressable>
                          </View>
                        );
                      })}
                  </Card>
                </View>
              ))
            ) : (
              <Empty title="El cuadro todavía no está" />
            ))}
          {shown === 'partidos' && (catMatches.length ? <MatchList matches={catMatches} /> : <Empty title="Sin partidos todavía" />)}
        </>
      )}
      {/* Los premios del torneo, al final. */}
      <TourneyPrizes event={event} cfg={cfg} matches={matches} names={names} now={now} />
    </View>
  );
}
