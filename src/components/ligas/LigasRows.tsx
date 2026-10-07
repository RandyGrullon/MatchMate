import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router';
import { LogIn, Search, Ticket, Trophy } from 'lucide-react';
import type { CalendarItem } from '../../lib/calendar';
import { usePlayers } from '../../lib/data';
import { roleLabel } from '../../lib/league';
import type { League, Member } from '../../lib/types';
import { leagueSport, sportMeta } from '../../sports/registry';
import { SportIcon } from '../../pages/sports/SportBits';
import { leagueLine, rowLineText, tourneyLine, type RowLine, type TourneyItem } from '../eventos/logic';
import { LeagueLogo } from '../home/LeagueCard';
import { sportTint } from '../home/SportTint';
import { Card, ListRow, RowIcon, cx } from '../ui';

/**
 * La línea de una fila: lo de hoy en el color del deporte («En juego hoy») y lo demás en gris. Cada pedazo corto va
 * entero (en un teléfono angosto no se parte «1 jugador») y, si no cabe, baja después del «·».
 */
export function LineText({ line }: { line: RowLine }) {
  const parts = [line.lead, ...line.rest.split(' · ')].filter((p): p is string => !!p);
  return (
    <>
      {parts.map((p, i) => {
        const last = i === parts.length - 1;
        return (
          <Fragment key={i}>
            <span className={cx(p.length <= 24 && 'whitespace-nowrap')}>
              {i === 0 && line.lead ? <span className="font-semibold text-accent">{p}</span> : p}
              {last ? null : ' ·'}
            </span>
            {last ? null : ' '}
          </Fragment>
        );
      })}
    </>
  );
}

/** El color de un deporte en una pieza chica (la fila de una liga de otro deporte): la clase y su <style> (va al <head>). */
function useTint(sport: string) {
  const t = sportTint(sport);
  const style = t.css ? (
    <style href={t.className} precedence="default">
      {t.css}
    </style>
  ) : null;
  return { className: t.className, style };
}

/**
 * El cuadro de la liga al principio de la fila: su logo si tiene; si no, el ícono del deporte en acento suave (una liga)
 * o el trofeo en gris (un torneo). 48 px en Lite y 40 en Pro.
 */
export function LeagueTile({ league, dense }: { league: Pick<League, 'id' | 'sport' | 'kind' | 'logoPath'>; dense?: boolean }) {
  const sport = leagueSport(league);
  const tint = useTint(sport);
  const box = dense ? 'size-10 rounded-xl' : 'size-12 rounded-[15px]';
  const torneo = league.kind === 'torneo';
  return (
    <LeagueLogo path={league.logoPath} className={box}>
      <RowIcon tone={torneo ? 'neutral' : 'accent'} className={cx(box, tint.className)}>
        {tint.style}
        {torneo ? <Trophy className={dense ? 'size-5' : 'size-[22px]'} /> : <SportIcon sport={sport} className={dense ? 'size-5' : 'size-6'} />}
      </RowIcon>
    </LeagueLogo>
  );
}

/**
 * Una de mis ligas: su cuadro, el nombre y «En juego hoy · 6 jugadores» (o cuándo es lo próximo). En Pro, más densa y
 * con mi papel («Dueño», «Admin»). Toda la fila abre la liga.
 */
export function LeagueListRow({
  league,
  live,
  next,
  today,
  role,
  pro,
}: {
  league: League;
  live: boolean;
  next?: CalendarItem | null;
  today: string;
  role?: Member['role'];
  pro?: boolean;
}) {
  const players = usePlayers(league.id);
  const sport = leagueSport(league);
  const tint = useTint(sport);
  const line = leagueLine({
    live,
    next,
    today,
    schedule: league.schedule,
    people: players.loading ? null : players.data.length,
    sport,
    extra: pro && role && role !== 'member' ? [roleLabel(role)] : [],
  });
  return (
    <ListRow
      className={cx(!pro && 'min-h-[76px]!', tint.className)}
      dense={pro}
      leading={<LeagueTile league={league} dense={pro} />}
      title={league.name}
      subtitle={
        <>
          {tint.style}
          <LineText line={line} />
        </>
      }
      to={`/l/${league.id}`}
      ariaLabel={`${league.name}: ${rowLineText(line)}`}
    />
  );
}

