/**
 * Exportación SINTÉTICA de BowlingX, con la forma exacta de lo que saca `exportar` (bowlingx.json + fotos/) y
 * `firebase auth:export` (users.json), y los parámetros del hash como se copian de la consola (hash.txt). Sirve
 * para ensayar la importación completa sin tener todavía la exportación de verdad:
 *
 *   node scripts/migrar/cli.mjs sintetico --salida C:\migracion-bowlingx\sintetico
 *   node scripts/migrar/cli.mjs importar --datos C:\migracion-bowlingx\sintetico --auth ...\users.json --hash ...\hash.txt --fotos-meses 6
 *
 * Es lo que escribe BowlingX de verdad (src/lib/data.ts de BowlingX), no una versión «limpia»:
 * - 2 ligas: «Liga Dominicana de Boliche» (liga privada, exige foto, código de invitación) y «Open del Este 2026»
 *   (torneo sin liga, pública, sin foto, con anotadores). 32 jugadores (5 sin cuenta), dueños, admins, anotadores.
 * - Temporadas 2025 (juegos importados del Excel: marca «importado») y 2026 (verificados con foto del marcador,
 *   «sin-foto» cuando el admin aceptó un envío sin foto, borradores sin marca), prácticas de 3 a 5 juegos, torneos
 *   con equipos, handicap, cortes de categoría y handicap fijo, «voy» y una práctica que todavía no se juega.
 * - Equipos con `order` = Date.now() (addTeam/applyTeams), cuadros tiro por tiro en algunos juegos.
 * - Envíos pendientes, aprobados y rechazados, con y sin foto, por evento y por fecha, con lo que leyó la IA.
 * - Reacciones (id `participación_cuenta`), comentarios, sugerencias leídas y sin leer.
 * - Fotos (archivos aparte, como `exportar`), las de enero y febrero ya borradas en BowlingX (el juego sigue
 *   verificado) y las de marzo, viejas para `--fotos-meses 6`.
 * - Cuentas: contraseña (casi todas sin verificar: BowlingX nunca pidió verificar), Google, las dos, una
 *   deshabilitada, admin@admin.com, un superadmin de verdad, una registrada sin perfil y una que ya no está en
 *   ninguna liga. Hashes scrypt de Firebase de verdad (mem_cost 14, rounds 8).
 *
 * Todo sale de una semilla: la misma semilla da exactamente los mismos archivos.
 */
import { firebaseHash, type FirebaseHashConfig } from './hash';
import type {
  FirebaseAuthExport,
  FirebaseAuthUser,
  FsBackup,
  FsComment,
  FsEntry,
  FsEvent,
  FsGameFrames,
  FsLeague,
  FsMember,
  FsPhoto,
  FsPlayer,
  FsReaction,
  FsSubmission,
  FsSuggestion,
  FsUser,
} from './types';

export interface SyntheticOptions {
  seed?: number;
  /** Tamaño aproximado de cada foto (las de BowlingX pesan ~100–500 kB). En las pruebas, pocos bytes. */
  photoBytes?: number;
  /** Parámetros del hash. Por defecto los de un proyecto de Firebase (mem_cost 14): ~50 ms por cuenta. */
  hash?: Partial<FirebaseHashConfig>;
  /** Hora de la exportación. */
  exportedAt?: string;
}

export interface SyntheticExport {
  backup: FsBackup;
  auth: FirebaseAuthExport;
  hash: FirebaseHashConfig;
  /** hash.txt tal como se copia de la consola de Firebase. */
  hashText: string;
  /** Archivos de las fotos: ruta relativa (la de `file` en bowlingx.json) → bytes. */
  files: Map<string, Uint8Array>;
  /** Contraseña de cada cuenta con contraseña (uid → contraseña), para probar que entra. */
  passwords: Record<string, string>;
}

// ---------- Azar con semilla ----------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// ---------- Juegos tiro por tiro ----------

/** Total de un juego con sus tiros (como scoreGame de BowlingX). */
export function scoreRolls(rolls: number[]): number {
  let total = 0;
  let i = 0;
  for (let frame = 0; frame < 10 && i < rolls.length; frame++) {
    if (rolls[i] === 10) {
      total += 10 + (rolls[i + 1] ?? 0) + (rolls[i + 2] ?? 0);
      i += 1;
    } else if ((rolls[i] ?? 0) + (rolls[i + 1] ?? 0) === 10) {
      total += 10 + (rolls[i + 2] ?? 0);
      i += 2;
    } else {
      total += (rolls[i] ?? 0) + (rolls[i + 1] ?? 0);
      i += 2;
    }
  }
  return total;
}

// ---------- Personas ----------

type Login = 'password' | 'google' | 'both';

