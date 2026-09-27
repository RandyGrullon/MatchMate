import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-bowlinx-reglas',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8089 },
  });
});

afterAll(() => env.cleanup());

const leagueData = (ownerUid: string, visibility: 'public' | 'private') => ({
  name: visibility === 'public' ? 'Liga Abierta' : 'Liga del Banco',
  visibility,
  ownerUid,
  venue: 'Bolera',
  schedule: 'Martes 7 pm',
  seasonStart: '2026-01-01',
  seasonEnd: '2026-12-31',
  contactName: 'Org',
  contactPhone: '18095550000',
  requirePhoto: true,
});

const member = (lid: string, uid: string, role: string, playerId: string | null = null) => ({
  leagueId: lid,
  uid,
  name: uid.replace('u-', ''),
  role,
  playerId,
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // Liga privada "priv": dueño org, admin sofi, miembro luis (jugador luis), miembro ana sin jugador.
    await setDoc(doc(db, 'leagues/priv'), leagueData('u-org', 'private'));
    await setDoc(doc(db, 'leagues/priv/private/invite'), { code: 'ABCD2345' });
    await setDoc(doc(db, 'invites/ABCD2345'), { leagueId: 'priv', leagueName: 'Liga del Banco' });
    await setDoc(doc(db, 'members/priv_u-org'), member('priv', 'u-org', 'owner'));
    await setDoc(doc(db, 'members/priv_u-sofi'), member('priv', 'u-sofi', 'admin'));
    await setDoc(doc(db, 'members/priv_u-luis'), member('priv', 'u-luis', 'member', 'luis'));
    await setDoc(doc(db, 'members/priv_u-ana'), member('priv', 'u-ana', 'member'));
    await setDoc(doc(db, 'leagues/priv/players/pedro'), { name: 'Pedro', averageOverride: null });
    await setDoc(doc(db, 'leagues/priv/players/luis'), { name: 'Luis', averageOverride: null, uid: 'u-luis' });
    await setDoc(doc(db, 'leagues/priv/events/e1'), { type: 'practica', name: '', date: '2026-09-22', games: 3, teams: {}, playerCount: 0 });
    await setDoc(doc(db, 'leagues/priv/entries/e1_luis'), { eventId: 'e1', playerId: 'luis', scores: [150], photos: [null] });
    // Liga pública "pub" de otro dueño, que no exige foto.
    await setDoc(doc(db, 'leagues/pub'), { ...leagueData('u-otro', 'public'), requirePhoto: false });
    await setDoc(doc(db, 'members/pub_u-otro'), member('pub', 'u-otro', 'owner'));
    await setDoc(doc(db, 'leagues/pub/players/p1'), { name: 'Jugador Uno', averageOverride: null });
    await setDoc(doc(db, 'leagues/pub/events/e9'), { type: 'torneo', name: 'Copa', date: '2026-10-01', games: 3, teams: {}, playerCount: 0 });
    await setDoc(doc(db, 'users/u-luis'), { email: 'luis@x.com', name: 'Luis' });
    await setDoc(doc(db, 'users/u-ana'), { email: 'ana@x.com', name: 'Ana' });
    await setDoc(doc(db, 'users/u-dios2'), { email: 'dios2@x.com', name: 'Dios Dos', superadmin: true });
  });
});

const as = (uid: string, email = `${uid.replace('u-', '')}@x.com`) => env.authenticatedContext(uid, { email }).firestore() as unknown as Firestore;
const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore;
const dios = () => as('u-root', 'admin@admin.com');
const dios2 = () => as('u-dios2');
const org = () => as('u-org');
const sofi = () => as('u-sofi');
const luis = () => as('u-luis');
const ana = () => as('u-ana');
const extra = () => as('u-new');

const photo = (eventId: string | null = 'e1') => ({ data: 'data:image/jpeg;base64,AAAA', width: 10, height: 10, eventId });
const sub = (playerId: string, photoId: string | null, eventId = 'e1') => ({
  playerId,
  eventId,
  date: null,
  scores: [150, 160, 170],
  scanned: null,
  frames: { '0': { rolls: [10, 10, 10] } },
  photoId,
  status: 'pendiente',
  note: null,
});

function sendGames(db: Firestore, lid: string, playerId: string, extraFields: Record<string, unknown> = {}, eventId = 'e1') {
  const b = writeBatch(db);
  b.set(doc(db, `leagues/${lid}/photos/f1`), { ...photo(eventId), createdAt: serverTimestamp() });
  b.set(doc(db, `leagues/${lid}/submissions/s1`), { ...sub(playerId, 'f1', eventId), createdAt: serverTimestamp(), ...extraFields });
  return b.commit();
}

function createLeague(db: Firestore, uid: string, lid = 'nueva', data: Record<string, unknown> = {}) {
  const b = writeBatch(db);
  b.set(doc(db, `leagues/${lid}`), { ...leagueData(uid, 'private'), ...data, createdAt: serverTimestamp() });
  b.set(doc(db, `members/${lid}_${uid}`), { ...member(lid, uid, 'owner'), joinedAt: serverTimestamp() });
  return b.commit();
}

const join = (db: Firestore, lid: string, uid: string, code?: string) =>
  setDoc(doc(db, `members/${lid}_${uid}`), { ...member(lid, uid, 'member'), joinedAt: serverTimestamp(), ...(code ? { code } : {}) });

