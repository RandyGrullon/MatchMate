import { lazy, Suspense, useState, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { CalendarClock, ChevronLeft, ChevronRight, Trophy } from 'lucide-react';
import { hasResult, type Match } from '../../../lib/data/matches';
import { rsvpSummary, setMatchRsvp, useMatchRsvps, type RsvpStatus } from '../../../lib/data/teamSports';
import type { SeasonTeam } from '../../../lib/data/seasonTeams';
import type { Side } from '../../../sports/types';
import { dayKey, roundLabel, scoreColumns, statusInfo } from '../../../components/match/format';
import { BusyIcon } from '../../../components/busy';
import { useAction } from '../../../components/feedback';
import { LiveDot } from '../../../components/home/TodayCard';
import { LeagueBackBar } from '../../../components/league/home/LeagueTopBar';
import { ShareButton } from '../../../components/share';
import { Card, DateBlock, ListRow, RowIcon, SectionHeader, Sheet, Skeleton, cx, sectionLinkClass } from '../../../components/ui';
import { rosterOf, rosterSide, teamColor, textOn } from './logic';
import { RsvpButtons, TeamDot } from './TeamBits';
import type { TeamLeague } from './useTeamLeague';
import { matchWhen, resultLine, rowWhen, rsvpLine, scoreShort, todayIn } from './view';

/**
 * Piezas del rediseño «Calma y foco» para las pantallas de equipos (baloncesto, fútbol y sala), con las de
 * src/components/ui.tsx: el título de cada pantalla, el escudo de un equipo (su color con la inicial), «Tu próximo
 * partido» con Voy / Tal vez / No voy en línea, los partidos como filas con su fecha («OCT / 10») y lo de arriba de la
 * tabla. Lo que no es de React (los textos) está en ./view.ts.
 */

/** El link de un partido (el push de «resultado por confirmar» trae `?partido=`). */
export const matchLink = (base: string, id: string) => `${base}/juegos?partido=${id}`;

/** Los nombres de los dos lados (el equipo de ahora; si se borró, el que se copió en el partido). */
export function sideNames(tl: Pick<TeamLeague, 'teamOf'>, m: Pick<Match, 'sides'>): [string, string] {
  return [tl.teamOf(m.sides[0].teamId)?.name ?? (m.sides[0].label || 'Por definir'), tl.teamOf(m.sides[1].teamId)?.name ?? (m.sides[1].label || 'Por definir')];
}

/**
 * Título de una pantalla de la liga (debajo de «‹ Liga de los martes»): 32 px en Lite y 28 en Pro, con lo de la derecha
 * (`action`: una píldora «Anotadores ▾») y una línea debajo (`sub`).
 */
export function ScreenTitle({ title, sub, action, pro, className }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; pro?: boolean; className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <h1 className={cx('min-w-0 break-words', pro ? 'mt-0.5 text-title-pro' : 'mt-1 text-title')}>{title}</h1>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {sub && <p className={cx('text-meta text-muted', pro ? 'mt-1' : 'mt-1.5')}>{sub}</p>}
    </div>
  );
}

/** El escudo de un equipo: su color con la inicial (40 px; `size` en px). */
export function TeamCrest({ team, label, size = 40, className }: { team?: Pick<SeasonTeam, 'color' | 'order' | 'name'> | null; label?: string; size?: number; className?: string }) {
  const color = teamColor(team);
  const name = team?.name ?? label ?? '';
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      aria-hidden="true"
      className={cx('grid shrink-0 place-items-center rounded-full font-[650] ring-1 ring-line', className)}
      style={{ width: size, height: size, background: color, color: textOn(color), fontSize: Math.round(size * 0.4) }}
    >
      {initial}
    </span>
  );
}

const TAG_CSS =
  '.mm-tu{background:var(--surface)}' +
  '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .mm-tu{background:color-mix(in srgb,var(--accent) 18%,transparent)}}' +
  ':root[data-theme="dark"] .mm-tu{background:color-mix(in srgb,var(--accent) 18%,transparent)}';

