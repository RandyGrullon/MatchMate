// Carga un torneo histórico (JSON sacado del Excel) dentro de una liga.
// Los juegos quedan verificados como "importado" (resultado auditado, sin foto).
//
//   node scripts/importar-torneo.mjs scripts/datos/torneo-2025.json --liga <id-de-la-liga> [--reemplazar]
//
// El id de la liga es el que sale en el link: bowlin-x.vercel.app/l/<id>.
// Pide el correo y la contraseña de un admin de esa liga en la terminal (no se guardan).
// BOWLINX_EMULADOR=1 lo corre contra los emuladores locales.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';

const IMPORTED = 'importado';
const args = process.argv.slice(2);
const ligaAt = args.indexOf('--liga');
const lid = ligaAt >= 0 ? args[ligaAt + 1] : undefined;
const [file] = args.filter((a, i) => !a.startsWith('--') && i !== ligaAt + 1);
const replace = args.includes('--reemplazar');
const emulator = process.env.BOWLINX_EMULADOR === '1';
if (!file || !lid) {
  console.error('Uso: node scripts/importar-torneo.mjs <archivo.json> --liga <id-de-la-liga> [--reemplazar]');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.startsWith('VITE_'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const db = getFirestore(app);
if (emulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8089);
}

function ask(question, hidden = false) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    rl._writeToOutput = (s) => rl.output.write(s.includes(question) ? s : '');
  }
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    }),
  );
}

const normalize = (s) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();

const data = JSON.parse(readFileSync(file, 'utf8'));
const { event, teams, players } = data;
console.log(`${event.name} (${event.date}) · ${players.length} jugadores · ${teams.length} equipos${emulator ? ' · EMULADOR' : ''}`);

const email = process.env.BOWLINX_EMAIL || (await ask('Correo del admin [admin@admin.com]: ')) || 'admin@admin.com';
const password = process.env.BOWLINX_PASSWORD || (await ask('Contraseña: ', true));
await signInWithEmailAndPassword(auth, email, password);

const league = await getDoc(doc(db, 'leagues', lid));
if (!league.exists()) {
  console.error(`No existe la liga "${lid}" (o no tienes permiso para verla).`);
  process.exit(1);
}
console.log(`Liga: ${league.get('name')}`);
const col = (name) => collection(db, 'leagues', lid, name);
const ref = (name, id) => doc(db, 'leagues', lid, name, id);

const eventRef = ref('events', event.id);
if ((await getDoc(eventRef)).exists()) {
  if (!replace) {
    console.error(`El evento "${event.id}" ya existe. Usa --reemplazar para volver a cargarlo.`);
    process.exit(1);
  }
  const old = await getDocs(query(col('entries'), where('eventId', '==', event.id)));
  const b = writeBatch(db);
  old.docs.forEach((d) => b.delete(d.ref));
  await b.commit();
}

// Reusa jugadores que ya existan con el mismo nombre; crea los que falten.
const existing = await getDocs(col('players'));
const byName = new Map(existing.docs.map((d) => [normalize(d.get('name')), d.id]));
const batch = writeBatch(db);
let created = 0;
const teamIds = Object.fromEntries(teams.map((t, i) => [t, `eq${i + 1}`]));

batch.set(eventRef, {
  type: event.type,
  name: event.name,
  date: event.date,
  games: event.games,
  hcpBase: event.hcpBase,
  hcpPercent: event.hcpPercent,
  individualRankBy: event.individualRankBy,
  teamRankBy: event.teamRankBy,
  ...(event.categoryCuts ? { categoryCuts: event.categoryCuts } : {}),
  teamSize: event.teamSize ?? 3,
  announcement: '',
  teams: Object.fromEntries(teams.map((t, i) => [teamIds[t], { name: t, order: i + 1 }])),
  playerCount: players.length,
  createdAt: serverTimestamp(),
});

for (const p of players) {
  let playerId = byName.get(normalize(p.name));
  if (!playerId) {
    playerId = doc(col('players')).id;
    byName.set(normalize(p.name), playerId);
    batch.set(ref('players', playerId), { name: p.name, averageOverride: null, createdAt: serverTimestamp() });
    created++;
  }
  const formula = Math.max(0, Math.floor(((event.hcpBase - p.average) * event.hcpPercent) / 100));
  batch.set(ref('entries', `${event.id}_${playerId}`), {
    eventId: event.id,
    playerId,
    teamId: p.team ? teamIds[p.team] : null,
    average: p.average,
    handicapOverride: p.handicap === formula ? null : p.handicap,
    scores: p.scores,
    photos: p.scores.map((s) => (s == null ? null : IMPORTED)),
    createdAt: serverTimestamp(),
  });
}

await batch.commit();
console.log(`Listo: ${created} jugadores nuevos, ${players.length} inscritos en ${event.name}.`);
process.exit(0);
