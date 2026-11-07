/**
 * «Mi equipo» y la página de un jugador de las ligas de equipos en la app (BasketballProfile.tsx y FootballProfile.tsx
 * de la web, en Lite), con la lógica de la web (useBasketballSeason, useFootballSeason y
 * src/pages/sports/team/profileView.ts):
 * - TeamMyProfile (`/l/<liga>/perfil`): tu equipo y tu rol, si estás suspendido (fútbol), «Tu próximo partido» con tu
 *   convocatoria (y los suspendidos de tu equipo), tus números, la plantilla y los partidos que siguen.
 * - TeamPlayer (`/l/<liga>/j/<jugador>`, trae su barra «‹ Liga»): su nombre con su equipo, dorsal y posición, si está
 *   suspendido y sus números.
 * Los números: en Lite, los cuatro de siempre y los últimos partidos como filas; en Pro, todos (de 4 en 4) y la tabla
 * partido por partido (baloncesto: puntos, triples, tiros libres y faltas; fútbol: goles, asistencias y tarjetas).
 */
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { CalendarDays, ShieldAlert, UserRound } from 'lucide-react-native';
import type { Match } from '@mm/lib/data/matches';
import type { SeasonTeam } from '@mm/lib/data/seasonTeams';
import { useIsPro } from '@mm/lib/useMode';
import { useNow } from '@mm/lib/useNow';
import { BASKETBALL_POSITIONS, FOOTBALL_POSITIONS } from '@mm/components/players/positions';
import { basketballTeamRules } from '@mm/pages/sports/basketball/rules';
import { useBasketballSeason, type BasketballSeason } from '@mm/pages/sports/basketball/season';
import { REASON_TEXT, disciplineFrom, footballTeamRules, variantOf } from '@mm/pages/sports/football/rules';
import { suspendedIn, useFootballSeason, type FootballSeason } from '@mm/pages/sports/football/season';
import { upcomingFor, teamColor } from '@mm/pages/sports/team/logic';
import {
  ROLE,
  basketballGames,
  basketballProStatItems,
  basketballStatItems,
  basketballWhen,
  footballGames,
  footballProStatItems,
  footballScore,
  footballStatItems,
  footballWhen,
  rivalName,
  rosterLine,
} from '@mm/pages/sports/team/profileView';
import { rosterSubtitle } from '@mm/pages/sports/team/teamsAdmin';
import { useTeamLeague, type TeamLeague } from '@mm/pages/sports/team/useTeamLeague';
import { todayIn } from '@mm/pages/sports/team/view';
import { leagueSport } from '@mm/sports/registry';
import { BackBar, Card, Divider, Empty, ListRow, Loading, SectionHeader, Txt } from '../../ui';
import { CardIcon } from '../standings/parts';
import { Jersey, TeamCrest } from '../TeamBits';
import { MatchRows, StatTiles } from './MatchRows';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

const openPlayer = (lid: string, playerId: string) => router.push({ pathname: '/l/[lid]/j/[playerId]', params: { lid, playerId } });
const openMatch = (lid: string, matchId: string) => router.push({ pathname: '/l/[lid]/partido/[matchId]', params: { lid, matchId } });
const isBasketball = (tl: TeamLeague) => leagueSport(tl.league) === 'basketball';

/** Lo que «Mi equipo» toma de otras pantallas de la app (así no se repiten). */
export interface MyTeamSlots {
  /** «Tu próximo partido» con tu convocatoria en un toque (NextMatchCard del inicio). `alert`: la línea en rojo. */
  renderNext?: (match: Match, minPlayers: number, alert?: string) => ReactNode;
  /**
   * La plantilla que maneja el capitán o el delegado (RosterEditor de Organizar › Equipos: tocar un jugador, «Agregar
   * jugador»). Sin esto, la plantilla de solo mirar (tocar un jugador abre su página).
   */
  renderRoster?: (team: SeasonTeam, opts: { canRoles: boolean; readOnly: boolean; positions: readonly string[] }) => ReactNode;
}