describe('visibilidad', () => {
  it('una liga pública se ve sin login, con todo su contenido', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'leagues/pub')));
    await assertSucceeds(getDocs(collection(anon(), 'leagues/pub/events')));
    await assertSucceeds(getDocs(collection(anon(), 'leagues/pub/players')));
    await assertSucceeds(getDocs(query(collection(anon(), 'leagues'), where('visibility', '==', 'public'))));
  });
  it('una liga privada no se ve sin ser miembro', async () => {
    await assertFails(getDoc(doc(anon(), 'leagues/priv')));
    await assertFails(getDoc(doc(extra(), 'leagues/priv')));
    await assertFails(getDocs(collection(extra(), 'leagues/priv/entries')));
    await assertFails(getDocs(collection(anon(), 'leagues')));
  });
  it('los miembros ven su liga privada y la lista de miembros', async () => {
    await assertSucceeds(getDoc(doc(ana(), 'leagues/priv')));
    await assertSucceeds(getDocs(collection(ana(), 'leagues/priv/entries')));
    await assertSucceeds(getDocs(query(collection(ana(), 'members'), where('leagueId', '==', 'priv'))));
    await assertFails(getDocs(query(collection(extra(), 'members'), where('leagueId', '==', 'priv'))));
  });
  it('cada quien ve sus membresías y el superadmin todo', async () => {
    await assertSucceeds(getDocs(query(collection(extra(), 'members'), where('uid', '==', 'u-new'))));
    await assertSucceeds(getDoc(doc(extra(), 'members/priv_u-new')));
    await assertSucceeds(getDocs(collection(dios(), 'leagues')));
    await assertSucceeds(getDocs(collection(dios2(), 'leagues/priv/entries')));
    await assertSucceeds(getDocs(collection(dios(), 'users')));
    await assertFails(getDocs(collection(sofi(), 'users')));
  });
  it('el código vigente solo lo leen los admins de la liga', async () => {
    await assertSucceeds(getDoc(doc(sofi(), 'leagues/priv/private/invite')));
    await assertFails(getDoc(doc(luis(), 'leagues/priv/private/invite')));
    await assertSucceeds(getDoc(doc(anon(), 'invites/ABCD2345')));
    await assertFails(getDocs(collection(anon(), 'invites')));
  });
});

