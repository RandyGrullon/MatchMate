/**
 * Los playoffs de la temporada en la app (`/l/<liga>/playoffs`; PlayoffsPage.tsx, BasketballPlayoffs.tsx,
 * FootballPlayoffs.tsx y PlayoffPrizes de TeamPrizes.tsx en la web), con la lógica de la web (src/lib/data/playoffs.ts,
 * src/pages/sports/team/playoffs.ts, src/prizes/sports.ts y src/lib/report/team.ts):
 * - «‹ Liga» con «•••» (Reporte del playoff para todos; Anotadores y Borrar playoffs para el admin), el nombre del
 *   playoff, la temporada, el campeón, los premios del playoff, la llave con las victorias de cada serie y cada serie
 *   como tarjeta con su próximo juego y los ya jugados;
 * - sin playoff, el admin lo arma con los primeros de la tabla de la temporada (o los que elija, en el orden que quiera)
 *   y al mejor de cuántos va cada ronda; los demás ven «Sin playoffs en esta temporada».
 * Al abrir la llave se pone al día lo que pasó sin escritura (syncPlayoffs), como en la web.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowDown, ArrowUp, ClipboardPen, FileDown, MoreHorizontal, Plus, Trash2, Trophy, X } from 'lucide-react-native';
import { createPlayoffs, deletePlayoffs, syncPlayoffs, usePlayoffs, type Playoff, type PlayoffSeries } from '@mm/lib/data/playoffs';
import { saveErrorMessage } from '@mm/lib/errorText';
import { useNow } from '@mm/lib/useNow';
import type { Season } from '@mm/lib/seasons';
import { playoffComp, playoffDate, playoffProvider } from '@mm/prizes/sports';
import { playoffReport } from '@mm/lib/report/team';
import { PLAYOFF_WAIT_TEXT, teamNamesOf, teamReportNames } from '@mm/components/prizes/screens';
import { roundName } from '@mm/sports/formats/knockout';
import { useBasketballSeason } from '@mm/pages/sports/basketball/season';
import { useFootballSeason } from '@mm/pages/sports/football/season';
import {
  BEST_OF,
  bestOfLabel,
  byesText,
  createPlayoffError,
  defaultBestOf,
  gameResult,
  initialPlayoffSize,
  moveSeed,
  nextGame,
  playoffBracket,
  playoffProblem,
  playoffRounds,
  playoffSizeKey,
  playoffSizes,
  seedOrder,
  seriesGames,
  seriesLabels,
  seriesLine,
  seriesOfKey,
  seriesRoundName,
  seriesScore,
  shownSeries,
  topSeeds,
  winsNeeded,
} from '@mm/pages/sports/team/playoffs';
import { useTeamLeague, type TeamLeague } from '@mm/pages/sports/team/useTeamLeague';
import { leagueSport } from '@mm/sports/registry';
import { confirmAsync, toast } from '../../feedback';
import { MenuRow } from '../../esports/inputs';
import { PickField } from '../../players/fields';
import { TournamentPrizes } from '../../prizes/TournamentPrizes';
import { ScorersSheet } from '../../scorers/ScorersSheet';
import { ReportSheet } from '../../tournamentReport/ReportSheet';
import { BackBar, Button, Card, Divider, Empty, ListRow, LoadError, Loading, Segmented, SectionHeader, Sheet, Txt } from '../../ui';
import { TeamCrest } from '../TeamBits';
import { MatchRow } from '../player/MatchRows';
import { SeasonBar, useSeasonPick, type SeasonPick } from '../standings/parts';
import { BracketView } from './BracketView';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** Los playoffs de la liga de equipos (trae su barra de atrás con «•••»). `temporada`: la del `?temporada=`. */
export function TeamPlayoffs({ temporada }: { temporada?: string | null }) {
  const tl = useTeamLeague();
  const pick = useSeasonPick(temporada);
  return leagueSport(tl.league) === 'basketball' ? <BasketballPlayoffs tl={tl} pick={pick} /> : <FootballPlayoffs tl={tl} pick={pick} />;
}

/** La siembra se propone con la tabla FIBA de la temporada de ahora. */
function BasketballPlayoffs({ tl, pick }: { tl: TeamLeague; pick: SeasonPick }) {
  const season = useBasketballSeason(tl);
  return <PlayoffsBody tl={tl} pick={pick} tableIds={season.standings.map((r) => r.id)} />;
}