/** La plantilla de solo mirar (RosterEditor con `readOnly`): dorsal, nombre, posición y rol; cada uno abre su página. */
function RosterList({ tl, team }: { tl: TeamLeague; team: SeasonTeam }) {
  const c = useColors();
  const color = teamColor(team);
  return (
    <Card padded={false}>
      {!team.roster.length && (
        <Txt variant="meta" tone="muted" style={{ paddingHorizontal: 20, paddingVertical: 16 }}>
          La plantilla está vacía.
        </Txt>
      )}
      {team.roster.map((r, i) => {
        const me = r.playerId === tl.myPlayerId;
        return (
          <View key={r.playerId} style={{ backgroundColor: me ? c.accentSoft : 'transparent' }}>
            {i > 0 && <Divider inset={68} />}
            <ListRow icon={<Jersey n={r.jersey} color={color} size="lg" />} title={tl.nameOf(r.playerId)} subtitle={rosterSubtitle(r) || null} onPress={() => openPlayer(tl.lid, r.playerId)} />
          </View>
        );
      })}
    </Card>
  );
}

// ---------- Mi equipo ----------

export function TeamMyProfile(slots: MyTeamSlots = {}) {
  const tl = useTeamLeague();
  return isBasketball(tl) ? <BasketballMine tl={tl} slots={slots} /> : <FootballMine tl={tl} slots={slots} />;
}

function NoPlayer() {
  const c = useColors();
  return (
    <View style={{ gap: 20 }}>
      <Txt variant="title" accessibilityRole="header">
        Mi equipo
      </Txt>
      <Empty
        icon={<UserRound size={28} color={c.accent} />}
        title="Todavía no tienes jugador en esta liga"
        text="Únete a la liga (o pide al admin que te vincule con tu nombre) para ver tu equipo y tus números."
      />
    </View>
  );
}

/** Lo de «Mi equipo» que es igual en los dos deportes (título, sin equipo, próximo, números, plantilla y después). */
function MineFrame({
  tl,
  slots,
  minPlayers,
  positions,
  banner,
  nextAlert,
  stats,
}: {
  tl: TeamLeague;
  slots: MyTeamSlots;
  minPlayers: number;
  positions: readonly string[];
  banner?: ReactNode;
  nextAlert?: (next: Match) => string | undefined;
  stats: ReactNode;
}) {
  const now = useNow(60_000).getTime();
  const upcoming = upcomingFor(
    tl.matches.data,
    tl.myTeams.map((x) => x.team.id),
    now,
  ).slice(0, 3);
  const [next, ...later] = upcoming;
  const first = tl.myTeams[0];
  const mine = first?.team.roster.find((r) => r.playerId === tl.myPlayerId);
  const sub = first ? (mine ? rosterLine(mine) : ROLE[first.role]) || 'Jugador' : null;
  const showNext = !!next && (next.status === 'scheduled' || next.status === 'postponed');
  return (
    <View style={{ gap: 30 }}>
      <View style={{ gap: 6 }}>
        <Txt variant="title" accessibilityRole="header">
          {first ? first.team.name : 'Mi equipo'}
        </Txt>
        {!!sub && (
          <Txt variant="meta" tone="muted">
            {sub}
          </Txt>
        )}
      </View>
      {banner}
      {!tl.myTeams.length && (
        <Card style={{ gap: 2 }}>
          <Txt variant="bodyStrong">Todavía no estás en un equipo</Txt>
          <Txt variant="meta" tone="muted">
            El admin o el capitán de tu equipo te agrega a la plantilla.
          </Txt>
        </Card>
      )}
      {showNext && slots.renderNext?.(next, minPlayers, nextAlert?.(next))}
      {stats}
      {tl.myTeams.map(({ team, role }) => (
        <View key={team.id} accessibilityLabel={`Plantilla de ${team.name}`} style={{ gap: 10 }}>
          <SectionHeader
            title={tl.myTeams.length > 1 ? team.name : 'Plantilla'}
            action={
              <Txt variant="meta" tone="muted">
                {`${team.roster.length} ${team.roster.length === 1 ? 'jugador' : 'jugadores'}`}
              </Txt>
            }
          />
          {slots.renderRoster ? slots.renderRoster(team, { canRoles: tl.isAdmin, readOnly: role === 'player' && !tl.isAdmin, positions }) : <RosterList tl={tl} team={team} />}
        </View>
      ))}
      {later.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionHeader title="Después" />
          <MatchRows tl={tl} matches={later} now={now} highlight={false} />
        </View>
      )}
    </View>
  );
}

