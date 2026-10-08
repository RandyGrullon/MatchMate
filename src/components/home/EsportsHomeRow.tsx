import { createElement } from 'react';
import { Gamepad2, ShieldAlert } from 'lucide-react';
import { useMyEsportsEntries, useMyEsportsTeams } from '../../lib/data/esports';
import { seenIdMove, useMyIdMoves, type IdMove } from '../../lib/data/esportsIds';
import { LINK_PROVIDER_NAME, gameMeta } from '../../sports/esports';
import type { SportId } from '../../sports/types';
import { EsportsTint } from '../esports/bits';
import { useNotice, type Notice } from '../NoticeSlot';
import { Card, ListRow, RowIcon, cx } from '../ui';

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

/** ¿Juega esports esta cuenta? (sus equipos o inscripciones; las mismas lecturas que la pantalla de esports). */
export function useEsportsPresence(uid: string | null | undefined, active: SportId | null): { show: boolean; loading: boolean } {
  const teams = useMyEsportsTeams(uid);
  const entries = useMyEsportsEntries(uid);
  return {
    show: !!uid && showsEsportsRow({ active, teams: teams.data.length, entries: entries.data.length }),
    loading: teams.loading || entries.loading,
  };
}

/** Lo de esports en Hoy: si va la fila, y el aviso de un ID que pasó a otra cuenta (lo propone al NoticeSlot de la pantalla). */
export function useEsportsHome(uid: string | null | undefined, active: SportId | null): { show: boolean } {
  const presence = useEsportsPresence(uid, active);
  useEsportsIdMoveNotice(uid);
  return { show: presence.show };
}

/** La fila que lleva a Esports (`/esports`), en su tarjeta, con el control en el violeta del deporte. */
export function EsportsRowCard({ title, subtitle, pro, className }: { title: string; subtitle: string; pro?: boolean; className?: string }) {
  return (
    <Card className={cx('overflow-hidden', className)}>
      <ListRow
        dense={pro}
        leading={
          <EsportsTint>
            <RowIcon tone="accent">
              <Gamepad2 className="size-5" />
            </RowIcon>
          </EsportsTint>
        }
        title={title}
        subtitle={subtitle}
        to="/esports"
      />
    </Card>
  );
}