/** «Tu equipo» en su fila (blanca sobre el acento suave; en oscuro, acento translúcido), como «Tú» de la Tabla. */
export function MineTag({ children = 'Tu equipo' }: { children?: ReactNode }) {
  return (
    <>
      <style href="mm-tabla-tu" precedence="default">
        {TAG_CSS}
      </style>
      <span className="mm-tu ml-1.5 inline-flex h-[22px] items-center rounded-full px-2 align-[2px] text-xs font-[650] text-accent">{children}</span>
    </>
  );
}

/** «● Tigres vs. ● Leones» con el color de cada equipo. */
export function VsTitle({ tl, match: m, className }: { tl: Pick<TeamLeague, 'teamOf'>; match: Pick<Match, 'sides'>; className?: string }) {
  const names = sideNames(tl, m);
  return (
    <span className={cx('inline-flex min-w-0 flex-wrap items-center gap-x-1.5', className)}>
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <TeamDot team={tl.teamOf(m.sides[0].teamId)} className="size-2.5" />
        <span className="min-w-0 truncate">{names[0]}</span>
      </span>
      <span className="font-normal text-muted">vs.</span>
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <TeamDot team={tl.teamOf(m.sides[1].teamId)} className="size-2.5" />
        <span className="min-w-0 truncate">{names[1]}</span>
      </span>
    </span>
  );
}

const editableRsvp = (m: Pick<Match, 'status'>) => m.status === 'scheduled' || m.status === 'postponed' || m.status === 'live' || m.status === 'suspended';

/**
 * «Tu próximo partido» (en acento suave, como «En juego ahora» de la Liga): el día y la hora, «● Tigres vs. ● Leones»
 * (abre el partido), dónde y qué jornada, y tu convocatoria en línea (Voy / Tal vez / No voy, un toque, por la cola sin
 * señal) con cómo va tu equipo («3 van · faltan 2»). `alert`: una línea en rojo (estás suspendido).
 */
export function NextMatchCard({
  tl,
  match: m,
  minPlayers,
  alert,
  label = 'Tu próximo partido',
  roundWord = 'Jornada',
  className,
}: {
  tl: TeamLeague;
  match: Match;
  minPlayers: number;
  alert?: ReactNode;
  label?: string;
  roundWord?: string;
  className?: string;
}) {
  const rsvps = useMatchRsvps(tl.lid, [m.id]);
  const run = useAction();
  const teams = tl.allTeams.data;
  const mySide = rosterSide(m, teams, tl.myPlayerId);
  const today = todayIn(tl.tz);
  const mine = tl.myPlayerId ? rsvps.data.find((r) => r.matchId === m.id && r.playerId === tl.myPlayerId) : undefined;
  const roster = mySide ? rosterOf(teams, m.sides[mySide - 1].teamId).map((r) => r.playerId) : [];
  const sum = mySide ? rsvpSummary(rsvps.data, m.id, mySide, roster) : null;
  const where = [m.court, m.stage || (m.round != null ? `${roundWord} ${m.round}` : '')].filter(Boolean).join(' · ');
  const set = (status: RsvpStatus | null) =>
    mySide && tl.myPlayerId ? run(() => setMatchRsvp(tl.lid, m.id, tl.myPlayerId!, mySide, status), status ? undefined : 'Convocatoria quitada') : undefined;
  return (
    <Card soft className={cx('pt-[18px] pr-[18px] pb-[18px] pl-5', className)}>
      <section aria-label={label}>
        <div className="flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-accent">
            {(m.status === 'live' || m.status === 'suspended') && <LiveDot />}
            <span className="truncate">{m.status === 'live' ? 'Se está jugando' : label}</span>
          </p>
          <span className="shrink-0 text-sm font-[550] text-fg-2">{matchWhen(m.scheduledAt, tl.tz, today)}</span>
        </div>
        <Link
          to={matchLink(tl.base, m.id)}
          className="mt-2 block rounded-xl transition active:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="flex items-center justify-between gap-3">
            <VsTitle tl={tl} match={m} className="text-[21px] leading-[1.35] font-bold tracking-[-0.02em]" />
            <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-accent" />
          </span>
          {where && <span className="mt-[3px] block text-[14.5px] leading-[1.4] text-fg-2">{where}</span>}
        </Link>
        {alert && <div className="mt-3 text-sm font-semibold text-danger">{alert}</div>}
        {mySide && tl.myPlayerId && editableRsvp(m) && (
          <div className="mt-4">
            {rsvps.loading && !rsvps.data.length ? <Skeleton className="h-11 rounded-[14px]" /> : <RsvpButtons raised value={mine?.status} onChange={set} label="Mi convocatoria" />}
            {sum && <p className="mt-2.5 text-[13.5px] text-fg-2">{`Tu equipo: ${rsvpLine(sum, minPlayers)}`}</p>}
          </div>
        )}
      </section>
    </Card>
  );
}

