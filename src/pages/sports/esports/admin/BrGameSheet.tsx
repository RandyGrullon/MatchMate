import { useRef, useState } from 'react';
import { Ban, Camera, Trash2, X } from 'lucide-react';
import { addMatchProof, deleteBrGame, esportsErrorText, saveBrGame, type BrGame, type EsportsEntry, type EsportsTournament } from '../../../../lib/data/esports';
import { useLeagueCtx } from '../../../../lib/league';
import { usePhoto } from '../../../../lib/photos';
import { useBusy } from '../../../../components/busy';
import { useFeedback } from '../../../../components/feedback';
import { Button, Card, Field, Input, Select, Sheet, Skeleton, cx } from '../../../../components/ui';
import { competitors, nextBrSlot, placementError } from '../logic';
import { ScoreStepper } from '../parts';

/**
 * «Anotar partida» de battle royale (§5.7, §12.8): la jornada y la partida, el mapa, y por cada inscrito el puesto (del 1
 * al número de inscritos, sin repetir: los tomados salen apagados; «—» = no jugó) y las kills con − y +; hasta 3 capturas.
 * «Guardar partida» → saveBrGame (reemplaza lo anterior de esa partida). Editando una: «Anular» o «Borrar».
 */
export function BrGameSheet({
  open,
  onClose,
  t,
  entries,
  games,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  t: EsportsTournament;
  entries: readonly EsportsEntry[];
  games: readonly BrGame[];
  editing?: BrGame | null;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={editing ? `Partida ${editing.gameNo} · Jornada ${editing.round}` : 'Anotar partida'} subtitle={t.name}>
      {open && <Body key={editing?.id ?? 'nueva'} t={t} entries={entries} games={games} editing={editing ?? null} onDone={onClose} />}
    </Sheet>
  );
}

