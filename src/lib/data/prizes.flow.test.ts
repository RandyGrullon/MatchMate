import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { unitsTaken } from '../../components/badges/maker/design';
import { changeOf, deliveredText, initialPicks, payloadOf, planDelivery, prizesGiven, togglePlayer } from '../../prizes/award';
import { bowlingComp, prizeTitle } from '../../prizes/catalog';
import { bowlingPodium, refsOf } from '../../prizes/providers';
import type { BowlingEvent } from '../types';
import { fetchEntriesOfEvents } from './entries';
import { fetchEvent } from './events';
import { fetchLeagueBadges, saveLeagueBadge, type LeagueBadge } from './leagueBadges';
import {
  closeTournamentPrizes,
  deliverTournamentPrizes,
  fetchTournamentPodium,
  fetchTournamentPrize,
  prizeCode,
  prizeErrorText,
  setTournamentPrizes,
  type TournamentPrize,
} from './prizes';
import { openWorld, type TestWorld } from './testkit';

/**
 * Premios del torneo del boliche contra la base de verdad (PGlite con las migraciones): la liga de rosa (dueña), con
 * pedro de admin (juega y gana: se entrega su premio), ana y luis de miembros y un invitado sin cuenta. Lo que mandan
 * «Elegir premios» y «Entregar premios» llega a las RPC de 20260929001200_premios_torneo.sql, y el podio del teléfono
 * (bowlingStandings) es el mismo que el del servidor.
 */

let w: TestWorld;
let lid: string;
let ev: string;
let tA: string;
let tB: string;
const pl: Record<string, string> = {};
let champ: LeagueBadge;
let sub: LeagueBadge;
let prize: TournamentPrize;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await w.b.db.query<T>(sql, params)).rows;

async function code(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return prizeCode(e) ?? (e instanceof Error ? e.message : String(e));
  }
}

const nameOf = (id: string) => Object.entries(pl).find(([, v]) => v === id)?.[0] ?? 'Jugador';

/** El evento y sus participaciones como los lee la pantalla. */
async function screen() {
  const event = (await fetchEvent(lid, ev)) as unknown as BowlingEvent;
  const entries = await fetchEntriesOfEvents(lid, [ev]);
  return { event, entries };
}

beforeAll(async () => {
  w = await openWorld();
  const rosa = await w.signUp('rosa@x.com', 'Rosa');
  const pedro = await w.signUp('pedro@x.com', 'Pedro');
  const ana = await w.signUp('ana@x.com', 'Ana');
  const luis = await w.signUp('luis@x.com', 'Luis');
  [{ id: lid }] = await q<{ id: string }>(
    `insert into public.leagues (sport, kind, visibility, name, owner_id, venue, schedule, season_start, season_end, contact_name, contact_phone, require_photo)
     values ('bowling', 'liga', 'private', 'Liga Los Pinos', $1, 'Bolera', 'Martes', '2026-01-01', '2026-12-31', 'Rosa', '18095550000', true) returning id`,
    [rosa],
  );
  await q(
    `insert into public.league_members (league_id, user_id, role, display_name)
     values ($1, $2, 'owner', 'Rosa'), ($1, $3, 'admin', 'Pedro'), ($1, $4, 'member', 'Ana'), ($1, $5, 'member', 'Luis')`,
    [lid, rosa, pedro, ana, luis],
  );
  for (const [k, uid] of [
    ['rosa', rosa],
    ['pedro', pedro],
    ['ana', ana],
    ['luis', luis],
    ['carlos', null],
  ] as const) {
    [{ id: pl[k] }] = await q<{ id: string }>(`insert into public.players (league_id, name, user_id) values ($1, $2, $3) returning id`, [lid, k, uid]);
  }
  // Torneo de ayer (en la zona de la liga), 230/80 %, sin reglas escritas: equipos por scratch, individual con handicap.
  [{ id: ev }] = await q<{ id: string }>(
    `insert into public.events (league_id, type, name, date, games, hcp_base, hcp_percent, team_size)
     values ($1, 'torneo', 'Copa Aniversario', private.signup_today($1) - 1, 3, 230, 80, 2) returning id`,
    [lid],
  );
  const team = async (name: string, order: number) =>
    (await q<{ id: string }>('insert into public.teams (league_id, event_id, name, sort_order) values ($1, $2, $3, $4) returning id', [lid, ev, name, order]))[0].id;
  tA = await team('Los Strikers', 1);
  tB = await team('Los Spares', 2);
  const bowl = (pid: string, teamId: string | null, average: number, scores: (number | null)[], photos?: (string | null)[]) =>
    q(
      `insert into public.entries (league_id, event_id, player_id, team_id, average, scores, photos) values ($1, $2, $3, $4, $5, $6, $7)`,
      [lid, ev, pid, teamId, average, scores, photos ?? scores.map((s) => (s == null ? null : 'foto'))],
    );
  // Scratch: Los Spares (pedro 690 + ana 540 = 1230) le ganan a Los Strikers (luis 600 + rosa 570 = 1170).
  // Con handicap: pedro 690 + 72 = 762, luis 600 + 120 = 720, rosa 570 + 144 = 714, ana 540 + 216 = 756.
  await bowl(pl.pedro, tB, 200, [230, 220, 240]);
  await bowl(pl.ana, tB, 140, [180, 180, 180]);
  await bowl(pl.luis, tA, 180, [200, 210, 190]);
  await bowl(pl.rosa, tA, 170, [190, 190, 190]);
  // Un borrador (sin foto) no cuenta.
  await bowl(pl.carlos, null, 150, [300, null, null], [null, null, null]);
}, 120_000);

