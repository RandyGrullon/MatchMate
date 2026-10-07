import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarCheck, Camera, CheckCircle2, Grid3x3, Plus, ScanLine, UserPlus, Users, X } from 'lucide-react';
import { ballsByGame, defaultBall, eventBallUpdate, eventGameBall, knownBalls, ownPickShown, seenPick, type OwnPick } from '../../lib/balls';
import { addEntries, addEventGame, fetchEffectiveAverages, removeEntry, saveGame, updateEntry } from '../../lib/data';
import { queueGameBalls, queuedBallsByGame, rememberBall, useMyBallGames } from '../../lib/data/balls';
import { getUserId } from '../../lib/data/client';
import { useLeagueCtx } from '../../lib/league';
import { entryLine, slots, teamRule, type Line } from '../../lib/stats';
import { NO_PHOTO, type BowlingEvent, type Entry, type Player } from '../../lib/types';
import { BallIcon, GameBallChip, GameBallSelect, useBallChoice } from '../balls/BallPicker';
import { BusyIcon, useBusy } from '../busy';
import { useAction, useFeedback } from '../feedback';
import { PhotoModal } from '../PhotoModal';
import { ScanModal } from '../ScanModal';
import { ScoreInput } from '../ScoreInput';
import { clearGameDraft, tableGameKey } from '../frames/draftMemory';
import { ScoreEntryModal } from '../frames/ScoreEntryModal';
import { Badge, Button, Card, Empty, cx } from '../ui';
import { AddPlayersModal } from './AddPlayersModal';

interface Group {
  key: string;
  title: string | null;
  lines: Line[];
}

/**
 * El total del encabezado de un equipo con su regla (docs/premios-torneo.md §5.1): con equipos por scratch (la del
 * dueño) el número grande son los pinos y el total con handicap va al lado, en gris; con equipos por handicap, el
 * total con handicap (como antes). `hcp` null = no hay otro número que mostrar.
 */
export function groupTotal(event: BowlingEvent, lines: readonly Line[]): { main: number; hcp: number | null } {
  let scratch = 0;
  let withHcp = 0;
  for (const l of lines) {
    for (const s of l.scores) {
      if (s == null) continue;
      scratch += s;
      withHcp += s + l.hcp;
    }
  }
  if (teamRule(event) === 'hcp' || withHcp === scratch) return { main: withHcp, hcp: null };
  return { main: scratch, hcp: withHcp };
}

export function TeamTotal({ total }: { total: { main: number; hcp: number | null } }) {
  return (
    <span className="text-xs text-muted tabular-nums">
      Total <b className="text-fg">{total.main}</b>
      {total.hcp != null && <span> · con hcp {total.hcp}</span>}
    </span>
  );
}

/**
 * Anotar pinos por juego (a mano, por cuadros o con la foto). Sin foto = borrador si la liga la exige.
 * El anotador del torneo solo anota: no agrega ni quita jugadores.
 */
