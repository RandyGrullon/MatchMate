import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { Copy, Eraser, Rows3, Send, Shuffle, Users } from 'lucide-react';
import { fetchEffectiveAverages } from '../../lib/data';
import { assignLanes, clearLanes, publishLanes, setPlayerLane, useEventLanes } from '../../lib/data/lanes';
import { asBackendError } from '../../lib/db/errors';
import { eventLabel } from '../../lib/format';
import {
  PER_LANE_OPTIONS,
  formatLanes,
  groupLanes,
  hasTeams,
  laneCandidates,
  laneChoices,
  lanesNeeded,
  lanesPublished,
  lanesText,
  orderByAverage,
  parseLanes,
  unpublishedCount,
  type LaneMode,
} from '../../lib/lanes';
import { useLeagueCtx } from '../../lib/league';
import type { BowlingEvent, Entry, Player } from '../../lib/types';
import { copyText } from '../share/actions';
import { useBusy } from '../busy';
import { BusySelect } from '../event/BusySelect';
import { saveErrorMessage, useAction, useFeedback } from '../feedback';
import { Badge, Button, Card, Empty, Field, Input, ListSkeleton, LoadError, Select, cx } from '../ui';

// ---------- Lo último que usó el admin (en este teléfono) ----------

interface LanePrefs {
  lanes: string;
  perLane: number;
}

const prefsKey = (lid: string) => `mm:pistas:${lid}`;

function readPrefs(lid: string): LanePrefs {
  try {
    const v = JSON.parse(localStorage.getItem(prefsKey(lid)) ?? 'null') as Partial<LanePrefs> | null;
    const perLane = Number(v?.perLane);
    return {
      lanes: typeof v?.lanes === 'string' && parseLanes(v.lanes) ? v.lanes : '',
      perLane: PER_LANE_OPTIONS.includes(perLane as (typeof PER_LANE_OPTIONS)[number]) ? perLane : 4,
    };
  } catch {
    return { lanes: '', perLane: 4 };
  }
}

function savePrefs(lid: string, prefs: LanePrefs) {
  try {
    localStorage.setItem(prefsKey(lid), JSON.stringify(prefs));
  } catch {
    // sin almacenamiento: la próxima vez se escribe de nuevo
  }
}

const MODES: { key: LaneMode; label: string }[] = [
  { key: 'promedio', label: 'Por promedio' },
  { key: 'equipo', label: 'Por equipo' },
  { key: 'azar', label: 'Al azar' },
];

/**
 * Evento de boliche › Pistas (admin o anotador): arma las pistas con los que dijeron «voy» o están inscritos
 * (números como «5-9», jugadores por pista y cómo: por promedio, por equipo o al azar), las muestra por pista con
 * «Mover a…», las copia para WhatsApp («Pista 7: Juan, Ana, Luis») y las publica (push a cada jugador con cuenta).
 */
