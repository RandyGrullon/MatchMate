import { useMemo } from 'react';
import { useAuth } from '../../lib/auth';
import { useLeague, useLeagueMembers, useMembership, usePlayers, useSubmissions } from '../../lib/data';
import { pendingTotal, useLeaguePending } from '../../lib/data/organizer';
import { useBadgeNotices } from '../../lib/data/badges';
import { useReportCounts } from '../../lib/data/reports';
import { toIsoDate } from '../../lib/format';
import { useLeagueCtx, type LeagueCtx } from '../../lib/league';
import { useNow } from '../../lib/useNow';
import { sportAdminTabs } from '../../sports/adminTabs';
import { leagueSport, sportMeta } from '../../sports/registry';
import { BOWLING_TEAMS_TAB } from '../bowlingTeams/logic';
import { usePendingClaimCount } from '../claims/data';
import { PEOPLE_TABS } from '../league/logic';
import { useNotifications } from '../notifications/provider';
import { leagueOf, leagueRows, teamsToBuild, toDoItems, toDoLine, type LeagueRowItem, type ToDoItem } from './hubLogic';

/**
 * Los datos de Organizar (src/components/organizer/Hub.tsx en la web, OrganizeScreen en la app del teléfono): la liga
 * que se organiza, «Por hacer» y «La liga». Sin nada de la pantalla: la web y la app los dibujan cada una a su modo.
 */

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

/** Las pestañas generales de antes (una del deporte con la misma clave la reemplaza, no va aparte). */
const GENERIC_TABS = new Set(['pendientes', 'jugadores', 'aprobar', 'miembros', 'reclamos', 'reportes', 'confirmar', 'insignias', 'buzon', 'temporada', 'liga', 'avisar']);

/** Una pantalla de Organizar propia del deporte, como la ve Organizar (la clave de `?tab=`, el nombre, la línea). */
export interface OwnTab {
  key: string;
  label: string;
  subtitle?: string;
}

/** Lo que Organizar sabe de las pantallas propias del deporte (Equipos, Campos, Nadadores, Parejas…). */
export interface OwnTabsInfo<T extends OwnTab = OwnTab> {
  bowling: boolean;
  /** Todas, en orden. */
  all: readonly T[];
  /** Las que van aparte (no reemplazan una general). */
  extra: readonly T[];
  /** La del deporte que lleva a su gente (natación: Nadadores; raqueta: Parejas y niveles), si hay. */
  peopleTab: T | null;
  /** Su gente va en esa pestaña: «Jugadores y miembros» pasa a «Miembros». */
  playersMerged: boolean;
}

export function ownTabsInfo<T extends OwnTab>(bowling: boolean, own: readonly T[]): OwnTabsInfo<T> {
  const peopleTab = own.find((t) => PEOPLE_TABS.has(t.key)) ?? null;
  return {
    bowling,
    all: own,
    extra: own.filter((t) => !GENERIC_TABS.has(t.key)),
    peopleTab,
    playersMerged: !bowling && !!peopleTab && !own.some((t) => t.key === 'jugadores'),
  };
}

/**
 * Las pantallas propias del deporte de una liga sin cargar las de la web (la app del teléfono): las del boliche (los
 * equipos fijos de una liga; un torneo suelto arma los suyos en el torneo) y las de src/sports/adminTabs.ts.
 */
export function leagueOwnTabs(league: Pick<LeagueCtx['league'], 'id' | 'kind' | 'sport'>): OwnTabsInfo {
  const sport = leagueSport(league);
  const bowling = sport === 'bowling';
  return ownTabsInfo<OwnTab>(bowling, bowling ? (league.kind === 'torneo' ? [] : [BOWLING_TEAMS_TAB]) : sportAdminTabs(sport));
}

/**
 * «Por hacer» de la liga: lo que espera por quien la organiza, de todas partes (envíos por aprobar en vivo, reclamos,
 * resultados reclamados o atrasados, listas de espera, buzón, reportes, insignias por confirmar, torneos sin equipos y
 * los primeros pasos de una liga nueva). Solo lo que tiene algo.
 */
export function useToDoItems(own: Pick<OwnTabsInfo, 'bowling' | 'playersMerged' | 'peopleTab'>): { items: ToDoItem[]; loading: boolean; error: Error | null } {
  const { lid, league, isAdmin } = useLeagueCtx();
  const uid = useAuth().user?.uid;
  const on = isAdmin ? lid : undefined;
  const subs = useSubmissions(own.bowling ? on : undefined, 'pendiente');
  const players = usePlayers(own.bowling ? on : undefined);
  const pending = useLeaguePending(on ?? null);
  const claims = usePendingClaimCount(on ?? null, uid);
  const feed = useNotifications().feeds.find((f) => f.lid === lid);
  const reports = useReportCounts(isAdmin, lid).data;
  const reviews = useBadgeNotices().data.reviews.filter((r) => r.leagueId === lid).length;
  const now = useNow();
  const bowling = own.bowling;
  const playersTab = own.playersMerged ? (own.peopleTab?.key ?? null) : null;
  const items = useMemo(() => {
    const names = new Map(players.data.map((p) => [p.id, p.name]));
    // Aprobar envíos (con foto del marcador) es del boliche; los otros deportes confirman en sus partidos.
    const submissions = bowling
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
      playersTab,
      now: now.getTime(),
    });
  }, [lid, league.kind, bowling, playersTab, subs.data, players.data, pending.data, claims, feed, reports, reviews, now]);
  return { items, loading: !pending.data && !pending.error, error: pending.error };
}

/**
 * «La liga»: lo que se configura (Jugadores y miembros, Temporada y fechas, Anotadores, Avisar, Insignias, Ajustes y lo
 * del deporte), cada fila con su pantalla de Organizar (`?tab=`) o, Anotadores, con su hoja.
 */
export function useLeagueRowItems(toDo: readonly ToDoItem[], own: Pick<OwnTabsInfo, 'extra' | 'playersMerged'>): LeagueRowItem[] {
  const { lid, league } = useLeagueCtx();
  const players = usePlayers(lid);
  const members = useLeagueMembers(lid);
  const reports = useReportCounts(true, lid).data;
  const ids = new Set(players.data.map((p) => p.id));
  return leagueRows({
    kind: league.kind,
    photos: sportMeta(leagueSport(league))?.photos ?? false,
    schedule: league.schedule,
    seasonStart: league.seasonStart,
    seasonEnd: league.seasonEnd,
    players: players.loading ? null : players.data.length,
    accounts: members.loading || players.loading ? null : members.data.filter((m) => m.playerId && ids.has(m.playerId)).length,
    members: members.loading ? null : members.data.length,
    own: own.extra.map((t) => ({ key: t.key, label: t.label, ...(t.subtitle ? { subtitle: t.subtitle } : {}) })),
    playersMerged: own.playersMerged,
    buzonInToDo: toDo.some((t) => t.kind === 'buzon'),
    reportsTab: (reports?.all ?? 0) > 0 && !toDo.some((t) => t.kind === 'reportes'),
  });
}

/**
 * Cuántas cosas esperan en una liga que organizas, lo mismo que suman los globos de su «Por hacer» (league_pending, el
 * buzón, los reportes abiertos y las insignias por confirmar), sin leer los envíos uno por uno: sirve para varias ligas
 * a la vez (la hoja de ligas y el número de la fila «Organizar» de Yo › Configuración).
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
