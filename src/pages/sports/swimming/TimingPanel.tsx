import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, RotateCcw, Send, Timer, Undo2 } from 'lucide-react';
import { useWakeLock } from '../../../court';
import { useHoldBadgeUnlock } from '../../../components/badges/hold';
import { recordHeat, type SwimEntry, type SwimEventItem } from '../../../lib/data/swimming';
import { formatSwimTime, type SwimStatus } from '../../../sports/swimming';
import { saveErrorMessage, useFeedback } from '../../../components/feedback';
import { PillSelect } from '../../../components/ranking/parts';
import { Badge, Button, Card, cx } from '../../../components/ui';
import { EmptyCard, STICKY_ABOVE_NAV } from '../FieldChrome';
import { FieldModeButton, FieldScreen, useFieldMode } from '../golf/FieldScreen';
import { ClubTag, TimeKeypad, TimeText } from './bits';
import { groupLabel, pendingHeats, raceName, raceTitle } from './logic';
import type { MeetData } from './MeetPage';
import {
  applyTiming,
  elapsedCs,
  heatOrder,
  laneDone,
  laneValue,
  loadTiming,
  replayTiming,
  saveTiming,
  sweepTimings,
  timingKey,
  type LaneValue,
  type TimingEvent,
} from './timing';

interface HeatRef {
  ev: string;
  heat: number;
}

const heatsOf = (ev: SwimEventItem, entries: readonly SwimEntry[]) =>
  [...new Set(entries.filter((e) => e.swimEventId === ev.id && e.heat != null).map((e) => e.heat!))].sort((a, b) => a - b);

const hasResult = (e: SwimEntry) => e.resultAt != null || e.time != null || e.status !== 'ok';

/** El modo piscina: pantalla completa (en la dirección, `?piscina=1`) con la pestaña de cronometrar. */
type FieldMode = ReturnType<typeof useFieldMode>;

/**
 * Pantalla de cancha: cronometrar una serie. Una fila por carril con el nadador y su siembra; SALIDA arranca el
 * cronómetro del teléfono (no oficial) y cada carril tiene su STOP; el tiempo de los cronómetros físicos se
 * escribe con el teclado mm:ss.hh; DQ, DNS y DNF con un toque. Todo queda en el teléfono y «Publicar serie»
 * manda la serie entera en una sola operación (sin señal, sale sola al volver).
 *
 * En la orilla: con la pestaña abierta la pantalla no se apaga, «Publicar serie» siempre está a la vista (fijo
 * abajo, encima de la barra de la app) y «Modo piscina» la pone en pantalla completa con modo sol (piezas del
 * modo cancha, src/court).
 */
export function TimingPanel({ data }: { data: MeetData }) {
  const { events, entries } = data;
  const seeded = events.filter((ev) => heatsOf(ev, entries).length > 0);
  const [sel, setSel] = useState<HeatRef | null>(null);
  const field = useFieldMode('piscina', { ver: 'cronometro' });
  // Entre serie y serie la pantalla no se apaga (se cronometra con las manos mojadas).
  useWakeLock(true);
  // Cronómetro corriendo: el aviso de una insignia espera a que se cierre (§6.4).
  useHoldBadgeUnlock();
  useEffect(() => sweepTimings(), []);

  /** Al abrir: la primera serie que falta por cronometrar. Después no se mueve sola (aunque otro publique). */
  const firstPending = (): HeatRef | null => {
    for (const ev of seeded) {
      const p = pendingHeats(ev, entries);
      if (p.length) return { ev: ev.id, heat: p[0] };
    }
    return seeded[0] ? { ev: seeded[0].id, heat: heatsOf(seeded[0], entries)[0] } : null;
  };
  const auto = firstPending();
  useEffect(() => {
    if (!sel && auto) setSel(auto);
  }, [sel, auto?.ev, auto?.heat]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!seeded.length || !auto) return <EmptyCard icon={<Timer className="size-5" />} title="No hay series publicadas" text="Primero se publica la hoja de series." />;

  const cur = sel && seeded.some((e) => e.id === sel.ev) ? sel : auto;
  const ev = seeded.find((e) => e.id === cur.ev)!;
  const heats = heatsOf(ev, entries);
  const heat = heats.includes(cur.heat) ? cur.heat : heats[0];

  /** La serie que sigue (en la misma prueba o la primera de la siguiente). */
  const next = (): HeatRef | null => {
    const k = heats.indexOf(heat);
    if (k >= 0 && k < heats.length - 1) return { ev: ev.id, heat: heats[k + 1] };
    const i = seeded.findIndex((e) => e.id === ev.id);
    const after = seeded[i + 1];
    return after ? { ev: after.id, heat: heatsOf(after, entries)[0] } : null;
  };

  const selectors = (
    <>
      <PillSelect
        label="Prueba"
        className="max-w-full self-start"
        options={seeded.map((e) => ({
          key: e.id,
          label: `${e.num}. ${raceName(e)} · ${e.gender === 'F' ? 'Fem.' : e.gender === 'M' ? 'Masc.' : 'Mixto'}${pendingHeats(e, entries).length === 0 ? ' ✓' : ''}`,
        }))}
        value={ev.id}
        onChange={(id) => setSel({ ev: id, heat: heatsOf(seeded.find((x) => x.id === id)!, entries)[0] })}
      />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Serie">
        {heats.map((h) => {
          const done = entries.some((e) => e.swimEventId === ev.id && e.heat === h && hasResult(e));
          return (
            <button
              key={h}
              type="button"
              onClick={() => setSel({ ev: ev.id, heat: h })}
              aria-pressed={h === heat}
              className={cx(
                'flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-meta font-semibold transition active:scale-95',
                h === heat ? 'bg-accent text-accent-fg' : done ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-fg-2',
              )}
            >
              Serie {h}
              {done && <CheckCircle2 aria-hidden="true" className="size-4" />}
            </button>
          );
        })}
      </div>
    </>
  );

  const timer = (
    <HeatTimer
      key={`${ev.id}:${heat}`}
      data={data}
      ev={ev}
      heat={heat}
      heatCount={heats.length}
      field={field}
      selectors={selectors}
      onDone={() => {
        const n = next();
        if (n) setSel(n);
      }}
    />
  );

  // El cronómetro queda en el mismo lugar al entrar o salir de la pantalla completa: no pierde lo que se estaba haciendo.
  return (
    <div className="flex flex-col gap-3">
      {!field.on && <FieldModeButton label="Modo piscina" onClick={field.enter} />}
      {!field.on && selectors}
      {timer}
    </div>
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
    <p className="num min-w-0 flex-1 text-[44px] leading-none font-[650] sm:text-hero-sm" aria-live="off">
      {formatSwimTime(elapsedCs(startedAt, now), { full: true })}
    </p>
  );
}