/** Un torneo: el trofeo, el nombre y «Sábado 24 oct · 6 inscritos». Abre el torneo. */
export function TourneyRow({
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
  const line = tourneyLine(t, { today, live, entrants, showLeague, pro });
  return (
    <ListRow
      className={cx(!pro && 'min-h-[76px]!', tint.className)}
      dense={pro}
      leading={<LeagueTile league={{ id: t.lid, sport: t.sport, kind: 'torneo', logoPath: t.standalone ? logoPath : null }} dense={pro} />}
      title={t.name}
      subtitle={
        <>
          {tint.style}
          <LineText line={line} />
        </>
      }
      to={t.href}
      ariaLabel={`${t.name}: ${rowLineText(line)}`}
    />
  );
}

/** «Buscar ligas abiertas»: las públicas para unirse, de tu deporte y de los otros, y la agenda pública. */
export function OpenLeaguesRow({ subtitle, pro }: { subtitle: string; pro?: boolean }) {
  return (
    <Card className="overflow-hidden">
      <ListRow
        className={cx(!pro && 'min-h-[76px]!')}
        dense={pro}
        leading={
          <RowIcon className={pro ? undefined : 'size-12 rounded-[15px]'}>
            <Search className={pro ? 'size-5' : 'size-[22px]'} />
          </RowIcon>
        }
        title="Buscar ligas abiertas"
        subtitle={subtitle}
        to="/ligas?ver=abiertas"
      />
    </Card>
  );
}

/**
 * Filtro de deporte (solo si hay más de uno): «Todos» y un chip por deporte, el elegido en su color. Se desliza de lado
 * si no caben (la pantalla no). Cada chip se ve de 40 px y se toca en 44 (su ::after): la fila tiene 2 px arriba y abajo
 * para que el desliz no lo recorte.
 */
export function SportFilter({
  sports,
  value,
  onChange,
  className,
}: {
  sports: readonly string[];
  value: string | null;
  onChange: (sport: string | null) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label="Filtrar por deporte" className={cx('no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6 py-0.5', className)}>
      <FilterChip on={value === null} onClick={() => onChange(null)}>
        Todos
      </FilterChip>
      {sports.map((s) => (
        <FilterChip key={s} sport={s} on={value === s} onClick={() => onChange(value === s ? null : s)}>
          <SportIcon sport={s} className="size-[18px]" />
          {sportMeta(s)?.short ?? 'Otro deporte'}
        </FilterChip>
      ))}
    </div>
  );
}

function FilterChip({ on, sport, onClick, children }: { on: boolean; sport?: string; onClick: () => void; children: ReactNode }) {
  const tint = useTint(sport ?? '');
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        "relative inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-meta font-semibold whitespace-nowrap transition after:absolute after:inset-x-0 after:-inset-y-0.5 after:content-[''] active:scale-[0.97]",
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        tint.className,
        on ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-2',
      )}
    >
      {tint.style}
      {children}
    </button>
  );
}

/** Sin ninguna liga ni torneo: unirse con el código o crear (la hoja «Crear o unirme»). */
export function NoLeaguesCard({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="px-5 pt-[22px] pb-5">
      <span aria-hidden="true" className="grid size-[52px] place-items-center rounded-2xl bg-accent-soft text-accent">
        <Ticket className="size-[26px]" />
      </span>
      <h2 className="mt-4 text-card-title-pro">Todavía no estás en ninguna liga</h2>
      <p className="mt-1.5 text-[15.5px] leading-[1.45] text-fg-2">Únete con el código que te mandó quien organiza, o crea la tuya.</p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-[18px] flex h-btn w-full items-center justify-center rounded-btn bg-accent text-[17px] font-semibold tracking-[-0.01em] text-accent-fg transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Crear o unirme
      </button>
    </Card>
  );
}

/** Sin cuenta: las públicas se ven igual; para lo tuyo hay que entrar. */
export function SignedOutCard({ className }: { className?: string }) {
  return (
    <Card className={cx('flex items-center gap-4 p-5', className)}>
      <p className="min-w-0 flex-1 text-meta text-fg-2">Entra para ver tus ligas y tus torneos. Las públicas se ven sin cuenta.</p>
      <Link
        to="/login?next=%2Fligas"
        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[15px] bg-accent px-4 text-base font-semibold text-accent-fg transition active:scale-[0.97]"
      >
        <LogIn className="size-[18px]" aria-hidden="true" /> Entrar
      </Link>
    </Card>
  );
}
