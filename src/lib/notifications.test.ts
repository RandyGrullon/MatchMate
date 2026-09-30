import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeagueFeed } from './data';
import type { ChallengeNotice, MatchNoticeFeed, NightNotice, NoticeMatch } from './data/matchNotices';
import { eventLabel, formatDate } from './format';
import {
  BOWLING_NOTIFICATIONS_TEXT,
  EMPTY_READ_STATE,
  MAX_NOTICES,
  NOTICE_FILTERS,
  badgeCount,
  buildMatchNotices,
  buildNotices,
  emptyNoticesText,
  filterNotices,
  groupNotices,
  isNoticeFilter,
  isNoticeUnread,
  loadReadState,
  markAllNoticesRead,
  markNoticeRead,
  markNoticesRead,
  markNoticesSeen,
  notificationsText,
  relativeTime,
  safeAppPath,
  saveReadState,
  socialNoticesFromRows,
  unreadCount,
  type GenericNotice,
  type Notice,
} from './notifications';
import type { BowlingEvent, GameComment, League, Reaction, Submission } from './types';

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const today = '2026-09-25';
const now = new Date(2026, 8, 25, 12).getTime();
const at = (t: number) => ({ toMillis: () => t });

const league = (id: string, extra: Partial<League> = {}): League => ({
  id,
  name: id === 'l1' ? 'Liga Norte' : 'Copa Verano',
  visibility: 'private',
  ownerUid: 'o',
  venue: '',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: true,
  ...extra,
});

const event = (id: string, type: BowlingEvent['type'], date: string, extra: Partial<BowlingEvent> = {}): BowlingEvent => ({
  id,
  type,
  name: type === 'torneo' ? `Torneo ${id}` : '',
  date,
  games: 3,
  hcpBase: 230,
  hcpPercent: 80,
  teams: {},
  playerCount: 0,
  ...extra,
});

const sub = (id: string, status: Submission['status'], extra: Partial<Submission> = {}): Submission => ({
  id,
  playerId: 'p1',
  eventId: 'e1',
  scores: [180, 200],
  scanned: null,
  photoId: null,
  status,
  note: null,
  ...extra,
});

const feed = (extra: Partial<LeagueFeed>): LeagueFeed => ({
  lid: 'l1',
  uid: 'u1',
  playerId: 'p1',
  isAdmin: false,
  isScorer: false,
  events: [],
  mySubs: [],
  pending: [],
  reactions: [],
  comments: [],
  suggestions: [],
  ...extra,
});

const reaction = (uid: string, name: string, type: Reaction['type'], t: number, entryId = 'e1_p1'): Reaction => ({
  id: `${entryId}_${uid}`,
  entryId,
  eventId: 'e1',
  playerId: 'p1',
  uid,
  name,
  type,
  createdAt: at(t),
});

const comment = (id: string, uid: string, name: string, text: string, t: number): GameComment => ({
  id,
  entryId: 'e1_p1',
  eventId: 'e1',
  playerId: 'p1',
  uid,
  name,
  text,
  createdAt: at(t),
});

describe('buzón de sugerencias', () => {
  it('a los organizadores les llega un aviso con las notas sin leer (sin autor)', () => {
    const notes = [
      { id: 's1', text: 'Más prácticas los jueves', read: false, createdAt: at(now - 2 * HOUR) },
      { id: 's2', text: 'Cambiar la hora a las 8', read: false, createdAt: at(now - HOUR) },
    ];
    const admin = buildNotices([feed({ isAdmin: true, suggestions: notes })], [league('l1')], today, now);
    expect(admin.map((n) => [n.kind, n.title, n.body, n.to, n.time])).toEqual([
      ['sugerencia', '2 sugerencias nuevas en el buzón', '“Cambiar la hora a las 8” · anónima', '/l/l1/admin?tab=buzon', now - HOUR],
    ]);
    // A un jugador no le llega (aunque por error le llegaran notas).
    expect(buildNotices([feed({ suggestions: notes })], [league('l1')], today, now)).toEqual([]);
  });
});

describe('avisos de tus juegos (me gusta, felicitar y comentarios)', () => {
  const played = event('e1', 'practica', '2026-09-24');

  it('un aviso por juego con quiénes reaccionaron, sin contar los tuyos', () => {
    const notices = buildNotices(
      [
        feed({
          events: [played],
          reactions: [
            reaction('u2', 'Pedro Pérez', 'felicitar', now - HOUR),
            reaction('u3', 'Ana Díaz', 'felicitar', now - 2 * HOUR),
            reaction('u1', 'Yo Mismo', 'like', now - 10 * 60_000),
          ],
        }),
      ],
      [league('l1')],
      today,
      now,
    );
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      kind: 'reaccion',
      title: 'Pedro y Ana te felicitaron 🎉',
      body: eventLabel(played),
      to: '/l/l1/juegos?juego=e1_p1',
      time: now - HOUR,
    });
  });

  it('me gusta de una persona, y reacciones mezcladas', () => {
    const one = buildNotices([feed({ reactions: [reaction('u2', 'Pedro Pérez', 'like', now - HOUR)] })], [league('l1')], today, now);
    expect(one[0].title).toBe('A Pedro le gustó tu juego');
    const mixed = buildNotices(
      [feed({ reactions: [reaction('u2', 'Pedro', 'like', now - HOUR), reaction('u3', 'Ana', 'felicitar', now - HOUR), reaction('u4', 'Luis', 'like', now)] })],
      [league('l1')],
      today,
      now,
    );
    expect(mixed[0].title).toBe('Luis y 2 más reaccionaron a tu juego');
  });

  it('dos personas con el mismo nombre son dos (y la gramática cuadra)', () => {
    const notices = buildNotices(
      [feed({ reactions: [reaction('u2', 'Pedro Pérez', 'felicitar', now - HOUR), reaction('u3', 'Pedro Gómez', 'felicitar', now - 2 * HOUR)] })],
      [league('l1')],
      today,
      now,
    );
    expect(notices[0].title).toBe('Pedro y Pedro te felicitaron 🎉');
  });

  it('los comentarios de un mismo juego van en un solo aviso, con el último', () => {
    const notices = buildNotices(
      [
        feed({
          comments: [
            comment('c1', 'u2', 'Pedro Pérez', 'Primero', now - 2 * HOUR),
            comment('c2', 'u3', 'Ana Díaz', '¡El último!', now - HOUR),
            comment('c3', 'u2', 'Pedro Pérez', 'Otro de Pedro', now - 3 * HOUR),
          ],
        }),
      ],
      [league('l1')],
      today,
      now,
    );
    expect(notices.map((n) => [n.title, n.body, n.time])).toEqual([['Ana y Pedro comentaron tu juego', '“¡El último!”', now - HOUR]]);
  });

  it('cada comentario de otro es un aviso; los viejos (más de un mes) no', () => {
    const notices = buildNotices(
      [
        feed({
          comments: [
            comment('c1', 'u2', 'Pedro Pérez', '¡Qué juegazo!', now - HOUR),
            comment('c2', 'u1', 'Yo', 'Gracias', now - 30 * 60_000),
            comment('c3', 'u3', 'Ana', 'Viejo', now - 40 * DAY),
          ],
        }),
      ],
      [league('l1')],
      today,
      now,
    );
    expect(notices.map((n) => [n.kind, n.title, n.body])).toEqual([['comentario', 'Pedro comentó tu juego', '“¡Qué juegazo!”']]);
  });
});

