/**
 * Legal (20260929000900_legal.sql): versiones de los términos y la privacidad con la aceptación guardada
 * (legal_acceptances, accept_legal, el registro con la casilla, admin_legal_stats) y los reportes de contenido
 * (reports, report_content, resolve_report, list_reports).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, TestDb, fails } from './harness';
import { league, makeWorld, member, player, type World } from './fixture';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let db: TestDb;
let w: World;

beforeAll(async () => {
  db = await TestDb.open();
});
afterAll(async () => {
  await db.pg.close();
});
beforeEach(async () => {
  await db.begin();
  w = await makeWorld(db);
});
afterEach(async () => {
  await db.rollback();
});

type Json = Record<string, any>;

const NEW_RPC = ['accept_legal', 'admin_legal_stats', 'list_reports', 'my_reports', 'report_content', 'resolve_report'];

/** Las versiones de src/lib/legal.ts (la app) leídas del archivo. */
function clientVersions(): { terms: string; privacy: string } {
  const src = readFileSync(join(ROOT, 'src', 'lib', 'legal.ts'), 'utf8');
  const pick = (name: string) => {
    const m = new RegExp(`export const ${name} = '([0-9-]+)'`).exec(src);
    if (!m) throw new Error(`no encontré ${name} en src/lib/legal.ts`);
    return m[1];
  };
  return { terms: pick('TERMS_VERSION'), privacy: pick('PRIVACY_VERSION') };
}

async function versions(): Promise<{ terms: string; privacy: string }> {
  const [{ v }] = await db.admin<{ v: { terms: string; privacy: string } }>('select private.legal_versions() as v');
  return v;
}

const accept = async (who: string) => {
  const v = await versions();
  return db.rpc(who, 'accept_legal', { p_terms: v.terms, p_privacy: v.privacy });
};

const mine = (who: string) =>
  db.asUser<{ doc: string; version: string }>(who, 'select doc, version from public.legal_acceptances order by doc');

const report = (who: string, kind: string, target: string, reason = 'ofensivo', note: string | null = null) =>
  db.rpc<string>(who, 'report_content', { p_kind: kind, p_target: target, p_reason: reason, p_note: note });

async function comment(by: string, text: string, lid = w.priv, entry = w.e1Luis, event = w.e.e1, pid = w.p.luis): Promise<string> {
  const [{ id }] = await db.admin<{ id: string }>(
    `insert into public.comments (league_id, entry_id, event_id, player_id, user_id, author_name, text)
     values ($1, $2, $3, $4, $5, (select name from public.profiles where id = $5), $6) returning id`,
    [lid, entry, event, pid, by, text],
  );
  return id;
}

async function notice(lid: string, by: string, body: string): Promise<string> {
  const [{ id }] = await db.admin<{ id: string }>(
    `insert into public.league_announcements (league_id, body, sent_by, author_name, local_day)
     values ($1, $2, $3, (select name from public.profiles where id = $3), current_date) returning id`,
    [lid, body, by],
  );
  return id;
}

const phone = (uid: string, n: string) =>
  db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')`, [
    uid,
    `https://fcm.googleapis.com/fcm/send/${n}`,
  ]);

describe('permisos de lo nuevo', () => {
  it('solo con sesión, security definer, search_path vacío; nada para anon; las ayudas, nadie', async () => {
    const rows = await db.admin<{ fn: string; definer: boolean; auth: boolean; anon: boolean; sp: boolean }>(
      `select p.proname as fn, p.prosecdef as definer, has_function_privilege('authenticated', p.oid, 'execute') as auth,
              has_function_privilege('anon', p.oid, 'execute') as anon, 'search_path=""' = any (p.proconfig) as sp
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any ($1) order by 1`,
      [NEW_RPC],
    );
    expect(rows).toEqual(NEW_RPC.map((fn) => ({ fn, definer: true, auth: true, anon: false, sp: true })));
    await fails(db.rpc(ANON, 'accept_legal', { p_terms: 'x', p_privacy: 'x' }), '42501');
    await fails(db.rpc(ANON, 'report_content', { p_kind: 'league', p_target: w.pub, p_reason: 'spam' }), '42501');
    await fails(db.rpc(ANON, 'list_reports', {}), '42501');
    await fails(db.rpc(ANON, 'my_reports', {}), '42501');
    for (const fn of ['legal_versions()', 'record_signup_legal()', 'report_reason_label(text)', 'report_kind_label(text)', 'report_target(text, uuid)', 'report_push(uuid)']) {
      expect(await db.admin(`select has_function_privilege('authenticated', 'private.${fn}', 'execute') as ok`), fn).toEqual([{ ok: false }]);
    }
    // Nadie escribe directo en las tablas nuevas.
    for (const t of ['public.legal_acceptances', 'public.reports']) {
      await fails(db.asUser(w.u.dios, `insert into ${t} default values`), '42501');
      await fails(db.asUser(w.u.luis, `delete from ${t}`), '42501');
    }
  });
});

