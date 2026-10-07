import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
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
  Swords,
  Trophy,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useLeague, useLeagueMembers, useMembership, usePlayers, useSubmissions } from '../../lib/data';
import { pendingTotal, useLeaguePending } from '../../lib/data/organizer';
import { useBadgeNotices } from '../../lib/data/badges';
import { useReportCounts } from '../../lib/data/reports';
import { toIsoDate } from '../../lib/format';
import { leagueSport, sportMeta } from '../../sports/registry';
import { hasScreens, useSportScreens } from '../../sports/screens';
import { useLeagueCtx, type LeagueCtx } from '../../lib/league';
import { useNow } from '../../lib/useNow';
import { usePendingClaimCount } from '../claims/data';
import { PEOPLE_TABS } from '../league/logic';
import { useNotifications } from '../Notifications';
import { BusyIcon, useBusy } from '../busy';
import { Card, ListRow, ListSkeleton, RowIcon, SectionHeader, cx } from '../ui';
import { leagueOf, leagueRows, organizeUrl, teamsToBuild, toDoItems, toDoLine, type LeagueRowKind, type ToDoItem, type ToDoKind } from './hubLogic';

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

/**
 * La liga que se organiza, como dentro de la liga (src/components/LeagueShell.tsx): dueño o admin (el superadmin, en
 * todas), anotador y su jugador. null mientras carga, si no existe o si no la puede ver.
 */
export function useOrganizerCtx(lid: string | null): { ctx: LeagueCtx | null; loading: boolean; error: Error | null } {
  const { user, isSuper } = useAuth();
  const league = useLeague(lid ?? undefined);
  const membership = useMembership(lid ?? undefined, user?.uid);
  const ctx = useMemo(() => (lid && league.data ? leagueOf(lid, league.data, membership.data, isSuper) : null), [lid, league.data, membership.data, isSuper]);
  return { ctx, loading: !!lid && (league.loading || membership.loading), error: league.error ?? membership.error ?? null };
}

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

/** Las pestañas generales de antes (una del deporte con la misma clave la reemplaza, no va aparte). */
const GENERIC_TABS = new Set(['pendientes', 'jugadores', 'aprobar', 'miembros', 'reclamos', 'reportes', 'confirmar', 'insignias', 'buzon', 'temporada', 'liga', 'avisar']);

/** Las pantallas propias del deporte (Equipos, Campos, Nadadores, Parejas…) y si su gente va en una de ellas. */
export function useOwnTabs(league: LeagueCtx['league']) {
  const sport = leagueSport(league);
  const bowling = sport === 'bowling';
  const screens = useSportScreens(bowling ? null : sport);
  const own = screens?.adminTabs ?? [];
  const peopleTab = own.find((t) => PEOPLE_TABS.has(t.key)) ?? null;
  return {
    bowling,
    /** Las pantallas del deporte ya llegaron (o no tiene): mientras tanto no se abre una pantalla que después cambia. */
    ready: bowling || !hasScreens(sport) || !!screens,
    /** Las que van aparte (no reemplazan una general). */
    extra: own.filter((t) => !GENERIC_TABS.has(t.key)),
    all: own,
    peopleTab,
    playersMerged: !bowling && !!peopleTab && !own.some((t) => t.key === 'jugadores'),
  };
}

/**
 * «Por hacer» de la liga: lo que espera por quien la organiza, de todas partes (envíos por aprobar en vivo, reclamos,
 * resultados reclamados o atrasados, listas de espera, buzón, reportes, insignias por confirmar, torneos sin equipos y
 * los primeros pasos de una liga nueva). Solo lo que tiene algo.
 */
