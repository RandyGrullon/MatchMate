import { useState } from 'react';
import { ArrowDown, ArrowUp, BarChart3, Shuffle } from 'lucide-react';
import { esportsErrorText, setSeeds, type EsportsEntry, type EsportsTournament } from '../../../../lib/data/esports';
import { entryStrength, modeSize, seedEntries } from '../../../../sports/esports';
import { useBusy } from '../../../../components/busy';
import { useFeedback } from '../../../../components/feedback';
import { Button, Card, Sheet } from '../../../../components/ui';
import { competitors, seedEntryList, seedsFor } from '../logic';

/**
 * La siembra (§5.5): los aprobados en orden con flechas para subir o bajar, o de una vez «Al azar» (con la semilla del
 * evento) o «Por rango» (el promedio de los titulares con rango; sin rango al final). «Guardar la siembra» → setSeeds.
 */
export function SeedSheet({ open, onClose, t, entries }: { open: boolean; onClose: () => void; t: EsportsTournament; entries: readonly EsportsEntry[] }) {
  return (
    <Sheet open={open} onClose={onClose} title="Siembra" subtitle="El 1 es el mejor sembrado">
      {open && <SeedBody t={t} entries={entries} onDone={onClose} />}
    </Sheet>
  );
}

function SeedBody({ t, entries, onDone }: { t: EsportsTournament; entries: readonly EsportsEntry[]; onDone: () => void }) {
  const { toast } = useFeedback();
  const busy = useBusy<'guardar'>();
  const list = competitors(entries);
  const byId = new Map(list.map((e) => [e.id, e]));
  const [order, setOrder] = useState<string[]>(() => seedsFor(entries, t));
  const [shuffles, setShuffles] = useState(0);
  const size = modeSize(t.mode);
  const strength = (id: string) => {
    const e = byId.get(id);
    return e ? entryStrength(seedEntryList([e], t.game, t.mode)[0].ordinals, size) : null;
  };
  const move = (i: number, d: -1 | 1) =>
    setOrder((o) => {
      const j = i + d;
      if (j < 0 || j >= o.length) return o;
      const next = [...o];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const random = () => {
    const n = shuffles + 1;
    setShuffles(n);
    setOrder(seedEntries(seedEntryList(list, t.game, t.mode), 'random', { seed: n === 1 ? t.eventId : `${t.eventId}:${n}`, teamSize: size }));
  };
  const byRank = () => setOrder(seedEntries(seedEntryList(list, t.game, t.mode), 'rank', { seed: t.eventId, teamSize: size }));
  const save = () =>
    busy.run('guardar', async () => {
      try {
        await setSeeds(t.eventId, order);
        toast('Siembra guardada');
        onDone();
      } catch (e) {
        toast(esportsErrorText(e, t.game, 'cuadro'), 'error');
      }
    });
  if (!list.length) return <p className="pb-2 text-sm text-muted">Todavía no hay aprobados para sembrar.</p>;
  return (
    <div className="flex flex-col gap-4 pb-1">
      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="quiet" size="lg" icon={<Shuffle className="size-5" />} onClick={random}>
          Al azar
        </Button>
        <Button variant="quiet" size="lg" icon={<BarChart3 className="size-5" />} onClick={byRank}>
          Por rango
        </Button>
      </div>
      <Card className="overflow-hidden">
        <ol>
          {order.map((id, i) => {
            const e = byId.get(id);
            const s = strength(id);
            return (
              <li key={id} className="mm-row flex min-h-14 items-center gap-2 pr-2 pl-4">
                <span className="w-6 shrink-0 text-center text-[15px] font-bold text-muted tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{e?.name ?? '—'}</span>
                  <span className="block text-[12.5px] text-muted">{s == null ? 'Sin rango' : `Fuerza ${Math.round(s)}`}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Subir a ${e?.name ?? ''}`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  className="grid size-11 shrink-0 place-items-center rounded-full text-fg-2 transition active:bg-surface-2 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <ArrowUp aria-hidden="true" className="size-5" />
                </button>
                <button
                  type="button"
                  aria-label={`Bajar a ${e?.name ?? ''}`}
                  disabled={i === order.length - 1}
                  onClick={() => move(i, 1)}
                  className="grid size-11 shrink-0 place-items-center rounded-full text-fg-2 transition active:bg-surface-2 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <ArrowDown aria-hidden="true" className="size-5" />
                </button>
              </li>
            );
          })}
        </ol>
      </Card>
      <Button variant="primary" size="lg" className="w-full" loading={busy.isBusy('guardar')} onClick={() => void save()}>
        Guardar la siembra
      </Button>
    </div>
  );
}