describe('versiones', () => {
  it('la base y la app (src/lib/legal.ts) tienen las mismas versiones', async () => {
    const v = await versions();
    expect(v.terms).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(v.privacy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(clientVersions()).toEqual(v);
  });
});

describe('aceptar los términos y la privacidad', () => {
  it('guarda las dos versiones vigentes una vez (otra vez no cambia nada) y la cuenta las lee', async () => {
    const v = await versions();
    expect(await mine(w.u.luis)).toEqual([]);
    await accept(w.u.luis);
    expect(await mine(w.u.luis)).toEqual([
      { doc: 'privacidad', version: v.privacy },
      { doc: 'terminos', version: v.terms },
    ]);
    const [{ at }] = await db.admin<{ at: Date }>('select min(accepted_at) as at from public.legal_acceptances where user_id = $1', [w.u.luis]);
    await db.admin(`update public.legal_acceptances set accepted_at = accepted_at - interval '2 days' where user_id = $1`, [w.u.luis]);
    await accept(w.u.luis);
    const [{ again }] = await db.admin<{ again: Date }>('select min(accepted_at) as again from public.legal_acceptances where user_id = $1', [w.u.luis]);
    expect(again.getTime()).toBeLessThan(at.getTime());
    expect(await db.count('public.legal_acceptances', 'user_id = $1', [w.u.luis])).toBe(2);
  });

  it('otra versión: invalido (y no guarda nada)', async () => {
    const v = await versions();
    await fails(db.rpc(w.u.luis, 'accept_legal', { p_terms: '2020-01-01', p_privacy: v.privacy }), 'invalido');
    await fails(db.rpc(w.u.luis, 'accept_legal', { p_terms: v.terms, p_privacy: null }), 'invalido');
    await fails(db.rpc(w.u.luis, 'accept_legal', { p_terms: `${v.terms} `, p_privacy: v.privacy }), 'invalido');
    expect(await db.count('public.legal_acceptances')).toBe(0);
  });

  it('guarda el navegador de la cabecera user-agent (recortado a 300); sin cabecera, null', async () => {
    const v = await versions();
    const ua = `Mozilla/5.0 (Linux; Android 14) ${'x'.repeat(400)}`;
    await db.asUser(
      w.u.ana,
      `select public.accept_legal(p_terms => $1, p_privacy => $2) from (select set_config('request.headers', $3, true)) h`,
      [v.terms, v.privacy, JSON.stringify({ 'user-agent': ua })],
    );
    // La cabecera vale hasta el final de la transacción de la prueba: se quita para lo que sigue.
    await db.admin(`select set_config('request.headers', '', true)`);
    const rows = await db.admin<{ ua: string }>('select user_agent as ua from public.legal_acceptances where user_id = $1', [w.u.ana]);
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.ua.startsWith('Mozilla/5.0 (Linux; Android 14)')).toBe(true);
      expect(r.ua.length).toBe(300);
    }
    await accept(w.u.luis);
    expect(await db.admin('select user_agent from public.legal_acceptances where user_id = $1', [w.u.luis])).toEqual([
      { user_agent: null },
      { user_agent: null },
    ]);
  });

  it('una cuenta bloqueada también acepta (aceptar no es escribir en una liga)', async () => {
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.luis, p_reason: 'x' });
    await accept(w.u.luis);
    expect(await mine(w.u.luis)).toHaveLength(2);
  });

  it('cada quien ve solo lo suyo; el superadmin, todo', async () => {
    await accept(w.u.luis);
    await accept(w.u.ana);
    expect(await mine(w.u.org)).toEqual([]);
    expect(await db.asUser(w.u.luis, 'select distinct user_id from public.legal_acceptances')).toEqual([{ user_id: w.u.luis }]);
    expect(await db.asUser(w.u.dios, 'select count(*)::int as n from public.legal_acceptances')).toEqual([{ n: 4 }]);
    await fails(db.asAnon('select * from public.legal_acceptances'), '42501');
  });

  it('se borra con la cuenta y sale sola en «bajar mis datos»', async () => {
    const v = await versions();
    await accept(w.u.luis);
    const d = await db.rpc<Json>(w.u.luis, 'export_my_data');
    const rows = (d.tables as Record<string, Json[]>).legal_acceptances;
    expect(rows.map((r) => [r.doc, r.version]).sort()).toEqual([
      ['privacidad', v.privacy],
      ['terminos', v.terms],
    ]);
    expect(rows[0].user_id).toBe(w.u.luis);
    await db.admin('delete from auth.users where id = $1', [w.u.luis]);
    expect(await db.count('public.legal_acceptances', 'user_id = $1', [w.u.luis])).toBe(0);
  });
});

