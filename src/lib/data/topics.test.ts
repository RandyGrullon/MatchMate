import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BowlingEvent } from '../types';
import { queryClient } from './client';
import { createEvent, eventTags, fetchEvent } from './events';
import { keys } from './keys';
import { createLeague, getInviteCode, joinLeague } from './leagues';
import type { Wire } from './stamp';
import { eventTopics, watchTopicFor } from './topics';
import { openWorld, type TestWorld } from './testkit';

/**
 * La pantalla de un evento se pone al día sola, como con Firestore: el juego que sumó otro jugador en la práctica
 * (o el nombre y el anuncio que cambió el admin) avisa por el canal de la liga, no por el del evento.
 */

let w: TestWorld;
let lid: string;
let practice: string;

async function until(ok: () => boolean, ms = 5000) {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error('no llegó a tiempo');
    await new Promise((r) => setTimeout(r, 20));
  }
}

beforeAll(async () => {
  w = await openWorld();
  const owner = await w.signUp('rosa@x.com', 'Rosa Dueña');
  const ana = await w.signUp('ana@x.com', 'Ana Pérez');
  await w.as('rosa@x.com');
  lid = await createLeague(
    { uid: owner, name: 'Rosa' },
    {
      name: 'Liga de los jueves',
      kind: 'liga',
      visibility: 'private',
      venue: '',
      schedule: '',
      seasonStart: '',
      seasonEnd: '',
      contactName: '',
      contactPhone: '',
      requirePhoto: false,
    },
  );
  practice = await createEvent(lid, {
    type: 'practica',
    name: '',
    date: '2026-10-01',
    games: 3,
    hcpBase: 0,
    hcpPercent: 0,
    individualRankBy: 'scratch',
    teamRankBy: 'scratch',
    categoryCuts: [200, 175, 160],
    teamSize: 0,
    announcement: '',
  });
  const code = (await getInviteCode(lid))!;
  await w.as('ana@x.com');
  await joinLeague(lid, { uid: ana, name: 'Ana' }, code);
}, 120_000);

afterAll(async () => {
  await w.close();
});

describe('pantalla del evento en vivo', () => {
  it('con cuenta escucha el evento y la liga; sin cuenta, solo el evento (que se consulta)', () => {
    expect(eventTopics(lid, practice, true)).toEqual([`event:${practice}`, `league:${lid}`]);
    expect(eventTopics(lid, practice, false)).toEqual([`event:${practice}`]);
    expect(eventTopics(undefined, practice, true)).toEqual([]);
  });

  it('el juego que suma otro jugador en la práctica aparece sin volver a la app', async () => {
    const key = keys.event(lid, practice);
    const games = () => queryClient.getQueryData<Wire<BowlingEvent> | null>(key)?.games;
    const stop = queryClient.observe(key, () => fetchEvent(lid, practice), { tags: eventTags(lid, practice), initial: null }, () => undefined);
    const release = eventTopics(lid, practice, true).map((t) => watchTopicFor(t, lid));
    try {
      await until(() => games() === 3);
      // Otro teléfono suma el juego 4 (lo que hace add_practice_game).
      await w.b.db.query('update public.events set games = games + 1 where id = $1', [practice]);
      await until(() => games() === 4);
      // El admin cambia el anuncio: también llega.
      await w.b.db.query("update public.events set announcement = 'Hoy a las 8' where id = $1", [practice]);
      await until(() => queryClient.getQueryData<Wire<BowlingEvent> | null>(key)?.announcement === 'Hoy a las 8');
    } finally {
      release.forEach((r) => r());
      stop();
    }
  });
});
