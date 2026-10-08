import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { createRacketEvent } from '../../../../lib/data/racket';
import { useLeagueCtx } from '../../../../lib/league';
import { useFeedback, saveErrorMessage } from '../../../../components/feedback';
import { Button, Field, Input } from '../../../../components/ui';
import { Stepper, ToggleRow, choiceClass } from '../../racket/bits';
import { useLevels } from '../../racket/levels';
import { nightInfo, suggestRounds } from '../../racket/logic/night';
import { todayIn } from '../../racket/logic/time';
import { NightFields, NightPlayers } from '../../racket/night/NightForm';
import type { WizardFormProps } from '../../racket/sport';
import { useNames } from '../../racket/names';
import { GAME_TARGETS, gameText, isSocialEvent, newSocialConfig, parseSocialConfig, socialConfigJson, type GameRules, type SocialConfig } from './logic';

const weekday = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Intl.DateTimeFormat('es-DO', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
};

/** El juego de cada partido: a 11, 15 o 21, ganando por 2 o por 1, conteo tradicional o por rally. */
export function GameFields({ value, onChange }: { value: GameRules; onChange: (g: GameRules) => void }) {
  const pill = choiceClass;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted">Cada partido es un juego a</span>
        <div className="flex flex-wrap gap-2">
          {GAME_TARGETS.map((t) => (
            <button key={t} type="button" aria-pressed={value.to === t} className={pill(value.to === t)} onClick={() => onChange({ ...value, to: t })}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" aria-pressed={value.winBy === 2} className={pill(value.winBy === 2)} onClick={() => onChange({ ...value, winBy: 2 })}>
          Ganando por 2
        </button>
        <button type="button" aria-pressed={value.winBy === 1} className={pill(value.winBy === 1)} onClick={() => onChange({ ...value, winBy: 1 })}>
          Ganando por 1
        </button>
        <button type="button" aria-pressed={value.scoring === 'sideout'} className={pill(value.scoring === 'sideout')} onClick={() => onChange({ ...value, scoring: 'sideout' })}>
          Tradicional
        </button>
        <button type="button" aria-pressed={value.scoring === 'rally'} className={pill(value.scoring === 'rally')} onClick={() => onChange({ ...value, scoring: 'rally' })}>
          Por rally
        </button>
      </div>
      <p className="text-xs text-muted">{gameText(value)}. Tradicional: solo suma el que saca.</p>
    </div>
  );
}

/** Mixto: de los jugadores de la noche, quiénes son del grupo A (cada pareja lleva uno de cada grupo). */
export function MixedGroups({ players, value, onChange }: { players: string[]; value: string[] | null; onChange: (a: string[] | null) => void }) {
  const names = useNames();
  const on = value !== null;
  const a = new Set(value ?? []);
  const nA = players.filter((p) => a.has(p)).length;
  return (
    <div className="flex flex-col gap-2">
      <ToggleRow checked={on} onChange={(v) => onChange(v ? [] : null)} label="Mixto" hint="Cada pareja con uno de cada grupo" />
      {on && (
        <>
          <p className="text-xs text-muted">
            Marca a los del grupo A (por ejemplo, las damas). Grupo A: <b>{nA}</b> · Grupo B: <b>{players.length - nA}</b>. Si un grupo tiene más, los que sobran descansan por turnos.
          </p>
          <div className="flex flex-wrap gap-2">
            {players.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={a.has(p)}
                onClick={() => onChange(a.has(p) ? (value ?? []).filter((x) => x !== p) : [...(value ?? []), p])}
                className={choiceClass(a.has(p))}
              >
                {a.has(p) ? 'A · ' : 'B · '}
                {names.nameOf(p)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** «Nuevo › Round robin social»: fecha, canchas y juego → jugadores → rondas. Crea el evento y abre la noche. */
export function SocialForm({ onDone, onBack, last }: WizardFormProps) {
  const { lid, league } = useLeagueCtx();
  const { levels } = useLevels();
  const { toast } = useFeedback();
  const [step, setStep] = useState(1);
  const [date, setDate] = useState(todayIn(league.tz));
  const [time, setTime] = useState(last?.startTime ?? '18:00');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState<SocialConfig>(() => {
    const prev = last && isSocialEvent(last) ? parseSocialConfig(last.config, last.type) : null;
    return newSocialConfig({
      players: prev?.players ?? [],
      courts: prev?.courts ?? ['Cancha 1', 'Cancha 2'],
      game: prev?.game,
      mixed: prev?.mixed ?? null,
      rounds: prev?.rounds,
      seed: `rr:${Date.now().toString(36)}`,
    });
  });
  const info = useMemo(() => nightInfo(cfg.players.length, cfg.courts.length), [cfg.players.length, cfg.courts.length]);
  const title = name.trim() || `Round robin del ${weekday(date)}`;
  const recommended = suggestRounds('americano', cfg.players.length, cfg.courts.length);
  const mixedOk = !cfg.mixed || (cfg.players.filter((p) => cfg.mixed!.includes(p)).length >= 2 && cfg.players.filter((p) => !cfg.mixed!.includes(p)).length >= 2);

  const create = async () => {
    setBusy(true);
    try {
      const lv: Record<string, number> = {};
      for (const p of cfg.players) if (levels[p] != null) lv[p] = levels[p];
      const id = await createRacketEvent(lid, { type: 'americano', name: title, date, startTime: time || null, config: socialConfigJson({ ...cfg, levels: lv }) });
      toast('Listo');
      onDone(id);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {step === 1 && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Hora">
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
          <Field label="Nombre">
            <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={title} />
          </Field>
          <NightFields value={cfg} onChange={(c) => setCfg({ ...cfg, courts: c.courts })} parts={['courts']} />
          <GameFields value={cfg.game} onChange={(game) => setCfg({ ...cfg, game })} />
        </>
      )}
      {step === 2 && (
        <>
          <p className="text-sm text-muted">¿Quién juega? Las parejas rotan cada ronda: nadie repite compañero mientras se pueda.</p>
          <NightPlayers
            value={cfg.players}
            levels={levels}
            onChange={(players) =>
              setCfg((c) => ({
                ...c,
                players,
                mixed: c.mixed ? c.mixed.filter((p) => players.includes(p)) : null,
                rounds: c.rounds === suggestRounds('americano', c.players.length, c.courts.length) ? suggestRounds('americano', players.length, c.courts.length) : c.rounds,
              }))
            }
          />
          <MixedGroups players={cfg.players} value={cfg.mixed} onChange={(mixed) => setCfg({ ...cfg, mixed })} />
        </>
      )}
      {step === 3 && (
        <>
          <p className="text-sm">
            <b>{cfg.players.length}</b> jugadores · <b>{cfg.courts.length}</b> {cfg.courts.length === 1 ? 'cancha' : 'canchas'} · {gameText(cfg.game).toLowerCase()}
          </p>
          <Stepper label="Rondas" value={cfg.rounds} min={1} max={30} onChange={(rounds) => setCfg({ ...cfg, rounds })} />
          <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-fg-2">
            {info.tooFew ? (
              'Hacen falta al menos 4 jugadores.'
            ) : (
              <>
                {info.perRound} {info.perRound === 1 ? 'partido' : 'partidos'} por ronda
                {info.resting ? `, descansan ${info.resting} por ronda` : ', nadie descansa'}. Recomendadas: {recommended} rondas.{' '}
                <button type="button" className="font-medium text-accent" onClick={() => setCfg({ ...cfg, rounds: recommended })}>
                  Usar {recommended}
                </button>
              </>
            )}
          </p>
          <p className="text-xs text-muted">Después de crearlo, tocas «Empezar ronda 1» y a cada quien le llega su cancha.</p>
        </>
      )}
      <div className="sticky bottom-0 -mx-5 flex gap-2.5 bg-surface px-5 pt-3 pb-1">
        <Button variant="quiet" size="lg" className="flex-1" icon={<ChevronLeft className="size-4" />} onClick={() => (step === 1 ? onBack() : setStep(step - 1))}>
          Atrás
        </Button>
        {step < 3 ? (
          <Button variant="primary" size="lg" className="flex-1" disabled={step === 2 && (cfg.players.length < 4 || !mixedOk)} icon={<ChevronRight className="size-4" />} onClick={() => setStep(step + 1)}>
            Siguiente
          </Button>
        ) : (
          <Button variant="primary" size="lg" className="flex-1" loading={busy} disabled={cfg.players.length < 4 || !mixedOk} onClick={() => void create()}>
            Crear
          </Button>
        )}
      </div>
    </div>
  );
}