function BasketballMine({ tl, slots }: { tl: TeamLeague; slots: MyTeamSlots }) {
  const season = useBasketballSeason(tl);
  if (!tl.myPlayerId) return <NoPlayer />;
  const rules = basketballTeamRules(tl.rules.data);
  return (
    <MineFrame
      tl={tl}
      slots={slots}
      minPlayers={rules.minPlayers}
      positions={BASKETBALL_POSITIONS}
      stats={<BasketballStats tl={tl} playerId={tl.myPlayerId} season={season} title="Mis números" />}
    />
  );
}

function FootballMine({ tl, slots }: { tl: TeamLeague; slots: MyTeamSlots }) {
  const season = useFootballSeason(tl);
  if (!tl.myPlayerId) return <NoPlayer />;
  const me = tl.myPlayerId;
  const variant = variantOf(tl.league.sport);
  const rules = footballTeamRules(tl.rules.data, variant);
  const discipline = disciplineFrom(tl.rules.data);
  const myTeamIds = tl.myTeams.map((x) => x.team.id);
  // Los suspendidos de tu equipo para el próximo partido (tú sales arriba, en rojo).
  const nextAlert = (next: Match) => {
    const teamSusp = suspendedIn(season.disciplineMatches, next.id, discipline, season.adjustments).filter((s) => myTeamIds.includes(s.team) && s.player !== me);
    return teamSusp.length ? `Suspendidos: ${teamSusp.map((s) => tl.nameOf(s.player)).join(', ')}` : undefined;
  };
  return (
    <MineFrame
      tl={tl}
      slots={slots}
      minPlayers={rules.minPlayers}
      positions={FOOTBALL_POSITIONS}
      banner={<SuspensionBanner tl={tl} playerId={me} season={season} mine />}
      nextAlert={nextAlert}
      stats={<FootballStats tl={tl} playerId={me} season={season} title="Mis números" />}
    />
  );
}

// ---------- Un jugador ----------

export function TeamPlayer({ playerId }: { playerId: string }) {
  const tl = useTeamLeague();
  return isBasketball(tl) ? <BasketballPlayer tl={tl} playerId={playerId} /> : <FootballPlayer tl={tl} playerId={playerId} />;
}

/**
 * «‹ Liga» (vuelve a donde estaba o, si se entró por un link, a la Tabla), su nombre con su equipo, dorsal y posición
 * (lo de arriba de la página del jugador).
 */
function PlayerHead({ tl, playerId, children }: { tl: TeamLeague; playerId: string; children: ReactNode }) {
  const player = tl.players.data.find((p) => p.id === playerId);
  const bar = <BackBar label={tl.league.name} fallback={`/l/${tl.lid}/tabla`} />;
  if (!player)
    return tl.players.loading ? (
      <Loading label="Cargando el jugador" />
    ) : (
      <View style={{ gap: 16 }}>
        {bar}
        <Empty title="Este jugador ya no está en la liga" />
      </View>
    );
  const teams = tl.teams.data.filter((t) => t.roster.some((r) => r.playerId === playerId));
  return (
    <View style={{ gap: 26 }}>
      {bar}
      <View style={{ gap: 8, marginTop: -16 }}>
        <Txt variant="title" accessibilityRole="header">
          {player.name}
        </Txt>
        {teams.map((t) => {
          const r = t.roster.find((x) => x.playerId === playerId)!;
          const line = rosterLine(r);
          return (
            <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <TeamCrest team={t} size={24} />
              <Txt variant="meta" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                <Txt variant="meta" tone="fg2" style={{ fontFamily: font.semibold }}>
                  {t.name}
                </Txt>
                {line ? ` · ${line}` : ''}
              </Txt>
            </View>
          );
        })}
      </View>
      {children}
    </View>
  );
}

