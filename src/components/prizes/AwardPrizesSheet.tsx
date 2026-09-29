import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowRight, Info, RotateCw } from 'lucide-react';
import { Insignia, badgeLabel } from '../../badges/visual';
import { usePlayers } from '../../lib/data';
import type { LeagueBadge } from '../../lib/data/leagueBadges';
import {
  anyDelivered,
  deliverTournamentPrizes,
  fetchTournamentPodium,
  podiumLoadErrorText,
  prizeCode,
  prizeErrorText,
  type TournamentPodium,
  type TournamentPrize,
} from '../../lib/data/prizes';
import { useLeagueCtx } from '../../lib/league';
import {
  changeOf,
  deliveredText,
  hasChanges,
  initialPicks,
  namesLine,
  payloadOf,
  planDelivery,
  planNotes,
  prizesGiven,
  toggleSlot,
  togglePlayer,
  type Picks,
  type SlotPlan,
} from '../../prizes/award';
import { PLACE_LABEL, type PrizeComp } from '../../prizes/catalog';
import type { PodiumProvider } from '../../prizes/providers';
import { saveErrorMessage, useFeedback } from '../feedback';
import { Button, ListSkeleton, Sheet, cx } from '../ui';
import { designLook } from '../badges/maker/look';
import { Toggle } from '../badges/maker/parts';

const FORM_ID = 'premios-entregar';

export interface AwardPrizesSheetProps {
  open: boolean;
  onClose: () => void;
  comp: PrizeComp;
  prize: TournamentPrize;
  /** Los diseños de la liga (para dibujar la insignia de cada lugar). */
  designs: readonly LeagueBadge[];
  /** El podio del teléfono: lo que se entrega en los lugares que el servidor no calcula (golf, natación, noches). */
  podium?: PodiumProvider | null;
  /** Avisos arriba (boliche: «Hay 3 juegos por verificar: pueden cambiar el podio.»). */
  warnings?: readonly string[];
}

/**
 * «Entregar premios» (docs/premios-torneo.md §6.3): carga el podio (el del servidor; en golf, natación y noches, el
 * del teléfono), muestra cada lugar con sus jugadores marcados, la diferencia con lo que ya se entregó y los avisos, y
 * manda el estado deseado a deliver_tournament_prizes. Entregar otra vez no duplica nada. Necesita conexión.
 */
export function AwardPrizesSheet(props: AwardPrizesSheetProps) {
  const [footer, setFooter] = useState<{ label: string; disabled: boolean; busy: boolean }>({ label: 'Entregar', disabled: true, busy: false });
  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title={anyDelivered(props.prize) ? 'Revisar premios' : 'Entregar premios'}
      subtitle={props.comp.name}
      footer={
        <div className="flex justify-end gap-2">
          <Button className="min-h-11" onClick={props.onClose}>
            Cancelar
          </Button>
          <Button className="min-h-11" variant="primary" type="submit" form={FORM_ID} loading={footer.busy} disabled={footer.disabled}>
            {footer.label}
          </Button>
        </div>
      }
    >
      {props.open && <AwardFlow key={props.prize.id} {...props} onFooter={setFooter} />}
    </Sheet>
  );
}

