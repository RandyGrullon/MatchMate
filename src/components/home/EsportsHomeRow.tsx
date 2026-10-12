import { createElement } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useMyEsportsEntries, useMyEsportsTeams } from '../../lib/data/esports';
import { seenIdMove, useMyIdMoves, type IdMove } from '../../lib/data/esportsIds';
import { LINK_PROVIDER_NAME, gameMeta, isGameId, type GameId } from '../../sports/esports';
import type { SportId } from '../../sports/types';
import { useNotice, type Notice } from '../NoticeSlot';
import { SportMark } from '../SportMark';
import { Card, ListRow, cx } from '../ui';

/**
 * Esports en Hoy y en Ligas (docs/esports.md §11.2): la fila que lleva a `/esports` («Tus equipos y torneos», «Torneos
 * de esports») y, en Hoy, el aviso de «Tu ID pasó a otra cuenta» (alguien entró con esa cuenta de Epic, Steam o Riot
 * en otra cuenta de MatchMate). El mismo aviso sale en Esports y en Mi ID (`useEsportsIdMoveNotice`).
 */

/** ¿Sale la fila de esports? Con el deporte activo en esports, o si la cuenta tiene equipos o inscripciones de esports. */
export function showsEsportsRow(o: { active: SportId | null; teams: number; entries: number }): boolean {
  return o.active === 'esports' || o.teams > 0 || o.entries > 0;
}

/** Marca el aviso como visto en la base (si falla, el aviso ya quedó cerrado en este teléfono). */
const markSeen = (id: string) => {
  seenIdMove(id).catch((e: unknown) => console.warn('[esports] aviso del ID', e));
};

/**
 * El aviso de un ID que pasó a otra cuenta (el más nuevo de los que no vio): «Tu ID {X} de {Juego} pasó a otra
 * cuenta» · «Alguien entró con esa cuenta de {Epic} en otra cuenta de MatchMate.» · «Ver» (`/esports/mi-id?juego=…`).
 * Al cerrarlo queda visto (`seenIdMove`) y sale el siguiente, si hay. null = nada.
 */
export function esportsIdMoveNotice(moves: readonly IdMove[], onSeen: (id: string) => void = markSeen): Notice | null {
  const m = moves.reduce<IdMove | null>((newest, x) => (!newest || x.createdAt > newest.createdAt ? x : newest), null);
  if (!m) return null;
  return {
    id: `esports-id-move:${m.id}`,
    kind: 'admin',
    title: `Tu ID ${m.idDisplay} de ${gameMeta(m.game)?.name ?? 'juego'} pasó a otra cuenta`,
    text: `Alguien entró con esa cuenta de ${LINK_PROVIDER_NAME[m.provider] ?? m.provider} en otra cuenta de MatchMate.`,
    icon: createElement(ShieldAlert, { className: 'size-[18px]' }),
    action: { label: 'Ver', to: `/esports/mi-id?juego=${encodeURIComponent(m.game)}` },
    dismissible: true,
    onDismiss: () => onSeen(m.id),
  };
}

/** Propone el aviso de «Tu ID pasó a otra cuenta» al NoticeSlot de la pantalla (Hoy, Esports, Mi ID). */
export function useEsportsIdMoveNotice(uid: string | null | undefined): void {
  const moves = useMyIdMoves(uid);
  useNotice(esportsIdMoveNotice(moves.data));
}

/** El juego de todo lo de esports de la cuenta si es uno solo (sus equipos e inscripciones); null si son varios o ninguno. */
export function onlyGame(games: readonly (string | null | undefined)[]): GameId | null {
  const set = new Set(games.filter(isGameId));
  return set.size === 1 ? [...set][0] : null;
}

/**
 * ¿Juega esports esta cuenta? (sus equipos o inscripciones; las mismas lecturas que la pantalla de esports). `game`: si
 * todo es de un solo juego, ese (la fila lleva su monograma).
 */
export function useEsportsPresence(uid: string | null | undefined, active: SportId | null): { show: boolean; loading: boolean; game: GameId | null } {
  const teams = useMyEsportsTeams(uid);
  const entries = useMyEsportsEntries(uid);
  return {
    show: !!uid && showsEsportsRow({ active, teams: teams.data.length, entries: entries.data.length }),
    loading: teams.loading || entries.loading,
    game: onlyGame([...teams.data.map((t) => t.game), ...entries.data.map((e) => e.game)]),
  };
}

/** Lo de esports en Hoy: si va la fila (y su juego, si es uno solo), y el aviso de un ID que pasó a otra cuenta (al NoticeSlot). */
export function useEsportsHome(uid: string | null | undefined, active: SportId | null): { show: boolean; game: GameId | null } {
  const presence = useEsportsPresence(uid, active);
  useEsportsIdMoveNotice(uid);
  return { show: presence.show, game: presence.game };
}

/**
 * La fila que lleva a Esports (`/esports`), en su tarjeta, en el violeta del deporte: el monograma del juego si todo lo
 * tuyo es de uno solo (`game`); si no, el control.
 */
export function EsportsRowCard({
  title,
  subtitle,
  game,
  pro,
  className,
}: {
  title: string;
  subtitle: string;
  game?: GameId | null;
  pro?: boolean;
  className?: string;
}) {
  return (
    <Card className={cx('overflow-hidden', className)}>
      <ListRow
        dense={pro}
        leading={<SportMark sport="esports" game={game} label={game ? undefined : null} />}
        title={title}
        subtitle={subtitle}
        to="/esports"
      />
    </Card>
  );
}