interface Person {
  key: string;
  name: string;
  email: string;
  login: Login;
  verified: boolean;
  /** Nivel: promedio alrededor del cual juega. */
  skill: number;
  superadmin?: boolean;
  disabled?: boolean;
  /** En Firebase Auth pero sin users/{uid} (se registró y no terminó). */
  noProfile?: boolean;
}

// Nombres inventados. Correos en dominios de ejemplo.
const PEOPLE: Person[] = [
  { key: 'randy', name: 'Randy Grullón', email: 'randy@ejemplo.do', login: 'password', verified: true, skill: 186, superadmin: true },
  { key: 'carolina', name: 'Carolina Méndez', email: 'carolina.mendez@gmail.com', login: 'google', verified: true, skill: 172 },
  { key: 'jose', name: 'José Almonte', email: 'jalmonte@ejemplo.do', login: 'password', verified: false, skill: 178 },
  { key: 'luis', name: 'Luis Peña', email: 'luispena@ejemplo.do', login: 'password', verified: false, skill: 165 },
  { key: 'sofia', name: 'Sofía Marte', email: 'sofia.marte@gmail.com', login: 'both', verified: true, skill: 158 },
  { key: 'pedro', name: 'Pedro Castillo', email: 'pcastillo@ejemplo.do', login: 'password', verified: false, skill: 192 },
  { key: 'ana', name: 'Ana Rosario', email: 'ana.rosario@ejemplo.do', login: 'password', verified: false, skill: 149 },
  { key: 'manuel', name: 'Manuel de la Cruz', email: 'manueldlc@gmail.com', login: 'google', verified: true, skill: 181 },
  { key: 'yokasta', name: 'Yokasta Núñez', email: 'yokasta.n@ejemplo.do', login: 'password', verified: false, skill: 139 },
  { key: 'ramon', name: 'Ramón Batista', email: 'rbatista@ejemplo.do', login: 'password', verified: false, skill: 170 },
  { key: 'elena', name: 'Elena Guzmán', email: 'elena.guzman@ejemplo.do', login: 'password', verified: true, skill: 162 },
  { key: 'frank', name: 'Frank Polanco', email: 'fpolanco@gmail.com', login: 'google', verified: true, skill: 199 },
  { key: 'wendy', name: 'Wendy Jiménez', email: 'wendyj@ejemplo.do', login: 'password', verified: false, skill: 144 },
  { key: 'hector', name: 'Héctor Reyes', email: 'hreyes@ejemplo.do', login: 'password', verified: false, skill: 175 },
  { key: 'maria', name: 'María Fernanda Ortiz', email: 'mf.ortiz@ejemplo.do', login: 'password', verified: false, skill: 155 },
  { key: 'juan', name: 'Juan Carlos Abreu', email: 'jcabreu@ejemplo.do', login: 'password', verified: false, skill: 168 },
  { key: 'rosa', name: 'Rosa Valdez', email: 'rosa.valdez@gmail.com', login: 'google', verified: true, skill: 151 },
  // Miembro sin jugador (de antes de «cada cuenta juega con su propia cuenta») y una deshabilitada en Firebase.
  { key: 'nelson', name: 'Nelson Taveras', email: 'ntaveras@ejemplo.do', login: 'password', verified: false, skill: 0 },
  { key: 'bloqueado', name: 'Cuenta Bloqueada', email: 'bloqueado@ejemplo.do', login: 'password', verified: false, skill: 0, disabled: true },
  // Del Open del Este.
  { key: 'miguel', name: 'Miguel Tavárez', email: 'miguel.tavarez@ejemplo.do', login: 'password', verified: false, skill: 183 },
  { key: 'analucia', name: 'Ana Lucía Pimentel', email: 'analucia.p@gmail.com', login: 'google', verified: true, skill: 160 },
  { key: 'kelvin', name: 'Kelvin Santos', email: 'kelvin.santos@ejemplo.do', login: 'password', verified: false, skill: 187 },
  { key: 'grisel', name: 'Grisel Féliz', email: 'grisel.feliz@ejemplo.do', login: 'password', verified: false, skill: 146 },
  // Superadmin fijo de BowlingX (no pasa como superadmin), una sin perfil y una que ya no está en ninguna liga.
  { key: 'admin', name: 'Admin', email: 'admin@admin.com', login: 'password', verified: false, skill: 0 },
  { key: 'sinperfil', name: 'Registro Incompleto', email: 'registro.incompleto@ejemplo.do', login: 'password', verified: false, skill: 0, noProfile: true },
  { key: 'exmiembro', name: 'Antonio Ex Miembro', email: 'antonio.ex@ejemplo.do', login: 'password', verified: false, skill: 0 },
];

