import { isValidScore } from '../../lib/stats';
import type { Submission } from '../../lib/types';
import { gamesList } from './board';

/*
 * Aprobar los envíos con un toque, sin nada de la pantalla: lo usan ApprovalCard.tsx de la web (que lo reexporta) y la
 * tarjeta «Por aprobar» de la app del teléfono (movil/src/components/bowling/ApprovalCard.tsx).
 */

/** Lo que se aprueba de un envío con un toque: juego (desde 0) → pinos. */
export interface QuickApproval {
  values: Record<number, number>;
  /** Los juegos, en orden. */
  games: number[];
}

/**
 * Lo que «Aprobar» guarda de un envío sin abrirlo, o null si hay que revisarlo (Organizar › Aprobar, con la foto en
 * grande y lo que leyó la IA): lo leído en la foto o, si no hay, lo anotado (como propone la hoja de aprobar), cada
 * juego en su lugar del evento. Se revisa si lo anotado y lo leído no coinciden, si algún número no vale, si no cabe en
 * el evento o si llegó sin la foto que la liga exige.
 */
export function quickApproval(sub: Pick<Submission, 'scores' | 'scanned' | 'photoId'>, games: number, requirePhoto: boolean): QuickApproval | null {
  if (requirePhoto && !sub.photoId) return null;
  const typed = sub.scores ?? [];
  const scanned = sub.scanned ?? [];
  const values: Record<number, number> = {};
  const idx: number[] = [];
  for (let i = 0; i < Math.max(typed.length, scanned.length); i++) {
    const t = typed[i] ?? null;
    const s = scanned[i] ?? null;
    if (t != null && s != null && t !== s) return null;
    const v = s ?? t;
    if (v == null) continue;
    if (!isValidScore(v) || i >= games) return null;
    values[i] = v;
    idx.push(i);
  }
  return idx.length ? { values, games: idx } : null;
}

/**
 * «Juego 2 · 181» o «Juegos 1 y 2 · 187 · 210» (lo que se aprueba; si hay que revisarlo, lo que anotó). `short`, para un
 * teléfono angosto: «J2», «J1 y J2».
 */
export function gamesText(sub: Pick<Submission, 'scores'>, quick: QuickApproval | null): { label: string; short: string; scores: string } {
  const idx = quick ? quick.games : sub.scores.flatMap((s, i) => (s != null ? [i] : []));
  const scores = idx.map((i) => (quick ? quick.values[i] : sub.scores[i])).join(' · ');
  const short = idx.map((i) => `J${i + 1}`);
  return {
    label: `${idx.length === 1 ? 'Juego' : 'Juegos'} ${gamesList(idx)}`,
    short: short.length > 1 ? `${short.slice(0, -1).join(', ')} y ${short[short.length - 1]}` : (short[0] ?? ''),
    scores,
  };
}

/** El encabezado: «Por aprobar · 2 con foto». */
export function approvalTitle(subs: readonly Pick<Submission, 'photoId'>[]): string {
  const n = subs.length;
  const photos = subs.filter((s) => s.photoId).length;
  return `Por aprobar · ${photos === n ? `${n} con foto` : photos ? `${n} · ${photos} con foto` : `${n} sin foto`}`;
}