describe('crear ligas y unirse', () => {
  it('cualquiera con cuenta crea una liga y queda como dueño', async () => {
    await assertSucceeds(createLeague(extra(), 'u-new'));
  });
  it('también un torneo sin liga, y después crea el torneo adentro', async () => {
    const db = extra();
    await assertSucceeds(createLeague(db, 'u-new', 'copa', { kind: 'torneo', visibility: 'public' }));
    await assertSucceeds(setDoc(doc(db, 'leagues/copa/events/t1'), { type: 'torneo', name: 'Copa', date: '2026-11-01', games: 3, teams: {}, playerCount: 0 }));
    await assertFails(createLeague(db, 'u-new', 'raro', { kind: 'club' }));
  });
  it('no se crea una liga a nombre de otro, sin dueño o con campos raros', async () => {
    await assertFails(createLeague(anon(), 'u-new'));
    await assertFails(createLeague(extra(), 'u-new', 'x2', { ownerUid: 'u-org' }));
    await assertFails(createLeague(extra(), 'u-new', 'x3', { visibility: 'secreta' }));
    await assertFails(createLeague(extra(), 'u-new', 'x4', { hack: true }));
    // sin la membresía de dueño en el mismo lote
    await assertFails(setDoc(doc(extra(), 'leagues/x5'), { ...leagueData('u-new', 'public'), createdAt: serverTimestamp() }));
  });
  it('no puede hacerse dueño de una liga que ya existe', async () => {
    await assertFails(setDoc(doc(extra(), 'members/priv_u-new'), { ...member('priv', 'u-new', 'owner'), joinedAt: serverTimestamp() }));
  });
  it('a una pública se une cualquiera; a una privada solo con el código', async () => {
    await assertSucceeds(join(extra(), 'pub', 'u-new'));
    await assertFails(join(as('u-otra'), 'priv', 'u-otra'));
    await assertFails(join(as('u-otra'), 'priv', 'u-otra', 'MALO2345'));
    await assertSucceeds(join(extra(), 'priv', 'u-new', 'ABCD2345'));
  });
  it('no se une como admin ni por otra persona', async () => {
    await assertFails(setDoc(doc(extra(), 'members/pub_u-new'), { ...member('pub', 'u-new', 'admin'), joinedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(extra(), 'members/pub_u-otra'), { ...member('pub', 'u-otra', 'member'), joinedAt: serverTimestamp() }));
  });
  it('los admins cambian el código de invitación', async () => {
    const db = sofi();
    const b = writeBatch(db);
    b.delete(doc(db, 'invites/ABCD2345'));
    b.set(doc(db, 'invites/NUEVO234'), { leagueId: 'priv', leagueName: 'Liga del Banco', createdAt: serverTimestamp() });
    b.set(doc(db, 'leagues/priv/private/invite'), { code: 'NUEVO234' });
    await assertSucceeds(b.commit());
    // un miembro no puede fabricar códigos
    const m = luis();
    const c = writeBatch(m);
    c.set(doc(m, 'invites/LUIS2345'), { leagueId: 'priv', leagueName: 'x', createdAt: serverTimestamp() });
    c.set(doc(m, 'leagues/priv/private/invite'), { code: 'LUIS2345' });
    await assertFails(c.commit());
  });
});

describe('roles en la liga', () => {
  it('solo el dueño nombra o quita admins, y nadie toca al dueño', async () => {
    await assertSucceeds(updateDoc(doc(org(), 'members/priv_u-ana'), { role: 'admin' }));
    await assertSucceeds(updateDoc(doc(org(), 'members/priv_u-sofi'), { role: 'member' }));
    await assertFails(updateDoc(doc(org(), 'members/priv_u-org'), { role: 'member' }));
    await assertFails(updateDoc(doc(org(), 'members/priv_u-ana'), { role: 'owner' }));
  });
  it('un admin que no es dueño no cambia permisos, pero sí desvincula jugadores', async () => {
    await assertFails(updateDoc(doc(sofi(), 'members/priv_u-luis'), { role: 'admin' }));
    await assertFails(updateDoc(doc(sofi(), 'members/priv_u-ana'), { scorer: true }));
    await assertSucceeds(updateDoc(doc(sofi(), 'members/priv_u-luis'), { playerId: null }));
  });
  it('el superadmin también maneja los permisos', async () => {
    await assertSucceeds(updateDoc(doc(dios(), 'members/priv_u-luis'), { role: 'admin' }));
  });
  it('un miembro no se sube de rol', async () => {
    await assertFails(updateDoc(doc(ana(), 'members/priv_u-ana'), { role: 'admin' }));
  });
  it('el admin de una liga no administra otra', async () => {
    await assertFails(setDoc(doc(org(), 'leagues/pub/events/x'), { type: 'torneo' }));
    await assertFails(updateDoc(doc(org(), 'leagues/pub'), { name: 'Mía' }));
  });
  it('el superadmin administra cualquier liga y nombra superadmins', async () => {
    await assertSucceeds(setDoc(doc(dios(), 'leagues/pub/events/x'), { type: 'torneo' }));
    await assertSucceeds(updateDoc(doc(dios2(), 'leagues/priv'), { name: 'Liga Renombrada' }));
    await assertFails(updateDoc(doc(org(), 'users/u-ana'), { superadmin: true }));
    await assertFails(updateDoc(doc(ana(), 'users/u-ana'), { superadmin: true }));
    await assertSucceeds(updateDoc(doc(dios(), 'users/u-ana'), { superadmin: true }));
  });
  it('los admins editan la liga pero no cambian el dueño', async () => {
    await assertSucceeds(updateDoc(doc(sofi(), 'leagues/priv'), { venue: 'Otra bolera', requirePhoto: false }));
    await assertFails(updateDoc(doc(sofi(), 'leagues/priv'), { ownerUid: 'u-sofi' }));
    await assertFails(updateDoc(doc(luis(), 'leagues/priv'), { venue: 'x' }));
  });
  it('solo el dueño (o el superadmin) borra la liga', async () => {
    await assertFails(deleteDoc(doc(sofi(), 'leagues/priv')));
    // Como en la app: primero el contenido y los demás miembros; al final su membresía y la liga juntas.
    const db = org();
    const b = writeBatch(db);
    ['pedro', 'luis'].forEach((p) => b.delete(doc(db, `leagues/priv/players/${p}`)));
    b.delete(doc(db, 'leagues/priv/events/e1'));
    b.delete(doc(db, 'leagues/priv/entries/e1_luis'));
    ['u-sofi', 'u-luis', 'u-ana'].forEach((u) => b.delete(doc(db, `members/priv_${u}`)));
    b.delete(doc(db, 'invites/ABCD2345'));
    b.delete(doc(db, 'leagues/priv/private/invite'));
    await assertSucceeds(b.commit());
    const last = writeBatch(db);
    last.delete(doc(db, 'members/priv_u-org'));
    last.delete(doc(db, 'leagues/priv'));
    await assertSucceeds(last.commit());
  });
  it('salir de la liga: cualquiera menos el dueño; un admin saca miembros', async () => {
    await assertFails(deleteDoc(doc(sofi(), 'members/priv_u-org')));
    await assertSucceeds(deleteDoc(doc(ana(), 'members/priv_u-ana')));
    await assertSucceeds(deleteDoc(doc(sofi(), 'members/priv_u-luis')));
    await assertFails(deleteDoc(doc(luis(), 'members/priv_u-sofi')));
  });
  it('un admin no saca a otro admin (eso es quitarle permisos); el dueño sí', async () => {
    await assertSucceeds(updateDoc(doc(org(), 'members/priv_u-ana'), { role: 'admin' }));
    await assertFails(deleteDoc(doc(sofi(), 'members/priv_u-ana')));
    await assertSucceeds(deleteDoc(doc(org(), 'members/priv_u-sofi')));
  });
});

describe('vincular jugador', () => {
  it('un miembro reclama un jugador libre (jugador + membresía juntos)', async () => {
    const db = ana();
    const b = writeBatch(db);
    b.update(doc(db, 'leagues/priv/players/pedro'), { uid: 'u-ana' });
    b.update(doc(db, 'members/priv_u-ana'), { playerId: 'pedro' });
    await assertSucceeds(b.commit());
  });
  it('no reclama un jugador que ya tiene cuenta ni uno de otra liga', async () => {
    const db = ana();
    const b = writeBatch(db);
    b.update(doc(db, 'leagues/priv/players/luis'), { uid: 'u-ana' });
    b.update(doc(db, 'members/priv_u-ana'), { playerId: 'luis' });
    await assertFails(b.commit());
    const c = writeBatch(db);
    c.update(doc(db, 'leagues/pub/players/p1'), { uid: 'u-ana' });
    c.update(doc(db, 'members/priv_u-ana'), { playerId: 'p1' });
    await assertFails(c.commit());
  });
  it('crea su propio jugador si no está en la lista', async () => {
    const db = ana();
    const b = writeBatch(db);
    b.set(doc(db, 'leagues/priv/players/nuevo'), { name: 'Ana', averageOverride: null, uid: 'u-ana', createdAt: serverTimestamp() });
    b.update(doc(db, 'members/priv_u-ana'), { playerId: 'nuevo' });
    await assertSucceeds(b.commit());
  });
  it('quien ya tiene jugador no crea otro', async () => {
    const db = luis();
    const b = writeBatch(db);
    b.set(doc(db, 'leagues/priv/players/otro'), { name: 'Luis 2', averageOverride: null, uid: 'u-luis', createdAt: serverTimestamp() });
    await assertFails(b.commit());
  });
  it('el dueño también juega: al crear la liga se crea su jugador con su cuenta', async () => {
    const db = as('u-nuevo');
    await createLeague(db, 'u-nuevo', 'mia');
    const b = writeBatch(db);
    b.set(doc(db, 'leagues/mia/players/yo'), { name: 'Nuevo', averageOverride: null, uid: 'u-nuevo', createdAt: serverTimestamp() });
    b.update(doc(db, 'members/mia_u-nuevo'), { playerId: 'yo' });
    await assertSucceeds(b.commit());
  });
  it('un admin también tiene su jugador (se crea con su cuenta)', async () => {
    const db = sofi();
    const b = writeBatch(db);
    b.set(doc(db, 'leagues/priv/players/sofi'), { name: 'Sofi', averageOverride: null, uid: 'u-sofi', createdAt: serverTimestamp() });
    b.update(doc(db, 'members/priv_u-sofi'), { playerId: 'sofi' });
    await assertSucceeds(b.commit());
  });
  it('un admin no se crea un segundo jugador propio (dos teléfonos a la vez), pero sí jugadores de la lista', async () => {
    const own = (id: string) => {
      const db = sofi();
      const b = writeBatch(db);
      b.set(doc(db, `leagues/priv/players/${id}`), { name: 'Sofi', averageOverride: null, uid: 'u-sofi', createdAt: serverTimestamp() });
      b.update(doc(db, 'members/priv_u-sofi'), { playerId: id });
      return b.commit();
    };
    await assertSucceeds(own('sofi-1'));
    await assertFails(own('sofi-2'));
    await assertSucceeds(setDoc(doc(sofi(), 'leagues/priv/players/nuevo'), { name: 'Invitado', averageOverride: null, createdAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(sofi(), 'leagues/priv/players/sofi-1'), { name: 'Sofía' }));
  });
  it('el admin separa una cuenta mal vinculada y le da su jugador nuevo en el mismo momento', async () => {
    const db = sofi();
    const b = writeBatch(db);
    b.update(doc(db, 'leagues/priv/players/luis'), { uid: null });
    b.set(doc(db, 'leagues/priv/players/luis-nuevo'), { name: 'Luis', averageOverride: null, uid: 'u-luis', createdAt: serverTimestamp() });
    b.update(doc(db, 'members/priv_u-luis'), { playerId: 'luis-nuevo' });
    await assertSucceeds(b.commit());
  });
  it('el admin une la cuenta de alguien con un jugador de la lista sin cuenta (y borra el que se le creó)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'leagues/priv/players/ana-auto'), { name: 'Ana', averageOverride: null, uid: 'u-ana' });
      await updateDoc(doc(db, 'members/priv_u-ana'), { playerId: 'ana-auto' });
    });
    const link = (db: Firestore) => {
      const b = writeBatch(db);
      b.update(doc(db, 'leagues/priv/players/pedro'), { uid: 'u-ana' });
      b.update(doc(db, 'members/priv_u-ana'), { playerId: 'pedro' });
      b.delete(doc(db, 'leagues/priv/players/ana-auto'));
      return b.commit();
    };
    // Un miembro no puede hacerlo por otro (ni por sí mismo con un jugador que no es suyo).
    await assertFails(link(luis()));
    await assertFails(link(ana()));
    await assertSucceeds(link(sofi()));
  });
  it('al salir suelta su jugador', async () => {
    const db = luis();
    const b = writeBatch(db);
    b.update(doc(db, 'leagues/priv/players/luis'), { uid: null });
    b.delete(doc(db, 'members/priv_u-luis'));
    await assertSucceeds(b.commit());
  });
});