afterAll(async () => {
  await w?.close();
});

describe('premios del torneo del boliche (capa de datos)', () => {
  it('la dueña elige los premios: la cinta es el mes del torneo y los títulos, la regla (iguales en el teléfono)', async () => {
    await w.as('rosa@x.com');
    const payload = (name: string, template: string) => ({ template, name, shape: 'shield', palette: 'oro' as const, icon: 'trophy', top_text: 'TORNEO', period_text: '', limit_kind: 'unica' as const });
    champ = await saveLeagueBadge(lid, null, payload('Campeón', 'champion'));
    sub = await saveLeagueBadge(lid, null, payload('Subcampeón', 'runner_up'));
    const saved = await setTournamentPrizes({
      lid,
      scope: 'evento',
      refId: ev,
      period: null,
      slots: [
        { category: 'equipo', place: 1, badgeId: champ.id },
        { category: 'individual', place: 1, badgeId: champ.id },
        { category: 'individual', place: 2, badgeId: sub.id },
      ],
    });
    expect(saved).not.toBeNull();
    prize = saved!;
    const { event } = await screen();
    const [{ p }] = await q<{ p: string }>(`select upper(to_char(date, 'TMMon YYYY')) as p from public.events where id = $1`, [ev]);
    expect(prize.period).toMatch(/^[A-Z]{3} \d{4}$/);
    expect(prize.period.slice(-4)).toBe(p.slice(-4));
    expect(prize.slots.map((s) => [s.category, s.place, s.title])).toEqual([
      ['equipo', 1, 'Equipos (scratch)'],
      ['individual', 1, 'Individual (handicap)'],
      ['individual', 2, 'Individual (handicap)'],
    ]);
    const comp = bowlingComp(lid, event);
    expect(prize.slots.map((s) => prizeTitle(s, comp))).toEqual(prize.slots.map((s) => s.title));
    // Lo mismo leído directo de las tablas (la tarjeta), también por un miembro.
    await w.as('ana@x.com');
    const read = await fetchTournamentPrize(lid, 'evento', ev);
    expect(read).toMatchObject({ id: prize.id, leagueId: lid, scope: 'evento', refId: ev, period: prize.period, closedAt: null });
    expect(read!.slots.map((s) => [s.id, s.badgeId, s.deliveredAt, s.title])).toEqual(prize.slots.map((s) => [s.id, s.badgeId, null, '']));
    // Un miembro no elige premios.
    expect(await code(setTournamentPrizes({ lid, scope: 'evento', refId: ev, slots: [] }))).toBe('no_permitido');
  });

  it('el podio del servidor es el del teléfono (equipos por scratch, individual con handicap)', async () => {
    await w.as('pedro@x.com');
    const server = await fetchTournamentPodium(prize.id);
    expect(server).toMatchObject({ prizeId: prize.id, kind: 'bowling', verified: true });
    const { event, entries } = await screen();
    const phone = bowlingPodium(event, entries, nameOf);
    for (const slot of prize.slots) {
      const s = server.slots.find((x) => x.slotId === slot.id)!;
      const mine = phone(slot)!;
      expect([s.status, refsOf(s.units)], `${slot.category} ${slot.place}`).toEqual([mine.status, refsOf(mine.units)]);
      for (const u of s.units) expect(u.players.map((p) => p.id).sort()).toEqual(mine.units.find((x) => x.ref === u.ref)!.players.map((p) => p.id).sort());
    }
    expect(refsOf(server.slots[0].units)).toEqual([`t:${tB}`]);
    expect(refsOf(server.slots[1].units)).toEqual([`p:${pl.pedro}`]);
    expect(refsOf(server.slots[2].units)).toEqual([`p:${pl.ana}`]);
  });

  it('entregar: el admin que ganó se entrega su premio; otra vez no cambia nada; los premios no usan el cupo', async () => {
    await w.as('pedro@x.com');
    const server = await fetchTournamentPodium(prize.id);
    const comp = bowlingComp(lid, (await screen()).event);
    const plans = planDelivery(prize, server, { comp, myPlayers: [pl.pedro] });
    const payload = payloadOf(plans, initialPicks(plans));
    const res = await deliverTournamentPrizes(prize, payload, false);
    expect(res).toMatchObject({ added: 4, revoked: 0, unchanged: 0, notified: 0 });
    expect(deliveredText(res, prizesGiven(plans, payload))).toBe('Entregaste 3 premios a 4 jugadores.');
    prize = res.prize!;
    expect(prize.slots.every((s) => s.deliveredAt && s.verified && s.editableUntil)).toBe(true);
    expect(prize.slots[0].winners).toEqual([{ ref: `t:${tB}`, name: 'Los Spares', teamId: tB, players: expect.arrayContaining([pl.pedro, pl.ana]) }]);

    const rows = await q<{ player_id: string; team_id: string | null; division: string; note: string; period: string }>(
      'select player_id, team_id, division, note, period from public.league_badge_awards where prize_slot_id = $1 order by player_id',
      [prize.slots[0].id],
    );
    expect(rows.map((r) => [r.team_id, r.period, r.note])).toEqual([
      [tB, prize.period, '1.er lugar · Equipos (scratch) · Copa Aniversario'],
      [tB, prize.period, '1.er lugar · Equipos (scratch) · Copa Aniversario'],
    ]);

    // Lo que ve el creador: los otorgamientos dicen de qué lugar salieron y no cuentan para el cupo de la Única.
    const made = await fetchLeagueBadges(lid);
    expect(made.awards.filter((a) => a.prizeSlotId).length).toBe(4);
    expect(unitsTaken(champ, made.awards, prize.period, '')).toBe(0);
    expect(made.designs.find((d) => d.id === champ.id)).toMatchObject({ locked: true });

    // Otra vez lo mismo: nada cambia.
    const again = await deliverTournamentPrizes(prize, payload, false);
    expect(again).toMatchObject({ added: 0, revoked: 0, unchanged: 4 });
    expect(deliveredText(again, 0)).toBe('No había nada que cambiar.');
  });

  it('corregir: desmarcar quita; un ref que el servidor no tiene es «podio_cambio»; un lugar entregado no se cambia al elegir', async () => {
    await w.as('pedro@x.com');
    const server = await fetchTournamentPodium(prize.id);
    const comp = bowlingComp(lid, (await screen()).event);
    const plans = planDelivery(prize, server, { comp });
    let picks = initialPicks(plans);
    picks = togglePlayer(picks, prize.slots[0].id, `t:${tB}`, pl.ana);
    const payload = payloadOf(plans, picks);
    expect(changeOf(plans[0], payload)).toMatchObject({ remove: [pl.ana], add: [] });
    const res = await deliverTournamentPrizes(prize, payload, false);
    expect(res).toMatchObject({ added: 0, revoked: 1 });
    expect(deliveredText(res, 0)).toBe('Quitaste el premio a 1 jugador.');
    // Lo quitado por corrección vuelve marcado (no es «a mano» del dueño).
    const next = planDelivery(res.prize!, await fetchTournamentPodium(prize.id), { comp });
    expect(initialPicks(next)[prize.slots[0].id].players[`t:${tB}`].sort()).toEqual([pl.ana, pl.pedro].sort());

    const e = await code(deliverTournamentPrizes(prize, [{ slotId: prize.slots[1].id, units: [{ ref: `p:${pl.luis}`, players: [pl.luis] }] }], false));
    expect(e).toBe('podio_cambio');
    expect(prizeErrorText(new Error('x'))).toBe('No se pudo guardar. Intenta de nuevo.');

    await w.as('rosa@x.com');
    const err = await setTournamentPrizes({ lid, scope: 'evento', refId: ev, slots: [{ category: 'equipo', place: 1, badgeId: champ.id }] }).catch((x: unknown) => x);
    expect(prizeCode(err)).toBe('ya_entregado');
    expect(prizeErrorText(err)).toBe('Ese premio ya se entregó. Quítalo primero para cambiarlo.');
  });

  it('cerrar: desde ahí un admin no corrige (el dueño sí)', async () => {
    await w.as('pedro@x.com');
    await closeTournamentPrizes(prize);
    const read = (await fetchTournamentPrize(lid, 'evento', ev))!;
    expect(read.closedAt).not.toBeNull();
    const err = await deliverTournamentPrizes(read, [{ slotId: read.slots[0].id, units: [] }], false).catch((x: unknown) => x);
    expect(prizeCode(err)).toBe('cerrado');
    expect(prizeErrorText(err)).toBe('Los premios de este torneo ya se cerraron. Solo el dueño puede corregirlos.');
    await w.as('rosa@x.com');
    const podium = await fetchTournamentPodium(read.id);
    const comp = bowlingComp(lid, (await screen()).event);
    const owner = planDelivery(read, podium, { comp, owner: true });
    expect(owner.every((p) => !p.locked)).toBe(true);
    expect(planDelivery(read, podium, { comp }).every((p) => p.locked)).toBe(true);
    const res = await deliverTournamentPrizes(read, payloadOf(owner, initialPicks(owner)), false);
    expect(res.added).toBe(1);
  });
});
