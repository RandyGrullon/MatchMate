import type { Match, MatchStatus } from '../../lib/data/matchCore';
import type { SharedGame } from '../../lib/data/posts';
import type { ProfileGame } from '../../lib/data/profileGames';
import type { League } from '../../lib/types';
import { leagueSport, sportMeta } from '../../sports/registry';
import { STROKE_LABEL } from '../../sports/swimming/events';
import type { Side } from '../../sports/types';
import { flipScoreText, sideName } from '../match/format';
import type { ComposerTarget } from './postFormat';

/**
 * Compartir un partido o un juego como publicación (docs/perfiles-equipos-esports.md §2), sin React: dónde se puede
 * publicar, qué jugador va con el partido y el texto que se sugiere («¡Ganamos 6-4 6-3! 🎾»). La base revisa todo otra
 * vez; aquí solo se decide si el botón sale (si no se puede, no sale nada en vez de un error).
 */

const EMOJI: Record<string, string> = {
  bowling: '🎳',
  padel: '🎾',
  tennis: '🎾',
  pickleball: '🏓',
  table_tennis: '🏓',
  basketball: '🏀',
  football: '⚽',
  futsal: '⚽',
  golf: '⛳',
  swimming: '🏊',
  esports: '🎮',
};

/** El emoji del deporte para el texto sugerido ('' si no tiene). */
export const sportEmoji = (sport: string | null | undefined): string => (sport ? (EMOJI[sport] ?? '') : '');

const withEmoji = (text: string, sport: string | null | undefined) => {
  const e = sportEmoji(sport);
  return e ? `${text} ${e}` : text;
};

/**
 * La liga donde va la publicación de un juego de esa liga: solo si quien mira es miembro y la liga no tiene menores
 * (null = no se ofrece compartir).
 */
export function leagueShareTarget(
  ctx: { lid: string; league: Pick<League, 'name' | 'visibility' | 'hasMinors' | 'sport'> & { id?: string }; member: unknown } | null | undefined,
): ComposerTarget | null {
  if (!ctx || !ctx.member || ctx.league.hasMinors) return null;
  return { id: ctx.lid, name: ctx.league.name, sport: leagueSport({ id: ctx.lid, sport: ctx.league.sport }), visibility: ctx.league.visibility };
}

// ---------- Partidos ----------

/** Un partido se comparte cuando ya terminó (lo mismo que pide la base). */
export const MATCH_SHAREABLE: readonly MatchStatus[] = ['finished', 'confirmed', 'walkover'];

type MatchPart = Pick<Match, 'status' | 'winner' | 'walkoverSide' | 'score' | 'sides'>;

/** El lado que ganó (también por W.O.); null en un empate, sin resultado o W.O. de los dos. */
export function winnerSide(m: Pick<Match, 'status' | 'winner' | 'walkoverSide'>): Side | null {
  if (m.winner) return m.winner;
  if (m.status === 'walkover' && (m.walkoverSide === 1 || m.walkoverSide === 2)) return m.walkoverSide === 1 ? 2 : 1;
  return null;
}

/**
 * Con qué jugador va el partido (la base pide uno que lo jugó y tenga cuenta): el de quien mira si jugó; si no, el
 * primero con cuenta del lado que ganó (o del lado 1). null si el partido no terminó o no hay a quién ponerle.
 */
export function matchSharePick(
  m: Pick<Match, 'id' | 'status' | 'winner' | 'walkoverSide' | 'sides'>,
  opts: { mySide: Side | null | undefined; myPlayerId: string | null | undefined; hasAccount: (playerId: string) => boolean },
): { game: SharedGame; side: Side; mine: boolean } | null {
  if (!MATCH_SHAREABLE.includes(m.status)) return null;
  if (opts.mySide && opts.myPlayerId) return { game: { kind: 'match', id: m.id, playerId: opts.myPlayerId }, side: opts.mySide, mine: true };
  const order: Side[] = winnerSide(m) === 2 ? [2, 1] : [1, 2];
  for (const s of order) {
    const p = m.sides.find((x) => x.side === s)?.players.find((pl) => opts.hasAccount(pl.playerId));
    if (p) return { game: { kind: 'match', id: m.id, playerId: p.playerId }, side: s, mine: false };
  }
  return null;
}

const scoreOf = (m: Pick<Match, 'score'>) => (typeof m.score?.text === 'string' ? m.score.text.trim() : '');
/** El marcador visto desde un lado (el de la base es el del lado 1). */
const scoreFrom = (raw: string, side: Side) => (side === 1 ? raw : flipScoreText(raw));
const spaced = (s: string) => (s ? ` ${s}` : '');

/**
 * El texto sugerido de un partido. `mine`: lo jugó quien publica (desde su lado: «¡Ganamos 6-4 6-3!», «¡Gané…!» si su
 * lado es de uno). Si no: «¡Ganó Ana / Eva 6-4 6-3!».
 */
