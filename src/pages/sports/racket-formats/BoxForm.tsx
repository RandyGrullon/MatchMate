import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { createRacketEvent } from '../../../lib/data/racket';
import { useLeagueCtx } from '../../../lib/league';
import { useFeedback, saveErrorMessage } from '../../../components/feedback';
import { Button, Field, Input, cx } from '../../../components/ui';
import { PickList, Stepper } from '../racket/bits';
import { levelText, useLevels } from '../racket/levels';
import { todayIn } from '../racket/logic/time';
import { useNames } from '../racket/names';
import { useRacket, type WizardFormProps } from '../racket/sport';
import { saveBoxMonth } from './data';
import { DEFAULT_BOX_RULES, boxConfigJson, entrantLevel, firstBoxes, monthDrafts, monthRange, monthLabel, previewSizes, type BoxConfig, type BoxRules } from './logic/box';

/** Individual o dobles (el pádel siempre en dobles). */
export function ModalityPick({ value, onChange, sport }: { value: boolean; onChange: (doubles: boolean) => void; sport: string }) {
  if (sport === 'padel') return null;
  const pill = (on: boolean) => cx('min-h-12 rounded-xl border-2 px-3 text-sm font-semibold transition active:scale-95', on ? 'border-accent bg-accent-soft text-accent' : 'border-line');
  return (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Modalidad">
      <button type="button" aria-pressed={!value} className={pill(!value)} onClick={() => onChange(false)}>
        Individual
      </button>
      <button type="button" aria-pressed={value} className={pill(value)} onClick={() => onChange(true)}>
        Dobles (parejas)
      </button>
    </div>
  );
}

/** Tamaño de las cajas, subidas y bajadas, mínimo de partidos. */
export function BoxRulesFields({ value, onChange }: { value: BoxRules; onChange: (r: BoxRules) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Stepper label="Cajas de al menos" value={value.min} min={3} max={value.max} onChange={(min) => onChange({ ...value, min })} />
      <Stepper label="Cajas de hasta" value={value.max} min={value.min} max={10} onChange={(max) => onChange({ ...value, max })} />
      <Stepper label="Suben por caja" value={value.up} min={0} max={4} onChange={(up) => onChange({ ...value, up })} />
      <Stepper label="Bajan por caja" value={value.down} min={0} max={4} onChange={(down) => onChange({ ...value, down })} />
      <Stepper label="Mínimo para subir" value={value.minToPromote} min={0} max={10} suffix="PJ" onChange={(minToPromote) => onChange({ ...value, minToPromote })} />
      <Stepper label="Mínimo para salvarse" value={value.minToStay} min={0} max={10} suffix="PJ" onChange={(minToStay) => onChange({ ...value, minToStay })} />
    </div>
  );
}

/**
 * «Nuevo › Liga por cajas»: individual o dobles, reglas de las cajas y quiénes juegan. Al crear se arma el primer
 * mes: cajas por nivel (NTRP, DUPR o Playtomic) y todos contra todos dentro de cada caja.
 */
export function BoxForm({ onDone, onBack }: WizardFormProps) {
  const { lid, base, league } = useLeagueCtx();
  const { sport, leagueRules, doubles: leagueDoubles } = useRacket();
  const names = useNames();
  const { levels, scale } = useLevels();
  const { toast } = useFeedback();
  const today = todayIn(league.tz);
  const [name, setName] = useState('');
  const [doubles, setDoubles] = useState(sport === 'padel' ? true : leagueDoubles);
  const [rules, setRules] = useState<BoxRules>(DEFAULT_BOX_RULES);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const items = useMemo(
    () =>
      (doubles
        ? names.teams.map((t) => ({ id: t.id, name: t.name, sub: t.roster.map((r) => names.nameOf(r.playerId)).join(' / ') }))
        : names.players.map((p) => ({ id: p.id, name: p.name, sub: undefined as string | undefined }))
      ).map((x) => {
        const lv = entrantLevel(names.entrant(x.id), levels);
        return { ...x, sub: [x.sub, lv != null ? levelText(lv, scale) : null].filter(Boolean).join(' · ') || undefined };
      }),
    [doubles, names, levels, scale],
  );
  const sizes = previewSizes(picked.length, rules);
  const title = name.trim() || (doubles ? 'Liga por cajas de dobles' : 'Liga por cajas');

  const create = async () => {
    setBusy(true);
    try {
      const month = monthRange(today);
      const cfg: BoxConfig = { v: 1, format: 'cajas', doubles, rules, points: 'standard', entrants: picked, months: [], round: 0 };
      const matchRules = { ...leagueRules, match: { ...((leagueRules.match as Record<string, unknown> | undefined) ?? {}), doubles } };
      const id = await createRacketEvent(lid, { type: 'cajas', name: title, date: month.start, config: boxConfigJson(cfg) });
      const boxes = firstBoxes(
        picked.map((p) => names.entrant(p)),
        levels,
        rules,
      );
      await saveBoxMonth(lid, id, { month: 1, boxes, drafts: monthDrafts(boxes, names.entrant, { rules: matchRules }), label: monthLabel(month.start), start: month.start, end: month.end });
      toast('Listo: primer mes armado');
      onDone(id);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Field label="Nombre">
        <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={title} />
      </Field>
      <ModalityPick
        value={doubles}
        sport={sport}
        onChange={(d) => {
          setDoubles(d);
          setPicked([]);
        }}
      />
      <BoxRulesFields value={rules} onChange={setRules} />
      <p className="text-sm text-muted">
        ¿Quiénes juegan? Las cajas del primer mes salen por {scale.label === 'Nivel' ? 'nivel' : scale.label} (los que no tienen, abajo).
        {doubles && ' Las parejas se arman en Admin › Parejas y niveles.'}
      </p>
      <PickList
        items={items}
        selected={new Set(picked)}
        onToggle={(id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])}
        empty={
          doubles ? (
            <>
              Todavía no hay parejas.{' '}
              <Link className="font-medium text-accent" to={`${base}/admin?tab=parejas`}>
                Arma las parejas
              </Link>
              .
            </>
          ) : (
            'Todavía no hay jugadores.'
          )
        }
      />
      <p className={cx('rounded-xl px-3 py-2 text-sm', picked.length < 2 ? 'bg-warn-soft text-warn' : 'bg-surface-2')}>
        {picked.length < 2
          ? 'Elige al menos 2.'
          : `${picked.length} ${doubles ? 'parejas' : 'jugadores'}: ${sizes.length} ${sizes.length === 1 ? 'caja' : 'cajas'} (${sizes.join(', ')}). El mes: ${monthLabel(today)}.`}
      </p>
      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
        <Button icon={<ChevronLeft className="size-4" />} onClick={onBack}>
          Atrás
        </Button>
        <Button variant="primary" loading={busy} disabled={picked.length < 2 || sizes.some((n) => n < 2)} onClick={() => void create()}>
          Crear y armar el mes
        </Button>
      </div>
    </div>
  );
}