describe('juegos', () => {
  it('solo los admins de la liga anotan en participaciones', async () => {
    await assertSucceeds(updateDoc(doc(sofi(), 'leagues/priv/entries/e1_luis'), { scores: [200] }));
    await assertFails(updateDoc(doc(luis(), 'leagues/priv/entries/e1_luis'), { scores: [300] }));
  });
  it('un miembro envía juegos de su jugador con foto y cuadros', async () => {
    await assertSucceeds(sendGames(luis(), 'priv', 'luis'));
  });
  it('no envía juegos de otro jugador, ni sin jugador, ni aprobados', async () => {
    await assertFails(sendGames(luis(), 'priv', 'pedro'));
    await assertFails(sendGames(ana(), 'priv', 'pedro'));
    await assertFails(sendGames(luis(), 'priv', 'luis', { status: 'aprobado' }));
  });
  it('sin foto se puede enviar (el admin decide), aunque la liga exija foto', async () => {
    await assertSucceeds(
      setDoc(doc(luis(), 'leagues/priv/submissions/s2'), { ...sub('luis', null), createdAt: serverTimestamp() }),
    );
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'members/pub_u-luis'), member('pub', 'u-luis', 'member', 'p1'));
    });
    await assertSucceeds(
      setDoc(doc(luis(), 'leagues/pub/submissions/s2'), { ...sub('p1', null, 'e9'), createdAt: serverTimestamp() }),
    );
  });
  it('por fecha, sin evento', async () => {
    const db = luis();
    const b = writeBatch(db);
    b.set(doc(db, 'leagues/priv/photos/f2'), { ...photo(null), createdAt: serverTimestamp() });
    b.set(doc(db, 'leagues/priv/submissions/s3'), { ...sub('luis', 'f2'), eventId: null, date: '2026-09-15', createdAt: serverTimestamp() });
    await assertSucceeds(b.commit());
  });
  it('lo que leyó la IA de la foto se agrega después, una vez, a su envío pendiente', async () => {
    await sendGames(luis(), 'priv', 'luis');
    const s1 = 'leagues/priv/submissions/s1';
    // Nada más que la lectura, y con pinos válidos.
    await assertFails(updateDoc(doc(luis(), s1), { scanned: [150, 160, 170], scores: [300, 300, 300] }));
    await assertFails(updateDoc(doc(luis(), s1), { scanned: [150, 999] }));
    await assertFails(updateDoc(doc(luis(), s1), { scanned: [] }));
    await assertFails(updateDoc(doc(luis(), s1), { scanned: 'x' }));
    // Otro miembro no toca el envío de Luis.
    await assertFails(updateDoc(doc(ana(), s1), { scanned: [150, 160, 170] }));
    await assertFails(updateDoc(doc(luis(), s1), { scanned: [150, 160, 170], scannedName: 'x'.repeat(61) }));
    await assertSucceeds(updateDoc(doc(luis(), s1), { scanned: [150, null, 170], scannedName: 'LUIS G' }));
    // Una sola vez: ya leída no se cambia.
    await assertFails(updateDoc(doc(luis(), s1), { scanned: [300, 300, 300] }));
    // El admin sí (lee la foto él mismo o corrige la fila).
    await assertSucceeds(updateDoc(doc(sofi(), s1), { scanned: [151, 160, 170] }));
  });
  it('los juegos enviados y lo leído son pinos válidos', async () => {
    const send = (fields: Record<string, unknown>) =>
      setDoc(doc(luis(), 'leagues/priv/submissions/s9'), { ...sub('luis', null), ...fields, createdAt: serverTimestamp() });
    await assertFails(send({ scores: [{ a: 1 }] }));
    await assertFails(send({ scores: [150, 301] }));
    await assertFails(send({ scanned: [999] }));
    await assertFails(send({ scanned: ['150'] }));
    await assertSucceeds(send({ scores: [150, null, 170], scanned: [150, null, 171] }));
  });
  it('la lectura no se agrega a un envío sin foto ni a uno ya revisado', async () => {
    await setDoc(doc(luis(), 'leagues/priv/submissions/s2'), { ...sub('luis', null), createdAt: serverTimestamp() });
    await assertFails(updateDoc(doc(luis(), 'leagues/priv/submissions/s2'), { scanned: [150, 160, 170] }));
    await sendGames(luis(), 'priv', 'luis');
    await updateDoc(doc(sofi(), 'leagues/priv/submissions/s1'), { status: 'aprobado' });
    await assertFails(updateDoc(doc(luis(), 'leagues/priv/submissions/s1'), { scanned: [150, 160, 170] }));
  });
  it('solo los admins aprueban', async () => {
    await sendGames(luis(), 'priv', 'luis');
    await assertFails(updateDoc(doc(luis(), 'leagues/priv/submissions/s1'), { status: 'aprobado' }));
    await assertSucceeds(updateDoc(doc(sofi(), 'leagues/priv/submissions/s1'), { status: 'aprobado' }));
  });
  it('asistencia: cada quien marca solo su "voy"', async () => {
    await assertSucceeds(updateDoc(doc(luis(), 'leagues/priv/events/e1'), { 'rsvp.luis': true }));
    await assertSucceeds(updateDoc(doc(luis(), 'leagues/priv/events/e1'), { 'rsvp.luis': deleteField() }));
    await assertFails(updateDoc(doc(luis(), 'leagues/priv/events/e1'), { 'rsvp.pedro': true }));
    await assertFails(updateDoc(doc(ana(), 'leagues/priv/events/e1'), { 'rsvp.ana': true }));
    await assertFails(updateDoc(doc(luis(), 'leagues/priv/events/e1'), { name: 'hack' }));
  });
});

