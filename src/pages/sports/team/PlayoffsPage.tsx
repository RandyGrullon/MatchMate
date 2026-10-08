import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ClipboardPen, FileDown, Plus, Trash2, Trophy, X } from 'lucide-react';
import { asBackendError } from '../../../lib/db/errors';
import { createPlayoffs, deletePlayoffs, syncPlayoffs, usePlayoffs, type Playoff, type PlayoffSeries } from '../../../lib/data/playoffs';
import type { Match } from '../../../lib/data/matches';
import { useNow } from '../../../lib/useNow';
import type { Season } from '../../../lib/seasons';
import { BracketView } from '../../../components/match';
import { playoffComp, playoffDate } from '../../../prizes/sports';
import { EventMenu, MoreButton, type MenuItem } from '../../../components/event/EventHeader';
import { LeagueBackBar } from '../../../components/league/home/LeagueTopBar';
import { useAction, useFeedback } from '../../../components/feedback';
import { useIsPro } from '../../../components/mode';
import { SeasonBar, useStandingsSeason } from '../../../components/season/SeasonView';
import { Button, Card, Empty, ListRow, ListSkeleton, LoadError, SectionHeader, Segmented, Select, cx } from '../../../components/ui';
import { roundName } from '../../../sports/formats/knockout';
import {
  BEST_OF,
  bestOfLabel,
  byesFor,
  defaultBestOf,
  moveSeed,
  nextGame,
  playoffBracket,
  playoffProblem,
  playoffRounds,
  seriesGames,
  seriesKey,
  seriesLine,
  seriesOfKey,
  seriesRoundName,
  seriesScore,
  topSeeds,
  winsNeeded,
} from './playoffs';
import { TeamName } from './TeamBits';
import { PlayoffPrizes, teamReportNames } from './TeamPrizes';
import { MatchRow, ReportSheet, ScorersSheet, ScreenTitle, TeamCrest, matchLink } from './TeamUi';
import type { TeamLeague } from './useTeamLeague';

/**
 * Playoffs de la temporada (/l/:lid/playoffs; baloncesto, fútbol y sala), rediseño «Calma y foco»: «‹ Liga» con «•••»
 * (Reporte para todos; Anotadores y Borrar para el admin), el nombre del playoff, la temporada, el campeón, la llave con
 * el marcador de cada serie («2–1») y cada serie como tarjeta con su próximo juego y los ya jugados. El admin arma el
 * playoff con los primeros de la tabla (o los que elija, en el orden que quiera) y al mejor de cuántos va cada ronda; la
 * base programa cada juego (sin fecha: la pone el admin en el partido) y pasa al ganador de ronda. `tableIds` = la tabla
 * de la temporada de ahora (ids en orden) para proponer la siembra.
 */
export function PlayoffsPage({ tl, tableIds }: { tl: TeamLeague; tableIds: readonly string[] }) {
  const pro = useIsPro();
  const picked = useStandingsSeason();
  const season = picked.selected ?? tl.season;
  const playoffs = usePlayoffs(tl.lid);
  const list = useMemo(() => playoffs.data.filter((p) => !season || p.seasonId === season.id), [playoffs.data, season]);
  const main = list.find((p) => p.status === 'active') ?? list[0] ?? null;
  const canCreate = tl.isAdmin && !!season && season.status === 'active' && !list.some((p) => p.status === 'active');
  const current = !!season && season.id === tl.season?.id;
  // La siembra se propone con la tabla: se espera a tener los equipos y los partidos.
  const ready = !(tl.allTeams.loading && !tl.allTeams.data.length) && !(tl.matches.loading && !tl.matches.data.length);

  // Al abrir la llave se pone al día lo que pasó sin escritura (resultados que a las 48 h ya cuentan).
  const synced = useRef(new Set<string>());
  useEffect(() => {
    if (!tl.userId || !main || main.status !== 'active' || synced.current.has(main.id)) return;
    synced.current.add(main.id);
    syncPlayoffs(tl.lid, main.id).catch((e) => console.error(e));
  }, [tl.userId, tl.lid, main]);

  if (main) return <PlayoffView tl={tl} playoff={main} season={<SeasonBar seasons={picked.seasons} selected={picked.selected} onChange={picked.setSelected} awards={false} className="mt-3" />} />;

  return (
    <div className="flex flex-col px-2">
      <ScreenTitle title="Playoffs" pro={pro} />
      <SeasonBar seasons={picked.seasons} selected={picked.selected} onChange={picked.setSelected} awards={false} className="mt-3" />
      <div className="mt-[22px]">
        {playoffs.error && !playoffs.data.length ? (
          <LoadError error={playoffs.error} />
        ) : playoffs.loading && !playoffs.data.length ? (
          <ListSkeleton rows={4} />
        ) : canCreate && current ? (
          ready ? (
            <PlayoffCreator tl={tl} season={season} tableIds={tableIds} />
          ) : (
            <ListSkeleton rows={4} />
          )
        ) : (
          <Empty icon={<Trophy className="size-8" />} title="Sin playoffs en esta temporada">
            {season?.status === 'closed' ? 'Esta temporada se cerró sin playoffs.' : 'Cuando el admin arme los playoffs con los primeros de la tabla, la llave sale aquí.'}
          </Empty>
        )}
      </div>
    </div>
  );
}