function AwardFlow({ comp, prize, designs, podium: phone, warnings, onClose, onFooter }: AwardPrizesSheetProps & { onFooter: (f: { label: string; disabled: boolean; busy: boolean }) => void }) {
  const { lid, league, isOwner, myPlayerId } = useLeagueCtx();
  const { toast } = useFeedback();
  const players = usePlayers(lid);
  const [server, setServer] = useState<TournamentPodium | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Picks>({});
  const [notify, setNotify] = useState(!league.hasMinors);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());

  const plans = useMemo(
    () => (server ? planDelivery(prize, server, { comp, phone, myPlayers: myPlayerId ? [myPlayerId] : [], owner: isOwner, now }) : []),
    [server, prize, comp, phone, myPlayerId, isOwner, now],
  );

  const load = useCallback(async () => {
    setLoadError(null);
    setServer(null);
    try {
      setServer(await fetchTournamentPodium(prize.id));
    } catch (e) {
      console.error(e);
      // Es una lectura: «No se pudo cargar el podio», nunca «No se pudo guardar».
      setLoadError(podiumLoadErrorText(e));
    }
  }, [prize.id]);

  useEffect(() => {
    void load();
  }, [load]);
  // Con cada podio que llega (al abrir o al recargar), lo marcado vuelve a lo de siempre.
  useEffect(() => {
    if (server) setPicks(initialPicks(plans));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando llega un podio
  }, [server]);

  const payload = useMemo(() => payloadOf(plans, picks), [plans, picks]);
  const changes = hasChanges(plans, payload);
  const correcting = plans.some((p) => p.holders.length > 0);
  useEffect(() => {
    onFooter({ label: correcting ? 'Corregir' : 'Entregar', disabled: !server || !changes, busy });
  }, [onFooter, correcting, server, changes, busy]);

  const names = useMemo(() => {
    const m = new Map(players.data.map((p) => [p.id, p.name] as const));
    for (const p of plans) for (const u of p.units) for (const x of u.players) if (!m.has(x.id)) m.set(x.id, x.name);
    return m;
  }, [players.data, plans]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !changes) return;
    setBusy(true);
    setError(null);
    try {
      const res = await deliverTournamentPrizes(prize, payload, notify && !league.hasMinors);
      toast(deliveredText(res, prizesGiven(plans, payload)));
      onClose();
    } catch (err) {
      console.error(err);
      // El podio cambió mientras mirabas: se vuelve a cargar solo y se muestra otra vez (el aviso no pide recargar).
      if (prizeCode(err) === 'podio_cambio') {
        setError('El podio cambió: revísalo y vuelve a entregar.');
        void load();
      } else {
        setError(prizeErrorText(err, saveErrorMessage));
      }
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-start gap-3 py-2">
        <p role="alert" className="text-sm text-danger">
          {loadError}
        </p>
        <Button className="min-h-11" icon={<RotateCw className="size-4" />} onClick={() => void load()}>
          Reintentar
        </Button>
      </div>
    );
  }
  if (!server) return <ListSkeleton rows={3} />;

  return (
    <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <AwardBody
        plans={plans}
        picks={picks}
        designs={designs}
        sport={comp.sport}
        period={prize.period}
        nameOf={(id) => names.get(id) ?? 'Jugador'}
        warnings={warnings ?? []}
        notify={notify}
        canNotify={!league.hasMinors}
        error={error}
        onToggleSlot={(plan, on) => setPicks((pk) => toggleSlot(pk, plan, on))}
        onTogglePlayer={(slotId, ref, id) => setPicks((pk) => togglePlayer(pk, slotId, ref, id))}
        onNotify={setNotify}
      />
    </form>
  );
}

export interface AwardBodyProps {
  plans: readonly SlotPlan[];
  picks: Picks;
  designs: readonly LeagueBadge[];
  sport: string;
  period: string;
  nameOf: (playerId: string) => string;
  warnings: readonly string[];
  notify: boolean;
  /** En una liga con menores no hay avisos. */
  canNotify: boolean;
  error?: string | null;
  onToggleSlot: (plan: SlotPlan, on: boolean) => void;
  onTogglePlayer: (slotId: string, ref: string, playerId: string) => void;
  onNotify: (on: boolean) => void;
}

