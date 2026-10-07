import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, Archive, ChevronRight, Palette, Pencil, Plus, RotateCcw, Sparkles } from 'lucide-react';
import { ballDetail, ballStats, pctText, resurfaceText, type Ball, type BallGame, type BallStats } from '../../lib/balls';
import { useMyBallGames, useMyBalls } from '../../lib/data/balls';
import { formatDate } from '../../lib/format';
import { Button, Card, ListRow, SectionHeader, Skeleton, cx, sectionLinkClass } from '../ui';
import { BallArt } from './BallArt';
import { BallIcon } from './BallPicker';

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

/** «Morada 14 lb»: el nombre con el peso, como en las filas de «Por bola». */
export const ballTitle = (b: Pick<Ball, 'name' | 'weight'>) => (b.weight ? `${b.name} ${b.weight} lb` : b.name);

/** Debajo del nombre en «Por bola»: «5 juegos · 41% strikes» (y «toca pulirla» cuando ya le toca). */
export function ballRowLine(s: Pick<BallStats, 'games' | 'strikePct' | 'needsResurface'>): string {
  return [`${s.games} ${s.games === 1 ? 'juego' : 'juegos'}`, s.strikePct != null && `${s.strikePct}% strikes`, s.needsResurface && 'toca pulirla']
    .filter(Boolean)
    .join(' · ');
}

/** Una fila de «Por bola»: la bola dibujada (30 px), nombre y peso, juegos y strikes, y el promedio grande. Abre esa bola. */
function BallRow({ stats: s }: { stats: BallStats }) {
  return (
    <ListRow
      to={`/bolas?bola=${encodeURIComponent(s.ball.id)}`}
      ariaLabel={`${ballTitle(s.ball)}: promedio ${s.average ?? 'sin juegos'}, ${ballRowLine(s)}`}
      leading={<BallArt ball={s.ball} size={30} className="shrink-0" />}
      title={ballTitle(s.ball)}
      subtitle={ballRowLine(s)}
      value={s.average ?? <span className="text-faint">—</span>}
      chevron={false}
    />
  );
}

/** Los números por bola para «Por bola» (las que no están retiradas o ya tienen juegos). */
export function statsForSection(balls: readonly Ball[], games: readonly BallGame[]): BallStats[] {
  return ballStats(balls, games).filter((s) => !s.ball.retired || s.games > 0);
}

/** Las bolas de la cuenta con sus números (las de «Por bola»), si tiene alguna y si todavía se están leyendo. */
export function useBallSection(): { stats: BallStats[]; has: boolean; loading: boolean } {
  const mine = useMyBalls();
  const has = mine.data.balls.length > 0;
  const games = useMyBallGames(null, has);
  const stats = useMemo(() => statsForSection(mine.data.balls, games.data), [mine.data.balls, games.data]);
  return { stats, has, loading: mine.loading && !has };
}

/**
 * Yo › Pro › «Por bola»: los números de cada bola (el promedio grande, juegos y strikes; tocarla la abre en Mis bolas),
 * con el link a «Mis bolas» (ahí está con cuál tiras mejor y cuándo pulirlas). Solo si la cuenta tiene bolas.
 */
export function BallStatsSection({ className }: { className?: string }) {
  const { stats, has } = useBallSection();
  if (!has || !stats.length) return null;
  return (
    <Card className={cx('overflow-hidden', className)}>
      <section aria-label="Por bola">
        <div className="mm-row flex min-h-[52px] items-center justify-between gap-3 pr-[18px] pl-5">
          <h3 className="text-base font-[650] tracking-[-0.01em]">Por bola</h3>
          <Link to="/bolas" className="-my-1 inline-flex min-h-11 items-center text-sm font-semibold text-accent">
            Mis bolas
          </Link>
        </div>
        {stats.map((s) => (
          <BallRow key={s.ball.id} stats={s} />
        ))}
      </section>
    </Card>
  );
}

/**
 * Yo › Lite › «Mis bolas»: cada bola en su tarjeta (dibujada, con su nombre y cuántos juegos lleva) y «Agregar»; tocar
 * una la abre en Mis bolas. Sin bolas, una tarjeta para agregar la primera.
 */
export function MyBallsSection({ className }: { className?: string }) {
  const { stats, loading } = useBallSection();
  const active = stats.filter((s) => !s.ball.retired);
  return (
    <section aria-labelledby="yo-mis-bolas" className={className}>
      <SectionHeader
        id="yo-mis-bolas"
        title="Mis bolas"
        action={
          <Link to="/bolas?nueva=1" className={sectionLinkClass}>
            <Plus aria-hidden="true" className="size-4" strokeWidth={2.4} /> Agregar
          </Link>
        }
      />
      {loading ? (
        <Skeleton className="h-[66px] rounded-3xl" />
      ) : active.length ? (
        <div className="grid grid-cols-2 gap-2.5">
          {active.map((s) => (
            <Link
              key={s.ball.id}
              to={`/bolas?bola=${encodeURIComponent(s.ball.id)}`}
              className="card-shadow flex min-w-0 items-center gap-3 rounded-3xl bg-surface p-3.5 transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <BallArt ball={s.ball} size={38} className="shrink-0" />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-[650] tracking-[-0.01em]">{s.ball.name}</span>
                <span className="mt-px block truncate text-[13px] text-muted">
                  {s.games} {s.games === 1 ? 'juego' : 'juegos'}
                </span>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <Link
          to="/bolas?nueva=1"
          className="card-shadow flex min-h-row items-center gap-3.5 rounded-3xl bg-surface py-2.5 pr-[18px] pl-5 transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <BallIcon className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-body font-semibold">Agrega tu bola</span>
            <span className="mt-0.5 block text-sm text-muted">Y mira con cuál tiras mejor</span>
          </span>
          <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-faint" />
        </Link>
      )}
    </section>
  );
}
