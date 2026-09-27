import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarPlus, Check, Gavel, Plus, Trash2, Trophy, X } from 'lucide-react';
import { compareMatches, hasResult, type Match } from '../../../lib/data/matches';
import { saveLeagueRules } from '../../../lib/data/teamSports';
import { SPORTS } from '../../../sports/registry';
import type { FootballConfig, FootballVariant } from '../../../sports/team/football';
import type { DisciplineConfig } from '../../../sports/team/discipline';
import type { FootballTableConfig, FootballTieBreak } from '../../../sports/team/standings';
import { useAction, useFeedback } from '../../../components/feedback';
import { Badge, Button, Card, Field, Input, Select, Tabs, cx } from '../../../components/ui';
import { rosterOf } from '../team/logic';
import { OfficialsList } from '../team/OfficialsList';
import { ScheduleBuilder, SingleMatchModal } from '../team/ScheduleBuilder';
import { TeamsManager } from '../team/TeamsManager';
import { TournamentAdvance, TournamentBuilder } from '../team/TournamentBuilder';
import { useTeamLeague, type TeamLeague } from '../team/useTeamLeague';
import { FOOTBALL_POSITIONS } from './bits';
import { deleteFootballSanction, saveFootballSanction, useFootballSanctions } from './data';
import { matchLink } from './FootballGames';
import {
  TIEBREAK_CHOICES,
  TIEBREAK_LABEL,
  describeConfig,
  describeDiscipline,
  disciplineFrom,
  footballConfigFrom,
  footballTableFrom,
  footballTeamRules,
  formatOf,
  knockoutRules,
  matchMinutes,
  templateOf,
  templateRules,
  templatesFor,
  variantOf,
  type FootballTemplateId,
} from './rules';
import { groupRanking, useFootballSeason } from './season';

type Tab = 'equipos' | 'calendario' | 'reglas' | 'comite';

/** Admin › Equipos (fútbol y sala): equipos y plantillas, calendario o torneo con anotadores, reglas y sanciones del comité. */
export default function FootballAdmin() {
  const tl = useTeamLeague();
  const [tab, setTab] = useState<Tab>('equipos');
  return (
    <div className="flex flex-col gap-4">
      <Tabs
        items={[
          { key: 'equipos', label: 'Equipos' },
          { key: 'calendario', label: 'Calendario' },
          { key: 'reglas', label: 'Reglas' },
          { key: 'comite', label: 'Comité' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'equipos' && <TeamsManager tl={tl} positions={FOOTBALL_POSITIONS} />}
      {tab === 'calendario' && <CalendarAdmin tl={tl} />}
      {tab === 'reglas' && <RulesAdmin tl={tl} />}
      {tab === 'comite' && <CommitteeAdmin tl={tl} />}
    </div>
  );
}

export function CalendarAdmin({ tl }: { tl: TeamLeague }) {
  const [building, setBuilding] = useState<'liga' | 'relampago' | null>(null);
  const [single, setSingle] = useState(false);
  const season = useFootballSeason(tl);
  const variant = variantOf(tl.league.sport);
  const config = footballConfigFrom(tl.rules.data, variant);
  const template = templateOf(tl.rules.data, variant);
  const few = tl.teams.data.length < 2;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<CalendarPlus className="size-4" />} disabled={few} onClick={() => setBuilding('liga')}>
          Armar calendario (liga)
        </Button>
        <Button icon={<Trophy className="size-4" />} disabled={few} onClick={() => setBuilding('relampago')}>
          Torneo relámpago
        </Button>
        <Button icon={<Plus className="size-4" />} disabled={few} onClick={() => setSingle(true)}>
          Partido suelto
        </Button>
      </div>
      {few && <p className="text-sm text-muted">Hacen falta 2 equipos o más.</p>}
      <TournamentAdvance tl={tl} rankGroup={(stage) => groupRanking(season, tl.matches.data, stage)} />
      <h2 className="font-semibold">Partidos por jugar y anotador de mesa</h2>
      <p className="text-sm text-muted">
        Si termina el partido quien está designado, el resultado queda final. Se puede designar a un admin, a un anotador de la liga o al capitán o delegado de uno
        de los dos equipos.
      </p>
      <OfficialsList tl={tl} linkOf={(m) => matchLink(tl.base, m.id)} />
      <ScheduleBuilder
        tl={tl}
        open={building === 'liga'}
        onClose={() => setBuilding(null)}
        format={variant}
        minutes={matchMinutes(config)}
        defaultDouble={template?.double ?? variant === 'football'}
      />
      <TournamentBuilder
        tl={tl}
        open={building === 'relampago'}
        onClose={() => setBuilding(null)}
        format={variant}
        slotMinutes={matchMinutes(config) - 5}
        knockoutRules={knockoutRules(tl.rules.data, variant)}
      />
      <SingleMatchModal tl={tl} open={single} onClose={() => setSingle(false)} format={variant} minutes={matchMinutes(config)} />
    </div>
  );
}

