import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CalendarPlus, Check, Plus } from 'lucide-react';
import { compareMatches, isOpen, type Match } from '../../../lib/data/matches';
import { saveLeagueRules, setMatchOfficial } from '../../../lib/data/teamSports';
import { basketballConfig, type BasketballConfig } from '../../../sports/team/basketball';
import { whenText } from '../../../components/match/format';
import { useAction, useFeedback } from '../../../components/feedback';
import { Badge, Button, Card, Empty, Field, Input, Select, Tabs, cx } from '../../../components/ui';
import { scorerCandidates } from '../team/logic';
import { ScheduleBuilder, SingleMatchModal } from '../team/ScheduleBuilder';
import { TeamsManager } from '../team/TeamsManager';
import { useTeamLeague, type TeamLeague } from '../team/useTeamLeague';
import { matchLink } from './BasketballGames';
import { BASKETBALL_POSITIONS } from './bits';
import { BASKETBALL_TEMPLATES, basketballConfigFrom, basketballTeamRules, describeConfig, templateOf, templateRules, type BasketballTemplateId } from './rules';

type Tab = 'equipos' | 'calendario' | 'reglas';

/** Admin › Equipos (baloncesto): equipos y plantillas, calendario con anotadores de mesa, y reglas (plantillas). */
export default function BasketballAdmin() {
  const tl = useTeamLeague();
  const [tab, setTab] = useState<Tab>('equipos');
  return (
    <div className="flex flex-col gap-4">
      <Tabs
        items={[
          { key: 'equipos', label: 'Equipos' },
          { key: 'calendario', label: 'Calendario' },
          { key: 'reglas', label: 'Reglas' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'equipos' && <TeamsManager tl={tl} positions={BASKETBALL_POSITIONS} />}
      {tab === 'calendario' && <CalendarAdmin tl={tl} />}
      {tab === 'reglas' && <RulesAdmin tl={tl} />}
    </div>
  );
}

function CalendarAdmin({ tl }: { tl: TeamLeague }) {
  const [building, setBuilding] = useState(false);
  const [single, setSingle] = useState(false);
  const config = basketballConfigFrom(tl.rules.data);
  const format = config.variant === '3x3' ? '3x3' : 'fiba';
  const open = useMemo(() => tl.matches.data.filter((m) => isOpen(m) || m.status === 'postponed').sort(compareMatches), [tl.matches.data]);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<CalendarPlus className="size-4" />} disabled={tl.teams.data.length < 2} onClick={() => setBuilding(true)}>
          Armar calendario
        </Button>
        <Button icon={<Plus className="size-4" />} disabled={tl.teams.data.length < 2} onClick={() => setSingle(true)}>
          Partido suelto
        </Button>
      </div>
      {tl.teams.data.length < 2 && <p className="text-sm text-muted">Hacen falta 2 equipos o más.</p>}
      <h2 className="font-semibold">Partidos por jugar y anotador de mesa</h2>
      <p className="text-sm text-muted">
        Si termina el partido quien está designado, el resultado queda final. Se puede designar a un admin, a un anotador de la liga o al capitán o delegado de uno
        de los dos equipos.
      </p>
      {!open.length ? (
        <Empty title="No hay partidos por jugar">Arma el calendario o crea un partido suelto.</Empty>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {open.map((m) => (
            <OfficialRow key={m.id} tl={tl} match={m} />
          ))}
        </Card>
      )}
      <ScheduleBuilder tl={tl} open={building} onClose={() => setBuilding(false)} format={format} />
      <SingleMatchModal tl={tl} open={single} onClose={() => setSingle(false)} format={format} />
    </div>
  );
}

