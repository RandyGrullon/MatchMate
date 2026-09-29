import { describe, expect, it } from 'vitest';
import { pendingTotal, suspendChanges, toLeaguePending, toSuspendPreview, toSuspendResult, type LeaguePending } from '../../lib/data/organizer';
import {
  checklistSteps,
  dayWords,
  pendingLine,
  pendingSections,
  showPendingCard,
  suspendCounts,
  suspendDoneText,
  suspendLines,
  suspendNotice,
  suspendReasons,
} from './logic';

const L = 'L1';
const now = Date.parse('2026-09-28T16:00:00.000Z');

/** Lo que manda league_pending (con lo que se pase encima). */
function raw(over: Record<string, unknown> = {}) {
  const empty = (url: string) => ({ count: 0, url, items: [] });
  return {
    total: 0,
    submissions: empty(`/l/${L}/admin?tab=aprobar`),
    disputes: empty(`/l/${L}/juegos`),
    overdue: empty(`/l/${L}/juegos`),
    claims: empty(`/l/${L}/admin?tab=reclamos`),
    waitlists: empty(`/l/${L}`),
    checklist: null,
    ...over,
  };
}

const full = (): LeaguePending =>
  toLeaguePending(
    raw({
      submissions: {
        count: 7,
        url: `/l/${L}/admin?tab=aprobar`,
        items: [
          { id: 's1', playerId: 'p1', playerName: 'Ana', eventId: 'e1', eventName: 'Práctica', date: '2026-09-22', games: 3, hasPhoto: true, createdAt: '2026-09-28T14:00:00.000Z' },
        ],
      },
      disputes: {
        count: 1,
        url: `/l/${L}/juegos`,
        items: [
          { id: 'm1', label: 'Tigres vs Águilas', sides: ['Tigres', 'Águilas'], scheduledAt: '2026-09-27T23:00:00.000Z', disputedAt: '2026-09-28T15:00:00.000Z', note: 'Fue 3-2', url: `/l/${L}/juegos?partido=m1` },
        ],
      },
      overdue: {
        count: 1,
        url: `/l/${L}/juegos`,
        items: [{ id: 'm2', label: 'Ana / Luis vs Beto / Carla', sides: [], status: 'scheduled', scheduledAt: '2026-09-27T23:30:00.000Z', url: `/l/${L}/juegos?partido=m2` }],
      },
      claims: {
        count: 1,
        url: `/l/${L}/admin?tab=reclamos`,
        items: [{ id: 'c1', playerId: 'p9', playerName: 'Pedro', claimantName: 'pedrito', note: null, createdAt: '2026-09-28T10:00:00.000Z' }],
      },
      waitlists: {
        count: 1,
        url: `/l/${L}`,
        items: [{ eventId: 'e5', name: 'Americano del sábado', date: '2026-10-03', waiting: 2, url: `/l/${L}/e/e5` }],
      },
    }),
    L,
  );