/** Nombre del equipo (el de ahora; si se borró, el que se copió en la serie). */
const nameFor = (tl: TeamLeague) => (teamId: string | null, label: string | null) => tl.teamOf(teamId)?.name ?? label ?? 'Por definir';

function PlayoffView({ tl, playoff, season }: { tl: TeamLeague; playoff: Playoff; season: ReactNode }) {
  const pro = useIsPro();
  const now = useNow(60_000).getTime();
  const run = useAction();
  const { confirm } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<'reporte' | 'anotadores' | null>(null);
  const bracket = useMemo(() => playoffBracket(playoff), [playoff]);
  const name = nameFor(tl);
  const labels = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of playoff.series) {
      if (s.teamA && s.labelA) m.set(s.teamA, s.labelA);
      if (s.teamB && s.labelB) m.set(s.teamB, s.labelB);
    }
    return m;
  }, [playoff.series]);
  const mine = tl.myTeams.map((x) => x.team.id);
  const champion = playoff.winner;
  // Las series que ya tienen a los dos equipos, de la ronda más avanzada a la primera (lo que se está jugando arriba).
  const shown = [...playoff.series].filter((s) => !s.bye && s.teamA && s.teamB).sort((a, b) => b.round - a.round || a.slot - b.slot);

  // Reporte del playoff (PDF o Excel), para todos: las series, sus juegos y el podio de la app.
  const report = () =>
    import('../../../lib/report/team').then((m) => m.playoffReport({ lid: tl.lid, league: tl.league, playoff, matches: tl.matches.data, names: teamReportNames(tl), now }));
  const comp = playoffComp(tl.lid, playoff, tl.league.sport ?? 'football', playoffDate(playoff, tl.matches.data, tl.tz, now));
  const reportReady = !(tl.matches.loading && !tl.matches.data.length) && !tl.players.loading;

  const remove = async () => {
    setMenu(false);
    const ok = await confirm({
      title: `¿Borrar ${playoff.name}?`,
      message: 'Se borra la llave y los juegos que no han empezado. Los juegos ya jugados se quedan en Partidos, sin serie.',
      confirmText: 'Borrar playoffs',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    await run(() => deletePlayoffs(tl.lid, playoff.id), 'Playoffs borrados');
    setBusy(false);
  };
  const open = (s: 'reporte' | 'anotadores') => {
    setMenu(false);
    setSheet(s);
  };
  const items: MenuItem[] = [
    ...(reportReady ? [{ key: 'reporte', icon: FileDown, label: 'Reporte del playoff', hint: 'PDF para WhatsApp o imprimir, o Excel', onClick: () => open('reporte') }] : []),
    ...(tl.isAdmin ? [{ key: 'anotadores', icon: ClipboardPen, label: 'Anotadores', hint: 'Quién anota los juegos', onClick: () => open('anotadores') }] : []),
    ...(tl.isAdmin ? [{ key: 'borrar', icon: Trash2, label: 'Borrar playoffs', onClick: () => void remove(), busy, danger: true }] : []),
  ];

  return (
    <>
      {/* «‹ Liga» con «•••» (la de la liga, en lugar de la que pone LeagueShell). */}
      <LeagueBackBar actions={items.length > 0 && <MoreButton onClick={() => setMenu(true)} />} />
      <div className="flex flex-col px-2">
        <ScreenTitle title={playoff.name} sub={playoff.status === 'finished' ? 'Terminado' : 'En juego'} pro={pro} />
        {season}
        <div className="mt-[22px] flex flex-col gap-[30px]">
          {champion && (
            <Card soft className="flex items-center gap-3.5 px-5 py-[18px]">
              <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface text-gold">
                <Trophy className="size-6" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-accent">Campeón del playoff</p>
                <p className="truncate text-card-title-pro">{name(champion, labels.get(champion) ?? null)}</p>
              </div>
            </Card>
          )}
          <PlayoffPrizes tl={tl} playoff={playoff} />
          <section aria-labelledby="playoff-llave">
            <SectionHeader id="playoff-llave" title="La llave" />
            <BracketView
              bracket={bracket}
              nameOf={(id) => <TeamName team={tl.teamOf(id)} label={labels.get(id) ?? '(equipo borrado)'} />}
              scoreOf={(bm) => {
                const s = seriesOfKey(playoff, bm.key);
                return s && !s.bye && s.teamA && s.teamB ? [s.winsA, s.winsB] : null;
              }}
              onMatch={(bm) => document.getElementById(`serie-${bm.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              highlight={mine}
            />
          </section>
          {shown.length > 0 && (
            <section aria-labelledby="playoff-series" className="flex flex-col gap-3.5">
              <SectionHeader id="playoff-series" title="Series" className="mb-0" />
              {shown.map((s) => (
                <SeriesCard key={s.id} tl={tl} playoff={playoff} series={s} now={now} />
              ))}
            </section>
          )}
        </div>
      </div>
      {items.length > 0 && <EventMenu open={menu} onClose={() => setMenu(false)} title={playoff.name} items={items} />}
      <ReportSheet open={sheet === 'reporte'} onClose={() => setSheet(null)} report={report} comp={comp} />
      {/* La mesa de los playoffs: quién anota sus juegos. */}
      {tl.isAdmin && (
        <ScorersSheet
          open={sheet === 'anotadores'}
          onClose={() => setSheet(null)}
          target={{ scope: 'playoff', refId: playoff.id, title: playoff.name }}
          participants={playoff.seeds.flatMap((id) => tl.teamOf(id)?.roster.map((r) => r.playerId) ?? [])}
        />
      )}
    </>
  );
}

function SeriesCard({
  tl,
  playoff,
  series: s,
  now,
}: {
  tl: TeamLeague;
  playoff: Playoff;
  series: PlayoffSeries;
  now: number;
}) {
  const name = nameFor(tl);
  const games = seriesGames(s.id, tl.matches.data);
  const next = s.winner ? null : nextGame(s.id, tl.matches.data, now);
  const played = games.filter((g) => g !== next);
  const line = (teamId: string | null, label: string | null, seed: number | null, wins: number) => (
    <div className={cx('flex min-h-12 items-center gap-3', s.winner && s.winner !== teamId && 'text-muted')}>
      <TeamCrest team={tl.teamOf(teamId)} label={label ?? '?'} size={32} />
      <span className={cx('min-w-0 flex-1 truncate text-[16px]', s.winner === teamId ? 'font-bold' : 'font-semibold')}>
        {name(teamId, label)}
        {seed != null && <span className="ml-1.5 text-[13px] font-medium text-faint">{seed}.º</span>}
      </span>
      <span className={cx('num text-[26px] leading-none', s.winner && s.winner !== teamId ? 'font-medium text-faint' : 'font-bold')}>{wins}</span>
    </div>
  );
  return (
    <Card className="flex flex-col px-[18px] pt-4 pb-[18px]">
      {/* El cuadro salta aquí: el margen deja el título debajo de la barra de arriba (fija). */}
      <p id={`serie-${seriesKey(s)}`} className="scroll-mt-24 text-[13px] text-muted">
        <b className="font-semibold text-fg-2">{seriesRoundName(s, playoff)}</b>
        {` · ${bestOfLabel(s.bestOf)}`}
        {s.bestOf > 1 ? ` (gana el primero en llegar a ${winsNeeded(s.bestOf)})` : ''}
      </p>
      <div className="mt-2 flex flex-col">
        {line(s.teamA, s.labelA, s.seedA, s.winsA)}
        {line(s.teamB, s.labelB, s.seedB, s.winsB)}
      </div>
      <p className="mt-1.5 text-[15px] font-semibold">
        {seriesLine(s, name)}
        {!s.winner && (s.winsA > 0 || s.winsB > 0) && <span className="font-normal text-muted"> · serie {seriesScore(s)}</span>}
      </p>
      {next && (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-[11px] font-bold tracking-[0.06em] text-muted uppercase">Próximo juego</p>
          {/* Como fila con su fecha (no una tarjeta dentro de otra). */}
          <Card className="overflow-hidden shadow-[inset_0_0_0_1px_var(--line)]">
            <MatchRow tl={tl} match={next} now={now} mine={false} />
          </Card>
          {tl.isAdmin && !next.scheduledAt && <p className="text-[13px] text-muted">Sin fecha todavía: ábrelo para ponerle día, hora y cancha.</p>}
        </div>
      )}
      {played.length > 0 && (
        <Card className="mt-4 overflow-hidden shadow-[inset_0_0_0_1px_var(--line)]">
          {played.map((g) => (
            <ListRow key={g.id} dense title={g.stage || 'Juego'} subtitle={gameResult(tl, g)} to={matchLink(tl.base, g.id)} />
          ))}
        </Card>
      )}
    </Card>
  );
}

/** «Tigres 70-64» (el ganador con el marcador), «W.O.» o el estado. */
function gameResult(tl: TeamLeague, m: Match): string {
  const text = typeof m.score?.text === 'string' ? m.score.text : '';
  if (m.status === 'walkover') return 'W.O.';
  if (!m.winner) return text ? `Empate ${text}` : 'Sin resultado';
  const side = m.sides[m.winner - 1];
  return `${tl.teamOf(side.teamId)?.name ?? side.label} ${text}`.trim();
}

/** Mensaje de un error de create_playoffs. */
function createError(e: unknown): string | null {
  const msg = asBackendError(e)?.message ?? (e instanceof Error ? e.message : '');
  const code = msg.trim().split(/[\s:]/)[0];
  if (code === 'duplicado') return 'Ya hay un playoff en esta temporada.';
  if (code === 'cerrado') return 'La temporada está cerrada: los playoffs se arman en la temporada en curso.';
  if (code === 'invalido') return 'Revisa los equipos (tienen que ser de esta temporada) y al mejor de cuántos va cada ronda.';
  return null;
}

/**
 * Admin: arma el playoff. Propone los primeros de la tabla (4 u 8) en su orden; se puede cambiar cuántos (un segmentado),
 * el orden (la siembra) y al mejor de cuántos va cada ronda. Mientras el admin no toque nada, la propuesta sigue a la
 * tabla (si llegan partidos o equipos después de abrirlo).
 */
export function PlayoffCreator({ tl, season, tableIds }: { tl: TeamLeague; season: Season; tableIds: readonly string[] }) {
  const { toast } = useFeedback();
  const teams = tl.teams.data;
  // La tabla primero; los que no salen en ella (sin partidos), después por nombre.
  const ordered = useMemo(() => {
    const known = new Set(teams.map((t) => t.id));
    const inTable = tableIds.filter((id) => known.has(id));
    const rest = teams
      .filter((t) => !inTable.includes(t.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
      .map((t) => t.id);
    return [...inTable, ...rest];
  }, [teams, tableIds]);
  const sizes = [2, 4, 8, 16].filter((n) => n <= ordered.length);
  const initial = sizes.includes(4) ? 4 : (sizes.at(-1) ?? 0);
  const [seeds, setSeeds] = useState<string[]>(() => topSeeds(ordered, initial));
  const [bestOf, setBestOf] = useState<number[]>(() => defaultBestOf(initial));
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState('');
  const proposal = `${initial}:${ordered.join()}`;
  useEffect(() => {
    if (touched) return;
    setSeeds(topSeeds(ordered, initial));
    setBestOf(defaultBestOf(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal, touched]);

  const setSeedList = (next: string[]) => {
    setTouched(true);
    setSeeds(next);
    const rounds = playoffRounds(next.length);
    if (rounds !== bestOf.length) setBestOf(defaultBestOf(next.length));
  };
  const move = (i: number, by: -1 | 1) => {
    setTouched(true);
    setSeeds(moveSeed(seeds, i, by));
  };
  const rounds = playoffRounds(seeds.length);
  const problem = playoffProblem(seeds, bestOf);
  const byes = byesFor(seeds.length);
  const left = teams.filter((t) => !seeds.includes(t.id)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  // El tamaño elegido, si los que están son exactamente los primeros de la tabla.
  const sizeKey = sizes.find((n) => seeds.length === n && seeds.every((id, i) => ordered[i] === id));

  if (teams.length < 2) {
    return (
      <Empty icon={<Trophy className="size-8" />} title="Faltan equipos">
        Para armar los playoffs hacen falta al menos 2 equipos en la temporada.
      </Empty>
    );
  }

  const submit = async () => {
    if (problem) return;
    setBusy(true);
    try {
      await createPlayoffs(tl.lid, season.id, seeds, bestOf);
      toast('Playoffs listos. Ponle fecha a cada juego desde Partidos.');
    } catch (e) {
      console.error(e);
      toast(createError(e) ?? 'No se pudieron armar los playoffs. Intenta de nuevo.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="playoff-armar" className="flex flex-col gap-3.5">
      <SectionHeader id="playoff-armar" title="Armar playoffs" className="mb-0" />
      <p className="mx-1 -mt-1.5 text-meta text-muted">El 1.º contra el último, el 2.º contra el penúltimo…</p>
      {sizes.length > 1 && (
        <Segmented
          full
          label="Cuántos equipos"
          options={sizes.map((n) => ({ key: String(n), label: `Los ${n}` }))}
          value={sizeKey ? String(sizeKey) : ''}
          onChange={(k) => setSeedList(topSeeds(ordered, Number(k)))}
        />
      )}
      <Card className="overflow-hidden">
        {seeds.map((id, i) => (
          <div key={id} className={cx('flex min-h-14 items-center gap-1 py-1.5 pr-2 pl-4', i > 0 && 'border-t border-line')}>
            <span className="num w-6 shrink-0 text-[15px] font-semibold text-muted">{i + 1}</span>
            <TeamCrest team={tl.teamOf(id)} label="?" size={32} className="mr-2" />
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{tl.teamOf(id)?.name ?? '(equipo borrado)'}</span>
            <Button variant="ghost" size="lg" aria-label="Subir" disabled={i === 0} icon={<ArrowUp className="size-4" />} onClick={() => move(i, -1)} />
            <Button variant="ghost" size="lg" aria-label="Bajar" disabled={i === seeds.length - 1} icon={<ArrowDown className="size-4" />} onClick={() => move(i, 1)} />
            <Button variant="ghost" size="lg" aria-label="Quitar" icon={<X className="size-4" />} onClick={() => setSeedList(seeds.filter((x) => x !== id))} />
          </div>
        ))}
      </Card>
      {left.length > 0 && (
        <div className="flex gap-2">
          <Select value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Agregar equipo" className="h-11 min-w-0 flex-1">
            <option value="">Agregar equipo…</option>
            {left.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Button
            variant="quiet"
            size="lg"
            icon={<Plus className="size-4" />}
            disabled={!adding}
            onClick={() => {
              setSeedList([...seeds, adding]);
              setAdding('');
            }}
          >
            Agregar
          </Button>
        </div>
      )}
      {byes > 0 && seeds.length >= 2 && (
        <p className="mx-1 text-meta text-muted">
          {byes === 1 ? 'El 1.º pasa directo' : `Los ${byes} primeros pasan directo`} a la segunda ronda (no son potencia de 2).
        </p>
      )}

      {rounds > 0 && (
        <Card className="grid gap-3 p-4 sm:grid-cols-2">
          {bestOf.map((b, i) => (
            <label key={i} className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted">{roundName(i + 1, rounds)}</span>
              <Select
                value={b}
                className="h-11"
                onChange={(e) => {
                  const next = [...bestOf];
                  next[i] = Number(e.target.value);
                  setTouched(true);
                  setBestOf(next);
                }}
              >
                {BEST_OF.map((n) => (
                  <option key={n} value={n}>
                    {bestOfLabel(n)}
                  </option>
                ))}
              </Select>
            </label>
          ))}
        </Card>
      )}

      {problem && <p className="mx-1 text-meta text-warn">{problem}</p>}
      <Button variant="primary" size="lg" className="w-full" loading={busy} disabled={!!problem} icon={<Trophy className="size-5" />} onClick={() => void submit()}>
        Armar playoffs
      </Button>
    </section>
  );
}
