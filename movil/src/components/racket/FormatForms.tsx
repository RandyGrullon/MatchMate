/**
 * «Nuevo › Liga por cajas» y «Nuevo › Escalera» (BoxForm.tsx y LadderForm.tsx de la web, con su misma lógica:
 * racket-formats/logic y data.ts): individual o dobles, las reglas y quiénes juegan. La liga por cajas arma su primer mes
 * al crearse (cajas por nivel, todos contra todos dentro de cada caja); la escalera sale ordenada por nivel. Las reglas
 * (BoxRulesFields, LadderFields) las usan también sus hojas de «•••».
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { createRacketEvent } from '@mm/lib/data/racket';
import { saveErrorMessage } from '@mm/lib/errorText';
import { useLeagueCtx } from '@mm/lib/league';
import { saveBoxMonth, setLadder } from '@mm/pages/sports/racket-formats/data';
import { ladderStartOrder } from '@mm/pages/sports/racket-formats/info';
import { DEFAULT_BOX_RULES, boxConfigJson, entrantLevel, firstBoxes, monthDrafts, monthLabel, monthRange, previewSizes, type BoxConfig, type BoxRules } from '@mm/pages/sports/racket-formats/logic/box';
import { DEFAULT_LADDER, ladderConfigJson, type LadderConfig } from '@mm/pages/sports/racket-formats/logic/ladder';
import { levelText, useLevels } from '@mm/pages/sports/racket/levels';
import { todayIn } from '@mm/pages/sports/racket/logic/time';
import { useNames } from '@mm/pages/sports/racket/names';
import { useRacket } from '@mm/pages/sports/racket/sport';
import { ToggleRow } from '../esports/inputs';
import { toast } from '../feedback';
import { Button, Field, Input, Segmented, Txt } from '../ui';
import { Note, Pairs, PickList, Stepper } from './parts';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** Individual o dobles (el pádel siempre en dobles). */
export function ModalityPick({ value, onChange, sport }: { value: boolean; onChange: (doubles: boolean) => void; sport: string }) {
  if (sport === 'padel') return null;
  return (
    <Segmented<'individual' | 'dobles'>
      label="Modalidad"
      options={[
        { key: 'individual', label: 'Individual' },
        { key: 'dobles', label: 'Dobles (parejas)' },
      ]}
      value={value ? 'dobles' : 'individual'}
      onChange={(k) => onChange(k === 'dobles')}
    />
  );
}

/** Tamaño de las cajas, subidas y bajadas, mínimo de partidos. */
export function BoxRulesFields({ value, onChange }: { value: BoxRules; onChange: (r: BoxRules) => void }) {
  return (
    <Pairs>
      <Stepper label="Cajas de al menos" value={value.min} min={3} max={value.max} onChange={(min) => onChange({ ...value, min })} />
      <Stepper label="Cajas de hasta" value={value.max} min={value.min} max={10} onChange={(max) => onChange({ ...value, max })} />
      <Stepper label="Suben por caja" value={value.up} min={0} max={4} onChange={(up) => onChange({ ...value, up })} />
      <Stepper label="Bajan por caja" value={value.down} min={0} max={4} onChange={(down) => onChange({ ...value, down })} />
      <Stepper label="Mínimo para subir" value={value.minToPromote} min={0} max={10} suffix="PJ" onChange={(minToPromote) => onChange({ ...value, minToPromote })} />
      <Stepper label="Mínimo para salvarse" value={value.minToStay} min={0} max={10} suffix="PJ" onChange={(minToStay) => onChange({ ...value, minToStay })} />
    </Pairs>
  );
}

/** Cuántos puestos arriba se puede retar, días para aceptar y para jugar, y si cualquiera entra solo. */
export function LadderFields({ value, onChange }: { value: LadderConfig; onChange: (c: LadderConfig) => void }) {
  return (
    <View style={{ gap: 12 }}>
      <Pairs>
        <Stepper label="Retar hasta" value={value.maxUp} min={1} max={10} suffix="arriba" onChange={(maxUp) => onChange({ ...value, maxUp })} />
        <Stepper label="Días para aceptar" value={value.acceptDays} min={1} max={14} onChange={(acceptDays) => onChange({ ...value, acceptDays })} />
        <Stepper label="Días para jugar" value={value.playDays} min={1} max={30} onChange={(playDays) => onChange({ ...value, playDays })} />
      </Pairs>
      <ToggleRow checked={value.open} onChange={(open) => onChange({ ...value, open })} label="Abierta" hint="Cualquiera de la liga entra solo, abajo del todo" />
      <Txt tone="muted" style={{ fontSize: 13 }}>
        Sin aceptar o jugar a tiempo, gana el retador por W.O.
      </Txt>
    </View>
  );
}

/** «Todavía no hay parejas. Arma las parejas.» (lleva a Parejas y niveles) o «Todavía no hay jugadores.». */
export function NoEntrants({ doubles }: { doubles: boolean }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  if (!doubles) {
    return (
      <Txt tone="muted" style={{ fontSize: 14 }}>
        Todavía no hay jugadores.
      </Txt>
    );
  }
  return (
    <Txt tone="muted" style={{ fontSize: 14 }}>
      Todavía no hay parejas.{' '}
      <Txt accessibilityRole="link" style={{ fontSize: 14, fontFamily: font.medium, color: c.accent }} onPress={() => router.push({ pathname: '/l/[lid]/parejas' as never, params: { lid } } as never)}>
        Arma las parejas
      </Txt>
      .
    </Txt>
  );
}

