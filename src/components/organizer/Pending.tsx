import { useLeaguePending, type LeaguePending } from '../../lib/data/organizer';
import { useLeagueCtx } from '../../lib/league';
import type { Notice } from '../../lib/notices';
import type { LeagueKind } from '../../lib/types';
import { useProSuggestion } from '../mode';
import { NoticeSlot, useNotice } from '../NoticeSlot';
import { organizeUrl } from './hubLogic';
import { pendingLine, showPendingCard } from './logic';

/**
 * El aviso del inicio de la liga para quien la organiza (va al NoticeSlot, nunca como cartel aparte): lo que espera
 * por él («2 juegos por aprobar · Ver», el de más prioridad) o, con la liga nueva y nada pendiente, los primeros pasos
 * («Tu liga nueva · Primeros pasos: 2 de 4 · Seguir», una pista). El id cambia con el número: si lo cierra y llega algo
 * más, vuelve a salir. null = nada que decir.
 */
export function pendingNotice(p: LeaguePending | null | undefined, lid: string, _base: string, kind: LeagueKind | undefined): Notice | null {
  if (!p || !showPendingCard(p)) return null;
  // A Organizar de esta liga, con «Por hacer» arriba.
  const to = organizeUrl(lid);
  if (p.total > 0) return { id: `pendientes:${lid}:${p.total}`, kind: 'admin', title: pendingLine(p), action: { label: 'Ver', to } };
  return {
    id: `primeros-pasos:${lid}:${p.checklist?.done ?? 0}`,
    kind: 'tip',
    title: kind === 'torneo' ? 'Tu torneo nuevo' : 'Tu liga nueva',
    text: pendingLine(p),
    action: { label: 'Seguir', to },
  };
}

/**
 * Inicio de la liga, solo para quien la organiza: su lugar del aviso (NoticeSlot) con lo pendiente o los primeros pasos
 * y, si está en Lite, la sugerencia «Organizas esta liga · Probar Pro». Sale uno solo, el más importante (instalar la
 * app o permitir los avisos le ganan a la sugerencia y a la pista). A los demás no les pide nada.
 */
export function PendingHomeCard() {
  const { lid, league, isAdmin, base } = useLeagueCtx();
  const p = useLeaguePending(isAdmin ? lid : null).data;
  useNotice(isAdmin && pendingNotice(p, lid, base, league.kind));
  useProSuggestion({ title: 'Organizas esta liga', enabled: isAdmin });
  if (!isAdmin) return null;
  return <NoticeSlot className="animate-fade-up" />;
}
