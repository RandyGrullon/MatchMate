import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { BarChart3, Check, ChevronRight, ClipboardList, FileSpreadsheet, List, PencilLine, Send, UserRound, Users, type LucideIcon } from 'lucide-react';
import type { CalendarItem } from '../../../lib/calendar';
import { useLeagueCtx } from '../../../lib/league';
import type { LiveGame } from '../../../lib/live';
import { countLabel } from '../../../lib/organize';
import type { BowlingEvent } from '../../../lib/types';
import { nextGameLabel, useNextGame, type NextGame } from '../../../lib/useNextGame';
import { leagueSport } from '../../../sports/registry';
import { SportIcon } from '../../../pages/sports/SportBits';
import { initials } from '../../Avatar';
import { LeagueLogo } from '../../home/LeagueCard';
import { canRsvp } from '../../home/UpNext';
import { RsvpButton, useRsvp } from '../../home/RsvpButton';
import { ActionLink, LiveDot, useLiveTable } from '../../home/TodayCard';
import { todayTitle } from '../../home/logic';
import { Card, DateBlock, ListRow, RowIcon, SectionHeader, Skeleton, cx, sectionLinkClass } from '../../ui';
import { dateLine, leagueLine, nowLine, type TopRow } from './logic';

// ---------- Encabezado: el ícono de la liga, su nombre completo y cuándo y dónde juegan ----------

/** «(ícono) Liga de los martes / Martes 7:30 pm · Bolera Sambil»: el nombre nunca se corta (es el título). */
export function LeagueIdent({ className }: { className?: string }) {
  const { league } = useLeagueCtx();
  const line = leagueLine(league);
  const sport = leagueSport(league);
  return (
    <div className={cx('flex items-center gap-3.5', className)}>
      <LeagueLogo path={league.logoPath} className="size-14 rounded-[18px]">
        <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-[18px] bg-accent-soft text-accent">
          <SportIcon sport={sport} className="size-7" />
        </span>
      </LeagueLogo>
      <div className="min-w-0 flex-1">
        <h1 className="text-title-pro break-words">{league.name}</h1>
        {line && <p className="mt-[3px] text-[14.5px] leading-snug text-muted">{line}</p>}
      </div>
    </div>
  );
}

// ---------- «En juego ahora» ----------

/** Ícono del botón según lo que hace (el mismo de Hoy). */
const NEXT_ICON: Record<NextGame['kind'], LucideIcon> = {
  medias: PencilLine,
  anotar: PencilLine,
  enviar: Send,
  ver: Check,
  preparar: UserRound,
  planilla: FileSpreadsheet,
};

/**
 * La práctica (o el torneo) que se juega ahora en la liga, una sola vez: «En juego ahora · 6 jugando», el nombre (abre la
 * práctica: cómo van todos), lo tuyo en una línea («Llevas 187 y 210 · el juego 3 va a medias») y UN botón con la misma
 * lógica que Hoy (useNextGame: «Seguir mi juego 3» abre la hoja de anotar en ese juego, 1 toque). Quien mira la liga sin
 * ser miembro ve la tarjeta sin el botón.
 */
export function NowCard({ game, today, member }: { game: LiveGame; today: string; member: boolean }) {
  const { event, info, feed } = game;
  const mine = useNextGame(member ? game : null, today);
  const table = useLiveTable(game);
  const n = table.rows.length;
  const title = todayTitle(event, today);
  const when = info.startsSoon && info.startLabel ? `Empieza a las ${info.startLabel}` : 'En juego ahora';
  const line = mine && !mine.loading ? nowLine(mine.cells, mine.next) : member ? null : 'Mira cómo van todos';
  return (
    <Card soft className="pt-[18px] pr-[18px] pb-[18px] pl-5">
      <section aria-label={`${title}: ${when}`}>
        <div className="flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-accent">
            <LiveDot />
            <span className="truncate">{when}</span>
          </p>
          {n > 0 && <span className="shrink-0 text-sm font-[550] text-fg-2">{n} jugando</span>}
        </div>
        <Link
          to={`/l/${feed.lid}/e/${event.id}`}
          aria-label={`${title}: cómo van todos`}
          className="mt-2 block rounded-xl transition active:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="flex items-center justify-between gap-3">
            <b className="min-w-0 truncate text-[21px] leading-[1.4] font-bold tracking-[-0.02em]">{title}</b>
            <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-accent" />
          </span>
          {line ? (
            <span className="mt-[3px] block text-[14.5px] leading-[1.4] text-fg-2">{line}</span>
          ) : (
            <Skeleton className="mt-1.5 h-4 w-3/4 rounded-md" />
          )}
        </Link>
        {member &&
          (mine ? (
            <ActionLink to={mine.next.to} icon={NEXT_ICON[mine.next.kind]} className="mt-4 w-full">
              {nextGameLabel(mine.next)}
            </ActionLink>
          ) : (
            <Skeleton className="mt-4 h-btn rounded-btn" />
          ))}
      </section>
    </Card>
  );
}

// ---------- Tabla: los 3 de arriba ----------

