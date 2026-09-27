/**
 * Recordatorios de BowlingX: los manda GitHub Actions cada 15 minutos (.github/workflows/recordatorios.yml).
 * Por cada práctica o torneo de hoy y mañana, envía (una sola vez cada uno) los avisos que tocan:
 * el día antes a las 12 pm, el mismo día y poco antes de empezar. Llegan como notificación push aunque
 * la app esté cerrada, a los teléfonos de los miembros de la liga que activaron las notificaciones.
 *
 * El repositorio es público: lo que se escribe en el registro lo ve cualquiera. Solo se escriben números
 * (nunca nombres de ligas, eventos ni personas).
 *
 * Secretos (GitHub › Settings › Secrets and variables › Actions):
 *   FIREBASE_SERVICE_ACCOUNT  JSON de la cuenta de servicio de Firebase (Configuración del proyecto › Cuentas de servicio)
 *   VAPID_PRIVATE_KEY         clave privada VAPID (la pública está en src/lib/pushKey.ts)
 *   VAPID_SUBJECT             mailto: de contacto (p. ej. mailto:tucorreo@gmail.com)
 * Sin los secretos no hace nada. Local contra el emulador: FIRESTORE_EMULATOR_HOST=127.0.0.1:8089 PRUEBA=1.
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import webpush from 'web-push';
import type { DocumentSnapshot, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { PUSH_ENDPOINT, VAPID_PUBLIC_KEY } from '../../src/lib/pushKey';
import { dueReminders, localNow, reminderTtl, type Reminder } from '../../src/lib/reminders';

const env = process.env;
const TZ = env.LIGA_TZ || 'America/Santo_Domingo';
const emulator = !!env.FIRESTORE_EMULATOR_HOST;
/** Prueba: dice qué mandaría, sin mandar ni marcar nada. */
const dryRun = env.PRUEBA === '1';

if (!emulator && (!env.FIREBASE_SERVICE_ACCOUNT || !env.VAPID_PRIVATE_KEY)) {
  console.log('Recordatorios apagados: faltan los secretos FIREBASE_SERVICE_ACCOUNT y VAPID_PRIVATE_KEY. No se envía nada.');
  process.exit(0);
}

initializeApp(
  emulator
    ? { projectId: env.GCLOUD_PROJECT || 'demo-matchmate' }
    : { credential: cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT!)) },
);
const db = getFirestore();
if (env.VAPID_PRIVATE_KEY) webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:bowlingx@example.com', VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

const now = env.AHORA ? new Date(env.AHORA) : new Date();
const { today, minutes } = localNow(now, TZ);
/** 'YYYY-MM-DD' de hoy (en la zona de la liga) más `n` días. */
const shift = (n: number) => {
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const tomorrow = shift(1);

/** Teléfonos por cuenta a los que se manda (los más recientes). */
const MAX_PHONES = 5;
/** Envíos a la vez. */
const PARALLEL = 10;

let sent = 0;
let gone = 0;
let failed = 0;
const planned: Record<string, number> = {};

/** Corre `fn` sobre todos, con `limit` a la vez. */
async function eachLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

/** Marca los que tocan y devuelve el más cercano que no había salido (una sola vez aunque coincidan dos envíos). */
async function claim(lid: string, eid: string, date: string, due: Reminder[]): Promise<Reminder | null> {
  const ref = db.collection('recordatorios').doc(`${lid}_${eid}`);
  if (dryRun) {
    const snap = await ref.get();
    const done = new Set<string>(snap.exists ? (snap.get('enviados') ?? []) : []);
    return due.filter((r) => !done.has(r.slot)).at(-1) ?? null;
  }
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const done = new Set<string>(snap.exists ? (snap.get('enviados') ?? []) : []);
    const pending = due.filter((r) => !done.has(r.slot));
    if (!pending.length) return null;
    tx.set(ref, { enviados: [...done, ...pending.map((r) => r.slot)], liga: lid, evento: eid, fecha: date, actualizado: FieldValue.serverTimestamp() }, { merge: true });
    return pending[pending.length - 1];
  });
}

