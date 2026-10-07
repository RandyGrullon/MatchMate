import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Check, ChevronRight, FileSpreadsheet, PencilLine, Send, Target, UserRound, type LucideIcon } from 'lucide-react';
import type { CalendarItem } from '../../lib/calendar';
import { useEventEntries, useEventLive, useEventSubmissions, usePlayers } from '../../lib/data';
import { useEventLanes } from '../../lib/data/lanes';
import { laneOf, lanesPublished } from '../../lib/lanes';
import { formatTime } from '../../lib/schedule';
import { liveRows, type LiveGame, type LiveRow } from '../../lib/live';
import { nextGameLabel, sheetPath, useNextGame, type GameCell, type NextGame, type TodayGames } from '../../lib/useNextGame';
import { initials } from '../Avatar';
import { BusyIcon, useBusy } from '../busy';
import { Card, DateBlock, GameTile, Skeleton, cx } from '../ui';
import { socialLine, todayTitle, weekdayLabel } from './logic';
import { SportTint } from './SportTint';

// ---------- Piezas ----------

type ActionVariant = 'primary' | 'quiet' | 'soft';

const actionVariants: Record<ActionVariant, string> = {
  primary: 'bg-accent text-accent-fg shadow-sm hover:brightness-110',
  quiet: 'bg-surface-2 text-fg hover:brightness-95',
  soft: 'bg-accent-soft text-accent hover:brightness-95',
};

/**
 * Link con forma de botón (el botón principal de la tarjeta lleva a otra pantalla): 56 px en Lite (`xl`) y 48 en Pro
 * (`lg`), en una línea (si no cabe, «…»).
 */
export function ActionLink({
  to,
  icon: Icon,
  children,
  variant = 'primary',
  size = 'xl',
  narrowIcon,
  className,
}: {
  to: string;
  icon?: LucideIcon;
  children: ReactNode;
  variant?: ActionVariant;
  size?: 'lg' | 'xl';
  /** Sin ícono en un teléfono angosto (menos de 390 px): dos botones lado a lado no caben con ícono. */
  narrowIcon?: boolean;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cx(
        'inline-flex min-w-0 items-center justify-center font-semibold whitespace-nowrap transition select-none active:scale-[0.97]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        size === 'xl' ? 'h-btn gap-2.5 rounded-btn px-6 text-[17px] tracking-[-0.01em]' : 'h-btn-pro gap-2 rounded-[15px] px-4 text-base',
        actionVariants[variant],
        className,
      )}
    >
      {Icon && <Icon aria-hidden="true" className={cx(size === 'xl' ? 'size-5 shrink-0' : 'size-[18px] shrink-0', narrowIcon && 'max-[389px]:hidden')} />}
      <span className="min-w-0 truncate">{children}</span>
    </Link>
  );
}

/** El punto «en vivo» del color del deporte, con su aro suave. */
export function LiveDot() {
  return <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-accent shadow-[0_0_0_4px_var(--accent-soft)]" />;
}

/** Ícono del botón principal según lo que hace. */
const NEXT_ICON: Record<NextGame['kind'], LucideIcon> = {
  medias: PencilLine,
  anotar: PencilLine,
  enviar: Send,
  ver: Check,
  preparar: UserRound,
  planilla: FileSpreadsheet,
};

/** Las fichas de los juegos: el que sigue con «+», el que quedó a medias punteado, lo por aprobar en gris. */
export function GameTiles({ cells, dense, series }: { cells: readonly GameCell[]; dense?: boolean; series?: number }) {
  const next = cells.findIndex((c) => c.kind === 'vacio' || c.kind === 'medias');
  const four = dense || cells.length > 3;
  const label = (i: number) => (four ? `J${i + 1}` : `Juego ${i + 1}`);
  return (
    <div className={cx('grid', four ? 'grid-cols-4 gap-2' : 'grid-cols-3 gap-2.5')}>
      {cells.map((c, i) => {
        // Pro: lo que lleva («74…»); si todavía no suma nada (un strike que espera), «A medias».
        if (c.kind === 'medias') return <GameTile key={i} label={label(i)} state="draft" progress={c.progress} score={four && c.score ? c.score : null} dense={four} />;
        if (c.kind === 'vacio')
          return i === next ? (
            <GameTile key={i} label={label(i)} state="next" dense={four} />
          ) : (
            <GameTile key={i} label={label(i)} dense={four} className="text-faint" />
          );
        // Lo enviado todavía no cuenta: en gris hasta que lo aprueben.
        return <GameTile key={i} label={label(i)} score={c.score} dense={four} className={c.kind === 'enviado' ? 'text-faint' : undefined} />;
      })}
      {series != null && <GameTile label="Serie" score={series} state="total" dense />}
    </div>
  );
}