function BasketballPlayer({ tl, playerId }: { tl: TeamLeague; playerId: string }) {
  const season = useBasketballSeason(tl);
  return (
    <PlayerHead tl={tl} playerId={playerId}>
      <BasketballStats tl={tl} playerId={playerId} season={season} title="Temporada" />
    </PlayerHead>
  );
}

function FootballPlayer({ tl, playerId }: { tl: TeamLeague; playerId: string }) {
  const season = useFootballSeason(tl);
  return (
    <PlayerHead tl={tl} playerId={playerId}>
      <SuspensionBanner tl={tl} playerId={playerId} season={season} />
      <FootballStats tl={tl} playerId={playerId} season={season} title="Temporada" />
    </PlayerHead>
  );
}

/** «Suspendido para el próximo partido» (de la disciplina de la temporada), en rojo suave. */
function SuspensionBanner({ tl, playerId, season, mine }: { tl: TeamLeague; playerId: string; season: FootballSeason; mine?: boolean }) {
  const c = useColors();
  const list = season.suspendedNext.filter((s) => s.player === playerId);
  if (!list.length) return null;
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 14, backgroundColor: c.dangerSoft }}>
      <ShieldAlert size={20} color={c.danger} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt tone="danger" style={{ fontSize: 14, fontFamily: font.semibold }}>
          {mine ? 'Estás suspendido para el próximo partido' : 'Suspendido para el próximo partido'}
        </Txt>
        {list.map((s) => (
          <Txt key={s.team} tone="danger" style={{ fontSize: 14 }}>
            {`${tl.teamOf(s.team)?.name ?? 'Su equipo'}: ${REASON_TEXT[s.reason] ?? s.reason}${s.remaining > 1 ? ` · le faltan ${s.remaining} partidos` : ''}.`}
          </Txt>
        ))}
      </View>
    </View>
  );
}

// ---------- Los números ----------

/** El título de los números con su puesto en la lista («#2 en anotadores»). */
function StatsHead({ title, rank, rankWord }: { title: string; rank: number | null; rankWord: string }) {
  return (
    <SectionHeader
      title={title}
      action={
        rank ? (
          <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }}>
            {`#${rank} en ${rankWord}`}
          </Txt>
        ) : undefined
      }
    />
  );
}

/** El ancho de cada columna de números de la tabla de Pro. */
const CELL = 38;

/**
 * La tabla partido por partido de Pro (la `<table>` de la web): «Partido» y las columnas de números a la derecha; cada
 * partido con «vs. Rival», cuándo debajo y sus números. Tocar uno abre el partido.
 */
function GamesTable({
  heads,
  rows,
}: {
  heads: readonly string[];
  rows: readonly { key: string; title: ReactNode; sub: string; cells: readonly ReactNode[]; label: string; onPress: () => void }[];
}) {
  const c = useColors();
  const th = { fontSize: 11, fontFamily: font.bold, letterSpacing: 0.55, textTransform: 'uppercase' as const, color: c.muted };
  return (
    <Card padded={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
        <Txt style={[th, { flex: 1 }]}>Partido</Txt>
        {heads.map((h) => (
          <Txt key={h} style={[th, { width: CELL, textAlign: 'right' }]}>
            {h}
          </Txt>
        ))}
      </View>
      {rows.map((r) => (
        <Pressable
          key={r.key}
          accessibilityRole="button"
          accessibilityLabel={r.label}
          onPress={r.onPress}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderTopWidth: 1,
            borderTopColor: c.line,
            backgroundColor: pressed ? c.surface2 : 'transparent',
          })}
        >
          <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
            {r.title}
            <Txt tone="muted" numberOfLines={1} style={{ fontSize: 13 }}>
              {r.sub}
            </Txt>
          </View>
          {r.cells.map((cell, i) => (
            <View key={heads[i]} style={{ width: CELL, alignItems: 'flex-end' }}>
              {cell}
            </View>
          ))}
        </Pressable>
      ))}
    </Card>
  );
}