function Body({ t, entries, games, editing, onDone }: { t: EsportsTournament; entries: readonly EsportsEntry[]; games: readonly BrGame[]; editing: BrGame | null; onDone: () => void }) {
  const { lid } = useLeagueCtx();
  const { toast, confirm } = useFeedback();
  const busy = useBusy<'guardar' | 'anular' | 'borrar' | 'foto'>();
  const file = useRef<HTMLInputElement>(null);
  const list = competitors(entries);
  const total = list.length;
  const slot = editing ? { round: editing.round, gameNo: editing.gameNo } : nextBrSlot(games, t.settings);
  const [round, setRound] = useState(slot.round);
  const [gameNo, setGameNo] = useState(slot.gameNo);
  const [map, setMap] = useState(editing?.map ?? '');
  const [proof, setProof] = useState<string[]>(() => [...(editing?.proof ?? [])]);
  const [rows, setRows] = useState<Record<string, { placement: number | null; kills: number }>>(() =>
    Object.fromEntries(
      list.map((e) => {
        const r = editing?.results.find((x) => x.entryId === e.id);
        return [e.id, { placement: r?.placement ?? null, kills: r?.kills ?? 0 }];
      }),
    ),
  );
  const [tried, setTried] = useState(false);
  const results = list.map((e) => ({ entryId: e.id, placement: rows[e.id]?.placement ?? null, kills: rows[e.id]?.kills ?? 0 }));
  const error = placementError(results, total);
  const taken = new Map(results.filter((r) => r.placement != null).map((r) => [r.placement!, r.entryId]));
  const clash = !editing && games.some((g) => g.round === round && g.gameNo === gameNo);
  const rounds = Math.max(t.settings.br?.rounds ?? 1, round);
  const perRound = Math.max(t.settings.br?.gamesPerRound ?? 4, gameNo);
  const set = (id: string, patch: Partial<{ placement: number | null; kills: number }>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  const save = (status?: 'void') =>
    busy.run(status ? 'anular' : 'guardar', async () => {
      setTried(true);
      if (!status && (error || clash)) return;
      try {
        await saveBrGame(t.eventId, { id: editing?.id, round, gameNo, map: map.trim(), proof, results, ...(status ? { status } : {}) });
        toast(status ? 'Partida anulada' : 'Partida guardada');
        onDone();
      } catch (e) {
        toast(esportsErrorText(e, t.game, 'torneo'), 'error');
      }
    });
  const remove = async () => {
    if (!editing) return;
    if (!(await confirm({ title: '¿Borrar esta partida?', message: 'Se borran sus puestos y kills. No se puede deshacer.', confirmText: 'Borrar', danger: true }))) return;
    await busy.run('borrar', async () => {
      try {
        await deleteBrGame(t.eventId, editing.id);
        toast('Partida borrada');
        onDone();
      } catch (e) {
        toast(esportsErrorText(e, t.game, 'torneo'), 'error');
      }
    });
  };
  const pickPhoto = (f: File | undefined) =>
    busy.run('foto', async () => {
      if (!f || proof.length >= 3) return;
      try {
        const id = await addMatchProof(lid, t.eventId, f);
        setProof((p) => [...p, id].slice(0, 3));
      } catch (e) {
        toast(esportsErrorText(e, t.game), 'error');
      } finally {
        if (file.current) file.current.value = '';
      }
    });

  if (!total) return <p className="pb-2 text-sm text-muted">Todavía no hay inscritos aprobados.</p>;
  return (
    <div className="flex flex-col gap-4 pb-1">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Jornada">
          <Select value={round} onChange={(e) => setRound(Number(e.target.value))} disabled={!!editing} className="h-11">
            {Array.from({ length: rounds }, (_, i) => (
              <option key={i} value={i + 1}>{`Jornada ${i + 1}`}</option>
            ))}
          </Select>
        </Field>
        <Field label="Partida">
          <Select value={gameNo} onChange={(e) => setGameNo(Number(e.target.value))} disabled={!!editing} className="h-11">
            {Array.from({ length: perRound }, (_, i) => (
              <option key={i} value={i + 1}>{`Partida ${i + 1}`}</option>
            ))}
          </Select>
        </Field>
      </div>
      {clash && <p className="-mt-2 text-[13.5px] font-medium text-danger">Esa partida ya está anotada: ábrela en «Partidas» para editarla.</p>}
      <Field label="Mapa (opcional)">
        <Input value={map} maxLength={24} onChange={(e) => setMap(e.target.value)} placeholder="Bermuda, Erangel…" className="h-11" />
      </Field>

      <div className="flex flex-col gap-2">
        <p className="mx-1 text-sm font-[650] text-fg-2">Puesto y kills</p>
        <Card className="overflow-hidden">
          {list.map((e) => {
            const r = rows[e.id];
            return (
              <div key={e.id} className="mm-row flex flex-col gap-2 px-4 py-3">
                <p className="truncate text-[15px] font-semibold">{e.name}</p>
                <div className="flex items-center justify-between gap-2">
                  <Select
                    aria-label={`Puesto de ${e.name}`}
                    value={r.placement ?? ''}
                    onChange={(ev) => set(e.id, { placement: ev.target.value ? Number(ev.target.value) : null })}
                    className="h-11 w-28 max-w-28 shrink-0"
                  >
                    <option value="">— No jugó</option>
                    {Array.from({ length: total }, (_, i) => {
                      const p = i + 1;
                      const owner = taken.get(p);
                      return (
                        <option key={p} value={p} disabled={!!owner && owner !== e.id}>
                          {`${p}.º`}
                        </option>
                      );
                    })}
                  </Select>
                  <ScoreStepper value={r.kills} min={0} max={200} label={`Kills de ${e.name}`} onChange={(n) => set(e.id, { kills: n ?? 0 })} />
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      <div className="flex flex-col gap-2">
        <p className="mx-1 text-sm font-[650] text-fg-2">Capturas (opcional, hasta 3)</p>
        <div className="flex flex-wrap gap-2.5">
          {proof.map((id) => (
            <Thumb key={id} id={id} onRemove={() => setProof((p) => p.filter((x) => x !== id))} />
          ))}
          {proof.length < 3 && (
            <button
              type="button"
              onClick={() => file.current?.click()}
              disabled={busy.isBusy('foto')}
              aria-label="Agregar una captura"
              className="grid size-20 place-items-center rounded-2xl border-2 border-dashed border-line text-accent transition active:scale-95 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-accent"
            >
              {busy.isBusy('foto') ? <Skeleton className="size-8 rounded-full" /> : <Camera aria-hidden="true" className="size-7" />}
            </button>
          )}
          <input ref={file} type="file" accept="image/*" hidden onChange={(ev) => void pickPhoto(ev.target.files?.[0])} />
        </div>
      </div>

      {tried && error && (
        <p role="alert" className="mx-1 text-[13.5px] font-medium text-danger">
          {error}
        </p>
      )}
      <Button variant="primary" size="lg" className="w-full" loading={busy.isBusy('guardar')} disabled={busy.isBusy('foto')} onClick={() => void save()}>
        Guardar partida
      </Button>
      {editing && (
        <div className="grid grid-cols-2 gap-2.5">
          <Button variant="quiet" size="lg" icon={<Ban className="size-4" />} loading={busy.isBusy('anular')} disabled={editing.status === 'void'} onClick={() => void save('void')}>
            Anular
          </Button>
          <Button variant="quiet" size="lg" className="text-danger" icon={<Trash2 className="size-4" />} loading={busy.isBusy('borrar')} onClick={() => void remove()}>
            Borrar
          </Button>
        </div>
      )}
    </div>
  );
}

function Thumb({ id, onRemove }: { id: string; onRemove: () => void }) {
  const { lid } = useLeagueCtx();
  const photo = usePhoto(lid, id);
  return (
    <div className={cx('relative size-20 shrink-0 overflow-hidden rounded-2xl bg-surface-2')}>
      {photo.data ? <img src={photo.data.url} alt="Captura" className="size-full object-cover" /> : <Skeleton className="size-full" />}
      <button type="button" onClick={onRemove} aria-label="Quitar la captura" className="absolute top-0 right-0 grid size-11 place-items-start justify-end p-1.5 text-white">
        <span className="grid size-6 place-items-center rounded-full bg-black/60">
          <X aria-hidden="true" className="size-4" />
        </span>
      </button>
    </div>
  );
}