describe('anotadores', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'leagues/copa'), { ...leagueData('u-org', 'public'), kind: 'torneo', name: 'Copa' });
      await setDoc(doc(db, 'members/copa_u-org'), member('copa', 'u-org', 'owner'));
      await setDoc(doc(db, 'members/copa_u-sofi'), member('copa', 'u-sofi', 'admin'));
      await setDoc(doc(db, 'members/copa_u-luis'), { ...member('copa', 'u-luis', 'member', 'jl'), scorer: true });
      await setDoc(doc(db, 'members/copa_u-ana'), member('copa', 'u-ana', 'member'));
      await setDoc(doc(db, 'leagues/copa/events/t1'), { type: 'torneo', name: 'Copa', date: '2026-10-01', games: 3, teams: {}, playerCount: 1 });
      await setDoc(doc(db, 'leagues/copa/entries/t1_px'), { eventId: 't1', playerId: 'px', teamId: null, scores: [null, null, null], photos: [null, null, null] });
      // En una liga normal la marca de anotador no vale.
      await setDoc(doc(db, 'members/priv_u-ana'), { ...member('priv', 'u-ana', 'member'), scorer: true });
    });
  });
  it('el dueño del torneo nombra anotadores; un admin no', async () => {
    await assertFails(updateDoc(doc(sofi(), 'members/copa_u-ana'), { scorer: true }));
    await assertFails(updateDoc(doc(ana(), 'members/copa_u-ana'), { scorer: true }));
    await assertSucceeds(updateDoc(doc(org(), 'members/copa_u-ana'), { scorer: true }));
    await assertSucceeds(updateDoc(doc(org(), 'members/copa_u-luis'), { scorer: false }));
  });
  it('el anotador anota pinos, fotos y cuadros de quien ya está inscrito', async () => {
    await assertSucceeds(
      updateDoc(doc(luis(), 'leagues/copa/entries/t1_px'), { scores: [190, null, null], photos: ['sin-foto', null, null], 'frames.0': { rolls: [10] } }),
    );
    await assertSucceeds(
      setDoc(doc(luis(), 'leagues/copa/photos/fx'), { data: 'data:image/jpeg;base64,AAAA', width: 1, height: 1, eventId: 't1', createdAt: serverTimestamp() }),
    );
  });
  it('el anotador no cambia equipos, no inscribe ni crea eventos', async () => {
    await assertFails(updateDoc(doc(luis(), 'leagues/copa/entries/t1_px'), { teamId: 'eq1' }));
    await assertFails(setDoc(doc(luis(), 'leagues/copa/entries/t1_nuevo'), { eventId: 't1', playerId: 'nuevo', scores: [], photos: [] }));
    await assertFails(setDoc(doc(luis(), 'leagues/copa/events/t2'), { type: 'torneo' }));
    await assertFails(updateDoc(doc(luis(), 'leagues/copa'), { name: 'Mía' }));
  });
  it('un admin no saca a un anotador (sería quitarle el permiso); el dueño sí', async () => {
    await assertFails(deleteDoc(doc(sofi(), 'members/copa_u-luis')));
    await assertSucceeds(deleteDoc(doc(sofi(), 'members/copa_u-ana')));
    await assertSucceeds(deleteDoc(doc(org(), 'members/copa_u-luis')));
  });
  it('un admin deja de ser admin por su cuenta, pero no se nombra anotador', async () => {
    await assertFails(updateDoc(doc(sofi(), 'members/copa_u-sofi'), { scorer: true }));
    await assertFails(updateDoc(doc(luis(), 'members/copa_u-luis'), { role: 'admin' }));
    await assertSucceeds(updateDoc(doc(sofi(), 'members/copa_u-sofi'), { role: 'member' }));
  });
  it('en una liga (no torneo) no hay anotadores', async () => {
    await assertFails(updateDoc(doc(ana(), 'leagues/priv/entries/e1_luis'), { scores: [300] }));
  });
});

describe('juegos de la sesión', () => {
  it('en una práctica un jugador suma un juego (de uno en uno, hasta 10); en un torneo no', async () => {
    await assertSucceeds(updateDoc(doc(luis(), 'leagues/priv/events/e1'), { games: 4 }));
    await assertFails(updateDoc(doc(luis(), 'leagues/priv/events/e1'), { games: 6 }));
    await assertFails(updateDoc(doc(luis(), 'leagues/priv/events/e1'), { games: 3 }));
    await assertFails(updateDoc(doc(ana(), 'leagues/priv/events/e1'), { games: 5 }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'leagues/priv/events/p10'), { type: 'practica', name: '', date: '2026-09-22', games: 10, teams: {}, playerCount: 0 });
      await setDoc(doc(ctx.firestore(), 'leagues/priv/events/t1'), { type: 'torneo', name: 'Copa', date: '2026-09-22', games: 3, teams: {}, playerCount: 0 });
    });
    await assertFails(updateDoc(doc(luis(), 'leagues/priv/events/p10'), { games: 11 }));
    await assertFails(updateDoc(doc(luis(), 'leagues/priv/events/t1'), { games: 4 }));
    await assertSucceeds(updateDoc(doc(sofi(), 'leagues/priv/events/t1'), { games: 4 }));
  });
});

