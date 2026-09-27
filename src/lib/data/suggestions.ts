import type { Suggestion } from '../types';
import { invalidate, rpc, select, updateCached, useLive, type Live } from './client';
import { keys, tags } from './keys';
import { toSuggestion, type SuggestionRow } from './rows';
import type { Wire } from './stamp';

// ---------- Buzón de sugerencias (anónimo) ----------

export const MAX_SUGGESTION = 1000;
/** Segundos entre dos sugerencias de la misma persona (la base lo exige). */
export const SUGGESTION_PACE_S = 60;

/**
 * Deja una nota en el buzón de la liga. La base no guarda quién la escribió: solo el mensaje y la fecha
 * (el ritmo, una por minuto, se lleva aparte y nadie lo puede leer). `uid` queda por compatibilidad.
 */
export async function sendSuggestion(lid: string, _uid: string, text: string): Promise<string> {
  const id = await rpc<string>('send_suggestion', { p_league: lid, p_text: text.trim().slice(0, MAX_SUGGESTION) });
  invalidate(tags.suggestions(lid));
  return id;
}

export const fetchSuggestions = async (lid: string): Promise<Wire<Suggestion>[]> =>
  (
    await select<SuggestionRow>({
      table: 'suggestions',
      filters: [{ col: 'league_id', op: 'eq', value: lid }],
      order: [{ col: 'created_at', asc: false }],
    })
  ).map(toSuggestion);

/** Organizadores: las notas del buzón (las nuevas primero). */
export const useSuggestions = (lid: string | undefined): Live<Suggestion[]> =>
  useLive<Suggestion[]>(lid ? keys.suggestions(lid) : null, lid ? { kind: 'suggestions', lid } : null, () => fetchSuggestions(lid!), {
    initial: [],
    tags: lid ? [tags.league(lid), tags.suggestions(lid)] : [],
  });

const afterNotes = (lid: string) => invalidate(tags.suggestions(lid), tags.feeds);

export async function markSuggestions(lid: string, ids: string[], read: boolean) {
  if (!ids.length) return;
  updateCached<Wire<Suggestion>[]>('suggestions', (list, d) => (d.lid === lid ? list.map((s) => (ids.includes(s.id) ? { ...s, read } : s)) : list));
  try {
    await rpc<number>('mark_suggestions_read', { p_ids: ids, p_read: read });
  } finally {
    afterNotes(lid);
  }
}

export async function deleteSuggestion(lid: string, id: string) {
  await rpc<boolean>('delete_suggestion', { p_suggestion: id });
  afterNotes(lid);
}