describe('avisos', () => {
  it('dice de qué liga es cada aviso y si es privada o torneo sin liga', () => {
    const notices = buildNotices(
      [
        feed({ events: [event('t1', 'torneo', '2026-10-10', { createdAt: at(now - HOUR) })] }),
        feed({ lid: 'l2', events: [event('t2', 'torneo', '2026-10-20', { createdAt: at(now - 2 * HOUR) })] }),
      ],
      [league('l1'), league('l2', { kind: 'torneo', visibility: 'public' })],
      today,
      now,
    );
    expect(notices.map((n) => [n.leagueName, n.leagueKind, n.private, n.title])).toEqual([
      ['Liga Norte', 'liga', true, 'Nuevo torneo: Torneo t1'],
      ['Copa Verano', 'torneo', false, 'Nuevo torneo: Torneo t2'],
    ]);
    expect(notices[0].to).toBe('/l/l1/e/t1');
  });

  it('el torneo del día sube arriba con su propio título', () => {
    const [n] = buildNotices([feed({ events: [event('t1', 'torneo', today, { createdAt: at(now - 20 * DAY) })] })], [league('l1')], today, now);
    expect(n.kind).toBe('torneo-hoy');
    expect(n.title).toBe('¡Hoy es Torneo t1!');
    expect(n.time).toBeGreaterThanOrEqual(new Date(2026, 8, 25).getTime());
  });

  it('no avisa de eventos que ya pasaron ni de prácticas lejanas', () => {
    const notices = buildNotices(
      [
        feed({
          events: [
            event('viejo', 'torneo', '2026-09-24'),
            event('p-lejos', 'practica', '2026-10-20'),
            event('p-cerca', 'practica', '2026-09-29', { rsvp: { p1: true, p9: true } }),
          ],
        }),
      ],
      [league('l1')],
      today,
      now,
    );
    expect(notices.map((n) => n.id)).toEqual(['practica:l1:p-cerca']);
    expect(notices[0].body).toBe('Vas ✓ · 2 confirmados');
  });

  it('avisa lo aprobado y lo rechazado del último mes, con el motivo', () => {
    const notices = buildNotices(
      [
        feed({
          events: [event('e1', 'practica', '2026-09-30')],
          mySubs: [
            sub('a', 'aprobado', { reviewedAt: at(now - 3 * HOUR) }),
            sub('r', 'rechazado', { reviewedAt: at(now - 5 * HOUR), note: 'la foto no se lee', eventId: null, date: '2026-09-22' }),
            sub('viejo', 'aprobado', { reviewedAt: at(now - 40 * DAY) }),
            sub('pend', 'pendiente'),
          ],
        }),
      ],
      [league('l1')],
      today,
      now,
    ).filter((n) => n.kind === 'aprobado' || n.kind === 'rechazado');
    expect(notices.map((n) => [n.kind, n.body, n.to])).toEqual([
      ['aprobado', `180 · 200 · Práctica ${formatDate('2026-09-30')}`, '/l/l1/e/e1'],
      ['rechazado', `180 · 200 · Práctica ${formatDate('2026-09-22')} · Motivo: la foto no se lee`, '/l/l1/perfil'],
    ]);
  });

  it('al admin le avisa lo pendiente por aprobar, uno por liga', () => {
    const notices = buildNotices(
      [
        feed({
          isAdmin: true,
          pending: [
            sub('x', 'pendiente', { playerId: 'p2', createdAt: at(now - HOUR) }),
            sub('y', 'pendiente', { playerId: 'p3', createdAt: at(now - 2 * HOUR) }),
          ],
        }),
      ],
      [league('l1')],
      today,
      now,
    );
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ kind: 'por-aprobar', title: '2 envíos por aprobar', to: '/l/l1/admin?tab=aprobar', time: now - HOUR });
  });

  it('el dueño y los admins también juegan: no se avisan de sus propios envíos ni de lo que aprobaron ellos', () => {
    const mine = sub('m', 'pendiente', { createdAt: at(now - HOUR) });
    const selfApproved = sub('a', 'aprobado', { reviewedAt: at(now - HOUR), reviewedBy: 'u1' });
    const byOther = sub('b', 'aprobado', { reviewedAt: at(now - HOUR), reviewedBy: 'u9' });
    const notices = buildNotices(
      [feed({ isAdmin: true, pending: [mine], mySubs: [mine, selfApproved, byOther], events: [event('e1', 'practica', '2026-09-22')] })],
      [league('l1')],
      today,
      now,
    );
    expect(notices.map((n) => [n.kind, n.id])).toEqual([['aprobado', 'envio:l1:b']]);
  });

  it('dice de qué evento eran los juegos aunque el evento ya pasó', () => {
    const notices = buildNotices(
      [
        feed({
          // El torneo del sábado ya pasó: llega a la lista solo para ponerle nombre al aviso.
          events: [event('sab', 'torneo', '2026-09-20')],
          mySubs: [sub('a', 'aprobado', { eventId: 'sab', reviewedAt: at(now - HOUR) })],
        }),
      ],
      [league('l1')],
      today,
      now,
    );
    expect(notices.map((n) => [n.kind, n.body])).toEqual([['aprobado', '180 · 200 · Torneo sab']]);
  });

  it('ignora ligas que ya no están', () => {
    expect(buildNotices([feed({ lid: 'borrada', events: [event('t', 'torneo', '2026-10-01')] })], [league('l1')], today, now)).toEqual([]);
  });
});

