import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowDown, ArrowUp, Plus, Trash2, Trophy, X } from 'lucide-react';
import { asBackendError } from '../../../lib/db/errors';
import { createPlayoffs, deletePlayoffs, syncPlayoffs, usePlayoffs, type Playoff, type PlayoffSeries } from '../../../lib/data/playoffs';
import type { Match } from '../../../lib/data/matches';
import { useNow } from '../../../lib/useNow';
import type { Season } from '../../../lib/seasons';
import { BracketView } from '../../../components/match';
import { useAction, useFeedback } from '../../../components/feedback';
import { ScorersButton } from '../../../components/scorers/ScorersButton';
import { SeasonBar, useStandingsSeason } from '../../../components/season/SeasonView';
import { Badge, Button, Card, Empty, ListSkeleton, LoadError, Select, cx } from '../../../components/ui';
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
import { SectionHead, TeamName } from './TeamBits';
import { PlayoffPrizes } from './TeamPrizes';
import type { TeamLeague } from './useTeamLeague';

/**
 * Playoffs de la temporada (/l/:lid/playoffs; baloncesto, fútbol y sala): la llave como el cuadro del torneo
 * relámpago, con el marcador de cada serie («2–1»), el juego que sigue de cada serie y los ya jugados. El admin arma
 * el playoff con los primeros de la tabla (o los que elija, en el orden que quiera) y al mejor de cuántos va cada
 * ronda; la base programa cada juego (sin fecha: la pone el admin en el partido) y pasa al ganador de ronda.
 * `tableIds` = la tabla de la temporada de ahora (ids en orden) para proponer la siembra.
 */
export function PlayoffsPage({ tl, tableIds, renderMatch }: { tl: TeamLeague; tableIds: readonly string[]; renderMatch: (m: Match) => ReactNode }) {
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

  return (
    <div className="flex flex-col gap-4">
      <SeasonBar seasons={picked.seasons} selected={picked.selected} onChange={picked.setSelected} awards={false} />
      {playoffs.error && !playoffs.data.length ? (
        <LoadError error={playoffs.error} />
      ) : playoffs.loading && !playoffs.data.length ? (
        <ListSkeleton rows={4} />
      ) : main ? (
        <PlayoffView tl={tl} playoff={main} renderMatch={renderMatch} />
      ) : canCreate && current ? (
        ready ? (
          <PlayoffCreator tl={tl} season={season} tableIds={tableIds} />
        ) : (
          <ListSkeleton rows={4} />
        )
      ) : (
        <Empty icon={<Trophy className="size-8" />} title="Sin playoffs en esta temporada">
          {season?.status === 'closed'
            ? 'Esta temporada se cerró sin playoffs.'
            : 'Cuando el admin arme los playoffs con los primeros de la tabla, la llave sale aquí.'}
        </Empty>
      )}
    </div>
  );
}

/** Nombre del equipo (el de ahora; si se borró, el que se copió en la serie). */
const nameFor = (tl: TeamLeague) => (teamId: string | null, label: string | null) => tl.teamOf(teamId)?.name ?? label ?? 'Por definir';

function PlayoffView({ tl, playoff, renderMatch }: { tl: TeamLeague; playoff: Playoff; renderMatch: (m: Match) => ReactNode }) {
  const now = useNow(60_000).getTime();
  const run = useAction();
  const { confirm } = useFeedback();
  const [busy, setBusy] = useState(false);
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

  const remove = async () => {
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold tracking-tight">{playoff.name}</h1>
        <Badge tone={playoff.status === 'finished' ? 'ok' : 'accent'}>{playoff.status === 'finished' ? 'Terminado' : 'En juego'}</Badge>
      </div>
      {champion && (
        <Card className="flex items-center gap-3 p-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <Trophy className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted">Campeón del playoff</p>
            <p className="truncate font-semibold">{name(champion, labels.get(champion) ?? null)}</p>
          </div>
        </Card>
      )}
      <PlayoffPrizes tl={tl} playoff={playoff} />
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
      {shown.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHead title="Series" />
          {shown.map((s) => (
            <SeriesCard key={s.id} tl={tl} playoff={playoff} series={s} now={now} renderMatch={renderMatch} />
          ))}
        </section>
      )}
      {tl.isAdmin && (
        <div className="flex flex-wrap items-center gap-2">
          {/* La mesa de los playoffs: quién anota sus juegos. */}
          <ScorersButton
            labeled
            className="h-11"
            target={{ scope: 'playoff', refId: playoff.id, title: playoff.name }}
            participants={playoff.seeds.flatMap((id) => tl.teamOf(id)?.roster.map((r) => r.playerId) ?? [])}
          />
          <Button variant="ghost" className="min-h-11 text-danger" icon={<Trash2 className="size-4" />} loading={busy} onClick={() => void remove()}>
            Borrar playoffs
          </Button>
        </div>
      )}
    </div>
  );
}