describe('registro con la casilla «Acepto…»', () => {
  it('con las versiones vigentes en la metadata queda aceptado al crear la cuenta', async () => {
    const v = await versions();
    const uid = await db.createUser('nueva@x.com', 'Nueva', { adult: true, legal: { terms: v.terms, privacy: v.privacy } });
    expect(await mine(uid)).toEqual([
      { doc: 'privacidad', version: v.privacy },
      { doc: 'terminos', version: v.terms },
    ]);
    // Y el perfil igual (la marca de 18 años también).
    expect(await db.admin('select name, adult_confirmed_at is not null as adult from public.profiles where id = $1', [uid])).toEqual([
      { name: 'Nueva', adult: true },
    ]);
  });

  it('sin la casilla, con otra versión o con basura: la cuenta se crea igual y no queda nada aceptado', async () => {
    const v = await versions();
    const cases: Record<string, unknown>[] = [
      {},
      { legal: { terms: '2020-01-01', privacy: v.privacy } },
      { legal: 'si' },
      { legal: { terms: v.terms } },
      { legal: [v.terms, v.privacy] },
    ];
    for (const [i, meta] of cases.entries()) {
      const uid = await db.createUser(`caso${i}@x.com`, `Caso ${i}`, meta);
      expect(await db.count('public.profiles', 'id = $1', [uid])).toBe(1);
      expect(await db.count('public.legal_acceptances', 'user_id = $1', [uid])).toBe(0);
    }
  });
});

describe('consola: quién aceptó', () => {
  it('cuenta las vigentes, las que no aceptaron nada, las de 7 días y por versión', async () => {
    const v = await versions();
    await accept(w.u.luis);
    await accept(w.u.ana);
    // org solo aceptó una versión vieja de los términos.
    await db.admin(`insert into public.legal_acceptances (user_id, doc, version) values ($1, 'terminos', '2020-01-01')`, [w.u.org]);
    // ana aceptó hace 10 días.
    await db.admin(`update public.legal_acceptances set accepted_at = now() - interval '10 days' where user_id = $1`, [w.u.ana]);
    const s = await db.rpc<Json>(w.u.dios, 'admin_legal_stats');
    expect(s).toMatchObject({ terms: v.terms, privacy: v.privacy, accounts: 10, accepted: 2, acceptedTerms: 2, acceptedPrivacy: 2, never: 7, last7d: 1 });
    expect(s.byVersion).toEqual([
      { doc: 'privacidad', version: v.privacy, accounts: 2 },
      { doc: 'terminos', version: v.terms, accounts: 2 },
      { doc: 'terminos', version: '2020-01-01', accounts: 1 },
    ]);
    for (const who of [w.u.org, w.u.luis]) await fails(db.rpc(who, 'admin_legal_stats'), DENIED);
  });
});