/** Un número de la tabla de Pro: el primero en grande; los demás, apagados (o en rojo y negrita con `danger`). */
function Num({ v, big, danger }: { v: string | number; big?: boolean; danger?: boolean }) {
  return (
    <Txt tone={danger ? 'danger' : big ? 'fg' : 'muted'} style={{ fontSize: big ? 17 : 15, fontFamily: big || danger ? font.bold : font.regular, fontVariant: ['tabular-nums'] }}>
      {String(v)}
    </Txt>
  );
}

/**
 * Los números del baloncesto: en Lite, partidos, puntos, por partido y máximo, y los últimos 5 partidos con sus puntos;
 * en Pro, también triples, tiros libres y faltas, y la tabla de todos los partidos (PTS, 3P, TL y F; 5 faltas en rojo).
 */
function BasketballStats({ tl, playerId, season, title }: { tl: TeamLeague; playerId: string; season: BasketballSeason; title: string }) {
  const c = useColors();
  const pro = useIsPro();
  const now = useNow(60_000).getTime();
  const totals = season.leaders.find((l) => l.player === playerId);
  const games = basketballGames(season, tl.matches.data, playerId);
  const rank = totals ? season.leaders.indexOf(totals) + 1 : null;
  const today = todayIn(tl.tz, now);
  const rival = (g: (typeof games)[number]) => rivalName(g.m, g.l.side, (id) => tl.teamOf(id)?.name);
  return (
    <View style={{ gap: 10 }}>
      <StatsHead title={title} rank={rank} rankWord="anotadores" />
      {!totals ? (
        <Empty icon={<CalendarDays size={28} color={c.accent} />} title="Todavía sin partidos" text="Salen de los partidos confirmados donde la mesa marcó los presentes." />
      ) : (
        <View style={{ gap: 14 }}>
          <StatTiles dense={pro} items={pro ? basketballProStatItems(totals) : basketballStatItems(totals)} />
          {pro ? (
            <GamesTable
              heads={['PTS', '3P', 'TL', 'F']}
              rows={games.map((g) => ({
                key: g.l.matchId,
                title: (
                  <Txt numberOfLines={1} style={{ fontSize: 15, fontFamily: font.semibold }}>
                    {`vs. ${rival(g)}`}
                  </Txt>
                ),
                sub: basketballWhen(g.m, tl.tz, today),
                cells: [<Num key="pts" v={g.l.points} big />, <Num key="3p" v={g.l.threes} />, <Num key="tl" v={g.l.ones} />, <Num key="f" v={g.l.fouls} danger={g.l.fouls >= 5} />],
                label: `vs. ${rival(g)}: ${g.l.points} puntos, ${g.l.threes} triples, ${g.l.ones} tiros libres, ${g.l.fouls} faltas`,
                onPress: () => openMatch(tl.lid, g.m.id),
              }))}
            />
          ) : (
            <Card padded={false}>
              {games.slice(0, 5).map((g, i) => (
                <View key={g.l.matchId}>
                  {i > 0 && <Divider inset={16} />}
                  <ListRow
                    title={`vs. ${rival(g)}`}
                    subtitle={basketballWhen(g.m, tl.tz, today)}
                    right={<Txt style={{ fontSize: 19, fontFamily: font.bold }}>{g.l.points}</Txt>}
                    chevron={false}
                    accessibilityLabel={`vs. ${rival(g)}: ${g.l.points} puntos`}
                    onPress={() => openMatch(tl.lid, g.m.id)}
                  />
                </View>
              ))}
            </Card>
          )}
        </View>
      )}
    </View>
  );
}

