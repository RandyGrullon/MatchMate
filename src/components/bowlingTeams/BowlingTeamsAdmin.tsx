import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Pencil, Plus, RefreshCw, Scale, Search, Shuffle, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { usePlayers } from '../../lib/data';
import {
  TEAM_COLORS,
  TEAM_SIZES,
  balancedLeagueTeams,
  colorOf,
  defaultTeamName,
  defaultTeamSize,
  deleteBowlingTeam,
  draftsFromGroups,
  rosterWith,
  rosterWithout,
  saveBowlingTeam,
  seededTeams,
  setBowlingTeams,
  teamAverageSum,
  teamColorAt,
  teamOf,
  useBowlingTeams,
  type BowlingTeam,
} from '../../lib/data/bowlingTeams';
import { useLeagueCtx } from '../../lib/league';
import type { Player } from '../../lib/types';
import { BusyIcon, useBusy } from '../busy';
import { useAction, useFeedback } from '../feedback';
import { Initials } from '../ranking/parts';
import { Button, Card, Field, Input, ListRow, ListSkeleton, LoadError, RowIcon, SectionHeader, Segmented, Sheet, cx, sectionLinkClass } from '../ui';
import { TeamDot, TeamMark, playersWord, useLeagueAverages } from './parts';

/**
 * Organizar › Equipos de una liga de boliche (docs/boliche-equipos-practicas-bolas.md §1): los equipos fijos, cada
 * uno con su color y sus jugadores (con su promedio). Se crean a mano o se generan todos de una vez («Al azar» o
 * «Parejos por promedio», con vista previa); cada jugador se toca para moverlo a otro equipo o sacarlo. Un jugador va
 * en un solo equipo; en los torneos de la liga, quien se inscribe entra solo a su equipo.
 */
export default function BowlingTeamsAdmin() {
  const { lid, league } = useLeagueCtx();
  const teams = useBowlingTeams(lid);
  const players = usePlayers(lid);
  const averages = useLeagueAverages(lid, league.tz);
  if (teams.error && !teams.data.length) return <LoadError error={teams.error} />;
  return <TeamsAdmin teams={teams.data} loading={(teams.loading && !teams.data.length) || (players.loading && !players.data.length)} players={players.data} averages={averages} />;
}

type Averages = ReadonlyMap<string, number>;

/** «3 jugadores · suma 540». */
const teamLine = (team: BowlingTeam, averages: Averages) => {
  const sum = teamAverageSum(
    team.players.map((p) => p.playerId),
    averages,
  );
  return `${playersWord(team.players.length)}${sum ? ` · suma ${sum}` : ''}`;
};