describe('juegos en vivo desde el teléfono', () => {
  const live = (playerId: string, scores: (number | null)[], extra: Record<string, unknown> = {}) => ({
    eventId: 'e1',
    playerId,
    scores,
    updatedAt: serverTimestamp(),
    ...extra,
  });
  it('el jugador publica sus juegos en vivo y todos los de la liga los ven', async () => {
    await assertSucceeds(setDoc(doc(luis(), 'leagues/priv/live/e1_luis'), live('luis', [190, 210])));
    await assertSucceeds(getDocs(collection(ana(), 'leagues/priv/live')));
    await assertFails(getDocs(collection(as('u-extra'), 'leagues/priv/live')));
    await assertSucceeds(deleteDoc(doc(luis(), 'leagues/priv/live/e1_luis')));
  });
  it('al salir de la liga se quitan sus juegos en vivo en el mismo lote', async () => {
    await assertSucceeds(setDoc(doc(luis(), 'leagues/priv/live/e1_luis'), live('luis', [190])));
    const db = luis();
    const b = writeBatch(db);
    b.delete(doc(db, 'leagues/priv/live/e1_luis'));
    b.update(doc(db, 'leagues/priv/players/luis'), { uid: null });
    b.delete(doc(db, 'members/priv_u-luis'));
    await assertSucceeds(b.commit());
  });
  it('al enviar sus juegos, en el mismo lote sale de "en vivo" (tenga o no fila)', async () => {
    const withLive = (db: Firestore, id: string) => {
      const b = writeBatch(db);
      b.delete(doc(db, 'leagues/priv/live/e1_luis'));
      b.set(doc(db, `leagues/priv/submissions/${id}`), { ...sub('luis', null), createdAt: serverTimestamp() });
      return b.commit();
    };
    await assertSucceeds(withLive(luis(), 'sin-fila'));
    await assertSucceeds(setDoc(doc(luis(), 'leagues/priv/live/e1_luis'), live('luis', [190])));
    await assertSucceeds(withLive(luis(), 'con-fila'));
  });
  it('solo puntajes de 0 a 300 (o vacíos)', async () => {
    await assertSucceeds(setDoc(doc(luis(), 'leagues/priv/live/e1_luis'), live('luis', [0, null, 300])));
    await assertFails(setDoc(doc(luis(), 'leagues/priv/live/e1_luis'), live('luis', [301])));
    await assertFails(setDoc(doc(luis(), 'leagues/priv/live/e1_luis'), live('luis', ['x'.repeat(1000)])));
    await assertFails(setDoc(doc(luis(), 'leagues/priv/live/e1_luis'), live('luis', [190.5])));
  });
  it('en un torneo solo publica quien está inscrito', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'leagues/priv/events/t9'), { type: 'torneo', name: 'Copa', date: '2026-09-22', games: 3, teams: {}, playerCount: 0 });
    });
    await assertFails(setDoc(doc(luis(), 'leagues/priv/live/t9_luis'), live('luis', [200], { eventId: 't9' })));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'leagues/priv/entries/t9_luis'), { eventId: 't9', playerId: 'luis', scores: [], photos: [] });
    });
    await assertSucceeds(setDoc(doc(luis(), 'leagues/priv/live/t9_luis'), live('luis', [200], { eventId: 't9' })));
  });
  it('nadie publica por otro, ni sin jugador, ni en un evento que no existe', async () => {
    await assertFails(setDoc(doc(luis(), 'leagues/priv/live/e1_pedro'), live('pedro', [300])));
    await assertFails(setDoc(doc(ana(), 'leagues/priv/live/e1_luis'), live('luis', [300])));
    await assertFails(setDoc(doc(luis(), 'leagues/priv/live/nada_luis'), live('luis', [190], { eventId: 'nada' })));
    await assertFails(setDoc(doc(luis(), 'leagues/priv/live/e1_luis'), live('luis', Array(11).fill(100))));
  });
});

