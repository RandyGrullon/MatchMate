import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GameComment, Reaction, Suggestion } from '../types';
import { fetchLive, queryClient, select } from './client';
import { addEntries, fetchEntries } from './entries';
import { createEvent } from './events';
import { fetchLeagueFeeds } from './feeds';
import { keys } from './keys';
import { createLeague, joinLeague } from './leagues';
import { fetchPlayers } from './players';
import { addComment, deleteComment, fetchCommentsOfEvents, fetchReactionsOfEvents, setReaction } from './social';
import { deleteSuggestion, fetchSuggestions, markSuggestions, sendSuggestion } from './suggestions';
import type { Wire } from './stamp';
import { openWorld, type TestWorld } from './testkit';

let w: TestWorld;
let lid: string;
let eventId: string;
let rosaId: string;
let anaId: string;
let rosaEntry: { id: string; eventId: string; playerId: string };

beforeAll(async () => {
  w = await openWorld();
  anaId = await w.signUp('ana@x.com', 'Ana');
  rosaId = await w.signUp('rosa@x.com', 'Rosa');
  lid = await createLeague(
    { uid: rosaId, name: 'Rosa' },
    { name: 'Liga social', kind: 'liga', visibility: 'public', venue: '', schedule: '', seasonStart: '', seasonEnd: '', contactName: '', contactPhone: '', requirePhoto: false },
  );
  eventId = await createEvent(lid, {
    type: 'torneo',
    name: 'Torneo',
    date: '2026-09-01',
    games: 3,
    hcpBase: 230,
    hcpPercent: 80,
    individualRankBy: 'hcp',
    teamRankBy: 'scratch',
    categoryCuts: [200, 175, 160],
    teamSize: 3,
    announcement: '',
  });
  const [rosaPlayer] = await fetchPlayers(lid);
  await addEntries(lid, { id: eventId }, [{ id: rosaPlayer.id, average: 180 }]);
  const [entry] = await fetchEntries(lid, [{ col: 'event_id', op: 'eq', value: eventId }]);
  rosaEntry = entry;
  await w.as('ana@x.com');
  // Liga pública: se une sin código.
  await joinLeague(lid, { uid: anaId, name: 'Ana' }, null);
}, 120_000);

afterAll(async () => {
  await w.close();
});

describe('social y buzón con la base de verdad', () => {
  it('me gusta: se ve de una, cambiarlo no duplica y null lo quita', async () => {
    const key = keys.reactionsOfEvents(lid, [eventId]);
    const load = () => fetchReactionsOfEvents(lid, [eventId]);
    await fetchLive<Reaction[]>(key, { kind: 'reactions', lid, eventIds: [eventId] }, load, { initial: [] });
    const saving = setReaction(lid, rosaEntry, { uid: anaId, name: 'Ana' }, 'like');
    expect(queryClient.getQueryData<Wire<Reaction>[]>(key)).toEqual([expect.objectContaining({ uid: anaId, type: 'like' })]);
    await saving;
    await setReaction(lid, rosaEntry, { uid: anaId, name: 'Ana' }, 'felicitar');
    expect(await load()).toEqual([expect.objectContaining({ uid: anaId, name: 'Ana', type: 'felicitar' })]);
    // A Rosa le llega el aviso en su campana.
    await w.as('rosa@x.com');
    const feeds = await fetchLeagueFeeds([{ id: `${lid}_${rosaId}`, leagueId: lid, uid: rosaId, name: 'Rosa', role: 'owner', playerId: rosaEntry.playerId }], '2000-01-01');
    expect(feeds[0].reactions).toEqual([expect.objectContaining({ uid: anaId, type: 'felicitar', eventId })]);
    await w.as('ana@x.com');
    await setReaction(lid, rosaEntry, { uid: anaId, name: 'Ana' }, null);
    expect(await load()).toEqual([]);
  });

  it('comentarios: se ven de una, uno cada 3 s por persona; el autor o un admin los borra', async () => {
    const key = keys.commentsOfEvents(lid, [eventId]);
    await fetchLive<GameComment[]>(key, { kind: 'comments', lid, eventIds: [eventId] }, () => fetchCommentsOfEvents(lid, [eventId]), { initial: [] });
    const adding = addComment(lid, rosaEntry, { uid: anaId, name: 'Ana' }, '  ¡Qué serie!  ');
    expect(queryClient.getQueryData<Wire<GameComment>[]>(key)).toEqual([expect.objectContaining({ uid: anaId, text: '¡Qué serie!' })]);
    const id = await adding;
    await expect(addComment(lid, rosaEntry, { uid: anaId, name: 'Ana' }, 'Otro')).rejects.toMatchObject({ kind: 'rate_limited' });
    const rows = await select<{ id: string; text: string; author_name: string; user_id: string }>({ table: 'comments', filters: [{ col: 'entry_id', op: 'eq', value: rosaEntry.id }] });
    expect(rows).toEqual([expect.objectContaining({ id, text: '¡Qué serie!', author_name: 'Ana', user_id: anaId })]);
    await w.as('rosa@x.com');
    await deleteComment(lid, id);
    expect(await fetchCommentsOfEvents(lid, [eventId])).toEqual([]);
  });

  it('buzón anónimo: el admin lee la nota sin saber de quién es; el miembro no la ve; una por minuto', async () => {
    await w.as('ana@x.com');
    const id = await sendSuggestion(lid, anaId, 'Más prácticas los jueves');
    await expect(sendSuggestion(lid, anaId, 'Otra')).rejects.toMatchObject({ kind: 'rate_limited' });
    // Quien la escribió no la puede leer (solo los organizadores).
    expect(await fetchSuggestions(lid)).toEqual([]);
    await w.as('rosa@x.com');
    const notes = await fetchSuggestions(lid);
    expect(notes).toEqual([expect.objectContaining({ id, text: 'Más prácticas los jueves', read: false })]);
    // La fila no tiene autor: no hay forma de saber quién la mandó.
    const [raw] = await select<Record<string, unknown>>({ table: 'suggestions', filters: [{ col: 'id', op: 'eq', value: id }] });
    expect(Object.keys(raw).sort()).toEqual(['created_at', 'id', 'league_id', 'read', 'text', 'updated_at']);
    expect(JSON.stringify(raw)).not.toContain(anaId);
    // Marcar leída (con cambio optimista en la caché) y borrar.
    const key = keys.suggestions(lid);
    await fetchLive<Suggestion[]>(key, { kind: 'suggestions', lid }, () => fetchSuggestions(lid), { initial: [] });
    const marking = markSuggestions(lid, [id], true);
    expect(queryClient.getQueryData<Wire<Suggestion>[]>(key)?.[0].read).toBe(true);
    await marking;
    expect((await fetchSuggestions(lid))[0].read).toBe(true);
    await deleteSuggestion(lid, id);
    expect(await fetchSuggestions(lid)).toEqual([]);
  });
});
