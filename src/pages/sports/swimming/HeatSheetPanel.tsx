import { useState } from 'react';
import { Rows3, Shuffle, Send, X } from 'lucide-react';
import { publishHeats, type SwimEventItem } from '../../../lib/data/swimming';
import { useAction, useFeedback } from '../../../components/feedback';
import { Badge, Button, Card, Empty, cx } from '../../../components/ui';
import { ClubTag, TimeText, useSwim } from './bits';
import { draftHeats, eventHasResults, publishedHeats, raceTitle, sheetAssignments, swapLanes, type SheetHeat } from './logic';
import type { MeetData } from './MeetPage';

type LanePick = { ev: string; heat: number; lane: number };

/**
 * Hoja de series. El admin la arma con el motor (los más rápidos en la última serie y en los carriles del
 * centro; los NT en las primeras; mínimo 3 en la primera), puede cambiar carriles tocando dos, y la publica.
 * Una prueba que ya tiene tiempos no se vuelve a armar.
 */
export function HeatSheetPanel({ data }: { data: MeetData }) {
  const { isAdmin } = useSwim();
  const run = useAction();
  const { confirm } = useFeedback();
  const { lid, meet, events, entries } = data;
  const [draft, setDraft] = useState<Map<string, SheetHeat[]> | null>(null);
  const [pick, setPick] = useState<LanePick | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = isAdmin && !meet.finalizedAt;
  const withEntries = events.filter((ev) => entries.some((e) => e.swimEventId === ev.id));
  const seedable = withEntries.filter((ev) => !eventHasResults(ev.id, entries));

  const build = (only?: SwimEventItem) => {
    const m = new Map<string, SheetHeat[]>();
    for (const ev of only ? [only] : seedable) m.set(ev.id, draftHeats(ev, entries, meet.lanes));
    setDraft(m);
    setPick(null);
  };
  const tap = (ev: string, heat: number, lane: number) => {
    if (!draft) return;
    if (!pick || pick.ev !== ev) return setPick({ ev, heat, lane });
    if (pick.heat === heat && pick.lane === lane) return setPick(null);
    const next = new Map(draft);
    next.set(ev, swapLanes(draft.get(ev)!, pick, { heat, lane }));
    setDraft(next);
    setPick(null);
  };
  const publish = async () => {
    if (!draft) return;
    if (
      meet.heatsPublishedAt &&
      !(await confirm({
        title: '¿Publicar de nuevo?',
        message: 'Las pruebas del borrador cambian de series y carriles. Avisa a los nadadores.',
        confirmText: 'Publicar',
      }))
    )
      return;
    setBusy(true);
    const n = await run(
      () => publishHeats(lid, meet.id, [...draft].map(([swimEventId, heats]) => ({ swimEventId, lanes: sheetAssignments(heats) }))),
      'Hoja de series publicada',
    );
    setBusy(false);
    if (n !== undefined) setDraft(null);
  };

  if (!withEntries.length) {
    return <Empty icon={<Rows3 className="size-8" />} title="Sin inscritos todavía">La hoja de series se arma con los inscritos de cada prueba.</Empty>;
  }
  if (!draft && !meet.heatsPublishedAt) {
    return (
      <Empty icon={<Rows3 className="size-8" />} title="La hoja de series todavía no está">
        {canEdit ? (
          <div className="mt-3 flex flex-col items-center gap-2">
            <p>Se arma sola con los tiempos de siembra; después puedes mover carriles antes de publicarla.</p>
            <Button variant="primary" icon={<Shuffle className="size-4" />} onClick={() => build()}>
              Armar series
            </Button>
          </div>
        ) : (
          'El organizador la publica antes del encuentro.'
        )}
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {draft ? (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-accent bg-surface p-3 shadow-sm">
          <Badge tone="accent">Borrador</Badge>
          <p className="min-w-0 flex-1 text-sm text-muted">Toca un carril y después otro para cambiarlos.</p>
          <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => setDraft(null)}>
            Cancelar
          </Button>
          <Button size="sm" variant="primary" loading={busy} icon={<Send className="size-4" />} onClick={publish}>
            Publicar
          </Button>
        </div>
      ) : (
        canEdit &&
        seedable.length > 0 && (
          <div className="flex justify-end">
            <Button icon={<Shuffle className="size-4" />} onClick={() => build()}>
              Armar de nuevo
            </Button>
          </div>
        )
      )}

      {withEntries.map((ev) => {
        const draftOf = draft?.get(ev.id);
        const pub = publishedHeats(ev, entries, meet.lanes);
        const heats = draftOf ?? pub.heats;
        if (draft && !draftOf) return null;
        return (
          <section key={ev.id} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h2 className="min-w-0 flex-1 text-sm font-semibold">{raceTitle(ev)}</h2>
              {!draft && canEdit && !eventHasResults(ev.id, entries) && (pub.unassigned.length > 0 || !pub.heats.length) && (
                <Button size="sm" icon={<Shuffle className="size-4" />} onClick={() => build(ev)}>
                  Armar
                </Button>
              )}
            </div>
            {!draft && pub.unassigned.length > 0 && (
              <p className="rounded-xl bg-warn-soft px-3 py-2 text-xs text-warn">
                {pub.unassigned.length === 1 ? '1 inscrito sin serie' : `${pub.unassigned.length} inscritos sin serie`} (se inscribieron después).
              </p>
            )}
            {heats.map((h) => (
              <Card key={h.n} className="overflow-hidden">
                <p className="border-b border-line bg-surface-2 px-4 py-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                  Serie {h.n} de {heats.length}
                </p>
                <div className="divide-y divide-line">
                  {h.lanes.map((l) => {
                    const selected = pick?.ev === ev.id && pick.heat === h.n && pick.lane === l.lane;
                    const row = (
                      <>
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-sm font-bold tabular-nums">{l.lane}</span>
                        {l.entry ? (
                          <>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{data.name(l.entry.playerId)}</span>
                              <ClubTag club={l.entry.clubId ? data.clubs.get(l.entry.clubId) : null} short />
                            </span>
                            <TimeText cs={l.entry.seed} className="text-sm text-muted" />
                          </>
                        ) : (
                          <span className="flex-1 text-sm text-muted">—</span>
                        )}
                      </>
                    );
                    return draftOf ? (
                      <button
                        key={l.lane}
                        type="button"
                        onClick={() => tap(ev.id, h.n, l.lane)}
                        aria-pressed={selected}
                        className={cx('flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left transition', selected ? 'bg-accent-soft' : 'hover:bg-surface-2')}
                      >
                        {row}
                      </button>
                    ) : (
                      <div key={l.lane} className={cx('flex min-h-12 items-center gap-3 px-4 py-2', !l.entry && 'opacity-60')}>
                        {row}
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </section>
        );
      })}
    </div>
  );
}
