import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, Gift, Lock, Pencil, Trophy } from 'lucide-react';
import { Insignia, badgeLabel } from '../../badges/visual';
import { usePlayers } from '../../lib/data';
import { useLeagueBadges, type LeagueBadge } from '../../lib/data/leagueBadges';
import { canDeliverPrizes, canPickPrizes, closeTournamentPrizes, prizeErrorText, type PrizeWinner, type TournamentPrize } from '../../lib/data/prizes';
import { useLeagueCtx } from '../../lib/league';
import { useNow } from '../../lib/useNow';
import { namesLine } from '../../prizes/award';
import { cardModel, correctionWindow, type CardModel, type CardRow, type CorrectionWindow } from '../../prizes/card';
import { PLACE_LABEL } from '../../prizes/catalog';
import { useFeedback, saveErrorMessage } from '../feedback';
import { Badge, Button, Card, cx } from '../ui';
import { dayText } from '../badges/maker/design';
import { DesignSheet } from '../badges/maker/DesignSheet';
import { designLook } from '../badges/maker/look';
import { AwardPrizesSheet } from './AwardPrizesSheet';
import { PrizePicker } from './PrizePicker';
import type { TournamentPrizesProps } from './TournamentPrizes';

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
  if (model.state === 'sin_premios' && !canPick) return null;
  if (model.state !== 'sin_premios' && !model.sections.length) return null;

  async function close() {
    if (!prize) return;
    const ok = await confirm({
      title: '¿Cerrar los premios?',
      message: 'Desde ahora solo el dueño puede corregirlos. No se puede deshacer.',
      confirmText: 'Cerrar premios',
    });
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
    <section aria-labelledby="premios-torneo" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="premios-torneo" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <Trophy className="size-5 text-accent" aria-hidden="true" /> Premios del torneo
        </h2>
        {closed && admin && (
          <Badge>
            <Lock className="size-3" aria-hidden="true" /> Premios cerrados
          </Badge>
        )}
      </div>
      <Card className="flex flex-col gap-4 p-4">
        {model.state === 'sin_premios' ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted">Elige qué insignia se lleva el campeón.</p>
            <Button variant="primary" className="min-h-11" icon={<Gift className="size-4" />} onClick={p.onPick}>
              Elegir premios
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm font-semibold">{model.heading}</p>
            {model.sections.map((sec) => (
              <div key={sec.key} className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{sec.title}</h3>
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
                closed={closed}
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
  const current = !row.delivered && row.current?.status === 'listo' ? row.current.units : [];
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
        ) : current.length ? (
          <p className="truncate text-xs text-muted">
            Por ahora: {current.map((u) => (u.detail ? `${u.name} (${u.detail})` : u.name)).join(' · ')}
          </p>
        ) : row.current?.status === 'vacio' ? (
          <p className="text-xs text-muted">Por ahora, nadie en este lugar.</p>
        ) : null}
      </div>
    </li>
  );
}

/** «Los Strikers · Ana, Luis y Pedro» (tocar un jugador abre su página). */
function Winner({ winner, base, nameOf }: { winner: PrizeWinner; base: string; nameOf: (id: string) => string }) {
  const solo = winner.players.length === 1 && !winner.teamId && !winner.ref.startsWith('c:');
  const links: ReactNode[] = winner.players.map((id, i) => (
    <span key={id}>
      {i > 0 && (i === winner.players.length - 1 ? ' y ' : ', ')}
      <Link to={`${base}/j/${id}`} className="hover:text-accent hover:underline">
        {solo ? winner.name || nameOf(id) : nameOf(id)}
      </Link>
    </span>
  ));
  return (
    <p className="text-sm">
      {!solo && winner.name && <b className="font-semibold">{winner.name} · </b>}
      {winner.players.length > 6 ? namesLine(winner.players.map(nameOf), 5) : links}
    </p>
  );
}

function AdminBar(p: {
  model: CardModel;
  closed: boolean;
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
  const { model } = p;
  const delivered = model.state === 'entregados' || model.state === 'cerrados';
  // Con algo entregado ya es «Revisar» (un lugar que se quedó sin nadie nunca se entrega); destacado si falta alguno.
  const review = delivered;
  // Cerrados (o con todos los lugares pasados de sus 14 días): solo el dueño corrige. Un lugar sin entregar se sigue
  // entregando aunque otro ya se venció (la base lo revisa lugar por lugar).
  const { open, deadline, someExpired } = p.correction;
  const canCorrect = p.canDeliver && (p.isOwner || open);
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      {model.podiumChanged && canCorrect && (
        <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-warn">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" /> El podio cambió: revisa los premios.
        </p>
      )}
      {delivered && open && deadline && <p className="text-xs text-muted">Puedes corregir hasta el {dayText(deadline, p.tz)}.</p>}
      {delivered && !open && <p className="text-xs text-muted">{p.isOwner ? 'Solo tú puedes corregirlos.' : 'Solo el dueño puede corregirlos.'}</p>}
      {delivered && open && someExpired && (
        <p className="text-xs text-muted">
          {p.isOwner ? 'Lo entregado hace más de 14 días solo lo corriges tú.' : 'Lo entregado hace más de 14 días solo lo corrige el dueño.'}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {canCorrect && (
          <Button variant={review && model.allDelivered ? 'secondary' : 'primary'} className="min-h-11" icon={<Gift className="size-4" />} disabled={!p.ready && !delivered} onClick={p.onAward}>
            {review ? 'Revisar premios' : 'Entregar premios'}
          </Button>
        )}
        {p.canPick && !p.closed && (
          <Button variant="ghost" className="min-h-11" icon={<Pencil className="size-4" />} onClick={p.onPick}>
            Cambiar premios
          </Button>
        )}
        {p.canDeliver && delivered && open && (
          <Button variant="ghost" className="min-h-11" icon={<Lock className="size-4" />} loading={p.closing} onClick={p.onClosePrizes}>
            Cerrar premios
          </Button>
        )}
      </div>
      {!p.ready && !delivered && p.canDeliver && p.waitText && <p className="text-xs text-muted">{p.waitText}.</p>}
    </div>
  );
}
