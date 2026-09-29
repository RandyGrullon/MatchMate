import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CalendarPlus, CalendarRange, Flag, History, Pencil, Plus, Trash2, Trophy } from 'lucide-react';
import { asBackendError } from '../../lib/db/errors';
import { closeSeason, startSeason } from '../../lib/data/seasonAdmin';
import { useLeagueSeasons } from '../../lib/data/seasons';
import { useLeagueCtx } from '../../lib/league';
import type { Season } from '../../lib/seasons';
import { todayIn } from '../../pages/sports/racket/logic/time';
import { leagueSport, sportMeta } from '../../sports/registry';
import { hasScreens, useSportScreens } from '../../sports/screens';
import { useFeedback } from '../feedback';
import { Badge, Button, Card, Empty, Field, Input, ListSkeleton, LoadError, Modal, Select, Skeleton, cx } from '../ui';
import { useBowlingSeasonTable } from './bowlingTable';
import {
  AWARD_LABEL,
  awardsArg,
  awardsProblem,
  initialAwards,
  makeSnapshot,
  newOtherAward,
  newSeasonDefaults,
  newSeasonProblem,
  parseSnapshot,
  playerRef,
  seasonDates,
  shortDay,
  teamRef,
  withStartDate,
  type AwardDraft,
  type Awardee,
  type NewSeasonInput,
  type SeasonTableResult,
} from './logic';
import { SnapshotTables } from './SeasonView';

type UseTable = (season: Season) => SeasonTableResult;

/** Deporte sin tabla propia: sin foto, con los jugadores de la liga para los premios. */
const noTable: UseTable = () => ({ loading: false, snapshot: makeSnapshot('', []), teams: [], players: [] });

/** Mensaje de un error de close_season / start_season. */
function errorText(e: unknown, fallback: string): string {
  const be = asBackendError(e);
  const code = (be?.message ?? (e instanceof Error ? e.message : '')).trim().split(/[\s:]/)[0];
  if (be?.kind === 'network') return 'Sin conexión. Intenta de nuevo cuando vuelva la señal.';
  if (be?.kind === 'permission') return 'Solo los admins de la liga manejan las temporadas.';
  if (code === 'invalido') return fallback;
  return 'No se pudo guardar. Intenta de nuevo.';
}

/**
 * Admin › Temporada (todas las ligas, no los torneos sueltos): la temporada en curso con sus fechas, «Cerrar
 * temporada» (se ve la tabla final, se proponen campeón, subcampeón y tercero de la tabla —o de la final del
 * playoff— y se pueden cambiar; MVP, más mejorado, fair play y otros premios opcionales; avisa a la liga) y «Nueva
 * temporada» (nombre, fechas y, en las ligas de equipos, copiar los equipos). Una cerrada se puede corregir.
 */
export default function SeasonAdmin() {
  const { lid, league, base } = useLeagueCtx();
  const sport = leagueSport(league);
  const bowling = sport === 'bowling';
  const screens = useSportScreens(bowling ? null : sport);
  const seasons = useLeagueSeasons(lid);
  const [closing, setClosing] = useState<Season | null>(null);
  const [starting, setStarting] = useState(false);
  const useTable: UseTable = bowling ? useBowlingSeasonTable : (screens?.useSeasonTable ?? noTable);
  // Las pantallas del deporte llegan aparte (con su tabla): mientras tanto no se abre el cierre.
  const waiting = !bowling && hasScreens(sport) && !screens;
  const list = seasons.data;
  const active = list.find((s) => s.status === 'active') ?? null;
  const lastClosed = list.find((s) => s.status === 'closed') ?? null;
  const teamSport = sportMeta(sport)?.family === 'team';

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold tracking-tight">Temporada</h2>
        <p className="text-sm text-muted">
          Al cerrar la temporada se guarda la tabla final con sus campeones y se avisa a la liga. Después empiezas la nueva: la tabla vuelve a cero y las
          anteriores quedan en el historial.
        </p>
      </div>
      {seasons.error && !list.length ? (
        <LoadError error={seasons.error} />
      ) : seasons.loading && !list.length ? (
        <ListSkeleton rows={2} />
      ) : !list.length ? (
        <Empty icon={<CalendarRange className="size-8" />} title="Sin temporadas">
          Esta liga todavía no tiene temporada. Actualiza la app o vuelve a entrar.
        </Empty>
      ) : (
        <>
          {active ? (
            <Card className="flex flex-col gap-3 p-4">
              <SeasonHead season={active} />
              <Button variant="primary" className="h-11 self-start" icon={<Flag className="size-4" />} disabled={waiting} onClick={() => setClosing(active)}>
                Cerrar temporada
              </Button>
              <p className="text-xs text-muted">Para empezar la nueva temporada, primero cierra esta.</p>
            </Card>
          ) : (
            <Card className="flex flex-col gap-3 p-4">
              <p className="text-sm">
                No hay temporada en curso{lastClosed ? `: ${lastClosed.name} está cerrada` : ''}. Los juegos que se jueguen ahora no cuentan en ninguna tabla hasta que
                empieces la nueva.
              </p>
              <Button variant="primary" className="h-11 self-start" icon={<CalendarPlus className="size-4" />} onClick={() => setStarting(true)}>
                Nueva temporada
              </Button>
            </Card>
          )}
          {lastClosed && (
            <Card className="flex flex-col gap-3 p-4">
              <SeasonHead season={lastClosed} />
              <Button className="h-11 self-start" icon={<Pencil className="size-4" />} disabled={waiting} onClick={() => setClosing(lastClosed)}>
                Corregir premios
              </Button>
            </Card>
          )}
          <Link to={`${base}/temporadas`} className="flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-accent">
            <History className="size-4" /> Historial de temporadas
          </Link>
        </>
      )}
      {closing && (
        <CloseSeasonModal key={`${sport}:${closing.id}`} season={closing} useTable={useTable} onClose={() => setClosing(null)} />
      )}
      {starting && <StartSeasonModal seasons={list} teamSport={teamSport} onClose={() => setStarting(false)} />}
    </div>
  );
}