function TilesSkeleton({ n, dense }: { n: number; dense?: boolean }) {
  return (
    <div className={cx('grid', dense || n > 3 ? 'grid-cols-4 gap-2' : 'grid-cols-3 gap-2.5')} aria-busy="true" aria-label="Cargando tus juegos">
      {Array.from({ length: n }, (_, i) => (
        <Skeleton key={i} className={dense || n > 3 ? 'h-16 rounded-[15px]' : 'h-[84px] rounded-tile'} />
      ))}
    </div>
  );
}

// ---------- Datos del evento en juego ----------

/** Cómo van todos en el evento (lo de la tabla, lo enviado y lo que anotan en su teléfono) y el nombre de cada uno. */
export interface LiveTable {
  rows: LiveRow[];
  nameOf: (id: string) => string;
  loading: boolean;
}

/** Cómo van todos en el evento en juego (null = no hay: no lee nada). Comparte las lecturas con la pantalla del evento. */
export function useLiveTable(game: Pick<LiveGame, 'feed' | 'event'> | null): LiveTable {
  const lid = game?.feed.lid;
  const event = game?.event;
  const entries = useEventEntries(lid, event?.id);
  const subs = useEventSubmissions(lid, event?.id);
  const live = useEventLive(lid, event?.id);
  const players = usePlayers(lid);
  const rows = event ? liveRows(event, entries.data, subs.data, live.data) : [];
  const nameOf = (id: string) => players.data.find((p) => p.id === id)?.name ?? 'Jugador';
  return { rows, nameOf, loading: entries.loading || players.loading || live.loading };
}

/** «Pista 7» cuando el admin ya publicó las pistas (null si no). */
function useMyLaneNumber(lid: string, eventId: string | null, playerId: string | null): number | null {
  const lanes = useEventLanes(playerId && eventId ? lid : null, eventId);
  const mine = laneOf(lanes.data, playerId);
  return mine && lanesPublished(lanes.data) ? mine.lane : null;
}

// ---------- La tarjeta de hoy (evento en juego) ----------

/**
 * La práctica o el torneo que se juega hoy, una sola vez: título, liga · bolera, tus juegos en grande (el que dejaste a
 * medias se ve como «A medias»), UN botón (useNextGame: «Seguir mi juego 3», «Anotar juego 1», «Enviar mis juegos») y
 * la línea social «6 jugando · Pedro va primero ›» (lleva a la práctica). En Pro, más densa: J1 J2 J3 Serie, «Seguir
 * juego 3» y «Planilla» (si anotas el evento) al lado; «Cómo van todos» va abajo en «En vivo».
 */
export function TodayCard({ game, today, pro }: { game: LiveGame; today: string; pro: boolean }) {
  const { feed, league, event, info } = game;
  const mine = useNextGame(game, today);
  const table = useLiveTable(game);
  const lane = useMyLaneNumber(feed.lid, event.id, feed.playerId);
  const staff = feed.isAdmin || feed.isScorer;
  const title = todayTitle(event, today);
  const eventUrl = `/l/${feed.lid}/e/${event.id}`;
  const n = table.rows.length;

  const when = info.startsSoon && info.startLabel ? `Empieza a las ${info.startLabel}` : pro && n ? `En juego · ${n} jugando` : pro ? 'En juego' : 'En juego ahora';
  // La hora: la de la liga; si el evento cae otro día (un torneo el sábado), la que tenga el evento.
  const start = info.startLabel ?? (event.startTime ? formatTime(event.startTime.slice(0, 5)) || null : null);
  const meta = [league.kind !== 'torneo' ? league.name : null, league.venue?.trim() || null].filter(Boolean).join(' · ');
  // «7:30 pm · Pista 7» (sin hora ni pista, nada).
  const whenWhere = [!info.startsSoon ? start : null, lane != null ? `Pista ${lane}` : null].filter(Boolean).join(' · ');

  return (
    <SportTint sport="bowling">
      <Card className={pro ? 'p-[18px]' : 'px-5 pt-5 pb-2'}>
        <section aria-label={`${title}: ${when}`}>
          <div className="flex items-center justify-between gap-3">
            {/* «En juego · 6 jugando» entero; si no cabe, se acorta el nombre de la liga (Pro). */}
            <p className={cx('flex items-center gap-2 text-sm font-semibold text-accent', pro ? 'shrink-0' : 'min-w-0')}>
              <LiveDot />
              <span className="truncate">{when}</span>
            </p>
            {pro ? (
              <span className="min-w-0 truncate text-sm text-muted">{league.name}</span>
            ) : (
              whenWhere && <span className="shrink-0 text-sm font-[550] text-muted">{whenWhere}</span>
            )}
          </div>
          <h2 className={cx('truncate', pro ? 'mt-2 text-card-title-pro' : 'mt-2.5 text-card-title')}>{title}</h2>
          {!pro && meta && <p className="mt-1.5 truncate text-meta text-muted">{meta}</p>}
          {pro && lane != null && <p className="mt-1 text-sm font-[550] text-muted">Pista {lane}</p>}

          <div className={pro ? 'my-3.5' : 'mt-[18px] mb-4'}>
            {!mine || mine.loading ? (
              <TilesSkeleton n={event.games + (pro ? 1 : 0)} dense={pro} />
            ) : (
              <GameTiles cells={mine.cells} dense={pro} series={pro ? mine.series : undefined} />
            )}
          </div>

          {mine && <TodayActions mine={mine} pro={pro} staff={staff} sheetTo={sheetPath(feed.lid, event.id)} />}

          {!pro && <SocialLine to={eventUrl} table={table} me={feed.playerId} />}
        </section>
      </Card>
    </SportTint>
  );
}