describe('ligas de otros deportes', () => {
  const other = (type: string, date: string, extra: Partial<BowlingEvent> = {}) =>
    event(`x-${type}`, type as BowlingEvent['type'], date, { name: '', createdAt: at(now - HOUR), ...extra });

  it('sus eventos no salen como prácticas del boliche (americano, cajas, ronda, encuentro)', () => {
    const notices = buildNotices(
      [
        feed({ lid: 'padel', events: [other('americano', today), other('cajas', '2026-09-27'), other('practica', '2026-09-28')] }),
        feed({ lid: 'golf', events: [other('ronda', '2026-09-26')] }),
        feed({ lid: 'nado', events: [other('encuentro', today)] }),
      ],
      [league('padel', { sport: 'padel' }), league('golf', { sport: 'golf' }), league('nado', { sport: 'swimming' })],
      today,
      now,
    );
    expect(notices).toEqual([]);
  });

  it('el torneo sí se avisa, con el nombre del tipo del deporte', () => {
    const notices = buildNotices(
      [
        feed({
          lid: 'padel',
          events: [other('torneo', '2026-10-03', { createdAt: at(now - 2 * HOUR) }), other('torneo', today, { id: 'hoy', name: 'Copa Pádel' })],
        }),
      ],
      [league('padel', { name: 'Pádel Club', sport: 'padel' })],
      today,
      now,
    );
    expect(notices.map((n) => [n.kind, n.title])).toEqual([
      ['torneo-hoy', '¡Hoy es Copa Pádel!'],
      ['torneo', `Nuevo torneo: Torneo ${formatDate('2026-10-03')}`],
    ]);
  });

  it('el buzón de sugerencias sigue llegando en cualquier deporte', () => {
    const notes = [{ id: 's1', text: 'Más canchas', read: false, createdAt: at(now - HOUR) }];
    const notices = buildNotices(
      [feed({ lid: 'golf', isAdmin: true, events: [other('ronda', today)], suggestions: notes })],
      [league('golf', { sport: 'golf' })],
      today,
      now,
    );
    expect(notices.map((n) => [n.kind, n.to])).toEqual([['sugerencia', '/l/golf/admin?tab=buzon']]);
  });

  it('en el boliche todo sigue igual', () => {
    const notices = buildNotices(
      [feed({ events: [event('p', 'practica', '2026-09-27', { createdAt: at(now - HOUR) })] })],
      [league('l1', { sport: 'bowling' })],
      today,
      now,
    );
    expect(notices.map((n) => n.kind)).toEqual(['practica']);
  });
});

describe('cuándo', () => {
  it('dice el tiempo en palabras', () => {
    expect(relativeTime(now - 20_000, now)).toBe('ahora');
    expect(relativeTime(now - 5 * 60_000, now)).toBe('hace 5 min');
    expect(relativeTime(now - 3 * HOUR, now)).toBe('hace 3 h');
    expect(relativeTime(now - 30 * HOUR, now)).toBe('ayer');
    expect(relativeTime(now - 4 * DAY, now)).toBe('hace 4 días');
  });

  it('cuenta días de calendario, no bloques de 24 h', () => {
    // 23 de sept a las 11 pm visto el 25 a las 10 pm: 47 h, pero fue anteayer.
    expect(relativeTime(new Date(2026, 8, 23, 23).getTime(), new Date(2026, 8, 25, 22).getTime())).toBe('hace 2 días');
    // 24 a las 6 am visto el 25 al mediodía: 30 h y sí fue ayer.
    expect(relativeTime(new Date(2026, 8, 24, 6).getTime(), new Date(2026, 8, 25, 12).getTime())).toBe('ayer');
  });
});

// ---------- Partidos (raqueta y equipos) ----------