/** El contenido de «Entregar premios» sin datos ni efectos (las pruebas lo dibujan con renderToString). */
export function AwardBody(p: AwardBodyProps) {
  const byId = new Map(p.designs.map((d) => [d.id, d] as const));
  const payload = payloadOf(p.plans, p.picks);
  return (
    <>
      {p.warnings.map((w) => (
        <p key={w} role="status" className="flex items-start gap-2 rounded-xl bg-warn-soft/60 px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" /> {w}
        </p>
      ))}
      {p.plans.map((plan) => {
        const design = byId.get(plan.slot.badgeId) ?? null;
        const pick = p.picks[plan.slot.id];
        const change = changeOf(plan, payload);
        const notes = planNotes(plan, p.plans);
        const id = `entregar-${plan.slot.id}`;
        return (
          <section key={plan.slot.id} aria-labelledby={`${id}-t`} className={cx('flex flex-col gap-2.5 rounded-xl border border-line p-3', !plan.deliverable && 'bg-surface-2/40')}>
            <div className="flex items-center gap-3">
              {design ? <Insignia badge={designLook(design, p.sport, p.period)} size={40} label={badgeLabel(design.name, designLook(design, p.sport, p.period))} /> : <span className="size-10 shrink-0 rounded-full bg-surface-2" aria-hidden="true" />}
              <div className="min-w-0 flex-1">
                <h3 id={`${id}-t`} className="text-sm font-semibold">
                  {PLACE_LABEL[plan.slot.place]} · {plan.title}
                </h3>
                <p className="truncate text-xs text-muted">{design?.name ?? 'Insignia no disponible'}</p>
              </div>
            </div>
            {notes.map((n) => (
              <p key={n.text} className={cx('flex items-start gap-1.5 text-xs', n.tone === 'warn' ? 'font-medium text-warn' : 'text-muted')}>
                {n.tone === 'warn' ? <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" /> : <Info className="size-3.5 shrink-0" aria-hidden="true" />}
                {n.text}
              </p>
            ))}
            {plan.deliverable && (
              <Toggle
                id={`${id}-on`}
                on={!!pick?.on}
                onChange={(on) => p.onToggleSlot(plan, on)}
                label="Entregar este lugar"
                hint={!pick?.on && plan.holders.length ? `Se le quita a ${namesLine(plan.holders.map(p.nameOf))}.` : undefined}
              />
            )}
            {plan.units.length > 0 && (plan.status === 'listo' || plan.status === 'empate_multiple') && (
              <ul className="flex flex-col gap-2">
                {plan.units.map((u) => {
                  const picked = pick?.players[u.ref] ?? [];
                  const many = u.players.length > 1;
                  return (
                    <li key={u.ref} className="flex flex-col gap-1">
                      <p className="text-sm font-medium">
                        {u.name || namesLine(u.players.map((x) => x.name))}
                        {u.detail && <span className="font-normal text-muted"> · {u.detail}</span>}
                      </p>
                      {many && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {u.players.map((x) => {
                            const on = picked.includes(x.id);
                            const last = on && picked.length === 1;
                            return (
                              <label key={x.id} className={cx('flex min-h-11 cursor-pointer items-center gap-2 text-sm', (!plan.deliverable || !pick?.on) && 'cursor-default opacity-60')}>
                                <input
                                  type="checkbox"
                                  className="size-4 accent-[var(--accent)]"
                                  checked={on}
                                  disabled={!plan.deliverable || !pick?.on || last}
                                  onChange={() => p.onTogglePlayer(plan.slot.id, u.ref, x.id)}
                                />
                                {x.name}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {(change.add.length > 0 || change.remove.length > 0) && change.before.length > 0 && (
              <p className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted">Antes:</span> {namesLine(change.before.map(p.nameOf))}
                <ArrowRight className="size-3.5 text-muted" aria-label="ahora" />
                <span className="text-muted">Ahora:</span> {change.after.length ? namesLine(change.after.map(p.nameOf)) : 'nadie'}
              </p>
            )}
          </section>
        );
      })}
      {p.canNotify && (
        <Toggle id="entregar-avisar" on={p.notify} onChange={p.onNotify} label="Avisar a los ganadores" hint="Les llega una notificación con su insignia." />
      )}
      {p.error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {p.error}
        </p>
      )}
    </>
  );
}