/** La pantalla con sus datos (sin leer nada: se prueba con renderToString). */
export function TeamsAdmin({ teams, loading, players, averages }: { teams: BowlingTeam[]; loading: boolean; players: Player[]; averages: Averages }) {
  const { base } = useLeagueCtx();
  const [editing, setEditing] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  // Las hojas siguen al equipo de la caché (cambia mientras están abiertas).
  const editingTeam = editing && editing !== 'nuevo' ? (teams.find((t) => t.id === editing) ?? null) : null;
  const adding = addingTo ? (teams.find((t) => t.id === addingTo) ?? null) : null;
  const member = memberId ? (players.find((p) => p.id === memberId) ?? null) : null;
  const assigned = new Set(teams.flatMap((t) => t.players.map((p) => p.playerId)));
  const free = players.filter((p) => !assigned.has(p.id));
  const avg = (id: string) => averages.get(id) ?? 0;
  const generate = (
    <Button variant="primary" size="lg" icon={<Shuffle className="size-5" />} disabled={players.length < 2} onClick={() => setGenerating(true)}>
      Generar equipos
    </Button>
  );

  return (
    <div className="flex flex-col gap-[26px]">
      <p className="-mt-2 text-meta text-muted">Cada jugador va en un solo equipo. En los torneos de la liga, quien se inscribe entra solo con su equipo.</p>

      {loading ? (
        <ListSkeleton rows={3} />
      ) : !teams.length ? (
        <Card className="flex flex-col items-stretch gap-3 p-5">
          <div className="mb-1">
            <p className="text-card-title">Todavía no hay equipos</p>
            <p className="mt-1 text-meta text-muted">
              {players.length >= 2 ? (
                'Genéralos al azar o parejos por promedio, o crea uno y elige sus jugadores.'
              ) : (
                <>
                  Primero agrega a los jugadores en{' '}
                  <Link to={`${base}/admin?tab=jugadores`} className="font-semibold text-accent">
                    Jugadores y miembros
                  </Link>
                  .
                </>
              )}
            </p>
          </div>
          {generate}
          <Button size="lg" icon={<Plus className="size-5" />} onClick={() => setEditing('nuevo')}>
            Crear un equipo
          </Button>
        </Card>
      ) : (
        <>
          {generate}
          <section aria-labelledby="equipos-fijos">
            <SectionHeader
              id="equipos-fijos"
              title={`Equipos (${teams.length})`}
              action={
                <button type="button" onClick={() => setEditing('nuevo')} className={sectionLinkClass} aria-haspopup="dialog">
                  <Plus aria-hidden="true" className="size-[18px]" strokeWidth={2.4} />
                  Nuevo equipo
                </button>
              }
            />
            <div className="flex flex-col gap-3.5">
              {teams.map((t, i) => (
                <Card key={t.id} className="overflow-hidden">
                  <div className="flex items-center gap-3.5 py-2 pr-2 pl-5">
                    <TeamMark name={t.name} color={colorOf(t, i)} />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[17px] font-semibold tracking-[-0.01em]">{t.name}</h3>
                      <p className="text-[13px] text-muted">{teamLine(t, averages)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditing(t.id)}
                      aria-label={`Nombre y color de ${t.name}`}
                      aria-haspopup="dialog"
                      className="grid size-11 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-fg"
                    >
                      <Pencil className="size-[18px]" />
                    </button>
                  </div>
                  {t.players.map((p) => (
                    <ListRow
                      key={p.playerId}
                      dense
                      leading={<Initials name={p.name} />}
                      title={p.name}
                      value={avg(p.playerId) || '—'}
                      onClick={() => setMemberId(p.playerId)}
                      ariaLabel={`${p.name}: mover o sacar del equipo`}
                      chevron={false}
                    />
                  ))}
                  <ListRow
                    dense
                    leading={
                      <RowIcon tone="accent">
                        <UserPlus className="size-5" />
                      </RowIcon>
                    }
                    title={<span className="text-accent">Agregar jugador</span>}
                    onClick={() => setAddingTo(t.id)}
                    ariaLabel={`Agregar jugador a ${t.name}`}
                    chevron={false}
                  />
                </Card>
              ))}
            </div>
          </section>
          {free.length > 0 && (
            <section aria-labelledby="sin-equipo">
              <SectionHeader id="sin-equipo" title={`Sin equipo (${free.length})`} />
              <Card className="overflow-hidden">
                {free.map((p) => (
                  <ListRow
                    key={p.id}
                    dense
                    leading={<Initials name={p.name} />}
                    title={p.name}
                    value={avg(p.id) || '—'}
                    onClick={() => setMemberId(p.id)}
                    ariaLabel={`${p.name}: poner en un equipo`}
                    chevron={false}
                  />
                ))}
              </Card>
            </section>
          )}
        </>
      )}

      <GenerateSheet open={generating} onClose={() => setGenerating(false)} players={players} teams={teams} averages={averages} />
      <TeamFormSheet
        open={editing != null}
        team={editingTeam}
        index={editingTeam ? teams.indexOf(editingTeam) : teams.length}
        onClose={() => setEditing(null)}
      />
      <AddPlayersSheet team={adding} teams={teams} players={players} averages={averages} onClose={() => setAddingTo(null)} />
      <PlayerSheet player={member} teams={teams} averages={averages} onClose={() => setMemberId(null)} />
    </div>
  );
}

// ---------- Generar ----------

export type GenerateMode = 'azar' | 'parejos';

/** El aviso antes de reemplazar los equipos de ahora. */
export function replaceMessage(current: number, next: number): string {
  const gone = Math.max(0, current - next);
  const now = current === 1 ? 'Se reemplaza el equipo de ahora' : `Se reemplazan los ${current} equipos de ahora`;
  const extra = gone ? ` y se ${gone === 1 ? 'borra 1 que sobra' : `borran ${gone} que sobran`}` : '';
  return `${now}${extra}. Los torneos que ya tienen sus equipos no cambian.`;
}

