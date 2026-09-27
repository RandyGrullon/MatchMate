import { collection, getDocs, query, Timestamp, where } from 'firebase/firestore';
import { toIsoDate } from './format';
import { db } from './firebase';

/** Lo que entra de cada liga. Las fotos no (pesan mucho); los juegos guardan qué foto los verificó. */
const LEAGUE_COLLECTIONS = ['players', 'events', 'entries', 'submissions', 'reactions', 'comments', 'suggestions'] as const;

const plain = (v: unknown): unknown =>
  v instanceof Timestamp
    ? v.toDate().toISOString()
    : Array.isArray(v)
      ? v.map(plain)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]))
        : v;

const rows = (snap: Awaited<ReturnType<typeof getDocs>>) => snap.docs.map((d) => ({ id: d.id, ...(plain(d.data()) as object) }));

async function leagueData(lid: string) {
  const out: Record<string, unknown[]> = {};
  for (const name of LEAGUE_COLLECTIONS) out[name] = rows(await getDocs(collection(db, 'leagues', lid, name)));
  out.members = rows(await getDocs(query(collection(db, 'members'), where('leagueId', '==', lid))));
  return out;
}

function download(data: object, name: string) {
  const blob = new Blob([JSON.stringify({ app: 'BowlingX', exportedAt: new Date().toISOString(), ...data }, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bowlingx-${name}-${toIsoDate(new Date())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'liga';

/** Admin de la liga: descarga todos sus datos en un JSON (respaldo gratis, sin plan de pago). */
export async function downloadLeagueBackup(league: { id: string; name: string }) {
  const data = await leagueData(league.id);
  download({ league: { ...league }, ...data }, slug(league.name));
  return { players: data.players.length, events: data.events.length, entries: data.entries.length };
}

/** Superadmin: todas las ligas y las cuentas. */
export async function downloadFullBackup() {
  const leagues = rows(await getDocs(collection(db, 'leagues'))) as { id: string }[];
  const all = [];
  for (const l of leagues) all.push({ ...l, ...(await leagueData(l.id)) });
  const users = rows(await getDocs(collection(db, 'users')));
  download({ leagues: all, users }, 'completo');
  return { leagues: leagues.length, users: users.length };
}
