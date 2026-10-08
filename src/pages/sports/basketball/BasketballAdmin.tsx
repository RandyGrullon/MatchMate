import { useState } from 'react';
import { CalendarPlus, Plus } from 'lucide-react';
import { saveLeagueRules } from '../../../lib/data/teamSports';
import { basketballConfig, type BasketballConfig } from '../../../sports/team/basketball';
import { useBusy } from '../../../components/busy';
import { useAction, useFeedback } from '../../../components/feedback';
import { Button, Field, Input, Select, SectionHeader } from '../../../components/ui';
import { AdminActions, AdminSegmented, SettingsCard, TemplateRows, ToggleRow, useAdminPart } from '../team/AdminParts';
import { OfficialsList } from '../team/OfficialsList';
import { ScheduleBuilder, SingleMatchModal } from '../team/ScheduleBuilder';
import { TeamsManager } from '../team/TeamsManager';
import { useTeamLeague, type TeamLeague } from '../team/useTeamLeague';
import { BASKETBALL_POSITIONS } from './bits';
import { BASKETBALL_TEMPLATES, basketballConfigFrom, basketballTeamRules, describeConfig, templateOf, templateRules, type BasketballTemplateId } from './rules';

type Part = 'equipos' | 'partidos' | 'reglas';
const PARTS: readonly { key: Part; label: string }[] = [
  { key: 'equipos', label: 'Equipos' },
  { key: 'partidos', label: 'Partidos' },
  { key: 'reglas', label: 'Reglas' },
];

/**
 * Organizar › Equipos (baloncesto), rediseño «Calma y foco»: un segmentado Equipos | Partidos | Reglas (`?parte=`); los
 * equipos y sus plantillas, armar el calendario o un partido suelto con el anotador de mesa de cada partido, y las
 * reglas (una plantilla de un toque o a mano).
 */
export default function BasketballAdmin() {
  const tl = useTeamLeague();
  const [part, setPart] = useAdminPart(PARTS.map((p) => p.key));
  return (
    <div className="flex flex-col gap-[26px]">
      <AdminSegmented options={PARTS} value={part} onChange={setPart} />
      {part === 'equipos' && <TeamsManager tl={tl} positions={BASKETBALL_POSITIONS} />}
      {part === 'partidos' && <CalendarAdmin tl={tl} />}
      {part === 'reglas' && <RulesAdmin tl={tl} />}
    </div>
  );
}

function CalendarAdmin({ tl }: { tl: TeamLeague }) {
  const [building, setBuilding] = useState(false);
  const [single, setSingle] = useState(false);
  const config = basketballConfigFrom(tl.rules.data);
  const format = config.variant === '3x3' ? '3x3' : 'fiba';
  const few = tl.teams.data.length < 2;
  return (
    <div className="flex flex-col gap-[30px]">
      <AdminActions
        hint={few ? 'Hacen falta 2 equipos o más.' : undefined}
        actions={[
          { key: 'calendario', icon: CalendarPlus, title: 'Armar calendario', subtitle: 'Todos contra todos, con horas y canchas', onClick: () => setBuilding(true), disabled: few },
          { key: 'suelto', icon: Plus, title: 'Partido suelto', subtitle: 'Un amistoso, una final o uno aplazado', onClick: () => setSingle(true), disabled: few },
        ]}
      />
      <section aria-labelledby="bb-anotadores">
        <SectionHeader id="bb-anotadores" title="Anotador de mesa" />
        <p className="mx-1 -mt-1.5 mb-3 text-meta text-muted">Si termina el partido quien está designado, el resultado queda final.</p>
        <OfficialsList tl={tl} />
      </section>
      <ScheduleBuilder tl={tl} open={building} onClose={() => setBuilding(false)} format={format} />
      <SingleMatchModal tl={tl} open={single} onClose={() => setSingle(false)} format={format} />
    </div>
  );
}

