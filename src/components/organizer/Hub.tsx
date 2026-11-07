import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  Award,
  BadgeCheck,
  Calendar,
  ChevronLeft,
  ClipboardCheck,
  Flag,
  Hourglass,
  Inbox,
  ListChecks,
  Pencil,
  Send,
  Settings,
  Settings2,
  Shield,
  Swords,
  Trophy,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { leagueSport } from '../../sports/registry';
import { hasScreens, useSportScreens, type SportScreens } from '../../sports/screens';
import { useLeagueCtx, type LeagueCtx } from '../../lib/league';
import { BusyIcon, useBusy } from '../busy';
import { Card, ListRow, ListSkeleton, RowIcon, SectionHeader, cx } from '../ui';
import { BOWLING_TEAMS_TAB } from '../bowlingTeams/logic';
import { ownTabsInfo, useLeagueRowItems, useToDoItems } from './hubData';
import { organizeUrl, type LeagueRowKind, type ToDoItem, type ToDoKind } from './hubLogic';

// La hoja de Anotadores se baja al tocar la fila (quien no la abre no la carga).
const loadScorers = () => import('../scorers/ScorersSheet');
const ScorersSheet = lazy(loadScorers);

/** El globo con el número (en el color del deporte). */
export function CountBubble({ n, className }: { n: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx('num grid h-[26px] min-w-[26px] place-items-center rounded-full bg-accent px-2 text-[13px] font-bold tracking-normal text-accent-fg', className)}
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}

export { useOrganizerCtx, useToDoCount, useToDoSummary } from './hubData';

/** Las líneas de las filas de Organizar a 1,4 (como el diseño): filas de 57 px con subtítulo y 56 sin él. */
const ROW_LEADING = 'leading-[1.4]';

const TODO_ICONS: Record<ToDoKind, LucideIcon> = {
  aprobar: ClipboardCheck,
  disputes: Swords,
  overdue: Hourglass,
  reclamos: UserCheck,
  buzon: Inbox,
  waitlists: Users,
  reportes: Flag,
  confirmar: BadgeCheck,
  equipos: Trophy,
  paso: ListChecks,
};

/** Las pantallas propias del boliche: los equipos fijos de una liga (un torneo suelto arma los suyos en el torneo). */
const BOWLING_TABS: NonNullable<SportScreens['adminTabs']> = [
  {
    ...BOWLING_TEAMS_TAB,
    icon: Shield,
    Component: lazy(() => import('../bowlingTeams/BowlingTeamsAdmin')),
  },
];

/** Las pantallas propias del deporte (Equipos, Campos, Nadadores, Parejas…) y si su gente va en una de ellas. */
export function useOwnTabs(league: LeagueCtx['league']) {
  const sport = leagueSport(league);
  const bowling = sport === 'bowling';
  const screens = useSportScreens(bowling ? null : sport);
  const own = bowling ? (league.kind === 'torneo' ? [] : BOWLING_TABS) : (screens?.adminTabs ?? []);
  return {
    ...ownTabsInfo(bowling, own),
    /** Las pantallas del deporte ya llegaron (o no tiene): mientras tanto no se abre una pantalla que después cambia. */
    ready: bowling || !hasScreens(sport) || !!screens,
  };
}

/**
 * «Por hacer» de la liga: lo que espera por quien la organiza, de todas partes (envíos por aprobar en vivo, reclamos,
 * resultados reclamados o atrasados, listas de espera, buzón, reportes, insignias por confirmar, torneos sin equipos y
 * los primeros pasos de una liga nueva). Solo lo que tiene algo.
 */
export function useToDo(): { items: ToDoItem[]; loading: boolean; error: Error | null } {
  const { league } = useLeagueCtx();
  return useToDoItems(useOwnTabs(league));
}

/** «Por hacer»: una fila por cosa, con su número (o chevron). Nada si no hay nada (mientras carga, el esqueleto). */
export function ToDoSection({ items, loading, className }: { items: readonly ToDoItem[]; loading: boolean; className?: string }) {
  if (!items.length && !loading) return null;
  return (
    <section aria-labelledby="por-hacer" className={className}>
      <SectionHeader id="por-hacer" title="Por hacer" />
      {!items.length ? (
        <ListSkeleton rows={2} />
      ) : (
        <Card className="overflow-hidden">
          {items.map((it) => {
            const Icon = TODO_ICONS[it.kind];
            return (
              <ListRow
                key={it.key}
                dense
                className={ROW_LEADING}
                leading={
                  <RowIcon tone={it.kind === 'aprobar' ? 'warn' : 'neutral'}>
                    <Icon className="size-5" />
                  </RowIcon>
                }
                title={it.title}
                subtitle={it.subtitle || undefined}
                to={it.to}
                ariaLabel={it.count ? `${it.title}: ${it.count}` : undefined}
                trailing={it.count ? <CountBubble n={it.count} /> : undefined}
              />
            );
          })}
        </Card>
      )}
    </section>
  );
}

