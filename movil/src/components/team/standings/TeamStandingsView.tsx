/**
 * La Tabla de las ligas de equipos en la app (BasketballStandings.tsx y FootballStandings.tsx de la web, en Lite), con
 * la lógica de la web (useBasketballSeason, useFootballSeason, standingsView.ts de cada deporte y leaders.ts):
 * - el título «Tabla» y la temporada (elegirla; una cerrada muestra sus premios y la tabla que se guardó al cerrarla);
 * - baloncesto: Tabla | Anotadores (`?ver=anotadores`), la regla en una línea y «Cómo se cuenta»;
 * - fútbol y sala: Tabla | Jugadores | Disciplina (`?ver=`); en Tabla, la fase final del relámpago y los grupos; en
 *   Jugadores, «Goleadores ▾» elige goleadores, tarjetas o vallas invictas; en Disciplina, los suspendidos para la
 *   próxima jornada, quien jugó estando suspendido, los que están a una amarilla y las sanciones de la temporada.
 * Lo de Pro (Excel, compartir la imagen, las columnas para ordenar) no va: la app es Lite.
 */
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { AlertTriangle, ShieldAlert } from 'lucide-react-native';
import type { Match } from '@mm/lib/data/matches';
import { defaultColumns } from '@mm/components/match/standings';
import { SCORER_COLUMNS as BB_SCORERS, basketballRuleLine, basketballRuleText, basketballView, scorerLine as bbScorerLine, type BasketballView } from '@mm/pages/sports/basketball/standingsView';
import { basketballTableFrom } from '@mm/pages/sports/basketball/rules';
import { useBasketballSeason } from '@mm/pages/sports/basketball/season';
import { REASON_TEXT, describeDiscipline, disciplineFrom, footballTableFrom } from '@mm/pages/sports/football/rules';
import { useFootballSeason, type FootballSeason } from '@mm/pages/sports/football/season';
import {
  CARD_COLUMNS,
  EMPTY_TEXT,
  KEEPER_COLUMNS,
  PLAYER_VIEWS,
  SCORER_COLUMNS,
  TABLE_COLUMNS,
  cardLine,
  disciplineMatchText,
  footballRuleLine,
  footballRuleText,
  footballSegment,
  footballTab,
  keeperLine,
  knockoutMatches,
  nearSuspension,
  scorerLine,
  scorerRows,
  sortedSanctions,
  type FootballSegment,
  type FootballTab,
} from '@mm/pages/sports/football/standingsView';
import { sideNames } from '@mm/pages/sports/team/lists';
import { rosterSide } from '@mm/pages/sports/team/logic';
import { useTeamLeague, type TeamLeague } from '@mm/pages/sports/team/useTeamLeague';
import { leagueSport } from '@mm/sports/registry';
import { MatchCard } from '../../match/MatchCard';
import { StandingsTable } from '../../match/StandingsTable';
import { Card, Divider, ListRow, LoadError, Loading, RowIcon, Segmented, SectionHeader, Txt } from '../../ui';
import { TeamCrest } from '../TeamBits';
import { CardIcon, ClosedSeasonView, HowItCounts, LeadersList, PillPick, SeasonBar, useSeasonPick, type SeasonPick } from './parts';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

const openPlayer = (lid: string, playerId: string) => router.push({ pathname: '/l/[lid]/j/[playerId]', params: { lid, playerId } });
const openMatch = (lid: string, matchId: string) => router.push({ pathname: '/l/[lid]/partido/[matchId]', params: { lid, matchId } });

/** La Tabla de la liga de equipos. `ver`: lo que pide la dirección (`?ver=`); `temporada`: la temporada (`?temporada=`). */
export function TeamStandingsView({ ver, temporada }: { ver?: string | null; temporada?: string | null }) {
  const tl = useTeamLeague();
  const pick = useSeasonPick(temporada);
  return leagueSport(tl.league) === 'basketball' ? <BasketballTable tl={tl} pick={pick} ver={ver} /> : <FootballTable tl={tl} pick={pick} ver={ver} />;
}