/** Reglas: una plantilla de un toque, o ajustar periodos, minutos, bonus, reloj, refuerzos y mínimo de la convocatoria. */
function RulesAdmin({ tl }: { tl: TeamLeague }) {
  const run = useAction();
  const { confirm } = useFeedback();
  // La plantilla que se está usando o «guardar»: la ruedita en ese botón.
  const busy = useBusy<BasketballTemplateId | 'guardar'>();
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
    await busy.run(id, async () => {
      await run(() => saveLeagueRules(tl.lid, templateRules(id, current)), 'Reglas guardadas');
      setDraft(null);
    });
  };

  const save = () =>
    busy.run('guardar', () =>
      run(async () => {
        await saveLeagueRules(tl.lid, {
          match: d.cfg,
          teams: { reinforcements: d.reinforcements, minPlayers: d.minPlayers, runningClock: d.runningClock, template: null },
        });
        setDraft(null);
      }, 'Reglas guardadas'),
    );

  return (
    <div className="flex flex-col gap-[30px]">
      <TemplateRows
        templates={BASKETBALL_TEMPLATES}
        active={tpl?.id}
        busy={(id) => busy.isBusy(id)}
        disabled={busy.isBusy()}
        onPick={(id) => void applyTemplate(id)}
        footer={`Ahora: ${describeConfig(cfg)}.`}
      />

      <SettingsCard id="bb-a-mano" title="Ajustar a mano">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Periodos">
            <Select value={String(d.cfg.periods)} onChange={(e) => setCfg({ periods: Number(e.target.value) })}>
              <option value="4">4 cuartos</option>
              <option value="2">2 mitades</option>
              <option value="1">1 tiempo</option>
            </Select>
          </Field>
          <Field label="Minutos por periodo">
            <Input inputMode="numeric" value={String(d.cfg.periodMinutes)} onChange={(e) => setCfg({ periodMinutes: num(e.target.value, 1, 60, d.cfg.periodMinutes) })} />
          </Field>
          <Field label="Minutos de prórroga">
            <Input inputMode="numeric" value={String(d.cfg.overtimeMinutes)} onChange={(e) => setCfg({ overtimeMinutes: num(e.target.value, 0, 30, d.cfg.overtimeMinutes) })} />
          </Field>
          <Field label="Bonus desde la falta n.º">
            <Input inputMode="numeric" value={String(d.cfg.bonusFrom)} onChange={(e) => setCfg({ bonusFrom: num(e.target.value, 1, 20, d.cfg.bonusFrom) })} />
          </Field>
          <Field label="Refuerzos por partido">
            <Input inputMode="numeric" value={String(d.reinforcements)} onChange={(e) => setDraft({ ...d, reinforcements: num(e.target.value, 0, 30, d.reinforcements) })} />
          </Field>
          <Field label="Mínimo para jugar">
            <Input inputMode="numeric" value={String(d.minPlayers)} onChange={(e) => setDraft({ ...d, minPlayers: num(e.target.value, 1, 30, d.minPlayers) })} />
          </Field>
        </div>
        <div className="flex flex-col divide-y divide-line">
          <ToggleRow checked={d.cfg.clock} onChange={(v) => setCfg({ clock: v })}>
            Reloj en la mesa (de referencia, no oficial)
          </ToggleRow>
          <ToggleRow checked={d.runningClock} disabled={!d.cfg.clock} onChange={(v) => setDraft({ ...d, runningClock: v })}>
            Reloj corrido (no se para en cada falta)
          </ToggleRow>
        </div>
        {d.cfg.variant === '5x5' && d.cfg.periods !== cfg.periods && (
          <p className="text-[13px] text-muted">
            Con {d.cfg.periods === 2 ? '2 mitades' : `${d.cfg.periods} periodos`}, las faltas de equipo se cuentan por periodo. FIBA usa 4 cuartos (
            {describeConfig(basketballConfig('fiba'))}).
          </p>
        )}
      </SettingsCard>

      <div className="flex flex-col gap-2.5">
        <div className="flex gap-2.5">
          {draft && (
            <Button variant="quiet" size="lg" onClick={() => setDraft(null)}>
              Deshacer
            </Button>
          )}
          <Button variant="primary" size="lg" className="flex-1" loading={busy.isBusy('guardar')} disabled={!draft || busy.isBusy()} onClick={() => void save()}>
            Guardar reglas
          </Button>
        </div>
        <p className="mx-1 text-meta text-muted">Los partidos ya creados guardan sus reglas; los nuevos usan estas.</p>
      </div>
    </div>
  );
}
