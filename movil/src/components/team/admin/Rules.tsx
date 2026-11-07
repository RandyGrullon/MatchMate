/**
 * Organizar › Equipos › Reglas en la app (RulesAdmin de BasketballAdmin.tsx y FootballAdmin.tsx de la web, con su
 * lógica: rules.ts de cada deporte y rulesAdmin.ts): una plantilla de un toque, o ajustar a mano el partido, la tabla
 * (puntos y desempates), la disciplina y la convocatoria. Los partidos ya creados guardan sus reglas.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { ArrowDown, ArrowUp, X } from 'lucide-react-native';
import { saveLeagueRules } from '@mm/lib/data/teamSports';
import type { BasketballConfig } from '@mm/sports/team/basketball';
import type { DisciplineConfig } from '@mm/sports/team/discipline';
import type { FootballConfig, FootballVariant } from '@mm/sports/team/football';
import type { FootballTableConfig, FootballTieBreak } from '@mm/sports/team/standings';
import { BASKETBALL_TEMPLATES, basketballConfigFrom, describeConfig as describeBasketball, templateOf as basketballTemplateOf, templateRules as basketballTemplateRules, type BasketballTemplateId } from '@mm/pages/sports/basketball/rules';
import {
  TIEBREAK_LABEL,
  describeConfig as describeFootball,
  describeDiscipline,
  templateOf as footballTemplateOf,
  templateRules as footballTemplateRules,
  templatesFor,
  variantOf,
  type FootballTemplateId,
} from '@mm/pages/sports/football/rules';
import {
  basketballDraftOf,
  basketballNum,
  basketballRulesPatch,
  CLOCK_OPTIONS,
  footballDraftOf,
  footballNum,
  footballRulesErrors,
  footballRulesPatch,
  missingTiebreaks,
  moveTiebreak,
  PERIOD_OPTIONS,
  periodsNote,
  SHOOTOUT_OPTIONS,
  SUBS_OPTIONS,
  YELLOWS_OPTIONS,
  type BasketballDraft,
  type FootballDraft,
} from '@mm/pages/sports/team/rulesAdmin';
import type { TeamLeague } from '@mm/pages/sports/team/useTeamLeague';
import { useBusy } from '@/components/bowlingTeams/parts';
import { confirmAsync } from '@/components/feedback';
import { PickField } from '@/components/players/fields';
import { Button, Field, Txt } from '@/components/ui';
import { act, CheckRow, CheckRows, Half, NumField, Pair, SettingsCard, TemplateRows } from './parts';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

const USE_TEMPLATE_TEXT = 'Los partidos nuevos usan estas reglas. Los que ya están creados se quedan con las suyas (se pueden jugar igual).';

/** «Deshacer» y «Guardar reglas», con la línea de abajo. */
function SaveBar({ dirty, busy, disabled, onUndo, onSave, note }: { dirty: boolean; busy: boolean; disabled: boolean; onUndo: () => void; onSave: () => void; note: string }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {dirty && (
          <Button size="lg" onPress={onUndo}>
            Deshacer
          </Button>
        )}
        <View style={{ flex: 1 }}>
          <Button variant="primary" size="lg" full loading={busy} disabled={disabled} onPress={onSave}>
            Guardar reglas
          </Button>
        </View>
      </View>
      <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4 }}>
        {note}
      </Txt>
    </View>
  );
}

// ---------- Baloncesto ----------