/**
 * «Generar equipos»: cómo (al azar o parejos por promedio), de a cuántos (2 a 6) y quiénes entran (todos, o tocar para
 * dejar a alguien fuera); abajo, cómo quedan. «Usar estos equipos» reemplaza los de ahora (con aviso si hay):
 * reutiliza sus nombres, colores e ids en orden.
 */
export function GenerateSheet({
  open,
  onClose,
  players,
  teams,
  averages,
  initialMode = 'azar',
  initialSeed,
}: {
  open: boolean;
  onClose: () => void;
  players: Player[];
  teams: BowlingTeam[];
  averages: Averages;
  initialMode?: GenerateMode;
  /** La semilla del azar al abrir (pruebas); sin ella, la hora. */
  initialSeed?: number;
}) {
  const { lid } = useLeagueCtx();
  const run = useAction();
  const { confirm } = useFeedback();
  const busy = useBusy();
  const [mode, setMode] = useState<GenerateMode>(initialMode);
  const [size, setSize] = useState(() => defaultTeamSize(players.length, teams));
  const [seed, setSeed] = useState(() => initialSeed ?? Date.now());
  const [out, setOut] = useState<ReadonlySet<string>>(() => new Set());
  const [choosing, setChoosing] = useState(false);
  // Cada vez que se abre, desde cero (como quedó la liga).
  const [seen, setSeen] = useState(open);
  if (open !== seen) {
    setSeen(open);
    if (open) {
      setMode(initialMode);
      setSize(defaultTeamSize(players.length, teams));
      setSeed(initialSeed ?? Date.now());
      setOut(new Set());
      setChoosing(false);
    }
  }

  const candidates = useMemo(
    () => players.filter((p) => !out.has(p.id)).map((p) => ({ id: p.id, name: p.name, average: averages.get(p.id) || p.averageOverride || 0 })),
    [players, out, averages],
  );
  const groups = useMemo(
    () => (mode === 'azar' ? seededTeams(candidates, size, seed) : balancedLeagueTeams(candidates, size)).map((g) => [...g].sort((a, b) => b.average - a.average || a.name.localeCompare(b.name, 'es'))),
    [mode, candidates, size, seed],
  );
  const drafts = draftsFromGroups(groups, teams);
  const sums = groups.map((g) => g.reduce((a, p) => a + p.average, 0));
  const spread = sums.length > 1 ? Math.max(...sums) - Math.min(...sums) : 0;
  const gone = Math.max(0, teams.length - groups.length);

  const use = async () => {
    if (busy.isBusy() || candidates.length < 2) return;
    if (teams.length) {
      const yes = await confirm({ title: '¿Cambiar los equipos?', message: replaceMessage(teams.length, drafts.length), confirmText: 'Cambiar' });
      if (!yes) return;
    }
    const ok = await busy.run('usar', () =>
      run(async () => {
        await setBowlingTeams(lid, drafts);
        return true;
      }, `${drafts.length} ${drafts.length === 1 ? 'equipo listo' : 'equipos listos'}`),
    );
    if (ok) onClose();
  };

  const toggle = (id: string) =>
    setOut((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Generar equipos"
      subtitle={`${playersWord(candidates.length)} → ${groups.length} ${groups.length === 1 ? 'equipo' : 'equipos'}`}
      footer={
        <Button variant="primary" size="lg" className="w-full" loading={busy.isBusy('usar')} disabled={candidates.length < 2 || busy.isBusy()} onClick={() => void use()}>
          Usar estos equipos
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pb-1">
        <div className="flex flex-col gap-2">
          <Segmented<GenerateMode>
            label="Cómo se arman"
            full
            options={[
              { key: 'azar', label: 'Al azar', icon: <Shuffle className="size-4" /> },
              {
                key: 'parejos',
                ariaLabel: 'Parejos por promedio',
                label: (
                  <>
                    Parejos<span className="max-[389px]:hidden"> por promedio</span>
                  </>
                ),
                icon: <Scale className="size-4" />,
              },
            ]}
            value={mode}
            onChange={setMode}
          />
          <p className="text-[13px] text-muted">
            {mode === 'azar'
              ? 'Cada vez que mezclas sale otro reparto.'
              : 'Sumas de promedio parejas y, cuando se puede, sin repetir categoría en un equipo.'}
          </p>
        </div>

        <Field label="Jugadores por equipo">
          <div role="radiogroup" aria-label="Jugadores por equipo" className="flex flex-wrap gap-2">
            {TEAM_SIZES.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={size === n}
                onClick={() => setSize(n)}
                className={cx(
                  'num grid size-11 place-items-center rounded-full text-body font-semibold tracking-normal transition',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                  size === n ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg hover:brightness-95',
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </Field>

        <section aria-labelledby="quienes-entran">
          <div className="flex items-center justify-between gap-3">
            <h3 id="quienes-entran" className="text-sm font-medium">
              Quiénes entran <span className="font-normal text-muted">· {candidates.length} de {players.length}</span>
            </h3>
            <button type="button" className={sectionLinkClass} aria-expanded={choosing} onClick={() => setChoosing((c) => !c)}>
              {choosing ? 'Listo' : 'Cambiar'}
            </button>
          </div>
          {choosing && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {players.map((p) => {
                const on = !out.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(p.id)}
                    className={cx(
                      'min-h-9 rounded-full px-3 text-sm font-medium transition',
                      on ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted line-through',
                    )}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section aria-labelledby="asi-quedan">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 id="asi-quedan" className="text-section">
              Así quedan
            </h3>
            {mode === 'azar' ? (
              <button type="button" className={sectionLinkClass} onClick={() => setSeed((s) => s + 1)}>
                <RefreshCw aria-hidden="true" className="mr-1 size-4" />
                Mezclar otra vez
              </button>
            ) : (
              <span className="text-[13px] text-muted">
                Diferencia: <b className="num text-fg">{spread}</b> pinos
              </span>
            )}
          </div>
          {gone > 0 && <p className="mb-2 text-[13px] text-warn">{gone === 1 ? 'Se borra 1 equipo que sobra.' : `Se borran ${gone} equipos que sobran.`}</p>}
          {candidates.length < 2 ? (
            <p className="text-meta text-muted">Hacen falta al menos 2 jugadores.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {drafts.map((d, i) => (
                <Card key={i} className="p-3.5 shadow-[inset_0_0_0_1px_var(--line)]">
                  <div className="mb-2 flex items-center gap-2.5">
                    <TeamDot color={d.color} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{d.name}</span>
                    <span className="num shrink-0 text-[13px] text-muted">suma {sums[i]}</span>
                  </div>
                  <ul className="flex flex-col gap-1 text-sm">
                    {groups[i].map((m) => (
                      <li key={m.id} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate">{m.name}</span>
                        <span className="num text-muted">{m.average || '—'}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </Sheet>
  );
}

// ---------- Un equipo: nombre y color, o borrarlo ----------

/** Nombre y color del equipo (crear o cambiar); borrar. */
export function TeamFormSheet({ open, team, index, onClose }: { open: boolean; team: BowlingTeam | null; index: number; onClose: () => void }) {
  const { lid } = useLeagueCtx();
  const run = useAction();
  const { confirm } = useFeedback();
  const busy = useBusy<'guardar' | 'borrar'>();
  const [name, setName] = useState(team?.name ?? '');
  const [color, setColor] = useState(team ? colorOf(team, index) : teamColorAt(index));
  const key = open ? (team?.id ?? 'nuevo') : null;
  const [seen, setSeen] = useState(key);
  if (key !== seen) {
    setSeen(key);
    if (open) {
      setName(team?.name ?? '');
      setColor(team ? colorOf(team, index) : teamColorAt(index));
    }
  }
  const fallback = team?.name ?? defaultTeamName(index);

  const save = async () => {
    const ok = await busy.run('guardar', () =>
      run(
        async () => {
          await saveBowlingTeam(lid, { id: team?.id ?? null, name: name.trim() || fallback, color, players: team ? null : [] });
          return true;
        },
        team ? 'Equipo guardado' : 'Equipo creado',
      ),
    );
    if (ok) onClose();
  };

  const remove = async () => {
    if (!team) return;
    const yes = await confirm({
      title: `¿Borrar ${team.name}?`,
      message: `${team.players.length ? `Sus ${playersWord(team.players.length)} quedan sin equipo. ` : ''}Los torneos que ya lo tienen no cambian.`,
      confirmText: 'Borrar',
      danger: true,
    });
    if (!yes) return;
    const ok = await busy.run('borrar', () =>
      run(async () => {
        await deleteBowlingTeam(lid, team.id);
        return true;
      }, 'Equipo borrado'),
    );
    if (ok) onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={team ? 'Nombre y color' : 'Nuevo equipo'}
      footer={
        <div className="flex gap-2.5">
          {team && (
            <DangerButton icon={<Trash2 className="size-5" />} loading={busy.isBusy('borrar')} disabled={busy.isBusy()} onClick={() => void remove()} label={`Borrar ${team.name}`} />
          )}
          <Button variant="primary" size="lg" className="flex-1" loading={busy.isBusy('guardar')} disabled={busy.isBusy()} onClick={() => void save()}>
            {team ? 'Guardar' : 'Crear equipo'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pb-1">
        <Field label="Nombre">
          <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={fallback} autoFocus />
        </Field>
        <Field label="Color">
          <div className="flex flex-wrap items-center gap-2.5">
            {TEAM_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={cx('size-10 rounded-full ring-offset-2 ring-offset-surface transition', color === c ? 'ring-2 ring-fg' : 'ring-1 ring-black/10')}
                style={{ background: c }}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              aria-label="Otro color"
              className="size-10 cursor-pointer rounded-full border border-line bg-transparent"
            />
          </div>
        </Field>
      </div>
    </Sheet>
  );
}

/** Botón rojo suave (borrar, sacar): solo ícono o con texto. */
function DangerButton({
  icon,
  label,
  children,
  loading,
  disabled,
  onClick,
  className,
}: {
  icon: ReactNode;
  label: string;
  children?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={children ? undefined : label}
      disabled={disabled || loading}
      onClick={onClick}
      className={cx(
        'inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-[15px] bg-danger-soft text-base font-semibold text-danger transition select-none active:scale-[0.97]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50',
        children ? 'px-4' : 'w-12',
        className,
      )}
    >
      <BusyIcon busy={!!loading} icon={icon} className="size-5" />
      {children}
    </button>
  );
}

// ---------- Agregar jugadores a un equipo ----------

/**
 * «Agregar a Equipo 1»: primero los que no tienen equipo y después los de otros equipos (entrar aquí los saca del
 * suyo). Cada toque guarda; la hoja queda abierta para agregar más.
 */
export function AddPlayersSheet({ team, teams, players, averages, onClose }: { team: BowlingTeam | null; teams: BowlingTeam[]; players: Player[]; averages: Averages; onClose: () => void }) {
  const { lid } = useLeagueCtx();
  const run = useAction();
  const busy = useBusy();
  const [q, setQ] = useState('');
  const [seen, setSeen] = useState(team?.id ?? null);
  if ((team?.id ?? null) !== seen) {
    setSeen(team?.id ?? null);
    setQ('');
  }
  const query = q.trim().toLowerCase();
  const others = team ? players.filter((p) => !team.players.some((m) => m.playerId === p.id) && p.name.toLowerCase().includes(query)) : [];
  const withTeam = others.map((p) => ({ p, from: teamOf(teams, p.id) }));
  const free = withTeam.filter((x) => !x.from);
  const moving = withTeam.filter((x) => x.from);

  const add = (p: Player) =>
    team &&
    busy.run(p.id, () =>
      run(
        () => saveBowlingTeam(lid, { id: team.id, name: team.name, color: team.color, players: rosterWith(team, p.id) }),
        `${p.name} entró a ${team.name}`,
      ),
    );

  const row = ({ p, from }: { p: Player; from: BowlingTeam | null }) => (
    <ListRow
      key={p.id}
      dense
      leading={<Initials name={p.name} />}
      title={p.name}
      subtitle={from ? `En ${from.name}: se cambia` : undefined}
      value={averages.get(p.id) || undefined}
      onClick={() => void add(p)}
      ariaLabel={`Agregar a ${p.name}${from ? ` (sale de ${from.name})` : ''}`}
      trailing={busy.isBusy(p.id) ? <BusyIcon busy className="size-5 text-faint" /> : <Plus aria-hidden="true" className="size-5 text-accent" />}
    />
  );

  return (
    <Sheet open={!!team} onClose={onClose} title={team ? `Agregar a ${team.name}` : 'Agregar jugador'} subtitle={team ? teamLine(team, averages) : undefined}>
      {team && (
        <div className="flex flex-col gap-4 pb-1">
          {players.length > 8 && (
            <label className="relative block">
              <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar jugador" aria-label="Buscar jugador" className="pl-9" />
            </label>
          )}
          {free.length > 0 && (
            <section aria-label="Sin equipo">
              <p className="mb-2 text-sm font-medium text-muted">Sin equipo</p>
              <Card className="overflow-hidden shadow-[inset_0_0_0_1px_var(--line)]">{free.map(row)}</Card>
            </section>
          )}
          {moving.length > 0 && (
            <section aria-label="En otro equipo">
              <p className="mb-2 text-sm font-medium text-muted">En otro equipo</p>
              <Card className="overflow-hidden shadow-[inset_0_0_0_1px_var(--line)]">{moving.map(row)}</Card>
            </section>
          )}
          {!others.length && <p className="text-meta text-muted">{query ? 'Nadie con ese nombre.' : 'Todos los jugadores de la liga ya están en este equipo.'}</p>}
        </div>
      )}
    </Sheet>
  );
}

// ---------- Un jugador: moverlo o sacarlo ----------

/** Tocar a un jugador: los otros equipos para moverlo (o ponerlo, si no tiene) y «Sacar del equipo». */
export function PlayerSheet({ player, teams, averages, onClose }: { player: Player | null; teams: BowlingTeam[]; averages: Averages; onClose: () => void }) {
  const { lid } = useLeagueCtx();
  const run = useAction();
  const busy = useBusy();
  const current = player ? teamOf(teams, player.id) : null;
  const others = teams.filter((t) => t.id !== current?.id);
  const average = player ? (averages.get(player.id) ?? 0) : 0;

  const moveTo = async (t: BowlingTeam) => {
    if (!player) return;
    const ok = await busy.run(t.id, () =>
      run(
        async () => {
          await saveBowlingTeam(lid, { id: t.id, name: t.name, color: t.color, players: rosterWith(t, player.id) });
          return true;
        },
        current ? `${player.name} pasó a ${t.name}` : `${player.name} entró a ${t.name}`,
      ),
    );
    if (ok) onClose();
  };

  const takeOut = async () => {
    if (!player || !current) return;
    const ok = await busy.run('sacar', () =>
      run(async () => {
        await saveBowlingTeam(lid, { id: current.id, name: current.name, color: current.color, players: rosterWithout(current, player.id) });
        return true;
      }, `${player.name} quedó sin equipo`),
    );
    if (ok) onClose();
  };

  return (
    <Sheet
      open={!!player}
      onClose={onClose}
      title={player?.name ?? 'Jugador'}
      subtitle={player ? [current ? current.name : 'Sin equipo', average ? `promedio ${average}` : ''].filter(Boolean).join(' · ') : undefined}
    >
      {player && (
        <div className="flex flex-col gap-4 pb-1">
          {others.length > 0 ? (
            <section aria-labelledby="mover-a">
              <p id="mover-a" className="mb-2 text-sm font-medium text-muted">
                {current ? 'Mover a' : 'Poner en'}
              </p>
              <Card className="overflow-hidden shadow-[inset_0_0_0_1px_var(--line)]">
                {others.map((t) => (
                  <ListRow
                    key={t.id}
                    dense
                    leading={<TeamMark name={t.name} color={colorOf(t, teams.indexOf(t))} />}
                    title={t.name}
                    subtitle={teamLine(t, averages)}
                    onClick={() => void moveTo(t)}
                    ariaLabel={`${current ? 'Mover' : 'Poner'} a ${player.name} en ${t.name}`}
                    trailing={busy.isBusy(t.id) ? <BusyIcon busy className="size-5 text-faint" /> : undefined}
                  />
                ))}
              </Card>
            </section>
          ) : (
            !current && <p className="text-meta text-muted">Crea un equipo primero.</p>
          )}
          {current && (
            <DangerButton
              icon={<UserMinus className="size-5" />}
              label={`Sacar de ${current.name}`}
              loading={busy.isBusy('sacar')}
              disabled={busy.isBusy()}
              onClick={() => void takeOut()}
              className="w-full"
            >
              Sacar de {current.name}
            </DangerButton>
          )}
        </div>
      )}
    </Sheet>
  );
}