describe('pendientes: lo que manda la base', () => {
  it('normaliza y suma (sin fiarse del total) y no convierte las horas', () => {
    const p = full();
    expect(p.total).toBe(11);
    expect(p.submissions.items[0]).toEqual({
      id: 's1',
      playerId: 'p1',
      playerName: 'Ana',
      eventId: 'e1',
      eventName: 'Práctica',
      date: '2026-09-22',
      games: 3,
      hasPhoto: true,
      sentAt: '2026-09-28T14:00:00.000Z',
    });
    expect(p.claims.items[0].requestedAt).toBe('2026-09-28T10:00:00.000Z');
  });

  it('algo raro o incompleto no rompe la pantalla; los enlaces solo a rutas de la app', () => {
    const p = toLeaguePending({ submissions: { count: '2', url: 'https://malo.com', items: 'x' } }, L);
    expect(p.submissions).toEqual({ count: 2, url: `/l/${L}/admin?tab=aprobar`, items: [] });
    expect(p.disputes.count).toBe(0);
    expect(p.checklist).toBeNull();
    expect(p.total).toBe(2);
    expect(toLeaguePending(null, L).total).toBe(0);
    expect(toLeaguePending(raw({ waitlists: { count: 1, url: '//otro', items: [{ eventId: 'e', url: 'javascript:alert(1)' }] } }), L).waitlists.items[0].url).toBe(`/l/${L}`);
  });

  it('el número de Admin usa los envíos y reclamos en vivo si se pasan', () => {
    const p = full();
    expect(pendingTotal(p)).toBe(11);
    expect(pendingTotal(p, { submissions: 2, claims: 0 })).toBe(5);
    expect(pendingTotal(null, { submissions: 2, claims: 1 })).toBe(3);
    expect(pendingTotal(null)).toBe(0);
  });

  it('secciones en palabras, en orden, solo las que tienen algo', () => {
    const s = pendingSections(full(), now, 'America/Santo_Domingo');
    expect(s.map((x) => [x.key, x.title, x.count])).toEqual([
      ['submissions', 'Juegos por aprobar', 7],
      ['disputes', 'Resultados reclamados', 1],
      ['overdue', 'Partidos sin resultado', 1],
      ['claims', 'Reclamos de jugadores', 1],
      ['waitlists', 'Listas de espera', 1],
    ]);
    expect(s[0].items[0]).toEqual({ id: 's1', title: 'Ana', sub: '3 juegos · Práctica · con foto · hace 2 h', url: `/l/${L}/admin?tab=aprobar` });
    expect(s[1].items[0]).toEqual({ id: 'm1', title: 'Tigres vs Águilas', sub: '«Fue 3-2» · reclamado hace 1 h', url: `/l/${L}/juegos?partido=m1` });
    // 23:30 UTC = 7:30 pm en Santo Domingo.
    expect(s[2].items[0].sub).toBe('Era el domingo 27 de septiembre a las 7:30 pm');
    expect(s[3].items[0].title).toBe('pedrito dice que es Pedro');
    expect(s[4].items[0].sub).toBe('2 en espera · sábado 3 de octubre');
    expect(pendingSections(toLeaguePending(raw(), L), now)).toEqual([]);
    expect(pendingSections(null, now)).toEqual([]);
  });

  it('la línea del inicio y cuándo sale la tarjeta', () => {
    expect(pendingLine(full())).toBe('7 juegos por aprobar · 1 resultado reclamado · 1 partido sin resultado y más');
    const one = toLeaguePending(raw({ claims: { count: 1, url: '/l/L1/admin?tab=reclamos', items: [] } }), L);
    expect(pendingLine(one)).toBe('1 reclamo por revisar');
    expect(showPendingCard(one)).toBe(true);
    const steps = [
      { key: 'invite', label: 'Invita a alguien a la liga', done: true, url: `/l/${L}/admin?tab=miembros` },
      { key: 'players', label: 'Agrega a los jugadores', done: false, url: `/l/${L}/admin?tab=jugadores` },
      { key: 'schedule', label: 'Crea el primer evento o partido', done: false, url: `/l/${L}` },
      { key: 'result', label: 'Anota el primer resultado', done: false, url: `/l/${L}` },
    ];
    const young = toLeaguePending(raw({ checklist: { complete: false, done: 1, total: 4, steps } }), L);
    expect(pendingLine(young)).toBe('Primeros pasos: 1 de 4');
    expect(showPendingCard(young)).toBe(true);
    const done = toLeaguePending(raw({ checklist: { steps: steps.map((s) => ({ ...s, done: true })) } }), L);
    expect(done.checklist).toMatchObject({ complete: true, done: 4, total: 4 });
    expect(showPendingCard(done)).toBe(false);
    expect(pendingLine(done)).toBe('');
    expect(showPendingCard(null)).toBe(false);
  });

  it('primeros pasos: invitar lleva a «Liga» y los jugadores a la pestaña de gente del deporte', () => {
    const c = toLeaguePending(
      raw({
        checklist: {
          steps: [
            { key: 'invite', label: 'Invita', done: false, url: `/l/${L}/admin?tab=miembros` },
            { key: 'players', label: 'Jugadores', done: false, url: `/l/${L}/admin?tab=jugadores` },
          ],
        },
      }),
      L,
    ).checklist;
    expect(checklistSteps(c, L).map((s) => s.url)).toEqual([`/l/${L}/admin?tab=liga`, `/l/${L}/admin?tab=jugadores`]);
    expect(checklistSteps(c, L, { playersTab: 'nadadores' }).map((s) => s.url)).toEqual([`/l/${L}/admin?tab=liga`, `/l/${L}/admin?tab=nadadores`]);
    expect(checklistSteps(null, L)).toEqual([]);
  });
});

