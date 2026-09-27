import { useEffect, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { addEntries, createPlayer, fetchEffectiveAverages } from '../../lib/data';
import { useLeagueCtx } from '../../lib/league';
import type { BowlingEvent, Entry, Player } from '../../lib/types';
import { useAction } from '../feedback';
import { Button, Input, Modal, cx } from '../ui';

/** Inscribe jugadores del club en el evento (o crea uno nuevo al vuelo). */
export function AddPlayersModal({
  open,
  onClose,
  event,
  entries,
  players,
}: {
  open: boolean;
  onClose: () => void;
  event: BowlingEvent;
  entries: Entry[];
  players: Player[];
}) {
  const { lid } = useLeagueCtx();
  const run = useAction();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setPicked(new Set());
      // El diálogo enfoca la X al abrirse: se pasa al buscador para escribir de una.
      setTimeout(() => search.current?.focus(), 50);
    }
  }, [open]);

  const available = players.filter((p) => !entries.some((e) => e.playerId === p.id));
  const filtered = available.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const exact = players.some((p) => p.name.toLowerCase() === q.trim().toLowerCase());

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function createAndPick() {
    const id = await run(() => createPlayer(lid, q, null), 'Jugador creado');
    if (id) {
      setPicked((s) => new Set(s).add(id));
      setQ('');
    }
  }

  async function save() {
    setBusy(true);
    const chosen = players.filter((p) => picked.has(p.id));
    await run(async () => {
      const averages = await fetchEffectiveAverages(lid, chosen);
      await addEntries(lid, event, chosen.map((p) => ({ id: p.id, average: averages.get(p.id) ?? 0 })));
    }, `${chosen.length} inscrito${chosen.length === 1 ? '' : 's'}`);
    setBusy(false);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={event.type === 'torneo' ? 'Inscribir jugadores' : 'Agregar asistentes'}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!picked.size} loading={busy} onClick={save}>
            Agregar {picked.size || ''}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input ref={search} placeholder="Buscar o escribir un nombre nuevo" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        {q.trim() && !exact && (
          <Button variant="secondary" icon={<Plus className="size-4" />} onClick={createAndPick} className="justify-start">
            Crear “{q.trim()}” y agregarlo
          </Button>
        )}
        <div className="flex max-h-80 flex-col overflow-y-auto rounded-xl border border-line">
          {filtered.map((p) => (
            <label
              key={p.id}
              className={cx('flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2.5 last:border-0', picked.has(p.id) && 'bg-accent-soft')}
            >
              <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
              <span className="flex-1">{p.name}</span>
            </label>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted">
              {players.length === 0
                ? 'Todavía no hay jugadores: escribe un nombre arriba para crearlo.'
                : available.length === 0
                  ? 'Todos los jugadores ya están en este evento.'
                  : 'Nadie coincide.'}
            </p>
          )}
        </div>
        {available.length > 0 && (
          <div className="flex justify-between text-xs text-muted">
            <span>{picked.size} seleccionados</span>
            <button type="button" className="text-accent" onClick={() => setPicked(new Set(filtered.map((p) => p.id)))}>
              Seleccionar todos
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
