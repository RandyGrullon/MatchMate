/**
 * El mismo mundo de tests/reglas.test.ts (BowlingX), armado como superusuario (como withSecurityRulesDisabled):
 *
 * - Liga privada "priv" (exige foto): dueño org, admin sofi, miembro luis (jugador luis), miembro ana sin
 *   jugador; jugador pedro sin cuenta; práctica e1 (3 juegos) con la participación de luis ([150], borrador);
 *   código ABCD2345.
 * - Liga pública "pub" de otro dueño (otro), que no exige foto: jugador p1 sin cuenta y torneo e9.
 * - Cuentas sin liga: nuevo (u-new), otra, extra; superadmins dios y dios2 (sembrados por SQL).
 * - `withCopa`: torneo sin liga "copa" (público) para los anotadores.
 */
import type { TestDb } from './harness';

export interface World {
  u: {
    org: string;
    sofi: string;
    luis: string;
    ana: string;
    otro: string;
    nuevo: string;
    otra: string;
    extra: string;
    dios: string;
    dios2: string;
  };
  priv: string;
  pub: string;
  code: string;
  p: { pedro: string; luis: string; p1: string };
  e: { e1: string; e9: string };
  /** Participación de luis en e1. */
  e1Luis: string;
}

export interface Copa {
  copa: string;
  t1: string;
  jl: string;
  px: string;
  t1Px: string;
}

async function one(db: TestDb, sql: string, params: unknown[] = []): Promise<string> {
  const rows = await db.admin<{ id: string }>(sql, params);
  return rows[0].id;
}

export async function league(
  db: TestDb,
  owner: string,
  fields: { name: string; visibility: 'public' | 'private'; kind?: 'liga' | 'torneo'; requirePhoto?: boolean; sport?: string; hasMinors?: boolean },
): Promise<string> {
  return one(
    db,
    `insert into public.leagues (sport, kind, visibility, name, owner_id, venue, schedule, season_start, season_end, contact_name,
                                 contact_phone, require_photo, has_minors)
     values ($1, $2, $3, $4, $5, 'Bolera', 'Martes 7 pm', '2026-01-01', '2026-12-31', 'Org', '18095550000', $6, $7) returning id`,
    [fields.sport ?? 'bowling', fields.kind ?? 'liga', fields.visibility, fields.name, owner, fields.requirePhoto ?? true, fields.hasMinors ?? false],
  );
}

export async function member(db: TestDb, lid: string, uid: string, role: 'owner' | 'admin' | 'member', name: string, scorer = false) {
  await db.admin('insert into public.league_members (league_id, user_id, role, display_name, is_scorer) values ($1, $2, $3, $4, $5)', [
    lid,
    uid,
    role,
    name,
    scorer,
  ]);
}

export async function player(db: TestDb, lid: string, name: string, uid: string | null = null): Promise<string> {
  return one(db, 'insert into public.players (league_id, name, user_id) values ($1, $2, $3) returning id', [lid, name, uid]);
}

export async function event(db: TestDb, lid: string, type: 'torneo' | 'practica', date: string, games = 3, name = ''): Promise<string> {
  return one(db, 'insert into public.events (league_id, type, name, date, games) values ($1, $2, $3, $4, $5) returning id', [
    lid,
    type,
    name,
    date,
    games,
  ]);
}

export async function entry(db: TestDb, lid: string, eid: string, pid: string, scores: (number | null)[], photos: (string | null)[]): Promise<string> {
  return one(db, 'insert into public.entries (league_id, event_id, player_id, scores, photos) values ($1, $2, $3, $4, $5) returning id', [
    lid,
    eid,
    pid,
    scores,
    photos,
  ]);
}

export async function makeWorld(db: TestDb): Promise<World> {
  const user = (n: string) => db.createUser(`${n}@x.com`, n);
  const u = {
    org: await user('org'),
    sofi: await user('sofi'),
    luis: await user('luis'),
    ana: await user('ana'),
    otro: await user('otro'),
    nuevo: await user('new'),
    otra: await user('otra'),
    extra: await user('extra'),
    dios: await user('dios'),
    dios2: await user('dios2'),
  };
  // El superadmin se siembra por SQL (ya no hay lista fija admin@admin.com).
  await db.admin('update public.profiles set is_superadmin = true where id = any ($1)', [[u.dios, u.dios2]]);

  const priv = await league(db, u.org, { name: 'Liga del Banco', visibility: 'private', requirePhoto: true });
  await db.admin(`insert into public.league_secrets (league_id, invite_code) values ($1, 'ABCD2345')`, [priv]);
  await member(db, priv, u.org, 'owner', 'org');
  await member(db, priv, u.sofi, 'admin', 'sofi');
  await member(db, priv, u.luis, 'member', 'luis');
  await member(db, priv, u.ana, 'member', 'ana');
  const pedro = await player(db, priv, 'Pedro');
  const pLuis = await player(db, priv, 'Luis', u.luis);
  const e1 = await event(db, priv, 'practica', '2026-09-22');
  const e1Luis = await entry(db, priv, e1, pLuis, [150], [null]);

  const pub = await league(db, u.otro, { name: 'Liga Abierta', visibility: 'public', requirePhoto: false });
  await member(db, pub, u.otro, 'owner', 'otro');
  const p1 = await player(db, pub, 'Jugador Uno');
  const e9 = await event(db, pub, 'torneo', '2026-10-01', 3, 'Copa');

  return { u, priv, pub, code: 'ABCD2345', p: { pedro, luis: pLuis, p1 }, e: { e1, e9 }, e1Luis };
}

/** Torneo sin liga: dueño org, admin sofi, luis anotador (jugador jl), ana miembro; t1 con px inscrito. */
export async function withCopa(db: TestDb, w: World): Promise<Copa> {
  const copa = await league(db, w.u.org, { name: 'Copa', visibility: 'public', kind: 'torneo' });
  await member(db, copa, w.u.org, 'owner', 'org');
  await member(db, copa, w.u.sofi, 'admin', 'sofi');
  await member(db, copa, w.u.luis, 'member', 'luis', true);
  await member(db, copa, w.u.ana, 'member', 'ana');
  const jl = await player(db, copa, 'JL', w.u.luis);
  const px = await player(db, copa, 'PX');
  const t1 = await event(db, copa, 'torneo', '2026-10-01', 3, 'Copa');
  const t1Px = await entry(db, copa, t1, px, [null, null, null], [null, null, null]);
  // En una liga normal la marca de anotador no vale.
  await db.admin('update public.league_members set is_scorer = true where league_id = $1 and user_id = $2', [w.priv, w.u.ana]);
  return { copa, t1, jl, px, t1Px };
}