describe('reportar', () => {
  it('un comentario: queda abierto, con su liga, y reportarlo otra vez devuelve el mismo', async () => {
    const c = await comment(w.u.luis, 'Eres malísimo');
    const id = await report(w.u.ana, 'comment', c, 'ofensivo', '  Me insultó  ');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await db.admin('select reporter_id, target_kind, league_id, reason, note, status, handled_at from public.reports where id = $1', [id])).toEqual([
      { reporter_id: w.u.ana, target_kind: 'comment', league_id: w.priv, reason: 'ofensivo', note: 'Me insultó', status: 'open', handled_at: null },
    ]);
    expect(await report(w.u.ana, 'comment', c, 'acoso')).toBe(id);
    expect(await db.count('public.reports')).toBe(1);
    // Otra cuenta que lo ve reporta aparte.
    const other = await report(w.u.sofi, 'comment', c, 'acoso');
    expect(other).not.toBe(id);
  });

  it('lo que no existe o no se ve: no_existe (sin decir cuál); lo propio: invalido', async () => {
    const c = await comment(w.u.luis, 'Hola');
    // extra no es de la liga privada: el comentario no se ve.
    await fails(report(w.u.extra, 'comment', c), 'no_existe');
    await fails(report(w.u.extra, 'league', w.priv), 'no_existe');
    await fails(report(w.u.extra, 'game', w.e1Luis), 'no_existe');
    await fails(report(w.u.luis, 'comment', randomUUID()), 'no_existe');
    await fails(report(w.u.luis, 'game', randomUUID()), 'no_existe');
    await fails(report(w.u.luis, 'user', randomUUID()), 'no_existe');
    // extra no comparte liga con luis (que solo está en la privada) ni se siguen: no lo ve.
    await fails(report(w.u.extra, 'user', w.u.luis), 'no_existe');
    // Lo propio no.
    await fails(report(w.u.luis, 'comment', c), 'invalido');
    await fails(report(w.u.luis, 'user', w.u.luis), 'invalido');
    await fails(report(w.u.luis, 'game', w.e1Luis), 'invalido');
    await fails(report(w.u.org, 'league', w.priv), 'invalido');
    // La liga pública la ve cualquiera con sesión.
    expect(await report(w.u.extra, 'league', w.pub, 'spam')).toBeTruthy();
    expect(await db.count('public.reports')).toBe(1);
  });

  it('juegos, avisos y cuentas: con la liga que toca (una cuenta, sin liga)', async () => {
    const a = await notice(w.priv, w.u.sofi, 'Se suspende hoy');
    const game = await report(w.u.ana, 'game', w.e1Luis, 'falso', 'No jugó eso');
    const ann = await report(w.u.luis, 'announcement', a, 'otro');
    const user = await report(w.u.ana, 'user', w.u.luis, 'acoso');
    const rows = await db.admin<{ id: string; league_id: string | null }>('select id, league_id from public.reports order by created_at');
    expect(Object.fromEntries(rows.map((r) => [r.id, r.league_id]))).toEqual({ [game]: w.priv, [ann]: w.priv, [user]: null });
  });

  it('datos que no sirven: invalido', async () => {
    await fails(report(w.u.luis, 'foto', w.priv), 'invalido');
    await fails(report(w.u.luis, 'league', w.priv, 'feo'), 'invalido');
    await fails(report(w.u.luis, 'league', w.priv, 'spam', 'x'.repeat(501)), 'invalido');
    await fails(db.rpc(w.u.luis, 'report_content', { p_kind: 'league', p_target: null, p_reason: 'spam' }), 'invalido');
    // La nota: varias líneas sí, los demás caracteres de control se van; vacía = null.
    const id = await report(w.u.luis, 'league', w.priv, 'otro', 'uno\r\ndos\u0007tres');
    expect(await db.admin('select note from public.reports where id = $1', [id])).toEqual([{ note: 'uno\ndos tres' }]);
    const blank = await report(w.u.ana, 'league', w.priv, 'otro', '   ');
    expect(await db.admin('select note from public.reports where id = $1', [blank])).toEqual([{ note: null }]);
  });

  it('10 reportes nuevos por día; el mismo otra vez no cuenta', async () => {
    const targets = [];
    for (let i = 0; i < 11; i++) targets.push(await comment(w.u.luis, `Comentario ${i}`));
    for (let i = 0; i < 10; i++) await report(w.u.ana, 'comment', targets[i]);
    const first = await report(w.u.ana, 'comment', targets[0]);
    expect(first).toBeTruthy();
    await fails(report(w.u.ana, 'comment', targets[10]), 'rate_limited');
    // Otra cuenta no se ve afectada; al otro día, sí puede.
    await report(w.u.sofi, 'comment', targets[10]);
    await db.admin(`update private.rate_limits set window_start = now() - interval '25 hours' where key = $1`, [`report:${w.u.ana}`]);
    await report(w.u.ana, 'comment', targets[10]);
  });

  it('my_reports («Descargar mis datos»): solo los de la cuenta, con cómo quedaron y sin quién los atendió', async () => {
    const c = await comment(w.u.luis, 'Feo');
    const onComment = await report(w.u.ana, 'comment', c, 'ofensivo', 'Me insultó');
    const onUser = await report(w.u.ana, 'user', w.u.luis, 'acoso');
    await report(w.u.sofi, 'comment', c, 'spam');
    await db.rpc(w.u.dios, 'resolve_report', { p_report: onComment, p_status: 'actioned', p_note: 'Se habló con él.' });
    const rows = await db.rpc<Json[]>(w.u.ana, 'my_reports');
    expect(rows.map((r) => r.id).sort()).toEqual([onComment, onUser].sort());
    expect(rows.find((r) => r.id === onComment)).toEqual({
      id: onComment,
      kind: 'comment',
      targetId: c,
      leagueId: w.priv,
      leagueName: 'Liga del Banco',
      reason: 'ofensivo',
      note: 'Me insultó',
      status: 'actioned',
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      handledAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      actionNote: 'Se habló con él.',
    });
    expect(rows.find((r) => r.id === onUser)).toMatchObject({ kind: 'user', leagueId: null, leagueName: null, status: 'open', handledAt: null });
    // El superadmin (que ve todos en la consola) aquí solo los suyos: ninguno.
    expect(await db.rpc(w.u.dios, 'my_reports')).toEqual([]);
    expect(await db.rpc(w.u.sofi, 'my_reports')).toHaveLength(1);
  });

  it('una cuenta bloqueada no reporta', async () => {
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.ana, p_reason: 'x' });
    await fails(report(w.u.ana, 'league', w.priv), 'bloqueada');
  });

  it('push a los superadmins: uno por cosa reportada que dice cuántos hay, a la consola', async () => {
    await phone(w.u.dios, 'dios');
    await phone(w.u.dios2, 'dios2');
    const c = await comment(w.u.luis, 'Spam spam');
    await report(w.u.ana, 'comment', c, 'spam');
    const tag = `reporte:comment:${c}`;
    type Push = { user_id: string; title: string; body: string; url: string };
    const read = () => db.admin<Push>('select user_id, title, body, url from public.push_outbox where tag = $1 and sent_at is null order by user_id', [tag]);
    let rows = await read();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ title: 'Nuevo reporte: spam o publicidad', url: '/superadmin/reportes' });
    expect(rows[0].body).toContain('Un comentario en Liga del Banco.');
    // Otro reporte de lo mismo: sigue un aviso por superadmin, ahora con cuántos hay.
    await report(w.u.sofi, 'comment', c, 'ofensivo');
    rows = await read();
    expect(rows).toHaveLength(2);
    expect(rows[0].title).toBe('Nuevo reporte: contenido ofensivo');
    expect(rows[0].body).toContain('Hay 2 reportes abiertos de lo mismo.');
    // Un superadmin que reporta no se avisa a sí mismo; uno bloqueado… no existe (nunca se bloquea): el otro sí recibe.
    const c2 = await comment(w.u.luis, 'Otro');
    await member(db, w.priv, w.u.dios, 'member', 'dios');
    await report(w.u.dios, 'comment', c2, 'otro');
    expect((await db.admin<{ user_id: string }>('select distinct user_id from public.push_outbox where tag = $1', [`reporte:comment:${c2}`])).map((r) => r.user_id)).toEqual([w.u.dios2]);
  });
});