/**
 * Un partido como fila (dentro de una `<Card className="overflow-hidden">`): el bloque de la fecha («OCT / 10»), «Tigres
 * vs. Leones» y debajo cuándo y qué jornada; con resultado, qué pasó («Ganó Tigres») y el marcador al final («72–65»).
 * En vivo, «● En vivo». La fila de tu equipo va en acento suave.
 */
export function MatchRow({
  tl,
  match: m,
  now = Date.now(),
  roundWord = 'Jornada',
  court,
  round = true,
  mine,
}: {
  tl: TeamLeague;
  match: Match;
  now?: number;
  roundWord?: string;
  /** La cancha en la línea de abajo. */
  court?: boolean;
  /** La jornada en la línea de abajo (no, si la lista ya va por jornada). */
  round?: boolean;
  /** Es de mi equipo (por defecto: lo dice la plantilla). */
  mine?: boolean;
}) {
  const today = todayIn(tl.tz, now);
  const names = sideNames(tl, m);
  const day = dayKey(m.scheduledAt, tl.tz);
  const live = m.status === 'live' || m.status === 'suspended';
  const result = hasResult(m) || m.status === 'void' ? resultLine(m, names, now) : null;
  const me = mine ?? rosterSide(m, tl.allTeams.data, tl.myPlayerId) !== null;
  const meta = rowWhen(m, tl.tz, today, roundWord, court, round);
  const subtitle = live ? (
    <span className="inline-flex items-center gap-1.5 font-semibold text-accent">
      <LiveDot />
      {m.status === 'suspended' ? 'Suspendido' : 'En vivo'}
    </span>
  ) : result ? (
    <>
      <span className={cx(m.status === 'disputed' ? 'text-danger' : result.includes('por confirmar') && 'text-warn')}>{result}</span>
      {round && (m.stage || m.round != null) && ` · ${m.stage || roundLabel(m.round, roundWord)}`}
    </>
  ) : (
    meta
  );
  return (
    <ListRow
      me={me}
      leading={day ? <DateBlock date={day} raised={me} /> : <RowIcon className="h-[54px] w-[50px] rounded-[15px]"><CalendarClock className="size-5" /></RowIcon>}
      title={<VsTitle tl={tl} match={m} />}
      subtitle={subtitle}
      value={hasResult(m) || live ? (scoreShort(m) ?? undefined) : undefined}
      to={matchLink(tl.base, m.id)}
      ariaLabel={`${names[0]} contra ${names[1]}${result ? `: ${result}` : ''}`}
      chevron={!(hasResult(m) || live)}
    />
  );
}

/**
 * Lista de partidos como filas en una tarjeta. `highlight={false}`: sin resaltar los de tu equipo (cuando todos son
 * tuyos, resaltarlos no dice nada).
 */
export function MatchRows({
  tl,
  matches,
  now,
  roundWord,
  court,
  round,
  highlight = true,
}: {
  tl: TeamLeague;
  matches: readonly Match[];
  now?: number;
  roundWord?: string;
  court?: boolean;
  round?: boolean;
  highlight?: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      {matches.map((m) => (
        <MatchRow key={m.id} tl={tl} match={m} now={now} roundWord={roundWord} court={court} round={round} mine={highlight ? undefined : false} />
      ))}
    </Card>
  );
}

/** Link de la derecha de un título de sección («Ver toda», «Ver todos»). */
export function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={sectionLinkClass}>
      {children}
    </Link>
  );
}

/** Una fila de la tabla de equipos (puesto, escudo, nombre, marca y puntos). */
export interface TableTopRow {
  id: string;
  rank: number;
  points: number;
  line: string;
}

