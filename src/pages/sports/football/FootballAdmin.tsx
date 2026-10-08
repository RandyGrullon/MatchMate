import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarPlus, Gavel, Plus, Trash2, Trophy, X } from 'lucide-react';
import { compareMatches, hasResult, type Match } from '../../../lib/data/matches';
import { saveLeagueRules } from '../../../lib/data/teamSports';
import { SPORTS } from '../../../sports/registry';
import type { FootballConfig, FootballVariant } from '../../../sports/team/football';
import type { DisciplineConfig } from '../../../sports/team/discipline';
import type { FootballTableConfig, FootballTieBreak } from '../../../sports/team/standings';
import { useBusy } from '../../../components/busy';
import { useAction, useFeedback } from '../../../components/feedback';
import { Button, Card, Field, Input, SectionHeader, Select } from '../../../components/ui';
import { AdminActions, AdminSegmented, SettingsCard, TemplateRows, ToggleRow, useAdminPart } from '../team/AdminParts';
import { rosterOf } from '../team/logic';
import { OfficialsList } from '../team/OfficialsList';
import { ScheduleBuilder, SingleMatchModal } from '../team/ScheduleBuilder';
import { TeamsManager } from '../team/TeamsManager';
import { TournamentAdvance, TournamentBuilder } from '../team/TournamentBuilder';
import { DangerButton } from '../team/TeamUi';
import { useTeamLeague, type TeamLeague } from '../team/useTeamLeague';
import { FOOTBALL_POSITIONS } from './bits';
import { deleteFootballSanction, saveFootballSanction, useFootballSanctions } from './data';
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

type Part = 'equipos' | 'partidos' | 'reglas' | 'comite';
const PARTS: readonly { key: Part; label: string }[] = [
  { key: 'equipos', label: 'Equipos' },
  { key: 'partidos', label: 'Partidos' },
  { key: 'reglas', label: 'Reglas' },
  { key: 'comite', label: 'Comité' },
];

/**
 * Organizar › Equipos (fútbol y sala), rediseño «Calma y foco»: un segmentado Equipos | Partidos | Reglas | Comité
 * (`?parte=`); los equipos y sus plantillas, armar el calendario o el torneo relámpago con el anotador de mesa de cada
 * partido, las reglas (una plantilla de un toque o a mano) y las sanciones del comité.
 */