export function GamesTab({ event, entries, players }: { event: BowlingEvent; entries: Entry[]; players: Player[] }) {
  const { lid, league, isAdmin, myPlayerId } = useLeagueCtx();
  const requirePhoto = league.requirePhoto !== false;
  const run = useAction();
  const { confirm } = useFeedback();
  const busy = useBusy();
  // Aparte: quitar la verificación no espera (ni detiene) a quitar un jugador o agregar un juego.
  const unverifying = useBusy();
  const [scanFor, setScanFor] = useState<string | null | undefined>(undefined);
  const [adding, setAdding] = useState(false);
  const [photo, setPhoto] = useState<{ entry: Entry; game: number; photoId: string } | null>(null);
  const [framesFor, setFramesFor] = useState<{ entryId: string; game: number } | null>(null);
  const byId = new Map(players.map((p) => [p.id, p]));
  const nameOf = (e: Entry) => byId.get(e.playerId)?.name ?? '(jugador borrado)';
  const isTorneo = event.type === 'torneo';

  // En la grilla se ven también los borradores (vista previa).
  const lines = entries.map((e) => entryLine(e, event, true)).sort((a, b) => nameOf(a.entry).localeCompare(nameOf(b.entry)));
  const pending = lines.reduce((n, l) => n + l.pending, 0);
  // Confirmados con "Voy" que todavía no están anotados como asistentes.
  const confirmed = Object.keys(event.rsvp ?? {}).filter((id) => byId.has(id));
  const missing = confirmed.filter((id) => !entries.some((e) => e.playerId === id));
  const [addingConfirmed, setAddingConfirmed] = useState(false);

  async function addConfirmed() {
    setAddingConfirmed(true);
    const chosen = missing.map((id) => byId.get(id)!);
    await run(async () => {
      const avgs = await fetchEffectiveAverages(lid, chosen, { date: event.date, eventId: event.id });
      await addEntries(lid, event, chosen.map((p) => ({ id: p.id, average: avgs.get(p.id) ?? 0 })));
    }, `${chosen.length} agregados`);
    setAddingConfirmed(false);
  }

  const groups: Group[] = isTorneo
    ? [
        ...Object.entries(event.teams ?? {})
          .sort(([, a], [, b]) => a.order - b.order)
          .map(([id, t]) => ({ key: id, title: t.name, lines: lines.filter((l) => l.entry.teamId === id) })),
        { key: '_none', title: 'Sin equipo', lines: lines.filter((l) => !l.entry.teamId || !event.teams?.[l.entry.teamId]) },
      ].filter((g) => g.lines.length)
    : [{ key: '_all', title: null, lines }];

  // Sus propios juegos (el dueño, un admin o el anotador que también juega): con qué bola tiró cada uno. Solo en su fila
  // y en su hoja: set_game_balls marca los juegos de la cuenta, no los de la fila que se está anotando.
  const mine = myPlayerId ? entries.find((e) => e.playerId === myPlayerId) : undefined;
  const myScores = slots(mine?.scores, event.games, null);
  const choice = useBallChoice();
  const eventBalls = useMyBallGames(event.id, !!mine && choice.canPick);
  // Las que ya tenía: las del servidor (una cuenta que abrió sin bolas no tenía ninguna: no espera a leerlas, y al
  // agregar la primera aquí no se pierde la elegida) con lo que está en la cola encima. null = no se sabe (sin leer y
  // sin señal): la bola no sale ni se guarda (guardar podría pisarlas).
  const serverHad = !eventBalls.loading && !eventBalls.error ? ballsByGame(eventBalls.data, 'event', event.id) : choice.noBallsAtStart ? {} : null;
  const known = mine && choice.canPick ? knownBalls(event.games, serverHad, queuedBallsByGame('event', event.id)) : null;
  // La que eligió aquí en cada juego y la que tenía entonces: se ve enseguida (sin esperar la cola ni volver a leer) y,
  // en uno sin jugar, queda para cuando lo anote. Ya en la cola, solo mientras el juego siga con ella: si después otra
  // pantalla le pone otra (la foto), manda esa (ownPickShown, seenPick).
  const [ownPicks, setOwnPicks] = useState<Record<number, OwnPick>>({});
  const pickedHere = (game: number) => ownPickShown(ownPicks[game], known?.[game] ?? null);
  // La última que eligió en cada juego, al momento: la que va con el juego cuando termine de guardarse (si la cambia
  // mientras se guarda, va la nueva).
  const lastPick = useRef<Record<number, string | null>>({});
  function keepPick(game: number, ball: string | null) {
    lastPick.current[game] = ball;
    setOwnPicks((p) => ({ ...p, [game]: { ball, was: known?.[game] ?? null } }));
  }

  /**
   * La bola de un juego suyo como se ve (y como se guarda al anotarlo): la que eligió aquí o la que ya tenía. Uno con
   * puntaje y sin bola sale sin bola (eventGameBall); uno sin jugar, con la del juego anterior que tenga una o, si no,
   * con la última que usó (una retirada o borrada no se pone sola).
   */
  function ownBall(game: number): string | null {
    if (!known) return null;
    const here = pickedHere(game);
    if (here !== undefined) return here;
    let before: string | null = null;
    for (let j = game - 1; j >= 0 && !before; j--) {
      const prev = pickedHere(j);
      before = prev !== undefined ? prev : (known[j] ?? null);
    }
    return eventGameBall(known, game, myScores[game] != null, defaultBall(choice.balls, before, choice.auto));
  }

  /**
   * Después de guardar (o borrar) un juego suyo: su bola va detrás del juego, en la misma cola de la liga (borrarlo le
   * quita la suya y vuelve a la que se pone sola). Solo si cambió: la que eligió se pone sola la próxima vez.
   */
  function afterOwnScore(game: number, score: number | null) {
    if (!known) return;
    const picked = game in lastPick.current ? lastPick.current[game] : undefined;
    const update = eventBallUpdate(known, game, score, picked);
    if (update) {
      queueGameBalls('event', event.id, update, lid);
      rememberBall(update[String(game)]);
    }
    if (score == null) {
      delete lastPick.current[game];
      setOwnPicks((p) => {
        const next = { ...p };
        delete next[game];
        return next;
      });
    } else if (picked !== undefined) setOwnPicks((p) => seenPick(p, game, picked));
  }

  /** Cambió la bola de un juego suyo (el botón debajo de la casilla): con puntaje va por la cola; sin puntaje, al anotarlo. */
  function pickOwnBall(game: number, picked: string | null) {
    if (!known) return;
    keepPick(game, picked);
    if (myScores[game] == null) return;
    const update = eventBallUpdate(known, game, myScores[game], picked);
    if (update) {
      queueGameBalls('event', event.id, update, lid);
      rememberBall(picked);
    }
    setOwnPicks((p) => seenPick(p, game, picked));
  }

  // El botón de la bola (con memo) recibe siempre la misma función: la de este momento queda en `pickRef`.
  const pickRef = useRef(pickOwnBall);
  useEffect(() => {
    pickRef.current = pickOwnBall;
  });
  const onPickBall = useCallback((game: number | 'all', id: string | null) => {
    if (game !== 'all') pickRef.current(game, id);
  }, []);

  function setScore(entry: Entry, game: number, value: number | null) {
    // En su fila, la bola que se ve debajo de la casilla va con el juego (se mira antes de guardar: es la que vio) y se
    // sigue viendo mientras se guarda.
    const own = !!known && entry.id === mine?.id;
    if (own && value != null) keepPick(game, ownBall(game));
    run(async () => {
      await saveGame(lid, event, entry, game, { score: value, frames: null }, requirePhoto);
      // Lo que quedó a medias en la hoja de ese juego ya no vale: manda lo que se escribió en la casilla.
      clearGameDraft(tableGameKey(getUserId(), lid, event.id, entry.id, game));
      if (own) afterOwnScore(game, value);
    });
  }

  async function unverify() {
    if (!photo) return;
    const ok = await confirm({
      title: 'Quitar verificación',
      message: requirePhoto
        ? 'El juego vuelve a borrador y deja de contar hasta que se verifique con otra foto.'
        : 'Se quita la foto; el juego sigue contando como anotado sin foto.',
      confirmText: 'Quitar',
      danger: true,
    });
    if (!ok) return;
    const photos = slots(photo.entry.photos, event.games, null);
    photos[photo.game] = requirePhoto ? null : NO_PHOTO;
    // La foto sigue abierta (con la ruedita en «Quitar verificación») hasta que se guarda.
    await unverifying.run('quitar', () => run(() => updateEntry(lid, photo.entry.id, { photos })));
    setPhoto(null);
  }

  async function remove(entry: Entry) {
    const ok = await confirm({ title: `¿Quitar a ${nameOf(entry)}?`, message: 'Se borran sus juegos de esta práctica.', confirmText: 'Quitar', danger: true });
    if (ok) await busy.run(`x:${entry.id}`, () => run(() => removeEntry(lid, entry)));
  }

  // En la práctica «Otro juego» va por la cola y se ve de una; en el torneo espera al servidor (con la ruedita).
  const gameQueued = !event.type || event.type === 'practica';
  function addGame() {
    const add = () => run(() => addEventGame(lid, event), `Juego ${event.games + 1} agregado`);
    void (gameQueued ? add() : busy.run('juego', add));
  }

  const framesEntry = framesFor ? entries.find((e) => e.id === framesFor.entryId) : undefined;
  const framesGame = framesFor?.game ?? 0;
  const framesVerified = framesEntry ? isRealPhoto(slots(framesEntry.photos, event.games, null)[framesGame]) : false;
  // Uno de sus juegos, con las que ya tenía leídas: arriba sale la bola del juego (también sin bolas: «Agregar»).
  const ownGames = !!framesEntry && !!known && framesEntry.id === mine?.id;
  const ballPick = useRef<string | null>(null);

  const cols = `repeat(${event.games}, minmax(3.25rem, 1fr))`;
  let row = 0;

  return (
    <div className="flex flex-col gap-4">
      {!isTorneo && isAdmin && confirmed.length > 0 && (
        <Card className="animate-fade-up flex flex-col gap-3 border-ok/40 bg-ok-soft/40 p-3 sm:flex-row sm:items-center">
          <CalendarCheck className="size-5 shrink-0 text-ok" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">
              {confirmed.length} {confirmed.length === 1 ? 'confirmó' : 'confirmaron'} que van
            </p>
            <p className="truncate text-xs text-muted">{confirmed.map((id) => byId.get(id)!.name).join(', ')}</p>
          </div>
          {missing.length > 0 && (
            <Button size="sm" icon={<UserPlus className="size-4" />} loading={addingConfirmed} onClick={addConfirmed}>
              Agregar {missing.length} a la práctica
            </Button>
          )}
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button icon={<ScanLine className="size-4" />} onClick={() => setScanFor(null)} disabled={!players.length}>
          {requirePhoto ? 'Verificar con foto' : 'Leer foto'}
        </Button>
        {isAdmin && event.games < 10 && (
          <Button icon={<Plus className="size-4" />} loading={busy.isBusy('juego')} onClick={addGame}>
            Otro juego
          </Button>
        )}
        {!isTorneo && isAdmin && (
          <Button icon={<UserPlus className="size-4" />} onClick={() => setAdding(true)}>
            Agregar asistentes
          </Button>
        )}
        {requirePhoto && pending > 0 && (
          <Badge tone="warn" className="ml-auto">
            <Camera className="size-3" /> {pending} {pending === 1 ? 'juego sin foto' : 'juegos sin foto'}
          </Badge>
        )}
      </div>

      {entries.length === 0 ? (
        <Empty icon={<Users className="size-8" />} title={isTorneo ? 'Nadie inscrito' : 'Sin asistentes'}>
          {!isAdmin
            ? 'El admin todavía no ha inscrito jugadores.'
            : isTorneo
              ? 'Inscribe jugadores en la pestaña Inscritos.'
              : 'Agrega quién vino a practicar, o lee una foto y se agregan solos.'}
        </Empty>
      ) : (
        groups.map((g) => {
          const total = groupTotal(event, g.lines);
          return (
            <Card key={g.key} className="overflow-hidden">
              {g.title && (
                <div className="flex items-center justify-between border-b border-line bg-surface-2/60 px-4 py-2">
                  <h3 className="text-sm font-semibold">{g.title}</h3>
                  <TeamTotal total={total} />
                </div>
              )}
              <div className="hidden items-center gap-3 px-4 pt-2 text-[11px] font-medium text-muted sm:flex">
                <span className="w-44 shrink-0">Jugador</span>
                <div className="grid flex-1 gap-2" style={{ gridTemplateColumns: cols }}>
                  {Array.from({ length: event.games }, (_, i) => (
                    <span key={i} className="text-center">
                      J{i + 1}
                    </span>
                  ))}
                </div>
                <span className="w-14 text-right">Total</span>
                <span className="w-16" />
              </div>
              <div className="divide-y divide-line">
                {g.lines.map((l) => {
                  const r = row++;
                  const name = nameOf(l.entry);
                  const photos = slots(l.entry.photos, event.games, null);
                  const firstOpen = Math.max(0, l.scores.findIndex((s) => s == null));
                  // Su propia fila: debajo de cada juego, la bola con que lo tiró (en la de los demás, nunca). Las casillas
                  // van en su caja desde el principio: si no, al leer sus bolas se volverían a montar y perdería lo escrito.
                  const ownRow = !!mine && l.entry.id === mine.id;
                  const removing = busy.isBusy(`x:${l.entry.id}`);
                  return (
                    <div key={l.entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:flex-nowrap">
                      <div className="flex w-full min-w-0 items-center gap-2 sm:w-44 sm:shrink-0">
                        <span className="truncate font-medium">{name}</span>
                        {isTorneo && <span className="text-xs text-muted tabular-nums">hcp {l.hcp}</span>}
                        {!isTorneo && isAdmin && (
                          <button
                            type="button"
                            onClick={() => remove(l.entry)}
                            disabled={busy.isBusy()}
                            aria-busy={removing || undefined}
                            className="ml-auto rounded p-1 text-muted hover:text-danger disabled:pointer-events-none disabled:opacity-60 sm:hidden"
                            aria-label={`Quitar a ${name}`}
                          >
                            <BusyIcon busy={removing} icon={<X className="size-4" />} className="size-4" />
                          </button>
                        )}
                      </div>
                      <div className="grid min-w-0 flex-1 gap-2" style={{ gridTemplateColumns: cols }}>
                        {l.scores.map((s, i) => {
                          const input = (
                            <ScoreInput
                              key={i}
                              label={`${name} juego ${i + 1}`}
                              value={s}
                              verified={isRealPhoto(photos[i])}
                              counted={photos[i] === NO_PHOTO}
                              row={r}
                              col={i}
                              onCommit={(v) => setScore(l.entry, i, v)}
                              onOpenPhoto={() => setPhoto({ entry: l.entry, game: i, photoId: photos[i]! })}
                            />
                          );
                          if (!ownRow) return input;
                          return (
                            <div key={i} className="flex min-w-0 flex-col gap-1">
                              {input}
                              {known && <GameBallChip game={i} balls={choice.balls} value={ownBall(i)} onPick={onPickBall} />}
                            </div>
                          );
                        })}
                      </div>
                      <span className="w-14 text-right font-semibold tabular-nums">
                        {l.total || '—'}
                        {requirePhoto && l.pending > 0 && <span className="block text-[10px] font-normal text-warn">vista previa</span>}
                      </span>
                      <div className="flex w-16 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Anotar (pines, teclado o total)"
                          aria-label={`Anotar juegos de ${name} (pines, teclado o total)`}
                          onClick={() => setFramesFor({ entryId: l.entry.id, game: firstOpen })}
                          icon={<Grid3x3 className={cx('size-4', l.entry.frames && Object.keys(l.entry.frames).length ? 'text-accent' : 'text-muted')} />}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          title={requirePhoto ? 'Verificar con foto' : 'Leer foto'}
                          aria-label={`Verificar juegos de ${name} con foto`}
                          onClick={() => setScanFor(l.entry.playerId)}
                          icon={requirePhoto && l.pending > 0 ? <Camera className="size-4 text-warn" /> : <CheckCircle2 className="size-4 text-muted" />}
                        />
                      </div>
                      {!isTorneo && isAdmin && (
                        <button
                          type="button"
                          onClick={() => remove(l.entry)}
                          disabled={busy.isBusy()}
                          aria-busy={removing || undefined}
                          className="hidden rounded p-1 text-muted hover:text-danger disabled:pointer-events-none disabled:opacity-60 sm:block"
                          aria-label={`Quitar a ${name}`}
                        >
                          <BusyIcon busy={removing} icon={<X className="size-4" />} className="size-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })
      )}

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {requirePhoto ? (
          <>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block size-3 rounded border border-dashed border-warn" /> Borrador sin foto: no cuenta
            </span>
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="size-3 text-ok" /> Verificado con foto
            </span>
          </>
        ) : (
          <span>Esta liga no exige foto: lo que anotas cuenta de una.</span>
        )}
        <span className="inline-flex items-center gap-1">
          <Grid3x3 className="size-3" /> Anotar con pines, teclado o total
        </span>
        {known && (
          <span className="inline-flex items-center gap-1">
            <BallIcon className="size-3" /> Debajo de tus juegos, la bola con que tiraste: tócala para cambiarla
          </span>
        )}
        <span>Enter baja al siguiente jugador.</span>
      </p>

      <ScanModal
        open={scanFor !== undefined}
        onClose={() => setScanFor(undefined)}
        event={event}
        entries={entries}
        players={players}
        focusPlayerId={scanFor}
      />
      {!isTorneo && isAdmin && <AddPlayersModal open={adding} onClose={() => setAdding(false)} event={event} entries={entries} players={players} />}
      <PhotoModal
        photoId={photo?.photoId ?? null}
        onClose={() => setPhoto(null)}
        title={photo ? `${nameOf(photo.entry)} · Juego ${photo.game + 1}` : ''}
        actions={
          <Button variant="ghost" className="mr-auto text-danger" loading={unverifying.isBusy()} onClick={unverify}>
            Quitar verificación
          </Button>
        }
      />
      {framesEntry && (
        <ScoreEntryModal
          open
          onClose={() => setFramesFor(null)}
          title={`${nameOf(framesEntry)} · Juego ${framesGame + 1}`}
          resetKey={`${framesEntry.id}-${framesGame}`}
          // Lo anotado sin guardar queda en el teléfono por fila y juego (al cambiar de J1…Jn, cada uno el suyo).
          memoryKey={tableGameKey(getUserId(), lid, event.id, framesEntry.id, framesGame)}
          initial={{ score: slots(framesEntry.scores, event.games, null)[framesGame], frames: framesEntry.frames?.[framesGame] ?? null }}
          top={
            <>
              {event.games > 1 && (
                <div className="flex gap-1.5">
                  {Array.from({ length: event.games }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setFramesFor({ entryId: framesEntry.id, game: i })}
                      className={cx(
                        'h-11 flex-1 rounded-lg text-sm font-semibold transition',
                        i === framesGame ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted hover:text-fg',
                      )}
                    >
                      J{i + 1}
                    </button>
                  ))}
                </div>
              )}
              {ownGames && (
                <GameBallSelect
                  key={`${framesEntry.id}-${framesGame}`}
                  game={framesGame}
                  balls={choice.balls}
                  initial={ownBall(framesGame)}
                  choice={ballPick}
                />
              )}
            </>
          }
          note={
            framesVerified && requirePhoto ? (
              <p className="rounded-xl bg-warn-soft px-3 py-2 text-xs text-warn">Este juego ya está verificado con foto: si lo cambias vuelve a borrador.</p>
            ) : null
          }
          onSave={async (v) => {
            // La bola que se ve arriba (la elegida en la fila de bolas): en su fila se sigue viendo mientras se guarda.
            if (ownGames && v.score != null) keepPick(framesGame, ballPick.current);
            const ok = await run(async () => {
              await saveGame(lid, event, framesEntry, framesGame, v, requirePhoto);
              if (ownGames) afterOwnScore(framesGame, v.score);
              return true;
            }, `Juego ${framesGame + 1} guardado`);
            // No se guardó: lo anotado sigue en la memoria del teléfono.
            if (!ok) return false;
            // Sigue con el próximo juego sin anotar, o cierra.
            const next = slots(framesEntry.scores, event.games, null).findIndex((s, i) => i !== framesGame && s == null);
            setFramesFor(next >= 0 ? { entryId: framesEntry.id, game: next } : null);
          }}
        />
      )}
    </div>
  );
}

/** Foto real (no la marca de "sin foto"). */
export const isRealPhoto = (p: string | null | undefined) => p != null && p !== NO_PHOTO;
