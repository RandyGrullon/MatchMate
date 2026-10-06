import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, Archive, ChevronRight, Palette, Pencil, RotateCcw, Sparkles } from 'lucide-react';
import { ballDetail, ballStats, bestBallText, pctText, resurfaceText, type Ball, type BallGame, type BallStats } from '../../lib/balls';
import { useMyBallGames, useMyBalls } from '../../lib/data/balls';
import { formatDate } from '../../lib/format';
import { Button, Card, cx } from '../ui';
import { BallArt } from './BallArt';

/** Un número chico de la tarjeta de una bola. */
function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col-reverse items-center rounded-xl bg-surface-2 px-1 py-2">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="text-lg leading-tight font-bold tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * Una bola en «Mis bolas»: la bola dibujada (con su diseño; tocarla abre «Diseñar»), nombre y detalle; juegos,
 * promedio, el más alto y strikes (de los juegos anotados por cuadros); cuántos juegos lleva desde la última pulida (en
 * amarillo cuando ya le toca) y las acciones: editar, «La pulí hoy» y retirar (o volver a usar).
 */
export function BallCard({
  stats: s,
  busy,
  onEdit,
  onDesign,
  onResurface,
  onRetire,
}: {
  stats: BallStats;
  busy?: boolean;
  onEdit: () => void;
  /** Abre el creador de la bola (sin esto, la bola solo se ve). */
  onDesign?: () => void;
  onResurface: () => void;
  onRetire: () => void;
}) {
  const b = s.ball;
  // `busy` dice que la bola espera; la ruedita va en el botón que se tocó.
  const [pressed, setPressed] = useState<'resurface' | 'retire' | null>(null);
  return (
    <Card className={cx('flex flex-col gap-3 p-4', b.retired && 'opacity-80')}>
      <div className="flex items-center gap-3">
        {onDesign ? (
          <button
            type="button"
            onClick={onDesign}
            aria-label={`Diseñar la ${b.name}`}
            title="Diseñar"
            className="-m-1 flex shrink-0 flex-col items-center gap-0.5 rounded-2xl p-1 transition hover:bg-surface-2 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <BallArt ball={b} size={64} />
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent">
              <Palette className="size-3" aria-hidden="true" /> Diseñar
            </span>
          </button>
        ) : (
          <BallArt ball={b} size={64} className="shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{b.name}</h3>
          <p className="truncate text-xs text-muted">
            {ballDetail(b)}
            {b.retired && ' · retirada'}
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Editar la ${b.name}`}
          title="Editar"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Pencil className="size-4" aria-hidden="true" />
        </button>
      </div>
      <dl className="grid grid-cols-4 gap-2">
        <Mini label="Juegos" value={s.games} />
        <Mini label="Promedio" value={s.average ?? '—'} />
        <Mini label="Más alto" value={s.high || '—'} />
        <Mini label="Strikes" value={pctText(s.strikePct)} />
      </dl>
      {(s.framed > 0 || s.pending > 0) && (
        <p className="text-xs text-muted">
          {s.framed > 0 && `Strikes ${pctText(s.strikePct)} y spares ${pctText(s.sparePct)} con ${s.framed} ${s.framed === 1 ? 'juego anotado' : 'juegos anotados'} por cuadros.`}
          {s.framed > 0 && s.pending > 0 && ' '}
          {s.pending > 0 && `${s.pending} ${s.pending === 1 ? 'juego cuenta' : 'juegos cuentan'} cuando se ${s.pending === 1 ? 'verifique' : 'verifiquen'}.`}
        </p>
      )}
      {!b.retired && (
        <p className={cx('flex items-start gap-1.5 text-sm', s.needsResurface ? 'rounded-xl bg-warn-soft px-3 py-2 text-warn' : 'text-muted')}>
          {s.needsResurface ? <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          <span>
            {resurfaceText(s)}
            {b.resurfacedOn && ` La puliste el ${formatDate(b.resurfacedOn)}.`}
          </span>
        </p>
      )}
      <div className="flex gap-2">
        {!b.retired && (
          <Button
            className="h-11 flex-1"
            icon={<Sparkles className="size-4" />}
            disabled={busy}
            loading={busy && pressed === 'resurface'}
            onClick={() => {
              setPressed('resurface');
              onResurface();
            }}
          >
            La pulí hoy
          </Button>
        )}
        <Button
          variant="ghost"
          className="h-11 flex-1"
          icon={b.retired ? <RotateCcw className="size-4" /> : <Archive className="size-4" />}
          disabled={busy}
          loading={busy && pressed === 'retire'}
          onClick={() => {
            setPressed('retire');
            onRetire();
          }}
        >
          {b.retired ? 'Volver a usarla' : 'Retirar'}
        </Button>
      </div>
      {s.lastUsedOn && <p className="-mt-1 text-[11px] text-muted">Último juego con ella: {formatDate(s.lastUsedOn)}</p>}
    </Card>
  );
}

/** Una fila de «Por bola»: la bola dibujada, nombre, juegos, mejor juego y strikes, y el promedio grande. */
function BallRow({ stats: s }: { stats: BallStats }) {
  return (
    <Link to="/bolas" className="flex min-h-14 items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
      <BallArt ball={s.ball} size={40} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{s.ball.name}</div>
        <div className="text-xs text-muted tabular-nums">
          {s.games} {s.games === 1 ? 'juego' : 'juegos'}
          {s.high > 0 && ` · mejor ${s.high}`}
          {s.strikePct != null && ` · strikes ${s.strikePct}%`}
          {s.needsResurface && ' · toca pulirla'}
        </div>
      </div>
      <div className="text-right">
        <div className="text-lg font-bold tabular-nums">{s.average ?? '—'}</div>
        <div className="text-[11px] text-muted">promedio</div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
    </Link>
  );
}

/** Los números por bola para «Por bola» (las que no están retiradas o ya tienen juegos). */
export function statsForSection(balls: readonly Ball[], games: readonly BallGame[]): BallStats[] {
  return ballStats(balls, games).filter((s) => !s.ball.retired || s.games > 0);
}

/**
 * «Por bola» en «Mis estadísticas» del perfil: con cuál tiras mejor y los números de cada bola (juegos, promedio, el
 * más alto, strikes), con el link a «Mis bolas». Solo si la cuenta tiene bolas.
 */
export function BallStatsSection() {
  const mine = useMyBalls();
  const has = mine.data.balls.length > 0;
  const games = useMyBallGames(null, has);
  const stats = useMemo(() => statsForSection(mine.data.balls, games.data), [mine.data.balls, games.data]);
  if (!has || !stats.length) return null;
  const best = bestBallText(stats);
  return (
    <section className="flex flex-col gap-2" aria-label="Por bola">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-muted">Por bola</h3>
        <Link to="/bolas" className="-my-2 flex min-h-11 items-center text-xs font-medium text-accent">
          Mis bolas
        </Link>
      </div>
      {best && <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent">{best}</p>}
      <Card className="divide-y divide-line overflow-hidden">
        {stats.map((s) => (
          <BallRow key={s.ball.id} stats={s} />
        ))}
      </Card>
    </section>
  );
}