describe('avisos de partidos', () => {
  // Jueves 8 de octubre de 2026, 5:00 pm en Santo Domingo (UTC−4, sin horario de verano).
  const NOW = Date.parse('2026-10-08T21:00:00Z');
  const TZ = 'America/Santo_Domingo';
  const iso = (t: number) => new Date(t).toISOString();
  const mm = league('mm', { name: 'Pádel Club', sport: 'padel', tz: TZ });
  const fut = league('fut', { name: 'Liga de Fútbol', sport: 'football', tz: TZ, visibility: 'public' });
  const sideOf = (n: 1 | 2, label: string) => ({ side: n, teamId: null, label, seed: null, players: [] });

  const match = (id: string, extra: Partial<NoticeMatch> = {}): NoticeMatch => ({
    id,
    leagueId: 'mm',
    eventId: null,
    round: null,
    stage: '',
    bracketKey: null,
    court: '',
    scheduledAt: null,
    status: 'scheduled',
    format: 'sets',
    requireConfirm: true,
    score: null,
    winner: null,
    walkoverSide: null,
    scorerId: null,
    leaseUntil: null,
    seq: 0,
    version: 1,
    proposedBy: null,
    proposedAt: null,
    proposedSide: null,
    confirmedBy: null,
    confirmedAt: null,
    disputedBy: null,
    disputedAt: null,
    disputeNote: null,
    note: null,
    createdBy: null,
    sides: [sideOf(1, 'Luis / Ana'), sideOf(2, 'Pedro / Rosa')],
    createdAt: at(NOW - 3 * DAY),
    updatedAt: at(NOW - 3 * DAY),
    mySide: 1,
    canAnswer: true,
    change: null,
    ...extra,
  });

  const matchFeed = (extra: Partial<MatchNoticeFeed>): MatchNoticeFeed => ({
    uid: 'u1',
    mine: [],
    disputes: [],
    challenges: [],
    nights: [],
    players: { mm: 'p1' },
    adminLeagues: [],
    ...extra,
  });

  const build = (extra: Partial<MatchNoticeFeed>, leagues = [mm, fut]) => buildMatchNotices(matchFeed(extra), leagues, NOW);
  const texts = (extra: Partial<MatchNoticeFeed>) => build(extra).map((n) => [n.kind, n.title, n.body]);

  it('el partido de hoy, con la hora y la cancha de la liga (el de mañana todavía no)', () => {
    const today = match('hoy', { scheduledAt: '2026-10-09T00:00:00Z', court: 'Cancha 2', createdAt: at(NOW - 3 * DAY) });
    const notices = build({
      mine: [
        today,
        match('reto', { stage: 'Reto', scheduledAt: '2026-10-08T23:30:00Z' }),
        match('semi', { stage: 'Semifinal', leagueId: 'fut', scheduledAt: '2026-10-08T22:00:00Z', court: 'Campo 1' }),
        match('manana', { scheduledAt: '2026-10-09T23:00:00Z' }),
        match('jugado', { status: 'confirmed', scheduledAt: '2026-10-08T14:00:00Z' }),
        match('ronda', { format: 'americano', scheduledAt: '2026-10-08T23:00:00Z' }),
      ],
    });
    expect(notices.map((n) => [n.id, n.kind, n.title, n.body, n.to])).toEqual([
      ['partido:hoy', 'partido-hoy', 'Partido hoy a las 8:00 pm, Cancha 2', 'Luis / Ana contra Pedro / Rosa', '/l/mm/juegos?partido=hoy'],
      ['partido:reto', 'partido-hoy', 'Reto hoy a las 7:30 pm', 'Luis / Ana contra Pedro / Rosa', '/l/mm/juegos?partido=reto'],
      ['partido:semi', 'partido-hoy', 'Partido hoy a las 6:00 pm, Campo 1', 'Semifinal · Luis / Ana contra Pedro / Rosa', '/l/fut/juegos?partido=semi'],
    ]);
    // Sube arriba el día del partido aunque se haya creado antes.
    const midnight = new Date(NOW);
    midnight.setHours(0, 0, 0, 0);
    expect(notices[0].time).toBe(Math.max(midnight.getTime(), NOW - 3 * DAY));
    expect(notices[0]).toMatchObject({ leagueName: 'Pádel Club', leagueKind: 'liga', private: true });
    expect(notices[2].private).toBe(false);
  });

  it('el partido de hoy se deja de avisar unas horas después de la hora', () => {
    expect(build({ mine: [match('tarde', { scheduledAt: '2026-10-08T17:30:00Z' })] })).toEqual([]);
    expect(build({ mine: [match('recien', { scheduledAt: '2026-10-08T19:00:00Z' })] })).toHaveLength(1);
  });

  it('resultado por confirmar: al rival que puede confirmar, mientras corren las 48 h', () => {
    const proposed = (id: string, extra: Partial<NoticeMatch> = {}) =>
      match(id, { status: 'finished', proposedSide: 2, proposedBy: 'u2', proposedAt: iso(NOW - 17 * HOUR), score: { text: '6-4 6-3' }, ...extra });
    const notices = build({
      mine: [
        proposed('si'),
        proposed('mio', { proposedSide: 1, proposedBy: 'u1' }),
        proposed('sin-permiso', { canAnswer: false }),
        proposed('vencido', { proposedAt: iso(NOW - 49 * HOUR) }),
        proposed('ya', { status: 'confirmed' }),
      ],
    });
    expect(notices.map((n) => [n.id, n.kind, n.title, n.body, n.to, n.time])).toEqual([
      [
        'confirmar:si',
        'por-confirmar',
        'Tienes un resultado por confirmar',
        'Pedro / Rosa anotó 6-4 6-3. Confírmalo o reclama en las próximas 31 h.',
        '/l/mm/juegos?partido=si',
        NOW - 17 * HOUR,
      ],
    ]);
    const last = build({ mine: [proposed('ultimo', { proposedAt: iso(NOW - 47.5 * HOUR), score: null })] });
    expect(last[0].body).toBe('Pedro / Rosa anotó el resultado. Confírmalo o reclama en los próximos 30 min.');
  });

  it('reclamos: al organizador para resolverlo, y a quien lo anotó (uno solo si es las dos cosas)', () => {
    const disputed = (id: string, extra: Partial<NoticeMatch> = {}) =>
      match(id, {
        status: 'disputed',
        proposedSide: 1,
        proposedBy: 'u1',
        disputedBy: 'u2',
        disputedAt: iso(NOW - 2 * HOUR),
        disputeNote: 'Fue 6-4 4-6 10-8',
        score: { text: '6-4 6-3' },
        ...extra,
      });
    const admin = build({ adminLeagues: ['mm'], disputes: [disputed('a'), disputed('otro', { disputedBy: 'u1' })], mine: [disputed('a')] });
    expect(admin.map((n) => [n.id, n.kind, n.title, n.body, n.to, n.time])).toEqual([
      [
        'reclamo:a',
        'reclamo',
        'Reclamaron un resultado',
        'Luis / Ana contra Pedro / Rosa: 6-4 6-3. «Fue 6-4 4-6 10-8». Toca para resolverlo.',
        '/l/mm/juegos?partido=a',
        NOW - 2 * HOUR,
      ],
    ]);
    // Un jugador: solo si reclamaron lo que anotó su lado; las disputas de ligas que no organiza no llegan.
    expect(texts({ disputes: [disputed('x')], mine: [disputed('b', { disputeNote: null, score: null }), disputed('c', { mySide: 2 })] })).toEqual([
      ['reclamo', 'Reclamaron tu resultado', 'Luis / Ana contra Pedro / Rosa. El organizador lo va a revisar.'],
    ]);
  });

  it('cambio de fecha, de hora o de cancha que hizo otra cuenta (una semana)', () => {
    const moved = (id: string, change: Partial<NonNullable<NoticeMatch['change']>>, extra: Partial<NoticeMatch> = {}) =>
      match(id, {
        scheduledAt: change.toAt ?? '2026-10-10T00:00:00Z',
        change: { a: 'reschedule', at: iso(NOW - HOUR), fromAt: null, toAt: null, fromCourt: null, toCourt: null, note: null, ...change },
        ...extra,
      });
    const notices = build({
      mine: [
        moved('fecha', { fromAt: '2026-10-09T00:00:00Z', toAt: '2026-10-10T00:00:00Z', fromCourt: 'Cancha 1', toCourt: 'Cancha 2', note: 'Lluvia' }),
        moved('hora', { a: 'schedule', fromAt: '2026-10-10T23:00:00Z', toAt: '2026-10-11T00:30:00Z', at: iso(NOW - 2 * HOUR) }),
        moved('cancha', { fromAt: '2026-10-12T00:00:00Z', toAt: '2026-10-12T00:00:00Z', fromCourt: '1', toCourt: '3', at: iso(NOW - 3 * HOUR) }),
        moved('nueva', { a: 'schedule', toAt: '2026-10-09T01:00:00Z', at: iso(NOW - 4 * HOUR) }),
        moved('vieja', { fromAt: '2026-10-09T00:00:00Z', toAt: '2026-10-10T00:00:00Z', at: iso(NOW - 8 * DAY) }),
        moved('pasado', { fromAt: '2026-10-01T00:00:00Z', toAt: '2026-10-07T00:00:00Z' }),
        moved('jugado', { fromAt: '2026-10-09T00:00:00Z', toAt: '2026-10-10T00:00:00Z' }, { status: 'live' }),
      ],
    }).filter((n) => n.kind === 'cambio-hora');
    expect(notices.map((n) => [n.id, n.title, n.body])).toEqual([
      ['hora:fecha', 'Cambiaron la fecha de tu partido', 'Luis / Ana contra Pedro / Rosa · Ahora: mañana, 8:00 pm, Cancha 2. «Lluvia».'],
      ['hora:hora', 'Cambiaron la hora de tu partido', 'Luis / Ana contra Pedro / Rosa · Ahora: sáb 10 oct, 8:30 pm.'],
      ['hora:cancha', 'Cambiaron la cancha de tu partido', 'Luis / Ana contra Pedro / Rosa · Ahora: dom 11 oct, 8:00 pm, 3.'],
      ['hora:nueva', 'Tu partido ya tiene fecha', 'Luis / Ana contra Pedro / Rosa · Ahora: hoy, 9:00 pm.'],
    ]);
    expect(notices[0]).toMatchObject({ kind: 'cambio-hora', to: '/l/mm/juegos?partido=fecha', time: NOW - HOUR });
    // En ping pong se juega en una mesa.
    const pp = league('mm', { name: 'Ping Pong Club', sport: 'table_tennis', tz: TZ });
    const mesa = build({ mine: [moved('mesa', { fromAt: '2026-10-12T00:00:00Z', toAt: '2026-10-12T00:00:00Z', fromCourt: 'Mesa 1', toCourt: 'Mesa 3' })] }, [pp]);
    expect(mesa.filter((n) => n.kind === 'cambio-hora').map((n) => [n.title, n.body])).toEqual([
      ['Cambiaron la mesa de tu partido', 'Luis / Ana contra Pedro / Rosa · Ahora: dom 11 oct, 8:00 pm, Mesa 3.'],
    ]);
  });

  it('aplazado (mientras siga aplazado)', () => {
    const postponed = (id: string, extra: Partial<NoticeMatch> = {}) =>
      match(id, {
        status: 'postponed',
        change: { a: 'postpone', at: iso(NOW - 2 * HOUR), fromAt: null, toAt: null, fromCourt: null, toCourt: null, note: 'Se fue la luz' },
        ...extra,
      });
    expect(texts({ mine: [postponed('a'), postponed('b', { status: 'scheduled' })] })).toEqual([
      ['aplazado', 'Aplazaron tu partido', 'Luis / Ana contra Pedro / Rosa. «Se fue la luz». Te avisamos aquí cuando tenga fecha nueva.'],
    ]);
  });

  it('ronda de la noche: mi cancha o que descanso (solo la última ronda)', () => {
    const night: NightNotice = {
      eventId: 'n1',
      leagueId: 'mm',
      type: 'americano',
      name: 'Americano del jueves',
      date: '2026-10-08',
      round: 3,
      rests: [],
      changedAt: iso(NOW - 30 * 60_000),
    };
    const r3 = match('r3', {
      eventId: 'n1',
      round: 3,
      court: 'Cancha 2',
      format: 'americano',
      mySide: 2,
      createdAt: at(NOW - 20 * 60_000),
      scheduledAt: '2026-10-08T23:00:00Z',
    });
    const r2 = match('r2', { eventId: 'n1', round: 2, court: 'Cancha 1', format: 'americano', status: 'confirmed' });
    expect(build({ nights: [night], mine: [r2, r3] }).map((n) => [n.id, n.kind, n.title, n.body, n.to, n.time])).toEqual([
      ['ronda:n1', 'ronda', 'Ronda 3: te toca la Cancha 2', 'Pedro / Rosa contra Luis / Ana · Americano del jueves', '/l/mm/e/n1?partido=r3', NOW - 20 * 60_000],
    ]);
    expect(build({ nights: [{ ...night, rests: ['p1'] }], mine: [r2] }).map((n) => [n.title, n.body, n.to, n.time])).toEqual([
      ['Ronda 3: descansas', 'Te toca descansar esta ronda · Americano del jueves', '/l/mm/e/n1', NOW - 30 * 60_000],
    ]);
    expect(build({ nights: [night], mine: [r2] })).toEqual([]);
    expect(build({ nights: [{ ...night, round: 0 }], mine: [] })).toEqual([]);
    // Cancha sin la palabra «cancha».
    expect(build({ nights: [night], mine: [{ ...r3, court: '4' }] })[0].title).toBe('Ronda 3: te toca la cancha 4');
  });

  it('retos de la escalera: te retaron (hasta el plazo) y aceptaron tu reto (sin repetir el cambio de hora)', () => {
    const challenge = (id: string, matchId: string, extra: Partial<ChallengeNotice> = {}): ChallengeNotice => ({
      id,
      leagueId: 'mm',
      eventId: 'esc',
      matchId,
      status: 'pending',
      acceptBy: '2026-10-11T16:00:00Z',
      playBy: '2026-10-15T16:00:00Z',
      acceptedAt: null,
      acceptedBy: null,
      sentAt: iso(NOW - 5 * HOUR),
      challengerPos: 3,
      challengedPos: 1,
      ...extra,
    });
    const retado = match('m1', { stage: 'Reto', eventId: 'esc', mySide: 2, sides: [sideOf(1, 'Luis'), sideOf(2, 'Pedro')] });
    const pending = build({ mine: [retado], challenges: [challenge('c1', 'm1'), challenge('vencido', 'm1', { acceptBy: iso(NOW - HOUR) })] });
    expect(pending.map((n) => [n.id, n.title, n.body, n.to, n.time])).toEqual([
      ['reto:c1', 'Te retaron en la escalera', 'Luis (puesto 3) te retó. Tienes hasta el dom 11 oct a las 12:00 pm para aceptar.', '/l/mm/e/esc', NOW - 5 * HOUR],
    ]);

    const acceptedAt = iso(NOW - HOUR);
    const retador = match('m2', {
      stage: 'Reto',
      eventId: 'esc',
      mySide: 1,
      court: 'Cancha 1',
      scheduledAt: '2026-10-10T00:00:00Z',
      sides: [sideOf(1, 'Luis'), sideOf(2, 'Pedro')],
      change: { a: 'schedule', at: acceptedAt, fromAt: null, toAt: '2026-10-10T00:00:00Z', fromCourt: '', toCourt: 'Cancha 1', note: null },
    });
    const accepted = challenge('c3', 'm2', { status: 'accepted', acceptedAt, acceptedBy: 'u2' });
    expect(texts({ mine: [retador], challenges: [accepted] })).toEqual([['reto', 'Aceptaron tu reto', 'Pedro aceptó el reto. Juegan mañana a las 8:00 pm, Cancha 1.']]);
    // Sin hora: el plazo para jugar. Lo aceptó uno mismo (el admin que también juega): nada.
    expect(texts({ mine: [{ ...retador, scheduledAt: null, change: null }], challenges: [accepted] })).toEqual([
      ['reto', 'Aceptaron tu reto', 'Pedro aceptó el reto. Tienen hasta el jue 15 oct para jugar.'],
    ]);
    expect(build({ mine: [retador], challenges: [{ ...accepted, acceptedBy: 'u1' }] }).filter((n) => n.kind === 'reto')).toEqual([]);
  });

  it('ligas que ya no están y zonas horarias que no sirven no rompen nada', () => {
    const lost = match('x', { leagueId: 'borrada', scheduledAt: '2026-10-09T00:00:00Z' });
    expect(build({ mine: [lost] })).toEqual([]);
    const odd = league('mm', { name: 'Pádel Club', sport: 'padel', tz: 'Marte/Base' });
    expect(build({ mine: [match('hoy', { scheduledAt: '2026-10-09T00:00:00Z' })] }, [odd])[0].title).toBe('Partido hoy a las 8:00 pm');
    expect(buildMatchNotices(null, [mm], NOW)).toEqual([]);
  });

  it('la campana los mezcla con los demás avisos, del más nuevo al más viejo', () => {
    const notices = buildNotices(
      [feed({ lid: 'mm', isAdmin: true, suggestions: [{ id: 's1', text: 'Más canchas', read: false, createdAt: at(NOW - 3 * HOUR) }] })],
      [mm],
      '2026-10-08',
      NOW,
      matchFeed({ mine: [match('si', { status: 'finished', proposedSide: 2, proposedBy: 'u2', proposedAt: iso(NOW - 2 * HOUR), score: { text: '6-4 6-3' } })] }),
    );
    expect(notices.map((n) => n.kind)).toEqual(['por-confirmar', 'sugerencia']);
  });
});