const LEAGUE_ICONS: Record<LeagueRowKind, LucideIcon> = {
  own: Settings2,
  gente: Users,
  temporada: Calendar,
  anotadores: Pencil,
  avisar: Send,
  insignias: Award,
  ajustes: Settings,
  buzon: Inbox,
  reportes: Flag,
};

/**
 * «La liga»: lo que se configura (Jugadores y miembros, Temporada y fechas, Anotadores, Avisar, Insignias, Ajustes y lo
 * del deporte), cada fila a su pantalla de Organizar (`/l/:lid/admin?tab=…`). Anotadores abre su hoja aquí mismo.
 */
export function LeagueSection({ toDo, className }: { toDo: readonly ToDoItem[]; className?: string }) {
  const { lid, league } = useLeagueCtx();
  const own = useOwnTabs(league);
  const loadingSheet = useBusy();
  const [scorers, setScorers] = useState(false);
  const rows = useLeagueRowItems(toDo, own);
  const iconOf = (key: string): LucideIcon | undefined => own.extra.find((t) => `own:${t.key}` === key)?.icon;
  const openScorers = async () => {
    await loadingSheet.run('anotadores', () => loadScorers().catch(() => undefined));
    setScorers(true);
  };

  return (
    <section aria-labelledby="la-liga" className={className}>
      <SectionHeader id="la-liga" title={league.kind === 'torneo' ? 'El torneo' : 'La liga'} />
      <Card className="overflow-hidden">
        {rows.map((r) => {
          const Icon = iconOf(r.key) ?? LEAGUE_ICONS[r.kind];
          const leading = (
            <RowIcon>
              <Icon className="size-[19px]" />
            </RowIcon>
          );
          return r.tab ? (
            <ListRow key={r.key} dense className={ROW_LEADING} leading={leading} title={r.title} subtitle={r.subtitle} to={`/l/${lid}/admin?tab=${r.tab}`} />
          ) : (
            <ListRow
              key={r.key}
              dense
              className={ROW_LEADING}
              leading={leading}
              title={r.title}
              subtitle={r.subtitle}
              onClick={() => void openScorers()}
              ariaLabel={`${r.title}: ${r.subtitle ?? ''}`}
              chevron={!loadingSheet.isBusy()}
              trailing={loadingSheet.isBusy() ? <BusyIcon busy className="size-5 text-faint" /> : undefined}
            />
          );
        })}
      </Card>
      {scorers && (
        <Suspense fallback={null}>
          <ScorersSheet open target={{ scope: 'liga', refId: null, title: league.name }} onClose={() => setScorers(false)} />
        </Suspense>
      )}
    </section>
  );
}

/** Organizar de una liga: «Por hacer» (solo si hay algo) y «La liga». Va dentro de su LeagueContext. */
export function OrganizeHub() {
  const toDo = useToDo();
  return (
    <>
      {/* La ficha de arriba deja 4 px de su área de toque: 24 px entre secciones, como en el diseño. */}
      <ToDoSection items={toDo.items} loading={toDo.loading} className="mt-5" />
      <LeagueSection toDo={toDo.items} className={toDo.items.length || toDo.loading ? 'mt-6' : 'mt-5'} />
    </>
  );
}

/**
 * Arriba de cada pantalla de Organizar (`/l/:lid/admin?tab=…`): «‹ Organizar» (vuelve a «Por hacer» y «La liga» de
 * esta liga) y el título. `children`: lo que va debajo del título (una línea, el segmentado).
 */
export function ScreenHeader({ lid, title, children }: { lid: string; title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col">
      <Link
        to={organizeUrl(lid)}
        data-back-to={organizeUrl(lid)}
        className="-ml-1.5 inline-flex min-h-11 items-center gap-0.5 self-start rounded-xl pr-2 text-body font-[550] text-accent transition active:opacity-70 focus-visible:outline-2 focus-visible:outline-accent"
      >
        <ChevronLeft aria-hidden="true" className="size-5" />
        Organizar
      </Link>
      <h1 className="mt-1 text-title-pro">{title}</h1>
      {children}
    </header>
  );
}