/**
 * «Tabla · Ver toda»: los primeros equipos con su marca y sus puntos (tu equipo resaltado con «Tu equipo»). Cada fila
 * abre la tabla completa.
 */
export function TableTop({ tl, rows, title = 'Tabla', mine, footer, className }: { tl: TeamLeague; rows: readonly TableTopRow[]; title?: string; mine: readonly string[]; footer?: ReactNode; className?: string }) {
  if (!rows.length) return null;
  return (
    <section aria-labelledby="equipos-tabla" className={className}>
      <SectionHeader id="equipos-tabla" title={title} action={<SectionLink to={`${tl.base}/ranking`}>Ver toda</SectionLink>} />
      <Card className="overflow-hidden">
        {rows.map((r) => {
          const team = tl.teamOf(r.id);
          const me = mine.includes(r.id);
          return (
            <ListRow
              key={r.id}
              me={me}
              leading={
                <>
                  <span className="num w-[18px] shrink-0 text-center text-[15px] font-semibold tracking-normal text-muted">{r.rank}</span>
                  <TeamCrest team={team} label="Equipo" />
                </>
              }
              title={
                <>
                  {team?.name ?? '(equipo borrado)'}
                  {me && <MineTag />}
                </>
              }
              subtitle={r.line}
              value={r.points}
              to={`${tl.base}/ranking`}
              ariaLabel={`${r.rank}.º ${team?.name ?? 'equipo'}: ${r.points} puntos`}
              chevron={false}
            />
          );
        })}
      </Card>
      {footer && <p className="mx-1 mt-2.5 text-meta text-muted">{footer}</p>}
    </section>
  );
}

/** Un número de «Mis números». */
export interface StatItem {
  label: string;
  value: ReactNode;
}

/**
 * Los números de un jugador en una tarjeta: de 2 en 2 con el número de 40 px (Lite) o de 4 en 4 más chicos (Pro,
 * `dense`), y qué es debajo.
 */
export function StatTiles({ items, dense, className }: { items: readonly StatItem[]; dense?: boolean; className?: string }) {
  const cols = dense ? 4 : 2;
  return (
    <Card className={cx('grid overflow-hidden', dense ? 'grid-cols-4' : 'grid-cols-2', className)}>
      {items.map((it, i) => (
        <div
          key={it.label}
          className={cx(
            'min-w-0',
            dense ? 'px-3 py-3.5 min-[390px]:px-3.5' : 'px-4 py-4 min-[390px]:px-5',
            // Las líneas entre los números: a la izquierda (menos la primera de cada fila) y arriba (menos la primera fila).
            i % cols !== 0 && 'border-l border-line',
            i >= cols && 'border-t border-line',
          )}
        >
          <b className={cx('num block', dense ? 'text-[24px] leading-none font-[650]' : 'text-stat')}>{it.value}</b>
          <span className={cx('mt-1.5 block truncate text-muted', dense ? 'text-[12.5px]' : 'text-sm')}>{it.label}</span>
        </div>
      ))}
    </Card>
  );
}

/**
 * La barra de una pantalla con su propio atrás (la página de un jugador, `/j/…`): «‹ Liga de los martes» vuelve a donde
 * estaba o, si se entró por un link, a `fallback`; a la derecha, lo de la pantalla.
 */