function SeriesCard({
  tl,
  playoff,
  series: s,
  now,
  renderMatch,
}: {
  tl: TeamLeague;
  playoff: Playoff;
  series: PlayoffSeries;
  now: number;
  renderMatch: (m: Match) => ReactNode;
}) {
  const name = nameFor(tl);
  const games = seriesGames(s.id, tl.matches.data);
  const next = s.winner ? null : nextGame(s.id, tl.matches.data, now);
  const played = games.filter((g) => g !== next);
  const line = (teamId: string | null, label: string | null, seed: number | null, wins: number) => (
    <div className={cx('flex items-center gap-2', s.winner && s.winner !== teamId && 'text-muted')}>
      {seed != null && <span className="w-5 text-right text-xs text-muted tabular-nums">{seed}</span>}
      <TeamName team={tl.teamOf(teamId)} label={label ?? 'Por definir'} className={cx('min-w-0 flex-1 truncate', s.winner === teamId && 'font-semibold')} />
      <span className="text-lg font-bold tabular-nums">{wins}</span>
    </div>
  );
  return (
    <Card className="flex flex-col gap-3 p-4">
      {/* El cuadro salta aquí: el margen deja el título debajo de la barra de arriba (fija). */}
      <div id={`serie-${seriesKey(s)}`} className="flex scroll-mt-24 items-center gap-2 text-xs text-muted">
        <span className="font-semibold text-fg">{seriesRoundName(s, playoff)}</span>
        <span>
          · {bestOfLabel(s.bestOf)}
          {s.bestOf > 1 ? ` (gana el primero en llegar a ${winsNeeded(s.bestOf)})` : ''}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {line(s.teamA, s.labelA, s.seedA, s.winsA)}
        {line(s.teamB, s.labelB, s.seedB, s.winsB)}
      </div>
      <p className="text-sm font-medium">
        {seriesLine(s, name)}
        {!s.winner && (s.winsA > 0 || s.winsB > 0) && <span className="text-muted"> · serie {seriesScore(s)}</span>}
      </p>
      {next && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Próximo juego</p>
          {renderMatch(next)}
          {tl.isAdmin && !next.scheduledAt && <p className="text-xs text-muted">Sin fecha todavía: ábrelo para ponerle día, hora y cancha.</p>}
        </div>
      )}
      {played.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line text-sm">
          {played.map((g) => (
            <li key={g.id}>
              <Link to={`${tl.base}/juegos?partido=${g.id}`} className="flex min-h-11 items-center gap-2 px-3 py-2 hover:bg-surface-2">
                <span className="min-w-0 flex-1 truncate">{g.stage || 'Juego'}</span>
                <span className="truncate text-muted">{gameResult(tl, g)}</span>
              </Link>
            </li>
          ))}
        </ul>
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
 * Admin: arma el playoff. Propone los primeros de la tabla (4 u 8) en su orden; se puede cambiar cuántos, el orden
 * (la siembra) y al mejor de cuántos va cada ronda. Mientras el admin no toque nada, la propuesta sigue a la tabla
 * (si llegan partidos o equipos después de abrirlo).
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
    <Card className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <Trophy className="size-5 text-accent" /> Armar playoffs
        </h2>
        <p className="text-sm text-muted">
          El 1.º juega contra el último, el 2.º contra el penúltimo… Cada serie es al mejor de los juegos que elijas: el primero que llegue a las victorias pasa de ronda.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Cuántos equipos">
        {sizes.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setSeedList(topSeeds(ordered, n))}
            className={cx(
              'min-h-11 rounded-full px-4 text-sm font-medium transition',
              seeds.length === n && seeds.every((id, i) => ordered[i] === id) ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted hover:text-fg',
            )}
          >
            Los {n} primeros
          </button>
        ))}
      </div>

      <ol className="flex flex-col divide-y divide-line rounded-xl border border-line">
        {seeds.map((id, i) => (
          <li key={id} className="flex min-h-11 items-center gap-2 px-3 py-1.5">
            <span className="w-6 text-right text-sm font-semibold text-muted tabular-nums">{i + 1}</span>
            <TeamName team={tl.teamOf(id)} label="(equipo borrado)" className="min-w-0 flex-1 truncate" />
            <Button variant="ghost" className="h-11 w-11" aria-label="Subir" disabled={i === 0} icon={<ArrowUp className="size-4" />} onClick={() => move(i, -1)} />
            <Button
              variant="ghost"
              className="h-11 w-11"
              aria-label="Bajar"
              disabled={i === seeds.length - 1}
              icon={<ArrowDown className="size-4" />}
              onClick={() => move(i, 1)}
            />
            <Button variant="ghost" className="h-11 w-11" aria-label="Quitar" icon={<X className="size-4" />} onClick={() => setSeedList(seeds.filter((x) => x !== id))} />
          </li>
        ))}
      </ol>
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
            className="h-11"
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
        <p className="text-sm text-muted">
          {byes === 1 ? 'El 1.º pasa directo' : `Los ${byes} primeros pasan directo`} a la segunda ronda (no son potencia de 2).
        </p>
      )}

      {rounds > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
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
        </div>
      )}

      {problem && <p className="text-sm text-warn">{problem}</p>}
      <Button variant="primary" className="h-11 self-start" loading={busy} disabled={!!problem} icon={<Trophy className="size-4" />} onClick={() => void submit()}>
        Armar playoffs
      </Button>
    </Card>
  );
}
