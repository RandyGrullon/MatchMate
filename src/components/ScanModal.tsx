import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Plus, ScanLine, Sparkles, Trash2 } from 'lucide-react';
import { lastBall } from '../lib/balls';
import { fetchEffectiveAverages, saveVerifiedGames, type VerifiedWrite } from '../lib/data';
import { queueGameBalls, rememberBall } from '../lib/data/balls';
import type { CompressedImage } from '../lib/image';
import { useLeagueCtx } from '../lib/league';
import { ScanError } from '../lib/scan-result';
import { cancelScan, scanDone, startScan, useScanJob } from '../lib/scanJobs';
import type { BowlingEvent, Entry, Player } from '../lib/types';
import { GameBallChip } from './balls/BallPicker';
import { useBusy } from './busy';
import { useAction, useFeedback } from './feedback';
import { PhotoPicker } from './PhotoPicker';
import { PhotoView } from './PhotoModal';
import { Badge, Button, Card, Modal, Select, Spinner, cx } from './ui';
import { PRIVACY_PATH } from '../pages/legal/legal';
import {
  SCAN_ENROLLS,
  SCAN_FAILED,
  SCAN_NO_PHOTO_NOTE,
  SCAN_OWN_BALLS,
  SCAN_PRIVACY_NOTE,
  SCAN_READING,
  SCAN_REVIEW,
  SCAN_TITLE,
  manualScanRow,
  retargetScanRow,
  scanErrorText,
  scanGameCells,
  scanGamesToSave,
  scanProblems,
  scanRowsFrom,
  scanSaveLabel,
  scanSavedText,
  scanValuesOf,
  useOwnBalls,
  type OwnBalls,
  type RowDraft,
} from './scanLogic';

// Las filas, emparejar con los jugadores, lo que falta para guardar, los textos y la bola de quien verifica (sin
// pantallas) están en scanLogic.ts: los comparte la app del teléfono. Se siguen importando desde aquí.
export { useOwnBalls, type OwnBalls } from './scanLogic';

/**
 * Admin: sube la foto del marcador, la IA lee los juegos, se emparejan con los jugadores
 * y al guardar esos juegos quedan verificados (cuentan en estadísticas).
 */