/** Reglas del baloncesto: una plantilla de un toque, o ajustar periodos, minutos, bonus, reloj, refuerzos y mínimo de la convocatoria. */
export function BasketballRules({ tl }: { tl: TeamLeague }) {
  // La plantilla que se está usando o «guardar»: la ruedita en ese botón.
  const busy = useBusy<BasketballTemplateId | 'guardar'>();
  const current = tl.rules.data;
  const cfg = basketballConfigFrom(current);
  const tpl = basketballTemplateOf(current);
  const [draft, setDraft] = useState<BasketballDraft | null>(null);
  const d = draft ?? basketballDraftOf(current);
  const setCfg = (patch: Partial<BasketballConfig>) => setDraft({ ...d, cfg: { ...d.cfg, ...patch } });
  const num = basketballNum;
  const note = periodsNote(d.cfg, cfg);

  const applyTemplate = async (id: BasketballTemplateId) => {
    const t = BASKETBALL_TEMPLATES.find((x) => x.id === id)!;
    const yes = await confirmAsync({ title: `Usar «${t.name}»`, message: USE_TEMPLATE_TEXT, confirmText: 'Usar' });
    if (!yes) return;
    await busy.run(id, async () => {
      await act(() => saveLeagueRules(tl.lid, basketballTemplateRules(id, current)), 'Reglas guardadas');
      setDraft(null);
    });
  };
  const save = () =>
    busy.run('guardar', () =>
      act(async () => {
        await saveLeagueRules(tl.lid, basketballRulesPatch(d));
        setDraft(null);
      }, 'Reglas guardadas'),
    );

  return (
    <View style={{ gap: 30 }}>
      <TemplateRows templates={BASKETBALL_TEMPLATES} active={tpl?.id} busy={(id) => busy.isBusy(id)} disabled={busy.isBusy()} onPick={(id) => void applyTemplate(id)} footer={`Ahora: ${describeBasketball(cfg)}.`} />
      <SettingsCard title="Ajustar a mano">
        <Field label="Periodos">
          <PickField label="Periodos" options={PERIOD_OPTIONS} value={String(d.cfg.periods)} onChange={(k) => setCfg({ periods: Number(k) })} />
        </Field>
        <Pair>
          <Half>
            <NumField label="Minutos por periodo" value={String(d.cfg.periodMinutes)} onChange={(v) => setCfg({ periodMinutes: num(v, 1, 60, d.cfg.periodMinutes) })} />
          </Half>
          <Half>
            <NumField label="Minutos de prórroga" value={String(d.cfg.overtimeMinutes)} onChange={(v) => setCfg({ overtimeMinutes: num(v, 0, 30, d.cfg.overtimeMinutes) })} />
          </Half>
        </Pair>
        <Pair>
          <Half>
            <NumField label="Bonus desde la falta n.º" value={String(d.cfg.bonusFrom)} onChange={(v) => setCfg({ bonusFrom: num(v, 1, 20, d.cfg.bonusFrom) })} />
          </Half>
          <Half>
            <NumField label="Refuerzos por partido" value={String(d.reinforcements)} onChange={(v) => setDraft({ ...d, reinforcements: num(v, 0, 30, d.reinforcements) })} />
          </Half>
        </Pair>
        <NumField label="Mínimo para jugar" value={String(d.minPlayers)} onChange={(v) => setDraft({ ...d, minPlayers: num(v, 1, 30, d.minPlayers) })} />
        <CheckRows>
          <CheckRow checked={d.cfg.clock} onChange={(v) => setCfg({ clock: v })} label="Reloj en la mesa (de referencia, no oficial)" />
          <CheckRow checked={d.runningClock} disabled={!d.cfg.clock} onChange={(v) => setDraft({ ...d, runningClock: v })} label="Reloj corrido (no se para en cada falta)" />
        </CheckRows>
        {!!note && (
          <Txt variant="small" tone="muted">
            {note}
          </Txt>
        )}
      </SettingsCard>
      <SaveBar dirty={!!draft} busy={busy.isBusy('guardar')} disabled={!draft || busy.isBusy()} onUndo={() => setDraft(null)} onSave={() => void save()} note="Los partidos ya creados guardan sus reglas; los nuevos usan estas." />
    </View>
  );
}

// ---------- Fútbol y sala ----------