export function matchPostText(m: MatchPart, side: Side, mine: boolean, sport: string | null | undefined): string {
  const raw = scoreOf(m);
  const won = winnerSide(m);
  const name = (s: Side) => sideName(m.sides.find((x) => x.side === s) ?? { label: '' });
  const one = (m.sides.find((x) => x.side === side)?.players.length ?? 0) === 1;
  const verb = (plural: string, single: string) => (one ? single : plural);
  if (m.status === 'walkover') {
    if (!won) return withEmoji('Partido sin jugar (W.O.)', sport);
    if (mine) return withEmoji(won === side ? `¡${verb('Ganamos', 'Gané')} por W.O.!` : `${verb('Perdimos', 'Perdí')} por W.O.`, sport);
    return withEmoji(`¡Ganó ${name(won)} por W.O.!`, sport);
  }
  if (won) {
    if (mine) {
      return won === side
        ? withEmoji(`¡${verb('Ganamos', 'Gané')}${spaced(scoreFrom(raw, side))}!`, sport)
        : withEmoji(`${verb('Perdimos', 'Perdí')}${spaced(scoreFrom(raw, side))}. ¡Vamos por la próxima!`, sport);
    }
    return withEmoji(`¡Ganó ${name(won)}${spaced(scoreFrom(raw, won))}!`, sport);
  }
  if (mine) return withEmoji(`${verb('Empatamos', 'Empaté')}${spaced(scoreFrom(raw, side))}`, sport);
  return withEmoji(raw ? `${name(1)} ${raw} ${name(2)}` : `${name(1)} vs ${name(2)}`, sport);
}

// ---------- Boliche y golf ----------

/** «¡Hice 540 de serie!» (o «¡Hice 210!» con un juego); de otro, con su nombre. */
export function bowlingPostText(scores: readonly (number | null)[], who?: string | null): string {
  const got = scores.filter((s): s is number => s != null);
  if (!got.length) return withEmoji(who ? `Los juegos de ${who}` : 'Mis juegos', 'bowling');
  const value = got.length > 1 ? `${got.reduce((a, b) => a + b, 0)} de serie` : `${got[0]}`;
  return withEmoji(who ? `¡${who} hizo ${value}!` : `¡Hice ${value}!`, 'bowling');
}

/** «82 golpes en Teeth of the Dog». */
export function golfPostText(gross: number, course?: string | null, who?: string | null): string {
  const where = course?.trim() ? ` en ${course.trim()}` : '';
  return withEmoji(who ? `${who}: ${gross} golpes${where}` : `${gross} golpes${where}`, 'golf');
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name.trim();

/**
 * El texto sugerido para compartir un juego del perfil o del inicio. `mine`: es de quien publica (si no, con el primer
 * nombre de quien lo jugó).
 */
export function gamePostText(g: ProfileGame, mine: boolean): string {
  const who = mine ? null : firstName(g.userName) || null;
  switch (g.kind) {
    case 'bowling':
    case 'solo':
      return bowlingPostText(g.detail.scores, who);
    case 'golf':
      return golfPostText(g.detail.gross, g.detail.course, who);
    case 'swim': {
      const d = g.detail;
      const stroke = ((STROKE_LABEL as Record<string, string>)[d.stroke] ?? d.stroke).toLowerCase();
      const place = d.place && d.place <= 3 ? ` ¡${d.place}.º lugar!` : '';
      return withEmoji(`${who ? `${who}: ` : ''}${d.distance} m ${stroke}${place}`, g.sport);
    }
    case 'match': {
      const d = g.detail;
      const singles = sportMeta(g.sport)?.family === 'racket' && !(d.mine ?? '').includes('/');
      const sides = [
        { side: 1 as Side, label: d.side === 1 ? (d.mine ?? '') : (d.opponent ?? ''), players: [] as unknown[] },
        { side: 2 as Side, label: d.side === 2 ? (d.mine ?? '') : (d.opponent ?? ''), players: [] as unknown[] },
      ];
      // La base no dice cuántos son: en raqueta sin «/» es uno solo («Gané»).
      if (singles) sides[d.side - 1].players = [null];
      const won: Side | null = d.result === 'win' ? d.side : d.result === 'loss' ? (d.side === 1 ? 2 : 1) : null;
      const m = {
        status: (d.walkover ? 'walkover' : 'confirmed') as MatchStatus,
        winner: won,
        walkoverSide: d.walkover && won ? ((won === 1 ? 2 : 1) as 1 | 2) : d.walkover ? (0 as const) : null,
        score: d.score ? { text: d.score } : null,
        sides: sides as unknown as Match['sides'],
      };
      return matchPostText(m, d.side, mine, g.sport);
    }
  }
}
