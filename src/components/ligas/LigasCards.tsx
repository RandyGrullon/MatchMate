import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Check, ChevronRight, CircleHelp, Crown, Hourglass, Medal, Repeat, ShieldCheck, Target, Users, type LucideIcon } from 'lucide-react';
import type { CalendarItem } from '../../lib/calendar';
import { usePlayers } from '../../lib/data';
import { squadPath, type MySquad } from '../../lib/data/squads';
import { roleLabel } from '../../lib/league';
import type { League, Member } from '../../lib/types';
import { isGameId } from '../../sports/esports/catalog';
import { leagueSport, sportMeta } from '../../sports/registry';
import { SportMark } from '../SportMark';
import { rowLineText, tourneyLine, type RowLine, type TourneyItem } from '../eventos/logic';
import { useMyStanding } from '../home/HomeStats';
import { LeagueLogo } from '../home/LeagueCard';
import { countLabel, peopleWord } from '../league/logic';
import { LiveDot } from '../live/LiveParts';
import { mySquadLine, squadTitle } from '../squads/logic';
import { SquadLogo, SquadTint } from '../squads/SquadBits';
import { DateBlock, Skeleton, cx } from '../ui';
import { LineText, useTint } from './LigasRows';
import { leagueKindLine, nextBlock, sportLabel, standingBits, type SummaryPart } from './logic';

/**
 * Las tarjetas de Ligas (pedido: «se ve sonso, como apagado»): cada liga en su tarjeta con el color de su deporte
 * (una franja suave arriba: suave en claro, más honda en oscuro), su logo grande o el ícono del deporte en su color,
 * de qué es («Pádel · Pública»), lo próximo en un bloque con la fecha, «EN VIVO» en rojo si se está jugando y los
 * números chicos (jugadores, tu lugar y tu promedio en el boliche; en Pro, tu papel). Los torneos, en tarjetas que se
 * deslizan de lado; los equipos, en su color. Un solo link por tarjeta (el nombre, estirado sobre toda la tarjeta).
 */

/** El link del nombre cubre toda la tarjeta (su ::after); la tarjeta muestra el foco y se hunde un poco al tocarla. */
const stretched = "mm-card-link outline-none after:absolute after:inset-0 after:z-[1] after:content-['']";
const cardFocus =
  'has-[.mm-card-link:focus-visible]:outline-2 has-[.mm-card-link:focus-visible]:outline-offset-2 has-[.mm-card-link:focus-visible]:outline-accent has-[.mm-card-link:active]:scale-[0.99]';

/** «● EN VIVO» en rojo (el punto late). `tiny`: el de la esquina del logo. */
export function LivePill({ tiny, className }: { tiny?: boolean; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full bg-danger leading-none font-bold whitespace-nowrap text-on-danger',
        tiny ? 'px-1.5 py-[3px] text-[10px] tracking-[0.06em] ring-2 ring-surface' : 'px-2.5 py-[5px] text-[11px] tracking-[0.08em]',
        className,
      )}
    >
      <LiveDot />
      EN VIVO
    </span>
  );
}

/** La franja del color del deporte arriba de la tarjeta y el ícono grande y tenue en la esquina (adorno). */
function Band({ sport, tall }: { sport: string; tall?: boolean }) {
  const Icon = sportMeta(sport)?.icon ?? CircleHelp;
  return (
    <>
      <span aria-hidden="true" className={cx('pointer-events-none absolute inset-x-0 top-0 -z-10 bg-gradient-to-b from-accent-soft to-transparent', tall ? 'h-28' : 'h-20')} />
      <Icon aria-hidden="true" className="pointer-events-none absolute -top-5 -right-5 -z-10 size-28 -rotate-12 text-accent opacity-[0.09]" strokeWidth={1.6} />
    </>
  );
}

/**
 * El logo de la liga (56 px en Lite, 48 en Pro) o, sin logo, el ícono del deporte en su color lleno (en esports con
 * juego, el monograma del juego). Si se está jugando, un aro rojo y «EN VIVO» en la esquina de abajo.
 */
