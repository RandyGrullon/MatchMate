import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ClipboardCheck, Inbox } from 'lucide-react';
import type { CalendarMatch } from '../../lib/calendar';
import { usePlayers, type LeagueFeed } from '../../lib/data';
import { parseDate } from '../../lib/format';
import type { LiveGame } from '../../lib/live';
import type { League, Submission } from '../../lib/types';
import { useNextGame } from '../../lib/useNextGame';
import { leagueSport, sportsOf } from '../../sports/registry';
import { initials } from '../Avatar';
import type { BoardRow } from '../event/board';
import { SportCorner, SportMark } from '../SportMark';
import { Card, ListRow, RowIcon, SectionHeader, cx, sectionLinkClass } from '../ui';
import { WEEK_LETTERS, approveLine, liveGames, liveShownRows, suggestionsText, teamsLine, weekBusy, weekDays, weekTitle, type ToDo } from './proHome';
import { useLiveTable } from './TodayCard';

// Lo que no es pantalla (qué espera, las líneas, la semana) está en proHome.ts: lo usa también la app del teléfono.
export { TEAMS_AHEAD_DAYS, toDoOf, type ToDo } from './proHome';

const Count = ({ n }: { n: number }) => (
  <span className="grid h-[26px] min-w-[26px] place-items-center rounded-full bg-accent px-2 text-[13px] font-bold text-accent-fg" aria-hidden="true">
    {n}
  </span>
);

/**
 * Pro · «Por hacer»: lo que espera al organizador en sus ligas, en una lista con contadores (aprobar juegos, torneos sin
 * equipos con el deporte de su liga, buzón; con ligas de varios deportes, cada tarea con el suyo en la esquina).
 * «Organizar» lleva al admin de la liga. Nada si no hay nada pendiente.
 */
export function ToDoSection({ todo, leagues, className }: { todo: readonly ToDo[]; leagues: readonly League[]; className?: string }) {
  if (!todo.length) return null;
  const many = todo.length > 1;
  const nameOf = (lid: string) => leagues.find((l) => l.id === lid)?.name ?? 'la liga';
  // Con ligas de más de un deporte, también aprobar y el buzón dicen de qué deporte son (en la esquina del ícono).
  const manySports = sportsOf(leagues).length > 1;
  const sportOf = (lid: string): ToDoSport => {
    const l = leagues.find((x) => x.id === lid);
    return { sport: l ? leagueSport(l) : 'bowling', game: l?.game ?? null, corner: manySports };
  };
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
          <ToDoRows key={t.lid} todo={t} league={many ? nameOf(t.lid) : null} sport={sportOf(t.lid)} />
        ))}
      </Card>
    </section>
  );
}

/** El deporte de la liga de una tarea: el torneo lo lleva siempre; aprobar y el buzón, en la esquina si `corner`. */
interface ToDoSport {
  sport: string;
  game: string | null;
  corner: boolean;
}

/** El ícono de una tarea con el deporte en su esquina (solo si la cuenta tiene ligas de más de un deporte). */
function TaskIcon({ sport, children }: { sport: ToDoSport; children: ReactNode }) {
  if (!sport.corner) return children;
  return (
    <SportCorner sport={sport.sport} game={sport.game}>
      {children}
    </SportCorner>
  );
}

function ToDoRows({ todo, league, sport }: { todo: ToDo; league: string | null; sport: ToDoSport }) {
  return (
    <>
      {todo.approvals > 0 && <ApproveRow lid={todo.lid} pending={todo.pending} league={league} sport={sport} />}
      {todo.teams.map((t) => (
        <ListRow
          key={t.id}
          dense
          // El torneo con su deporte (y el trofeo chico), como en «Tus torneos».
          leading={<SportMark sport={sport.sport} game={sport.game} torneo />}
          title={t.name}
          subtitle={teamsLine(t.date, league)}
          to={`/l/${todo.lid}/e/${t.id}?tab=equipos`}
        />
      ))}
      {todo.suggestions > 0 && (
        <ListRow
          dense
          leading={
            <TaskIcon sport={sport}>
              <RowIcon>
                <Inbox className="size-5" />
              </RowIcon>
            </TaskIcon>
          }
          title={league ? `Buzón · ${league}` : 'Buzón de la liga'}
          subtitle={suggestionsText(todo.suggestions)}
          to={`/l/${todo.lid}/admin?tab=buzon`}
          ariaLabel={`Buzón de la liga: ${suggestionsText(todo.suggestions)}`}
          trailing={<Count n={todo.suggestions} />}
        />
      )}
    </>
  );
}

/** «Aprobar juegos · Sofía y Carmen · con foto» con el contador (lee los nombres de los jugadores de esa liga). */
function ApproveRow({ lid, pending, league, sport }: { lid: string; pending: readonly Submission[]; league: string | null; sport: ToDoSport }) {
  const players = usePlayers(lid);
  const count = pending.length;
  const names = pending.map((s) => players.data.find((p) => p.id === s.playerId)?.name ?? '');
  const sub = approveLine(pending, names, league);
  return (
    <ListRow
      dense
      leading={
        <TaskIcon sport={sport}>
          <RowIcon tone="warn">
            <ClipboardCheck className="size-5" />
          </RowIcon>
        </TaskIcon>
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
 * toda» abre la práctica con la tabla entera. Es la misma tabla que la Planilla: el total y el puesto son solo de lo
 * aprobado; lo que espera aprobación sale en ámbar y no suma.
 */
export function LiveSectionPro({ game, today, className }: { game: LiveGame; today: string; className?: string }) {
  const { rows, nameOf } = useLiveTable(game);
  const mine = useNextGame(game, today);
  if (!rows.length) return null;
  const me = game.feed.playerId;
  const shown = liveShownRows(rows, me);
  const gamesLine = (r: BoardRow) =>
    liveGames(r, me, mine?.partial?.score).map((g, i) => (
      <span key={i}>
        {i > 0 && ' · '}
        {g.pend ? (
          <span className="text-warn">
            {g.text}
            <span className="sr-only"> (por aprobar)</span>
          </span>
        ) : (
          g.text
        )}
      </span>
    ));
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
                  <span className="w-[18px] shrink-0 text-center text-meta font-semibold text-muted tabular-nums">{r.pos}</span>
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
  const days = weekDays(today);
  const busy = weekBusy(feeds, leagues, matches, today);
  return (
    <section aria-labelledby="esta-semana" className={className}>
      <SectionHeader
        id="esta-semana"
        title={weekTitle(today)}
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