describe('textos según los deportes de la cuenta', () => {
  it('con solo boliche, lo de siempre (en «¿Te avisamos?» y en la campana vacía)', () => {
    expect(notificationsText(['bowling'])).toBe(BOWLING_NOTIFICATIONS_TEXT);
    expect(emptyNoticesText(['bowling'])).toBe(
      'Aquí te avisamos de torneos nuevos, prácticas de la semana y cuando aprueben tus juegos, con la liga de cada cosa.',
    );
  });

  it('pádel: partidos, noches de americano, resultados por confirmar y retos', () => {
    expect(notificationsText(['padel'])).toBe(
      'Recordatorios de tus partidos, el día antes y unas horas antes («Partido hoy a las 8:00 pm, Cancha 2») y las noches de americano, con tu cancha en cada ronda, aunque la app esté cerrada. También te avisamos cuando tienes un resultado por confirmar, cuando reclaman un resultado en la liga que organizas y cuando te retan en la escalera.',
    );
    expect(emptyNoticesText(['padel'])).toBe(
      'Aquí te avisamos de tus partidos del día, los resultados por confirmar y los cambios de hora, tu cancha en cada ronda del americano, los retos de la escalera y los torneos nuevos, con la liga de cada cosa.',
    );
  });

  it('fútbol: con la convocatoria y sin escalera', () => {
    const text = notificationsText(['football']);
    expect(text).toContain('«Partido hoy a las 8:00 pm, Cancha 2», con la convocatoria');
    expect(text).not.toContain('escalera');
    expect(text).not.toContain('americano');
  });

  it('golf, natación y boliche juntos', () => {
    expect(notificationsText(['golf', 'swimming', 'bowling'])).toBe(
      'Recordatorios de tus rondas de golf, con tu grupo y tu hoyo de salida, los encuentros de natación y tus prácticas y torneos de boliche, aunque la app esté cerrada. Con la app abierta o en segundo plano, también felicitaciones, comentarios y cuando aprueben tus juegos.',
    );
  });

  it('sin ligas: lo general', () => {
    expect(notificationsText([])).toContain('Recordatorios de tus partidos, rondas, encuentros, prácticas y torneos');
    expect(emptyNoticesText([])).toContain('torneos nuevos');
  });
});