/** Reglas del fútbol y la sala: una plantilla de un toque, o ajustar el partido, la tabla (puntos y desempates), la disciplina y la convocatoria. */
export function FootballRules({ tl }: { tl: TeamLeague }) {
  const c = useColors();
  // La plantilla que se está usando o «guardar»: la ruedita en ese botón.
  const busy = useBusy<FootballTemplateId | 'guardar'>();
  const variant: FootballVariant = variantOf(tl.league.sport);
  const current = tl.rules.data;
  const tpl = footballTemplateOf(current, variant);
  const base = footballDraftOf(current, variant);
  const [draft, setDraft] = useState<FootballDraft | null>(null);
  const d = draft ?? base;
  const num = footballNum;
  const setCfg = (patch: Partial<FootballConfig>) => setDraft({ ...d, cfg: { ...d.cfg, ...patch } });
  const setTable = (patch: Partial<FootballTableConfig>) => setDraft({ ...d, table: { ...d.table, ...patch } });
  const setDisc = (patch: Partial<DisciplineConfig>) => setDraft({ ...d, discipline: { ...d.discipline, ...patch } });

  const applyTemplate = async (id: FootballTemplateId) => {
    const t = templatesFor(variant).find((x) => x.id === id)!;
    const yes = await confirmAsync({ title: `Usar «${t.name}»`, message: USE_TEMPLATE_TEXT, confirmText: 'Usar' });
    if (!yes) return;
    await busy.run(id, async () => {
      await act(() => saveLeagueRules(tl.lid, footballTemplateRules(id, variant, current)), 'Reglas guardadas');
      setDraft(null);
    });
  };
  const patch = footballRulesPatch(current, d, variant);
  // Las mismas validaciones que el registro del deporte (las que usa el formulario de la liga).
  const errors = draft ? footballRulesErrors(current, patch, variant) : [];
  const save = () =>
    busy.run('guardar', () =>
      act(async () => {
        await saveLeagueRules(tl.lid, patch);
        setDraft(null);
      }, 'Reglas guardadas'),
    );

  const tb = d.table.tiebreak;
  const missing = missingTiebreaks(tb);
  const iconBtn = (label: string, icon: typeof ArrowUp, disabled: boolean, onPress: () => void) => {
    const Icon = icon;
    return <Button variant="ghost" size="lg" accessibilityLabel={label} disabled={disabled} onPress={onPress} icon={<Icon size={16} color={c.fg} />} />;
  };

  return (
    <View style={{ gap: 30 }}>
      <TemplateRows templates={templatesFor(variant)} active={tpl?.id} busy={(id) => busy.isBusy(id)} disabled={busy.isBusy()} onPick={(id) => void applyTemplate(id)} footer={`Ahora: ${describeFootball(base.cfg)}.`} />

      <SettingsCard title="El partido">
        <Pair>
          <Half>
            <NumField label="Minutos de cada tiempo" value={String(d.cfg.halfMinutes)} onChange={(v) => setCfg({ halfMinutes: num(v, 1, 60, d.cfg.halfMinutes) })} />
          </Half>
          <Half>
            <NumField label="Jugadores en cancha por equipo" value={String(d.cfg.players)} onChange={(v) => setCfg({ players: num(v, 3, 11, d.cfg.players) })} />
          </Half>
        </Pair>
        <Field label="Reloj">
          <PickField label="Reloj" options={CLOCK_OPTIONS} value={d.cfg.clock} onChange={(k) => setCfg({ clock: k })} />
        </Field>
        <Field label="Cambios">
          <PickField
            label="Cambios"
            options={SUBS_OPTIONS}
            value={d.cfg.subs.max === null ? 'libre' : String(d.cfg.subs.max)}
            onChange={(k) => setCfg({ subs: { ...d.cfg.subs, max: k === 'libre' ? null : Number(k) } })}
          />
        </Field>
        <Field label="Penales por equipo (eliminatoria)">
          <PickField label="Penales por equipo (eliminatoria)" options={SHOOTOUT_OPTIONS} value={String(d.cfg.shootoutKicks)} onChange={(k) => setCfg({ shootoutKicks: Number(k) })} />
        </Field>
        <NumField label="Prórroga (minutos por parte)" value={String(d.cfg.extraTimeMinutes)} onChange={(v) => setCfg({ extraTimeMinutes: num(v, 1, 30, d.cfg.extraTimeMinutes) })} />
        <CheckRows>
          <CheckRow checked={d.cfg.subs.reentry} onChange={(v) => setCfg({ subs: { ...d.cfg.subs, reentry: v } })} label="El que sale puede volver a entrar" />
          <CheckRow checked={d.cfg.extraTime} onChange={(v) => setCfg({ extraTime: v })} label="Prórroga si empatan (partidos de eliminatoria)" />
          <CheckRow checked={d.cfg.shootout} onChange={(v) => setCfg({ shootout: v })} label="Penales si siguen empatados en todos los partidos (si no, solo en la eliminatoria del torneo)" />
          {variant === 'futsal' && (
            <CheckRow
              checked={d.cfg.accumulatedFouls !== null}
              onChange={(v) => setCfg({ accumulatedFouls: v ? { alertAt: 5, penaltyFrom: 6 } : null })}
              label="Faltas acumuladas por mitad (alerta en la 5.ª, tiro desde 10 m desde la 6.ª)"
            />
          )}
          {variant === 'futsal' && <CheckRow checked={d.cfg.timeoutsPerHalf > 0} onChange={(v) => setCfg({ timeoutsPerHalf: v ? 1 : 0 })} label="1 tiempo muerto por equipo en cada mitad" />}
          {variant === 'futsal' && (
            <CheckRow checked={d.cfg.powerPlayMs !== null} onChange={(v) => setCfg({ powerPlayMs: v ? 120_000 : null })} label="Tras una roja, 2 minutos con uno menos (o hasta que le marquen)" />
          )}
        </CheckRows>
      </SettingsCard>

      <SettingsCard title="La tabla">
        <Pair>
          <Half>
            <NumField label="Ganar" value={String(d.table.win)} onChange={(v) => setTable({ win: num(v, 0, 10, d.table.win) })} />
          </Half>
          <Half>
            <NumField label="Empatar" value={String(d.table.draw)} onChange={(v) => setTable({ draw: num(v, 0, 10, d.table.draw) })} />
          </Half>
          <Half>
            <NumField label="Perder" value={String(d.table.loss)} onChange={(v) => setTable({ loss: num(v, 0, 10, d.table.loss) })} />
          </Half>
        </Pair>
        <CheckRow
          checked={d.table.shootout !== null}
          onChange={(v) => setTable({ shootout: v ? { win: 2, loss: 1 } : null })}
          label="Empate con penales: 2 puntos al que gana la tanda y 1 al otro (en vez de 1 y 1)"
        />
        <View style={{ gap: 6 }}>
          <Txt style={{ fontSize: 15, fontFamily: font.medium }}>Si empatan en puntos, se desempata por (en orden):</Txt>
          {tb.map((k, i) => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 48, borderRadius: 12, paddingLeft: 12, backgroundColor: c.surface2 }}>
              <Txt style={{ width: 24, fontFamily: font.semibold, color: c.muted }}>{i + 1}</Txt>
              <Txt style={{ flex: 1, fontSize: 15 }}>{TIEBREAK_LABEL[k]}</Txt>
              {iconBtn('Subir', ArrowUp, i === 0, () => setTable({ tiebreak: moveTiebreak(tb, i, -1) }))}
              {iconBtn('Bajar', ArrowDown, i === tb.length - 1, () => setTable({ tiebreak: moveTiebreak(tb, i, 1) }))}
              {iconBtn(`Quitar ${TIEBREAK_LABEL[k]}`, X, tb.length <= 1, () => setTable({ tiebreak: tb.filter((x) => x !== k) }))}
            </View>
          ))}
          {missing.length > 0 && (
            <PickField<'' | FootballTieBreak>
              label="Agregar desempate"
              options={[{ key: '', label: 'Agregar un desempate…' }, ...missing.map((k) => ({ key: k, label: TIEBREAK_LABEL[k] }))]}
              value=""
              onChange={(k) => k && setTable({ tiebreak: [...tb, k] })}
            />
          )}
          <CheckRow checked={d.table.lotSeed !== null} onChange={(v) => setTable({ lotSeed: v ? tl.lid : null })} label="Si todo sigue igual, sorteo automático (si no, comparten el puesto)" />
        </View>
      </SettingsCard>

      <SettingsCard title="Disciplina">
        <Pair>
          <Half>
            <NumField label="Partidos por roja directa" value={String(d.discipline.redMatches)} onChange={(v) => setDisc({ redMatches: num(v, 0, 20, d.discipline.redMatches) })} />
          </Half>
          <Half>
            <NumField label="Partidos por doble amarilla" value={String(d.discipline.secondYellowMatches)} onChange={(v) => setDisc({ secondYellowMatches: num(v, 0, 20, d.discipline.secondYellowMatches) })} />
          </Half>
        </Pair>
        <Field label="Amarillas para suspender">
          <PickField label="Amarillas para suspender" options={YELLOWS_OPTIONS} value={String(d.discipline.yellowsForSuspension)} onChange={(k) => setDisc({ yellowsForSuspension: Number(k) })} />
        </Field>
        <NumField label="Partidos por acumular amarillas" value={String(d.discipline.yellowMatches)} onChange={(v) => setDisc({ yellowMatches: num(v, 0, 20, d.discipline.yellowMatches) })} />
        <CheckRows>
          <CheckRow checked={d.discipline.secondYellowCounts} onChange={(v) => setDisc({ secondYellowCounts: v })} label="Las amarillas de una doble amarilla también suman a la acumulación" />
          <CheckRow checked={d.discipline.walkoverServes} onChange={(v) => setDisc({ walkoverServes: v })} label="Un W.O. cuenta como partido cumplido" />
        </CheckRows>
        <Txt variant="small" tone="muted">{`${describeDiscipline(d.discipline)}.`}</Txt>
      </SettingsCard>

      <SettingsCard title="Convocatoria">
        <Pair>
          <Half>
            <NumField label="Mínimo para jugar" value={String(d.minPlayers)} onChange={(v) => setDraft({ ...d, minPlayers: num(v, 1, 30, d.minPlayers) })} />
          </Half>
          <Half>
            <NumField label="Refuerzos por partido" value={String(d.reinforcements)} onChange={(v) => setDraft({ ...d, reinforcements: num(v, 0, 30, d.reinforcements) })} />
          </Half>
        </Pair>
        <Txt variant="small" tone="muted">
          Avisa si hay menos «Voy» que el mínimo. Los refuerzos son de fuera de la plantilla.
        </Txt>
      </SettingsCard>

      {errors.length > 0 && (
        <View accessibilityRole="alert" style={{ gap: 2, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 12, backgroundColor: c.dangerSoft }}>
          {errors.map((e) => (
            <Txt key={e} variant="meta" tone="danger">
              {e}
            </Txt>
          ))}
        </View>
      )}
      <SaveBar
        dirty={!!draft}
        busy={busy.isBusy('guardar')}
        disabled={!draft || errors.length > 0 || busy.isBusy()}
        onUndo={() => setDraft(null)}
        onSave={() => void save()}
        note="Los partidos ya creados guardan sus reglas; los nuevos usan estas. La tabla y la disciplina se recalculan."
      />
    </View>
  );
}