export function ScanModal({
  open,
  onClose,
  event,
  entries,
  players,
  focusPlayerId,
}: {
  open: boolean;
  onClose: () => void;
  event: BowlingEvent;
  entries: Entry[];
  players: Player[];
  focusPlayerId?: string | null;
}) {
  const { lid, isAdmin, myPlayerId } = useLeagueCtx();
  const run = useAction();
  const { toast } = useFeedback();
  const [photo, setPhoto] = useState<CompressedImage | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const job = useScanJob(scanId);
  // El admin está mirando: la lectura no espera señal ni reintenta; si falla, anota a mano mirando la foto.
  const scanning = job?.status === 'leyendo';
  const [scanError, setScanError] = useState<string | null>(null);
  const [rows, setRows] = useState<RowDraft[]>([]);
  const saving = useBusy();
  // La lectura de la foto actual (si se elige otra o se cierra, lo que llegue de la anterior no se usa).
  const current = useRef<string | null>(null);
  // Si quien verifica también juega aquí: la bola de cada uno de sus juegos (solo en su fila).
  const ownBalls = useOwnBalls(open, event, entries, rows, myPlayerId);

  useEffect(() => {
    if (open) {
      setPhoto(null);
      setRows([]);
      setScanError(null);
      setScanId(null);
      current.current = null;
    } else {
      cancelScan(current.current);
    }
  }, [open]);

  const entryOf = (playerId: string) => entries.find((e) => e.playerId === playerId) ?? null;
  const participants = players.filter((p) => entries.some((e) => e.playerId === p.id));
  // Solo el admin inscribe jugadores nuevos al guardar; el anotador usa los que ya están.
  const others = isAdmin ? players.filter((p) => !entries.some((e) => e.playerId === p.id)) : [];

  /** Fila a mano: arranca en el primer juego sin verificar, con lo que ya estaba anotado como borrador. */
  const manualRow = (playerId = ''): RowDraft => manualScanRow(entryOf(playerId), event.games, playerId);

  async function onPicked(img: CompressedImage) {
    setPhoto(img);
    setRows([]);
    setScanError(null);
    cancelScan(current.current);
    const id = startScan(img.scan, { background: false, leagueId: lid, eventId: event.id });
    current.current = id;
    setScanId(id);
    try {
      const found = await scanDone(id);
      if (current.current !== id) return;
      const next = scanRowsFrom(found, { participants, others, entryOf, games: event.games, focusPlayerId });
      setRows(next);
    } catch (e) {
      if (current.current !== id) return;
      setScanError(e instanceof ScanError ? e.message : SCAN_FAILED);
      setRows([manualRow(focusPlayerId ?? '')]);
    }
  }

  const update = (key: string, patch: Partial<RowDraft>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const included = rows.filter((r) => r.include);
  const problems = scanProblems(rows);
  const gamesToSave = scanGamesToSave(rows, event.games);
  /** Los juegos de la fila que se guardan (juego del evento → pinos): los escritos que caben en el evento. */
  const valuesOf = (r: RowDraft) => scanValuesOf(r, event.games);

  async function save() {
    if (!photo || problems.length || !gamesToSave) return;
    // Las bolas de sus juegos como se ven ahora: al guardar cambian sus puntajes y, con ellos, la que se pone sola.
    const mine = included.find((r) => r.key === ownBalls.row);
    const balls = mine ? ownBalls.update(valuesOf(mine)) : null;
    // Los promedios de los nuevos también se esperan: la ruedita sale desde el toque y se quita aunque fallen.
    const ok = await saving.run('guardar', async () => {
      const newcomers = included.filter((r) => !entryOf(r.playerId)).map((r) => players.find((p) => p.id === r.playerId)!);
      const averages = newcomers.length ? await fetchEffectiveAverages(lid, newcomers, { date: event.date, eventId: event.id }) : new Map<string, number>();
      const writes: VerifiedWrite[] = included.map((r) => ({
        entry: entryOf(r.playerId),
        playerId: r.playerId,
        average: averages.get(r.playerId) ?? 0,
        values: valuesOf(r),
      }));
      return run(() => saveVerifiedGames(lid, event, photo, writes));
    });
    if (ok) {
      // Sus juegos ya están guardados: la bola de cada uno va detrás, en la cola de la liga (solo las que cambian). La
      // que eligió se pone sola la próxima vez.
      if (balls) {
        queueGameBalls('event', event.id, balls, lid);
        rememberBall(lastBall(Object.values(balls)));
      }
      toast(scanSavedText(gamesToSave));
      onClose();
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={
        <span className="flex items-center gap-2">
          <ScanLine className="size-5 text-accent" /> {SCAN_TITLE}
        </span>
      }
      footer={
        photo && (
          <>
            <PhotoPicker compact label="Otra foto" onPicked={onPicked} />
            <Button onClick={onClose}>Cancelar</Button>
            <Button variant="primary" onClick={save} loading={saving.isBusy()} disabled={scanning || !!problems.length || !gamesToSave}>
              {scanSaveLabel(gamesToSave)}
            </Button>
          </>
        )
      }
    >
      {!photo ? (
        <div className="flex flex-col gap-3">
          <PhotoPicker onPicked={onPicked} />
          <p className="text-xs text-muted">{SCAN_NO_PHOTO_NOTE}</p>
          {/* Aviso de privacidad: la foto la lee Google en su plan gratis (Ley 172-13: decir a quién va y para qué). */}
          <p className="flex gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-xs text-muted">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />
            <span>
              {SCAN_PRIVACY_NOTE}{' '}
              <a href={`${PRIVACY_PATH}#fotos`} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline underline-offset-2">
                Más en Privacidad
              </a>
            </span>
          </p>
        </div>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <PhotoView src={photo.data} />
          <div className="flex flex-col gap-3">
            {scanning && (
              <div className="flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-3 text-sm text-accent">
                <Spinner className="text-accent" /> {SCAN_READING}
              </div>
            )}
            {scanError && (
              <div className="flex gap-2 rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{scanErrorText(scanError)}</span>
              </div>
            )}
            {!scanning && !scanError && rows.length > 0 && (
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <Sparkles className="size-4 text-accent" /> {SCAN_REVIEW}
              </p>
            )}
            {rows.map((r) => {
              const entry = entryOf(r.playerId);
              return (
                <Card key={r.key} className={cx('flex flex-col gap-3 p-3', !r.include && 'opacity-55')}>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--accent)]"
                      checked={r.include}
                      onChange={(e) => update(r.key, { include: e.target.checked })}
                      aria-label="Incluir esta fila"
                    />
                    <span className="text-xs text-muted">
                      {r.screenName ? (
                        <>
                          Leído: <b className="text-fg">{r.screenName}</b>
                          {r.screenHcp != null && ` · Hcp ${r.screenHcp}`}
                          {r.matchesTotal === true && <span className="ml-1.5 text-ok">✓ cuadra con el total {r.screenTotal}</span>}
                          {r.matchesTotal === false && (
                            <span className="ml-1.5 text-warn">⚠ la suma no cuadra con el total {r.screenTotal}: revisa</span>
                          )}
                        </>
                      ) : (
                        'Fila manual'
                      )}
                    </span>
                    {!r.screenName && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        aria-label="Quitar fila"
                        onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                        icon={<Trash2 className="size-4" />}
                      />
                    )}
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Select
                      value={r.playerId}
                      onChange={(e) => update(r.key, retargetScanRow(r, e.target.value, entryOf(e.target.value), event.games))}
                      aria-label="Jugador"
                      className={cx(!r.playerId && r.include && 'border-warn')}
                    >
                      <option value="">— Elegir jugador —</option>
                      <optgroup label="En este evento">
                        {participants.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </optgroup>
                      {others.length > 0 && (
                        <optgroup label="Otros (se inscriben)">
                          {others.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </Select>
                    <Select
                      value={r.start}
                      onChange={(e) => update(r.key, { start: +e.target.value })}
                      aria-label="Desde el juego"
                      className="w-auto"
                    >
                      {Array.from({ length: event.games }, (_, i) => (
                        <option key={i} value={i}>
                          Desde J{i + 1}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <ScanGames row={r} games={event.games} entry={entry} own={ownBalls} onValues={(values) => update(r.key, { values })} />
                  {r.playerId && !entry && <Badge tone="accent">{SCAN_ENROLLS}</Badge>}
                </Card>
              );
            })}
            {!scanning && (
              <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => setRows((rs) => [...rs, manualRow()])} className="self-start">
                Agregar fila a mano
              </Button>
            )}
            {problems.length > 0 && included.length > 0 && (
              <ul className="text-xs text-danger">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * Los juegos de una fila: el puntaje de cada juego del evento (desde «Desde J»; los que no caben, tachados) y, en la de
 * quien verifica (`own.row`), la bola de cada uno debajo.
 */
export function ScanGames({
  row,
  games,
  entry,
  own,
  onValues,
}: {
  row: Pick<RowDraft, 'key' | 'start' | 'values'>;
  games: number;
  entry: Entry | null;
  own?: OwnBalls | null;
  onValues: (values: string[]) => void;
}) {
  const cells = scanGameCells(row, games, entry);
  const ball = own && own.row === row.key ? own : null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {row.values.map((v, k) => {
          const { slot, out, label, differs, replaces } = cells[k];
          return (
            <div key={k} className="flex w-16 flex-col items-center gap-1">
              <span className="text-[11px] text-muted">{label}</span>
              <input
                type="number"
                inputMode="numeric"
                value={v}
                disabled={out}
                aria-label={`Juego ${slot + 1}`}
                onChange={(e) => onValues(row.values.map((x, j) => (j === k ? e.target.value : x)))}
                className={cx(
                  'h-10 w-full rounded-lg border bg-surface text-center font-semibold tabular-nums',
                  out ? 'border-line opacity-40 line-through' : differs ? 'border-warn' : 'border-line',
                )}
              />
              {ball && !out && <GameBallChip game={slot} balls={ball.balls} value={ball.ballOf(slot)} onPick={ball.onPick} />}
              {differs && <span className="text-[10px] text-warn">{differs}</span>}
              {replaces && <span className="text-[10px] text-muted">reemplaza ✓</span>}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => onValues([...row.values, ''])}
          className="mt-5 flex size-10 items-center justify-center rounded-lg border border-dashed border-line text-muted hover:text-fg"
          aria-label="Agregar juego"
        >
          <Plus className="size-4" />
        </button>
      </div>
      {ball && <p className="text-xs text-muted">{SCAN_OWN_BALLS}</p>}
    </>
  );
}