describe('quién ve los reportes', () => {
  it('quien reportó ve el suyo sin su id; los admins de la liga, comentarios, avisos y juegos; el superadmin, todo', async () => {
    const c = await comment(w.u.luis, 'Feo');
    const onComment = await report(w.u.ana, 'comment', c);
    const onLeague = await report(w.u.ana, 'league', w.priv);
    const onUser = await report(w.u.ana, 'user', w.u.luis);
    const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();
    const q = 'select id from public.reports';
    expect(ids(await db.asUser(w.u.ana, q))).toEqual([onComment, onLeague, onUser].sort());
    // sofi (admin de la liga): solo el comentario (la liga y la cuenta son del superadmin).
    expect(ids(await db.asUser(w.u.sofi, q))).toEqual([onComment]);
    expect(ids(await db.asUser(w.u.org, q))).toEqual([onComment]);
    expect(await db.asUser(w.u.luis, q)).toEqual([]);
    expect(ids(await db.asUser(w.u.dios, q))).toEqual([onComment, onLeague, onUser].sort());
    // Quién reportó, quién lo atendió y de quién era no se leen directo (ni el superadmin: para eso está list_reports).
    for (const who of [w.u.ana, w.u.sofi, w.u.dios]) {
      await fails(db.asUser(who, 'select reporter_id from public.reports'), '42501');
      await fails(db.asUser(who, 'select handled_by from public.reports'), '42501');
      await fails(db.asUser(who, 'select target_owner_id from public.reports'), '42501');
      await fails(db.asUser(who, 'select * from public.reports'), '42501');
    }
    await fails(db.asAnon(q), '42501');
  });

  it('list_reports: el superadmin con quién reportó y lo reportado a la vista; un admin de liga, sin quién', async () => {
    const c = await comment(w.u.luis, 'Tramposo');
    await report(w.u.ana, 'comment', c, 'acoso', 'Siempre igual');
    await report(w.u.sofi, 'comment', c, 'ofensivo');
    await report(w.u.ana, 'league', w.priv, 'spam');

    const all = await db.rpc<Json>(w.u.dios, 'list_reports', {});
    expect(all).toMatchObject({ total: 3, open: 3, all: 3 });
    const row = all.rows.find((r: Json) => r.kind === 'comment' && r.reason === 'acoso');
    expect(row).toMatchObject({
      targetId: c,
      leagueId: w.priv,
      leagueName: 'Liga del Banco',
      note: 'Siempre igual',
      status: 'open',
      reporterId: w.u.ana,
      reporterName: 'ana',
      sameTarget: 2,
      handledAt: null,
    });
    expect(row.target).toMatchObject({ title: 'Comentario de luis', text: 'Tramposo', userId: w.u.luis, leagueName: 'Liga del Banco', sport: 'bowling' });
    expect(row.target.url).toBe(`/l/${w.priv}/juegos?juego=${w.e1Luis}&evento=${w.e.e1}`);
    const league = all.rows.find((r: Json) => r.kind === 'league');
    expect(league.target).toMatchObject({ title: 'Liga del Banco', userId: w.u.org, kind: 'liga', members: 4, events: 1, url: `/l/${w.priv}` });

    const admin = await db.rpc<Json>(w.u.sofi, 'list_reports', { p_league: w.priv });
    expect(admin).toMatchObject({ total: 2, open: 2, all: 2 });
    for (const r of admin.rows) {
      expect(r.kind).toBe('comment');
      expect(r.reporterId).toBeNull();
      expect(r.reporterName).toBeNull();
    }
    // Sin liga, o de una liga que no administra: no.
    await fails(db.rpc(w.u.sofi, 'list_reports', {}), DENIED);
    await fails(db.rpc(w.u.luis, 'list_reports', { p_league: w.priv }), DENIED);
    await fails(db.rpc(w.u.sofi, 'list_reports', { p_league: w.pub }), DENIED);
    await fails(db.rpc(w.u.dios, 'list_reports', { p_status: 'raro' }), 'invalido');
    await fails(db.rpc(w.u.dios, 'list_reports', { p_kind: 'foto' }), 'invalido');
    // Filtros y páginas.
    expect((await db.rpc<Json>(w.u.dios, 'list_reports', { p_kind: 'league' })).total).toBe(1);
    const page = await db.rpc<Json>(w.u.dios, 'list_reports', { p_limit: 2, p_offset: 2 });
    expect(page.rows).toHaveLength(1);
    expect(page.total).toBe(3);
  });

  it('un admin no ve los reportes de lo suyo (ni en la tabla ni en list_reports); los demás admins sí', async () => {
    const mineComment = await comment(w.u.sofi, 'Lo dijo sofi');
    const mineNotice = await notice(w.priv, w.u.sofi, 'Aviso de sofi');
    const other = await comment(w.u.luis, 'Lo dijo luis');
    const onComment = await report(w.u.luis, 'comment', mineComment, 'ofensivo', 'Me habló feo ayer en la final');
    const onNotice = await report(w.u.luis, 'announcement', mineNotice, 'falso');
    const onOther = await report(w.u.ana, 'comment', other, 'spam');
    const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();
    const q = 'select id from public.reports';
    // sofi: solo el de luis (los de lo suyo, con su nota y su hora, dirían quién fue).
    expect(ids(await db.asUser(w.u.sofi, q))).toEqual([onOther]);
    const hers = await db.rpc<Json>(w.u.sofi, 'list_reports', { p_league: w.priv, p_status: 'all' });
    expect(hers).toMatchObject({ total: 1, open: 1, all: 1 });
    expect(hers.rows.map((r: Json) => r.id)).toEqual([onOther]);
    // El dueño y el superadmin los ven todos.
    expect(ids(await db.asUser(w.u.org, q))).toEqual([onComment, onNotice, onOther].sort());
    expect((await db.rpc<Json>(w.u.org, 'list_reports', { p_league: w.priv })).total).toBe(3);
    expect((await db.rpc<Json>(w.u.dios, 'list_reports', { p_league: w.priv })).total).toBe(3);
    // Guarda de quién era al reportarlo (el juego: su jugador; la cuenta: ella misma).
    const game = await report(w.u.ana, 'game', w.e1Luis, 'falso');
    const user = await report(w.u.ana, 'user', w.u.luis, 'acoso');
    const owners = await db.admin<{ id: string; target_owner_id: string | null }>('select id, target_owner_id from public.reports');
    expect(Object.fromEntries(owners.map((r) => [r.id, r.target_owner_id]))).toEqual({
      [onComment]: w.u.sofi,
      [onNotice]: w.u.sofi,
      [onOther]: w.u.luis,
      [game]: w.u.luis,
      [user]: w.u.luis,
    });
  });

  it('lo reportado se borró: la vista previa sale null y el reporte queda', async () => {
    const c = await comment(w.u.luis, 'Se va');
    await report(w.u.ana, 'comment', c);
    await db.rpc(w.u.sofi, 'delete_comment', { p_comment: c });
    const r = await db.rpc<Json>(w.u.dios, 'list_reports', {});
    expect(r.rows[0]).toMatchObject({ targetId: c, target: null, status: 'open' });
  });
});

