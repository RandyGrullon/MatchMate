import { Link } from 'react-router';
import { ClipboardCheck, Inbox, Trophy } from 'lucide-react';
import { upcomingCalendar, weekStart, type CalendarMatch } from '../../lib/calendar';
import { usePlayers, type LeagueFeed } from '../../lib/data';
import { parseDate, toIsoDate } from '../../lib/format';
import type { LiveGame, LiveRow } from '../../lib/live';
import type { League, Submission } from '../../lib/types';
import { useNextGame } from '../../lib/useNextGame';
import { initials } from '../Avatar';
import { Card, ListRow, RowIcon, SectionHeader, cx, sectionLinkClass } from '../ui';
import { namesLine } from './logic';
import { useLiveTable } from './TodayCard';

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAY_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const WEEK_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const Count = ({ n }: { n: number }) => (
  <span className="grid h-[26px] min-w-[26px] place-items-center rounded-full bg-accent px-2 text-[13px] font-bold text-accent-fg" aria-hidden="true">
    {n}
  </span>
);

/** «sáb 24 oct». */
const shortDay = (iso: string) => {
  const d = parseDate(iso);
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
};

/** Días hacia adelante en que un torneo sin equipos sale en «Por hacer». */
const TEAMS_AHEAD_DAYS = 30;

/** Lo que el organizador tiene pendiente en una liga (lo que sale en «Por hacer»). */
export interface ToDo {
  lid: string;
  /** Envíos de otros jugadores por aprobar (los propios los ve igual en Aprobar). */
  pending: Submission[];
  approvals: number;
  suggestions: number;
  /** Torneos que vienen con equipos por armar. */
  teams: { id: string; name: string; date: string }[];
}

/** Lo pendiente de cada liga que organizas (envíos por aprobar de otros, buzón y torneos sin equipos). */
export function toDoOf(feeds: readonly LeagueFeed[], today: string): ToDo[] {
  const until = parseDate(today);
  until.setDate(until.getDate() + TEAMS_AHEAD_DAYS);
  const last = toIsoDate(until);
  return feeds
    .filter((f) => f.isAdmin)
    .map((f) => {
      const pending = f.pending.filter((s) => s.playerId !== f.playerId);
      return {
        lid: f.lid,
        pending,
        approvals: pending.length,
        suggestions: f.suggestions.length,
        teams: f.events
          .filter((e) => e.type === 'torneo' && e.date >= today && e.date <= last && (e.teamSize ?? 0) > 0 && !Object.keys(e.teams ?? {}).length)
          .map((e) => ({ id: e.id, name: e.name?.trim() || 'Torneo', date: e.date })),
      };
    })
    .filter((t) => t.approvals || t.suggestions || t.teams.length);
}

/**
 * Pro · «Por hacer»: lo que espera al organizador en sus ligas, en una lista con contadores (aprobar juegos, torneos sin
 * equipos, buzón). «Organizar» lleva al admin de la liga. Nada si no hay nada pendiente.
 */
export function ToDoSection({ todo, leagues, className }: { todo: readonly ToDo[]; leagues: readonly League[]; className?: string }) {
  if (!todo.length) return null;
  const many = todo.length > 1;
  const nameOf = (lid: string) => leagues.find((l) => l.id === lid)?.name ?? 'la liga';
  return (
    <section aria-labelledby="por-hacer" className={className}>
      <SectionHeader
        id="por-hacer"
        title="Por hacer"
        action={
          <Link to={`/l/${todo[0].lid}/admin`} className={sectionLinkClass}>
            Organizar
          </Link>
        }
      />
      <Card className="overflow-hidden">
        {todo.map((t) => (
          <ToDoRows key={t.lid} todo={t} league={many ? nameOf(t.lid) : null} />
        ))}
      </Card>
    </section>
  );
}

function ToDoRows({ todo, league }: { todo: ToDo; league: string | null }) {
  return (
    <>
      {todo.approvals > 0 && <ApproveRow lid={todo.lid} pending={todo.pending} league={league} />}
      {todo.teams.map((t) => (
        <ListRow
          key={t.id}
          dense
          leading={
            <RowIcon>
              <Trophy className="size-5" />
            </RowIcon>
          }
          title={t.name}
          subtitle={['Faltan los equipos', shortDay(t.date), league].filter(Boolean).join(' · ')}
          to={`/l/${todo.lid}/e/${t.id}?tab=equipos`}
        />
      ))}
      {todo.suggestions > 0 && (
        <ListRow
          dense
          leading={
            <RowIcon>
              <Inbox className="size-5" />
            </RowIcon>
          }
          title={league ? `Buzón · ${league}` : 'Buzón de la liga'}
          subtitle={todo.suggestions === 1 ? '1 sugerencia nueva' : `${todo.suggestions} sugerencias nuevas`}
          to={`/l/${todo.lid}/admin?tab=buzon`}
          ariaLabel={`Buzón de la liga: ${todo.suggestions === 1 ? '1 sugerencia nueva' : `${todo.suggestions} sugerencias nuevas`}`}
          trailing={<Count n={todo.suggestions} />}
        />
      )}
    </>
  );
}