function HeroMark({ league, pro, live }: { league: Pick<League, 'id' | 'sport' | 'game' | 'logoPath'>; pro?: boolean; live?: boolean }) {
  const sport = leagueSport(league);
  const Icon = sportMeta(sport)?.icon ?? CircleHelp;
  const radius = pro ? 'rounded-2xl' : 'rounded-[18px]';
  const box = cx(pro ? 'size-12' : 'size-14', radius);
  const game = sport === 'esports' && isGameId(league.game) ? league.game : null;
  return (
    <span className={cx('relative inline-flex shrink-0', radius, live && 'ring-2 ring-danger ring-offset-2 ring-offset-surface')}>
      <LeagueLogo path={league.logoPath} className={box}>
        {game ? (
          <SportMark sport={sport} game={game} box={box} label={null} />
        ) : (
          <span
            aria-hidden="true"
            className={cx('grid shrink-0 place-items-center bg-accent text-accent-fg shadow-[0_8px_18px_-8px_var(--color-accent)]', box)}
          >
            <Icon className={pro ? 'size-6' : 'size-7'} />
          </span>
        )}
      </LeagueLogo>
      {live && <LivePill tiny className="pointer-events-none absolute -bottom-2 left-1/2 z-[2] -translate-x-1/2" />}
    </span>
  );
}

/** Un número chico de la tarjeta, con su ícono. */
function Stat({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted" />
      {children}
    </li>
  );
}