/** Mis equipos de esa temporada (y yo): salen resaltados en la tabla guardada. */
const mineThen = (tl: TeamLeague) => [...tl.allTeams.data.filter((t) => t.roster.some((r) => r.playerId === tl.myPlayerId)).map((t) => t.id), ...(tl.myPlayerId ? [tl.myPlayerId] : [])];

/** Lo de arriba (el título y la temporada) y, si la temporada está cerrada con su tabla, esa tabla. */
function Frame({ tl, pick, children }: { tl: TeamLeague; pick: SeasonPick; children: ReactNode }) {
  // Sin las temporadas no se sabe qué partidos son de cuál: nada de una tabla con todas mezcladas.
  if (pick.error) return <LoadError error={pick.error} />;
  if (pick.loading) return <Loading label="Cargando la tabla" />;
  return (
    <View style={{ gap: 16 }}>
      <Txt variant="title" accessibilityRole="header">
        Tabla
      </Txt>
      <SeasonBar pick={pick} />
      {pick.closed ? <ClosedSeasonView season={pick.closed} highlight={mineThen(tl)} /> : children}
    </View>
  );
}

const teamName = (tl: TeamLeague) => (id: string) => tl.teamOf(id)?.name ?? '(equipo borrado)';

// ---------- Baloncesto ----------

function BasketballTable({ tl, pick, ver }: { tl: TeamLeague; pick: SeasonPick; ver?: string | null }) {
  const season = useBasketballSeason(tl, pick.selected ?? tl.season);
  const [view, setView] = useState<BasketballView>(basketballView(ver));
  const table = basketballTableFrom(tl.rules.data);
  const mine = tl.myTeams.map((x) => x.team.id);
  return (
    <Frame tl={tl} pick={pick}>
      <Segmented<BasketballView>
        label="Qué ver"
        value={view}
        onChange={setView}
        options={[
          { key: 'tabla', label: 'Tabla' },
          { key: 'anotadores', label: 'Anotadores' },
        ]}
      />
      {view === 'tabla' ? (
        <View style={{ gap: 12 }}>
          <StandingsTable
            rows={season.standings}
            nameOf={teamName(tl)}
            columns={defaultColumns({ forLabel: 'PF', againstLabel: 'PC' })}
            highlight={mine}
            empty="Cuando haya partidos confirmados, la tabla sale aquí."
          />
          <HowItCounts line={basketballRuleLine(table)} paragraphs={basketballRuleText(table)} />
        </View>
      ) : (
        <LeadersList
          rows={season.leaders}
          columns={BB_SCORERS}
          nameOf={tl.nameOf}
          teamOf={(key) => tl.teamOf(key)?.name ?? ''}
          onOpen={(id) => openPlayer(tl.lid, id)}
          highlight={tl.myPlayerId}
          line={bbScorerLine}
        />
      )}
    </Frame>
  );
}

// ---------- Fútbol y sala ----------

function FootballTable({ tl, pick, ver }: { tl: TeamLeague; pick: SeasonPick; ver?: string | null }) {
  const season = useFootballSeason(tl, pick.selected ?? tl.season);
  const [tab, setTab] = useState<FootballTab>(footballTab(ver));
  const segment = footballSegment(tab);
  const suspended = season.suspendedNext.length;
  const leaders = { nameOf: tl.nameOf, teamOf: (key: string) => tl.teamOf(key)?.name ?? '', onOpen: (id: string) => openPlayer(tl.lid, id), highlight: tl.myPlayerId };
  return (
    <Frame tl={tl} pick={pick}>
      <Segmented<FootballSegment>
        label="Qué ver"
        value={segment}
        onChange={(k) => setTab(k === 'jugadores' ? 'goleadores' : k)}
        options={[
          { key: 'tabla', label: 'Tabla' },
          { key: 'jugadores', label: 'Jugadores' },
          // El número de suspendidos, como la bolita roja de la web.
          { key: 'disciplina', label: suspended > 0 ? `Disciplina · ${suspended}` : 'Disciplina' },
        ]}
      />
      {segment === 'jugadores' && <PillPick label="Qué números ver" options={PLAYER_VIEWS} value={tab} onChange={setTab} />}
      {tab === 'tabla' && <TableTab tl={tl} season={season} />}
      {tab === 'goleadores' && <LeadersList {...leaders} rows={scorerRows(season)} columns={SCORER_COLUMNS} line={scorerLine} empty={EMPTY_TEXT.goleadores} />}
      {tab === 'tarjetas' && <LeadersList {...leaders} rows={season.cards} columns={CARD_COLUMNS} line={cardLine} empty={EMPTY_TEXT.tarjetas} />}
      {tab === 'vallas' && <LeadersList {...leaders} rows={season.keepers} columns={KEEPER_COLUMNS} line={keeperLine} empty={EMPTY_TEXT.vallas} />}
      {tab === 'disciplina' && <DisciplineTab tl={tl} season={season} />}
    </Frame>
  );
}