describe('atender reportes', () => {
  it('el superadmin descarta o marca como atendido (cierra los de lo mismo) y queda en la auditoría', async () => {
    const c = await comment(w.u.luis, 'Insulto');
    const r1 = await report(w.u.ana, 'comment', c, 'ofensivo');
    const r2 = await report(w.u.sofi, 'comment', c, 'acoso');
    const other = await report(w.u.ana, 'league', w.priv, 'spam');
    await db.rpc(w.u.dios, 'resolve_report', { p_report: r1, p_status: 'actioned', p_note: 'Se borró el comentario.' });
    const rows = await db.admin<{ id: string; status: string; handled_by: string; action_note: string | null; handled: boolean }>(
      'select id, status, handled_by, action_note, handled_at is not null as handled from public.reports order by id',
    );
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[r1]).toMatchObject({ status: 'actioned', handled_by: w.u.dios, action_note: 'Se borró el comentario.', handled: true });
    expect(byId[r2]).toMatchObject({ status: 'actioned', handled_by: w.u.dios });
    expect(byId[other]).toMatchObject({ status: 'open', handled: false });
    const audit = await db.admin<{ action: string; target_type: string; target_id: string; detail: Json }>(
      `select action, target_type, target_id, detail from public.admin_audit where action = 'resolve_report'`,
    );
    expect(audit).toEqual([
      {
        action: 'resolve_report',
        target_type: 'app',
        target_id: r1,
        detail: expect.objectContaining({ kind: 'comment', targetId: c, status: 'actioned', closed: 2, reason: 'ofensivo' }),
      },
    ]);
    await db.rpc(w.u.dios, 'resolve_report', { p_report: other, p_status: 'dismissed' });
    const lists = await db.rpc<Json>(w.u.dios, 'list_reports', { p_status: 'closed' });
    expect(lists).toMatchObject({ total: 3, open: 0, all: 3 });
    expect(lists.rows.find((r: Json) => r.id === other)).toMatchObject({ status: 'dismissed', handledByName: 'dios', actionNote: null });
    // Reportar otra vez lo mismo después de cerrado: uno nuevo.
    expect(await report(w.u.ana, 'comment', c)).not.toBe(r1);
  });

  it('un admin de la liga atiende comentarios, avisos y juegos de su liga (no lo suyo, ni ligas ni cuentas); sin auditoría', async () => {
    const c = await comment(w.u.luis, 'Feo');
    const a = await notice(w.priv, w.u.sofi, 'Aviso de sofi');
    const onComment = await report(w.u.ana, 'comment', c);
    const onNotice = await report(w.u.luis, 'announcement', a);
    const onLeague = await report(w.u.ana, 'league', w.priv);
    const onUser = await report(w.u.ana, 'user', w.u.luis);
    await db.rpc(w.u.sofi, 'resolve_report', { p_report: onComment, p_status: 'dismissed', p_note: 'Es una broma entre ellos' });
    expect(await db.admin('select status from public.reports where id = $1', [onComment])).toEqual([{ status: 'dismissed' }]);
    // Su propio aviso no lo decide ella; el dueño sí.
    await fails(db.rpc(w.u.sofi, 'resolve_report', { p_report: onNotice, p_status: 'dismissed' }), DENIED);
    await db.rpc(w.u.org, 'resolve_report', { p_report: onNotice, p_status: 'actioned', p_note: 'Hablé con sofi' });
    for (const r of [onLeague, onUser]) await fails(db.rpc(w.u.org, 'resolve_report', { p_report: r, p_status: 'dismissed' }), DENIED);
    // Un miembro o alguien de otra liga, no.
    await fails(db.rpc(w.u.ana, 'resolve_report', { p_report: onComment, p_status: 'actioned' }), DENIED);
    await fails(db.rpc(w.u.otro, 'resolve_report', { p_report: onComment, p_status: 'actioned' }), DENIED);
    expect(await db.count('public.admin_audit', `action = 'resolve_report'`)).toBe(0);
  });

  it('lo que ya se cerró no se vuelve a decidir (cerrado): ni un admin cambia lo del superadmin ni un admin lo de otro', async () => {
    type Row = { status: string; handled_by: string; action_note: string | null };
    const row = async (id: string) =>
      (await db.admin<Row>('select status, handled_by, action_note from public.reports where id = $1', [id]))[0];
    const c = await comment(w.u.luis, 'Insulto');
    const r1 = await report(w.u.ana, 'comment', c, 'ofensivo');
    await db.rpc(w.u.dios, 'resolve_report', { p_report: r1, p_status: 'actioned', p_note: 'Hablé con luis.' });
    for (const who of [w.u.sofi, w.u.org, w.u.dios]) {
      await fails(db.rpc(who, 'resolve_report', { p_report: r1, p_status: 'dismissed', p_note: 'No era nada' }), 'cerrado');
    }
    expect(await row(r1)).toEqual({ status: 'actioned', handled_by: w.u.dios, action_note: 'Hablé con luis.' });
    // Quien no puede decidirlo no sabe ni que está cerrado.
    await fails(db.rpc(w.u.luis, 'resolve_report', { p_report: r1, p_status: 'dismissed' }), DENIED);

    // Entre admins de la liga: lo que descartó sofi no lo cambia el dueño.
    const c2 = await comment(w.u.luis, 'Otro');
    const r2 = await report(w.u.ana, 'comment', c2, 'spam');
    await db.rpc(w.u.sofi, 'resolve_report', { p_report: r2, p_status: 'dismissed', p_note: 'Broma' });
    await fails(db.rpc(w.u.org, 'resolve_report', { p_report: r2, p_status: 'actioned' }), 'cerrado');
    expect(await row(r2)).toEqual({ status: 'dismissed', handled_by: w.u.sofi, action_note: 'Broma' });

    // Reportado otra vez: uno nuevo, y cerrarlo no toca los de antes.
    const r3 = await report(w.u.sofi, 'comment', c, 'acoso');
    await db.rpc(w.u.org, 'resolve_report', { p_report: r3, p_status: 'dismissed' });
    expect(await row(r3)).toMatchObject({ status: 'dismissed', handled_by: w.u.org });
    expect(await row(r1)).toEqual({ status: 'actioned', handled_by: w.u.dios, action_note: 'Hablé con luis.' });
  });

  it('datos que no sirven', async () => {
    const id = await report(w.u.ana, 'league', w.priv);
    await fails(db.rpc(w.u.dios, 'resolve_report', { p_report: id, p_status: 'open' }), 'invalido');
    await fails(db.rpc(w.u.dios, 'resolve_report', { p_report: id, p_status: 'actioned', p_note: 'x'.repeat(501) }), 'invalido');
    await fails(db.rpc(w.u.dios, 'resolve_report', { p_report: randomUUID(), p_status: 'actioned' }), 'no_existe');
  });

  it('borrar la cuenta de quien reportó deja el reporte sin su nombre; borrar la liga lo deja para el superadmin', async () => {
    const lid = await league(db, w.u.otra, { name: 'Pública 2', visibility: 'public', requirePhoto: false });
    await member(db, lid, w.u.otra, 'owner', 'otra');
    await player(db, lid, 'Alguien');
    const r = await report(w.u.extra, 'league', lid, 'spam');
    await db.admin('delete from auth.users where id = $1', [w.u.extra]);
    expect(await db.admin('select reporter_id, league_id from public.reports where id = $1', [r])).toEqual([{ reporter_id: null, league_id: lid }]);
    await db.rpc(w.u.dios, 'delete_league', { p_league: lid });
    expect(await db.admin('select reporter_id, league_id, status from public.reports where id = $1', [r])).toEqual([
      { reporter_id: null, league_id: null, status: 'open' },
    ]);
    const list = await db.rpc<Json>(w.u.dios, 'list_reports', {});
    expect(list.rows[0]).toMatchObject({ id: r, reporterId: null, reporterName: null, target: null });
    await db.rpc(w.u.dios, 'resolve_report', { p_report: r, p_status: 'actioned', p_note: 'Se borró la liga.' });
  });
});
