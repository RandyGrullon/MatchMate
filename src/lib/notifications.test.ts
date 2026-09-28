import { describe, expect, it } from 'vitest';
import type { LeagueFeed } from './data';
import type { ChallengeNotice, MatchNoticeFeed, NightNotice, NoticeMatch } from './data/matchNotices';
import { eventLabel, formatDate } from './format';
import { BOWLING_NOTIFICATIONS_TEXT, buildMatchNotices, buildNotices, emptyNoticesText, notificationsText, relativeTime } from './notifications';
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
