import { useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, Archive, ChevronRight, MoreHorizontal, Palette, Pencil, Plus, RotateCcw, Sparkles } from 'lucide-react';
import { catalogBall } from '../../lib/ballCatalog';
import { RESURFACE_EVERY, ballDetail, catalogSpecs, layoutText, pctText, resurfaceText, type BallStats } from '../../lib/balls';
import { formatDate } from '../../lib/format';
import { EventMenu, type MenuItem } from '../event/EventHeader';
import { Button, Card, ListRow, SectionHeader, Skeleton, cx, sectionLinkClass } from '../ui';
import { BallArt } from './BallArt';
import { BallIcon } from './BallPicker';
import { ballGamesNote, ballRowLine, ballTitle, useBallSection } from './stats';

// Los números de las listas sin la pantalla están en stats.ts (la app del teléfono usa lo mismo).
export { ballRowLine, ballTitle, statsForSection, useBallSection } from './stats';

/** Un número de la tarjeta de una bola (sin caja: los cuatro en una fila, como en Yo). */
function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="truncate text-xs font-[550] text-muted">{label}</dt>
      <dd className="num text-[22px] leading-[1.15] font-[650]">{value}</dd>
    </div>
  );
}

/**
 * Una bola en «Mis bolas» (rediseño «Calma y foco»): la bola dibujada (con su diseño; tocarla abre «Diseñar»), nombre y
 * detalle (con lo que dice el catálogo de su modelo y su perforación, «Perforación 45° × 4½″ × 30°», si los tiene), y
 * «•••» con Editar, Diseñar y Retirar (o Volver a usarla); sus números (juegos, promedio, el más alto y
 * strikes de los juegos anotados por cuadros) en una fila, y cuántos juegos lleva desde la última pulida con una barrita
 * (en ámbar cuando ya le toca) y «La pulí hoy» al lado. Una retirada trae «Volver a usarla» a la vista.
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
  const model = catalogBall(b.catalog);
  const specs = model ? catalogSpecs(model) : null;
  const layout = layoutText(b.layout);
  const notes = b.layout?.notes?.trim();
  const gamesNote = ballGamesNote(s);
  // `busy` dice que la bola espera; la ruedita va en lo que se tocó.
  const [pressed, setPressed] = useState<'resurface' | 'retire' | null>(null);
  const [menu, setMenu] = useState(false);
  const wear = Math.min(1, s.sinceResurface / RESURFACE_EVERY);
  const retire = () => {
    setMenu(false);
    setPressed('retire');
    onRetire();
  };
  const items: MenuItem[] = [
    {
      key: 'editar',
      icon: Pencil,
      label: 'Editar',
      hint: 'Nombre, peso, cubierta, fechas y perforación',
      onClick: () => {
        setMenu(false);
        onEdit();
      },
    },
    ...(onDesign
      ? [
          {
            key: 'disenar',
            icon: Palette,
            label: 'Diseñar',
            hint: 'Su color y su dibujo',
            onClick: () => {
              setMenu(false);
              onDesign();
            },
          },
        ]
      : []),
    b.retired
      ? { key: 'volver', icon: RotateCcw, label: 'Volver a usarla', onClick: retire, busy: busy && pressed === 'retire' }
      : { key: 'retirar', icon: Archive, label: 'Retirar', hint: 'Ya no sale al anotar; sus números se quedan', onClick: retire, busy: busy && pressed === 'retire' },
  ];
  return (
    <Card className={cx('flex flex-col gap-4 p-5', b.retired && 'opacity-80')}>
      <div className="flex items-center gap-3.5">
        {onDesign ? (
          <button
            type="button"
            onClick={onDesign}
            aria-label={`Diseñar la ${b.name}`}
            title="Diseñar"
            className="-m-1 flex shrink-0 flex-col items-center gap-0.5 rounded-2xl p-1 transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <BallArt ball={b} size={64} />
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent">
              <Palette className="size-3" aria-hidden="true" /> Diseñar
            </span>
          </button>
        ) : (
          <BallArt ball={b} size={64} className="shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[19px] leading-tight font-[650] tracking-[-0.015em]">{b.name}</h3>
          <p className="mt-0.5 truncate text-sm text-muted">
            {ballDetail(b)}
            {b.retired && ' · retirada'}
          </p>
          {specs && <p className="mt-0.5 truncate text-[13px] text-muted">{specs}</p>}
          {(layout || notes) && (
            <p className="mt-1 line-clamp-2 text-[13px] text-fg-2">
              <span className="text-muted">Perforación </span>
              {layout && <span className="num font-semibold whitespace-nowrap">{layout}</span>}
              {layout && notes && <span className="text-muted"> · </span>}
              {notes}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMenu(true)}
          aria-label={`Más opciones de la ${b.name}`}
          aria-haspopup="dialog"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-fg-2 transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <MoreHorizontal aria-hidden="true" strokeWidth={2.4} className="size-[22px]" />
        </button>
      </div>
      <dl className="grid grid-cols-4 gap-2 border-t border-line pt-4">
        <Mini label="Juegos" value={s.games} />
        <Mini label="Promedio" value={s.average ?? '—'} />
        <Mini label="Más alto" value={s.high || '—'} />
        <Mini label="Strikes" value={pctText(s.strikePct)} />
      </dl>
      {gamesNote && <p className="-mt-1 text-[13px] text-muted">{gamesNote}</p>}
      {!b.retired ? (
        <div className={cx('flex items-center gap-3 rounded-2xl py-3 pr-3 pl-4 max-[380px]:flex-wrap', s.needsResurface ? 'bg-warn-soft text-warn' : 'bg-surface-2')}>
          <div className="min-w-0 flex-1 max-[380px]:basis-full">
            <p className={cx('flex items-start gap-1.5 text-sm', !s.needsResurface && 'text-fg-2')}>
              {s.needsResurface && <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
              <span>
                {resurfaceText(s)}
                {b.resurfacedOn && ` La puliste el ${formatDate(b.resurfacedOn)}.`}
              </span>
            </p>
            <span aria-hidden="true" className={cx('mt-2 block h-1.5 overflow-hidden rounded-full', s.needsResurface ? 'bg-warn/20' : 'bg-line')}>
              <span className={cx('block h-full rounded-full', s.needsResurface ? 'bg-warn' : 'bg-accent')} style={{ width: `${Math.round(wear * 100)}%` }} />
            </span>
          </div>
          <Button
            variant={s.needsResurface ? 'primary' : 'soft'}
            className="h-11 shrink-0 max-[380px]:w-full"
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
        </div>
      ) : (
        <Button
          variant="quiet"
          size="lg"
          className="w-full"
          icon={<RotateCcw className="size-4" />}
          disabled={busy}
          loading={busy && pressed === 'retire'}
          onClick={() => {
            setPressed('retire');
            onRetire();
          }}
        >
          Volver a usarla
        </Button>
      )}
      {s.lastUsedOn && <p className="-mt-1 text-[13px] text-muted">Último juego con ella: {formatDate(s.lastUsedOn)}</p>}
      <EventMenu open={menu} onClose={() => setMenu(false)} title={b.name} items={items} />
    </Card>
  );
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
