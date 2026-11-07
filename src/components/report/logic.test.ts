/**
 * Lo puro de los reportes de la liga (logic.ts): el color del motivo, cómo quedó, las preguntas antes de decidir, el
 * segmentado y la lista vacía. Datos ficticios.
 */
import { describe, expect, it } from 'vitest';
import {
  attendNoteHint,
  deleteCommentConfirm,
  dismissConfirm,
  othersText,
  reasonTone,
  reportFilterOptions,
  reportsEmptyText,
  resolvedText,
  resolvedToast,
} from './logic';

const NOW = Date.parse('2026-11-06T15:00:00Z');

describe('reportes: lo puro', () => {
  it('lo grave en rojo, lo dudoso en amarillo', () => {
    expect(reasonTone('menores')).toBe('danger');
    expect(reasonTone('acoso')).toBe('danger');
    expect(reasonTone('ofensivo')).toBe('warn');
    expect(reasonTone('falso')).toBe('warn');
    expect(reasonTone('spam')).toBe('neutral');
  });

  it('cómo quedó: quién y cuándo; abierto, nada', () => {
    expect(resolvedText({ status: 'open', handledByName: null, handledAt: null }, NOW)).toBeNull();
    expect(resolvedText({ status: 'dismissed', handledByName: 'Juan Pérez', handledAt: '2026-11-06T13:00:00Z' }, NOW)).toBe('Descartado por Juan Pérez · hace 2 h');
    expect(resolvedText({ status: 'actioned', handledByName: null, handledAt: null }, NOW)).toBe('Atendido');
  });

  it('los demás de lo mismo se cierran también (y se dice)', () => {
    expect(othersText(1)).toBe('');
    expect(othersText(3)).toBe(' y los otros 2 de lo mismo');
    expect(dismissConfirm({ sameTarget: 2 }).message).toBe('Queda cerrado sin hacer nada y los otros 1 de lo mismo. Si vuelve a pasar, lo pueden reportar otra vez.');
    expect(attendNoteHint({ sameTarget: 1 })).toBe(' Queda anotado en el reporte.');
    expect(resolvedToast('actioned')).toBe('Reporte atendido');
    expect(resolvedToast('dismissed')).toBe('Reporte descartado');
  });

  it('borrar el comentario: lo que dice, o que se borra para todos', () => {
    expect(deleteCommentConfirm({ target: { title: 'Comentario de Jugador Uno', text: 'Texto de ejemplo', url: null, userId: null, userName: null, leagueId: null, leagueName: null, sport: null } }).message).toBe(
      '“Texto de ejemplo”',
    );
    expect(deleteCommentConfirm({ target: null })).toMatchObject({ message: 'Se borra para todos.', confirmText: 'Borrar', danger: true });
  });

  it('el segmentado con cuántos hay y la lista vacía', () => {
    expect(reportFilterOptions(0, 0).map((o) => o.label)).toEqual(['Abiertos', 'Cerrados']);
    expect(reportFilterOptions(2, 3).map((o) => o.label)).toEqual(['Abiertos (2)', 'Cerrados (1)']);
    expect(reportsEmptyText('open').title).toBe('Nada por revisar');
    expect(reportsEmptyText('closed').title).toBe('Todavía no hay reportes cerrados');
  });
});