describe('social: me gusta, felicitar y comentarios', () => {
  const like = (uid: string, name: string, extra: Record<string, unknown> = {}) => ({
    entryId: 'e1_luis',
    eventId: 'e1',
    playerId: 'luis',
    uid,
    name,
    type: 'felicitar',
    createdAt: serverTimestamp(),
    ...extra,
  });
  const comment = (uid: string, name: string, text: string, extra: Record<string, unknown> = {}) => ({
    entryId: 'e1_luis',
    eventId: 'e1',
    playerId: 'luis',
    uid,
    name,
    text,
    createdAt: serverTimestamp(),
    ...extra,
  });

  it('un miembro felicita el juego de otro (una reacción suya por juego) y la cambia o la quita', async () => {
    await assertSucceeds(setDoc(doc(ana(), 'leagues/priv/reactions/e1_luis_u-ana'), like('u-ana', 'ana')));
    await assertSucceeds(setDoc(doc(ana(), 'leagues/priv/reactions/e1_luis_u-ana'), like('u-ana', 'ana', { type: 'like' })));
    await assertFails(deleteDoc(doc(luis(), 'leagues/priv/reactions/e1_luis_u-ana')));
    await assertSucceeds(deleteDoc(doc(ana(), 'leagues/priv/reactions/e1_luis_u-ana')));
    // Quitarla otra vez (otra pestaña ya la quitó) no da error.
    await assertSucceeds(deleteDoc(doc(ana(), 'leagues/priv/reactions/e1_luis_u-ana')));
  });
  it('el nombre es el de su membresía: nadie se hace pasar por otro', async () => {
    await assertFails(setDoc(doc(ana(), 'leagues/priv/reactions/e1_luis_u-ana'), like('u-ana', 'Admin de la liga')));
    await assertFails(setDoc(doc(ana(), 'leagues/priv/reactions/e1_luis_u-ana'), like('u-ana', 'sofi')));
  });
  it('no se reacciona por otro, ni con otro id, ni a un juego que no existe o diciendo mal de quién es', async () => {
    await assertFails(setDoc(doc(ana(), 'leagues/priv/reactions/e1_luis_u-sofi'), like('u-sofi', 'sofi')));
    await assertFails(setDoc(doc(ana(), 'leagues/priv/reactions/otro'), like('u-ana', 'ana')));
    await assertFails(setDoc(doc(ana(), 'leagues/priv/reactions/e1_nadie_u-ana'), like('u-ana', 'ana', { entryId: 'e1_nadie' })));
    await assertFails(setDoc(doc(ana(), 'leagues/priv/reactions/e1_luis_u-ana'), like('u-ana', 'ana', { playerId: 'pedro' })));
    await assertFails(setDoc(doc(ana(), 'leagues/priv/reactions/e1_luis_u-ana'), like('u-ana', 'ana', { type: 'odio' })));
  });
  it('quien no es miembro no reacciona ni comenta, pero en una liga pública lo ve', async () => {
    await assertFails(setDoc(doc(as('u-extra'), 'leagues/priv/reactions/e1_luis_u-extra'), like('u-extra', 'extra')));
    await assertFails(getDocs(collection(as('u-extra'), 'leagues/priv/comments')));
    await assertSucceeds(getDocs(collection(anon(), 'leagues/pub/comments')));
  });
  // Como en la app: el comentario y la marca de ritmo van juntos.
  const postComment = (db: Firestore, id: string, uid: string, name: string, text: string, extra: Record<string, unknown> = {}) => {
    const b = writeBatch(db);
    b.set(doc(db, `leagues/priv/comments/${id}`), comment(uid, name, text, extra));
    b.set(doc(db, `leagues/priv/limits/${uid}`), { lastComment: serverTimestamp(), commentId: id }, { merge: true });
    return b.commit();
  };
  it('comentar: texto de 1 a 500 letras; lo borra el autor o un admin, nadie lo edita', async () => {
    await assertSucceeds(postComment(luis(), 'c1', 'u-luis', 'luis', '¡Gracias!'));
    await assertSucceeds(postComment(ana(), 'c2', 'u-ana', 'ana', '¡Qué juegazo! 🎉'));
    await assertFails(postComment(sofi(), 'c3', 'u-sofi', 'sofi', ''));
    await assertFails(postComment(sofi(), 'c4', 'u-sofi', 'sofi', 'x'.repeat(501)));
    await assertFails(postComment(sofi(), 'c5', 'u-luis', 'luis', 'Me hago pasar'));
    await assertFails(postComment(sofi(), 'c6', 'u-sofi', 'Luis', 'Con otro nombre'));
    await assertFails(setDoc(doc(sofi(), 'leagues/priv/comments/c7'), comment('u-sofi', 'sofi', 'Sin marcar el ritmo')));
    await assertFails(updateDoc(doc(ana(), 'leagues/priv/comments/c2'), { text: 'editado' }));
    await assertFails(deleteDoc(doc(luis(), 'leagues/priv/comments/c2')));
    await assertSucceeds(deleteDoc(doc(sofi(), 'leagues/priv/comments/c2')));
    await assertSucceeds(deleteDoc(doc(luis(), 'leagues/priv/comments/c1')));
    await assertSucceeds(deleteDoc(doc(luis(), 'leagues/priv/comments/c1')));
  });
  it('un comentario cada 3 segundos por persona (nadie llena de spam un juego)', async () => {
    await assertSucceeds(postComment(ana(), 'r1', 'u-ana', 'ana', 'Uno'));
    await assertFails(postComment(ana(), 'r2', 'u-ana', 'ana', 'Dos seguido'));
    await assertSucceeds(postComment(luis(), 'r3', 'u-luis', 'luis', 'Otro sí puede'));
  });
  it('no se salta el ritmo borrando su marca ni metiendo muchos en un lote', async () => {
    await assertSucceeds(postComment(ana(), 'b1', 'u-ana', 'ana', 'Uno'));
    await assertFails(deleteDoc(doc(ana(), 'leagues/priv/limits/u-ana')));
    const db = sofi();
    const b = writeBatch(db);
    b.set(doc(db, 'leagues/priv/comments/m1'), comment('u-sofi', 'sofi', 'Spam 1'));
    b.set(doc(db, 'leagues/priv/comments/m2'), comment('u-sofi', 'sofi', 'Spam 2'));
    b.set(doc(db, 'leagues/priv/limits/u-sofi'), { lastComment: serverTimestamp(), commentId: 'm1' });
    await assertFails(b.commit());
    // La marca tiene que decir cuál comentario es.
    const d = luis();
    const x = writeBatch(d);
    x.set(doc(d, 'leagues/priv/comments/m4'), comment('u-luis', 'luis', 'Marca de otro'));
    x.set(doc(d, 'leagues/priv/limits/u-luis'), { lastComment: serverTimestamp(), commentId: 'otro' });
    await assertFails(x.commit());
  });
  it('no se borra el me gusta, comentario o juego en vivo de otro', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const d = ctx.firestore();
      await setDoc(doc(d, 'leagues/priv/reactions/e1_luis_u-luis'), like('u-luis', 'luis'));
      await setDoc(doc(d, 'leagues/priv/comments/k1'), comment('u-luis', 'luis', 'mío'));
      await setDoc(doc(d, 'leagues/priv/live/e1_luis'), { eventId: 'e1', playerId: 'luis', scores: [190] });
    });
    await assertFails(deleteDoc(doc(ana(), 'leagues/priv/reactions/e1_luis_u-luis')));
    await assertFails(deleteDoc(doc(ana(), 'leagues/priv/comments/k1')));
    await assertFails(deleteDoc(doc(ana(), 'leagues/priv/live/e1_luis')));
    // Un admin sí (al limpiar un evento, un jugador o una participación).
    await assertSucceeds(deleteDoc(doc(sofi(), 'leagues/priv/reactions/e1_luis_u-luis')));
    await assertSucceeds(deleteDoc(doc(sofi(), 'leagues/priv/live/e1_luis')));
    await assertSucceeds(getDocs(query(collection(sofi(), 'leagues/priv/comments'), where('eventId', '==', 'e1'))));
    await assertSucceeds(getDocs(query(collection(sofi(), 'leagues/priv/reactions'), where('entryId', '==', 'e1_luis'))));
  });
});

