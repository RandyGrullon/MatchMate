import { describe, expect, it } from 'vitest';
import { HASH_CONFIG, makeAuthExport, makeBackup, passwordOf } from './fixture';
import { verifyFbscrypt } from './hash';
import { entryUuid, eventUuid, leagueUuid, legacyId, photoUuid, playerUuid, teamUuid, userUuid } from './ids';
import { normalizeBackup, transformBackup } from './transform';
import type { Row } from './types';

const plan = () => transformBackup(makeBackup(), { auth: makeAuthExport(), hashConfig: HASH_CONFIG, photosSince: '2025-06-01' });
const L1 = leagueUuid('L1banco');
const L2 = leagueUuid('L2copa');
const find = (rows: Row[], id: string) => rows.find((r) => r.id === id);

describe('transformBackup: conteos', () => {
  it('filas por tabla del respaldo de prueba', () => {
    const p = plan();
    expect(p.report.counts).toEqual({
      profiles: 9,
      leagues: 2,
      league_secrets: 2,
      league_members: 8,
      players: 10,
      events: 4,
      teams: 4,
      event_rsvps: 3,
      photos: 2,
      entries: 14,
      submissions: 4,
      reactions: 3,
      comments: 2,
      suggestions: 3,
      users: 9,
      files: 2,
    });
    expect(p.report.photos).toMatchObject({ found: 3, migrated: 2, old: 1, tooBig: 0, missingData: 0 });
  });

  it('es determinista: dos corridas dan exactamente lo mismo', () => {
    expect(JSON.stringify(plan())).toBe(JSON.stringify(plan()));
  });
});

describe('transformBackup: cuentas', () => {
  it('uid → UUID v5, correo en minúsculas, perfil con firebase_uid', () => {
    const p = plan();
    const ana = p.users.find((u) => u.firebaseUid === 'uAna')!;
    expect(ana).toMatchObject({ id: userUuid('uAna'), email: 'ana@bowling.do', name: 'Ana', emailConfirmed: false, existing: false });
    expect(find(p.rows.profiles, ana.id)).toMatchObject({ email: 'ana@bowling.do', firebase_uid: 'uAna', is_superadmin: false });
    expect(p.map.users.uAna).toBe(ana.id);
  });

  it('contraseña: $fbscrypt$ que entra con la contraseña de siempre', () => {
    const p = plan();
    const luis = p.users.find((u) => u.firebaseUid === 'uLuis')!;
    expect(luis.passwordHash).toMatch(/^\$fbscrypt\$v=1,n=10,r=8,p=1,/);
    expect(verifyFbscrypt(passwordOf('uLuis'), luis.passwordHash!)).toBe(true);
    expect(verifyFbscrypt(passwordOf('uOrg'), luis.passwordHash!)).toBe(false);
  });

  it('Google sin contraseña y verificado; sin verificar; deshabilitada; sin correo', () => {
    const p = plan();
    const by = (uid: string) => p.users.find((u) => u.firebaseUid === uid);
    expect(by('uGoo')).toMatchObject({ passwordHash: null, emailConfirmed: true, providers: ['google.com'], name: 'Gabriel' });
    expect(by('uNoVal')).toMatchObject({ emailConfirmed: false });
    expect(by('uDis')).toMatchObject({ banned: true, name: 'Bloqueado', email: 'bloqueado@bowling.do' });
    expect(by('uPhone')).toBeUndefined();
    expect(p.report.dropped).toContainEqual(expect.objectContaining({ table: 'users', ref: 'users/uPhone' }));
    expect(p.report.users).toEqual({ total: 9, withPassword: 8, googleOnly: 1, withoutPassword: 0, unconfirmed: 5, banned: 1, reused: 0, superadmins: 1 });
  });

  it('admin@admin.com no pasa como superadmin; el que se nombró desde la app sí', () => {
    const p = plan();
    expect(p.users.find((u) => u.email === 'admin@admin.com')!.isSuperadmin).toBe(false);
    expect(p.users.find((u) => u.email === 'dios@bowling.do')!.isSuperadmin).toBe(true);
    const forced = transformBackup(makeBackup(), { auth: makeAuthExport(), superadmins: ['org@bowling.do'] });
    expect(forced.users.find((u) => u.email === 'org@bowling.do')!.isSuperadmin).toBe(true);
  });

  it('--confiar-correos da todos por verificados; sin hash no hay contraseña', () => {
    const p = transformBackup(makeBackup(), { auth: makeAuthExport(), trustEmails: true });
    expect(p.users.every((u) => u.emailConfirmed && u.passwordHash === null)).toBe(true);
    expect(p.report.users.withoutPassword).toBe(8);
    const noKeys = transformBackup(makeBackup(), { auth: makeAuthExport(), hashConfig: HASH_CONFIG, withoutPasswords: true });
    expect(noKeys.report.users.withPassword).toBe(0);
  });

  it('si ya se registró en MatchMate con el mismo correo, usa esa cuenta (y todo lo suyo apunta ahí)', () => {
    const mine = '11111111-1111-4111-8111-111111111111';
    const p = transformBackup(makeBackup(), { auth: makeAuthExport(), existingUsers: [{ id: mine, email: 'ANA@bowling.do' }] });
    const ana = p.users.find((u) => u.firebaseUid === 'uAna')!;
    expect(ana).toMatchObject({ id: mine, existing: true });
    expect(p.rows.profiles.find((r) => r.id === mine)).toBeUndefined();
    expect(p.profileUpdates).toEqual([{ id: mine, firebase_uid: 'uAna', is_superadmin: false }]);
    expect(find(p.rows.leagues, L2)!.owner_id).toBe(mine);
    expect(find(p.rows.players, playerUuid('L2copa', 'pAna'))!.user_id).toBe(mine);
    expect(p.report.users.reused).toBe(1);
  });

  it('sin la exportación de Auth salen del respaldo (sin contraseña)', () => {
    const p = transformBackup(makeBackup());
    expect(p.users).toHaveLength(8);
    expect(p.users.every((u) => u.passwordHash === null && !u.emailConfirmed)).toBe(true);
  });
});