export function useToDo(): { items: ToDoItem[]; loading: boolean; error: Error | null } {
  const { lid, league, isAdmin } = useLeagueCtx();
  const uid = useAuth().user?.uid;
  const own = useOwnTabs(league);
  const on = isAdmin ? lid : undefined;
  const subs = useSubmissions(own.bowling ? on : undefined, 'pendiente');
  const players = usePlayers(own.bowling ? on : undefined);
  const pending = useLeaguePending(on ?? null);
  const claims = usePendingClaimCount(on ?? null, uid);
  const feed = useNotifications().feeds.find((f) => f.lid === lid);
  const reports = useReportCounts(isAdmin, lid).data;
  const reviews = useBadgeNotices().data.reviews.filter((r) => r.leagueId === lid).length;
  const now = useNow();
  const items = useMemo(() => {
    const names = new Map(players.data.map((p) => [p.id, p.name]));
    // Aprobar envíos (con foto del marcador) es del boliche; los otros deportes confirman en sus partidos.
    const submissions = own.bowling
      ? [...subs.data]
          .sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0))
          .map((s) => ({ name: names.get(s.playerId) ?? 'Jugador', scores: s.scores ?? [], hasPhoto: !!s.photoId }))
      : [];
    const suggestions = [...(feed?.suggestions ?? [])].sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
    return toDoItems({
      lid,
      kind: league.kind,
      pending: pending.data,
      submissions,
      claims,
      suggestions,
      reports: reports?.open ?? 0,
      reviews,
      teams: teamsToBuild(feed?.events ?? [], toIsoDate(now)),
      playersTab: own.playersMerged ? (own.peopleTab?.key ?? null) : null,
      now: now.getTime(),
    });
  }, [lid, league.kind, own.bowling, own.playersMerged, own.peopleTab, subs.data, players.data, pending.data, claims, feed, reports, reviews, now]);
  return { items, loading: !pending.data && !pending.error, error: pending.error };
}

/**
 * Cuántas cosas esperan en una liga que organizas, lo mismo que suman los globos de su «Por hacer» (league_pending, el
 * buzón, los reportes abiertos y las insignias por confirmar), sin leer los envíos uno por uno: sirve para varias ligas
 * a la vez (la hoja de ligas y el número de la pestaña «Organizar»).
 */
export function useToDoCount(lid: string | null | undefined): number {
  return useToDoSummary(lid).count;
}

/** Lo mismo que useToDoCount, con la línea en palabras («2 juegos por aprobar · 1 nota en el buzón»; '' sin nada). */
export function useToDoSummary(lid: string | null | undefined): { count: number; line: string; loading: boolean } {
  const pending = useLeaguePending(lid ?? null).data;
  const feed = useNotifications().feeds.find((f) => f.lid === lid);
  const reports = useReportCounts(!!lid, lid).data;
  const reviews = useBadgeNotices().data.reviews.filter((r) => r.leagueId === lid).length;
  if (!lid) return { count: 0, line: '', loading: false };
  const notes = feed?.suggestions.length ?? 0;
  const open = reports?.open ?? 0;
  return { count: pendingTotal(pending) + notes + open + reviews, line: toDoLine(pending, { notes, reports: open, reviews }), loading: !pending };
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
  const players = usePlayers(lid);
  const members = useLeagueMembers(lid);
  const reports = useReportCounts(true, lid).data;
  const loadingSheet = useBusy();
  const [scorers, setScorers] = useState(false);
  const ids = new Set(players.data.map((p) => p.id));
  const rows = leagueRows({
    kind: league.kind,
    photos: sportMeta(leagueSport(league))?.photos ?? false,
    schedule: league.schedule,
    seasonStart: league.seasonStart,
    seasonEnd: league.seasonEnd,
    players: players.loading ? null : players.data.length,
    accounts: members.loading || players.loading ? null : members.data.filter((m) => m.playerId && ids.has(m.playerId)).length,
    members: members.loading ? null : members.data.length,
    own: own.extra.map((t) => ({ key: t.key, label: t.label })),
    playersMerged: own.playersMerged,
    buzonInToDo: toDo.some((t) => t.kind === 'buzon'),
    reportsTab: (reports?.all ?? 0) > 0 && !toDo.some((t) => t.kind === 'reportes'),
  });
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