/** El botón principal y, en Pro, «Planilla» al lado (solo quien anota el evento). */
function TodayActions({ mine, pro, staff, sheetTo }: { mine: TodayGames; pro: boolean; staff: boolean; sheetTo: string }) {
  const { next } = mine;
  const label = nextGameLabel(next, { pro });
  const sheet = pro && staff && next.kind !== 'planilla';
  if (!sheet)
    return (
      <ActionLink to={next.to} icon={NEXT_ICON[next.kind]} size={pro ? 'lg' : 'xl'} className="w-full">
        {label}
      </ActionLink>
    );
  return (
    <div className="grid grid-cols-[1.45fr_1fr] gap-2">
      <ActionLink to={next.to} icon={NEXT_ICON[next.kind]} size="lg" narrowIcon>
        {label}
      </ActionLink>
      <ActionLink to={sheetTo} icon={FileSpreadsheet} variant="quiet" size="lg" narrowIcon>
        Planilla
      </ActionLink>
    </div>
  );
}

/** «PG LM SR  6 jugando · Pedro va primero ›»: lleva a la práctica (cómo van todos). */
function SocialLine({ to, table, me }: { to: string; table: LiveTable; me: string | null }) {
  const leader = table.rows[0] ? { name: table.nameOf(table.rows[0].playerId), me: table.rows[0].playerId === me } : null;
  const line = socialLine(table.rows.length, leader);
  const faces = table.rows.slice(0, 3).map((r) => table.nameOf(r.playerId));
  return (
    <Link
      to={to}
      aria-label={`Cómo van todos: ${line.count}${line.leader ? `, ${line.leader}` : ''}`}
      className="mt-1 flex h-[52px] items-center gap-2.5 text-sm font-medium text-fg-2 transition active:opacity-70"
    >
      {/* Las caras solo desde 390 px: en uno más angosto no cabría «6 jugando · Pedro va primero». */}
      {faces.length > 0 && (
        <span aria-hidden="true" className="flex shrink-0 max-[389px]:hidden">
          {faces.map((name, i) => (
            <span
              key={i}
              className={cx(
                'grid size-7 place-items-center rounded-full border-2 border-surface bg-surface-2 text-[10.5px] font-[650] text-fg-2',
                i > 0 && '-ml-[7px]',
              )}
            >
              {initials(name)}
            </span>
          ))}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">
        {line.count}
        {line.leader && (
          <>
            {' · '}
            {leaderText(line.leader)}
          </>
        )}
      </span>
      <ChevronRight aria-hidden="true" className="-mr-1 size-[18px] shrink-0 text-faint" />
    </Link>
  );
}

/** «Pedro va primero» con el nombre en negrita («Vas primero»: «Vas»). */
function leaderText(text: string): ReactNode {
  const [who, ...rest] = text.split(' ');
  return (
    <>
      <b className="font-[650] text-fg">{who}</b> {rest.join(' ')}
    </>
  );
}

// ---------- Día sin juego ----------

/**
 * Hoy no hay nada en juego: lo próximo (práctica, torneo o evento) con su fecha (OCT / 13) y «Voy» como botón principal
 * si es una práctica del boliche que se puede confirmar (ya confirmada: «Vas ✓», que se toca para quitarlo). Debajo, el
 * link discreto para anotar igual (un juego suelto, o «¿Dónde jugaste?» si jugaste ayer o hoy en una liga). Si el evento
 * es hoy más tarde, «Hoy juegas».
 */
export function NextUpCard({
  item,
  today,
  rsvp,
  anotar,
}: {
  item: CalendarItem;
  today: string;
  /** Confirmar o quitar «Voy» (solo prácticas del boliche con evento creado). */
  rsvp: ((going: boolean) => Promise<unknown>) | null;
  /** El link discreto de abajo («Anotar un juego suelto» o «Seguir mi juego 2»). */
  anotar: ReactNode;
}) {
  const isToday = item.date === today;
  // Su pista, si el admin ya las publicó (también antes del día).
  const lane = useMyLaneNumber(item.lid, item.sport === 'bowling' ? item.eventId : null, item.playerId);
  const kind = item.type === 'torneo' ? 'torneo' : item.type === 'practica' || item.sport === 'bowling' ? 'práctica' : 'evento';
  const lead = isToday ? 'Hoy juegas' : 'Hoy no te toca jugar';
  const title = isToday ? todayTitle({ type: item.type, name: item.type === 'torneo' ? item.name : null, date: item.date }, today) : `Tu próxim${kind === 'práctica' ? 'a' : 'o'} ${kind}`;
  const line = [weekdayLabel(item.date, today), item.time, lane != null ? `Pista ${lane}` : null].filter(Boolean).join(' · ');
  return (
    <SportTint sport={item.sport}>
      <Card className="px-5 pt-5 pb-2">
        <section aria-label={`${lead}: ${title}`}>
          <p className="text-sm font-semibold text-muted">{lead}</p>
          <h2 className="mt-2 truncate text-card-title">{title}</h2>
          <Link
            to={item.href}
            className="mt-4 flex items-center gap-3.5 rounded-tile bg-surface-2 p-3.5 transition active:opacity-80 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <DateBlock date={item.date} raised />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-[650]">{item.type === 'torneo' && !isToday ? `${item.name} · ${line}` : line}</span>
              <span className="mt-0.5 block truncate text-sm text-muted">{item.leagueName}</span>
            </span>
          </Link>
          {rsvp && <RsvpAction going={item.going} onToggle={rsvp} />}
          <div className={rsvp ? 'mt-1' : 'mt-2'}>{anotar}</div>
        </section>
      </Card>
    </SportTint>
  );
}

/** «✓ Voy» (botón principal) o, ya confirmado, «Vas ✓» en acento suave (tocarlo lo quita). */
function RsvpAction({ going, onToggle }: { going: boolean; onToggle: (going: boolean) => Promise<unknown> }) {
  const { isBusy, run } = useBusy();
  const busy = isBusy();
  return (
    <button
      type="button"
      onClick={() => void run('voy', () => onToggle(!going))}
      disabled={busy}
      aria-busy={busy || undefined}
      aria-pressed={going}
      aria-label={going ? 'Vas (toca si ya no vas)' : 'Voy'}
      className={cx(
        'mt-4 inline-flex h-btn w-full items-center justify-center gap-2.5 rounded-btn text-[17px] font-semibold tracking-[-0.01em] transition select-none active:scale-[0.97]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-80',
        going ? 'bg-accent-soft text-accent' : 'bg-accent text-accent-fg shadow-sm hover:brightness-110',
      )}
    >
      <BusyIcon busy={busy} icon={<Check aria-hidden="true" className="size-5" strokeWidth={2.4} />} className="size-5" />
      {going ? 'Vas' : 'Voy'}
    </button>
  );
}

/** El link discreto de la tarjeta («Anotar un juego suelto»): gris fuerte, con ícono, 44 px para el dedo. */
export function QuietLink({ to, onClick, icon: Icon = Target, children, accent }: { to?: string; onClick?: () => void; icon?: LucideIcon; children: ReactNode; accent?: boolean }) {
  const cls = cx(
    'flex h-11 w-full items-center justify-center gap-1.5 text-meta font-[550] transition active:opacity-70',
    'focus-visible:outline-2 focus-visible:outline-accent',
    accent ? 'text-accent' : 'text-fg-2',
  );
  const inner = (
    <>
      <Icon aria-hidden="true" className="size-[17px] shrink-0" />
      <span className="truncate">{children}</span>
    </>
  );
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/**
 * Tiene ligas pero no hay nada programado (ni hoy ni en los próximos 30 días): lo dice en una línea, con el link para
 * anotar igual.
 */
export function IdleCard({ anotar }: { anotar: ReactNode }) {
  return (
    <Card className="px-5 pt-5 pb-2">
      <section aria-label="Hoy no te toca jugar">
        <p className="text-sm font-semibold text-muted">Hoy no te toca jugar</p>
        <h2 className="mt-2 text-card-title">Nada programado</h2>
        <p className="mt-1.5 text-meta text-muted">Cuando tu liga ponga la próxima fecha, sale aquí.</p>
        <div className="mt-2">{anotar}</div>
      </section>
    </Card>
  );
}