/** El círculo con las iniciales (el tuyo en el color del deporte). */
function Initials({ name, me }: { name: string; me: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx('grid size-10 shrink-0 place-items-center rounded-full text-sm font-[650]', me ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-2')}
    >
      {initials(name)}
    </span>
  );
}

/** «Tú» en tu fila. */
export function MeTag() {
  return <span className="ml-1.5 inline-flex h-[22px] items-center rounded-full bg-surface px-2 align-[2px] text-xs font-[650] text-accent">Tú</span>;
}

/**
 * «Tabla · Ver toda»: los 3 de arriba por promedio (tu fila resaltada con «Tú»; si vas más abajo, tu fila en el
 * tercer lugar). Cada fila abre la página del jugador; «Ver toda», la Tabla.
 */
export function TableTop({ rows, loading, className }: { rows: readonly TopRow[]; loading: boolean; className?: string }) {
  const { base } = useLeagueCtx();
  return (
    <section aria-labelledby="liga-tabla" className={className}>
      <SectionHeader
        id="liga-tabla"
        title="Tabla"
        action={
          <Link to={`${base}/ranking`} className={sectionLinkClass}>
            Ver toda
          </Link>
        }
      />
      {loading && !rows.length ? (
        <Skeleton className="h-48 rounded-3xl" />
      ) : rows.length ? (
        <Card className="overflow-hidden">
          {rows.map(({ pos, row, me }) => (
            <ListRow
              key={row.playerId}
              me={me}
              leading={
                <>
                  <span className="num w-[18px] shrink-0 text-center text-[15px] font-semibold tracking-normal text-muted">{pos}</span>
                  <Initials name={row.name} me={me} />
                </>
              }
              title={
                <>
                  {row.name}
                  {me && <MeTag />}
                </>
              }
              value={row.average}
              to={`${base}/j/${row.playerId}`}
              ariaLabel={`${pos}.º ${row.name}${me ? ' (tú)' : ''}: promedio ${row.average}`}
              chevron={false}
            />
          ))}
        </Card>
      ) : (
        <p className="mx-1 text-meta text-muted">La tabla sale cuando alguien tenga sus juegos aprobados de la temporada.</p>
      )}
    </section>
  );
}

// ---------- Próximas fechas ----------

/**
 * «Próximas fechas · Calendario»: la próxima práctica con «Voy» en línea y los torneos que vienen (OCT / 24, «Sábado ·
 * torneo · 6 inscritos»). «Calendario» abre la semana completa.
 */
export function NextDates({
  items,
  events,
  today,
  onCalendar,
  className,
}: {
  items: readonly CalendarItem[];
  events: readonly BowlingEvent[];
  today: string;
  onCalendar: () => void;
  className?: string;
}) {
  const { lid } = useLeagueCtx();
  const rsvp = useRsvp();
  const signedUp = (it: CalendarItem) => events.find((e) => e.id === it.eventId)?.playerCount ?? null;
  return (
    <section aria-labelledby="liga-fechas" className={className}>
      <SectionHeader
        id="liga-fechas"
        title="Próximas fechas"
        action={
          <button type="button" onClick={onCalendar} className={sectionLinkClass} aria-haspopup="dialog">
            Calendario
          </button>
        }
      />
      {items.length ? (
        <Card className="overflow-hidden">
          {items.map((it) => {
            const line = dateLine(it, today, it.type === 'torneo' ? signedUp(it) : null);
            // Una práctica del horario que el admin todavía no creó no tiene pantalla propia.
            const to = it.href !== `/l/${lid}` ? it.href : undefined;
            return (
              <ListRow
                key={it.key}
                leading={<DateBlock date={it.date} />}
                title={it.name}
                subtitle={line}
                to={to}
                ariaLabel={`${it.name}, ${line}`}
                trailing={canRsvp(it) ? <RsvpButton going={it.going} onToggle={(going) => rsvp(it.lid, it.eventId!, it.playerId!, going)} /> : undefined}
              />
            );
          })}
        </Card>
      ) : (
        <p className="mx-1 text-meta text-muted">Nada más en los próximos 30 días.</p>
      )}
    </section>
  );
}

// ---------- Filas de abajo ----------

/** Una fila de la lista de abajo de la liga. */
export interface LeagueRowDef {
  key: string;
  icon: ReactNode;
  title: ReactNode;
  subtitle?: string | null;
  to?: string;
  onClick?: () => void;
  /** Número a la derecha (lo que espera en Organizar). */
  count?: number;
  accent?: boolean;
}

/**
 * La lista de abajo: Jugadores, Resultados anteriores, Mis números (y en Pro, «Organizas esta liga»). `children`: filas
 * que traen su propio comportamiento (el buzón de sugerencias, SuggestionBox `row`), al final de la misma tarjeta.
 */
export function LeagueRows({ rows, className, children }: { rows: readonly LeagueRowDef[]; className?: string; children?: ReactNode }) {
  if (!rows.length && !children) return null;
  return (
    <Card className={cx('overflow-hidden', className)}>
      {rows.map((r) => (
        <ListRow
          key={r.key}
          leading={<RowIcon tone={r.accent ? 'accent' : 'neutral'}>{r.icon}</RowIcon>}
          title={r.title}
          subtitle={r.subtitle || undefined}
          to={r.to}
          onClick={r.onClick}
          chevron
          trailing={
            r.count ? (
              <span
                aria-label={`${r.count} ${r.count === 1 ? 'pendiente' : 'pendientes'}`}
                className="grid h-[26px] min-w-[26px] place-items-center rounded-full bg-accent px-2 text-[13px] font-bold text-accent-fg"
              >
                {countLabel(r.count)}
              </span>
            ) : undefined
          }
        />
      ))}
      {children}
    </Card>
  );
}

/** Los íconos de las filas (los del diseño: personas, lista, barras y la tabla de Organizar). */
export const ROW_ICONS = {
  players: <Users className="size-5" />,
  results: <List className="size-5" />,
  numbers: <BarChart3 className="size-5" />,
  organize: <ClipboardList className="size-5" />,
};