export default function FootballAdmin() {
  const tl = useTeamLeague();
  const [part, setPart] = useAdminPart(PARTS.map((p) => p.key));
  return (
    <div className="flex flex-col gap-[26px]">
      <AdminSegmented options={PARTS} value={part} onChange={setPart} />
      {part === 'equipos' && <TeamsManager tl={tl} positions={FOOTBALL_POSITIONS} />}
      {part === 'partidos' && <CalendarAdmin tl={tl} />}
      {part === 'reglas' && <RulesAdmin tl={tl} />}
      {part === 'comite' && <CommitteeAdmin tl={tl} />}
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
    <div className="flex flex-col gap-[30px]">
      <AdminActions
        hint={few ? 'Hacen falta 2 equipos o más.' : undefined}
        actions={[
          { key: 'calendario', icon: CalendarPlus, title: 'Armar calendario (liga)', subtitle: 'Todos contra todos, con horas y canchas', onClick: () => setBuilding('liga'), disabled: few },
          { key: 'relampago', icon: Trophy, title: 'Torneo relámpago', subtitle: 'Grupos y la final, en un día', onClick: () => setBuilding('relampago'), disabled: few },
          { key: 'suelto', icon: Plus, title: 'Partido suelto', subtitle: 'Un amistoso, una final o uno aplazado', onClick: () => setSingle(true), disabled: few },
        ]}
      />
      <TournamentAdvance tl={tl} rankGroup={(stage) => groupRanking(season, tl.matches.data, stage)} />
      <section aria-labelledby="fb-anotadores">
        <SectionHeader id="fb-anotadores" title="Anotador de mesa" />
        <p className="mx-1 -mt-1.5 mb-3 text-meta text-muted">Si termina el partido quien está designado, el resultado queda final.</p>
        <OfficialsList tl={tl} />
      </section>
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
  // La plantilla que se está usando o «guardar»: la ruedita en ese botón.
  const busy = useBusy<FootballTemplateId | 'guardar'>();
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
    await busy.run(id, async () => {
      await run(() => saveLeagueRules(tl.lid, templateRules(id, variant, current)), 'Reglas guardadas');
      setDraft(null);
    });
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
    busy.run('guardar', () =>
      run(async () => {
        await saveLeagueRules(tl.lid, patch);
        setDraft(null);
      }, 'Reglas guardadas'),
    );

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
    <div className="flex flex-col gap-[30px]">
      <TemplateRows
        templates={templatesFor(variant)}
        active={tpl?.id}
        busy={(id) => busy.isBusy(id)}
        disabled={busy.isBusy()}
        onPick={(id) => void applyTemplate(id)}
        footer={`Ahora: ${describeConfig(base.cfg)}.`}
      />

      <SettingsCard id="fb-partido" title="El partido">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Minutos de cada tiempo">
            <Input inputMode="numeric" value={String(d.cfg.halfMinutes)} onChange={(e) => setCfg({ halfMinutes: num(e.target.value, 1, 60, d.cfg.halfMinutes) })} />
          </Field>
          <Field label="Reloj" className="col-span-2 sm:col-span-1">
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
          <Field label="Penales por equipo (eliminatoria)" className="col-span-2 sm:col-span-1">
            <Select value={String(d.cfg.shootoutKicks)} onChange={(e) => setCfg({ shootoutKicks: Number(e.target.value) })}>
              <option value="3">3 y muerte súbita</option>
              <option value="5">5 y muerte súbita</option>
            </Select>
          </Field>
          <Field label="Prórroga (minutos por parte)">
            <Input inputMode="numeric" value={String(d.cfg.extraTimeMinutes)} onChange={(e) => setCfg({ extraTimeMinutes: num(e.target.value, 1, 30, d.cfg.extraTimeMinutes) })} />
          </Field>
        </div>
        <div className="flex flex-col divide-y divide-line">
          <ToggleRow checked={d.cfg.subs.reentry} onChange={(v) => setCfg({ subs: { ...d.cfg.subs, reentry: v } })}>
            El que sale puede volver a entrar
          </ToggleRow>
          <ToggleRow checked={d.cfg.extraTime} onChange={(v) => setCfg({ extraTime: v })}>
            Prórroga si empatan (partidos de eliminatoria)
          </ToggleRow>
          <ToggleRow checked={d.cfg.shootout} onChange={(v) => setCfg({ shootout: v })}>
            Penales si siguen empatados en todos los partidos (si no, solo en la eliminatoria del torneo)
          </ToggleRow>
          {variant === 'futsal' && (
            <>
              <ToggleRow checked={d.cfg.accumulatedFouls !== null} onChange={(v) => setCfg({ accumulatedFouls: v ? { alertAt: 5, penaltyFrom: 6 } : null })}>
                Faltas acumuladas por mitad (alerta en la 5.ª, tiro desde 10 m desde la 6.ª)
              </ToggleRow>
              <ToggleRow checked={d.cfg.timeoutsPerHalf > 0} onChange={(v) => setCfg({ timeoutsPerHalf: v ? 1 : 0 })}>
                1 tiempo muerto por equipo en cada mitad
              </ToggleRow>
              <ToggleRow checked={d.cfg.powerPlayMs !== null} onChange={(v) => setCfg({ powerPlayMs: v ? 120_000 : null })}>
                Tras una roja, 2 minutos con uno menos (o hasta que le marquen)
              </ToggleRow>
            </>
          )}
        </div>
      </SettingsCard>

      <SettingsCard id="fb-tabla" title="La tabla">
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
        <ToggleRow checked={d.table.shootout !== null} onChange={(v) => setTable({ shootout: v ? { win: 2, loss: 1 } : null })}>
          Empate con penales: 2 puntos al que gana la tanda y 1 al otro (en vez de 1 y 1)
        </ToggleRow>
        <div className="flex flex-col gap-1.5">
          <p className="text-[15px] font-medium">Si empatan en puntos, se desempata por (en orden):</p>
          <ol className="flex flex-col gap-1">
            {tb.map((k, i) => (
              <li key={k} className="flex min-h-12 items-center gap-0.5 rounded-xl bg-surface-2 py-0.5 pr-0.5 pl-3 text-[15px]">
                <span className="num w-6 font-semibold text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1">{TIEBREAK_LABEL[k]}</span>
                <Button variant="ghost" size="lg" icon={<ArrowUp className="size-4" />} aria-label="Subir" disabled={i === 0} onClick={() => moveTb(i, -1)} />
                <Button variant="ghost" size="lg" icon={<ArrowDown className="size-4" />} aria-label="Bajar" disabled={i === tb.length - 1} onClick={() => moveTb(i, 1)} />
                <Button
                  variant="ghost"
                  size="lg"
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
          <ToggleRow checked={d.table.lotSeed !== null} onChange={(v) => setTable({ lotSeed: v ? tl.lid : null })}>
            Si todo sigue igual, sorteo automático (si no, comparten el puesto)
          </ToggleRow>
        </div>
      </SettingsCard>

      <SettingsCard id="fb-disciplina" title="Disciplina">
        <div className="grid grid-cols-2 gap-3">
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
        <div className="flex flex-col divide-y divide-line">
          <ToggleRow checked={d.discipline.secondYellowCounts} onChange={(v) => setDisc({ secondYellowCounts: v })}>
            Las amarillas de una doble amarilla también suman a la acumulación
          </ToggleRow>
          <ToggleRow checked={d.discipline.walkoverServes} onChange={(v) => setDisc({ walkoverServes: v })}>
            Un W.O. cuenta como partido cumplido
          </ToggleRow>
        </div>
        <p className="text-[13px] text-muted">{describeDiscipline(d.discipline)}.</p>
      </SettingsCard>

      <SettingsCard id="fb-convocatoria" title="Convocatoria">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mínimo para jugar">
            <Input inputMode="numeric" value={String(d.minPlayers)} onChange={(e) => setDraft({ ...d, minPlayers: num(e.target.value, 1, 30, d.minPlayers) })} />
          </Field>
          <Field label="Refuerzos por partido">
            <Input inputMode="numeric" value={String(d.reinforcements)} onChange={(e) => setDraft({ ...d, reinforcements: num(e.target.value, 0, 30, d.reinforcements) })} />
          </Field>
        </div>
        <p className="text-[13px] text-muted">Avisa si hay menos «Voy» que el mínimo. Los refuerzos son de fuera de la plantilla.</p>
      </SettingsCard>

      {errors.length > 0 && (
        <ul role="alert" className="flex flex-col gap-0.5 rounded-[20px] bg-danger-soft px-[18px] py-3 text-sm text-danger">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2.5">
        <div className="flex gap-2.5">
          {draft && (
            <Button variant="quiet" size="lg" onClick={() => setDraft(null)}>
              Deshacer
            </Button>
          )}
          <Button variant="primary" size="lg" className="flex-1" loading={busy.isBusy('guardar')} disabled={!draft || errors.length > 0 || busy.isBusy()} onClick={() => void save()}>
            Guardar reglas
          </Button>
        </div>
        <p className="mx-1 text-meta text-muted">Los partidos ya creados guardan sus reglas; los nuevos usan estas. La tabla y la disciplina se recalculan.</p>
      </div>
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
  // La sanción que se está quitando: la ruedita en su botón.
  const removing = useBusy();
  const match: Match | undefined = played.find((m) => m.id === matchId);
  const side = match?.sides.find((s) => s.teamId === teamId);
  const candidates = side ? [...new Set([...rosterOf(tl.allTeams.data, teamId).map((r) => r.playerId), ...side.players.map((p) => p.playerId)])] : [];
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
    if (yes) await removing.run(id, () => run(() => deleteFootballSanction(tl.lid, id), 'Sanción quitada'));
  };

  return (
    <div className="flex flex-col gap-[30px]">
      <p className="mx-1 text-meta text-muted">Las rojas y las amarillas suspenden solas. Aquí van las sanciones que ponga el comité.</p>
      <SettingsCard id="fb-nueva-sancion" title="Nueva sanción">
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
          <div className="grid grid-cols-2 gap-3">
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
        <Button variant="primary" size="lg" className="w-full" icon={<Gavel className="size-5" />} loading={busy} disabled={!valid} onClick={() => void save()}>
          Guardar sanción
        </Button>
      </SettingsCard>
      <section aria-labelledby="fb-sanciones-comite">
        <SectionHeader id="fb-sanciones-comite" title="Sanciones del comité" action={<span className="text-meta text-muted">{sanctions.data.length}</span>} />
        {!sanctions.data.length ? (
          <p className="mx-1 text-meta text-muted">No hay sanciones del comité.</p>
        ) : (
          <Card className="overflow-hidden">
            {sanctions.data.map((s) => (
              <div key={s.id} className="mm-row relative flex min-h-row items-center gap-3 py-2.5 pr-2 pl-5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold">
                    {tl.nameOf(s.playerId)} · {s.matches} {s.matches === 1 ? 'partido' : 'partidos'}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-muted">
                    {tl.teamOf(s.teamId)?.name ?? 'Equipo'} · desde {matchText(s.matchId)}
                    {s.note ? ` · ${s.note}` : ''}
                  </span>
                </span>
                <DangerButton
                  icon={<Trash2 className="size-5" />}
                  aria-label={`Quitar la sanción de ${tl.nameOf(s.playerId)}`}
                  loading={removing.isBusy(s.id)}
                  disabled={removing.isBusy()}
                  onClick={() => void remove(s.id)}
                />
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