/** Un partido de la fase final con los nombres de ahora de los equipos. */
function KnockoutCard({ tl, match: m }: { tl: TeamLeague; match: Match }) {
  const names = sideNames(tl, m);
  const shown: Match = { ...m, sides: [{ ...m.sides[0], label: names[0] }, { ...m.sides[1], label: names[1] }] as Match['sides'] };
  return <MatchCard match={shown} mySide={rosterSide(m, tl.allTeams.data, tl.myPlayerId)} tz={tl.tz} roundWord="Jornada" onPress={() => openMatch(tl.lid, m.id)} />;
}

function TableTab({ tl, season }: { tl: TeamLeague; season: FootballSeason }) {
  const table = footballTableFrom(tl.rules.data);
  const mine = tl.myTeams.map((x) => x.team.id);
  // El cuadro del torneo relámpago de la temporada (los juegos del playoff tienen su pantalla).
  const knockout = knockoutMatches(season);
  return (
    <View style={{ gap: 12 }}>
      {knockout.length > 0 && (
        <View style={{ gap: 10, marginBottom: 12 }}>
          <SectionHeader title="Fase final" />
          {knockout.map((m) => (
            <KnockoutCard key={m.id} tl={tl} match={m} />
          ))}
        </View>
      )}
      {season.groups.length > 0 ? (
        season.groups.map((g) => (
          <View key={g.stage} style={{ gap: 10, marginBottom: 12 }}>
            <SectionHeader title={g.stage} />
            <StandingsTable rows={g.rows} nameOf={teamName(tl)} columns={TABLE_COLUMNS} highlight={mine} empty="Sin partidos confirmados en este grupo." />
          </View>
        ))
      ) : (
        <StandingsTable rows={season.standings} nameOf={teamName(tl)} columns={TABLE_COLUMNS} highlight={mine} empty="Cuando haya partidos confirmados, la tabla sale aquí." />
      )}
      <HowItCounts line={footballRuleLine(table)} paragraphs={footballRuleText(table)} />
    </View>
  );
}

