/**
 * Respaldo de BowlingX de prueba, con lo que trae uno de verdad (y lo que sale mal en uno de verdad):
 *
 * - L1 «Liga del Banco» (privada, exige foto, código ABCD2345): dueño org, admin sofi, luis con jugador, ana sin
 *   jugador, y una cuenta borrada (ghost). Práctica e1 con «voy» y fotos, torneo e2 con equipos y handicap,
 *   práctica e3 del año anterior, envíos (pendiente con foto, aprobado, rechazado por fecha), reacciones,
 *   comentarios y sugerencias.
 * - L2 «Copa Abierta…» (torneo sin liga, pública, sin foto): dueña ana, gabriel (Google) anotador, luis y un
 *   miembro sin verificar; torneo t1 con dos equipos.
 * - Cuentas en `firebase auth:export`: con contraseña, Google, sin verificar, deshabilitada, sin correo,
 *   admin@admin.com y un superadmin de verdad.
 *
 * Con `dirty` (por defecto) lleva los errores que el transformador tiene que corregir o reportar: teléfono con
 * guiones, nombres largos o vacíos, pinos 301, participación de un jugador borrado, evento con fecha mala,
 * reacción repetida, comentario vacío, jugador reclamado por dos lados. Sin `dirty` todo está limpio y la
 * paridad tiene que salir idéntica.
 */
import { firebaseHash, type FirebaseHashConfig } from './hash';
import type { FirebaseAuthExport, FsBackup, FsEntry, FsLeague } from './types';

/** Parámetros del hash de prueba (mem_cost bajo para que las pruebas vayan rápido). */
export const HASH_CONFIG: FirebaseHashConfig = {
  signerKey: 'jxspr8Ki0RYycVU8zykbdLGjFQ3McFUH0uiiTvC8pVMXAn210wjLNmdZJzxUECKbm0QsEmYUSDzZvpjeJ9WmXA==',
  saltSeparator: 'Bw==',
  rounds: 8,
  memCost: 10,
};

/** Lo que se copia de la consola de Firebase (mismo contenido que HASH_CONFIG). */
export const HASH_CONSOLE_TEXT = `hash_config {
  algorithm: SCRYPT,
  base64_signer_key: ${HASH_CONFIG.signerKey},
  base64_salt_separator: ${HASH_CONFIG.saltSeparator},
  rounds: ${HASH_CONFIG.rounds},
  mem_cost: ${HASH_CONFIG.memCost},
}`;

/** Contraseña de prueba de cada cuenta. */
export const passwordOf = (uid: string) => `clave-${uid}`;

/** Bytes de una «foto» (un JPEG no tiene que ser válido para Storage local). */
export const PHOTO_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const photo = (seed: number) => `data:image/jpeg;base64,${Buffer.from([...PHOTO_BYTES, seed]).toString('base64')}`;

const t = (iso: string) => `${iso}T12:00:00.000Z`;

/** Una participación con el id de siempre (evento_jugador). */
const entry = (eventId: string, playerId: string, fields: Partial<FsEntry>): FsEntry => ({
  id: `${eventId}_${playerId}`,
  eventId,
  playerId,
  teamId: null,
  average: 0,
  handicapOverride: null,
  scores: [],
  photos: [],
  ...fields,
});

const LONG = 'Nombre larguísimo de un jugador que no cabe en sesenta letras de ninguna forma';

