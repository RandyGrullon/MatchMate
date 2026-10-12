import {
  esportsTeamPath,
  leaguePlacePath,
  placeSummaryText,
  placesBySport,
  squadPlacePath,
  type EsportsTeamPlace,
  type LeaguePlace,
  type PlayerPlaces,
  type SquadPlace,
} from '../../lib/data/places';
import { gameMeta } from '../../sports/esports/catalog';
import { sportMeta } from '../../sports/registry';

/**
 * «Dónde juega» sin React (se prueba solo): las ligas y torneos de una persona agrupados por deporte o juego, sus
 * equipos y sus equipos de esports, cada uno con su línea y a dónde lleva (su perfil en ese lugar).
 */

export type PlaceRow =
  | { kind: 'league'; key: string; to: string; title: string; subtitle: string; place: LeaguePlace }
  | { kind: 'squad'; key: string; to: string; title: string; subtitle: string; place: SquadPlace }
  | { kind: 'esports'; key: string; to: string; title: string; subtitle: string; place: EsportsTeamPlace };

export interface PlaceSection {
  key: string;
  /** «Pádel», «VALORANT», «Equipos», «Equipos de esports». */
  label: string;
  kind: 'sport' | 'squads' | 'esports';
  /** El deporte y el juego del encabezado (en «Equipos», null). */
  sport: string | null;
  game: string | null;
  rows: PlaceRow[];
}

/** «Capitán», «Titular», «Suplente» (en un equipo de esports). */
export const ESPORTS_ROLE: Record<EsportsTeamPlace['role'], string> = { captain: 'Capitán', member: 'Titular', sub: 'Suplente' };

/** «Liga · Promedio 182 · 24 juegos», «Torneo · 3 G · 1 P». */
export function leagueRowLine(l: Pick<LeaguePlace, 'kind' | 'summary'>): string {
  return [l.kind === 'torneo' ? 'Torneo' : 'Liga', placeSummaryText(l.summary)].filter(Boolean).join(' · ');
}

/** «Fútbol · Capitán» (el miembro no dice su papel). */
export function squadRowLine(s: Pick<SquadPlace, 'sport' | 'role'>): string {
  return [sportMeta(s.sport)?.short ?? 'Otro deporte', s.role === 'captain' ? 'Capitán' : null].filter(Boolean).join(' · ');
}

/** «VALORANT · Suplente». */
export function esportsRowLine(t: Pick<EsportsTeamPlace, 'game' | 'role'>): string {
  return [gameMeta(t.game)?.name ?? 'Esports', ESPORTS_ROLE[t.role]].join(' · ');
}

/** «Los Tigres [TGR]». */
export const teamTitle = (t: { name: string; tag: string }) => (t.tag ? `${t.name} [${t.tag}]` : t.name);

/** Las partes de «Dónde juega»: un bloque por deporte o juego (en el orden de llegada), «Equipos» y «Equipos de esports». */
export function placeSections(places: PlayerPlaces, uid: string): PlaceSection[] {
  const out: PlaceSection[] = placesBySport(places.leagues).map((g) => ({
    key: g.game ? `esports:${g.game}` : g.sport,
    label: g.label,
    kind: 'sport',
    sport: g.sport,
    game: g.game,
    rows: g.leagues.map((l) => ({ kind: 'league', key: `l:${l.leagueId}`, to: leaguePlacePath(l), title: l.name, subtitle: leagueRowLine(l), place: l })),
  }));
  if (places.squads.length) {
    out.push({
      key: 'equipos',
      label: 'Equipos',
      kind: 'squads',
      sport: null,
      game: null,
      rows: places.squads.map((s) => ({ kind: 'squad', key: `s:${s.id}`, to: squadPlacePath(s.id, uid), title: teamTitle(s), subtitle: squadRowLine(s), place: s })),
    });
  }
  if (places.esportsTeams.length) {
    out.push({
      key: 'esports',
      label: 'Equipos de esports',
      kind: 'esports',
      sport: 'esports',
      game: null,
      rows: places.esportsTeams.map((t) => ({ kind: 'esports', key: `e:${t.id}`, to: esportsTeamPath(t.id), title: teamTitle(t), subtitle: esportsRowLine(t), place: t })),
    });
  }
  return out;
}

/** Cuántas filas hay en total. */
export const placeCount = (sections: readonly PlaceSection[]) => sections.reduce((n, s) => n + s.rows.length, 0);

/** Las primeras `limit` filas (en orden); los bloques que se quedan sin filas no salen. */
export function firstRows(sections: readonly PlaceSection[], limit: number): PlaceSection[] {
  let left = Math.max(0, limit);
  const out: PlaceSection[] = [];
  for (const s of sections) {
    if (!left) break;
    const rows = s.rows.slice(0, left);
    left -= rows.length;
    out.push(rows.length === s.rows.length ? s : { ...s, rows });
  }
  return out;
}