/** Jugadores sin cuenta (los anota el admin). */
const NO_ACCOUNT_L1 = [
  { key: 'don_rafa', name: 'Don Rafael Soto', skill: 171 },
  { key: 'chichi', name: 'Chichí Morales', skill: 133 },
  { key: 'tony', name: 'Tony Encarnación', skill: 188 },
  { key: 'lisa', name: 'Lisa Hernández', skill: 152 },
  { key: 'bebo', name: 'Bebo Cabral', skill: 164 },
];
const NO_ACCOUNT_L2 = [
  { key: 'invitado1', name: 'Invitado Club Naco', skill: 176 },
  { key: 'invitado2', name: 'Invitada Club Arroyo Hondo', skill: 158 },
];

const COMMENTS = ['¡Qué serie!', 'Tremenda noche 🎳', 'Ese último juego estuvo durísimo', 'Felicidades, campeón', 'Vas subiendo el promedio', 'La próxima te gano', 'Buenísimo ese strike final', '¡Wepa!', 'Bien jugado', 'Así se hace'];
const SUGGESTIONS = ['Cambiar la práctica a las 8:00 pm', 'Hacer un torneo por parejas', 'Que el ranking salga también por mes', 'Poner música en la bolera', 'Más torneos con handicap'];
const NOTES = ['La foto no se ve bien', 'Esos juegos no son de esta práctica', 'Falta la foto del marcador', 'Los pinos no coinciden con la foto'];

// ---------- Generador ----------