/** Las tarjetas de un partido (la doble amarilla, amarilla sobre roja). */
function Cards({ yellows, red }: { yellows: number; red: 'direct' | 'second_yellow' | null }) {
  if (red === 'second_yellow') return <CardIcon kind="second_yellow" />;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      {Array.from({ length: yellows }, (_, k) => (
        <CardIcon key={k} kind="yellow" />
      ))}
      {red === 'direct' && <CardIcon kind="red" />}
    </View>
  );
}

/**
 * Los números del fútbol: en Lite, los cuatro de siempre y los últimos 5 partidos con sus goles y tarjetas; en Pro, todos
 * (amarillas, rojas y, si atajó, vallas invictas y recibidos) y la tabla de todos los partidos (G, A y T).
 */
function FootballStats({ tl, playerId, season, title }: { tl: TeamLeague; playerId: string; season: FootballSeason; title: string }) {
  const c = useColors();
  const pro = useIsPro();
  const now = useNow(60_000).getTime();
  const totals = season.scorers.find((l) => l.player === playerId);
  const cards = season.cards.find((x) => x.player === playerId);
  const games = footballGames(season, tl.matches.data, playerId);
  const rank = totals && totals.goals > 0 ? season.scorers.indexOf(totals) + 1 : null;
  const today = todayIn(tl.tz, now);
  const rival = (g: (typeof games)[number]) => rivalName(g.m, g.l.side, (id) => tl.teamOf(id)?.name);
  return (
    <View style={{ gap: 10 }}>
      <StatsHead title={title} rank={rank} rankWord="goleadores" />
      {!totals && !games.length ? (
        <Empty icon={<CalendarDays size={28} color={c.accent} />} title="Todavía sin partidos" text="Salen de los partidos confirmados donde el anotador marcó la alineación." />
      ) : (
        <View style={{ gap: 14 }}>
          <StatTiles dense={pro} items={pro ? footballProStatItems(totals, cards) : footballStatItems(totals, cards)} />
          {pro ? (
            <GamesTable
              heads={['G', 'A', 'T']}
              rows={games.map((g) => {
                const score = footballScore(g);
                return {
                  key: g.l.matchId,
                  title: (
                    <Txt numberOfLines={1} style={{ fontSize: 15, fontFamily: font.semibold }}>
                      {`vs. ${rival(g)}`}
                      {!!score && <Txt tone="muted" style={{ fontSize: 15 }}>{` ${score}`}</Txt>}
                    </Txt>
                  ),
                  sub: footballWhen(g, tl.tz, today),
                  cells: [<Num key="g" v={g.l.goals || ''} big />, <Num key="a" v={g.l.assists || ''} />, <Cards key="t" yellows={g.l.yellows} red={g.l.red} />],
                  label: `vs. ${rival(g)}: ${g.l.goals} ${g.l.goals === 1 ? 'gol' : 'goles'}, ${g.l.assists} ${g.l.assists === 1 ? 'asistencia' : 'asistencias'}`,
                  onPress: () => openMatch(tl.lid, g.m.id),
                };
              })}
            />
          ) : (
            <Card padded={false}>
              {games.slice(0, 5).map((g, i) => {
                const score = footballScore(g);
                return (
                  <View key={g.l.matchId}>
                    {i > 0 && <Divider inset={16} />}
                    <ListRow
                      title={`vs. ${rival(g)}${score ? ` · ${score}` : ''}`}
                      subtitle={footballWhen(g, tl.tz, today)}
                      right={
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          {(g.l.yellows > 0 || !!g.l.red) && <Cards yellows={g.l.yellows} red={g.l.red} />}
                          {g.l.goals > 0 && <Txt style={{ fontSize: 19, fontFamily: font.bold }}>{g.l.goals}</Txt>}
                        </View>
                      }
                      chevron={false}
                      accessibilityLabel={`vs. ${rival(g)}: ${g.l.goals} ${g.l.goals === 1 ? 'gol' : 'goles'}`}
                      onPress={() => openMatch(tl.lid, g.m.id)}
                    />
                  </View>
                );
              })}
            </Card>
          )}
        </View>
      )}
    </View>
  );
}