interface Draft {
  cfg: FootballConfig;
  table: FootballTableConfig;
  discipline: DisciplineConfig;
  minPlayers: number;
  reinforcements: number;
}

const num = (v: string, min: number, max: number, dflt: number) => {
  const n = Number(v);
  return v.trim() !== '' && Number.isInteger(n) && n >= min && n <= max ? n : dflt;
};

/** Reglas: una plantilla de un toque, o ajustar el partido, la tabla (puntos y desempates), la disciplina y la convocatoria. */
export function RulesAdmin({ tl }: { tl: TeamLeague }) {
  const run = useAction();
  const { confirm } = useFeedback();
  const variant: FootballVariant = variantOf(tl.league.sport);
  const current = tl.rules.data;
  const tpl = templateOf(current, variant);
  const teams = footballTeamRules(current, variant);
  const base: Draft = {
    cfg: footballConfigFrom(current, variant),
    table: footballTableFrom(current),
    discipline: disciplineFrom(current),
    minPlayers: teams.minPlayers,
    reinforcements: teams.reinforcements,
  };
  const [draft, setDraft] = useState<Draft | null>(null);
  const d = draft ?? base;
  const setCfg = (patch: Partial<FootballConfig>) => setDraft({ ...d, cfg: { ...d.cfg, ...patch } });
  const setTable = (patch: Partial<FootballTableConfig>) => setDraft({ ...d, table: { ...d.table, ...patch } });
  const setDisc = (patch: Partial<DisciplineConfig>) => setDraft({ ...d, discipline: { ...d.discipline, ...patch } });

  const applyTemplate = async (id: FootballTemplateId) => {
    const t = templatesFor(variant).find((x) => x.id === id)!;
    const yes = await confirm({
      title: `Usar «${t.name}»`,
      message: 'Los partidos nuevos usan estas reglas. Los que ya están creados se quedan con las suyas (se pueden jugar igual).',
      confirmText: 'Usar',
    });
    if (!yes) return;
    await run(() => saveLeagueRules(tl.lid, templateRules(id, variant, current)), 'Reglas guardadas');
    setDraft(null);
  };

  const oldTeams = typeof current.teams === 'object' && current.teams ? (current.teams as Record<string, unknown>) : {};
  const patch = {
    match: { ...d.cfg, variant },
    table: d.table,
    discipline: d.discipline,
    teams: { ...oldTeams, minPlayers: d.minPlayers, reinforcements: d.reinforcements, runningClock: d.cfg.clock !== 'stopped', template: formatOf(current) === 'relampago' ? 'relampago' : null },
  };
  // Las mismas validaciones que el registro del deporte (las que usa el formulario de la liga).
  const errors = draft ? SPORTS[variant].validateRules({ ...current, ...patch }) : [];
  const save = () =>
    run(async () => {
      await saveLeagueRules(tl.lid, patch);
      setDraft(null);
    }, 'Reglas guardadas');

  const tb = d.table.tiebreak;
  const moveTb = (i: number, dir: -1 | 1) => {
    const next = [...tb];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setTable({ tiebreak: next });
  };
  const missing = TIEBREAK_CHOICES.filter((k) => !tb.includes(k));

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Plantillas</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {templatesFor(variant).map((t) => {
            const active = tpl?.id === t.id;
            return (
              <Card key={t.id} className={cx('flex flex-col gap-2 p-4', active && 'border-accent')}>
                <div className="flex items-center gap-2">
                  <p className="flex-1 font-semibold">{t.name}</p>
                  {active && (
                    <Badge tone="accent">
                      <Check className="size-3" /> En uso
                    </Badge>
                  )}
                </div>
                <p className="flex-1 text-xs text-muted">{t.description}</p>
                <Button size="sm" variant={active ? 'secondary' : 'primary'} disabled={active} onClick={() => void applyTemplate(t.id)}>
                  {active ? 'En uso' : 'Usar esta'}
                </Button>
              </Card>
            );
          })}
        </div>
        <p className="text-sm text-muted">Ahora: {describeConfig(base.cfg)}.</p>
      </section>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="font-semibold">El partido</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Minutos de cada tiempo">
            <Input inputMode="numeric" value={String(d.cfg.halfMinutes)} onChange={(e) => setCfg({ halfMinutes: num(e.target.value, 1, 60, d.cfg.halfMinutes) })} />
          </Field>
          <Field label="Reloj">
            <Select value={d.cfg.clock} onChange={(e) => setCfg({ clock: e.target.value as FootballConfig['clock'] })}>
              <option value="running">Corrido (no se para)</option>
              <option value="stopped">Parado (se para en cada pitazo)</option>
              <option value="none">Sin reloj</option>
            </Select>
          </Field>
          <Field label="Jugadores en cancha por equipo">
            <Input inputMode="numeric" value={String(d.cfg.players)} onChange={(e) => setCfg({ players: num(e.target.value, 3, 11, d.cfg.players) })} />
          </Field>
          <Field label="Cambios">
            <Select
              value={d.cfg.subs.max === null ? 'libre' : String(d.cfg.subs.max)}
              onChange={(e) => setCfg({ subs: { ...d.cfg.subs, max: e.target.value === 'libre' ? null : Number(e.target.value) } })}
            >
              {[3, 5, 7].map((n) => (
                <option key={n} value={n}>
                  {n} cambios
                </option>
              ))}
              <option value="libre">Ilimitados</option>
            </Select>
          </Field>
          <Field label="Penales por equipo (eliminatoria)">
            <Select value={String(d.cfg.shootoutKicks)} onChange={(e) => setCfg({ shootoutKicks: Number(e.target.value) })}>
              <option value="3">3 y muerte súbita</option>
              <option value="5">5 y muerte súbita</option>
            </Select>
          </Field>
          <Field label="Prórroga (minutos por parte)">
            <Input inputMode="numeric" value={String(d.cfg.extraTimeMinutes)} onChange={(e) => setCfg({ extraTimeMinutes: num(e.target.value, 1, 30, d.cfg.extraTimeMinutes) })} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-5" checked={d.cfg.subs.reentry} onChange={(e) => setCfg({ subs: { ...d.cfg.subs, reentry: e.target.checked } })} />
          El que sale puede volver a entrar
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-5" checked={d.cfg.extraTime} onChange={(e) => setCfg({ extraTime: e.target.checked })} />
          Prórroga si empatan (partidos de eliminatoria)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-5" checked={d.cfg.shootout} onChange={(e) => setCfg({ shootout: e.target.checked })} />
          Penales si siguen empatados en todos los partidos (si no, solo en la eliminatoria del torneo)
        </label>
        {variant === 'futsal' && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={d.cfg.accumulatedFouls !== null}
                onChange={(e) => setCfg({ accumulatedFouls: e.target.checked ? { alertAt: 5, penaltyFrom: 6 } : null })}
              />
              Faltas acumuladas por mitad (alerta en la 5.ª, tiro desde 10 m desde la 6.ª)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-5" checked={d.cfg.timeoutsPerHalf > 0} onChange={(e) => setCfg({ timeoutsPerHalf: e.target.checked ? 1 : 0 })} />1 tiempo muerto por
              equipo en cada mitad
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-5" checked={d.cfg.powerPlayMs !== null} onChange={(e) => setCfg({ powerPlayMs: e.target.checked ? 120_000 : null })} />
              Tras una roja, 2 minutos con uno menos (o hasta que le marquen)
            </label>
          </>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="font-semibold">La tabla</h2>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Ganar">
            <Input inputMode="numeric" value={String(d.table.win)} onChange={(e) => setTable({ win: num(e.target.value, 0, 10, d.table.win) })} />
          </Field>
          <Field label="Empatar">
            <Input inputMode="numeric" value={String(d.table.draw)} onChange={(e) => setTable({ draw: num(e.target.value, 0, 10, d.table.draw) })} />
          </Field>
          <Field label="Perder">
            <Input inputMode="numeric" value={String(d.table.loss)} onChange={(e) => setTable({ loss: num(e.target.value, 0, 10, d.table.loss) })} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-5" checked={d.table.shootout !== null} onChange={(e) => setTable({ shootout: e.target.checked ? { win: 2, loss: 1 } : null })} />
          Empate con penales: 2 puntos al que gana la tanda y 1 al otro (en vez de 1 y 1)
        </label>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">Si empatan en puntos, se desempata por (en orden):</p>
          <ol className="flex flex-col gap-1">
            {tb.map((k, i) => (
              <li key={k} className="flex items-center gap-1 rounded-xl bg-surface-2 px-3 py-1.5 text-sm">
                <span className="w-5 font-semibold tabular-nums">{i + 1}.</span>
                <span className="min-w-0 flex-1">{TIEBREAK_LABEL[k]}</span>
                <Button size="sm" variant="ghost" icon={<ArrowUp className="size-4" />} aria-label="Subir" disabled={i === 0} onClick={() => moveTb(i, -1)} />
                <Button size="sm" variant="ghost" icon={<ArrowDown className="size-4" />} aria-label="Bajar" disabled={i === tb.length - 1} onClick={() => moveTb(i, 1)} />
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<X className="size-4" />}
                  aria-label={`Quitar ${TIEBREAK_LABEL[k]}`}
                  disabled={tb.length <= 1}
                  onClick={() => setTable({ tiebreak: tb.filter((x) => x !== k) })}
                />
              </li>
            ))}
          </ol>
          {missing.length > 0 && (
            <Select value="" onChange={(e) => e.target.value && setTable({ tiebreak: [...tb, e.target.value as FootballTieBreak] })} aria-label="Agregar desempate">
              <option value="">Agregar un desempate…</option>
              {missing.map((k) => (
                <option key={k} value={k}>
                  {TIEBREAK_LABEL[k]}
                </option>
              ))}
            </Select>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-5" checked={d.table.lotSeed !== null} onChange={(e) => setTable({ lotSeed: e.target.checked ? tl.lid : null })} />
            Si todo sigue igual, sorteo automático (si no, comparten el puesto)
          </label>
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="font-semibold">Disciplina</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Partidos por roja directa">
            <Input inputMode="numeric" value={String(d.discipline.redMatches)} onChange={(e) => setDisc({ redMatches: num(e.target.value, 0, 20, d.discipline.redMatches) })} />
          </Field>
          <Field label="Partidos por doble amarilla">
            <Input
              inputMode="numeric"
              value={String(d.discipline.secondYellowMatches)}
              onChange={(e) => setDisc({ secondYellowMatches: num(e.target.value, 0, 20, d.discipline.secondYellowMatches) })}
            />
          </Field>
          <Field label="Amarillas para suspender">
            <Select value={String(d.discipline.yellowsForSuspension)} onChange={(e) => setDisc({ yellowsForSuspension: Number(e.target.value) })}>
              <option value="0">No se acumulan</option>
              {[2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} amarillas
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Partidos por acumular amarillas">
            <Input inputMode="numeric" value={String(d.discipline.yellowMatches)} onChange={(e) => setDisc({ yellowMatches: num(e.target.value, 0, 20, d.discipline.yellowMatches) })} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-5" checked={d.discipline.secondYellowCounts} onChange={(e) => setDisc({ secondYellowCounts: e.target.checked })} />
          Las amarillas de una doble amarilla también suman a la acumulación
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-5" checked={d.discipline.walkoverServes} onChange={(e) => setDisc({ walkoverServes: e.target.checked })} />
          Un W.O. cuenta como partido cumplido
        </label>
        <p className="text-xs text-muted">{describeDiscipline(d.discipline)}.</p>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="font-semibold">Convocatoria</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mínimo para jugar (avisa si hay menos «Voy»)">
            <Input inputMode="numeric" value={String(d.minPlayers)} onChange={(e) => setDraft({ ...d, minPlayers: num(e.target.value, 1, 30, d.minPlayers) })} />
          </Field>
          <Field label="Refuerzos por partido (fuera de la plantilla)">
            <Input inputMode="numeric" value={String(d.reinforcements)} onChange={(e) => setDraft({ ...d, reinforcements: num(e.target.value, 0, 30, d.reinforcements) })} />
          </Field>
        </div>
      </Card>

      {errors.length > 0 && (
        <ul role="alert" className="flex flex-col gap-0.5 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Button variant="primary" disabled={!draft || errors.length > 0} onClick={() => void save()}>
          Guardar reglas
        </Button>
        {draft && <Button onClick={() => setDraft(null)}>Deshacer cambios</Button>}
      </div>
      <p className="text-xs text-muted">Los partidos ya creados guardan sus reglas; los nuevos usan estas. La tabla y la disciplina se recalculan con las nuevas.</p>
    </div>
  );
}

/** Sanciones del comité: partidos de suspensión a mano (además de las automáticas por tarjetas). */
export function CommitteeAdmin({ tl }: { tl: TeamLeague }) {
  const run = useAction();
  const { confirm } = useFeedback();
  const sanctions = useFootballSanctions(tl.lid);
  const played = useMemo(() => tl.matches.data.filter((m) => hasResult(m) || m.status === 'live').sort((a, b) => compareMatches(b, a)), [tl.matches.data]);
  const [matchId, setMatchId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [count, setCount] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const match: Match | undefined = played.find((m) => m.id === matchId);
  const side = match?.sides.find((s) => s.teamId === teamId);
  const candidates = side ? [...new Set([...rosterOf(tl.teams.data, teamId).map((r) => r.playerId), ...side.players.map((p) => p.playerId)])] : [];
  const n = num(count, 1, 50, 0);
  const valid = !!match && !!side && !!playerId && n > 0;
  const nm = (m: Match, i: 0 | 1) => tl.teamOf(m.sides[i].teamId)?.name ?? m.sides[i].label;
  const matchText = (id: string) => {
    const m = tl.matches.data.find((x) => x.id === id);
    return m ? `${m.round != null ? `J${m.round} · ` : ''}${nm(m, 0)} vs. ${nm(m, 1)}` : 'partido borrado';
  };

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    const ok = await run(async () => {
      await saveFootballSanction(tl.lid, { matchId, teamId, playerId, matches: n, note });
      return true;
    }, 'Sanción guardada');
    setBusy(false);
    if (ok) {
      setPlayerId('');
      setNote('');
      setCount('1');
    }
  };
  const remove = async (id: string) => {
    const yes = await confirm({ title: 'Quitar la sanción', message: 'Los partidos que ya cumplió no cambian; los que le faltaban se borran.', confirmText: 'Quitar', danger: true });
    if (yes) await run(() => deleteFootballSanction(tl.lid, id), 'Sanción quitada');
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Las rojas y las amarillas acumuladas suspenden solas. Aquí se agregan los partidos que ponga el comité (agresión, reclamos…): se cumplen en los siguientes
        partidos que ese equipo juegue.
      </p>
      <Card className="flex flex-col gap-3 p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Gavel className="size-5 text-accent" /> Nueva sanción
        </h2>
        <Field label="Desde el partido">
          <Select
            value={matchId}
            onChange={(e) => {
              setMatchId(e.target.value);
              setTeamId('');
              setPlayerId('');
            }}
          >
            <option value="">{played.length ? 'Elige el partido…' : 'Todavía no hay partidos jugados'}</option>
            {played.map((m) => (
              <option key={m.id} value={m.id}>
                {matchText(m.id)}
                {typeof m.score?.text === 'string' ? ` (${m.score.text})` : ''}
              </option>
            ))}
          </Select>
        </Field>
        {match && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Equipo">
              <Select
                value={teamId}
                onChange={(e) => {
                  setTeamId(e.target.value);
                  setPlayerId('');
                }}
              >
                <option value="">Elige…</option>
                {match.sides
                  .filter((s) => s.teamId)
                  .map((s) => (
                    <option key={s.side} value={s.teamId!}>
                      {tl.teamOf(s.teamId)?.name ?? s.label}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Jugador">
              <Select value={playerId} disabled={!side} onChange={(e) => setPlayerId(e.target.value)}>
                <option value="">Elige…</option>
                {candidates.map((id) => (
                  <option key={id} value={id}>
                    {tl.nameOf(id)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Partidos de suspensión">
              <Input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, '').slice(0, 2))} />
            </Field>
            <Field label="Motivo (opcional)">
              <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Agresión al árbitro" />
            </Field>
          </div>
        )}
        <Button variant="primary" className="self-start" loading={busy} disabled={!valid} onClick={() => void save()}>
          Guardar sanción
        </Button>
      </Card>
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Sanciones del comité ({sanctions.data.length})</h2>
        {!sanctions.data.length ? (
          <p className="text-sm text-muted">No hay sanciones del comité.</p>
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {sanctions.data.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {tl.nameOf(s.playerId)} · {s.matches} {s.matches === 1 ? 'partido' : 'partidos'}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {tl.teamOf(s.teamId)?.name ?? 'Equipo'} · desde {matchText(s.matchId)}
                    {s.note ? ` · ${s.note}` : ''}
                  </span>
                </span>
                <Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="size-4" />} aria-label={`Quitar la sanción de ${tl.nameOf(s.playerId)}`} onClick={() => void remove(s.id)} />
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