export function makeBackup(opts: { dirty?: boolean } = {}): FsBackup {
  const dirty = opts.dirty !== false;
  const L1: FsLeague = {
    id: 'L1banco',
    name: 'Liga del Banco',
    visibility: 'private',
    ownerUid: 'uOrg',
    venue: 'Bolera Mundial',
    schedule: 'Martes 7:00 pm',
    seasonStart: '2026-01-01',
    seasonEnd: '',
    contactName: 'Orlando',
    contactPhone: dirty ? '809-555-1234' : '8095551234',
    requirePhoto: true,
    createdAt: t('2025-10-01'),
    inviteCode: 'ABCD2345',
    members: [
      { id: 'L1banco_uOrg', leagueId: 'L1banco', uid: 'uOrg', name: 'Orlando Díaz', role: 'owner', playerId: 'pOrg', joinedAt: t('2025-10-01') },
      { id: 'L1banco_uSofi', leagueId: 'L1banco', uid: 'uSofi', name: 'Sofía', role: 'admin', playerId: 'pSofi', joinedAt: t('2025-10-02') },
      { id: 'L1banco_uLuis', leagueId: 'L1banco', uid: 'uLuis', name: 'Luis', role: 'member', playerId: 'pLuis', joinedAt: t('2025-10-03') },
      { id: 'L1banco_uAna', leagueId: 'L1banco', uid: 'uAna', name: 'Ana', role: 'member', playerId: null, joinedAt: t('2025-10-04') },
      ...(dirty ? [{ id: 'L1banco_uGhost', leagueId: 'L1banco', uid: 'uGhost', name: 'Fantasma', role: 'member', playerId: null, joinedAt: t('2025-10-05') }] : []),
    ],
    players: [
      { id: 'pOrg', name: 'Orlando Díaz', averageOverride: null, uid: 'uOrg', createdAt: t('2025-10-01') },
      { id: 'pSofi', name: 'Sofía Marte', averageOverride: null, uid: 'uSofi', createdAt: t('2025-10-02') },
      { id: 'pLuis', name: 'Luis Peña', averageOverride: null, uid: 'uLuis', createdAt: t('2025-10-03') },
      { id: 'pPedro', name: 'Pedro', averageOverride: 175, uid: null, createdAt: t('2025-10-04') },
      { id: 'pLong', name: dirty ? LONG : 'Juan', averageOverride: null, createdAt: t('2025-10-05') },
      ...(dirty ? [{ id: 'pDup', name: 'Luis viejo', averageOverride: null, uid: 'uLuis', createdAt: t('2025-10-06') }] : []),
    ],
    events: [
      { id: 'e1', type: 'practica', name: '', date: '2026-03-10', games: 3, hcpBase: 0, hcpPercent: 0, teams: {}, playerCount: 3, rsvp: { pLuis: true, pPedro: true, pSofi: false, ...(dirty ? { pGone: true } : {}) }, createdAt: t('2026-03-01') },
      {
        id: 'e2',
        type: 'torneo',
        name: 'Torneo Aniversario',
        date: '2026-04-05',
        games: 3,
        hcpBase: 230,
        hcpPercent: 80,
        individualRankBy: 'hcp',
        teamRankBy: 'scratch',
        categoryCuts: [200, 175, 160],
        teamSize: 2,
        announcement: 'Traigan su bola',
        // Como los guarda BowlingX: `order` = Date.now() (addTeam) o Date.now() + i (applyTeams).
        teams: { eq1: { name: 'Rojos', order: 1774000000000 }, eq2: { name: 'Azules', order: 1774000000001 } },
        playerCount: 5,
        createdAt: t('2026-03-20'),
      },
      { id: 'e3', type: 'practica', name: '', date: '2025-11-20', games: 3, hcpBase: 0, hcpPercent: 0, teams: {}, playerCount: 2, createdAt: t('2025-11-19') },
      ...(dirty ? [{ id: 'eBad', type: 'practica', name: '', date: '2026-13-40', games: 3, hcpBase: 0, hcpPercent: 0, teams: {}, playerCount: 0 }] : []),
    ],
    photos: [
      { id: 'ph1', data: photo(1), width: 1200, height: 900, eventId: 'e1', createdAt: t('2026-03-10') },
      { id: 'ph2', data: photo(2), width: 1200, height: 900, eventId: 'e1', createdAt: t('2026-03-11') },
      { id: 'phOld', data: photo(3), width: 800, height: 600, eventId: 'e3', createdAt: t('2025-01-05') },
    ],
    entries: [
      entry('e1', 'pLuis', { average: 160, scores: [150, 180, null], photos: ['ph1', 'ph1', null], frames: { '0': { rolls: [7, 2, 10, 9, 1, 8, 1, 10, 7, 3, 6, 2, 9, 0, 10, 8, 1, 7, 2] } } }),
      entry('e1', 'pPedro', { average: 175, scores: [200, dirty ? 301 : 210, 190], photos: ['importado', 'importado', 'importado'] }),
      entry('e1', 'pOrg', { average: 180, scores: [170, 160, 150], photos: ['ph1', 'ph1', 'ph1'] }),
      ...(dirty ? [entry('e1', 'pGone', { average: 100, scores: [100], photos: ['importado'] })] : []),
      entry('e3', 'pLuis', { average: 150, scores: [160, 170, 180], photos: ['sin-foto', 'sin-foto', 'sin-foto'] }),
      entry('e3', 'pOrg', { average: 180, scores: [190, 200, 210], photos: ['phOld', 'phOld', 'phOld'] }),
      entry('e2', 'pOrg', { teamId: 'eq1', average: 180, scores: [200, 210, 190], photos: ['importado', 'importado', 'importado'] }),
      entry('e2', 'pSofi', { teamId: 'eq1', average: 150, handicapOverride: 70, scores: [160, 150, 170], photos: ['importado', 'importado', 'importado'] }),
      entry('e2', 'pLuis', { teamId: 'eq2', average: 165, scores: [175, 180, 160], photos: ['importado', 'importado', 'importado'] }),
      entry('e2', 'pPedro', { teamId: 'eq2', average: 175, scores: [180, 170, null], photos: ['importado', 'importado', null] }),
      entry('e2', 'pLong', { teamId: dirty ? 'eqX' : null, average: 130, scores: [120, 130, 140], photos: ['importado', 'importado', 'importado'] }),
    ],
    submissions: [
      { id: 's1', playerId: 'pLuis', eventId: 'e1', date: null, scores: [160, 170], scanned: [160, 171], scannedName: 'LUIS P', frames: null, photoId: 'ph2', status: 'pendiente', note: null, createdAt: t('2026-03-11') },
      { id: 's2', playerId: 'pLuis', eventId: 'e1', date: null, scores: [150, 180], scanned: null, photoId: null, status: 'aprobado', note: null, createdAt: t('2026-03-10'), reviewedAt: t('2026-03-10'), reviewedBy: 'uSofi' },
      { id: 's3', playerId: 'pPedro', eventId: null, date: '2026-03-12', scores: [300], scanned: null, photoId: null, status: 'rechazado', note: 'Foto borrosa', createdAt: t('2026-03-12'), reviewedAt: t('2026-03-13'), reviewedBy: 'uOrg' },
      { id: 's4', playerId: 'pLuis', eventId: null, date: '2025-01-05', scores: [140, 150, 160], scanned: null, photoId: 'phOld', status: 'pendiente', note: null, createdAt: t('2025-01-05') },
      ...(dirty ? [{ id: 's5', playerId: 'pGone', eventId: 'e1', scores: [100], scanned: null, photoId: null, status: 'pendiente', note: null }] : []),
    ],
    reactions: [
      { id: 'e1_pLuis_uSofi', entryId: 'e1_pLuis', eventId: 'e1', playerId: 'pLuis', uid: 'uSofi', name: 'Sofía', type: 'like', createdAt: t('2026-03-11') },
      { id: 'e1_pLuis_uOrg', entryId: 'e1_pLuis', eventId: 'e1', playerId: 'pLuis', uid: 'uOrg', name: 'Orlando Díaz', type: 'felicitar', createdAt: t('2026-03-11') },
      ...(dirty
        ? [
            { id: 'rViejo', entryId: 'e1_pLuis', eventId: 'e1', playerId: 'pLuis', uid: 'uSofi', name: 'Sofía', type: 'felicitar', createdAt: t('2026-03-10') },
            { id: 'e1_pLuis_uGhost', entryId: 'e1_pLuis', eventId: 'e1', playerId: 'pLuis', uid: 'uGhost', name: 'Fantasma', type: 'like', createdAt: t('2026-03-11') },
          ]
        : []),
    ],
    comments: [
      { id: 'c1', entryId: 'e2_pOrg', eventId: 'e2', playerId: 'pOrg', uid: 'uLuis', name: 'Luis', text: '¡Qué serie!', createdAt: t('2026-04-05') },
      { id: 'c2', entryId: 'e1_pLuis', eventId: 'e1', playerId: 'pLuis', uid: 'uOrg', name: 'Orlando Díaz', text: 'Buen juego', createdAt: t('2026-03-11') },
      ...(dirty ? [{ id: 'c3', entryId: 'e1_pLuis', eventId: 'e1', playerId: 'pLuis', uid: 'uOrg', name: 'Orlando Díaz', text: '   ', createdAt: t('2026-03-11') }] : []),
    ],
    suggestions: [
      { id: 'g1', text: 'Cambiar el horario a las 8', read: false, createdAt: t('2026-03-01') },
      { id: 'g2', text: 'Más torneos', read: true, createdAt: t('2026-02-01') },
    ],
  };

  const L2: FsLeague = {
    id: 'L2copa',
    name: dirty ? 'Copa Abierta de Verano del Club de Boliche de Santo Domingo Este 2026' : 'Copa Abierta de Verano',
    kind: 'torneo',
    visibility: 'public',
    ownerUid: 'uAna',
    venue: 'Bolera del Este',
    schedule: '',
    seasonStart: '',
    seasonEnd: '',
    contactName: 'Ana',
    contactPhone: dirty ? '+1 (809) 555-0000' : '+18095550000',
    requirePhoto: false,
    createdAt: t('2026-04-01'),
    members: [
      { id: 'L2copa_uAna', leagueId: 'L2copa', uid: 'uAna', name: 'Ana', role: 'owner', playerId: 'pAna', joinedAt: t('2026-04-01') },
      { id: 'L2copa_uGoo', leagueId: 'L2copa', uid: 'uGoo', name: 'Gabriel', role: 'member', playerId: 'pGoo', scorer: true, joinedAt: t('2026-04-02') },
      { id: 'L2copa_uNoVal', leagueId: 'L2copa', uid: 'uNoVal', name: 'Nuevo', role: 'member', playerId: null, joinedAt: t('2026-04-03') },
      { id: 'L2copa_uLuis', leagueId: 'L2copa', uid: 'uLuis', name: 'Luis', role: 'member', playerId: 'pLuis2', joinedAt: t('2026-04-04') },
    ],
    players: [
      { id: 'pAna', name: 'Ana', averageOverride: null, uid: 'uAna' },
      { id: 'pGoo', name: 'Gabriel', averageOverride: null, uid: 'uGoo' },
      { id: 'pLuis2', name: 'Luis Peña', averageOverride: null, uid: 'uLuis' },
      { id: 'pZ', name: 'Zoila', averageOverride: null },
    ],
    events: [
      {
        id: 't1',
        type: 'torneo',
        name: 'Copa',
        date: '2026-05-01',
        games: 3,
        hcpBase: 220,
        hcpPercent: 90,
        individualRankBy: 'hcp',
        teamRankBy: 'hcp',
        teams: { a: { name: 'Equipo A', order: 1776000000000 }, b: { name: dirty ? '' : 'Equipo B', order: 1776000000001 } },
        playerCount: 4,
        rsvp: { pAna: true },
        createdAt: t('2026-04-01'),
      },
    ],
    entries: [
      entry('t1', 'pAna', { teamId: 'a', average: 170, scores: [180, 190, 200], photos: ['sin-foto', 'sin-foto', 'sin-foto'] }),
      entry('t1', 'pGoo', { teamId: 'a', average: 190, scores: [210, 220, 230], photos: ['sin-foto', 'sin-foto', 'sin-foto'] }),
      entry('t1', 'pLuis2', { teamId: 'b', average: 165, scores: [170, 160, 150], photos: ['sin-foto', 'sin-foto', 'sin-foto'] }),
      entry('t1', 'pZ', { teamId: 'b', average: 140, scores: [150, null, 160], photos: ['sin-foto', null, 'sin-foto'] }),
    ],
    submissions: [],
    reactions: [{ id: 't1_pAna_uGoo', entryId: 't1_pAna', eventId: 't1', playerId: 'pAna', uid: 'uGoo', name: 'Gabriel', type: 'like', createdAt: t('2026-05-01') }],
    comments: [],
    suggestions: [{ id: 'g3', text: 'Que el torneo sea mensual', read: false, createdAt: t('2026-05-02') }],
  };

  return {
    app: 'BowlingX',
    exportedAt: '2026-09-20T15:00:00.000Z',
    leagues: [L1, L2],
    users: [
      { id: 'uOrg', email: 'org@bowling.do', name: 'Orlando Díaz', createdAt: t('2025-10-01') },
      { id: 'uSofi', email: 'sofi@bowling.do', name: 'Sofía Marte', createdAt: t('2025-10-02') },
      { id: 'uLuis', email: 'luis@bowling.do', name: 'Luis', createdAt: t('2025-10-03') },
      { id: 'uAna', email: 'ana@bowling.do', name: 'Ana', createdAt: t('2025-10-04') },
      { id: 'uGoo', email: 'gabriel@gmail.com', name: 'Gabriel', createdAt: t('2026-04-02') },
      { id: 'uAdmin', email: 'admin@admin.com', name: 'Admin', superadmin: true, createdAt: t('2025-09-01') },
      { id: 'uDios', email: 'dios@bowling.do', name: 'Randy', superadmin: true, createdAt: t('2025-09-01') },
      { id: 'uNoVal', email: 'nuevo@bowling.do', name: 'Nuevo', createdAt: t('2026-04-03') },
    ],
    invites: [{ id: 'ABCD2345', leagueId: 'L1banco' }],
  };
}

