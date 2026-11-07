/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): lo que Yo lee de la cuenta de prueba y ninguna otra
 * parte de la demo contesta, con la misma forma que la base (src/lib/data/places.ts, posts.ts y profileGames.ts):
 * - `player_places` («Dónde juego»): sus ligas ficticias donde juega (con su promedio en las del boliche), sus equipos
 *   (my_squads de demoSquads.ts) y su equipo de esports.
 * - `user_posts` (Yo › Mis publicaciones): las suyas de Social (demoSocial.ts), también las que publica en la demo.
 * - `profile_games` (Yo › Mis juegos): los juegos de esas publicaciones.
 * No guarda nada propio (lee las tablas de las otras capas), así que no tiene clave ni `forget`. Todo es ficticio.
 */
import type { EsportsTeamPlace, LeaguePlace, PlaceSummary, PlayerPlaces, SquadPlace } from '@mm/lib/data/places';
import type { Post } from '@mm/lib/data/posts';
import type { ProfileGame } from '@mm/lib/data/profileGames';
import { playerStats } from '@mm/lib/stats';
import type { Entry } from '@mm/lib/types';
import { socialRpc } from './demoSocial';
import { squadsRpc } from './demoSquads';

type Row = Record<string, unknown>;
/** Las filas de una tabla con todas las capas de la demo ([] si no hay). */
type Read = (table: string) => Row[];

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** El resumen de cada liga: en el boliche, sus juegos que cuentan y su promedio; en los otros deportes, nada. */
function summaryOf(league: Row, playerId: string, read: Read): PlaceSummary {
  const sport = str(league.sport) ?? 'bowling';
  if (sport !== 'bowling') return { kind: 'none' };
  const mine = read('entries').filter((e) => e.league_id === league.id && e.player_id === playerId) as unknown as Pick<Entry, 'scores' | 'photos'>[];
  const s = playerStats(mine);
  return { kind: 'bowling', games: s.games, average: s.autoAverage, high: s.high || null };
}

function myPlaces(uid: string, read: Read): PlayerPlaces {
  const leagues = read('leagues');
  const seen = new Set<string>();
  const places: LeaguePlace[] = [];
  for (const m of read('memberships')) {
    const playerId = str(m.player_id);
    if (m.user_id !== uid || !playerId || m.scorer_only === true || seen.has(String(m.league_id))) continue;
    const l = leagues.find((x) => x.id === m.league_id);
    if (!l) continue;
    seen.add(String(l.id));
    places.push({
      leagueId: String(l.id),
      name: String(l.name ?? 'Liga'),
      kind: l.kind === 'torneo' ? 'torneo' : 'liga',
      sport: str(l.sport) ?? 'bowling',
      game: str(l.game),
      logo: str(l.logo_path),
      visibility: l.visibility === 'public' ? 'public' : 'private',
      playerId,
      summary: summaryOf(l, playerId, read),
    });
  }
  const squads = (squadsRpc(uid, 'my_squads', {}, read) as SquadPlace[] | undefined) ?? [];
  const teams = read('esports_teams');
  const esportsTeams: EsportsTeamPlace[] = read('esports_team_members')
    .filter((m) => m.user_id === uid)
    .flatMap((m) => {
      const t = teams.find((x) => x.id === m.team_id);
      if (!t) return [];
      const role = m.role === 'captain' || m.role === 'sub' ? m.role : 'member';
      return [{ id: String(t.id), game: String(t.game ?? ''), name: String(t.name ?? ''), tag: String(t.tag ?? ''), logo: str(t.logo_path), role }];
    });
  return { leagues: places, squads, esportsTeams };
}

/** Las publicaciones de la cuenta en Social (las de fábrica y las que publicó en la demo). */
const myPosts = (uid: string): Post[] => ((socialRpc(uid, 'social_feed', { p_scope: 'following' }) as Post[] | undefined) ?? []).filter((p) => p.author.id === uid);

/**
 * Las RPC de Yo en la demo. undefined si no es de aquí (otra función, o la de otra cuenta: esa la contesta su parte o
 * llega vacía). `read`: las tablas con todas las capas.
 */
export function yoRpc(uid: string, fn: string, a: Record<string, unknown>, read: Read): unknown {
  if (a.p_user !== uid) return undefined;
  switch (fn) {
    case 'player_places':
      return myPlaces(uid, read);
    case 'user_posts':
      return a.p_before ? [] : myPosts(uid);
    case 'profile_games': {
      if (a.p_before) return [];
      const sport = str(a.p_sport);
      return myPosts(uid)
        .map((p) => p.game)
        .filter((g): g is ProfileGame => !!g && (!sport || g.sport === sport));
    }
    default:
      return undefined;
  }
}