/** «Aprobar juegos · Sofía y Carmen · con foto» con el contador (lee los nombres de los jugadores de esa liga). */
function ApproveRow({ lid, pending, league }: { lid: string; pending: readonly Submission[]; league: string | null }) {
  const players = usePlayers(lid);
  const count = pending.length;
  const names = pending.map((s) => players.data.find((p) => p.id === s.playerId)?.name ?? '');
  const photos = pending.filter((s) => s.photoId).length;
  const sub = [namesLine(names), photos === count ? 'con foto' : photos ? `${photos} con foto` : 'sin foto', league].filter(Boolean).join(' · ');
  return (
    <ListRow
      dense
      leading={
        <RowIcon tone="warn">
          <ClipboardCheck className="size-5" />
        </RowIcon>
      }
      title="Aprobar juegos"
      subtitle={sub}
      to={`/l/${lid}/admin?tab=aprobar`}
      ariaLabel={`Aprobar juegos: ${count} por aprobar`}
      trailing={<Count n={count} />}
    />
  );
}

/**
 * Pro · «En vivo»: cómo van todos en la práctica de hoy (los 3 primeros y tú, con tus juegos «187 · 210 · 74…»). «Ver
 * toda» abre la práctica con la tabla entera.
 */
export function LiveSectionPro({ game, today, className }: { game: LiveGame; today: string; className?: string }) {
  const { rows, nameOf } = useLiveTable(game);
  const mine = useNextGame(game, today);
  if (!rows.length) return null;
  const me = game.feed.playerId;
  const top = rows.slice(0, 3);
  const myAt = me ? rows.findIndex((r) => r.playerId === me) : -1;
  const shown = myAt >= 3 ? [...top, rows[myAt]] : top;
  const posOf = (r: LiveRow) => rows.findIndex((x) => x.total === r.total) + 1;
  const gamesLine = (r: LiveRow) => {
    const known = r.games.filter((g) => g.score != null).map((g) => String(g.score));
    if (r.playerId === me && mine?.partial?.score != null) known.push(`${mine.partial.score}…`);
    return known.join(' · ');
  };
  return (
    <section aria-labelledby="en-vivo" className={className}>
      <SectionHeader
        id="en-vivo"
        title="En vivo"
        action={
          <Link to={`/l/${game.feed.lid}/e/${game.event.id}`} className={sectionLinkClass}>
            Ver toda
          </Link>
        }
      />
      <Card className="overflow-hidden">
        {shown.map((r) => {
          const isMe = r.playerId === me;
          const name = nameOf(r.playerId);
          return (
            <ListRow
              key={r.playerId}
              dense
              me={isMe}
              leading={
                <>
                  <span className="w-[18px] shrink-0 text-center text-meta font-semibold text-muted tabular-nums">{posOf(r)}</span>
                  <span
                    aria-hidden="true"
                    className={cx(
                      'grid size-[34px] shrink-0 place-items-center rounded-full text-xs font-[650]',
                      isMe ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-2',
                    )}
                  >
                    {initials(name)}
                  </span>
                </>
              }
              title={
                <>
                  {name}
                  {isMe && <span className="ml-1.5 inline-flex h-[22px] items-center rounded-full bg-surface px-2 align-[2px] text-xs font-[650] text-accent">Tú</span>}
                </>
              }
              subtitle={gamesLine(r)}
              value={r.total}
              to={`/l/${game.feed.lid}/j/${r.playerId}`}
              chevron={false}
            />
          );
        })}
      </Card>
    </section>
  );
}

/**
 * Pro · «Esta semana · octubre»: la tira de lunes a domingo con un punto en los días que tienen algo y hoy en el color
 * del deporte. Tocarla (o «Calendario») abre el calendario.
 */
export function WeekStrip({
  feeds,
  leagues,
  matches,
  today,
  onOpen,
  className,
}: {
  feeds: readonly LeagueFeed[];
  leagues: readonly League[];
  matches: readonly CalendarMatch[];
  today: string;
  onOpen: () => void;
  className?: string;
}) {
  const from = weekStart(today);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = parseDate(from);
    d.setDate(d.getDate() + i);
    return toIsoDate(d);
  });
  const items = upcomingCalendar([...feeds], [...leagues], from, 7, matches);
  const busy = new Set(items.map((i) => i.date));
  const month = MONTHS_LONG[parseDate(today).getMonth()];
  return (
    <section aria-labelledby="esta-semana" className={className}>
      <SectionHeader
        id="esta-semana"
        title={`Esta semana · ${month}`}
        action={
          <button type="button" onClick={onOpen} className={sectionLinkClass}>
            Calendario
          </button>
        }
      />
      <Card>
        <button type="button" onClick={onOpen} aria-label="Abrir el calendario de la semana" className="grid w-full grid-cols-7 px-2 py-3 text-left">
          {days.map((d, i) => {
            const isToday = d === today;
            return (
              <span key={d} className="flex flex-col items-center gap-1.5 text-xs font-semibold text-muted">
                {WEEK_LETTERS[i]}
                <b className={cx('grid size-9 place-items-center rounded-full text-[15px] font-semibold', isToday ? 'bg-accent text-accent-fg' : 'text-fg')}>
                  {parseDate(d).getDate()}
                </b>
                <i aria-hidden="true" className={cx('size-[5px] rounded-full', busy.has(d) ? 'bg-accent' : 'bg-transparent')} />
              </span>
            );
          })}
        </button>
      </Card>
    </section>
  );
}