/** Suspendidos, amarillas que van para la próxima suspensión, sanciones y quien jugó suspendido. */
function DisciplineTab({ tl, season }: { tl: TeamLeague; season: FootballSeason }) {
  const c = useColors();
  const cfg = disciplineFrom(tl.rules.data);
  const matchText = disciplineMatchText(season.matches, (id) => tl.teamOf(id)?.name);
  const close = nearSuspension(season.discipline, cfg);
  const sanctions = sortedSanctions(season.discipline);
  return (
    <View style={{ gap: 30 }}>
      <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4 }}>
        {`${describeDiscipline(cfg)}. La app avisa; el admin decide.`}
      </Txt>
      {season.suspendedNext.length ? (
        <SuspendedCard tl={tl} season={season} link={false} />
      ) : (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <RowIcon>
            <ShieldAlert size={20} color={c.accent} />
          </RowIcon>
          <Txt variant="bodyStrong" style={{ flex: 1 }}>
            Nadie suspendido para la próxima jornada
          </Txt>
        </Card>
      )}

      {season.discipline.violations.length > 0 && (
        <View style={{ gap: 10 }}>
          <Txt variant="section" tone="danger" accessibilityRole="header" style={{ marginTop: 8 }}>
            Jugaron estando suspendidos
          </Txt>
          <Card padded={false}>
            {season.discipline.violations.map((v, i) => (
              <View key={i}>
                {i > 0 && <Divider inset={68} />}
                <ListRow
                  icon={
                    <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.dangerSoft }}>
                      <AlertTriangle size={20} color={c.danger} />
                    </View>
                  }
                  title={tl.nameOf(v.player)}
                  subtitle={matchText(v.matchId)}
                  onPress={() => openMatch(tl.lid, v.matchId)}
                />
              </View>
            ))}
          </Card>
        </View>
      )}

      {close.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionHeader title="A una amarilla de la suspensión" />
          <Card padded={false}>
            {close.map((y, i) => (
              <View key={`${y.team}:${y.player}`}>
                {i > 0 && <Divider inset={68} />}
                <ListRow
                  icon={
                    <RowIcon>
                      <CardIcon kind="yellow" />
                    </RowIcon>
                  }
                  title={tl.nameOf(y.player)}
                  subtitle={tl.teamOf(y.team)?.name ?? 'Su equipo'}
                  right={<Txt style={{ fontSize: 17, fontFamily: font.bold }}>{`${y.pending}/${cfg.yellowsForSuspension}`}</Txt>}
                  chevron={false}
                  onPress={() => openPlayer(tl.lid, y.player)}
                />
              </View>
            ))}
          </Card>
        </View>
      )}

      <View style={{ gap: 10 }}>
        <SectionHeader title="Sanciones de la temporada" />
        {!sanctions.length ? (
          <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4 }}>
            Todavía no hay sanciones.
          </Txt>
        ) : (
          <Card padded={false}>
            {sanctions.map((s, i) => (
              <View key={i}>
                {i > 0 && <Divider inset={16} />}
                <ListRow
                  title={tl.nameOf(s.player)}
                  subtitle={`${REASON_TEXT[s.reason] ?? s.reason} · ${matchText(s.matchId)}${s.note ? ` · ${s.note}` : ''}`}
                  right={
                    s.remaining > 0 ? (
                      <Txt tone="danger" style={{ fontSize: 14, fontFamily: font.semibold }}>{`${s.remaining} de ${s.matches}`}</Txt>
                    ) : (
                      <Txt tone="muted" style={{ fontSize: 14 }}>
                        Cumplida
                      </Txt>
                    )
                  }
                  onPress={() => openPlayer(tl.lid, s.player)}
                />
              </View>
            ))}
          </Card>
        )}
      </View>
    </View>
  );
}

/**
 * «Suspendidos · Disciplina» (SuspendedCard de FootballHome.tsx en la web): cada uno como fila con su equipo y por qué
 * (la app avisa; el admin decide). `link`: «Disciplina» lleva a esa parte de la Tabla. Sin suspendidos, no sale.
 */
export function SuspendedCard({ tl, season, link = true }: { tl: TeamLeague; season: FootballSeason; link?: boolean }) {
  const c = useColors();
  if (!season.suspendedNext.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader
        title="Suspendidos"
        action={
          link ? (
            <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }} onPress={() => router.push({ pathname: '/l/[lid]/tabla', params: { lid: tl.lid, ver: 'disciplina' } })}>
              Disciplina
            </Txt>
          ) : undefined
        }
      />
      <Card padded={false}>
        {season.suspendedNext.map((s, i) => {
          const team = tl.teamOf(s.team);
          return (
            <View key={`${s.team}:${s.player}`}>
              {i > 0 && <Divider inset={68} />}
              <ListRow
                icon={<TeamCrest team={team} label="Equipo" />}
                title={tl.nameOf(s.player)}
                subtitle={`${team?.name ?? 'Su equipo'} · ${REASON_TEXT[s.reason] ?? s.reason}`}
                right={
                  s.remaining > 1 ? (
                    <Txt tone="danger" style={{ fontSize: 14, fontFamily: font.semibold }}>{`${s.remaining} partidos`}</Txt>
                  ) : (
                    <Txt style={{ fontSize: 14, color: c.muted }}>1 partido</Txt>
                  )
                }
                onPress={() => openPlayer(tl.lid, s.player)}
              />
            </View>
          );
        })}
      </Card>
    </View>
  );
}