describe('transformBackup: ligas, miembros y jugadores', () => {
  it('liga: deporte boliche, teléfono y nombre corregidos, fechas vacías a null', () => {
    const p = plan();
    expect(find(p.rows.leagues, L1)).toMatchObject({
      sport: 'bowling',
      kind: 'liga',
      visibility: 'private',
      owner_id: userUuid('uOrg'),
      contact_phone: '8095551234',
      season_start: '2026-01-01',
      season_end: null,
      require_photo: true,
      has_minors: false,
    });
    const l2 = find(p.rows.leagues, L2)!;
    expect(l2).toMatchObject({ kind: 'torneo', visibility: 'public', contact_phone: '+18095550000', require_photo: false });
    expect([...(l2.name as string)].length).toBeLessThanOrEqual(60);
    expect(p.report.fixes).toContainEqual(expect.objectContaining({ table: 'leagues', ref: 'leagues/L1banco', message: expect.stringContaining('809-555-1234') }));
  });

  it('código de invitación: el de BowlingX se conserva; si no hay, uno nuevo válido', () => {
    const p = plan();
    expect(p.rows.league_secrets.find((r) => r.league_id === L1)!.invite_code).toBe('ABCD2345');
    expect(p.rows.league_secrets.find((r) => r.league_id === L2)!.invite_code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it('membresías (liga_uid → filas): la cuenta borrada no pasa; un solo dueño; anotador', () => {
    const p = plan();
    const members = p.rows.league_members.filter((r) => r.league_id === L1);
    expect(members.map((m) => m.role).sort()).toEqual(['admin', 'member', 'member', 'owner']);
    expect(p.report.dropped).toContainEqual(expect.objectContaining({ table: 'league_members', ref: 'members/L1banco_uGhost' }));
    const goo = p.rows.league_members.find((r) => r.league_id === L2 && r.user_id === userUuid('uGoo'))!;
    expect(goo).toMatchObject({ role: 'member', is_scorer: true, display_name: 'Gabriel' });
  });

  it('member.playerId → players.user_id; el jugador reclamado por dos lados queda sin cuenta', () => {
    const p = plan();
    const user = (lid: string, pid: string) => find(p.rows.players, playerUuid(lid, pid))!.user_id;
    expect(user('L1banco', 'pLuis')).toBe(userUuid('uLuis'));
    expect(user('L1banco', 'pOrg')).toBe(userUuid('uOrg'));
    expect(user('L1banco', 'pDup')).toBeNull();
    expect(user('L1banco', 'pPedro')).toBeNull();
    expect(user('L2copa', 'pLuis2')).toBe(userUuid('uLuis'));
    // Ana en L1 es miembro sin jugador.
    expect(p.rows.players.filter((r) => r.league_id === L1 && r.user_id === userUuid('uAna'))).toEqual([]);
    expect(find(p.rows.players, playerUuid('L1banco', 'pPedro'))!.average_override).toBe(175);
    expect([...(find(p.rows.players, playerUuid('L1banco', 'pLong'))!.name as string)].length).toBe(60);
    // Una cuenta, un jugador por liga (unique (league_id, user_id)).
    const keys = p.rows.players.filter((r) => r.user_id).map((r) => `${r.league_id}/${r.user_id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('transformBackup: eventos, juegos y fotos', () => {
  it('teams y rsvp del evento pasan a filas', () => {
    const p = plan();
    const e2 = eventUuid('L1banco', 'e2');
    expect(p.rows.teams.filter((r) => r.event_id === e2).map((r) => [r.id, r.name, r.sort_order])).toEqual([
      [teamUuid('L1banco', 'e2', 'eq1'), 'Rojos', 1],
      [teamUuid('L1banco', 'e2', 'eq2'), 'Azules', 2],
    ]);
    const e1 = eventUuid('L1banco', 'e1');
    expect(p.rows.event_rsvps.filter((r) => r.event_id === e1).map((r) => r.player_id).sort()).toEqual(
      [playerUuid('L1banco', 'pLuis'), playerUuid('L1banco', 'pPedro')].sort(),
    );
    // Equipo sin nombre: queda «Equipo 2».
    expect(p.rows.teams.find((r) => r.id === teamUuid('L2copa', 't1', 'b'))!.name).toBe('Equipo 2');
    expect(find(p.rows.events, e2)).toMatchObject({ type: 'torneo', hcp_base: 230, hcp_percent: 80, category_cuts: [200, 175, 160], team_size: 2, individual_rank_by: 'hcp' });
    expect(p.report.dropped).toContainEqual(expect.objectContaining({ table: 'events', ref: 'leagues/L1banco/events/eBad' }));
  });

  it('participación evento_jugador → (event_id, player_id); marcas de foto a uuid; importado y sin-foto se quedan', () => {
    const p = plan();
    const luis = find(p.rows.entries, entryUuid('L1banco', 'e1', 'pLuis'))!;
    expect(luis).toMatchObject({
      event_id: eventUuid('L1banco', 'e1'),
      player_id: playerUuid('L1banco', 'pLuis'),
      scores: [150, 180, null],
      photos: [photoUuid('L1banco', 'ph1'), photoUuid('L1banco', 'ph1'), null],
    });
    expect(luis.frames).toEqual({ '0': expect.objectContaining({ rolls: expect.any(Array) }) });
    expect(find(p.rows.entries, entryUuid('L1banco', 'e1', 'pPedro'))).toMatchObject({ scores: [200, null, 190], photos: ['importado', 'importado', 'importado'] });
    // La foto vieja no se sube, pero el juego sigue verificado.
    expect(find(p.rows.entries, entryUuid('L1banco', 'e3', 'pOrg'))!.photos).toEqual(Array(3).fill(photoUuid('L1banco', 'phOld')));
    expect(find(p.rows.entries, entryUuid('L1banco', 'e2', 'pSofi'))).toMatchObject({ team_id: teamUuid('L1banco', 'e2', 'eq1'), handicap_override: 70 });
    expect(find(p.rows.entries, entryUuid('L1banco', 'e2', 'pLong'))!.team_id).toBeNull();
    expect(p.report.dropped).toContainEqual(expect.objectContaining({ table: 'entries', ref: 'leagues/L1banco/entries/e1_pGone' }));
  });

  it('fotos: archivo para Storage con la ruta <liga>/<foto>.jpg y su fila', () => {
    const p = plan();
    const id = photoUuid('L1banco', 'ph1');
    expect(find(p.rows.photos, id)).toMatchObject({ league_id: L1, event_id: eventUuid('L1banco', 'e1'), path: `${L1}/${id}.jpg`, content_type: 'image/jpeg', width: 1200, bytes: 23 });
    expect(p.files.find((f) => f.path === `${L1}/${id}.jpg`)).toMatchObject({ bucket: 'scoreboards', contentType: 'image/jpeg', bytes: 23 });
    // Sin límite de fecha pasan las 3.
    expect(transformBackup(makeBackup()).rows.photos).toHaveLength(3);
  });

  it('envíos: con foto, aprobado (reviewed_by), por fecha; la foto vieja se quita del envío', () => {
    const p = plan();
    const s = (id: string) => find(p.rows.submissions, legacyId('submission', 'L1banco', id))!;
    expect(s('s1')).toMatchObject({ status: 'pendiente', photo_id: photoUuid('L1banco', 'ph2'), scanned: [160, 171], scanned_name: 'LUIS P', created_by: userUuid('uLuis') });
    expect(s('s2')).toMatchObject({ status: 'aprobado', reviewed_by: userUuid('uSofi'), event_id: eventUuid('L1banco', 'e1') });
    expect(s('s3')).toMatchObject({ status: 'rechazado', event_id: null, date: '2026-03-12', note: 'Foto borrosa', created_by: null });
    expect(s('s4')).toMatchObject({ photo_id: null, date: '2025-01-05' });
  });

  it('social: reacción repetida y de cuenta borrada no pasan; comentario vacío no; sugerencias anónimas', () => {
    const p = plan();
    const onLuis = p.rows.reactions.filter((r) => r.entry_id === entryUuid('L1banco', 'e1', 'pLuis'));
    expect(onLuis.map((r) => [r.user_id, r.type]).sort()).toEqual([
      [userUuid('uOrg'), 'felicitar'],
      [userUuid('uSofi'), 'like'],
    ].sort());
    expect(onLuis[0]).toMatchObject({ event_id: eventUuid('L1banco', 'e1'), player_id: playerUuid('L1banco', 'pLuis') });
    expect(p.rows.comments.map((c) => c.text).sort()).toEqual(['Buen juego', '¡Qué serie!']);
    expect(p.rows.suggestions.every((s) => Object.keys(s).sort().join() === 'created_at,id,league_id,read,text')).toBe(true);
  });

  it('todas las filas de una tabla tienen las mismas columnas (upsert de PostgREST en lotes)', () => {
    const p = plan();
    for (const [table, rows] of Object.entries(p.rows)) {
      const cols = new Set(rows.map((r) => Object.keys(r).join(',')));
      expect(cols.size, table).toBeLessThanOrEqual(1);
    }
  });
});

describe('normalizeBackup', () => {
  it('acepta el respaldo de una liga (el dueño sale de las membresías)', () => {
    const full = makeBackup();
    const { members, players, events, entries, submissions, reactions, comments, suggestions } = full.leagues[1];
    const one = normalizeBackup({ app: 'BowlingX', league: { id: 'L2copa', name: 'Copa' }, members, players, events, entries, submissions, reactions, comments, suggestions });
    expect(one.leagues[0]).toMatchObject({ id: 'L2copa', ownerUid: 'uAna' });
    const p = transformBackup(one, { auth: makeAuthExport(), hashConfig: HASH_CONFIG });
    expect(p.rows.entries).toHaveLength(4);
    expect(p.rows.leagues[0]).toMatchObject({ visibility: 'private', owner_id: userUuid('uAna') });
  });

  it('rechaza lo que no es un respaldo', () => {
    expect(() => normalizeBackup({ hola: 1 })).toThrow(/respaldo/);
  });
});