function SeasonHead({ season }: { season: Season }) {
  const champion = season.awards.find((a) => a.kind === 'campeon');
  return (
    <div className="flex items-start gap-3">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        {season.status === 'active' ? <CalendarRange className="size-5" /> : <Trophy className="size-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold">{season.name}</p>
          <Badge tone={season.status === 'active' ? 'accent' : 'neutral'}>{season.status === 'active' ? 'En curso' : 'Cerrada'}</Badge>
        </div>
        <p className="text-xs text-muted">
          {season.status === 'active' && season.endsOn ? `${shortDay(season.startsOn)} – termina el ${shortDay(season.endsOn)} (previsto)` : seasonDates(season)}
        </p>
        {champion && <p className="mt-1 truncate text-sm">Campeón: {champion.name}</p>}
      </div>
    </div>
  );
}

/** Opciones de a quién va un premio: equipos (o parejas) y jugadores. */
function AwardeeSelect({
  value,
  onChange,
  teams,
  players,
  label,
  teamWord,
}: {
  value: string;
  onChange: (v: string) => void;
  teams: readonly Awardee[];
  players: readonly Awardee[];
  label: string;
  teamWord: string;
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="h-11">
      <option value="">Nadie</option>
      {teams.length > 0 && (
        <optgroup label={teamWord}>
          {teams.map((t) => (
            <option key={t.id} value={teamRef(t.id)}>
              {t.name}
            </option>
          ))}
        </optgroup>
      )}
      {players.length > 0 && (
        <optgroup label="Jugadores">
          {players.map((p) => (
            <option key={p.id} value={playerRef(p.id)}>
              {p.name}
            </option>
          ))}
        </optgroup>
      )}
    </Select>
  );
}

/**
 * Cerrar (o corregir) la temporada: la tabla final como se va a guardar y los premios. Al corregir una cerrada se
 * guarda la misma tabla y solo cambian los premios (sin avisar otra vez).
 */
export function CloseSeasonModal({ season, useTable, onClose }: { season: Season; useTable: UseTable; onClose: () => void }) {
  const { lid, league } = useLeagueCtx();
  const { toast, confirm } = useFeedback();
  const table = useTable(season);
  const closed = season.status === 'closed';
  const saved = useMemo(() => (closed ? parseSnapshot(season.standings) : null), [closed, season.standings]);
  const snapshot = saved ?? table.snapshot;
  const [awards, setAwards] = useState<AwardDraft[] | null>(() => (table.loading ? null : initialAwards(snapshot, season, table.suggested, table.podium)));
  const [others, setOthers] = useState(0);
  const [busy, setBusy] = useState(false);
  // Los premios se proponen cuando la tabla termina de cargar (con los datos que ya hay en el teléfono, de una vez).
  useEffect(() => {
    if (!awards && !table.loading) setAwards(initialAwards(snapshot, season, table.suggested, table.podium));
  }, [awards, table.loading, snapshot, season, table.suggested, table.podium]);

  // Quien ya tenía un premio aunque ya no esté en la lista (se borró de un equipo) sigue saliendo.
  const players = useMemo(() => {
    const extra = season.awards.filter((a) => a.playerId && !table.players.some((p) => p.id === a.playerId)).map((a) => ({ id: a.playerId!, name: a.name }));
    const fromTable = snapshot.tables.flatMap((t) => t.rows.filter((r) => r.playerId && !table.players.some((p) => p.id === r.playerId)).map((r) => ({ id: r.playerId!, name: r.name })));
    const all = [...table.players, ...extra, ...fromTable];
    return all.filter((p, i) => all.findIndex((x) => x.id === p.id) === i).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [table.players, season.awards, snapshot]);
  const teams = useMemo(() => {
    const extra = season.awards.filter((a) => a.teamId && !table.teams.some((t) => t.id === a.teamId)).map((a) => ({ id: a.teamId!, name: a.name }));
    const fromTable = snapshot.tables.flatMap((t) => t.rows.filter((r) => r.teamId && !table.teams.some((x) => x.id === r.teamId)).map((r) => ({ id: r.teamId!, name: r.name })));
    const all = [...table.teams, ...extra, ...fromTable];
    return all.filter((t, i) => all.findIndex((x) => x.id === t.id) === i).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [table.teams, season.awards, snapshot]);

  const teamWord = sportMeta(leagueSport(league))?.family === 'racket' ? 'Parejas' : 'Equipos';
  const problem = awards ? awardsProblem(awards) : null;
  const fromPlayoff = !closed && season.playoffs.some((p) => p.status === 'finished' && p.champion);
  // Un playoff a medias: su final todavía no se juega y el campeón saldría de la tabla.
  const running = !closed && season.playoffs.some((p) => p.status === 'active');
  const podiumNote = closed || fromPlayoff || table.podium === undefined
    ? null
    : table.podium
      ? 'El campeón y el subcampeón salen de la final del cuadro. Puedes cambiarlos.'
      : 'La tabla va por grupos: elige tú el campeón, el subcampeón y el tercero.';
  const set = (key: string, patch: Partial<AwardDraft>) => setAwards((list) => list?.map((a) => (a.key === key ? { ...a, ...patch } : a)) ?? list);

  const save = async () => {
    if (!awards || problem) return;
    if (
      running &&
      !(await confirm({
        title: '¿Cerrar con los playoffs en juego?',
        message: `La final todavía no se juega. Si cierras ahora, los juegos que falten no cuentan en ${season.name} y el aviso sale con el campeón que elijas.`,
        confirmText: 'Cerrar igual',
        danger: true,
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      await closeSeason(lid, season.id, snapshot, awardsArg(awards));
      toast(closed ? 'Premios corregidos' : `${season.name} cerrada: se avisó a la liga`);
      onClose();
    } catch (e) {
      console.error(e);
      toast(errorText(e, 'Revisa los premios: cada uno tiene que ir a un jugador o equipo de la liga.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={closed ? `Corregir ${season.name}` : `Cerrar ${season.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={!awards || !!problem} icon={<Flag className="size-4" />} onClick={() => void save()}>
            {closed ? 'Guardar premios' : 'Cerrar temporada'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-sm text-muted">
          {closed
            ? saved
              ? 'La tabla guardada no cambia. Los premios se reemplazan y no se avisa otra vez a la liga.'
              : 'No tenía tabla guardada: se guarda la de sus juegos, como está hoy. Los premios se reemplazan y no se avisa otra vez a la liga.'
            : `Se guarda la tabla como está hoy y se avisa a la liga. Los juegos que se jueguen después de hoy ya no cuentan en ${season.name}.`}
        </p>
        {running && (
          <p role="alert" className="rounded-xl border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn">
            Los playoffs no han terminado: el campeón saldrá de la final. Si cierras ahora, los juegos que falten no cuentan en esta temporada.
          </p>
        )}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-muted">Tabla final</h3>
          {table.loading && !saved ? (
            <ListSkeleton rows={4} />
          ) : snapshot.tables.length ? (
            <SnapshotTables snapshot={snapshot} />
          ) : (
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">Todavía no hay resultados en esta temporada: se guarda sin tabla.</p>
          )}
        </section>
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-muted">Premios</h3>
          {fromPlayoff && <p className="text-xs text-muted">El campeón y el subcampeón salen de la final del playoff. Puedes cambiarlos.</p>}
          {podiumNote && <p className="text-xs text-muted">{podiumNote}</p>}
          {!awards ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : (
            <>
              {awards.map((a) =>
                a.kind === 'otro' ? (
                  <div key={a.key} className="flex flex-col gap-2 rounded-xl border border-line p-3">
                    <div className="flex items-end gap-2">
                      <Field label="Premio" className="min-w-0 flex-1">
                        <Input value={a.label} maxLength={40} placeholder="Mejor portero" onChange={(e) => set(a.key, { label: e.target.value })} />
                      </Field>
                      <Button
                        variant="ghost"
                        className="h-11 w-11 text-danger"
                        aria-label="Quitar este premio"
                        icon={<Trash2 className="size-4" />}
                        onClick={() => setAwards((list) => list?.filter((x) => x.key !== a.key) ?? list)}
                      />
                    </div>
                    <AwardeeSelect value={a.ref} onChange={(v) => set(a.key, { ref: v })} teams={teams} players={players} label={a.label || 'Otro premio'} teamWord={teamWord} />
                    <Input value={a.note} maxLength={200} placeholder="Nota (opcional)" aria-label="Nota" onChange={(e) => set(a.key, { note: e.target.value })} />
                  </div>
                ) : (
                  <label key={a.key} className="flex flex-col gap-1.5">
                    <span className={cx('text-xs font-medium', a.kind === 'campeon' ? 'text-fg' : 'text-muted')}>
                      {AWARD_LABEL[a.kind]}
                      {a.kind === 'mvp' || a.kind === 'mas_mejorado' || a.kind === 'fair_play' ? ' (opcional)' : ''}
                    </span>
                    <AwardeeSelect value={a.ref} onChange={(v) => set(a.key, { ref: v })} teams={teams} players={players} label={AWARD_LABEL[a.kind]} teamWord={teamWord} />
                  </label>
                ),
              )}
              <Button
                className="h-11 self-start"
                icon={<Plus className="size-4" />}
                onClick={() => {
                  setAwards((list) => [...(list ?? []), newOtherAward(others)]);
                  setOthers((n) => n + 1);
                }}
              >
                Otro premio
              </Button>
              {problem && <p className="text-sm text-warn">{problem}</p>}
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}

/** Nueva temporada: nombre, cuándo empieza y termina (previsto) y, en las ligas de equipos, copiar los equipos. */
export function StartSeasonModal({ seasons, teamSport, onClose }: { seasons: readonly Season[]; teamSport: boolean; onClose: () => void }) {
  const { lid, league } = useLeagueCtx();
  const { toast } = useFeedback();
  const [form, setForm] = useState<NewSeasonInput>(() => newSeasonDefaults([...seasons], todayIn(league.tz), teamSport));
  // Mientras el admin no cambie el nombre a mano, sigue al año de cuando empieza.
  const [nameTouched, setNameTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const problem = newSeasonProblem(form, [...seasons]);

  const save = async () => {
    if (problem) return;
    setBusy(true);
    try {
      await startSeason(lid, { name: form.name, startsOn: form.startsOn, endsOn: form.endsOn || null, copyTeams: teamSport && form.copyTeams });
      toast(`Empezó ${form.name.trim()}`);
      onClose();
    } catch (e) {
      console.error(e);
      toast(errorText(e, 'Revisa las fechas: tiene que empezar después de la temporada anterior y no puede haber otra en curso.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Nueva temporada"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={!!problem} icon={<CalendarPlus className="size-4" />} onClick={() => void save()}>
            Empezar temporada
          </Button>
        </>
      }
    >
      <form
        id="nueva-temporada"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Nombre">
          <Input
            value={form.name}
            maxLength={60}
            onChange={(e) => {
              setNameTouched(true);
              setForm({ ...form, name: e.target.value });
            }}
            className="h-11"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Empieza">
            <Input type="date" value={form.startsOn} onChange={(e) => setForm(withStartDate(form, e.target.value, seasons, nameTouched))} className="h-11" />
          </Field>
          <Field label="Termina (opcional)" hint="La fecha prevista. La temporada termina cuando la cierras.">
            <Input type="date" value={form.endsOn} min={form.startsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} className="h-11" />
          </Field>
        </div>
        {teamSport && (
          <label className="flex min-h-11 items-start gap-3 rounded-xl border border-line p-3">
            <input type="checkbox" checked={form.copyTeams} onChange={(e) => setForm({ ...form, copyTeams: e.target.checked })} className="mt-0.5 size-5 accent-accent" />
            <span className="text-sm">
              <span className="font-medium">Copiar los equipos de la temporada anterior</span>
              <span className="block text-xs text-muted">Con sus plantillas (dorsal, posición, capitán y delegado). Después puedes cambiarlos en Equipos.</span>
            </span>
          </label>
        )}
        {problem && <p className="text-sm text-warn">{problem}</p>}
      </form>
    </Modal>
  );
}