// ---------- Página de avisos ----------

describe('página de avisos: categoría y deporte de cada aviso', () => {
  it('cada aviso dice su categoría (Partidos y resultados, Mis ligas, Social, Admin) y el deporte de su liga', () => {
    const notices = buildNotices(
      [
        feed({
          isAdmin: true,
          events: [event('t1', 'torneo', '2026-09-30')],
          mySubs: [sub('a', 'aprobado', { reviewedAt: at(now - HOUR), reviewedBy: 'admin' })],
          reactions: [reaction('u2', 'Pedro', 'like', now - 2 * HOUR)],
          suggestions: [{ id: 's1', text: 'Más prácticas', read: false, createdAt: at(now - 3 * HOUR) }],
        }),
      ],
      [league('l1')],
      today,
      now,
    );
    expect(Object.fromEntries(notices.map((n) => [n.kind, [n.category, n.sport]]))).toEqual({
      torneo: ['ligas', 'bowling'],
      aprobado: ['partidos', 'bowling'],
      reaccion: ['social', 'bowling'],
      sugerencia: ['admin', 'bowling'],
    });
  });

  it('el reclamo al organizador va en Admin; el de «tu resultado», en Partidos', () => {
    const NOW = Date.parse('2026-10-08T21:00:00Z');
    const padel = league('mm', { name: 'Pádel Club', sport: 'padel' });
    const disputed = {
      id: 'a',
      leagueId: 'mm',
      status: 'disputed',
      proposedSide: 1,
      proposedBy: 'u1',
      disputedBy: 'u2',
      disputedAt: new Date(NOW - HOUR).toISOString(),
      disputeNote: null,
      score: null,
      sides: [],
      mySide: 1,
    } as unknown as NoticeMatch;
    const feedOf = (admin: boolean): MatchNoticeFeed => ({
      uid: 'u1',
      mine: [disputed],
      disputes: admin ? [disputed] : [],
      challenges: [],
      nights: [],
      players: {},
      adminLeagues: admin ? ['mm'] : [],
    });
    expect(buildMatchNotices(feedOf(true), [padel], NOW).map((n) => [n.title, n.category, n.sport])).toEqual([['Reclamaron un resultado', 'admin', 'padel']]);
    expect(buildMatchNotices(feedOf(false), [padel], NOW).map((n) => [n.title, n.category, n.sport])).toEqual([['Reclamaron tu resultado', 'partidos', 'padel']]);
  });
});

