/**
 * Cronometrar una serie en el teléfono (TimingPanel de la web, con su misma lógica: timing.ts). Una fila por carril con
 * el nadador y su siembra; SALIDA arranca el cronómetro del teléfono (no oficial) y cada carril tiene su STOP; el tiempo
 * de los cronómetros físicos se escribe con el teclado mm:ss.hh; DQ, DNS y DNF con un toque. Todo queda en el teléfono
 * (lo tocado se guarda al momento: sirve sin señal y si se cierra la app) y «Publicar serie» manda la serie entera en
 * una sola operación por la cola (sin señal, sale sola al volver). Con la pestaña abierta la pantalla no se apaga.
 * El modo piscina (pantalla completa con modo sol) se queda en la web.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { CheckCircle2, RotateCcw, Send, Timer, Undo2 } from 'lucide-react-native';
import { recordHeat, type SwimEventItem } from '@mm/lib/data/swimming';
import { saveErrorMessage } from '@mm/lib/errorText';
import { formatSwimTime, type SwimStatus } from '@mm/sports/swimming';
import { groupLabel, hasResult, raceName, type MeetData } from '@mm/pages/sports/swimming/logic';
import {
  applyTiming,
  elapsedCs,
  firstPendingHeat,
  hasWatchStops,
  heatHasResults,
  heatLanes,
  heatOrder,
  heatResults,
  heatsOf,
  laneValues,
  loadTiming,
  missingLanes,
  nextHeat,
  replayTiming,
  resolveHeat,
  saveTiming,
  stopPending,
  sweepTimings,
  timingEventLabel,
  timingKey,
  toggledStatus,
  type HeatRef,
  type TimingEvent,
} from '@mm/pages/sports/swimming/timing';
import { confirmAsync, toast } from '@/components/feedback';
import { Badge, Button, Card, Empty, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font, radius, size } from '@/theme/tokens';
import { ClubTag, PillPicker, swimTime } from './parts';
import { TimeKeypad } from './TimeKeypad';

export function TimingPanel({ data }: { data: MeetData }) {
  const c = useColors();
  const { events, entries } = data;
  const seeded = events.filter((ev) => heatsOf(ev, entries).length > 0);
  const [sel, setSel] = useState<HeatRef | null>(null);
  // Entre serie y serie la pantalla no se apaga (se cronometra con las manos mojadas).
  useKeepAwake();
  useEffect(() => sweepTimings(), []);

  // Al abrir: la primera serie que falta por cronometrar. Después no se mueve sola (aunque otro publique).
  const auto = firstPendingHeat(seeded, entries);
  if (!sel && auto) setSel(auto);

  if (!seeded.length || !auto) return <Empty icon={<Timer size={28} color={c.accent} />} title="No hay series publicadas" text="Primero se publica la hoja de series." />;

  const { ev, heats, heat } = resolveHeat(seeded, entries, sel, auto);

  return (
    <View style={{ gap: 12 }}>
      <PillPicker
        label="Prueba"
        options={seeded.map((e) => ({ key: e.id, label: timingEventLabel(e, entries) }))}
        value={ev.id}
        onChange={(id) => setSel({ ev: id, heat: heatsOf(seeded.find((x) => x.id === id)!, entries)[0] })}
      />
      <View accessibilityLabel="Serie" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {heats.map((h) => {
          const done = heatHasResults(ev.id, h, entries);
          const on = h === heat;
          return (
            <Pressable
              key={h}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setSel({ ev: ev.id, heat: h })}
              style={[styles.heatChip, { backgroundColor: on ? c.accent : done ? c.accentSoft : c.surface2 }]}
            >
              <Txt style={{ fontFamily: font.semibold, fontSize: 14, color: on ? c.accentFg : done ? c.accent : c.fg2 }}>{`Serie ${h}`}</Txt>
              {done && <CheckCircle2 size={16} color={on ? c.accentFg : c.accent} />}
            </Pressable>
          );
        })}
      </View>
      <HeatTimer
        key={`${ev.id}:${heat}`}
        data={data}
        ev={ev}
        heat={heat}
        heatCount={heats.length}
        onDone={() => {
          const n = nextHeat(seeded, entries, ev, heat);
          if (n) setSel(n);
        }}
      />
    </View>
  );
}

/** El tiempo corriendo (solo esto se redibuja seguido, no la serie entera). */
function Clock({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 47);
    return () => clearInterval(id);
  }, []);
  return (
    <Txt style={{ flex: 1, minWidth: 0, fontFamily: font.bold, fontSize: 44, lineHeight: 48, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
      {formatSwimTime(elapsedCs(startedAt, now), { full: true })}
    </Txt>
  );
}

/** La hora de ahora (ms), para lo que se toca: fuera del componente, que no la lee al dibujar. */
const nowMs = () => Date.now();

const STATUS_BUTTONS: { s: SwimStatus; label: string }[] = [
  { s: 'dq', label: 'DQ' },
  { s: 'dns', label: 'DNS' },
  { s: 'dnf', label: 'DNF' },
];

function HeatTimer({ data, ev, heat, heatCount, onDone }: { data: MeetData; ev: SwimEventItem; heat: number; heatCount: number; onDone: () => void }) {
  const c = useColors();
  const { lid, meet, entries, clubs, name } = data;
  const key = timingKey(ev.id, heat);
  const [saved] = useState(() => loadTiming(key));
  const [log, setLog] = useState<TimingEvent[]>(saved.log);
  const [publishedAt, setPublishedAt] = useState<number | null>(saved.publishedAt);
  const [keypad, setKeypad] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const state = useMemo(() => replayTiming(log), [log]);
  // Cada cambio de la lista de toques se guarda en el teléfono al momento.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    saveTiming(key, log, publishedAt);
  }, [key, log, publishedAt]);

  const lanes = useMemo(() => heatLanes(entries, ev.id, heat), [entries, ev.id, heat]);
  const values = laneValues(lanes, state);
  const order = heatOrder(values);
  const missing = missingLanes(lanes, values);
  const onServer = lanes.some(hasResult);

  const push = (t: TimingEvent) => {
    try {
      applyTiming(state, t);
    } catch (e) {
      toast((e as Error).message, 'error');
      return;
    }
    // Funcional: dos STOP casi juntos no se pisan.
    setLog((prev) => [...prev, t]);
  };
  const setStatus = (lane: number, s: SwimStatus) => push({ t: 'status', lane, status: toggledStatus(values[lane], s) });

  const reset = async () => {
    if (
      hasWatchStops(state) &&
      !(await confirmAsync({ title: '¿Poner el cronómetro en cero?', message: 'Se borran los STOP de esta serie (los tiempos escritos a mano se quedan).', confirmText: 'Poner en cero', danger: true }))
    )
      return;
    push({ t: 'reset' });
  };

  const publish = async () => {
    if (
      missing.length &&
      !(await confirmAsync({
        title: missing.length === 1 ? 'Falta 1 carril' : `Faltan ${missing.length} carriles`,
        message: `Sin tiempo ni estado: carril ${missing.map((e) => e.lane).join(', ')}. ¿Publicar la serie igual?`,
        confirmText: 'Publicar',
      }))
    )
      return;
    const results = heatResults(lanes, values);
    if (!results.length) return;
    setBusy(true);
    try {
      const n = await recordHeat(lid, ev.id, heat, results, `Serie ${heat} · ${raceName(ev)}`);
      setPublishedAt(nowMs());
      toast(n === undefined ? 'Guardada en el teléfono: sale sola cuando vuelva la señal' : 'Serie publicada');
      onDone();
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const running = state.startedAt != null;
  const keyLane = keypad != null ? lanes.find((e) => e.lane === keypad) : undefined;

  return (
    <View style={{ gap: 12 }}>
      <Txt variant="meta" tone="fg2" style={{ fontFamily: font.semibold, marginHorizontal: 4 }}>
        {`Serie ${heat} de ${heatCount}`}
        {running && <Txt variant="meta" tone="muted">{' · en marcha'}</Txt>}
      </Txt>
      {!!meet.finalizedAt && (
        <View style={[styles.note, { backgroundColor: c.warnSoft }]}>
          <Txt tone="warn" style={{ fontSize: 14 }}>
            El encuentro está finalizado: ya no se publican series.
          </Txt>
        </View>
      )}

      <Card style={{ gap: 10, padding: 16 }}>
        {running ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Clock startedAt={state.startedAt!} />
            <Button icon={<RotateCcw size={16} color={c.fg} />} onPress={reset}>
              Cero
            </Button>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => push({ t: 'start', at: Date.now() })}
            style={({ pressed }) => [styles.start, { backgroundColor: c.accent, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
          >
            <Timer size={24} color={c.accentFg} />
            <Txt style={{ fontFamily: font.bold, fontSize: 20, letterSpacing: 0.5, color: c.accentFg }}>SALIDA</Txt>
          </Pressable>
        )}
        <Txt tone="muted" style={{ fontSize: 13, textAlign: 'center' }}>
          Cronómetro del teléfono, no oficial. Para el tiempo del cronómetro, toca el del carril.
        </Txt>
      </Card>

      <View style={{ gap: 8 }}>
        {lanes.map((e) => {
          const lane = e.lane!;
          const v = values[lane];
          const watchPending = stopPending(state, lane, v);
          const off = v.status === 'dns' || v.status === 'dnf';
          return (
            <Card key={e.id} style={[{ gap: 10, padding: 14 }, v.status !== 'ok' && { borderWidth: 1, borderColor: c.warn }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[styles.lane, { backgroundColor: c.surface2 }]}>
                  <Txt style={{ fontFamily: font.bold, fontSize: 20, color: c.fg2 }}>{lane}</Txt>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="bodyStrong" numberOfLines={1}>
                    {name(e.playerId)}
                  </Txt>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 }}>
                    <ClubTag club={e.clubId ? clubs.get(e.clubId) : null} short />
                    {!!e.ageGroup && (
                      <Txt tone="muted" style={{ fontSize: 12 }}>
                        {groupLabel(e.ageGroup)}
                      </Txt>
                    )}
                    <Txt tone="muted" style={{ fontSize: 12 }}>{`Siembra ${swimTime(e.seed)}`}</Txt>
                  </View>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Escribir tiempo del carril ${lane}`}
                  disabled={off}
                  onPress={() => setKeypad(lane)}
                  style={({ pressed }) => [styles.time, { backgroundColor: c.surface2, opacity: off ? 0.6 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] }]}
                >
                  <Txt style={{ fontFamily: font.bold, fontSize: 19, fontVariant: ['tabular-nums'] }}>{swimTime(v.time, '--.--')}</Txt>
                  {!!order[lane] && (
                    <Txt tone="muted" style={{ fontSize: 11, lineHeight: 13 }}>
                      {`${order[lane]}.º de la serie`}
                    </Txt>
                  )}
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {watchPending ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => push({ t: 'stop', lane, at: Date.now() })}
                    style={({ pressed }) => [styles.stop, { backgroundColor: c.danger, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
                  >
                    <Txt style={{ fontFamily: font.bold, fontSize: 18, color: c.onDanger }}>{`STOP ${lane}`}</Txt>
                  </Pressable>
                ) : (
                  <View style={{ flex: 1 }}>
                    {v.status !== 'ok' ? (
                      <Badge tone={v.status === 'dq' ? 'danger' : 'warn'}>{v.status.toUpperCase()}</Badge>
                    ) : (
                      <Txt tone="muted" style={{ fontSize: 12 }}>
                        {v.time ? 'Listo' : 'Sin tiempo'}
                      </Txt>
                    )}
                  </View>
                )}
                {STATUS_BUTTONS.map(({ s, label }) => {
                  const on = v.status === s;
                  return (
                    <Pressable
                      key={s}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => setStatus(lane, s)}
                      style={[
                        styles.status,
                        on ? (s === 'dq' ? { backgroundColor: c.danger } : { backgroundColor: c.warnSoft, borderWidth: 2, borderColor: c.warn }) : { backgroundColor: c.surface2 },
                      ]}
                    >
                      <Txt style={{ fontFamily: font.bold, fontSize: 14, color: on ? (s === 'dq' ? c.onDanger : c.warn) : c.muted }}>{label}</Txt>
                    </Pressable>
                  );
                })}
              </View>
            </Card>
          );
        })}
      </View>

      <Bar>
        <Button size="xl" accessibilityLabel="Deshacer el último toque" icon={<Undo2 size={20} color={c.fg} />} disabled={!log.length} onPress={() => setLog((prev) => prev.slice(0, -1))} />
        <Button variant="primary" size="xl" loading={busy} disabled={!!meet.finalizedAt} icon={<Send size={20} color={c.accentFg} />} onPress={publish} style={{ flex: 1 }}>
          {publishedAt || onServer ? 'Publicar de nuevo' : 'Publicar serie'}
        </Button>
      </Bar>
      {!!publishedAt && (
        <Txt tone="muted" style={{ fontSize: 12, textAlign: 'center' }}>
          {`Publicada desde este teléfono a las ${new Date(publishedAt).toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' })}.`}
        </Txt>
      )}

      <TimeKeypad
        open={keypad != null}
        title={keyLane ? `Carril ${keypad} · ${name(keyLane.playerId)}` : ''}
        initial={keypad != null ? (values[keypad]?.time ?? null) : null}
        onClose={() => setKeypad(null)}
        onSave={(cs) => {
          if (keypad != null) push({ t: 'time', lane: keypad, cs });
          setKeypad(null);
        }}
      />
    </View>
  );
}

/** Deshacer y «Publicar serie», en una tarjeta al final de los carriles. */
function Bar({ children }: { children: ReactNode }) {
  const c = useColors();
  return <View style={[styles.bar, { backgroundColor: c.surface }]}>{children}</View>;
}

const styles = StyleSheet.create({
  heatChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, borderRadius: radius.pill, paddingHorizontal: 16 },
  note: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  start: { height: size.btn, borderRadius: radius.btn, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  lane: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  time: { height: 48, minWidth: 96, borderRadius: 12, paddingHorizontal: 12, alignItems: 'flex-end', justifyContent: 'center' },
  stop: { flex: 1, height: 48, borderRadius: radius.key, alignItems: 'center', justifyContent: 'center' },
  status: { width: 48, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', gap: 8, borderRadius: 26, padding: 8 },
});
