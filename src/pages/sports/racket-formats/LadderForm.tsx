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
import { ModalityPick } from './BoxForm';
import { setLadder } from './data';
import { entrantLevel } from './logic/box';
import { DEFAULT_LADDER, ladderConfigJson, type LadderConfig } from './logic/ladder';

/** Cuántos puestos arriba se puede retar, días para aceptar y para jugar, y si cualquiera entra solo. */
export function LadderFields({ value, onChange }: { value: LadderConfig; onChange: (c: LadderConfig) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Stepper label="Retar hasta" value={value.maxUp} min={1} max={10} suffix="arriba" onChange={(maxUp) => onChange({ ...value, maxUp })} />
        <Stepper label="Días para aceptar" value={value.acceptDays} min={1} max={14} onChange={(acceptDays) => onChange({ ...value, acceptDays })} />
        <Stepper label="Días para jugar" value={value.playDays} min={1} max={30} onChange={(playDays) => onChange({ ...value, playDays })} />
      </div>
      <label className="flex min-h-12 items-center gap-3 rounded-xl border border-line px-3">
        <input type="checkbox" checked={value.open} onChange={(e) => onChange({ ...value, open: e.target.checked })} className="size-5 accent-[var(--accent)]" />
        <span className="text-sm font-medium">Abierta: cualquiera de la liga entra solo (abajo del todo)</span>
      </label>
      <p className="text-xs text-muted">
        Si el retado no acepta a tiempo, o no se juega a tiempo, gana el retador por W.O. El que gana toma el puesto del otro y los del medio bajan uno.
      </p>
    </div>
  );
}

/** «Nuevo › Escalera»: individual o dobles, reglas de los retos y el orden de salida (por nivel). */
export function LadderForm({ onDone, onBack }: WizardFormProps) {
  const { lid, base, league } = useLeagueCtx();
  const { sport, leagueRules, doubles: leagueDoubles } = useRacket();
  const names = useNames();
  const { levels, scale } = useLevels();
  const { toast } = useFeedback();
  const [name, setName] = useState('');
  const [cfg, setCfg] = useState<LadderConfig>(() => ({ ...DEFAULT_LADDER, doubles: sport === 'padel' ? true : leagueDoubles }));
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const title = name.trim() || (cfg.doubles ? 'Escalera de dobles' : 'Escalera');

  const items = useMemo(
    () =>
      (cfg.doubles
        ? names.teams.map((t) => ({ id: t.id, name: t.name, sub: t.roster.map((r) => names.nameOf(r.playerId)).join(' / ') }))
        : names.players.map((p) => ({ id: p.id, name: p.name, sub: undefined as string | undefined }))
      ).map((x) => {
        const lv = entrantLevel(names.entrant(x.id), levels);
        return { ...x, sub: [x.sub, lv != null ? levelText(lv, scale) : null].filter(Boolean).join(' · ') || undefined };
      }),
    [cfg.doubles, names, levels, scale],
  );

  const create = async () => {
    setBusy(true);
    try {
      const rules = { ...leagueRules, match: { ...((leagueRules.match as Record<string, unknown> | undefined) ?? {}), doubles: cfg.doubles } };
      const id = await createRacketEvent(lid, { type: 'escalera', name: title, date: todayIn(league.tz), config: ladderConfigJson({ ...cfg, rules }) });
      // Orden de salida: por nivel (los que no tienen, abajo, en el orden en que se eligieron).
      const order = picked
        .map((p, i) => ({ p, i, lv: entrantLevel(names.entrant(p), levels) }))
        .sort((a, b) => (b.lv ?? -1) - (a.lv ?? -1) || a.i - b.i)
        .map((x) => x.p);
      if (order.length) await setLadder(lid, id, order);
      toast('Escalera lista');
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
        value={cfg.doubles}
        sport={sport}
        onChange={(doubles) => {
          setCfg({ ...cfg, doubles });
          setPicked([]);
        }}
      />
      <LadderFields value={cfg} onChange={setCfg} />
      <p className="text-sm text-muted">
        ¿Quiénes empiezan? Se ordenan por {scale.label === 'Nivel' ? 'nivel' : scale.label}; después lo cambias.
        {cfg.open && ' Los demás pueden entrar solos.'}
        {cfg.doubles && ' Las parejas se arman en Admin › Parejas y niveles.'}
      </p>
      <PickList
        items={items}
        selected={new Set(picked)}
        onToggle={(id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])}
        empty={
          cfg.doubles ? (
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
      <p className={cx('text-sm', picked.length < 2 && !cfg.open ? 'text-warn' : 'text-muted')}>
        {picked.length} {cfg.doubles ? (picked.length === 1 ? 'pareja' : 'parejas') : picked.length === 1 ? 'jugador' : 'jugadores'}
      </p>
      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
        <Button icon={<ChevronLeft className="size-4" />} onClick={onBack}>
          Atrás
        </Button>
        <Button variant="primary" loading={busy} disabled={picked.length < 2 && !cfg.open} onClick={() => void create()}>
          Crear la escalera
        </Button>
      </div>
    </div>
  );
}