/** La siembra se propone con la tabla de la temporada de ahora (campo o sala). */
function FootballPlayoffs({ tl, pick }: { tl: TeamLeague; pick: SeasonPick }) {
  const season = useFootballSeason(tl);
  return <PlayoffsBody tl={tl} pick={pick} tableIds={season.standings.map((r) => r.id)} />;
}

function PlayoffsBody({ tl, pick, tableIds }: { tl: TeamLeague; pick: SeasonPick; tableIds: readonly string[] }) {
  const c = useColors();
  const season = pick.selected ?? tl.season;
  const playoffs = usePlayoffs(tl.lid);
  const list = playoffs.data.filter((p) => !season || p.seasonId === season.id);
  const main = list.find((p) => p.status === 'active') ?? list[0] ?? null;
  const canCreate = tl.isAdmin && !!season && season.status === 'active' && !list.some((p) => p.status === 'active');
  const current = !!season && season.id === tl.season?.id;
  // La siembra se propone con la tabla: se espera a tener los equipos y los partidos.
  const ready = !(tl.allTeams.loading && !tl.allTeams.data.length) && !(tl.matches.loading && !tl.matches.data.length);

  // Al abrir la llave se pone al día lo que pasó sin escritura (resultados que a las 48 h ya cuentan).
  const synced = useRef(new Set<string>());
  const mainId = main && main.status === 'active' ? main.id : null;
  useEffect(() => {
    if (!tl.userId || !mainId || synced.current.has(mainId)) return;
    synced.current.add(mainId);
    syncPlayoffs(tl.lid, mainId).catch((e) => console.error(e));
  }, [tl.userId, tl.lid, mainId]);

  if (main) return <PlayoffView tl={tl} playoff={main} pick={pick} />;
  return (
    <View style={{ gap: 16 }}>
      <BackBar label={tl.league.name} fallback={`/l/${tl.lid}`} />
      <Txt variant="title" accessibilityRole="header">
        Playoffs
      </Txt>
      <SeasonBar pick={pick} awards={false} />
      {playoffs.error && !playoffs.data.length ? (
        <LoadError error={playoffs.error} />
      ) : playoffs.loading && !playoffs.data.length ? (
        <Loading label="Cargando los playoffs" />
      ) : canCreate && current && season ? (
        ready ? (
          <PlayoffCreator tl={tl} season={season} tableIds={tableIds} />
        ) : (
          <Loading label="Cargando la tabla" />
        )
      ) : (
        <Empty
          icon={<Trophy size={28} color={c.accent} />}
          title="Sin playoffs en esta temporada"
          text={season?.status === 'closed' ? 'Esta temporada se cerró sin playoffs.' : 'Cuando el admin arme los playoffs con los primeros de la tabla, la llave sale aquí.'}
        />
      )}
    </View>
  );
}

/** Nombre del equipo (el de ahora; si se borró, el que se copió en la serie). */
const nameFor = (tl: TeamLeague) => (teamId: string | null, label: string | null) => tl.teamOf(teamId)?.name ?? label ?? 'Por definir';

type SheetKey = 'menu' | 'reporte' | 'anotadores' | null;

