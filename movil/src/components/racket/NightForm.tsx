/**
 * Lo que se edita de la noche al crearla y en «Ajustes» (NightForm.tsx de la web, con su misma lógica: logic/night.ts):
 * canchas, puntos, rondas y descansos; quién juega la noche (con agregar a alguien nuevo); y la inscripción «Me apunto»
 * (SignupFields.tsx: cupo, fecha límite y lista de espera).
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { UserPlus, X } from 'lucide-react-native';
import { createPlayer } from '@mm/lib/data/players';
import { saveErrorMessage } from '@mm/lib/errorText';
import { useLeagueCtx } from '@mm/lib/league';
import type { RestPolicy } from '@mm/sports/formats';
import { levelScale, levelText } from '@mm/pages/sports/racket/levels';
import { NIGHT_MAX_COURTS, NIGHT_MAX_PLAYERS, NIGHT_TARGETS, REST_LABELS, nightInfo, suggestRounds, type NightConfig } from '@mm/pages/sports/racket/logic/night';
import { SIGNUP_MAX, SIGNUP_MIN_CAP, clampCap, newSignup, type SignupSettings } from '@mm/pages/sports/racket/logic/signup';
import { localParts, todayIn, zonedIso } from '@mm/pages/sports/racket/logic/time';
import { useNames } from '@mm/pages/sports/racket/names';
import { useRacket } from '@mm/pages/sports/racket/sport';
import { DateStepper } from '../DateStepper';
import { TimeStepper } from '../esports/fields';
import { ChoiceChips, ToggleRow } from '../esports/inputs';
import { PickField } from '../players/fields';
import { toast } from '../feedback';
import { Button, Field, Input, Sheet, Txt } from '../ui';
import { Note, Pairs, PickList, SaveFooter, Stepper, useQuickMinor } from './parts';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

type NightPart = 'courts' | 'points' | 'rounds';

/**
 * Canchas, puntos, rondas y descansos. `parts` elige qué partes se ven (al crear: canchas y puntos primero; rondas y
 * descansos después de elegir a los jugadores). `expected` = cuántos se espera que jueguen (con «Me apunto», el cupo).
 */
