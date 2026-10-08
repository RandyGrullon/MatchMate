import { useState } from 'react';
import { Rows3, Shuffle, Send, X } from 'lucide-react';
import { publishHeats, type SwimEventItem } from '../../../lib/data/swimming';
import { useAction, useFeedback } from '../../../components/feedback';
import { Badge, Button, Card, SectionHeader, cx, sectionLinkClass } from '../../../components/ui';
import { EmptyCard, STICKY_ABOVE_NAV } from '../FieldChrome';
import { ClubTag, TimeText, useSwim } from './bits';
import { draftHeats, eventHasResults, publishedHeats, raceTitle, sheetAssignments, swapLanes, type SheetHeat } from './logic';
import type { MeetData } from './MeetPage';

type LanePick = { ev: string; heat: number; lane: number };

/**
 * Hoja de series (rediseño «Calma y foco»): cada prueba con sus series en tarjetas y una fila por carril (el número, el
 * nadador con su club y la siembra). Tu carril, resaltado. El admin (en Pro, `manage`) la arma con el motor (los más
 * rápidos en la última serie y en los carriles del centro; los NT en las primeras; mínimo 3 en la primera), puede cambiar
 * carriles tocando dos, y la publica. Una prueba que ya tiene tiempos no se vuelve a armar.
 */
export function HeatSheetPanel({ data, manage = true }: { data: MeetData; manage?: boolean }) {
  const { isAdmin, myPlayerId } = useSwim();
  const run = useAction();
  const { confirm } = useFeedback();
  const { lid, meet, events, entries } = data;
  const [draft, setDraft] = useState<Map<string, SheetHeat[]> | null>(null);
  const [pick, setPick] = useState<LanePick | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = isAdmin && manage && !meet.finalizedAt;
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
    return <EmptyCard icon={<Rows3 className="size-5" />} title="Sin inscritos todavía" text="La hoja de series se arma con los inscritos de cada prueba." />;
  }
  if (!draft && !meet.heatsPublishedAt) {
    return (
      <EmptyCard
        icon={<Rows3 className="size-5" />}
        title="La hoja de series todavía no está"
        text={canEdit ? 'Se arma sola con los tiempos de siembra; después puedes mover carriles antes de publicarla.' : 'El organizador la publica antes del encuentro.'}
        action={
          canEdit && (
            <Button variant="primary" size="lg" icon={<Shuffle className="size-5" />} onClick={() => build()}>
              Armar series
            </Button>
          )
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-[26px]">
      {draft ? (
        <div className={cx(STICKY_ABOVE_NAV, 'order-last flex flex-col gap-2.5 rounded-[26px] bg-surface/95 p-3 shadow-[inset_0_0_0_1.5px_var(--accent)] backdrop-blur')}>
          <p className="flex items-center gap-2 px-1 text-sm">
            <Badge tone="accent">Borrador</Badge>
            <span className="min-w-0 text-muted">Toca un carril y después otro para cambiarlos.</span>
          </p>
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button variant="quiet" size="lg" icon={<X className="size-5" />} onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button variant="primary" size="lg" loading={busy} icon={<Send className="size-5" />} onClick={publish}>
              Publicar
            </Button>
          </div>
        </div>
      ) : (
        canEdit &&
        seedable.length > 0 && (
          <Button variant="quiet" size="lg" icon={<Shuffle className="size-5" />} onClick={() => build()}>
            Armar de nuevo
          </Button>
        )
      )}

      {withEntries.map((ev) => {
        const draftOf = draft?.get(ev.id);
        const pub = publishedHeats(ev, entries, meet.lanes);
        const heats = draftOf ?? pub.heats;
        if (draft && !draftOf) return null;
        return (
          <section key={ev.id} aria-label={raceTitle(ev)} className="flex flex-col gap-2.5">
            <SectionHeader
              className="mb-0.5"
              title={raceTitle(ev)}
              action={
                !draft &&
                canEdit &&
                !eventHasResults(ev.id, entries) &&
                (pub.unassigned.length > 0 || !pub.heats.length) && (
                  <button type="button" onClick={() => build(ev)} className={sectionLinkClass}>
                    <Shuffle aria-hidden="true" className="size-4" />
                    Armar
                  </button>
                )
              }
            />
            {!draft && pub.unassigned.length > 0 && (
              <p className="mx-1 text-[13px] text-warn">
                {pub.unassigned.length === 1 ? '1 inscrito sin serie' : `${pub.unassigned.length} inscritos sin serie`} (se inscribieron después).
              </p>
            )}
            {heats.map((h) => (
              <Card key={h.n} className="overflow-hidden">
                <p className="px-5 pt-3.5 pb-1.5 text-xs font-semibold tracking-[0.06em] text-muted uppercase">
                  Serie {h.n} de {heats.length}
                </p>
                <div>
                  {h.lanes.map((l) => {
                    const selected = pick?.ev === ev.id && pick.heat === h.n && pick.lane === l.lane;
                    const me = !!myPlayerId && l.entry?.playerId === myPlayerId;
                    const row = (
                      <>
                        <span
                          className={cx(
                            'num grid size-10 shrink-0 place-items-center rounded-xl text-[17px] font-[650]',
                            me || selected ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-2',
                          )}
                        >
                          {l.lane}
                        </span>
                        {l.entry ? (
                          <>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[15px] font-semibold">{data.name(l.entry.playerId)}</span>
                              <ClubTag club={l.entry.clubId ? data.clubs.get(l.entry.clubId) : null} short />
                            </span>
                            <TimeText cs={l.entry.seed} className="text-sm text-muted" />
                          </>
                        ) : (
                          <span className="flex-1 text-sm text-faint">Libre</span>
                        )}
                      </>
                    );
                    return draftOf ? (
                      <button
                        key={l.lane}
                        type="button"
                        onClick={() => tap(ev.id, h.n, l.lane)}
                        aria-pressed={selected}
                        className={cx('mm-row relative flex min-h-row-pro w-full items-center gap-3.5 py-2 pr-5 pl-4 text-left transition', selected ? 'bg-accent-soft' : 'active:bg-surface-2')}
                      >
                        {row}
                      </button>
                    ) : (
                      <div key={l.lane} className={cx('mm-row relative flex min-h-row-pro items-center gap-3.5 py-2 pr-5 pl-4', me && 'mm-row-me bg-accent-soft')}>
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
