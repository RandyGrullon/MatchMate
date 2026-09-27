import { describe, expect, it } from 'vitest';
import type { LeagueFeed } from './data';
import { eventLabel, formatDate } from './format';
import { buildNotices, relativeTime } from './notifications';
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