export function NightFields({ value, onChange, parts = ['courts', 'points', 'rounds'], expected }: { value: NightConfig; onChange: (c: NightConfig) => void; parts?: NightPart[]; expected?: number }) {
  const c = value;
  const colors = useColors();
  const count = Math.max(c.players.length, expected ?? 0);
  const info = nightInfo(count, c.courts.length);
  const setCourts = (n: number) => onChange({ ...c, courts: Array.from({ length: n }, (_, i) => c.courts[i] ?? `Cancha ${i + 1}`) });
  const show = (p: NightPart) => parts.includes(p);
  type Pick = `t${number}` | 'tiempo';
  const picked: Pick = c.points.mode === 'time' ? 'tiempo' : `t${c.points.target ?? 24}`;
  return (
    <View style={{ gap: 16 }}>
      {(show('courts') || show('rounds')) && (
        <Pairs>
          {show('courts') && <Stepper label="Canchas" value={c.courts.length} min={1} max={NIGHT_MAX_COURTS} onChange={setCourts} />}
          {show('rounds') && <Stepper label="Rondas" value={c.rounds} min={1} max={30} onChange={(rounds) => onChange({ ...c, rounds })} />}
        </Pairs>
      )}
      {show('courts') && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {c.courts.map((name, i) => (
            <View key={i} style={{ flexBasis: '47%', flexGrow: 1 }}>
              <Input value={name} maxLength={40} accessibilityLabel={`Nombre de la cancha ${i + 1}`} onChangeText={(v) => onChange({ ...c, courts: c.courts.map((x, j) => (j === i ? v : x)) })} />
            </View>
          ))}
        </View>
      )}
      {show('points') && (
        <View style={{ gap: 8 }}>
          <Txt tone="muted" style={{ fontSize: 12, fontFamily: font.medium }}>
            Cada partido
          </Txt>
          <ChoiceChips<Pick>
            label="Cada partido"
            value={picked}
            items={[...NIGHT_TARGETS.map((t) => ({ key: `t${t}` as Pick, label: `A ${t}` })), { key: 'tiempo', label: 'Por tiempo' }]}
            onChange={(k) =>
              onChange(
                k === 'tiempo'
                  ? { ...c, points: { ...c.points, mode: 'time', minutes: c.points.minutes ?? 15, target: undefined } }
                  : { ...c, points: { ...c.points, mode: 'total', target: Number(k.slice(1)), minutes: undefined } },
              )
            }
          />
          {c.points.mode === 'time' && <Stepper label="Minutos por partido" value={c.points.minutes ?? 15} min={5} max={60} onChange={(minutes) => onChange({ ...c, points: { ...c.points, minutes } })} />}
        </View>
      )}
      {show('rounds') && (
        <View style={{ borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.surface2 }}>
          {info.tooFew ? (
            <Txt tone="fg2" style={{ fontSize: 14 }}>
              Hacen falta al menos 4 jugadores.
            </Txt>
          ) : (
            <Txt tone="fg2" style={{ fontSize: 14 }}>
              {`${info.perRound} ${info.perRound === 1 ? 'partido' : 'partidos'} por ronda`}
              {info.resting ? `, descansan ${info.resting} por ronda` : ', nadie descansa'}
              {info.idleCourts ? ` (sobran ${info.idleCourts} ${info.idleCourts === 1 ? 'cancha' : 'canchas'})` : ''}.
              {c.format === 'americano' && info.roundsForAll > 0 && ` Para jugar con todos harían falta ${info.roundsForAll} rondas.`}
              {info.resting > 0 && info.equalRests.length > 0 && ` Con ${info.equalRests.slice(0, 3).join(', ')} rondas todos descansan igual.`}{' '}
              {count > c.players.length && `Contando con ${count} jugadores. `}
              <Txt accessibilityRole="button" style={{ fontSize: 14, fontFamily: font.semibold, color: colors.accent }} onPress={() => onChange({ ...c, rounds: suggestRounds(c.format, count, c.courts.length) })}>
                Usar las recomendadas
              </Txt>
            </Txt>
          )}
        </View>
      )}
      {show('rounds') && info.resting > 0 && (
        <Field label="Quien descansa suma">
          <PickField<RestPolicy> label="Quien descansa suma" value={c.rest} options={(Object.keys(REST_LABELS) as RestPolicy[]).map((k) => ({ key: k, label: REST_LABELS[k] }))} onChange={(rest) => onChange({ ...c, rest })} />
        </Field>
      )}
      {show('rounds') && c.format === 'mexicano' && (
        <Field label="Ronda 1" hint="Por nivel: 1+4 contra 2+3 con el nivel de cada jugador (Admin › Parejas y niveles).">
          <PickField<'random' | 'level'>
            label="Ronda 1"
            value={c.firstRound === 'level' ? 'level' : 'random'}
            options={[
              { key: 'random', label: 'Al azar' },
              { key: 'level', label: 'Por nivel' },
            ]}
            onChange={(firstRound) => onChange({ ...c, firstRound })}
          />
        </Field>
      )}
    </View>
  );
}