describe('avisos genéricos (seguidores y me gusta del perfil)', () => {
  const social = (id: string, extra: Partial<GenericNotice> = {}): GenericNotice => ({
    id,
    kind: 'social',
    title: 'Ana te empezó a seguir',
    body: 'Mira su perfil',
    url: '/perfil/ana',
    at: now - HOUR,
    ...extra,
  });

  it('se mezclan con los demás por hora, en Social, sin liga si no traen una', () => {
    const notices = buildNotices(
      [feed({ reactions: [reaction('u2', 'Pedro', 'like', now - 2 * HOUR)] })],
      [league('l1')],
      today,
      now,
      null,
      [social('seguir:ana', { icon: 'follow' })],
    );
    expect(notices.map((n) => [n.id, n.kind, n.category])).toEqual([
      ['seguir:ana', 'social', 'social'],
      ['reaccion:l1:e1_p1', 'reaccion', 'social'],
    ]);
    expect(notices[0]).toMatchObject({ title: 'Ana te empezó a seguir', body: 'Mira su perfil', to: '/perfil/ana', lid: '', leagueName: '', sport: null, icon: 'follow', time: now - HOUR });
  });

  it('con una liga de la cuenta llevan su nombre y su deporte; si no, el deporte que traigan', () => {
    const padel = league('p1', { name: 'Pádel Club', sport: 'padel', visibility: 'public' });
    const notices = buildNotices([], [padel], today, now, null, [
      social('like:1', { lid: 'p1', title: 'A Luis le gustó tu juego', icon: 'like' }),
      social('like:2', { lid: 'otra', sport: 'tennis', at: now - 2 * HOUR }),
    ]);
    expect(notices.map((n) => [n.id, n.lid, n.leagueName, n.sport, n.private])).toEqual([
      ['like:1', 'p1', 'Pádel Club', 'padel', false],
      ['like:2', '', '', 'tennis', false],
    ]);
  });

  it('la hora puede venir en ms, ISO o Stamp; sin título, sin id o sin hora que sirva, no sale', () => {
    const notices = buildNotices([], [], today, now, null, [
      social('ms', { at: now - HOUR }),
      social('iso', { at: new Date(now - 2 * HOUR).toISOString() }),
      social('stamp', { at: at(now - 3 * HOUR) }),
      social('sin-titulo', { title: '  ' }),
      social('', {}),
      social('sin-hora', { at: null }),
      social('hora-mala', { at: 'ayer' }),
      social('nan', { at: Number.NaN }),
    ]);
    expect(notices.map((n) => [n.id, n.time])).toEqual([
      ['ms', now - HOUR],
      ['iso', now - 2 * HOUR],
      ['stamp', now - 3 * HOUR],
    ]);
  });

  it('solo llevan a rutas de la app; un id repetido sale una vez', () => {
    const notices = buildNotices([], [], today, now, null, [
      social('a', { url: 'https://otro.sitio/robar' }),
      social('b', { url: '//otro.sitio' }),
      social('c', { url: 'javascript:alert(1)' }),
      social('a', { title: 'Repetido', at: now }),
    ]);
    expect(notices.map((n) => [n.id, n.title, n.to])).toEqual([
      ['a', 'Ana te empezó a seguir', '/avisos'],
      ['b', 'Ana te empezó a seguir', '/avisos'],
      ['c', 'Ana te empezó a seguir', '/avisos'],
    ]);
    expect(safeAppPath('/perfil/ana?tab=juegos')).toBe('/perfil/ana?tab=juegos');
    expect(safeAppPath('/\\otro.sitio')).toBeNull();
    expect(safeAppPath('/con espacio')).toBeNull();
    expect(safeAppPath('perfil')).toBeNull();
    expect(safeAppPath(null)).toBeNull();
  });

  it('se guardan como mucho los más nuevos', () => {
    const many = Array.from({ length: MAX_NOTICES + 5 }, (_, i) => social(`s${i}`, { at: now - i * 60_000 }));
    const notices = buildNotices([], [], today, now, null, many);
    expect(notices).toHaveLength(MAX_NOTICES);
    expect(notices[0].id).toBe('s0');
  });
});