/** Los teléfonos de una cuenta (los más recientes; solo de servicios de push conocidos). */
async function phones(uid: string) {
  const subs = await db.collection('users').doc(uid).collection('push').orderBy('updatedAt', 'desc').limit(MAX_PHONES).get();
  return subs.docs.filter((s) => PUSH_ENDPOINT.test(String(s.get('endpoint') ?? '')));
}

async function send(phone: QueryDocumentSnapshot, payload: string, ttl: number) {
  const d = phone.data();
  if (dryRun || emulator) {
    sent++;
    return;
  }
  try {
    await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload, { TTL: ttl, urgency: 'high', timeout: 10_000 });
    sent++;
  } catch (err) {
    const e = err as { statusCode?: number };
    // El teléfono ya no existe o quitó el permiso: se borra la suscripción.
    if (e.statusCode === 404 || e.statusCode === 410) {
      await phone.ref.delete().catch(() => undefined);
      gone++;
    } else {
      failed++;
      console.error('No se pudo enviar a un teléfono:', e.statusCode ?? 'sin respuesta');
    }
  }
}

/**
 * Las prácticas y torneos de hoy y mañana, con su liga. Una sola consulta a todas las ligas (necesita
 * la exención de índice de "date" en el grupo "events"; sin ella, se consulta liga por liga).
 */
async function upcoming(): Promise<{ league: DocumentSnapshot; event: QueryDocumentSnapshot }[]> {
  try {
    const events = (await db.collectionGroup('events').where('date', 'in', [today, tomorrow]).get()).docs.filter(
      (ev) => ev.ref.parent.parent?.parent.id === 'leagues',
    );
    const refs = [...new Map(events.map((ev) => [ev.ref.parent.parent!.path, ev.ref.parent.parent!])).values()];
    const leagues = new Map((refs.length ? await db.getAll(...refs) : []).map((l) => [l.id, l]));
    return events.flatMap((event) => {
      const league = leagues.get(event.ref.parent.parent!.id);
      return league?.exists ? [{ league, event }] : [];
    });
  } catch (err) {
    if ((err as { code?: number }).code !== 9) throw err; // 9 = FAILED_PRECONDITION: falta el índice
    const out: { league: DocumentSnapshot; event: QueryDocumentSnapshot }[] = [];
    for (const league of (await db.collection('leagues').get()).docs) {
      const events = await league.ref.collection('events').where('date', 'in', [today, tomorrow]).get();
      for (const event of events.docs) out.push({ league, event });
    }
    return out;
  }
}

for (const { league: lg, event: ev } of await upcoming()) {
  const league = { name: String(lg.get('name') ?? 'Tu liga'), schedule: String(lg.get('schedule') ?? '') };
  const e = { date: String(ev.get('date')), type: ev.get('type') === 'torneo' ? ('torneo' as const) : ('practica' as const), name: String(ev.get('name') ?? '') };
  const due = dueReminders(e, league, today, minutes);
  if (!due.length) continue;
  const reminder = await claim(lg.id, ev.id, e.date, due);
  if (!reminder) continue;
  planned[reminder.slot] = (planned[reminder.slot] ?? 0) + 1;
  const payload = JSON.stringify({ title: reminder.title, body: reminder.body, url: `/l/${lg.id}/e/${ev.id}`, tag: `recordatorio:${ev.id}` });
  const ttl = reminderTtl(e, league, today, minutes);
  const members = await db.collection('members').where('leagueId', '==', lg.id).get();
  const uids = [...new Set(members.docs.map((m) => String(m.get('uid') ?? '')).filter(Boolean))];
  const targets = (await Promise.all(uids.map(phones))).flat();
  await eachLimit(targets, PARALLEL, (phone) => send(phone, payload, ttl));
}

// Limpieza: las marcas de eventos de hace más de una semana ya no sirven.
if (!dryRun) {
  const stale = await db.collection('recordatorios').where('fecha', '<', shift(-8)).limit(200).get();
  await Promise.all(stale.docs.map((d) => d.ref.delete()));
}

const events = Object.entries(planned);
console.log(events.length ? `Recordatorios: ${events.map(([slot, n]) => `${n} ${slot}`).join(', ')}.` : 'Nada que recordar ahora.');
console.log(
  `${dryRun ? '[prueba] ' : ''}${sent} notificaciones, ${failed} fallidas, ${gone} suscripciones viejas borradas · ${today} ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')} (${TZ}).`,
);