export function HistoryBackBar({ label, fallback, right }: { label: string; fallback: string; right?: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  return <BackBar label={label} onBack={() => (location.key !== 'default' ? navigate(-1) : navigate(fallback, { replace: true }))} right={right} />;
}

// ---------- La pantalla de un partido ----------

/**
 * Quita la barra «‹ Liga» que pone LeagueShell en las pantallas de adentro, para poner otra que vuelve a donde estaba
 * (un partido abierto desde la lista vuelve a «‹ Partidos»). Es la misma barra de la liga, escondida: nunca salen dos.
 */
export function HideShellBar() {
  return <LeagueBackBar className="hidden" />;
}

/**
 * La barra de una pantalla que se abre encima de otra (un partido): «‹ Partidos» vuelve con `onBack`; a la derecha, lo
 * de esa pantalla («•••»). Igual que la del evento (EventTopBar).
 */
export function BackBar({ label, onBack, right }: { label: string; onBack: () => void; right?: ReactNode }) {
  return (
    <div className="-mt-3 flex h-[52px] items-center justify-between gap-2">
      <button
        type="button"
        onClick={onBack}
        className="-ml-3 inline-flex h-11 min-w-0 items-center pr-2 pl-1 text-body font-[550] text-accent transition active:opacity-70 focus-visible:outline-2 focus-visible:outline-accent"
      >
        <ChevronLeft aria-hidden="true" className="size-6 shrink-0" />
        <span className="truncate">{label}</span>
      </button>
      <div className="-mr-2 flex shrink-0 items-center gap-2">{right}</div>
    </div>
  );
}

/** El título de la pantalla de un partido: «Jornada 3», la fase («Final», «Amistoso») o «Partido». */
export const matchHeading = (m: Pick<Match, 'stage' | 'round'>, roundWord = 'Jornada') => m.stage || roundLabel(m.round, roundWord) || 'Partido';

/**
 * El estado de un partido en una línea (un solo color): «● En vivo» en el del deporte, «● Por confirmar» en ámbar (lo
 * único que espera por alguien), «En disputa» en rojo y lo demás («Final», «Programado», «Aplazado») en gris.
 */
export function StatusText({ match: m, now = Date.now(), className }: { match: Pick<Match, 'status' | 'proposedAt'>; now?: number; className?: string }) {
  const s = statusInfo(m, now);
  const dot = s.live || s.tone === 'warn';
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-2 font-semibold whitespace-nowrap',
        s.live ? 'text-accent' : s.tone === 'warn' ? 'text-warn' : s.tone === 'danger' ? 'text-danger' : 'text-fg-2',
        className,
      )}
    >
      {dot && (s.live ? <LiveDot /> : <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-warn" />)}
      {s.label}
    </span>
  );
}

/**
 * Arriba de la pantalla de un partido (como la de un partido de raqueta): «‹ Partidos» con «•••» (`menu`), el título
 * («Jornada 3») y una línea con el estado, el día y la hora y la cancha.
 */
export function MatchHead({ tl, match: m, onBack, menu, pro, backLabel = 'Partidos' }: { tl: TeamLeague; match: Match; onBack: () => void; menu?: ReactNode; pro: boolean; backLabel?: string }) {
  const today = todayIn(tl.tz);
  return (
    <>
      <HideShellBar />
      <BackBar label={backLabel} onBack={onBack} right={menu} />
      <h1 className={pro ? 'mt-0.5 text-title-pro' : 'mt-1 text-title'}>{matchHeading(m)}</h1>
      <p className={cx('flex min-w-0 flex-wrap items-center gap-x-1.5 text-meta text-muted', pro ? 'mt-1' : 'mt-1.5')}>
        <StatusText match={m} />
        <span aria-hidden="true">·</span>
        <span>{matchWhen(m.scheduledAt, tl.tz, today)}</span>
        {m.court && (
          <>
            <span aria-hidden="true">·</span>
            <span className="min-w-0">{m.court}</span>
          </>
        )}
      </p>
    </>
  );
}

/**
 * El marcador grande del partido: los dos equipos con su escudo y su marcador en números de 34 px; el ganador en
 * negrita con copa, el que no vino con «No vino» y el tuyo con «Tu equipo». Sin jugar todavía, «–».
 */
