/**
 * Los campos de crear y editar un torneo de esports (create/steps.tsx de la web, con su misma lógica:
 * src/pages/esports/create/logic.ts): la hora con − y +, «Más opciones», las tarjetas para elegir (entrada, formato),
 * el número con − y + en su fila, «Mejor de», la plataforma, el formato con sus ajustes (FormatFields), lo de battle
 * royale (jornadas, partidas y la tabla de puntos) y «Pedir ID confirmado» / «Pedir rango verificado».
 * En Lite, lo que casi no se toca va en «Más opciones»; en Pro, a la vista (como la web).
 */
import { useState, type ReactNode } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { ChevronDown, ChevronLeft, ChevronRight, Minus, Plus, RotateCcw } from 'lucide-react-native';
import { formatTime } from '@mm/lib/schedule';
import { FORMAT_LABEL, GAMES, formatsFor, type BestOf, type Format, type GameId, type SeedingMethod, type TournamentSettings } from '@mm/sports/esports';
import {
  FORMAT_BLURB,
  PLAYOFFS_OPTIONS,
  SEEDING_OPTIONS,
  bestOfItems,
  brGamePoints,
  brSettingsOf,
  cleanPoints,
  formatFieldsShown,
  idRequirement,
  platformPick,
  rankRequirement,
  withFormat,
  type FormatValue,
} from '@mm/pages/esports/create/logic';
import { DateStepper } from '../DateStepper';
import { Segmented, Txt } from '../ui';
import { ChoiceChips, ScoreStepper, ToggleRow } from './inputs';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

const pad = (n: number) => String(n).padStart(2, '0');

/** Mueve una hora «HH:MM» `n` minutos (sin pasar de 00:00 ni de 23:59). */
function addMinutes(hhmm: string, n: number): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  const total = m ? Number(m[1]) * 60 + Number(m[2]) : 19 * 60;
  const next = Math.max(0, Math.min(23 * 60 + 59, total + n));
  return `${pad(Math.floor(next / 60))}:${pad(next % 60)}`;
}