describe('suspender un día', () => {
  const preview = toSuspendPreview(
    {
      date: '2026-09-29',
      matches: [{ id: 'm1', label: 'A vs B', sub: 'team', status: 'scheduled', scheduledAt: '2026-09-29T23:00:00.000Z', locked: false, reason: null }],
      events: [
        { id: 'e1', label: 'Práctica', sub: 'bowling', startTime: '19:00', locked: false, reason: null, content: false },
        { id: 'e2', label: 'Torneo', sub: 'bowling', startTime: null, locked: false, reason: null, content: true },
        { id: 'e3', label: 'Ronda', sub: 'golf', startTime: null, locked: true, reason: 'con_resultado', content: true },
      ],
      counts: { matches: 1, bowlingEvents: 2, golfRounds: 0, swimMeets: 0, otherEvents: 0, locked: 1 },
      withNewDate: { matches: 1, events: 2 },
      withoutDate: { postponed: 1, cancelled: 1, kept: 1 },
    },
    '2026-09-29',
  );

  it('días en palabras (como el aviso de la base)', () => {
    expect(dayWords('2026-09-29')).toBe('martes 29 de septiembre');
    expect(dayWords('2026-10-03')).toBe('sábado 3 de octubre');
  });

  it('el aviso que va a salir', () => {
    expect(suspendNotice('2026-09-29', ' Lluvia. ', '2026-10-06')).toBe('Se suspende el martes 29 de septiembre: Lluvia. Nueva fecha: martes 6 de octubre.');
    expect(suspendNotice('2026-09-29', 'No hay luz', null)).toBe('Se suspende el martes 29 de septiembre: No hay luz. La nueva fecha se avisará.');
  });

  it('lo que hay ese día y lo que va a pasar, con y sin nueva fecha', () => {
    expect(preview.events[2]).toMatchObject({ locked: true, reason: 'con_resultado' });
    expect(suspendCounts(preview)).toEqual(['1 partido', '2 eventos de boliche']);
    expect(suspendLines(preview, '2026-10-06')).toEqual([
      '1 partido pasa al martes 6 de octubre, a la misma hora.',
      '2 eventos pasan al martes 6 de octubre.',
      '1 ya empezó o tiene resultados: no se toca.',
    ]);
    expect(suspendLines(preview, null)).toEqual([
      '1 partido queda aplazado hasta que les pongas fecha.',
      '1 evento se cancela (no tenía nadie inscrito).',
      '1 evento se queda en su fecha porque ya tiene gente anotada: ponle una nueva fecha para moverlo.',
      '1 ya empezó o tiene resultados: no se toca.',
    ]);
    expect(toSuspendPreview(null, '2026-09-29')).toMatchObject({ date: '2026-09-29', matches: [], events: [], counts: { matches: 0, locked: 0 } });
  });

  it('el aviso de listo', () => {
    const base = { date: '2026-09-29', locked: 0, body: '' };
    expect(
      suspendDoneText(
        toSuspendResult({ ...base, newDate: '2026-10-06', matches: { moved: 2, postponed: 0 }, events: { moved: 1, cancelled: 0, kept: 0 }, announced: true, recipients: 12 }),
      ),
    ).toBe('Pasan al martes 6 de octubre: 2 partidos y 1 evento; aviso enviado a 12 miembros.');
    expect(
      suspendDoneText(toSuspendResult({ ...base, newDate: null, matches: { moved: 0, postponed: 3 }, events: { moved: 0, cancelled: 1, kept: 1 }, announced: true, recipients: 0 })),
    ).toBe('3 partidos aplazados y 1 evento cancelado; aviso publicado en el inicio.');
    // Por qué no salió el aviso: el límite del día, el mismo aviso hace un momento, o no se sabe.
    const postponed = { ...base, newDate: null, matches: { moved: 0, postponed: 2 }, events: {}, announced: false };
    expect(suspendDoneText(toSuspendResult({ ...postponed, skipped: 'limite' }))).toBe('2 partidos aplazados; el aviso no salió (ya se mandaron los de hoy).');
    expect(suspendDoneText(toSuspendResult({ ...postponed, skipped: 'duplicado' }))).toBe('2 partidos aplazados; el mismo aviso ya había salido hace un momento.');
    expect(suspendDoneText(toSuspendResult(postponed))).toBe(
      '2 partidos aplazados; no se mandó otro aviso (ya salió uno igual o se llegó al límite de hoy).',
    );
    // Nada cambió (la base tampoco manda el aviso): no dice «Día suspendido».
    expect(suspendDoneText(toSuspendResult({ ...base, newDate: null, matches: {}, events: { kept: 1 }, announced: false, skipped: 'nada' }))).toBe(
      'No había nada que mover ese día; no se mandó ningún aviso.',
    );
  });

  it('sin nueva fecha, lo que tiene gente anotada se queda: si es lo único, no hay nada que suspender', () => {
    const only = (withoutDate: { postponed: number; cancelled: number; kept: number }) =>
      toSuspendPreview({ counts: { bowlingEvents: 1 }, withNewDate: { matches: 0, events: 1 }, withoutDate }, '2026-09-29');
    const kept = only({ postponed: 0, cancelled: 0, kept: 1 });
    expect(suspendChanges(kept, null)).toBe(0);
    expect(suspendChanges(kept, '2026-10-06')).toBe(1);
    expect(suspendChanges(only({ postponed: 1, cancelled: 1, kept: 1 }), null)).toBe(2);
    expect(suspendChanges(null, null)).toBe(0);
  });

  it('motivos listos según el deporte', () => {
    expect(suspendReasons('bowling')).toContain('La bolera está cerrada');
    expect(suspendReasons('padel')).toContain('La cancha está ocupada');
    expect(suspendReasons('swimming')[0]).toBe('Lluvia');
  });
});