/** Quién juega la noche: la lista de la liga con su nivel, y agregar a alguien nuevo por su nombre. */
export function NightPlayers({ value, onChange, levels }: { value: string[]; onChange: (ids: string[]) => void; levels: Record<string, number> }) {
  const colors = useColors();
  const { lid } = useLeagueCtx();
  const scale = levelScale(useRacket().sport);
  const names = useNames();
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
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
    setAdding(true);
    try {
      const id = await createPlayer(lid, n, null, m);
      toast(`${n} agregado`);
      onChange([...value, id]);
      setName('');
      minor.reset();
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setAdding(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Txt style={{ fontSize: 15, fontFamily: font.semibold }}>{`${value.length} ${value.length === 1 ? 'jugador' : 'jugadores'}`}</Txt>
        {value.length > 0 && (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onChange([])} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Txt tone="muted" variant="meta" style={{ fontFamily: font.semibold }}>
              Quitar a todos
            </Txt>
          </Pressable>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Input value={name} maxLength={60} onChangeText={setName} placeholder="Agregar a alguien nuevo" accessibilityLabel="Nombre del jugador nuevo" returnKeyType="done" onSubmitEditing={() => void add()} />
        </View>
        <Button variant="soft" size="xl" icon={<UserPlus size={18} color={colors.accent} />} loading={adding} disabled={!name.trim()} accessibilityLabel="Agregar jugador" onPress={() => void add()} />
      </View>
      {minor.fields}
      <PickList
        items={items}
        selected={selected}
        max={NIGHT_MAX_PLAYERS}
        onToggle={(id) => onChange(selected.has(id) ? value.filter((x) => x !== id) : [...value, id])}
        empty="La liga no tiene jugadores todavía: agrega a los de esta noche con su nombre."
      />
    </View>
  );
}

/**
 * La inscripción «Me apunto» (al crear el americano o el torneo, y en «Inscripción»): abierta o no, cupo (en el
 * torneo, por categoría) o sin tope, y la fecha límite en la hora de la liga. `value` null = la lista la arma el admin.
 */
export function SignupFields({
  value,
  onChange,
  unit,
  perCategory = false,
  defaultCap,
  maxCap = SIGNUP_MAX,
  tz,
}: {
  value: SignupSettings | null;
  onChange: (s: SignupSettings | null) => void;
  unit: readonly [string, string];
  perCategory?: boolean;
  defaultCap: number;
  maxCap?: number;
  tz?: string | null;
}) {
  const colors = useColors();
  const on = !!value?.open;
  const top = Math.min(SIGNUP_MAX, Math.max(SIGNUP_MIN_CAP, maxCap));
  const deadline = localParts(value?.until, tz);
  const toggle = (checked: boolean) => {
    if (checked) onChange(value ? { ...value, open: true } : newSignup(Math.min(top, clampCap(defaultCap))));
    // Una vez guardada no se quita (la espera nunca se pierde): se cierra.
    else onChange(value ? { ...value, open: false } : null);
  };
  const setDeadline = (date: string, time: string) => {
    if (!value) return;
    onChange({ ...value, until: date ? zonedIso(date, time || '23:59', tz) : null });
  };
  return (
    <View style={{ gap: 12 }}>
      <ToggleRow checked={on} onChange={toggle} label="Que se apunten en la app («Me apunto»)" hint="Con cupo, fecha límite y lista de espera que sube sola" />
      {value && !on && <Note>Cerrada: nadie más se puede apuntar. La lista de espera se conserva.</Note>}
      {on && value && (
        <View style={{ gap: 12, borderRadius: 16, padding: 16, backgroundColor: colors.surface2 }}>
          {value.cap != null ? (
            <Stepper label={perCategory ? `Cupo por categoría (${unit[1]})` : `Cupo (${unit[1]})`} value={value.cap} min={SIGNUP_MIN_CAP} max={Math.max(top, value.cap)} onChange={(cap) => onChange({ ...value, cap })} />
          ) : (
            <Txt style={{ fontSize: 14 }}>
              <Txt style={{ fontSize: 14, fontFamily: font.bold }}>Sin tope</Txt> <Txt tone="muted" style={{ fontSize: 14 }}>{`(hasta ${SIGNUP_MAX})`}</Txt>
            </Txt>
          )}
          <ToggleRow checked={value.cap == null} onChange={(none) => onChange({ ...value, cap: none ? null : Math.min(top, clampCap(defaultCap)) })} label="Sin tope" />
          <Field label="Se cierra (opcional)">
            {deadline ? (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <DateStepper value={deadline.date} onChange={(d) => setDeadline(d, deadline.time)} />
                  </View>
                  <Button variant="ghost" icon={<X size={18} color={colors.faint} />} accessibilityLabel="Quitar la fecha límite" onPress={() => setDeadline('', '')} />
                </View>
                <TimeStepper value={deadline.time} onChange={(t) => setDeadline(deadline.date, t)} label="Hora límite" />
              </View>
            ) : (
              // Sin el campo de fecha vacío de la web: al tocar sale la de hoy a las 6:00 pm (como la web al elegir un día).
              <Button size="md" style={{ alignSelf: 'flex-start' }} onPress={() => setDeadline(todayIn(tz ?? undefined), '18:00')}>
                Fecha límite
              </Button>
            )}
          </Field>
          <Txt tone="muted" style={{ fontSize: 13 }}>
            Sin fecha límite, hasta que empiece{perCategory ? ' (al armar grupos o cuadro)' : ' (la ronda 1)'}.
          </Txt>
        </View>
      )}
    </View>
  );
}

/** «Inscripción»: los ajustes en una hoja (se guardan con la configuración del evento). Se monta al abrirse. */
export function SignupSettingsSheet({
  value,
  onClose,
  onSave,
  busy,
  ...fields
}: {
  value: SignupSettings | null;
  onClose: () => void;
  onSave: (s: SignupSettings | null) => void;
  busy?: boolean;
  unit: readonly [string, string];
  perCategory?: boolean;
  defaultCap: number;
  maxCap?: number;
  tz?: string | null;
}) {
  const [draft, setDraft] = useState<SignupSettings | null>(() => value ?? newSignup(Math.min(fields.maxCap ?? SIGNUP_MAX, clampCap(fields.defaultCap))));
  const unchanged = JSON.stringify(draft) === JSON.stringify(value);
  return (
    <Sheet open onClose={onClose} title="Inscripción" footer={<SaveFooter onClose={onClose} busy={!!busy} disabled={unchanged || (!value && !draft?.open)} onSave={() => onSave(draft)} />}>
      <SignupFields value={draft} onChange={setDraft} {...fields} />
    </Sheet>
  );
}