function PlayoffView({ tl, playoff, pick }: { tl: TeamLeague; playoff: Playoff; pick: SeasonPick }) {
  const c = useColors();
  const now = useNow(60_000).getTime();
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<SheetKey>(null);
  const bracket = playoffBracket(playoff);
  const name = nameFor(tl);
  const labels = seriesLabels(playoff);
  const mine = tl.myTeams.map((x) => x.team.id);
  const champion = playoff.winner;
  const shown = shownSeries(playoff);
  const sport = tl.league.sport ?? 'football';
  const comp = playoffComp(tl.lid, playoff, sport, playoffDate(playoff, tl.matches.data, tl.tz, now));
  const reportReady = !(tl.matches.loading && !tl.matches.data.length) && !tl.players.loading;
  // Reporte del playoff (PDF o Excel), para todos: las series, sus juegos y el podio de la app.
  const report = () => playoffReport({ lid: tl.lid, league: tl.league, playoff, matches: tl.matches.data, names: teamReportNames(tl), now });

  const remove = async () => {
    setSheet(null);
    const ok = await confirmAsync({
      title: `¿Borrar ${playoff.name}?`,
      message: 'Se borra la llave y los juegos que no han empezado. Los juegos ya jugados se quedan en Partidos, sin serie.',
      confirmText: 'Borrar playoffs',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deletePlayoffs(tl.lid, playoff.id);
      toast('Playoffs borrados');
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const hasMenu = reportReady || tl.isAdmin;
  const more = hasMenu ? (
    <Pressable accessibilityRole="button" accessibilityLabel="Más opciones" hitSlop={6} onPress={() => setSheet('menu')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <MoreHorizontal size={22} color={c.fg} />
    </Pressable>
  ) : undefined;

  return (
    <View style={{ gap: 16 }}>
      <BackBar label={tl.league.name} fallback={`/l/${tl.lid}`} right={more} />
      <View style={{ gap: 6 }}>
        <Txt variant="title" accessibilityRole="header">
          {playoff.name}
        </Txt>
        <Txt variant="meta" tone="muted">
          {playoff.status === 'finished' ? 'Terminado' : 'En juego'}
        </Txt>
      </View>
      <SeasonBar pick={pick} awards={false} />
      <View style={{ gap: 30, marginTop: 6 }}>
        {champion && (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.accentSoft }}>
            <View style={{ width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface }}>
              <Trophy size={24} color={c.gold} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt tone="accent" style={{ fontSize: 14, fontFamily: font.semibold }}>
                Campeón del playoff
              </Txt>
              <Txt variant="cardTitle" numberOfLines={1}>
                {name(champion, labels.get(champion) ?? null)}
              </Txt>
            </View>
          </Card>
        )}
        <PlayoffPrizes tl={tl} playoff={playoff} now={now} />
        <View style={{ gap: 10 }}>
          <SectionHeader title="La llave" />
          <BracketView
            bracket={bracket}
            nameOf={(id) => tl.teamOf(id)?.name ?? labels.get(id) ?? '(equipo borrado)'}
            scoreOf={(bm) => {
              const s = seriesOfKey(playoff, bm.key);
              return s && !s.bye && s.teamA && s.teamB ? [s.winsA, s.winsB] : null;
            }}
            highlight={mine}
          />
        </View>
        {shown.length > 0 && (
          <View style={{ gap: 14 }}>
            <SectionHeader title="Series" />
            {shown.map((s) => (
              <SeriesCard key={s.id} tl={tl} playoff={playoff} series={s} now={now} />
            ))}
          </View>
        )}
      </View>

      <Sheet open={sheet === 'menu'} onClose={() => setSheet(null)} title={playoff.name}>
        {reportReady && <MenuRow icon={<FileDown size={20} color={c.fg2} />} label="Reporte del playoff" hint="PDF para WhatsApp o imprimir, o Excel" onPress={() => setSheet('reporte')} />}
        {tl.isAdmin && <MenuRow icon={<ClipboardPen size={20} color={c.fg2} />} label="Anotadores" hint="Quién anota los juegos" onPress={() => setSheet('anotadores')} />}
        {tl.isAdmin && <MenuRow icon={<Trash2 size={20} color={c.danger} />} label="Borrar playoffs" danger disabled={busy} onPress={() => void remove()} />}
      </Sheet>
      <ReportSheet open={sheet === 'reporte'} onClose={() => setSheet(null)} report={report} comp={comp} />
      {/* La mesa de los playoffs: quién anota sus juegos. */}
      {tl.isAdmin && (
        <ScorersSheet
          league={tl.league}
          open={sheet === 'anotadores'}
          onClose={() => setSheet(null)}
          target={{ scope: 'playoff', refId: playoff.id, title: playoff.name }}
          participants={playoff.seeds.flatMap((id) => tl.teamOf(id)?.roster.map((r) => r.playerId) ?? [])}
        />
      )}
    </View>
  );
}

/** Los premios de un playoff (PlayoffPrizes de la web): se entregan cuando termina. */
function PlayoffPrizes({ tl, playoff, now }: { tl: TeamLeague; playoff: Playoff; now: number }) {
  const names = teamNamesOf({ nameOf: tl.nameOf, teamOf: tl.teamOf });
  const matches = tl.matches.data;
  const sport = tl.league.sport ?? 'football';
  const comp = playoffComp(tl.lid, playoff, sport, playoffDate(playoff, matches, tl.tz, now));
  const podium = playoffProvider(playoff, matches, names);
  return <TournamentPrizes comp={comp} ready={playoff.status === 'finished'} waitText={PLAYOFF_WAIT_TEXT} podium={podium} webPath={`/l/${tl.lid}/playoffs`} />;
}

function SeriesCard({ tl, playoff, series: s, now }: { tl: TeamLeague; playoff: Playoff; series: PlayoffSeries; now: number }) {
  const c = useColors();
  const name = nameFor(tl);
  const games = seriesGames(s.id, tl.matches.data);
  const next = s.winner ? null : nextGame(s.id, tl.matches.data, now);
  const played = games.filter((g) => g !== next);
  const line = (teamId: string | null, label: string | null, seed: number | null, wins: number) => {
    const lost = !!s.winner && s.winner !== teamId;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
        <TeamCrest team={tl.teamOf(teamId)} label={label ?? '?'} size={32} />
        <Txt numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 16, fontFamily: s.winner === teamId ? font.bold : font.semibold, color: lost ? c.muted : c.fg }}>
          {name(teamId, label)}
          {seed != null && <Txt style={{ fontSize: 13, fontFamily: font.medium, color: c.faint }}>{`  ${seed}.º`}</Txt>}
        </Txt>
        <Txt style={{ fontSize: 26, lineHeight: 30, fontFamily: lost ? font.medium : font.bold, color: lost ? c.faint : c.fg }}>{wins}</Txt>
      </View>
    );
  };
  return (
    <Card style={{ gap: 0 }}>
      <Txt style={{ fontSize: 13, color: c.muted }}>
        <Txt style={{ fontSize: 13, fontFamily: font.semibold, color: c.fg2 }}>{seriesRoundName(s, playoff)}</Txt>
        {` · ${bestOfLabel(s.bestOf)}${s.bestOf > 1 ? ` (gana el primero en llegar a ${winsNeeded(s.bestOf)})` : ''}`}
      </Txt>
      <View style={{ marginTop: 8 }}>
        {line(s.teamA, s.labelA, s.seedA, s.winsA)}
        {line(s.teamB, s.labelB, s.seedB, s.winsB)}
      </View>
      <Txt style={{ marginTop: 6, fontSize: 15, fontFamily: font.semibold }}>
        {seriesLine(s, name)}
        {!s.winner && (s.winsA > 0 || s.winsB > 0) && <Txt style={{ fontSize: 15, color: c.muted }}>{` · serie ${seriesScore(s)}`}</Txt>}
      </Txt>
      {next && (
        <View style={{ marginTop: 16, gap: 8 }}>
          <Txt style={{ fontSize: 11, fontFamily: font.bold, letterSpacing: 0.7, color: c.muted }}>PRÓXIMO JUEGO</Txt>
          {/* Como fila con su fecha (no una tarjeta dentro de otra). */}
          <View style={{ borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: c.line }}>
            <MatchRow tl={tl} match={next} now={now} mine={false} />
          </View>
          {tl.isAdmin && !next.scheduledAt && (
            <Txt style={{ fontSize: 13, color: c.muted }}>Sin fecha todavía: ábrelo para ponerle día, hora y cancha.</Txt>
          )}
        </View>
      )}
      {played.length > 0 && (
        <View style={{ marginTop: 16, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: c.line }}>
          {played.map((g, i) => (
            <View key={g.id}>
              {i > 0 && <Divider inset={16} />}
              <ListRow
                title={g.stage || 'Juego'}
                subtitle={gameResult(g, (id) => tl.teamOf(id)?.name)}
                onPress={() => openMatch(tl.lid, g.id)}
              />
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

const openMatch = (lid: string, matchId: string) => router.push({ pathname: '/l/[lid]/partido/[matchId]', params: { lid, matchId } });

/**
 * Admin: arma el playoff (PlayoffCreator de la web). Propone los primeros de la tabla (4 u 8) en su orden; se puede
 * cambiar cuántos, el orden (la siembra) y al mejor de cuántos va cada ronda. Mientras el admin no toque nada, la
 * propuesta sigue a la tabla (si llegan partidos o equipos después de abrirlo).
 */
function PlayoffCreator({ tl, season, tableIds }: { tl: TeamLeague; season: Season; tableIds: readonly string[] }) {
  const c = useColors();
  const teams = tl.teams.data;
  // La tabla primero; los que no salen en ella (sin partidos), después por nombre.
  const ordered = seedOrder(teams, tableIds);
  const sizes = playoffSizes(ordered.length);
  const initial = initialPlayoffSize(sizes);
  const [picked, setPicked] = useState<{ seeds: string[]; bestOf: number[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState('');
  // Sin tocar nada, lo propuesto (sigue a la tabla); al tocar algo, lo elegido.
  const seeds = picked?.seeds ?? topSeeds(ordered, initial);
  const bestOf = picked?.bestOf ?? defaultBestOf(initial);

  if (teams.length < 2) {
    return <Empty icon={<Trophy size={28} color={c.accent} />} title="Faltan equipos" text="Para armar los playoffs hacen falta al menos 2 equipos en la temporada." />;
  }

  const setSeedList = (next: string[]) => setPicked({ seeds: next, bestOf: playoffRounds(next.length) !== bestOf.length ? defaultBestOf(next.length) : bestOf });
  const move = (i: number, by: -1 | 1) => setPicked({ seeds: moveSeed(seeds, i, by), bestOf });
  const rounds = playoffRounds(seeds.length);
  const problem = playoffProblem(seeds, bestOf);
  const byes = byesText(seeds.length);
  const left = teams.filter((t) => !seeds.includes(t.id)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const sizeKey = playoffSizeKey(sizes, seeds, ordered);

  const submit = async () => {
    if (problem || busy) return;
    setBusy(true);
    try {
      await createPlayoffs(tl.lid, season.id, seeds, bestOf);
      toast('Playoffs listos. Ponle fecha a cada juego desde Partidos.');
    } catch (e) {
      console.error(e);
      toast(createPlayoffError(e) ?? 'No se pudieron armar los playoffs. Intenta de nuevo.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const iconButton = (label: string, icon: ReactNode, onPress: () => void, disabled?: boolean) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} hitSlop={2} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }}>
      {icon}
    </Pressable>
  );

  return (
    <View style={{ gap: 14 }}>
      <SectionHeader title="Armar playoffs" />
      <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4, marginTop: -6 }}>
        El 1.º contra el último, el 2.º contra el penúltimo…
      </Txt>
      {sizes.length > 1 && (
        <Segmented label="Cuántos equipos" options={sizes.map((n) => ({ key: String(n), label: `Los ${n}` }))} value={sizeKey ? String(sizeKey) : ''} onChange={(k) => setSeedList(topSeeds(ordered, Number(k)))} />
      )}
      <Card padded={false}>
        {seeds.map((id, i) => (
          <View key={id}>
            {i > 0 && <Divider />}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 56, paddingVertical: 6, paddingLeft: 16, paddingRight: 8 }}>
              <Txt style={{ width: 24, fontSize: 15, fontFamily: font.semibold, color: c.muted }}>{i + 1}</Txt>
              <TeamCrest team={tl.teamOf(id)} label="?" size={32} />
              <Txt numberOfLines={1} style={{ flex: 1, minWidth: 0, marginLeft: 8, fontSize: 15, fontFamily: font.semibold }}>
                {tl.teamOf(id)?.name ?? '(equipo borrado)'}
              </Txt>
              {iconButton('Subir', <ArrowUp size={18} color={c.fg} />, () => move(i, -1), i === 0)}
              {iconButton('Bajar', <ArrowDown size={18} color={c.fg} />, () => move(i, 1), i === seeds.length - 1)}
              {iconButton('Quitar', <X size={18} color={c.fg} />, () => setSeedList(seeds.filter((x) => x !== id)))}
            </View>
          </View>
        ))}
      </Card>
      {left.length > 0 && (
        <View style={{ gap: 8 }}>
          <PickField label="Agregar equipo" options={[{ key: '', label: 'Agregar equipo…' }, ...left.map((t) => ({ key: t.id, label: t.name }))]} value={adding} onChange={setAdding} />
          <Button
            size="lg"
            icon={<Plus size={18} color={c.fg} />}
            disabled={!adding}
            onPress={() => {
              setSeedList([...seeds, adding]);
              setAdding('');
            }}
          >
            Agregar
          </Button>
        </View>
      )}
      {!!byes && (
        <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4 }}>
          {byes}
        </Txt>
      )}

      {rounds > 0 && (
        <Card style={{ gap: 12 }}>
          {bestOf.map((b, i) => (
            <View key={i} style={{ gap: 6 }}>
              <Txt tone="muted" style={{ fontSize: 12, fontFamily: font.medium }}>
                {roundName(i + 1, rounds)}
              </Txt>
              <PickField
                label={roundName(i + 1, rounds)}
                options={BEST_OF.map((n) => ({ key: String(n), label: bestOfLabel(n) }))}
                value={String(b)}
                onChange={(k) => {
                  const next = [...bestOf];
                  next[i] = Number(k);
                  setPicked({ seeds, bestOf: next });
                }}
              />
            </View>
          ))}
        </Card>
      )}

      {!!problem && (
        <Txt variant="meta" tone="warn" style={{ marginHorizontal: 4 }}>
          {problem}
        </Txt>
      )}
      <Button variant="primary" size="lg" full loading={busy} disabled={!!problem} icon={<Trophy size={20} color={c.accentFg} />} onPress={() => void submit()}>
        Armar playoffs
      </Button>
    </View>
  );
}