/** Lo próximo de la liga: la fecha y cuándo, qué y dónde (hoy, en el color del deporte). */
function NextBox({ block, pro }: { block: NonNullable<ReturnType<typeof nextBlock>>; pro?: boolean }) {
  return (
    <div className={cx('flex items-center gap-3 rounded-2xl', pro ? 'mt-3 p-2' : 'mt-4 p-2.5', block.today ? 'bg-accent-soft' : 'bg-surface-2')}>
      {block.date ? (
        <DateBlock date={block.date} raised />
      ) : (
        <span aria-hidden="true" className="grid h-[54px] w-[50px] shrink-0 place-items-center rounded-[15px] bg-surface text-accent">
          <Repeat className="size-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cx('block truncate font-semibold tracking-[-0.01em]', pro ? 'text-[15px]' : 'text-body', block.today && 'text-accent')}>
          <span className="sr-only">{block.date ? 'Próximo: ' : 'Juegan: '}</span>
          {block.when}
        </span>
        {block.what && <span className={cx('mt-0.5 block truncate text-muted', pro ? 'text-[13px]' : 'text-sm')}>{block.what}</span>}
      </span>
    </div>
  );
}

/**
 * Una de mis ligas en su tarjeta. `playerId`: mi jugador en la liga (boliche: mi lugar y mi promedio). `pending`: lo
 * que espera por mí si la organizo (Pro). Toda la tarjeta abre la liga.
 */
export function MyLeagueCard({
  league,
  live,
  next,
  today,
  role,
  playerId,
  pending = 0,
  pro,
  index = 0,
}: {
  league: League;
  live: boolean;
  next?: CalendarItem | null;
  today: string;
  role?: Member['role'];
  playerId?: string | null;
  pending?: number;
  pro?: boolean;
  index?: number;
}) {
  const sport = leagueSport(league);
  const tint = useTint(sport);
  const players = usePlayers(league.id);
  const { standing } = useMyStanding(sport === 'bowling' && playerId ? league.id : null, playerId ?? null);
  const kind = leagueKindLine(league);
  const block = nextBlock(next, league, today);
  const people = players.loading || !players.data.length ? null : countLabel(players.data.length, peopleWord(sport));
  const mine = standingBits(standing);
  const organizer = !!role && role !== 'member';
  const stats: ReactNode[] = [
    people && (
      <Stat key="people" icon={Users}>
        {people}
      </Stat>
    ),
    mine.pos && (
      <Stat key="pos" icon={Medal}>
        {mine.pos}
      </Stat>
    ),
    mine.average && (
      <Stat key="avg" icon={Target}>
        {mine.average}
      </Stat>
    ),
    pro && organizer && (
      <Stat key="role" icon={role === 'owner' ? Crown : ShieldCheck}>
        {roleLabel(role)}
      </Stat>
    ),
    pro && organizer && pending > 0 && (
      <Stat key="pending" icon={Hourglass}>
        {pending} por aprobar
      </Stat>
    ),
  ].filter(Boolean);
  return (
    <article
      style={{ '--i': index } as CSSProperties}
      className={cx('relative isolate overflow-hidden rounded-3xl bg-surface card-shadow transition', cardFocus, tint.className, pro ? 'p-4' : 'p-5')}
    >
      {tint.style}
      <Band sport={sport} tall={!pro} />
      <div className={cx('flex items-center', pro ? 'gap-3' : 'gap-3.5')}>
        <HeroMark league={league} pro={pro} live={live} />
        <div className="min-w-0 flex-1">
          <h3 className={cx('line-clamp-2 font-bold break-words', pro ? 'text-[17px] leading-[1.25] tracking-[-0.015em]' : 'text-[19px] leading-[1.2] tracking-[-0.02em]')}>
            <Link to={`/l/${league.id}`} className={stretched}>
              {league.name}
            </Link>
          </h3>
          <p className={cx('mt-0.5 truncate text-fg-2', pro ? 'text-[13px]' : 'text-sm')}>
            <span className="font-semibold text-accent">{kind.sport}</span> · {kind.rest}
          </p>
        </div>
      </div>
      {block && <NextBox block={block} pro={pro} />}
      {stats.length > 0 && (
        <ul className={cx('flex flex-wrap items-center gap-x-4 gap-y-1.5 text-fg-2', pro ? 'mt-3 text-[13px]' : 'mt-3.5 text-sm')}>
          {stats}
        </ul>
      )}
    </article>
  );
}

/** La forma de una tarjeta de liga mientras llegan los datos. */
export function LeagueCardSkeleton({ pro }: { pro?: boolean }) {
  return (
    <div aria-hidden="true" className={cx('card-shadow rounded-3xl bg-surface', pro ? 'p-4' : 'p-5')}>
      <div className={cx('flex items-center', pro ? 'gap-3' : 'gap-3.5')}>
        <Skeleton className={cx('shrink-0', pro ? 'size-12 rounded-2xl' : 'size-14 rounded-[18px]')} />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-3 w-2/5" />
        </div>
      </div>
      <Skeleton className={cx('rounded-2xl', pro ? 'mt-3 h-[70px]' : 'mt-4 h-[74px]')} />
      <div className={cx('flex gap-4', pro ? 'mt-3' : 'mt-3.5')}>
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3.5 w-16" />
      </div>
    </div>
  );
}

/** «Tus ligas» cargando: dos tarjetas con la forma de las de verdad. */
export function LeagueCardsSkeleton({ pro }: { pro?: boolean }) {
  return (
    <div role="status" aria-label="Cargando tus ligas" className={cx('grid', pro ? 'gap-3 sm:grid-cols-2' : 'gap-3.5')}>
      <LeagueCardSkeleton pro={pro} />
      <LeagueCardSkeleton pro={pro} />
    </div>
  );
}

/** ¿La línea ya dice el deporte («Torneo de boliche», «VALORANT»)? Así no se repite. */
const says = (line: RowLine, word: string) => rowLineText(line).toLowerCase().includes(word.toLowerCase());

/**
 * Un torneo en su tarjeta: el deporte con el trofeo (o su logo), «EN VIVO» o «Inscrito», el nombre y la línea
 * («Torneo de pádel · Sábado 24 oct · 6 inscritos»). Toda la tarjeta abre el torneo.
 */
export function TourneyCard({
  t,
  logoPath,
  live,
  entrants,
  today,
  showLeague,
  pro,
}: {
  t: TourneyItem;
  logoPath?: string | null;
  live: boolean;
  entrants?: number | null;
  today: string;
  showLeague?: boolean;
  pro?: boolean;
}) {
  const tint = useTint(t.sport);
  // «Inscrito» va en su insignia: la línea no lo repite (Pro decía «ya te inscribiste»).
  const opts = { today, live, entrants, showLeague, pro: false };
  const line = tourneyLine(t, opts);
  const label = sportLabel(t.sport, t.game);
  const shown: RowLine = says(line, label) ? line : { lead: line.lead, rest: [label, line.rest].filter(Boolean).join(' · ') };
  const box = pro ? 'size-10 rounded-xl' : 'size-12 rounded-[15px]';
  return (
    <article className={cx('relative isolate flex h-full flex-col overflow-hidden rounded-3xl bg-surface card-shadow transition', cardFocus, tint.className, pro ? 'p-4' : 'p-[18px]')}>
      {tint.style}
      <Band sport={t.sport} />
      <div className="flex items-start justify-between gap-2">
        <LeagueLogo path={t.standalone ? logoPath : null} className={box}>
          <SportMark sport={t.sport} game={t.game} size={pro ? 'md' : 'lg'} torneo label={null} />
        </LeagueLogo>
        {live ? (
          <LivePill />
        ) : t.going ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-accent">
            <Check aria-hidden="true" className="size-3.5" strokeWidth={2.6} />
            Inscrito
          </span>
        ) : null}
      </div>
      <h3 className={cx('mt-3 line-clamp-2 font-semibold break-words', pro ? 'text-[15px] leading-[1.3]' : 'text-[17px] leading-[1.25] tracking-[-0.01em]')}>
        <Link to={t.href} className={stretched}>
          {t.name}
        </Link>
      </h3>
      <p className={cx('mt-1 text-muted', pro ? 'text-[13px]' : 'text-sm')}>
        <LineText line={shown} />
      </p>
    </article>
  );
}

/**
 * Los torneos: en el teléfono se deslizan de lado (cada tarjeta se detiene en el borde); desde 640 px, en dos columnas.
 * Uno solo ocupa todo el ancho.
 */
export function TourneyStrip({ children, pro }: { children: ReactNode[]; pro?: boolean }) {
  if (children.length === 1) return <div>{children[0]}</div>;
  return (
    <ul
      role="list"
      className="no-scrollbar -mx-6 -my-2 flex snap-x snap-mandatory scroll-px-6 gap-3 overflow-x-auto px-6 py-2 sm:mx-0 sm:my-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:py-0"
    >
      {children.map((c, i) => (
        <li key={i} className={cx('shrink-0 snap-start sm:w-auto', pro ? 'w-[232px]' : 'w-[264px]')}>
          {c}
        </li>
      ))}
    </ul>
  );
}

/** Mis equipos, cada uno en su color (o el de su deporte): logo, «Nombre [TAG]» y «Fútbol · 12 miembros · Capitán». */
export function SquadCards({ squads, pro }: { squads: readonly MySquad[]; pro?: boolean }) {
  return (
    <ul role="list" className={cx('grid sm:grid-cols-2', pro ? 'gap-2' : 'gap-2.5')}>
      {squads.map((s) => (
        <li key={s.id}>
          <SquadTint color={s.color} sport={s.sport}>
            <div className={cx('relative flex items-center gap-3 rounded-2xl bg-accent-soft transition', cardFocus, pro ? 'p-2.5 pr-3' : 'p-3 pr-3.5')}>
              <SquadLogo squad={s} />
              <span className="min-w-0 flex-1">
                <Link to={squadPath(s.id)} className={cx(stretched, 'block truncate font-semibold tracking-[-0.01em]', pro ? 'text-[15px]' : 'text-body')}>
                  {squadTitle(s)}
                </Link>
                <span className={cx('block truncate text-fg-2', pro ? 'text-[13px]' : 'text-sm')}>{mySquadLine(s)}</span>
              </span>
              <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-accent" />
            </div>
          </SquadTint>
        </li>
      ))}
    </ul>
  );
}

/** El resumen de arriba: «3 ligas · 1 en vivo · Próximo: hoy 7:30 pm» (lo en vivo en rojo y lo próximo en color). */
export function LigasSummary({ parts, className }: { parts: readonly SummaryPart[]; className?: string }) {
  if (!parts.length) return null;
  return (
    <p className={cx('flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-meta text-fg-2', className)}>
      {parts.map((p, i) => (
        <Fragment key={p.key}>
          {i > 0 && <span className="text-faint">·</span>}
          <span
            className={cx(
              'inline-flex items-center gap-1.5 whitespace-nowrap',
              p.key === 'live' && 'font-semibold text-danger',
              p.key === 'next' && 'font-medium text-accent',
            )}
          >
            {p.key === 'live' && <LiveDot />}
            {p.text}
          </span>
        </Fragment>
      ))}
    </p>
  );
}
