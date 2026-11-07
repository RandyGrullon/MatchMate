import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, Gift, Lock, Pencil, Trophy } from 'lucide-react';
import { Insignia, badgeLabel } from '../../badges/visual';
import { usePlayers } from '../../lib/data';
import { useLeagueBadges, type LeagueBadge } from '../../lib/data/leagueBadges';
import { canDeliverPrizes, canPickPrizes, closeTournamentPrizes, prizeErrorText, type PrizeWinner, type TournamentPrize } from '../../lib/data/prizes';
import { useLeagueCtx } from '../../lib/league';
import { useNow } from '../../lib/useNow';
import { cardModel, correctionWindow, type CardModel, type CardRow, type CorrectionWindow } from '../../prizes/card';
import { PLACE_LABEL } from '../../prizes/catalog';
import { useFeedback, saveErrorMessage } from '../feedback';
import { Button, Card, SectionHeader, cx } from '../ui';
import { DesignSheet } from '../badges/maker/DesignSheet';
import { designLook } from '../badges/maker/look';
import { AwardPrizesSheet } from './AwardPrizesSheet';
import { PrizePicker } from './PrizePicker';
import type { TournamentPrizesProps } from './TournamentPrizes';
import { adminBarView, cardHidden, CLOSE_PRIZES_CONFIRM, currentLine, nameJoiner, PODIUM_CHANGED_TEXT, soloWinner, winnerPlayerName, winnerShortLine } from './view';

/**
 * «Premios del torneo» (docs/premios-torneo.md §6.1): lo ven todos. Sin premios, quien diseña insignias ve «Elegir
 * premios»; elegidos, «El campeón se lleva…» con la insignia de cada lugar por categoría (y quién va ganando); ya
 * entregados, «Campeones» con quién ganó. Los admins además entregan, corrigen y cierran.
 */
export default function PrizesCard({ comp, prize, ready, waitText, podium, warnings }: TournamentPrizesProps & { prize: TournamentPrize | null }) {
  const ctx = useLeagueCtx();
  const { confirm, toast } = useFeedback();
  const made = useLeagueBadges(ctx.lid);
  const players = usePlayers(ctx.lid);
  const now = useNow().getTime();
  const [picking, setPicking] = useState(false);
  const [awarding, setAwarding] = useState(false);
  const [open, setOpen] = useState<LeagueBadge | null>(null);
  const [closing, setClosing] = useState(false);
  const canPick = canPickPrizes(ctx);
  const canDeliver = canDeliverPrizes(ctx);
  const designs = made.data.designs;
  const model = useMemo(() => cardModel(comp, prize, designs, { podium, admin: canPick || canDeliver }), [comp, prize, designs, podium, canPick, canDeliver]);
  const names = useMemo(() => new Map(players.data.map((p) => [p.id, p.name] as const)), [players.data]);
  // Mientras llegan los diseños no se dibuja nada (la tarjeta saldría sin insignias y luego con ellas).
  if (made.loading) return null;
  if (cardHidden(model, canPick)) return null;

  async function close() {
    if (!prize) return;
    const ok = await confirm({ ...CLOSE_PRIZES_CONFIRM });
    if (!ok) return;
    setClosing(true);
    try {
      await closeTournamentPrizes(prize);
      toast('Premios cerrados');
    } catch (e) {
      console.error(e);
      toast(prizeErrorText(e, saveErrorMessage), 'error');
    } finally {
      setClosing(false);
    }
  }

  return (
    <>
      <PrizesCardView
        model={model}
        sport={comp.sport}
        period={prize?.period ?? ''}
        base={ctx.base}
        tz={ctx.league.tz}
        nameOf={(id) => names.get(id) ?? 'Jugador'}
        canPick={canPick}
        canDeliver={canDeliver}
        isOwner={ctx.isOwner}
        ready={ready}
        waitText={waitText}
        now={now}
        closing={closing}
        onPick={() => setPicking(true)}
        onAward={() => setAwarding(true)}
        onClosePrizes={close}
        onOpenBadge={setOpen}
      />
      {canPick && <PrizePicker open={picking} onClose={() => setPicking(false)} comp={comp} prize={prize} designs={designs} />}
      {canDeliver && prize && (
        <AwardPrizesSheet open={awarding} onClose={() => setAwarding(false)} comp={comp} prize={prize} designs={designs} podium={podium} warnings={warnings} />
      )}
      <DesignSheet badge={open} onClose={() => setOpen(null)} />
    </>
  );
}

export interface PrizesCardViewProps {
  model: CardModel;
  sport: string;
  /** La cinta de la premiación. */
  period: string;
  base: string;
  tz?: string;
  nameOf: (playerId: string) => string;
  canPick: boolean;
  canDeliver: boolean;
  isOwner: boolean;
  ready: boolean;
  waitText?: string;
  now: number;
  closing?: boolean;
  onPick: () => void;
  onAward: () => void;
  onClosePrizes: () => void;
  onOpenBadge: (b: LeagueBadge) => void;
}