const STATUS_BUTTONS: { s: SwimStatus; label: string }[] = [
  { s: 'dq', label: 'DQ' },
  { s: 'dns', label: 'DNS' },
  { s: 'dnf', label: 'DNF' },
];

function HeatTimer({
  data,
  ev,
  heat,
  heatCount,
  field,
  selectors,
  onDone,
}: {
  data: MeetData;
  ev: SwimEventItem;
  heat: number;
  heatCount: number;
  field: FieldMode;
  /** Prueba y serie (arriba de la pantalla completa). */
  selectors: ReactNode;
  onDone: () => void;
}) {
  const { lid, meet, entries, clubs, name } = data;
  const { toast, confirm } = useFeedback();
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

  const lanes = useMemo(
    () =>
      entries
        .filter((e) => e.swimEventId === ev.id && e.heat === heat)
        .sort((a, b) => (a.lane ?? 0) - (b.lane ?? 0)),
    [entries, ev.id, heat],
  );
  const values: Record<number, LaneValue> = {};
  for (const e of lanes) values[e.lane!] = laneValue(hasResult(e) ? { time: e.time, status: e.status } : undefined, state.lanes[e.lane!]);
  const order = heatOrder(values);
  const missing = lanes.filter((e) => !laneDone(values[e.lane!]));
  const onServer = lanes.some(hasResult);

  const push = (ev: TimingEvent) => {
    try {
      applyTiming(state, ev);
    } catch (e) {
      toast((e as Error).message, 'error');
      return;
    }
    // Funcional: dos STOP casi juntos no se pisan.
    setLog((prev) => [...prev, ev]);
  };
  const setStatus = (lane: number, s: SwimStatus) => push({ t: 'status', lane, status: values[lane]?.status === s ? 'ok' : s });

  const reset = async () => {
    if (Object.values(state.lanes).some((l) => l.source === 'watch') && !(await confirm({ title: '¿Poner el cronómetro en cero?', message: 'Se borran los STOP de esta serie (los tiempos escritos a mano se quedan).', confirmText: 'Poner en cero', danger: true })))
      return;
    push({ t: 'reset' });
  };

  const publish = async () => {
    if (
      missing.length &&
      !(await confirm({
        title: missing.length === 1 ? 'Falta 1 carril' : `Faltan ${missing.length} carriles`,
        message: `Sin tiempo ni estado: carril ${missing.map((e) => e.lane).join(', ')}. ¿Publicar la serie igual?`,
        confirmText: 'Publicar',
      }))
    )
      return;
    const results = lanes
      .filter((e) => laneDone(values[e.lane!]) || hasResult(e))
      .map((e) => ({ entryId: e.id, time: values[e.lane!].status === 'dns' || values[e.lane!].status === 'dnf' ? null : values[e.lane!].time, status: values[e.lane!].status }));
    if (!results.length) return;
    setBusy(true);
    try {
      const n = await recordHeat(lid, ev.id, heat, results, `Serie ${heat} · ${raceName(ev)}`);
      setPublishedAt(Date.now());
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

  const body = (
    <>
      {!field.on && (
        <p className="mx-1 text-meta font-semibold text-fg-2">
          Serie {heat} de {heatCount}
          {running && <span className="font-normal text-muted"> · en marcha</span>}
        </p>
      )}
      {meet.finalizedAt && <p className="rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">El encuentro está finalizado: ya no se publican series.</p>}

      <Card className="flex flex-col gap-2.5 p-4">
        {running ? (
          <div className="flex items-center gap-3">
            <Clock startedAt={state.startedAt!} />
            <Button variant="quiet" className="h-11" icon={<RotateCcw className="size-4" />} onClick={reset}>
              Cero
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => push({ t: 'start', at: Date.now() })}
            className="flex h-btn items-center justify-center gap-2.5 rounded-btn bg-accent text-xl font-bold tracking-wide text-accent-fg shadow-sm transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Timer aria-hidden="true" className="size-6" /> SALIDA
          </button>
        )}
        <p className="text-center text-[13px] text-muted">Cronómetro del teléfono, no oficial. Para el tiempo del cronómetro, toca el del carril.</p>
      </Card>

      <div className="flex flex-col gap-2">
        {lanes.map((e) => {
          const lane = e.lane!;
          const v = values[lane];
          const watchPending = running && state.lanes[lane]?.source !== 'watch' && v.status !== 'dns';
          return (
            <Card key={e.id} className={cx('flex flex-col gap-2.5 p-3.5', v.status !== 'ok' && 'border-warn')}>
              <div className="flex items-center gap-3">
                <span className="num grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-xl font-[650] text-fg-2">{lane}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-semibold">{name(e.playerId)}</p>
                  <div className="flex flex-wrap items-center gap-x-2">
                    <ClubTag club={e.clubId ? clubs.get(e.clubId) : null} short />
                    {e.ageGroup && <span className="text-xs text-muted">{groupLabel(e.ageGroup)}</span>}
                    <span className="text-xs text-muted">
                      Siembra <TimeText cs={e.seed} />
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setKeypad(lane)}
                  disabled={v.status === 'dns' || v.status === 'dnf'}
                  className="flex h-12 min-w-24 flex-col items-end justify-center rounded-xl bg-surface-2 px-3 transition active:scale-95 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-accent"
                  aria-label={`Escribir tiempo del carril ${lane}`}
                >
                  <TimeText cs={v.time} empty="--.--" className="num text-[19px] leading-tight font-[650]" />
                  {order[lane] && <span className="text-[11px] leading-3 text-muted">{order[lane]}.º de la serie</span>}
                </button>
              </div>
              <div className="flex items-center gap-2">
                {watchPending ? (
                  <button
                    type="button"
                    onClick={() => push({ t: 'stop', lane, at: Date.now() })}
                    className="h-12 flex-1 rounded-key bg-danger text-lg font-bold text-on-danger transition active:scale-[0.97]"
                  >
                    STOP {lane}
                  </button>
                ) : (
                  <span className="flex-1 text-xs text-muted">
                    {v.status !== 'ok' ? <Badge tone={v.status === 'dq' ? 'danger' : 'warn'}>{v.status.toUpperCase()}</Badge> : v.time ? 'Listo' : 'Sin tiempo'}
                  </span>
                )}
                {STATUS_BUTTONS.map(({ s, label }) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(lane, s)}
                    aria-pressed={v.status === s}
                    className={cx(
                      'h-11 w-12 shrink-0 rounded-xl text-sm font-bold transition active:scale-95',
                      v.status === s ? (s === 'dq' ? 'bg-danger text-on-danger' : 'bg-warn-soft text-warn ring-2 ring-warn') : 'bg-surface-2 text-muted',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );

  const bar = (
    <>
      <Button
        variant="quiet"
        size="xl"
        className="px-4"
        icon={<Undo2 className="size-5" />}
        disabled={!log.length}
        onClick={() => setLog((prev) => prev.slice(0, -1))}
        aria-label="Deshacer el último toque"
      >
        <span className="hidden sm:inline">Deshacer</span>
      </Button>
      <Button variant="primary" size="xl" className="flex-1" loading={busy} disabled={!!meet.finalizedAt} icon={<Send className="size-5" />} onClick={publish}>
        {publishedAt || onServer ? 'Publicar de nuevo' : 'Publicar serie'}
      </Button>
    </>
  );

  const note = publishedAt && (
    <p className="text-center text-xs text-muted">Publicada desde este teléfono a las {new Date(publishedAt).toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' })}.</p>
  );

  const keypadModal = (
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
  );

  if (field.on) {
    return (
      <FieldScreen
        title={raceTitle(ev)}
        subtitle={`Serie ${heat} de ${heatCount}${running ? ' · en marcha' : ''}`}
        onExit={field.exit}
        exitLabel="Salir del modo piscina"
        top={selectors}
        footer={<div className="flex gap-2">{bar}</div>}
      >
        <div className="flex flex-col gap-3">
          {body}
          {note}
        </div>
        {keypadModal}
      </FieldScreen>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {body}
      {/* Siempre a la vista: fijo abajo, encima de la barra de la app en el teléfono (antes quedaba tapado). */}
      <div className={cx(STICKY_ABOVE_NAV, 'card-shadow flex gap-2 rounded-[26px] bg-surface/95 p-2 backdrop-blur')}>
        {bar}
      </div>
      {note}
      {keypadModal}
    </div>
  );
}
