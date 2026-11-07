/**
 * Lo que no es pantalla de los reportes (ReportItem.tsx, LeagueReportsPanel.tsx y la app del teléfono): el color del
 * motivo, cómo quedó un reporte cerrado, las preguntas antes de decidir, los avisos y lo que dice la lista vacía.
 * Funciones puras, con prueba en logic.test.ts. Los datos y las RPC están en src/lib/data/reports.ts.
 */
import { relativeTime } from '../../lib/notifications';
import type { Report, ReportFilter, ReportReason } from '../../lib/data/reports';

export type ReasonTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger';

/** Color del motivo: lo grave en rojo. */
export function reasonTone(reason: ReportReason): ReasonTone {
  if (reason === 'menores' || reason === 'acoso') return 'danger';
  if (reason === 'ofensivo' || reason === 'falso') return 'warn';
  return 'neutral';
}

/** Cómo quedó un reporte cerrado: «Descartado por Ana · hace 2 h». */
export function resolvedText(r: Pick<Report, 'status' | 'handledByName' | 'handledAt'>, now = Date.now()): string | null {
  if (r.status === 'open') return null;
  const what = r.status === 'actioned' ? 'Atendido' : 'Descartado';
  const who = r.handledByName ? ` por ${r.handledByName}` : '';
  const when = r.handledAt && Number.isFinite(Date.parse(r.handledAt)) ? ` · ${relativeTime(Date.parse(r.handledAt), now)}` : '';
  return `${what}${who}${when}`;
}

/** « y los otros 2 de lo mismo» (los demás reportes abiertos de lo mismo también se cierran), o nada. */
export const othersText = (sameTarget: number) => (sameTarget > 1 ? ` y los otros ${sameTarget - 1} de lo mismo` : '');

export interface ReportConfirm {
  title: string;
  message: string;
  confirmText: string;
  danger?: boolean;
}

/** «Descartar»: queda cerrado sin hacer nada (y los demás de lo mismo). */
export const dismissConfirm = (r: Pick<Report, 'sameTarget'>): ReportConfirm => ({
  title: '¿Descartar el reporte?',
  message: `Queda cerrado sin hacer nada${othersText(r.sameTarget)}. Si vuelve a pasar, lo pueden reportar otra vez.`,
  confirmText: 'Descartar',
});

/** «Borrar comentario»: lo que dice el comentario (si se ve) o que se borra para todos. */
export const deleteCommentConfirm = (r: Pick<Report, 'target'>): ReportConfirm => ({
  title: '¿Borrar el comentario?',
  message: r.target?.text ? `“${r.target.text}”` : 'Se borra para todos.',
  confirmText: 'Borrar',
  danger: true,
});

/** El aviso después de decidir. */
export const resolvedToast = (status: 'dismissed' | 'actioned') => (status === 'actioned' ? 'Reporte atendido' : 'Reporte descartado');

/** «Marcar como atendido»: la pregunta de la nota y su ejemplo. */
export const ATTEND_NOTE_LABEL = '¿Qué se hizo?';
export const attendNoteHint = (r: Pick<Report, 'sameTarget'>) => ` Queda anotado en el reporte${othersText(r.sameTarget)}.`;
export const ATTEND_NOTE_PLACEHOLDER = 'Hablé con el admin y borró el comentario.';

/** Lo que va arriba de la lista de la liga: quién lo ve y que nadie sabe quién reportó. */
export const LEAGUE_REPORTS_INTRO = 'Comentarios, avisos, juegos y publicaciones de tu liga. Nadie sabe quién los reportó.';

/** El segmentado «Qué reportes ver»: abiertos y cerrados, con cuántos hay de cada uno. */
export function reportFilterOptions(open: number, all: number): { key: Exclude<ReportFilter, 'all'>; label: string }[] {
  const closed = Math.max(0, all - open);
  return [
    { key: 'open', label: open > 0 ? `Abiertos (${open})` : 'Abiertos' },
    { key: 'closed', label: closed > 0 ? `Cerrados (${closed})` : 'Cerrados' },
  ];
}

/** La lista vacía de la liga, abiertos o cerrados. */
export function reportsEmptyText(filter: Exclude<ReportFilter, 'all'>): { title: string; text: string } {
  return filter === 'open'
    ? { title: 'Nada por revisar', text: 'Cuando alguien reporte algo de tu liga, sale aquí.' }
    : { title: 'Todavía no hay reportes cerrados', text: 'Los que descartes o atiendas quedan aquí.' };
}