describe('avisos del perfil social (lo que devuelve social_notices)', () => {
  const iso = (t: number) => new Date(t).toISOString();
  const like = (uid: string, name: string, at: number, extra: Record<string, unknown> = {}) => ({
    kind: 'like',
    at: iso(at),
    userId: uid,
    name,
    gameKind: 'match',
    id: 'm1',
    playerId: 'p1',
    leagueId: 'l1',
    leagueName: 'Liga l1',
    sport: 'padel',
    url: '/l/l1/juegos?partido=m1',
    ...extra,
  });

  it('seguidores: uno por persona, lleva a su perfil', () => {
    const out = socialNoticesFromRows([{ kind: 'follow', at: iso(now - HOUR), userId: 'u9', name: 'Ana Pérez' }]);
    expect(out).toEqual([
      { id: 'seguir:u9', kind: 'social', icon: 'follow', title: 'Ana Pérez te empezó a seguir', body: 'Toca para ver su perfil.', url: '/u/u9', at: now - HOUR },
    ]);
  });

  it('me gusta: uno por juego con todos, la hora del más nuevo y su liga y deporte', () => {
    const out = socialNoticesFromRows([
      like('u2', 'Pedro Díaz', now - HOUR),
      like('u3', 'Rosa', now - 2 * HOUR),
      like('u4', 'Luis', now - 3 * HOUR),
      like('u5', 'Juan', now - 4 * HOUR, { gameKind: 'golf', id: 'c1', url: '/l/l1/e/e1' }),
    ]);
    expect(out.map((g) => [g.id, g.title, g.url, g.at, g.lid, g.sport])).toEqual([
      ['gusta:match:m1', 'A Pedro y 2 más les gustó tu partido', '/l/l1/juegos?partido=m1', now - HOUR, 'l1', 'padel'],
      ['gusta:golf:c1', 'A Juan le gustó tu ronda', '/l/l1/e/e1', now - 4 * HOUR, 'l1', 'padel'],
    ]);
    // Con la liga entre las de la cuenta, sale como las demás: en Social, con su liga y su deporte.
    const [first] = buildNotices([], [league('l1')], today, now, null, out);
    expect(first).toMatchObject({ id: 'gusta:match:m1', category: 'social', lid: 'l1', leagueName: 'Liga Norte', icon: 'like', to: '/l/l1/juegos?partido=m1' });
  });

  it('lo dañado se salta; una ruta de afuera no se usa', () => {
    expect(socialNoticesFromRows(null)).toEqual([]);
    expect(socialNoticesFromRows({ kind: 'follow' })).toEqual([]);
    const out = socialNoticesFromRows([
      null,
      'x',
      { kind: 'follow', at: 'ayer', userId: 'u1', name: 'A' },
      { kind: 'follow', at: iso(now), name: 'Sin id' },
      { kind: 'otro', at: iso(now), userId: 'u1' },
      like('u2', 'Pedro', now, { id: null }),
      like('u3', '', now, { url: 'https://otro.sitio' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: 'A Alguien le gustó tu partido', url: '/l/l1/juegos' });
  });
});

describe('página de avisos: filtros y grupos', () => {
  const n = (id: string, category: Notice['category'], sport: string | null, time = now): Notice => ({
    id,
    kind: category === 'social' ? 'social' : 'torneo',
    category,
    sport,
    title: id,
    body: '',
    lid: sport ? 'l1' : '',
    leagueName: sport ? 'Liga' : '',
    leagueKind: 'liga',
    private: false,
    to: '/',
    time,
  });

  it('filtra por tipo y por deporte; lo que no es de ningún deporte sale en todos', () => {
    const items = [n('a', 'partidos', 'padel'), n('b', 'ligas', 'bowling'), n('c', 'social', null), n('d', 'admin', 'padel')];
    const ids = (list: Notice[]) => list.map((x) => x.id);
    expect(ids(filterNotices(items, 'todo', null))).toEqual(['a', 'b', 'c', 'd']);
    expect(ids(filterNotices(items, 'partidos', null))).toEqual(['a']);
    expect(ids(filterNotices(items, 'todo', 'padel'))).toEqual(['a', 'c', 'd']);
    expect(ids(filterNotices(items, 'social', 'bowling'))).toEqual(['c']);
    expect(ids(filterNotices(items, 'admin', 'bowling'))).toEqual([]);
    expect(NOTICE_FILTERS.map((f) => f.label)).toEqual(['Todo', 'Partidos y resultados', 'Mis ligas', 'Social', 'Admin']);
    expect(isNoticeFilter('social')).toBe(true);
    expect(isNoticeFilter('otra')).toBe(false);
  });

  it('agrupa por Hoy, Esta semana (6 días de antes) y Antes, sin grupos vacíos', () => {
    const midnight = new Date(2026, 8, 25).getTime();
    const items = [
      n('hoy', 'ligas', 'bowling', midnight + HOUR),
      n('medianoche', 'ligas', 'bowling', midnight),
      n('ayer', 'ligas', 'bowling', midnight - 1),
      n('hace6', 'ligas', 'bowling', new Date(2026, 8, 19).getTime()),
      n('hace7', 'ligas', 'bowling', new Date(2026, 8, 19).getTime() - 1),
    ];
    expect(groupNotices(items, now).map((g) => [g.label, g.items.map((x) => x.id)])).toEqual([
      ['Hoy', ['hoy', 'medianoche']],
      ['Esta semana', ['ayer', 'hace6']],
      ['Antes', ['hace7']],
    ]);
    expect(groupNotices([items[4]], now).map((g) => g.id)).toEqual(['antes']);
    expect(groupNotices([], now)).toEqual([]);
  });
});

describe('página de avisos: leídos, sin leer y el número de la campana', () => {
  const a = { id: 'a', time: 1000 };
  const b = { id: 'b', time: 2000 };
  const c = { id: 'c', time: 3000 };
  const items = [c, b, a] as Notice[];

  it('abrir uno lo marca leído; si vuelve con una hora nueva (otro me gusta), sale sin leer otra vez', () => {
    const s1 = markNoticeRead(EMPTY_READ_STATE, b);
    expect(isNoticeUnread(b, s1)).toBe(false);
    expect(isNoticeUnread(a, s1)).toBe(true);
    expect(unreadCount(items, s1)).toBe(2);
    // Ya leído: el mismo estado (no se vuelve a guardar).
    expect(markNoticeRead(s1, b)).toBe(s1);
    expect(isNoticeUnread({ id: 'b', time: 2500 }, s1)).toBe(true);
  });

  it('marcar todo: hasta el más nuevo (hora del servidor), nunca hacia atrás; o solo los que se ven', () => {
    const all = markAllNoticesRead(markNoticeRead(EMPTY_READ_STATE, b), items, 99_999);
    expect(all).toEqual({ readAt: 3000, seenAt: 3000, reads: {} });
    expect(unreadCount(items, all)).toBe(0);
    expect(markAllNoticesRead({ readAt: 5000, seenAt: 5000, reads: {} }, items, 99_999).readAt).toBe(5000);
    // Sin avisos: hasta ahora.
    expect(markAllNoticesRead(EMPTY_READ_STATE, [], 7000).readAt).toBe(7000);
    const some = markNoticesRead(EMPTY_READ_STATE, [a, c]);
    expect(items.filter((x) => isNoticeUnread(x, some)).map((x) => x.id)).toEqual(['b']);
    expect(markNoticesRead(some, [a])).toBe(some);
  });

  it('entrar a la página quita el número de la campana, pero lo sin leer sigue con su punto', () => {
    expect(badgeCount(items, EMPTY_READ_STATE)).toBe(3);
    const seen = markNoticesSeen(EMPTY_READ_STATE, items);
    expect(seen.seenAt).toBe(3000);
    expect(badgeCount(items, seen)).toBe(0);
    expect(unreadCount(items, seen)).toBe(3);
    expect(markNoticesSeen(seen, items)).toBe(seen);
    // Llega uno nuevo: el número vuelve a 1.
    expect(badgeCount([{ id: 'd', time: 4000 } as Notice, ...items], seen)).toBe(1);
    // Lo abierto no cuenta aunque sea nuevo.
    expect(badgeCount(items, markNoticeRead(EMPTY_READ_STATE, c))).toBe(2);
  });

  it('lo abierto uno a uno que ya cubre «todo leído» se olvida', () => {
    const s = markNoticesRead(EMPTY_READ_STATE, [a, b, c]);
    expect(Object.keys(markAllNoticesRead(s, [b], 0).reads)).toEqual(['c']);
  });
});

describe('página de avisos: lo leído se guarda en el teléfono, por cuenta', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('se guarda y se lee igual; cada cuenta el suyo', () => {
    const s = { readAt: 1000, seenAt: 2500, reads: { x: 2000, viejo: 500 } };
    saveReadState('u1', s);
    expect(loadReadState('u1')).toEqual({ readAt: 1000, seenAt: 2500, reads: { x: 2000 } });
    expect(loadReadState('u2')).toEqual(EMPTY_READ_STATE);
    expect(loadReadState(null)).toEqual(EMPTY_READ_STATE);
  });

  it('quien viene de la campana de antes: lo que ya vio queda leído y visto', () => {
    store.set('mm:avisos-vistos:u1', '1234');
    expect(loadReadState('u1')).toEqual({ readAt: 1234, seenAt: 1234, reads: {} });
  });

  it('lo guardado dañado no rompe nada (y no se pierde lo demás)', () => {
    store.set('mm:avisos-vistos:u1', '1000');
    store.set('mm:avisos-leidos:u1', '{no es json');
    expect(loadReadState('u1')).toEqual({ readAt: 1000, seenAt: 1000, reads: {} });
    store.set('mm:avisos-leidos:u1', JSON.stringify({ a: 2000, b: 'x', c: null }));
    expect(loadReadState('u1').reads).toEqual({ a: 2000 });
  });

  it('sin almacenamiento: nada leído y guardar no falla', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
      removeItem: () => undefined,
    });
    expect(loadReadState('u1')).toEqual(EMPTY_READ_STATE);
    expect(() => saveReadState('u1', { readAt: 1, seenAt: 1, reads: {} })).not.toThrow();
  });
});