/** Lo que da `firebase auth:export users.json --format=json` para esas cuentas (y dos más que no están en Firestore). */
export function makeAuthExport(): FirebaseAuthExport {
  const pw = (uid: string, email: string, verified: boolean, extra: Partial<FirebaseAuthExport['users'][number]> = {}) => {
    const salt = Buffer.from(`sal-${uid}`).toString('base64');
    return {
      localId: uid,
      email,
      emailVerified: verified,
      passwordHash: firebaseHash(passwordOf(uid), salt, HASH_CONFIG),
      salt,
      createdAt: '1759320000000',
      providerUserInfo: [{ providerId: 'password', rawId: email, email }],
      ...extra,
    };
  };
  return {
    users: [
      pw('uOrg', 'org@bowling.do', true),
      pw('uSofi', 'sofi@bowling.do', true),
      pw('uLuis', 'luis@bowling.do', false),
      pw('uAna', 'Ana@Bowling.do', false),
      { localId: 'uGoo', email: 'gabriel@gmail.com', emailVerified: true, displayName: 'Gabriel G', providerUserInfo: [{ providerId: 'google.com', rawId: '1234', email: 'gabriel@gmail.com' }] },
      pw('uAdmin', 'admin@admin.com', false),
      pw('uDios', 'dios@bowling.do', true),
      pw('uNoVal', 'nuevo@bowling.do', false),
      pw('uDis', 'bloqueado@bowling.do', false, { disabled: true, displayName: 'Bloqueado' }),
      { localId: 'uPhone', providerUserInfo: [{ providerId: 'phone', rawId: '+18095550001' }] },
    ],
  };
}