/** Las parejas o los jugadores para elegir, con su nivel. */
function useEntrantItems(doubles: boolean) {
  const names = useNames();
  const { levels, scale } = useLevels();
  return useMemo(
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
}

/** Atrás y lo que crea, abajo de la pantalla. */
function FormFooter({ onBack, busy, disabled, onCreate, label }: { onBack: () => void; busy: boolean; disabled: boolean; onCreate: () => void; label: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Button size="lg" full icon={<ChevronLeft size={18} color={c.fg} />} onPress={onBack}>
          Atrás
        </Button>
      </View>
      <View style={{ flex: 1 }}>
        <Button variant="primary" size="lg" full loading={busy} disabled={disabled} onPress={onCreate}>
          {label}
        </Button>
      </View>
    </View>
  );
}

export interface FormatFormProps {
  /** Se creó el evento: abre el evento. */
  onDone: (eventId: string) => void;
  /** Volver a las plantillas. */
  onBack: () => void;
}

export function BoxForm({ onDone, onBack }: FormatFormProps) {
  const { lid, league } = useLeagueCtx();
  const { sport, leagueRules, doubles: leagueDoubles } = useRacket();
  const names = useNames();
  const { levels, scale } = useLevels();
  const today = todayIn(league.tz);
  const [name, setName] = useState('');
  const [doubles, setDoubles] = useState(sport === 'padel' ? true : leagueDoubles);
  const [rules, setRules] = useState<BoxRules>(DEFAULT_BOX_RULES);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const items = useEntrantItems(doubles);
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
    <View style={{ gap: 16 }}>
      <Field label="Nombre">
        <Input value={name} maxLength={80} onChangeText={setName} placeholder={title} accessibilityLabel="Nombre" />
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
      <Txt tone="muted" style={{ fontSize: 14 }}>
        ¿Quiénes juegan? Las cajas del primer mes salen por {scale.label === 'Nivel' ? 'nivel' : scale.label} (los que no tienen, abajo).
        {doubles && ' Las parejas se arman en Admin › Parejas y niveles.'}
      </Txt>
      <PickList items={items} selected={new Set(picked)} onToggle={(id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])} empty={<NoEntrants doubles={doubles} />} />
      <Note danger={picked.length < 2}>
        {picked.length < 2
          ? 'Elige al menos 2.'
          : `${picked.length} ${doubles ? 'parejas' : 'jugadores'}: ${sizes.length} ${sizes.length === 1 ? 'caja' : 'cajas'} (${sizes.join(', ')}). El mes: ${monthLabel(today)}.`}
      </Note>
      <FormFooter onBack={onBack} busy={busy} disabled={picked.length < 2 || sizes.some((n) => n < 2)} onCreate={() => void create()} label="Crear y armar el mes" />
    </View>
  );
}

export function LadderForm({ onDone, onBack }: FormatFormProps) {
  const { lid, league } = useLeagueCtx();
  const { sport, leagueRules, doubles: leagueDoubles } = useRacket();
  const names = useNames();
  const { levels, scale } = useLevels();
  const [name, setName] = useState('');
  const [cfg, setCfg] = useState<LadderConfig>(() => ({ ...DEFAULT_LADDER, doubles: sport === 'padel' ? true : leagueDoubles }));
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const items = useEntrantItems(cfg.doubles);
  const title = name.trim() || (cfg.doubles ? 'Escalera de dobles' : 'Escalera');

  const create = async () => {
    setBusy(true);
    try {
      const rules = { ...leagueRules, match: { ...((leagueRules.match as Record<string, unknown> | undefined) ?? {}), doubles: cfg.doubles } };
      const id = await createRacketEvent(lid, { type: 'escalera', name: title, date: todayIn(league.tz), config: ladderConfigJson({ ...cfg, rules }) });
      // Orden de salida: por nivel (los que no tienen, abajo, en el orden en que se eligieron).
      const order = ladderStartOrder(picked, (p) => entrantLevel(names.entrant(p), levels));
      if (order.length) await setLadder(lid, id, order);
      toast('Escalera lista');
      onDone(id);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const count = picked.length;
  return (
    <View style={{ gap: 16 }}>
      <Field label="Nombre">
        <Input value={name} maxLength={80} onChangeText={setName} placeholder={title} accessibilityLabel="Nombre" />
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
      <Txt tone="muted" style={{ fontSize: 14 }}>
        ¿Quiénes empiezan? Se ordenan por {scale.label === 'Nivel' ? 'nivel' : scale.label}; después lo cambias.
        {cfg.open && ' Los demás pueden entrar solos.'}
        {cfg.doubles && ' Las parejas se arman en Admin › Parejas y niveles.'}
      </Txt>
      <PickList items={items} selected={new Set(picked)} onToggle={(id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])} empty={<NoEntrants doubles={cfg.doubles} />} />
      <Txt tone={count < 2 && !cfg.open ? 'danger' : 'muted'} style={{ fontSize: 14, fontFamily: font.semibold }}>
        {`${count} ${cfg.doubles ? (count === 1 ? 'pareja' : 'parejas') : count === 1 ? 'jugador' : 'jugadores'}`}
      </Txt>
      <FormFooter onBack={onBack} busy={busy} disabled={count < 2 && !cfg.open} onCreate={() => void create()} label="Crear la escalera" />
    </View>
  );
}