/** La tarjeta sin datos ni efectos (las pruebas la dibujan con renderToString). */
export function PrizesCardView(p: PrizesCardViewProps) {
  const { model } = p;
  const admin = p.canPick || p.canDeliver;
  const closed = model.state === 'cerrados';
  // Lugar por lugar, como la base: un lugar sin entregar se entrega aunque otro ya pasó sus 14 días.
  const correction = correctionWindow(model, p.now);
  return (
    <section aria-labelledby="premios-torneo">
      <SectionHeader
        id="premios-torneo"
        title="Premios del torneo"
        action={
          closed && admin ? (
            <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-muted">
              <Lock className="size-3.5" aria-hidden="true" /> Premios cerrados
            </span>
          ) : undefined
        }
      />
      <Card className="flex flex-col gap-4 p-5">
        {model.state === 'sin_premios' ? (
          <div className="flex flex-col gap-3">
            <p className="flex items-center gap-2.5 text-meta text-fg-2">
              <Trophy className="size-5 shrink-0 text-accent" aria-hidden="true" /> Elige qué insignia se lleva el campeón.
            </p>
            <Button variant="soft" size="lg" className="w-full" icon={<Gift className="size-5" />} onClick={p.onPick}>
              Elegir premios
            </Button>
          </div>
        ) : (
          <>
            <p className="text-body font-semibold">{model.heading}</p>
            {model.sections.map((sec) => (
              <div key={sec.key} className="flex flex-col gap-2.5">
                <h3 className="text-[13px] font-semibold text-muted">{sec.title}</h3>
                <ul className="flex flex-col gap-2.5">
                  {sec.rows.map((r) => (
                    <PrizeRow key={r.slot.id} row={r} sport={p.sport} period={p.period} base={p.base} nameOf={p.nameOf} onOpenBadge={p.onOpenBadge} />
                  ))}
                </ul>
              </div>
            ))}
            {admin && (
              <AdminBar
                model={model}
                correction={correction}
                tz={p.tz}
                canPick={p.canPick}
                canDeliver={p.canDeliver}
                isOwner={p.isOwner}
                ready={p.ready}
                waitText={p.waitText}
                closing={p.closing}
                onPick={p.onPick}
                onAward={p.onAward}
                onClosePrizes={p.onClosePrizes}
              />
            )}
          </>
        )}
      </Card>
    </section>
  );
}

function PrizeRow({ row, sport, period, base, nameOf, onOpenBadge }: { row: CardRow; sport: string; period: string; base: string; nameOf: (id: string) => string; onOpenBadge: (b: LeagueBadge) => void }) {
  const { slot, design } = row;
  const look = design ? designLook(design, sport, period) : null;
  const big = slot.place === 1;
  const current = currentLine(row);
  return (
    <li className="flex items-center gap-3">
      {design && look ? (
        <button
          type="button"
          onClick={() => onOpenBadge(design)}
          aria-label={`${PLACE_LABEL[slot.place]}: ${badgeLabel(design.name, look)}`}
          className="shrink-0 rounded-xl transition active:scale-[0.97]"
        >
          <Insignia badge={look} size={big ? 64 : 40} />
        </button>
      ) : (
        <span className={cx('shrink-0 rounded-full bg-surface-2', big ? 'size-16' : 'size-10')} aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <p className={cx('font-semibold', big ? 'text-base' : 'text-sm')}>
          {PLACE_LABEL[slot.place]}
          <span className="font-normal text-muted"> · {design?.name ?? 'Insignia no disponible'}</span>
        </p>
        {row.delivered ? (
          row.winners.length ? (
            <div className="flex flex-col gap-0.5">
              {row.winners.map((w) => (
                <Winner key={w.ref} winner={w} base={base} nameOf={nameOf} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">Nadie en este lugar.</p>
          )
        ) : current ? (
          <p className={cx('text-xs text-muted', current.truncate && 'truncate')}>{current.text}</p>
        ) : null}
      </div>
    </li>
  );
}

/** «Los Strikers · Ana, Luis y Pedro» (tocar un jugador abre su página). */
function Winner({ winner, base, nameOf }: { winner: PrizeWinner; base: string; nameOf: (id: string) => string }) {
  const solo = soloWinner(winner);
  const links: ReactNode[] = winner.players.map((id, i) => (
    <span key={id}>
      {nameJoiner(i, winner.players.length)}
      <Link to={`${base}/j/${id}`} className="hover:text-accent hover:underline">
        {winnerPlayerName(winner, id, nameOf)}
      </Link>
    </span>
  ));
  return (
    <p className="text-sm">
      {!solo && winner.name && <b className="font-semibold">{winner.name} · </b>}
      {winnerShortLine(winner, nameOf) ?? links}
    </p>
  );
}

function AdminBar(p: {
  model: CardModel;
  correction: CorrectionWindow;
  tz?: string;
  canPick: boolean;
  canDeliver: boolean;
  isOwner: boolean;
  ready: boolean;
  waitText?: string;
  closing?: boolean;
  onPick: () => void;
  onAward: () => void;
  onClosePrizes: () => void;
}) {
  const v = adminBarView(p);
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      {v.podiumWarning && (
        <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-warn">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" /> {PODIUM_CHANGED_TEXT}
        </p>
      )}
      {v.notes.map((n) => (
        <p key={n} className="text-xs text-muted">
          {n}
        </p>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        {/* Un solo botón principal (Entregar, o Revisar si falta alguno); lo demás en gris. */}
        {v.award && (
          <Button variant={v.award.quiet ? 'quiet' : 'primary'} size="lg" className="w-full" icon={<Gift className="size-4" />} disabled={v.award.disabled} onClick={p.onAward}>
            {v.award.label}
          </Button>
        )}
        {v.change && (
          <Button variant="quiet" className="h-11 min-w-0 flex-1" icon={<Pencil className="size-4" />} onClick={p.onPick}>
            Cambiar premios
          </Button>
        )}
        {v.close && (
          <Button variant="quiet" className="h-11 min-w-0 flex-1" icon={<Lock className="size-4" />} loading={p.closing} onClick={p.onClosePrizes}>
            Cerrar premios
          </Button>
        )}
      </div>
      {v.wait && <p className="text-xs text-muted">{v.wait}</p>}
    </div>
  );
}