export function Scoreboard({ tl, match: m, mySide, className }: { tl: TeamLeague; match: Match; mySide: Side | null; className?: string }) {
  // El número grande (los goles o los puntos; los penales del fútbol van aparte).
  const sides = m.score?.sides;
  const total = Array.isArray(sides) && sides.length === 2 ? { a: sides[0], b: sides[1] } : (scoreColumns(m.score)[0] ?? null);
  const walkover = m.status === 'walkover';
  const names = sideNames(tl, m);
  return (
    <Card className={cx('px-[18px] py-2', className)}>
      {m.sides.map((s, i) => {
        const won = m.winner === s.side;
        const mine = mySide === s.side;
        const absent = walkover && (m.walkoverSide === s.side || m.walkoverSide === 0);
        const v = total ? (i === 0 ? total.a : total.b) : null;
        const other = total ? (i === 0 ? total.b : total.a) : null;
        return (
          <div key={s.side} className={cx('flex min-h-[68px] items-center gap-3', i > 0 && 'border-t border-line')}>
            <TeamCrest team={tl.teamOf(s.teamId)} label={names[i]} />
            <span className="min-w-0 flex-1">
              <span className={cx('flex min-w-0 flex-wrap items-center gap-y-1 text-[17px]', won ? 'font-bold' : m.winner ? 'font-medium text-muted' : 'font-semibold')}>
                <span className="min-w-0 truncate">{names[i]}</span>
                {mine && <MineTag />}
              </span>
              {absent && <span className="block text-[13px] text-muted">No vino</span>}
            </span>
            {won && <Trophy className="size-5 shrink-0 text-gold" aria-label="Ganó" />}
            <span
              className={cx(
                'num w-14 shrink-0 text-right text-[34px] leading-none',
                v == null ? 'font-medium text-faint' : v >= (other ?? 0) ? 'font-bold text-fg' : 'font-medium text-faint',
              )}
            >
              {v ?? '–'}
            </span>
          </div>
        );
      })}
    </Card>
  );
}

// ---------- La Tabla ----------

/**
 * Debajo de la tabla: la regla en una línea («Ganar 2 · perder 1 · desempate FIBA») y «Cómo se cuenta», que abre una
 * hoja con todo (puntos, desempates, forfeit). Nunca un párrafo de 3 líneas en la pantalla.
 */
export function HowItCounts({ line, title = 'Cómo se cuenta', children, className }: { line: ReactNode; title?: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cx('mx-1 flex flex-wrap items-baseline justify-between gap-x-3 text-meta text-muted', className)}>
      <span className="min-w-0">{line}</span>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={sectionLinkClass}>
        {title}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <div className="flex flex-col gap-3 pb-1 text-body text-fg-2">{children}</div>
      </Sheet>
    </div>
  );
}

/** Compartir como imagen (redondo y gris, como el de la Tabla del boliche), para la barra de arriba. */
export function ShareIcon({ card, label }: { card: Parameters<typeof ShareButton>[0]['card']; label: string }) {
  return (
    <ShareButton
      variant="ghost"
      size="md"
      iconOnly
      label={label}
      card={card}
      className="relative rounded-full! bg-surface-2 text-fg-2 after:absolute after:-inset-0.5 after:content-['']"
    />
  );
}

// ---------- Las hojas de «•••» (se bajan al tocarlas) ----------

const ScorersSheetLazy = lazy(() => import('../../../components/scorers/ScorersSheet'));
const ReportSheetLazy = lazy(() => import('../../../components/tournamentReport/ReportSheet'));

/** «Anotadores» del torneo o del playoff (la hoja de siempre), abierta desde «•••» o una fila. */
export function ScorersSheet(props: ComponentProps<typeof ScorersSheetLazy>) {
  if (!props.open) return null;
  return (
    <Suspense fallback={null}>
      <ScorersSheetLazy {...props} />
    </Suspense>
  );
}

/** «Reporte del torneo» (PDF o Excel), abierto desde «•••» o una fila. */
export function ReportSheet(props: ComponentProps<typeof ReportSheetLazy>) {
  if (!props.open) return null;
  return (
    <Suspense fallback={null}>
      <ReportSheetLazy {...props} />
    </Suspense>
  );
}

/**
 * Botón suave en rojo (Sacar del equipo, Borrar, «No vino»): el fondo rojo suave con la letra roja. Los de ui.tsx fijan
 * el color de la letra, así que con `text-danger` encima no siempre se ve rojo. 48 px; con ícono solo, cuadrado.
 */
export function DangerButton({
  children,
  icon,
  loading,
  className,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & { icon?: ReactNode; loading?: boolean }) {
  return (
    <button
      type="button"
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-[15px] bg-danger-soft text-base font-semibold text-danger transition select-none active:scale-[0.97]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50',
        children ? 'px-4' : 'w-12',
        className,
      )}
      {...rest}
    >
      {(icon || loading) && <BusyIcon busy={!!loading} icon={icon} className="size-5" />}
      {children}
    </button>
  );
}