export function makeSyntheticExport(opts: SyntheticOptions = {}): SyntheticExport {
  const rand = mulberry32(opts.seed ?? 20260928);
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
  const chance = (p: number) => rand() < p;
  const shuffle = <T>(list: readonly T[]) => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const autoId = (n = 20) => Array.from({ length: n }, () => ID_CHARS[Math.floor(rand() * ID_CHARS.length)]).join('');
  const bytes = (n: number) => Uint8Array.from({ length: n }, () => Math.floor(rand() * 256));
  const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
  const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00.000-04:00`).toISOString();
  const addDays = (date: string, n: number) => {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const exportedAt = opts.exportedAt ?? '2026-09-27T22:00:00.000Z';

  const hash: FirebaseHashConfig = {
    signerKey: opts.hash?.signerKey ?? b64(bytes(64)),
    saltSeparator: opts.hash?.saltSeparator ?? 'Bw==',
    rounds: opts.hash?.rounds ?? 8,
    memCost: opts.hash?.memCost ?? 14,
  };
  const hashText = `hash_config {\n  algorithm: SCRYPT,\n  base64_signer_key: ${hash.signerKey},\n  base64_salt_separator: ${hash.saltSeparator},\n  rounds: ${hash.rounds},\n  mem_cost: ${hash.memCost},\n}\n`;

  // ---- Cuentas ----
  const uid = new Map<string, string>(PEOPLE.map((p) => [p.key, autoId(28)]));
  const person = new Map(PEOPLE.map((p) => [p.key, p]));
  const passwords: Record<string, string> = {};
  const authUsers: FirebaseAuthUser[] = [];
  const fsUsers: FsUser[] = [];
  PEOPLE.forEach((p, i) => {
    const id = uid.get(p.key)!;
    const created = at(addDays('2025-09-01', i * 3), '20:15');
    const providers: FirebaseAuthUser['providerUserInfo'] = [];
    const u: FirebaseAuthUser = {
      localId: id,
      email: p.email,
      emailVerified: p.verified,
      displayName: p.login === 'password' ? undefined : p.name,
      createdAt: String(Date.parse(created)),
      lastSignedInAt: String(Date.parse(exportedAt) - int(1, 60) * 86400000),
      providerUserInfo: providers,
    };
    if (p.login !== 'google') {
      const password = `Bolos-${p.key}-${int(1000, 9999)}`;
      const salt = b64(bytes(16));
      passwords[id] = password;
      u.passwordHash = firebaseHash(password, salt, hash);
      u.salt = salt;
      providers.push({ providerId: 'password', rawId: p.email, email: p.email });
    }
    if (p.login !== 'password') providers.push({ providerId: 'google.com', rawId: String(100000000000000000000 + i * 7919), email: p.email, displayName: p.name });
    if (p.disabled) u.disabled = true;
    authUsers.push(u);
    if (!p.noProfile) fsUsers.push({ id, email: p.email, name: p.name, ...(p.superadmin || p.key === 'admin' ? { superadmin: true } : {}), createdAt: created });
  });

  const files = new Map<string, Uint8Array>();
  const photoBytes = opts.photoBytes ?? 120_000;

  // ---- Una liga ----
  interface LeaguePlayer {
    id: string;
    name: string;
    skill: number;
    uid: string | null;
  }
  function makeLeague(input: {
    id: string;
    league: Omit<FsLeague, 'id'>;
    inviteCode: string;
    members: { key: string; role: 'owner' | 'admin' | 'member'; scorer?: boolean; withPlayer: boolean; joined: string }[];
    extraPlayers: { key: string; name: string; skill: number }[];
  }) {
    const lid = input.id;
    const l: FsLeague = { id: lid, ...input.league, inviteCode: input.inviteCode };
    const players: LeaguePlayer[] = [];
    const fsPlayers: FsPlayer[] = [];
    const members: FsMember[] = [];
    for (const m of input.members) {
      const p = person.get(m.key)!;
      const u = uid.get(m.key)!;
      let playerId: string | null = null;
      if (m.withPlayer) {
        playerId = autoId();
        players.push({ id: playerId, name: p.name, skill: p.skill, uid: u });
        fsPlayers.push({ id: playerId, name: p.name, averageOverride: null, uid: u, createdAt: at(m.joined, '20:31') });
      }
      members.push({
        id: `${lid}_${u}`,
        leagueId: lid,
        uid: u,
        name: p.name,
        role: m.role,
        playerId,
        ...(m.scorer ? { scorer: true } : {}),
        joinedAt: at(m.joined, '20:30'),
        ...(m.role === 'member' && input.league.visibility === 'private' ? { code: input.inviteCode } : {}),
      } as FsMember);
    }
    for (const x of input.extraPlayers) {
      const id = autoId();
      players.push({ id, name: x.name, skill: x.skill, uid: null });
      fsPlayers.push({ id, name: x.name, averageOverride: null, createdAt: at(String(input.league.createdAt).slice(0, 10), '21:00') });
    }
    l.members = members;
    l.players = fsPlayers;
    l.events = [];
    l.entries = [];
    l.photos = [];
    l.submissions = [];
    l.reactions = [];
    l.comments = [];
    l.suggestions = [];
    return { l, players };
  }

  function newPhoto(l: FsLeague, eventId: string | null, when: string, deleted = false): string {
    const id = autoId();
    if (deleted) return id; // Ya borrada en BowlingX: el juego sigue verificado con su id.
    const n = Math.max(24, Math.round(photoBytes * (0.7 + rand() * 0.6)));
    const data = new Uint8Array(n);
    data.set(bytes(n));
    data.set([0xff, 0xd8, 0xff, 0xe0], 0);
    data.set([0xff, 0xd9], n - 2);
    const file = `fotos/${l.id}/${id}.jpg`;
    files.set(file, data);
    const ph: FsPhoto = { id, width: 1200, height: 900, eventId, createdAt: when, file, bytes: n, contentType: 'image/jpeg' };
    l.photos!.push(ph);
    return id;
  }

  /** Un juego anotado tiro por tiro: el total sale de los tiros. */
  function framesGame(skill: number): { score: number; frames: FsGameFrames } {
    const strike = Math.min(0.75, Math.max(0.1, (skill - 120) / 150));
    const rolls: number[] = [];
    for (let f = 0; f < 10; f++) {
      const first = chance(strike) ? 10 : int(5, 9);
      rolls.push(first);
      if (first < 10) rolls.push(chance(0.55) ? 10 - first : int(0, 9 - first));
      if (f === 9) {
        if (first === 10) {
          const a = chance(strike) ? 10 : int(5, 9);
          rolls.push(a, a === 10 ? (chance(strike) ? 10 : int(5, 9)) : int(0, 10 - a));
        } else if (rolls.at(-1)! + first === 10) rolls.push(chance(strike) ? 10 : int(5, 9));
      }
    }
    return { score: scoreRolls(rolls), frames: { rolls } };
  }

  /** Un juego: pinos y, a veces (12 %), sus tiros. */
  function game(skill: number): { score: number; frames?: FsGameFrames } {
    if (chance(0.12)) return framesGame(skill);
    return { score: Math.max(70, Math.min(279, Math.round(skill + (rand() + rand() + rand() - 1.5) * 45))) };
  }

  /** Participación con el id de siempre (evento_jugador). */
  function newEntry(l: FsLeague, e: FsEvent, p: LeaguePlayer, fields: Partial<FsEntry>): FsEntry {
    const x: FsEntry = {
      id: `${e.id}_${p.id}`,
      eventId: e.id,
      playerId: p.id,
      teamId: null,
      average: Math.round(p.skill + int(-6, 6)),
      handicapOverride: null,
      scores: Array.from({ length: e.games ?? 3 }, () => null),
      photos: Array.from({ length: e.games ?? 3 }, () => null),
      createdAt: at(String(e.date), '19:05'),
      ...fields,
    };
    l.entries!.push(x);
    return x;
  }

  function newEvent(l: FsLeague, fields: FsEvent): FsEvent {
    const e: FsEvent = { teams: {}, playerCount: 0, ...fields };
    l.events!.push(e);
    return e;
  }

  /** Equipos como applyTeams: `order` = Date.now() + i. */
  function makeTeams(e: FsEvent, names: string[], created: string) {
    const base = Date.parse(created);
    const teams: Record<string, { name: string; order: number }> = {};
    names.forEach((n, i) => (teams[autoId()] = { name: n, order: base + i }));
    e.teams = teams;
    return Object.keys(teams);
  }

  /** Un torneo con equipos (si hay) y handicap. */
  function tournament(l: FsLeague, players: LeaguePlayer[], e: FsEvent, teamNames: string[], perTeam: number, verify: (x: FsEntry, gi: number) => string | null) {
    const going = shuffle(players).slice(0, teamNames.length ? teamNames.length * perTeam : players.length);
    const teamIds = teamNames.length ? makeTeams(e, teamNames, String(e.createdAt)) : [];
    going.forEach((p, i) => {
      const x = newEntry(l, e, p, { teamId: teamIds.length ? teamIds[Math.floor(i / perTeam)] : null });
      if (chance(0.1)) x.handicapOverride = int(0, 40);
      const frames: Record<string, FsGameFrames> = {};
      for (let g = 0; g < (e.games ?? 3); g++) {
        const r = game(p.skill);
        x.scores![g] = r.score;
        x.photos![g] = verify(x, g);
        if (r.frames) frames[String(g)] = r.frames;
      }
      if (Object.keys(frames).length) x.frames = frames;
    });
    e.playerCount = going.length;
  }

  // ======================= Liga Dominicana de Boliche =======================
  const L1 = makeLeague({
    id: autoId(),
    league: {
      name: 'Liga Dominicana de Boliche',
      kind: 'liga',
      visibility: 'private',
      ownerUid: uid.get('randy')!,
      venue: 'Bolera Sambil',
      schedule: 'Martes 7:30 pm',
      seasonStart: '2026-01-06',
      seasonEnd: '2026-12-15',
      contactName: 'Randy',
      contactPhone: '18095551234',
      requirePhoto: true,
      createdAt: at('2025-09-20', '21:10'),
    },
    inviteCode: 'RD7KX4MP',
    members: [
      { key: 'randy', role: 'owner', withPlayer: true, joined: '2025-09-20' },
      { key: 'carolina', role: 'admin', withPlayer: true, joined: '2025-09-21' },
      { key: 'jose', role: 'admin', withPlayer: true, joined: '2025-09-21' },
      ...['luis', 'sofia', 'pedro', 'ana', 'manuel', 'yokasta', 'ramon', 'elena', 'frank', 'wendy', 'hector', 'maria', 'juan', 'rosa'].map((key, i) => ({
        key,
        role: 'member' as const,
        withPlayer: true,
        joined: addDays('2025-09-22', i * 5),
      })),
      { key: 'nelson', role: 'member', withPlayer: false, joined: '2025-11-02' },
      { key: 'bloqueado', role: 'member', withPlayer: false, joined: '2025-11-10' },
    ],
    extraPlayers: NO_ACCOUNT_L1,
  });
  const l1 = L1.l;
  // Dos promedios fijados a mano.
  l1.players!.find((p) => p.name === 'Don Rafael Soto')!.averageOverride = 171;
  l1.players!.find((p) => p.name === 'Chichí Morales')!.averageOverride = 135;

  // Temporada 2025: prácticas los martes, juegos importados del Excel.
  for (let d = '2025-10-07'; d <= '2025-12-16'; d = addDays(d, 7)) {
    const e = newEvent(l1, { id: autoId(), type: 'practica', name: '', date: d, games: 3, hcpBase: 0, hcpPercent: 0, createdAt: at(addDays(d, -6), '09:00') });
    const going = shuffle(L1.players).slice(0, int(7, 12));
    for (const p of going) {
      const x = newEntry(l1, e, p, {});
      x.scores = x.scores!.map(() => game(p.skill).score);
      x.photos = x.photos!.map(() => 'importado');
    }
    e.playerCount = going.length;
  }
  const navidad = newEvent(l1, {
    id: autoId(),
    type: 'torneo',
    name: 'Torneo de Navidad 2025',
    date: '2025-12-20',
    games: 3,
    hcpBase: 220,
    hcpPercent: 80,
    individualRankBy: 'hcp',
    teamRankBy: 'scratch',
    teamSize: 3,
    announcement: 'Sábado 20 a las 6:00 pm. Traigan algo para compartir.',
    createdAt: at('2025-12-01', '10:00'),
  });
  tournament(l1, L1.players, navidad, ['Los Pinos', 'Strike Force', 'Los Spares', 'La Chancleta'], 3, () => 'importado');

  // Temporada 2026: prácticas verificadas con foto (las de enero y febrero ya borradas en BowlingX).
  const members1 = l1.members!.filter((m) => m.playerId);
  const nameOf = (u: string) => person.get([...uid.entries()].find(([, v]) => v === u)![0])!.name;
  const practices: FsEvent[] = [];
  for (let d = '2026-01-06'; d <= '2026-09-22'; d = addDays(d, 7)) {
    const games = chance(0.2) ? int(4, 5) : 3;
    const e = newEvent(l1, { id: autoId(), type: 'practica', name: '', date: d, games, hcpBase: 0, hcpPercent: 0, createdAt: at(addDays(d, -6), '09:00') });
    practices.push(e);
    const deleted = d < '2026-03-01';
    const going = shuffle(L1.players).slice(0, int(6, 12));
    // El admin verifica con 1 o 2 fotos del marcador por noche.
    const photoA = newPhoto(l1, e.id, at(d, '21:40'), deleted);
    const photoB = newPhoto(l1, e.id, at(d, '21:42'), deleted);
    going.forEach((p, i) => {
      const x = newEntry(l1, e, p, {});
      const frames: Record<string, FsGameFrames> = {};
      for (let g = 0; g < games; g++) {
        const r = game(p.skill);
        x.scores![g] = r.score;
        x.photos![g] = i % 2 ? photoB : photoA;
        if (r.frames) frames[String(g)] = r.frames;
      }
      if (Object.keys(frames).length) x.frames = frames;
      // Un borrador: el último juego anotado pero sin verificar (no cuenta).
      if (chance(0.06)) x.photos![games - 1] = null;
      // Se fue temprano: el último juego vacío.
      if (chance(0.05)) {
        x.scores![games - 1] = null;
        x.photos![games - 1] = null;
        delete frames[String(games - 1)];
      }
      if (x.frames && !Object.keys(x.frames).length) delete x.frames;
    });
    e.playerCount = going.length;
    // «Voy» en las últimas semanas.
    if (d >= '2026-08-01') e.rsvp = Object.fromEntries(shuffle(L1.players).slice(0, int(4, 9)).map((p) => [p.id, true]));
  }

  // Torneos 2026.
  const aniversario = newEvent(l1, {
    id: autoId(),
    type: 'torneo',
    name: 'Torneo Aniversario',
    date: '2026-04-18',
    games: 3,
    hcpBase: 220,
    hcpPercent: 80,
    individualRankBy: 'hcp',
    teamRankBy: 'scratch',
    categoryCuts: [190, 170, 150],
    teamSize: 3,
    announcement: 'Inscripción hasta el jueves. Premios para los 3 primeros de cada categoría.',
    createdAt: at('2026-04-01', '10:00'),
  });
  const photosAniv = [0, 1, 2].map((i) => newPhoto(l1, aniversario.id, at('2026-04-18', `22:0${i}`)));
  tournament(l1, L1.players, aniversario, ['Rojos', 'Azules', 'Verdes', 'Negros', 'Dorados', 'Blancos'], 3, (_x, g) => photosAniv[g]);
  const verano = newEvent(l1, {
    id: autoId(),
    type: 'torneo',
    name: 'Copa de Verano (parejas)',
    date: '2026-07-25',
    games: 4,
    hcpBase: 230,
    hcpPercent: 90,
    individualRankBy: 'scratch',
    teamRankBy: 'hcp',
    teamSize: 2,
    createdAt: at('2026-07-10', '10:00'),
  });
  const photoVerano = newPhoto(l1, verano.id, at('2026-07-25', '22:15'));
  tournament(l1, L1.players, verano, ['Pareja 1', 'Pareja 2', 'Pareja 3', 'Pareja 4', 'Pareja 5', 'Pareja 6', 'Pareja 7', 'Pareja 8'], 2, () => photoVerano);

  // La próxima práctica (después de la exportación): inscritos sin juegos y «voy».
  const next = newEvent(l1, { id: autoId(), type: 'practica', name: '', date: '2026-09-29', games: 3, hcpBase: 0, hcpPercent: 0, createdAt: at('2026-09-23', '09:00') });
  for (const p of L1.players.slice(0, 4)) newEntry(l1, next, p, {});
  next.playerCount = 4;
  next.rsvp = Object.fromEntries(L1.players.slice(0, 7).map((p) => [p.id, true]));

  // Envíos de los jugadores (con cuenta), aprobados, rechazados y pendientes.
  const withAccount = L1.players.filter((p) => p.uid);
  const admins = [uid.get('randy')!, uid.get('carolina')!, uid.get('jose')!];
  const recent = practices.filter((e) => String(e.date) >= '2026-03-01');
  for (const e of recent) {
    for (const p of shuffle(withAccount).slice(0, int(0, 3))) {
      const games = e.games ?? 3;
      const withPhoto = chance(0.7);
      const status = String(e.date) >= '2026-09-15' ? 'pendiente' : chance(0.8) ? 'aprobado' : 'rechazado';
      const photoId = withPhoto ? newPhoto(l1, e.id, at(String(e.date), '22:30')) : null;
      const scores = Array.from({ length: games }, () => game(p.skill).score) as (number | null)[];
      const sub: FsSubmission = {
        id: autoId(),
        playerId: p.id,
        eventId: e.id,
        date: null,
        scores,
        scanned: withPhoto ? scores.map((s) => (s != null && chance(0.9) ? s : s != null ? s + 1 : null)) : null,
        ...(withPhoto && chance(0.5) ? { scannedName: p.name.split(' ')[0].toUpperCase().slice(0, 12) } : {}),
        frames: null,
        photoId,
        status,
        note: status === 'rechazado' ? pick(NOTES) : null,
        createdAt: at(String(e.date), '22:31'),
        ...(status !== 'pendiente' ? { reviewedAt: at(addDays(String(e.date), 1), '08:15'), reviewedBy: pick(admins) } : {}),
      };
      l1.submissions!.push(sub);
      if (status === 'aprobado') {
        // approveSubmission: los juegos pasan a la participación con la foto (o «sin-foto»).
        let x = l1.entries!.find((y) => y.eventId === e.id && y.playerId === p.id);
        if (!x) {
          x = newEntry(l1, e, p, {});
          e.playerCount = (e.playerCount ?? 0) + 1;
        }
        scores.forEach((s, g) => {
          x!.scores![g] = s;
          x!.photos![g] = photoId ?? 'sin-foto';
          if (x!.frames) delete x!.frames[String(g)];
        });
        if (x.frames && !Object.keys(x.frames).length) delete x.frames;
      }
    }
  }
  // Por fecha (sin evento): un sábado de práctica libre, uno pendiente con foto y uno rechazado sin foto.
  const luis = L1.players.find((p) => p.uid === uid.get('luis'))!;
  const ana = L1.players.find((p) => p.uid === uid.get('ana'))!;
  const byFrames = framesGame(luis.skill);
  l1.submissions!.push(
    {
      id: autoId(),
      playerId: luis.id,
      eventId: null,
      date: '2026-09-19',
      scores: [byFrames.score, null, 199],
      scanned: [byFrames.score, null, 199],
      scannedName: 'LUIS',
      frames: { '0': byFrames.frames },
      photoId: newPhoto(l1, null, at('2026-09-19', '17:20')),
      status: 'pendiente',
      note: null,
      createdAt: at('2026-09-19', '17:21'),
    },
    {
      id: autoId(),
      playerId: ana.id,
      eventId: null,
      date: '2026-05-09',
      scores: [140, 151],
      scanned: null,
      photoId: null,
      status: 'rechazado',
      note: 'Sin foto no se puede aprobar',
      createdAt: at('2026-05-09', '18:00'),
      reviewedAt: at('2026-05-10', '09:00'),
      reviewedBy: uid.get('jose')!,
    },
  );

  // Reacciones y comentarios en los juegos de los últimos meses.
  function social(l: FsLeague, memberUids: string[], since: string) {
    const events = new Map((l.events ?? []).map((e) => [e.id, e]));
    const played = (l.entries ?? []).filter((x) => String(events.get(x.eventId)?.date) >= since && x.scores?.some((s) => s != null));
    for (const x of played) {
      for (const u of shuffle(memberUids).slice(0, int(0, 3))) {
        const r: FsReaction = { id: `${x.id}_${u}`, entryId: x.id, eventId: x.eventId, playerId: x.playerId, uid: u, name: nameOf(u), type: chance(0.7) ? 'like' : 'felicitar', createdAt: at(addDays(String(events.get(x.eventId)!.date), 1), '07:30') };
        l.reactions!.push(r);
      }
      if (chance(0.12)) {
        const u = pick(memberUids);
        const c: FsComment = { id: autoId(), entryId: x.id, eventId: x.eventId, playerId: x.playerId, uid: u, name: nameOf(u), text: pick(COMMENTS), createdAt: at(addDays(String(events.get(x.eventId)!.date), 1), '08:00') };
        l.comments!.push(c);
      }
    }
  }
  social(l1, members1.map((m) => m.uid), '2026-06-01');
  l1.suggestions = SUGGESTIONS.map((text, i): FsSuggestion => ({ id: autoId(), text, read: i < 3, createdAt: at(addDays('2026-02-10', i * 30), '12:00') }));

  // ======================= Open del Este 2026 (torneo sin liga) =======================
  const L2 = makeLeague({
    id: autoId(),
    league: {
      name: 'Open del Este 2026',
      kind: 'torneo',
      visibility: 'public',
      ownerUid: uid.get('miguel')!,
      venue: 'Bolera del Este',
      schedule: 'Domingos 4:00 pm',
      seasonStart: '',
      seasonEnd: '',
      contactName: 'Miguel',
      contactPhone: '18295550123',
      requirePhoto: false,
      createdAt: at('2026-05-20', '19:00'),
    },
    inviteCode: 'PX9HQ3TW',
    members: [
      { key: 'miguel', role: 'owner', withPlayer: true, joined: '2026-05-20' },
      { key: 'analucia', role: 'member', scorer: true, withPlayer: true, joined: '2026-05-21' },
      { key: 'jose', role: 'member', scorer: true, withPlayer: true, joined: '2026-05-22' },
      { key: 'kelvin', role: 'admin', withPlayer: true, joined: '2026-05-22' },
      { key: 'grisel', role: 'member', withPlayer: true, joined: '2026-05-23' },
      { key: 'pedro', role: 'member', withPlayer: true, joined: '2026-05-24' },
      { key: 'frank', role: 'member', withPlayer: true, joined: '2026-05-24' },
      { key: 'luis', role: 'member', withPlayer: true, joined: '2026-05-25' },
    ],
    extraPlayers: NO_ACCOUNT_L2,
  });
  const l2 = L2.l;
  const clasif = newEvent(l2, {
    id: autoId(),
    type: 'torneo',
    name: 'Clasificatoria',
    date: '2026-06-14',
    games: 3,
    hcpBase: 220,
    hcpPercent: 80,
    individualRankBy: 'hcp',
    teamRankBy: 'scratch',
    teamSize: 2,
    announcement: 'Los 6 primeros pasan a la final.',
    createdAt: at('2026-05-25', '10:00'),
  });
  tournament(l2, L2.players, clasif, ['Naco', 'Arroyo Hondo', 'Piantini', 'Bella Vista', 'Gazcue'], 2, () => 'sin-foto');
  clasif.rsvp = Object.fromEntries(L2.players.slice(0, 8).map((p) => [p.id, true]));
  const final = newEvent(l2, {
    id: autoId(),
    type: 'torneo',
    name: 'Gran Final',
    date: '2026-06-21',
    games: 4,
    hcpBase: 230,
    hcpPercent: 90,
    individualRankBy: 'hcp',
    categoryCuts: [195, 175, 160],
    createdAt: at('2026-06-15', '10:00'),
  });
  tournament(l2, shuffle(L2.players).slice(0, 6), final, [], 0, () => 'sin-foto');
  social(l2, l2.members!.map((m) => m.uid), '2026-06-01');
  l2.suggestions = [{ id: autoId(), text: 'Que el Open se repita en diciembre', read: false, createdAt: at('2026-06-22', '09:00') }];

  const backup: FsBackup = {
    app: 'BowlingX',
    exportedAt,
    leagues: [l1, l2],
    users: fsUsers,
    invites: [
      { id: 'RD7KX4MP', leagueId: l1.id },
      { id: 'PX9HQ3TW', leagueId: l2.id },
    ],
  };
  return { backup, auth: { users: authUsers }, hash, hashText, files, passwords };
}

/** Cuántas cosas trae (para el mensaje del comando y las pruebas). */
export function syntheticSummary(exp: SyntheticExport) {
  const ls = exp.backup.leagues;
  const sum = (f: (l: FsLeague) => number) => ls.reduce((a, l) => a + f(l), 0);
  return {
    leagues: ls.length,
    accounts: exp.auth.users.length,
    players: sum((l) => l.players?.length ?? 0),
    events: sum((l) => l.events?.length ?? 0),
    entries: sum((l) => l.entries?.length ?? 0),
    games: sum((l) => (l.entries ?? []).reduce((a, x) => a + (x.scores ?? []).filter((s) => s != null).length, 0)),
    photos: sum((l) => l.photos?.length ?? 0),
    submissions: sum((l) => l.submissions?.length ?? 0),
    reactions: sum((l) => l.reactions?.length ?? 0),
    comments: sum((l) => l.comments?.length ?? 0),
    suggestions: sum((l) => l.suggestions?.length ?? 0),
  };
}