/** Una hora con «−1 h», «‹ ›» (15 minutos) y «+1 h», sin el reloj del sistema (sirve igual en la vista previa). */
export function TimeStepper({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const c = useColors();
  const btn = (a11y: string, n: number, child: ReactNode) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${a11y}`}
      onPress={() => onChange(addMinutes(value, n))}
      style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface2 }}
    >
      {child}
    </Pressable>
  );
  return (
    <View accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 16, padding: 6, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.surface }}>
      {btn('una hora antes', -60, <Txt variant="small">−1 h</Txt>)}
      {btn('15 minutos antes', -15, <ChevronLeft size={20} color={c.fg} />)}
      <Txt variant="bodyStrong" style={{ flex: 1, textAlign: 'center' }} numberOfLines={1}>
        {formatTime(value) || value}
      </Txt>
      {btn('15 minutos después', 15, <ChevronRight size={20} color={c.fg} />)}
      {btn('una hora después', 60, <Txt variant="small">+1 h</Txt>)}
    </View>
  );
}

/** El día y la hora juntos (con su título), como los dos campos de la web. */
export function DateTimeFields({ label, date, time, onDate, onTime, min }: { label: string; date: string; time: string; onDate: (v: string) => void; onTime: (v: string) => void; min?: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Legend>{label}</Legend>
      <DateStepper value={date} min={min} onChange={onDate} />
      <TimeStepper value={time} onChange={onTime} label={`Hora: ${label.toLowerCase()}`} />
    </View>
  );
}

/** El título chico de un grupo de campos (wizardLegend de la web). */
export function Legend({ children }: { children: string }) {
  return (
    <Txt variant="meta" tone="fg2" style={{ fontFamily: font.bold, marginHorizontal: 4 }}>
      {children}
    </Txt>
  );
}

/** «Más opciones»: en Lite, lo que casi no se toca va escondido (en Pro, a la vista). */
export function MoreOptions({ pro, label = 'Más opciones', children }: { pro: boolean; label?: string; children: ReactNode }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  if (pro) return <View style={{ gap: 16 }}>{children}</View>;
  return (
    <View style={{ gap: 16 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderRadius: 16, paddingHorizontal: 16, backgroundColor: c.surface2 }}
      >
        <Txt variant="bodyStrong" style={{ flex: 1 }}>
          {label}
        </Txt>
        <ChevronDown size={20} color={c.muted} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </Pressable>
      {open && <View style={{ gap: 16 }}>{children}</View>}
    </View>
  );
}

/** Una tarjeta para elegir (entrada, formato): título, una línea y el círculo de elegido. */
export function ChoiceCard({ on, title, text, onPress }: { on: boolean; title: string; text: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1.5,
        borderColor: on ? c.accent : 'transparent',
        backgroundColor: on ? c.accentSoft : c.surface2,
        transform: [{ scale: pressed ? 0.99 : 1 }],
      })}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyStrong" tone={on ? 'accent' : 'fg'}>
          {title}
        </Txt>
        <Txt variant="meta" tone="muted">
          {text}
        </Txt>
      </View>
      <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.accent : 'transparent', borderWidth: on ? 0 : 1.5, borderColor: c.faint }}>
        {on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.accentFg }} />}
      </View>
    </Pressable>
  );
}

/** Un número con − y + en su fila («Grupos», «Pasan por grupo», «Suplentes»). */
export function NumberRow({ label, hint, value, min, max, onChange }: { label: string; hint?: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: c.surface2 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyStrong">{label}</Txt>
        {!!hint && (
          <Txt variant="meta" tone="muted">
            {hint}
          </Txt>
        )}
      </View>
      <ScoreStepper value={value} min={min} max={max} label={label} onChange={(n) => onChange(n ?? min)} />
    </View>
  );
}

/** Lo que va en un recuadro de acento («VALORANT se juega en PC.»). */
export function SoftNote({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ borderRadius: 16, backgroundColor: c.accentSoft, paddingHorizontal: 16, paddingVertical: 14 }}>
      <Txt tone="fg2" style={{ fontSize: 15 }}>
        {children}
      </Txt>
    </View>
  );
}

/** Lo que va en un recuadro gris (un aviso sin acción). */
export function GrayNote({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ borderRadius: 16, backgroundColor: c.surface2, paddingHorizontal: 16, paddingVertical: 14 }}>
      <Txt variant="meta" tone="muted">
        {children}
      </Txt>
    </View>
  );
}

/** Mejor de: Segmented con 2 o 3 opciones; con 4 (1, 3, 5, 7), fichas. */
function BestOfPick({ label, value, options, onChange }: { label: string; value: BestOf; options: readonly BestOf[]; onChange: (b: BestOf) => void }) {
  const items = bestOfItems(options);
  return (
    <View style={{ gap: 8 }}>
      <Legend>{label}</Legend>
      {items.length <= 3 ? (
        <Segmented label={label} options={items} value={String(value)} onChange={(k) => onChange(Number(k) as BestOf)} />
      ) : (
        <ChoiceChips label={label} items={items} value={String(value)} onChange={(k) => onChange(Number(k) as BestOf)} />
      )}
    </View>
  );
}

/**
 * La plataforma del torneo: fichas con las del juego y «Crossplay» primero; en un juego de una sola plataforma, solo el
 * texto («VALORANT se juega en PC.»).
 */
function PlatformField({ game, value, onChange }: { game: GameId; value: string; onChange: (p: string) => void }) {
  const pick = platformPick(game, value);
  if (pick.options.length <= 1) {
    return (
      <View style={{ gap: 8 }}>
        <Legend>Plataforma</Legend>
        <SoftNote>
          {`${GAMES[game].name} se juega en `}
          <Txt tone="accent" style={{ fontSize: 15, fontFamily: font.semibold }}>
            {pick.options[0]?.label ?? 'Esports'}
          </Txt>
          .
        </SoftNote>
      </View>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      <Legend>Plataforma</Legend>
      <ChoiceChips label="Plataforma" items={pick.options} value={pick.value || null} onChange={onChange} />
      {!!pick.note && (
        <Txt tone="muted" style={{ fontSize: 13.5, marginHorizontal: 4 }}>
          {pick.note}
        </Txt>
      )}
    </View>
  );
}

/** Battle royale: jornadas, partidas por jornada y la tabla de puntos por puesto y por kill (editable). */
function BrFields({ game, settings: s, onChange }: { game: GameId; settings: TournamentSettings; onChange: (p: Partial<TournamentSettings>) => void }) {
  const c = useColors();
  const meta = GAMES[game];
  const br = brSettingsOf(game, s);
  const set = (patch: Partial<typeof br>) => onChange({ br: { ...br, ...patch } });
  const points = br.placementPoints;
  const setPoint = (i: number, n: number) => set({ placementPoints: cleanPoints(points.map((p, j) => (j === i ? n : p))) });
  const pill = (label: string, onPress: () => void, o: { icon: ReactNode; accent?: boolean; disabled?: boolean }) => (
    <Pressable
      accessibilityRole="button"
      disabled={o.disabled}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, borderRadius: 22, paddingHorizontal: 16, backgroundColor: o.accent ? c.accentSoft : c.surface2, opacity: o.disabled ? 0.5 : 1 }}
    >
      {o.icon}
      <Txt style={{ fontSize: 15, fontFamily: font.semibold, color: o.accent ? c.accent : c.fg2 }}>{label}</Txt>
    </Pressable>
  );
  return (
    <>
      <NumberRow label="Jornadas" value={br.rounds} min={1} max={10} onChange={(n) => set({ rounds: n })} />
      <NumberRow label="Partidas por jornada" value={br.gamesPerRound} min={1} max={12} onChange={(n) => set({ gamesPerRound: n })} />
      <View style={{ gap: 8 }}>
        <Legend>Puntos por puesto</Legend>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {points.map((p, i) => (
            <View key={i} style={{ width: '31.5%', flexDirection: 'row', alignItems: 'center', gap: 6, height: 48, borderRadius: 12, paddingHorizontal: 10, backgroundColor: c.surface2 }}>
              <Txt tone="muted" style={{ width: 32, fontSize: 13, fontFamily: font.semibold }}>{`${i + 1}.º`}</Txt>
              <TextInput
                accessibilityLabel={`Puntos del puesto ${i + 1}`}
                keyboardType="number-pad"
                value={String(p)}
                onChangeText={(v) => setPoint(i, Number(v.replace(/\D/g, '') || 0))}
                style={{ flex: 1, minWidth: 0, height: 48, textAlign: 'right', fontSize: 17, fontFamily: font.semibold, color: c.fg }}
              />
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {pill('puesto', () => set({ placementPoints: cleanPoints([...points, 0]) }), { icon: <Plus size={16} color={c.accent} />, accent: true, disabled: points.length >= 100 })}
          {pill('puesto', () => set({ placementPoints: points.slice(0, -1) }), { icon: <Minus size={16} color={c.fg2} />, disabled: points.length <= 1 })}
          {pill(`Volver a los de ${meta.name}`, () => set(brGamePoints(game)), { icon: <RotateCcw size={16} color={c.fg2} /> })}
        </View>
      </View>
      <NumberRow label="Puntos por kill" value={br.killPoints} min={0} max={10} onChange={(n) => set({ killPoints: n })} />
    </>
  );
}

/**
 * El formato y sus ajustes (§12.7 paso 3): la plataforma, las tarjetas de formato con una línea y, en «Ajustes del
 * formato», el mejor de por fase, grupos y clasificados, playoffs simple o doble, 3.er lugar, reinicio de la gran final,
 * ida y vuelta, empates (EA SPORTS FC), rondas para ganar (SF6/TEKKEN), vidas (Smash), lo de battle royale y la siembra.
 * En Lite los ajustes van en «Ajustes del formato» (cerrado); en Pro, a la vista.
 */
export function FormatFields({ value: v, onChange, pro }: { value: FormatValue; onChange: (v: FormatValue) => void; pro: boolean }) {
  const meta = GAMES[v.game];
  const s = v.settings;
  const setS = (patch: Partial<TournamentSettings>) => onChange({ ...v, settings: { ...s, ...patch } });
  const pickFormat = (f: Format) => onChange(withFormat(v, f));
  const bo = meta.bestOf;
  const shown = formatFieldsShown(v);
  return (
    <>
      <PlatformField game={v.game} value={s.platform} onChange={(platform) => setS({ platform })} />
      <View accessibilityRole="radiogroup" accessibilityLabel="Formato" style={{ gap: 10 }}>
        <Legend>Formato</Legend>
        {formatsFor(v.game).map((f) => (
          <ChoiceCard key={f} on={v.format === f} title={FORMAT_LABEL[f]} text={FORMAT_BLURB[f]} onPress={() => pickFormat(f)} />
        ))}
      </View>
      <MoreOptions pro={pro} label="Ajustes del formato">
        {shown.bestOfGroups && <BestOfPick label={shown.bestOfGroups} value={s.bestOf.groups} options={bo} onChange={(b) => setS({ bestOf: { ...s.bestOf, groups: b } })} />}
        {shown.bestOfPlayoffs && <BestOfPick label={shown.bestOfPlayoffs} value={s.bestOf.playoffs} options={bo} onChange={(b) => setS({ bestOf: { ...s.bestOf, playoffs: b } })} />}
        {shown.bestOfFinal && <BestOfPick label="Mejor de en la final" value={s.bestOf.final} options={bo} onChange={(b) => setS({ bestOf: { ...s.bestOf, final: b } })} />}
        {shown.groups && (
          <>
            <NumberRow label="Grupos" value={s.groups} min={1} max={8} onChange={(n) => setS({ groups: n })} />
            <NumberRow label="Pasan por grupo" value={s.perGroup} min={1} max={4} onChange={(n) => setS({ perGroup: n })} />
            <View style={{ gap: 8 }}>
              <Legend>Playoffs</Legend>
              <Segmented label="Playoffs" options={[...PLAYOFFS_OPTIONS]} value={s.playoffs} onChange={(k) => setS({ playoffs: k })} />
            </View>
          </>
        )}
        {shown.thirdPlace && <ToggleRow checked={s.thirdPlace} onChange={(x) => setS({ thirdPlace: x })} label="Partido por el 3.er lugar" />}
        {shown.bracketReset && <ToggleRow checked={s.bracketReset} onChange={(x) => setS({ bracketReset: x })} label="Reinicio de la gran final" hint="Si gana el que viene de perdedores, se juega otra serie." />}
        {shown.doubleRoundRobin && <ToggleRow checked={s.doubleRoundRobin} onChange={(x) => setS({ doubleRoundRobin: x })} label="Ida y vuelta" />}
        {shown.draws && <ToggleRow checked={s.draws} onChange={(x) => setS({ draws: x })} label="Empates en grupos" hint="Al mejor de 1 se puede empatar (como en el fútbol)." />}
        {shown.roundsToWin && meta.roundsToWin && (
          <View style={{ gap: 8 }}>
            <Legend>Rondas para ganar un juego</Legend>
            <Segmented
              label="Rondas para ganar"
              options={meta.roundsToWin.options.map((n) => ({ key: String(n), label: `${n} rondas` }))}
              value={String(s.roundsToWin ?? meta.roundsToWin.default)}
              onChange={(k) => setS({ roundsToWin: Number(k) as 2 | 3 })}
            />
          </View>
        )}
        {shown.stocks && meta.stocks && <NumberRow label="Vidas por jugador" value={s.stocks ?? meta.stocks.default} min={meta.stocks.min} max={meta.stocks.max} onChange={(n) => setS({ stocks: n })} />}
        {shown.br && <BrFields game={v.game} settings={s} onChange={setS} />}
        {shown.seeding && (
          <View style={{ gap: 8 }}>
            <Legend>Siembra</Legend>
            <Segmented<SeedingMethod> label="Siembra" options={[...SEEDING_OPTIONS]} value={s.seeding} onChange={(k) => setS({ seeding: k })} />
          </View>
        )}
      </MoreOptions>
    </>
  );
}

/**
 * «Pedir ID confirmado» y «Pedir rango verificado» (en crear y en «Editar torneo»): solo los que el juego puede
 * comprobar solo (el ID con la cuenta conectada o con Riot; el rango, solo en LoL). En los demás juegos no sale nada.
 */
export function RequirementToggles({ game, settings: s, onChange }: { game: GameId; settings: TournamentSettings; onChange: (patch: Partial<TournamentSettings>) => void }) {
  const id = idRequirement(game);
  const rank = rankRequirement(game);
  return (
    <>
      {id && <ToggleRow checked={s.requireConfirmedId} onChange={(v) => onChange({ requireConfirmedId: v })} label={id.label} hint={id.hint} />}
      {rank && <ToggleRow checked={s.requireVerifiedRank} onChange={(v) => onChange({ requireVerifiedRank: v })} label={rank.label} hint={rank.hint} />}
    </>
  );
}
