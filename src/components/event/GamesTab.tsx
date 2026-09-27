import { useState } from 'react';
import { CalendarCheck, Camera, CheckCircle2, Grid3x3, Plus, ScanLine, UserPlus, Users, X } from 'lucide-react';
import { addEntries, addEventGame, fetchEffectiveAverages, removeEntry, saveGame, updateEntry } from '../../lib/data';
import { useLeagueCtx } from '../../lib/league';
import { entryLine, slots, type Line } from '../../lib/stats';
import { NO_PHOTO, type BowlingEvent, type Entry, type Player } from '../../lib/types';
import { useAction, useFeedback } from '../feedback';
import { PhotoModal } from '../PhotoModal';
import { ScanModal } from '../ScanModal';
import { ScoreInput } from '../ScoreInput';
import { ScoreEntryModal } from '../frames/ScoreEntryModal';
import { Badge, Button, Card, Empty, cx } from '../ui';
import { AddPlayersModal } from './AddPlayersModal';

interface Group {
  key: string;
  title: string | null;
  lines: Line[];
}

/**
 * Anotar pinos por juego (a mano, por cuadros o con la foto). Sin foto = borrador si la liga la exige.
 * El anotador del torneo solo anota: no agrega ni quita jugadores.
 */
export function GamesTab({ event, entries, players }: { event: BowlingEvent; entries: Entry[]; players: Player[] }) {
  const { lid, league, isAdmin } = useLeagueCtx();
  const requirePhoto = league.requirePhoto !== false;
  const run = useAction();
  const { confirm } = useFeedback();
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
      const avgs = await fetchEffectiveAverages(lid, chosen);
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

  function setScore(entry: Entry, game: number, value: number | null) {
    run(() => saveGame(lid, event, entry, game, { score: value, frames: null }, requirePhoto));
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
    setPhoto(null);
    await run(() => updateEntry(lid, photo.entry.id, { photos }));
  }

  async function remove(entry: Entry) {
    const ok = await confirm({ title: `¿Quitar a ${nameOf(entry)}?`, message: 'Se borran sus juegos de esta práctica.', confirmText: 'Quitar', danger: true });
    if (ok) await run(() => removeEntry(lid, entry));
  }

  const framesEntry = framesFor ? entries.find((e) => e.id === framesFor.entryId) : undefined;
  const framesGame = framesFor?.game ?? 0;
  const framesVerified = framesEntry ? isRealPhoto(slots(framesEntry.photos, event.games, null)[framesGame]) : false;

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
          <Button
            icon={<Plus className="size-4" />}
            onClick={() => run(() => addEventGame(lid, event), `Juego ${event.games + 1} agregado`)}
          >
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
          const perGame = Array.from({ length: event.games }, (_, i) =>
            g.lines.reduce((s, l) => (l.scores[i] != null ? s + l.scores[i]! + l.hcp : s), 0),
          );
          return (
            <Card key={g.key} className="overflow-hidden">
              {g.title && (
                <div className="flex items-center justify-between border-b border-line bg-surface-2/60 px-4 py-2">
                  <h3 className="text-sm font-semibold">{g.title}</h3>
                  <span className="text-xs text-muted tabular-nums">
                    Total <b className="text-fg">{perGame.reduce((a, b) => a + b, 0)}</b>
                  </span>
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
                  return (
                    <div key={l.entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:flex-nowrap">
                      <div className="flex w-full min-w-0 items-center gap-2 sm:w-44 sm:shrink-0">
                        <span className="truncate font-medium">{name}</span>
                        {isTorneo && <span className="text-xs text-muted tabular-nums">hcp {l.hcp}</span>}
                        {!isTorneo && isAdmin && (
                          <button type="button" onClick={() => remove(l.entry)} className="ml-auto rounded p-1 text-muted hover:text-danger sm:hidden" aria-label={`Quitar a ${name}`}>
                            <X className="size-4" />
                          </button>
                        )}
                      </div>
                      <div className="grid min-w-0 flex-1 gap-2" style={{ gridTemplateColumns: cols }}>
                        {l.scores.map((s, i) => (
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
                        ))}
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
                        <button type="button" onClick={() => remove(l.entry)} className="hidden rounded p-1 text-muted hover:text-danger sm:block" aria-label={`Quitar a ${name}`}>
                          <X className="size-4" />
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
          <Button variant="ghost" className="mr-auto text-danger" onClick={unverify}>
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
          initial={{ score: slots(framesEntry.scores, event.games, null)[framesGame], frames: framesEntry.frames?.[framesGame] ?? null }}
          top={
            event.games > 1 && (
              <div className="flex gap-1.5">
                {Array.from({ length: event.games }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setFramesFor({ entryId: framesEntry.id, game: i })}
                    className={cx(
                      'h-9 flex-1 rounded-lg text-sm font-semibold transition',
                      i === framesGame ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted hover:text-fg',
                    )}
                  >
                    J{i + 1}
                  </button>
                ))}
              </div>
            )
          }
          note={
            framesVerified && requirePhoto ? (
              <p className="rounded-xl bg-warn-soft px-3 py-2 text-xs text-warn">Este juego ya está verificado con foto: si lo cambias vuelve a borrador.</p>
            ) : null
          }
          onSave={async (v) => {
            const ok = await run(async () => {
              await saveGame(lid, event, framesEntry, framesGame, v, requirePhoto);
              return true;
            }, `Juego ${framesGame + 1} guardado`);
            if (ok) {
              // Sigue con el próximo juego sin anotar, o cierra.
              const next = slots(framesEntry.scores, event.games, null).findIndex((s, i) => i !== framesGame && s == null);
              setFramesFor(next >= 0 ? { entryId: framesEntry.id, game: next } : null);
            }
          }}
        />
      )}
    </div>
  );
}

/** Foto real (no la marca de "sin foto"). */
export const isRealPhoto = (p: string | null | undefined) => p != null && p !== NO_PHOTO;
