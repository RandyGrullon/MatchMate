import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { createPlayer } from '../../../../lib/data';
import { useLeagueCtx } from '../../../../lib/league';
import type { RestPolicy } from '../../../../sports/formats';
import { useBusy } from '../../../../components/busy';
import { useAction } from '../../../../components/feedback';
import { useQuickMinor } from '../../../../components/players/GuardianFields';
import { Button, Field, Input, Select, cx } from '../../../../components/ui';
import { PickList, Stepper, choiceClass } from '../bits';
import { NIGHT_MAX_COURTS, NIGHT_MAX_PLAYERS, NIGHT_TARGETS, REST_LABELS, nightInfo, suggestRounds, type NightConfig } from '../logic/night';
import { levelScale, levelText } from '../levels';
import { useNames } from '../names';
import { useRacket } from '../sport';

type NightPart = 'courts' | 'points' | 'rounds';

/**
 * Lo que se edita de la noche (al crearla y en «Ajustes»): canchas, puntos, rondas y descansos. `parts` elige qué
 * partes se ven (al crear: canchas y puntos primero; rondas y descansos después de elegir a los jugadores).
 * `expected` = cuántos se espera que jueguen (con «Me apunto», el cupo mientras la lista se llena).
 */
export function NightFields({
  value,
  onChange,
  parts = ['courts', 'points', 'rounds'],
  expected,
}: {
  value: NightConfig;
  onChange: (c: NightConfig) => void;
  parts?: NightPart[];
  expected?: number;
}) {
  const c = value;
  const count = Math.max(c.players.length, expected ?? 0);
  const info = nightInfo(count, c.courts.length);
  const setCourts = (n: number) => {
    const courts = Array.from({ length: n }, (_, i) => c.courts[i] ?? `Cancha ${i + 1}`);
    onChange({ ...c, courts });
  };
  const show = (p: NightPart) => parts.includes(p);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {show('courts') && <Stepper label="Canchas" value={c.courts.length} min={1} max={NIGHT_MAX_COURTS} onChange={setCourts} />}
        {show('rounds') && <Stepper label="Rondas" value={c.rounds} min={1} max={30} onChange={(rounds) => onChange({ ...c, rounds })} />}
      </div>
      {show('courts') && (
        <div className="grid grid-cols-2 gap-2">
          {c.courts.map((name, i) => (
            <Input
              key={i}
              value={name}
              maxLength={40}
              aria-label={`Nombre de la cancha ${i + 1}`}
              onChange={(e) => onChange({ ...c, courts: c.courts.map((x, j) => (j === i ? e.target.value : x)) })}
            />
          ))}
        </div>
      )}
      {show('points') && (
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted">Cada partido</span>
        <div className="flex flex-wrap gap-2">
          {NIGHT_TARGETS.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={c.points.mode === 'total' && c.points.target === t}
              onClick={() => onChange({ ...c, points: { ...c.points, mode: 'total', target: t, minutes: undefined } })}
              className={cx(choiceClass(c.points.mode === 'total' && c.points.target === t), 'num')}
            >
              A {t}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={c.points.mode === 'time'}
            onClick={() => onChange({ ...c, points: { ...c.points, mode: 'time', minutes: c.points.minutes ?? 15, target: undefined } })}
            className={choiceClass(c.points.mode === 'time')}
          >
            Por tiempo
          </button>
        </div>
        {c.points.mode === 'time' && (
          <Stepper label="Minutos por partido" value={c.points.minutes ?? 15} min={5} max={60} onChange={(minutes) => onChange({ ...c, points: { ...c.points, minutes } })} />
        )}
      </div>
      )}
      {show('rounds') && (
      <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-fg-2">
        {info.tooFew ? (
          'Hacen falta al menos 4 jugadores.'
        ) : (
          <>
            {info.perRound} {info.perRound === 1 ? 'partido' : 'partidos'} por ronda
            {info.resting ? `, descansan ${info.resting} por ronda` : ', nadie descansa'}
            {info.idleCourts ? ` (sobran ${info.idleCourts} ${info.idleCourts === 1 ? 'cancha' : 'canchas'})` : ''}.
            {c.format === 'americano' && info.roundsForAll > 0 && ` Para jugar con todos harían falta ${info.roundsForAll} rondas.`}
            {info.resting > 0 && info.equalRests.length > 0 && ` Con ${info.equalRests.slice(0, 3).join(', ')} rondas todos descansan igual.`}{' '}
            {count > c.players.length && `Contando con ${count} jugadores. `}
            <button type="button" className="font-semibold text-accent" onClick={() => onChange({ ...c, rounds: suggestRounds(c.format, count, c.courts.length) })}>
              Usar las recomendadas
            </button>
          </>
        )}
      </p>
      )}
      {show('rounds') && info.resting > 0 && (
        <Field label="Quien descansa suma">
          <Select value={c.rest} onChange={(e) => onChange({ ...c, rest: e.target.value as RestPolicy })}>
            {(Object.keys(REST_LABELS) as RestPolicy[]).map((k) => (
              <option key={k} value={k}>
                {REST_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {show('rounds') && c.format === 'mexicano' && (
        <Field label="Ronda 1" hint="Por nivel: 1+4 contra 2+3 con el nivel de cada jugador (Admin › Parejas y niveles).">
          <Select value={c.firstRound} onChange={(e) => onChange({ ...c, firstRound: e.target.value === 'level' ? 'level' : 'random' })}>
            <option value="random">Al azar</option>
            <option value="level">Por nivel</option>
          </Select>
        </Field>
      )}
    </div>
  );
}

/** Quién juega la noche: la lista de la liga con su nivel, y agregar a alguien nuevo por su nombre. */
export function NightPlayers({ value, onChange, levels }: { value: string[]; onChange: (ids: string[]) => void; levels: Record<string, number> }) {
  const { lid } = useLeagueCtx();
  const scale = levelScale(useRacket().sport);
  const names = useNames();
  const run = useAction();
  const adding = useBusy();
  const [name, setName] = useState('');
  // Liga con menores: «Es menor de edad» y su tutor debajo del nombre.
  const minor = useQuickMinor(!!name.trim());
  const selected = new Set(value);
  const items = [...names.players]
    .sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)) || a.name.localeCompare(b.name, 'es'))
    .map((p) => ({ id: p.id, name: p.name, sub: levels[p.id] != null ? levelText(levels[p.id], scale) : undefined }));

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    const m = minor.take();
    if (m === undefined) return;
    const id = await adding.run('agregar', () => run(() => createPlayer(lid, n, null, m), `${n} agregado`));
    if (id) {
      onChange([...value, id]);
      setName('');
      minor.reset();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] font-semibold">
          <span className="num">{value.length}</span> {value.length === 1 ? 'jugador' : 'jugadores'}
        </p>
        {value.length > 0 && (
          <button type="button" className="-my-3 inline-flex min-h-11 items-center text-meta font-semibold text-muted hover:text-fg" onClick={() => onChange([])}>
            Quitar a todos
          </button>
        )}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Agregar a alguien nuevo" aria-label="Nombre del jugador nuevo" />
        <Button type="submit" variant="soft" className="size-10 shrink-0 rounded-xl" icon={<UserPlus className="size-4" />} loading={adding.isBusy()} disabled={!name.trim()} aria-label="Agregar jugador" />
      </form>
      {minor.fields}
      <PickList
        items={items}
        selected={selected}
        max={NIGHT_MAX_PLAYERS}
        onToggle={(id) => onChange(selected.has(id) ? value.filter((x) => x !== id) : [...value, id])}
        empty="La liga no tiene jugadores todavía: agrega a los de esta noche con su nombre."
      />
    </div>
  );
}