export function LanesPanel({ event, entries, players }: { event: BowlingEvent; entries: Entry[]; players: Player[] }) {
  const { lid } = useLeagueCtx();
  const run = useAction();
  const { confirm, toast } = useFeedback();
  const lanes = useEventLanes(lid, event.id);
  const rows = lanes.data;
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const nameOf = useCallback((id: string) => byId.get(id)?.name ?? '(jugador borrado)', [byId]);
  const groups = useMemo(() => groupLanes(rows, nameOf), [rows, nameOf]);
  const candidates = useMemo(() => laneCandidates(event, entries), [event, entries]);
  const teams = hasTeams(entries);

  const [prefs] = useState(() => readPrefs(lid));
  const [input, setInput] = useState(prefs.lanes);
  const [perLane, setPerLane] = useState(prefs.perLane);
  const [mode, setMode] = useState<LaneMode>('promedio');
  const [busy, setBusy] = useState<'armar' | 'publicar' | 'borrar' | null>(null);
  const copying = useBusy();

  const typed = parseLanes(input);
  const need = lanesNeeded(candidates.length, perLane);
  const fits = !!typed && candidates.length <= typed.length * perLane;
  const choices = laneChoices(typed, rows);
  const withLane = new Set(rows.map((r) => r.playerId));
  const unassigned = candidates.filter((id) => !withLane.has(id)).sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'es'));
  const published = lanesPublished(rows);
  const changed = unpublishedCount(rows);
  const modes = MODES.filter((m) => m.key !== 'equipo' || teams);
  const activeMode = modes.some((m) => m.key === mode) ? mode : 'promedio';

  async function generate() {
    if (!typed || !fits || !candidates.length || busy) return;
    if (rows.length) {
      const ok = await confirm({
        title: '¿Armar las pistas otra vez?',
        message: 'Se reemplazan las que hay ahora, también los cambios que hiciste a mano.',
        confirmText: 'Armar de nuevo',
      });
      if (!ok) return;
    }
    setBusy('armar');
    savePrefs(lid, { lanes: formatLanes(typed), perLane });
    await run(async () => {
      let order: string[] | null = null;
      if (activeMode !== 'azar') {
        // El mismo promedio que toma el handicap de este evento: el de su temporada (src/lib/bowlingSeason.ts).
        const averages = await fetchEffectiveAverages(
          lid,
          candidates.map((id) => ({ id, averageOverride: byId.get(id)?.averageOverride ?? null })),
          { date: event.date, eventId: event.id },
        );
        order = orderByAverage(candidates, averages, players);
      }
      await assignLanes(event.id, { lanes: typed, perLane, mode: activeMode, order });
      return true;
    }, 'Pistas armadas');
    setBusy(null);
  }

  async function move(playerId: string, value: string) {
    const lane = value === 'quitar' ? null : Number(value);
    if (lane !== null && !Number.isInteger(lane)) return;
    await run(() => setPlayerLane(event.id, playerId, lane));
  }

  async function copy() {
    const ok = await copying.run('copiar', () => copyText(lanesText(groups, `Pistas · ${eventLabel(event)}`)));
    if (ok === undefined) return;
    toast(ok ? 'Copiado: pégalo en el grupo de WhatsApp' : 'No se pudo copiar', ok ? 'ok' : 'error');
  }

  async function publish() {
    if (busy) return;
    const ok = await confirm({
      title: published ? '¿Avisar las pistas otra vez?' : '¿Publicar las pistas?',
      message: 'A cada jugador con cuenta le llega «Tu pista: …» al teléfono, y la ve en el evento y en el inicio de la liga.',
      confirmText: 'Publicar y avisar',
    });
    if (!ok) return;
    setBusy('publicar');
    try {
      const r = await publishLanes(event.id);
      toast(r.pushed ? `Pistas publicadas: le avisamos a ${r.pushed} ${r.pushed === 1 ? 'jugador' : 'jugadores'}` : 'Pistas publicadas (nadie de la lista tiene cuenta)');
    } catch (e) {
      console.error(e);
      toast(asBackendError(e)?.kind === 'rate_limited' ? 'Ya avisaste varias veces en esta hora. Espera un rato.' : saveErrorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function clear() {
    if (busy) return;
    const ok = await confirm({
      title: '¿Borrar las pistas?',
      message: published ? 'Los jugadores dejan de ver su pista. Puedes armarlas otra vez cuando quieras.' : 'Puedes armarlas otra vez cuando quieras.',
      confirmText: 'Borrar',
      danger: true,
    });
    if (!ok) return;
    setBusy('borrar');
    await run(() => clearLanes(event.id), 'Pistas borradas');
    setBusy(null);
  }

  // Cada fila con su ruedita: las demás se pueden mover mientras tanto.
  const moveSelect = (playerId: string, current: number | null) => (
    <BusySelect
      wrapClassName="w-36 shrink-0"
      aria-label={`Mover a ${nameOf(playerId)}`}
      className="h-11"
      value={current == null ? '' : String(current)}
      onPick={(value) => move(playerId, value)}
    >
      {current == null && (
        <option value="" disabled>
          Poner en…
        </option>
      )}
      {choices.map((n) => (
        <option key={n} value={String(n)}>
          Pista {n}
        </option>
      ))}
      {current != null && <option value="quitar">Quitar de la pista</option>}
    </BusySelect>
  );

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Rows3 className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">Armar las pistas</h3>
            <p className="text-sm text-muted">
              {candidates.length
                ? `${candidates.length} ${candidates.length === 1 ? 'jugador' : 'jugadores'}: los que dijeron «voy» o están inscritos.`
                : 'Todavía nadie dijo «voy» ni está inscrito.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Pistas" hint={input && !typed ? 'Escribe números como 5-9 o 3, 5, 7.' : undefined}>
            {/* Teclado de texto (no numérico): en el iPhone el numérico no tiene guion ni coma para «5-9» o «3, 5». */}
            <Input
              className="h-11"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="5-9"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="done"
              aria-invalid={!!input && !typed}
            />
          </Field>
          <Field label="Jugadores por pista">
            <Select className="h-11" value={String(perLane)} onChange={(e) => setPerLane(Number(e.target.value))}>
              {PER_LANE_OPTIONS.map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div role="radiogroup" aria-label="Cómo se reparten" className="grid gap-1 rounded-xl bg-surface-2 p-1" style={{ gridTemplateColumns: `repeat(${modes.length}, minmax(0, 1fr))` }}>
          {modes.map((m) => (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={activeMode === m.key}
              onClick={() => setMode(m.key)}
              className={cx(
                'min-h-11 rounded-lg px-2 text-sm font-medium transition',
                activeMode === m.key ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="-mt-2 text-xs text-muted">
          {activeMode === 'promedio'
            ? 'Los de promedios parecidos juntos.'
            : activeMode === 'equipo'
              ? 'Los de un mismo equipo juntos.'
              : 'Al azar, cada vez distinto.'}
          {candidates.length > 0 && need > 0 && ` Hacen falta ${need} ${need === 1 ? 'pista' : 'pistas'} de ${perLane}.`}
        </p>
        {typed && !fits && candidates.length > 0 && (
          <p className="text-sm text-warn">
            No caben: son {candidates.length} y hay {typed.length * perLane} lugares. Agrega pistas o sube los jugadores por pista.
          </p>
        )}

        <Button
          variant="primary"
          className="h-11"
          icon={activeMode === 'azar' ? <Shuffle className="size-4" /> : <Rows3 className="size-4" />}
          loading={busy === 'armar'}
          disabled={!typed || !fits || !candidates.length || !!busy}
          onClick={() => void generate()}
        >
          {rows.length ? 'Armar de nuevo' : 'Armar pistas'}
        </Button>
      </Card>

      {lanes.error && !rows.length ? (
        <LoadError error={lanes.error} />
      ) : lanes.loading && !rows.length ? (
        <ListSkeleton rows={3} />
      ) : !rows.length ? (
        <Empty icon={<Rows3 className="size-8" />} title="Sin pistas todavía">
          Escribe las pistas que te dieron en la bolera y toca «Armar pistas». Después puedes mover a cualquiera.
        </Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 flex-1 font-semibold">Pistas</h3>
            {!published ? <Badge tone="warn">Sin publicar</Badge> : changed ? <Badge tone="warn">{changed === 1 ? '1 cambio sin avisar' : `${changed} cambios sin avisar`}</Badge> : <Badge tone="ok">Publicadas</Badge>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.map((g, gi) => (
              <Card key={g.lane} className="animate-fade-up overflow-hidden" style={{ '--i': gi } as CSSProperties}>
                <div className="flex items-center gap-2 border-b border-line bg-surface-2/60 px-4 py-2">
                  <span className="font-semibold">Pista {g.lane}</span>
                  <span className="ml-auto text-xs text-muted">
                    {g.players.length} {g.players.length === 1 ? 'jugador' : 'jugadores'}
                  </span>
                </div>
                <ol className="divide-y divide-line">
                  {g.players.map((p) => (
                    <li key={p.playerId} className="flex items-center gap-3 px-4 py-1.5">
                      <span className="w-5 shrink-0 text-center text-xs text-muted tabular-nums">{p.position}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                      {moveSelect(p.playerId, g.lane)}
                    </li>
                  ))}
                </ol>
              </Card>
            ))}
          </div>

          {unassigned.length > 0 && (
            <Card className="overflow-hidden border-warn/40">
              <div className="flex items-center gap-2 border-b border-line bg-warn-soft/60 px-4 py-2 text-sm font-semibold text-warn">
                <Users className="size-4" /> Sin pista ({unassigned.length})
              </div>
              <ul className="divide-y divide-line">
                {unassigned.map((id) => (
                  <li key={id} className="flex items-center gap-3 px-4 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{nameOf(id)}</span>
                    {moveSelect(id, null)}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <Button className="h-11" icon={<Copy className="size-4" />} loading={copying.isBusy()} onClick={() => void copy()}>
              Copiar para WhatsApp
            </Button>
            <Button className="h-11" variant="primary" icon={<Send className="size-4" />} loading={busy === 'publicar'} disabled={!!busy} onClick={() => void publish()}>
              Publicar y avisar
            </Button>
          </div>
          <div className="flex justify-center">
            <Button variant="ghost" className="h-11 text-danger" icon={<Eraser className="size-4" />} loading={busy === 'borrar'} disabled={!!busy} onClick={() => void clear()}>
              Borrar pistas
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