function OfficialRow({ tl, match: m }: { tl: TeamLeague; match: Match }) {
  const run = useAction();
  const official = tl.officialOf(m.id);
  const candidates = scorerCandidates(m, tl.teams.data, tl.members.data, tl.players.data);
  const name = (i: 0 | 1) => tl.teamOf(m.sides[i].teamId)?.name ?? m.sides[i].label;
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
      <Link to={matchLink(tl.base, m.id)} className="min-w-0 flex-1">
        <div className="truncate font-medium">
          {name(0)} vs. {name(1)}
        </div>
        <div className="truncate text-xs text-muted">
          {[m.round != null ? `Jornada ${m.round}` : m.stage, whenText(m.scheduledAt, tl.tz) ?? 'Sin fecha', m.court].filter(Boolean).join(' · ')}
          {m.status === 'postponed' && ' · Aplazado'}
        </div>
      </Link>
      <Select
        className="sm:w-64"
        aria-label={`Anotador de mesa de ${name(0)} vs. ${name(1)}`}
        value={official?.userId ?? ''}
        onChange={(e) => void run(() => setMatchOfficial(tl.lid, m.id, e.target.value || null), e.target.value ? 'Anotador designado' : 'Sin anotador designado')}
      >
        <option value="">Anotador: sin designar</option>
        {official && !candidates.some((c) => c.uid === official.userId) && <option value={official.userId}>{official.name || 'Designado'}</option>}
        {candidates.map((c) => (
          <option key={c.uid} value={c.uid}>
            {c.name} · {c.why}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** Reglas: una plantilla de un toque, o ajustar periodos, minutos, bonus, reloj, refuerzos y mínimo de la convocatoria. */
function RulesAdmin({ tl }: { tl: TeamLeague }) {
  const run = useAction();
  const { confirm } = useFeedback();
  const current = tl.rules.data;
  const cfg = basketballConfigFrom(current);
  const teams = basketballTeamRules(current);
  const tpl = templateOf(current);
  const [draft, setDraft] = useState<{ cfg: BasketballConfig; reinforcements: number; minPlayers: number; runningClock: boolean } | null>(null);
  const d = draft ?? { cfg, reinforcements: teams.reinforcements, minPlayers: teams.minPlayers, runningClock: teams.runningClock };
  const setCfg = (patch: Partial<BasketballConfig>) => setDraft({ ...d, cfg: { ...d.cfg, ...patch } });
  const num = (v: string, min: number, max: number, dflt: number) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= min && n <= max ? n : dflt;
  };

  const applyTemplate = async (id: BasketballTemplateId) => {
    const t = BASKETBALL_TEMPLATES.find((x) => x.id === id)!;
    const yes = await confirm({
      title: `Usar «${t.name}»`,
      message: 'Los partidos nuevos usan estas reglas. Los que ya están creados se quedan con las suyas (se pueden jugar igual).',
      confirmText: 'Usar',
    });
    if (!yes) return;
    await run(() => saveLeagueRules(tl.lid, templateRules(id, current)), 'Reglas guardadas');
    setDraft(null);
  };

  const save = () =>
    run(async () => {
      await saveLeagueRules(tl.lid, {
        match: d.cfg,
        teams: { reinforcements: d.reinforcements, minPlayers: d.minPlayers, runningClock: d.runningClock, template: null },
      });
      setDraft(null);
    }, 'Reglas guardadas');

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Plantillas</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {BASKETBALL_TEMPLATES.map((t) => {
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
        <p className="text-sm text-muted">Ahora: {describeConfig(cfg)}.</p>
      </section>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="font-semibold">Ajustar a mano</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Periodos">
            <Select value={String(d.cfg.periods)} onChange={(e) => setCfg({ periods: Number(e.target.value) })}>
              <option value="4">4 cuartos</option>
              <option value="2">2 mitades</option>
              <option value="1">1 tiempo</option>
            </Select>
          </Field>
          <Field label="Minutos de cada periodo">
            <Input inputMode="numeric" value={String(d.cfg.periodMinutes)} onChange={(e) => setCfg({ periodMinutes: num(e.target.value, 1, 60, d.cfg.periodMinutes) })} />
          </Field>
          <Field label="Minutos de la prórroga">
            <Input inputMode="numeric" value={String(d.cfg.overtimeMinutes)} onChange={(e) => setCfg({ overtimeMinutes: num(e.target.value, 0, 30, d.cfg.overtimeMinutes) })} />
          </Field>
          <Field label="Tiros libres desde la falta de equipo n.º">
            <Input inputMode="numeric" value={String(d.cfg.bonusFrom)} onChange={(e) => setCfg({ bonusFrom: num(e.target.value, 1, 20, d.cfg.bonusFrom) })} />
          </Field>
          <Field label="Refuerzos por partido">
            <Input inputMode="numeric" value={String(d.reinforcements)} onChange={(e) => setDraft({ ...d, reinforcements: num(e.target.value, 0, 30, d.reinforcements) })} />
          </Field>
          <Field label="Mínimo para jugar (convocatoria)">
            <Input inputMode="numeric" value={String(d.minPlayers)} onChange={(e) => setDraft({ ...d, minPlayers: num(e.target.value, 1, 30, d.minPlayers) })} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-5" checked={d.cfg.clock} onChange={(e) => setCfg({ clock: e.target.checked })} />
          Reloj en la mesa (de referencia, no oficial)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-5" checked={d.runningClock} disabled={!d.cfg.clock} onChange={(e) => setDraft({ ...d, runningClock: e.target.checked })} />
          Reloj corrido (no se para en cada falta)
        </label>
        {d.cfg.variant === '5x5' && d.cfg.periods !== cfg.periods && (
          <p className="text-xs text-muted">
            Con {d.cfg.periods === 2 ? '2 mitades' : `${d.cfg.periods} periodos`}, las faltas de equipo se cuentan por periodo. FIBA usa 4 cuartos (
            {describeConfig(basketballConfig('fiba'))}).
          </p>
        )}
        <div className="flex gap-2">
          <Button variant="primary" disabled={!draft} onClick={() => void save()}>
            Guardar reglas
          </Button>
          {draft && <Button onClick={() => setDraft(null)}>Deshacer cambios</Button>}
        </div>
        <p className="text-xs text-muted">Los partidos ya creados guardan sus reglas; los nuevos usan estas.</p>
      </Card>
    </div>
  );
}