describe('buzón de sugerencias', () => {
  const note = (text: string, extra: Record<string, unknown> = {}) => ({ text, read: false, createdAt: serverTimestamp(), ...extra });
  // Como en la app: la nota y la marca de ritmo van juntas.
  const suggest = (db: Firestore, id: string, uid: string, text: string, extra: Record<string, unknown> = {}) => {
    const b = writeBatch(db);
    b.set(doc(db, `leagues/priv/suggestions/${id}`), note(text, extra));
    b.set(doc(db, `leagues/priv/limits/${uid}`), { lastSuggestion: serverTimestamp(), suggestionId: id }, { merge: true });
    return b.commit();
  };

  it('un miembro deja una nota anónima; no puede decir quién la escribió', async () => {
    await assertSucceeds(suggest(luis(), 's1', 'u-luis', 'Más prácticas los jueves'));
    await assertFails(suggest(ana(), 's2', 'u-ana', 'Con autor', { uid: 'u-ana' }));
    await assertFails(suggest(ana(), 's3', 'u-ana', 'Ya leída', { read: true }));
    await assertFails(suggest(ana(), 's4', 'u-ana', ''));
    await assertFails(suggest(ana(), 's5', 'u-ana', 'x'.repeat(1001)));
    await assertFails(suggest(as('u-extra'), 's6', 'u-extra', 'No soy de la liga'));
    await assertFails(setDoc(doc(ana(), 'leagues/priv/suggestions/s7'), note('Sin marcar el ritmo')));
  });
  it('una por minuto por persona', async () => {
    await assertSucceeds(suggest(ana(), 'r1', 'u-ana', 'Una'));
    await assertFails(suggest(ana(), 'r2', 'u-ana', 'Otra enseguida'));
    // Comentar no cuenta para el buzón (y viceversa).
    await assertSucceeds(suggest(luis(), 'r3', 'u-luis', 'La de Luis'));
  });
  it('solo los organizadores leen, marcan y borran las notas; nadie lee quién escribió', async () => {
    await assertSucceeds(suggest(luis(), 'n1', 'u-luis', 'Idea'));
    await assertFails(getDocs(collection(luis(), 'leagues/priv/suggestions')));
    await assertFails(getDoc(doc(ana(), 'leagues/priv/limits/u-luis')));
    await assertFails(getDoc(doc(org(), 'leagues/priv/limits/u-luis')));
    await assertSucceeds(getDocs(collection(sofi(), 'leagues/priv/suggestions')));
    await assertFails(updateDoc(doc(sofi(), 'leagues/priv/suggestions/n1'), { text: 'cambiada' }));
    await assertSucceeds(updateDoc(doc(sofi(), 'leagues/priv/suggestions/n1'), { read: true }));
    await assertFails(deleteDoc(doc(luis(), 'leagues/priv/suggestions/n1')));
    await assertSucceeds(deleteDoc(doc(org(), 'leagues/priv/suggestions/n1')));
  });
  it('la marca de ritmo no se adelanta, no se borra la otra ni la propia', async () => {
    const db = ana();
    await assertSucceeds(setDoc(doc(db, 'leagues/priv/limits/u-ana'), { lastComment: serverTimestamp() }));
    await assertFails(setDoc(doc(db, 'leagues/priv/limits/u-ana'), { lastSuggestion: serverTimestamp() }));
    await assertFails(setDoc(doc(db, 'leagues/priv/limits/u-ana'), { lastComment: new Date(2020, 0, 1) }, { merge: true }));
    await assertFails(setDoc(doc(db, 'leagues/priv/limits/u-luis'), { lastComment: serverTimestamp() }));
    await assertFails(deleteDoc(doc(db, 'leagues/priv/limits/u-ana')));
  });
  it('muchas notas en un solo lote no pasan', async () => {
    const db = luis();
    const b = writeBatch(db);
    b.set(doc(db, 'leagues/priv/suggestions/x1'), note('Uno'));
    b.set(doc(db, 'leagues/priv/suggestions/x2'), note('Dos'));
    b.set(doc(db, 'leagues/priv/limits/u-luis'), { lastSuggestion: serverTimestamp(), suggestionId: 'x1' });
    await assertFails(b.commit());
  });
  it('al borrar la liga, el dueño borra las marcas de cada miembro sin poder leerlas', async () => {
    await assertSucceeds(suggest(luis(), 'z1', 'u-luis', 'Idea'));
    await assertFails(getDocs(collection(org(), 'leagues/priv/limits')));
    await assertSucceeds(deleteDoc(doc(org(), 'leagues/priv/limits/u-luis')));
    await assertSucceeds(deleteDoc(doc(org(), 'leagues/priv/limits/u-nadie')));
  });
});

describe('teléfonos suscritos a notificaciones', () => {
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'BPk', auth: 'xyz', ua: 'Android' };
  it('cada cuenta guarda y borra solo los suyos; nadie más los ve', async () => {
    await assertSucceeds(setDoc(doc(ana(), 'users/u-ana/push/t1'), { ...sub, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(ana(), 'users/u-luis/push/t1'), { ...sub, updatedAt: serverTimestamp() }));
    await assertFails(getDocs(collection(org(), 'users/u-ana/push')));
    await assertFails(setDoc(doc(ana(), 'users/u-ana/push/t2'), { ...sub, endpoint: 'http://malo', updatedAt: serverTimestamp() }));
    // Solo servicios de push conocidos (el envío no le escribe a cualquier dirección).
    await assertFails(setDoc(doc(ana(), 'users/u-ana/push/t4'), { ...sub, endpoint: 'https://mi-servidor.com/fcm.googleapis.com/x', updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(ana(), 'users/u-ana/push/t5'), { ...sub, endpoint: 'https://fcm.googleapis.com.malo.com/x', updatedAt: serverTimestamp() }));
    for (const endpoint of ['https://web.push.apple.com/QGx', 'https://updates.push.services.mozilla.com/wpush/v2/g', 'https://wns2-bl2p.notify.windows.com/w/?token=a']) {
      await assertSucceeds(setDoc(doc(ana(), 'users/u-ana/push/t6'), { ...sub, endpoint, updatedAt: serverTimestamp() }));
    }
    await assertFails(setDoc(doc(ana(), 'users/u-ana/push/t3'), { ...sub, extra: 1, updatedAt: serverTimestamp() }));
    await assertSucceeds(getDocs(collection(ana(), 'users/u-ana/push')));
    await assertSucceeds(deleteDoc(doc(ana(), 'users/u-ana/push/t1')));
  });
});

describe('cuentas', () => {
  it('crea su perfil sin flag de superadmin', async () => {
    await assertSucceeds(setDoc(doc(extra(), 'users/u-new'), { email: 'new@x.com', name: 'Nuevo', createdAt: serverTimestamp() }));
    await assertFails(
      setDoc(doc(as('u-new2'), 'users/u-new2'), { email: 'new2@x.com', name: 'Nuevo', superadmin: true, createdAt: serverTimestamp() }),
    );
  });
  it('cambia su nombre pero no se hace superadmin', async () => {
    await assertSucceeds(updateDoc(doc(ana(), 'users/u-ana'), { name: 'Ana María' }));
    await assertFails(updateDoc(doc(ana(), 'users/u-ana'), { superadmin: true }));
  });
});
