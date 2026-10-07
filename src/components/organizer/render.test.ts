/**
 * Las piezas del organizador dibujadas sin navegador (renderToString), con los datos de mentira: la pestaña
 * «Pendientes» (secciones, «Todo al día», primeros pasos), el aviso del inicio (al NoticeSlot) y «Hoy · Suspender».
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toLeaguePending, toSuspendPreview, type LeaguePending, type SuspendPreview } from '../../lib/data/organizer';
import { LeagueContext, type LeagueCtx } from '../../lib/league';
import { FeedbackProvider } from '../feedback';
import { PendingHomeCard, PendingPanel, pendingNotice } from './Pending';
import { SuspendTodayCard } from './SuspendDay';

const data = vi.hoisted(() => ({ pending: null as LeaguePending | null, preview: null as SuspendPreview | null, asked: [] as unknown[] }));
vi.mock('../../lib/data/organizer', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/organizer')>()),
  useLeaguePending: (lid: string | null) => {
    data.asked.push(['pending', lid]);
    return { data: lid ? data.pending : null, loading: false, error: null };
  },
  useSuspendPreview: (lid: string | null, date: string | null) => {
    data.asked.push(['suspend', lid, date]);
    return { data: lid && date ? data.preview : null, loading: false, error: null };
  },
}));

// El lugar del aviso y lo que se le propone (sin navegador los efectos no corren: se anota con qué se llamó).
const notices = vi.hoisted(() => ({ proposed: [] as unknown[], pro: [] as unknown[] }));
vi.mock('../NoticeSlot', () => ({
  NoticeSlot: () => '[aviso]',
  useNotice: (n: unknown) => void notices.proposed.push(n),
}));
vi.mock('../mode', () => ({ useProSuggestion: (copy: unknown) => void notices.pro.push(copy) }));

const ctx = (isAdmin = true): LeagueCtx => ({
  lid: 'L1',
  league: {
    id: 'L1',
    name: 'Liga del Club',
    kind: 'liga',
    visibility: 'private',
    ownerUid: 'u1',
    venue: '',
    schedule: '',
    seasonStart: '',
    seasonEnd: '',
    contactName: '',
    contactPhone: '',
    requirePhoto: false,
    sport: 'padel',
    tz: 'America/Santo_Domingo',
  },
  member: { id: 'L1_u1', leagueId: 'L1', uid: 'u1', name: 'Rosa', role: isAdmin ? 'owner' : 'member', playerId: 'p1' },
  isAdmin,
  isOwner: isAdmin,
  isScorer: false,
  canScore: isAdmin,
  myPlayerId: 'p1',
  base: '/l/L1',
});

const render = (node: ReactNode, isAdmin = true) =>
  renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, h(LeagueContext.Provider, { value: ctx(isAdmin) }, node))));

const empty = (url: string) => ({ count: 0, url, items: [] });
const base = {
  submissions: empty('/l/L1/admin?tab=aprobar'),
  disputes: empty('/l/L1/juegos'),
  overdue: empty('/l/L1/juegos'),
  claims: empty('/l/L1/admin?tab=reclamos'),
  waitlists: empty('/l/L1'),
  checklist: null,
};

beforeEach(() => {
  data.pending = null;
  data.preview = null;
  data.asked.length = 0;
  notices.proposed.length = 0;
  notices.pro.length = 0;
});

describe('Admin › Pendientes', () => {
  it('cada sección con sus enlaces, «Ver los N» y «Suspender un día»', () => {
    data.pending = toLeaguePending(
      {
        ...base,
        disputes: {
          count: 6,
          url: '/l/L1/juegos',
          items: [{ id: 'm1', label: 'Ana / Luis vs Beto / Carla', note: 'Fue 6-4', url: '/l/L1/juegos?partido=m1' }],
        },
        claims: { count: 1, url: '/l/L1/admin?tab=reclamos', items: [{ id: 'c1', playerName: 'Pedro', claimantName: 'pedrito' }] },
      },
      'L1',
    );
    const out = render(h(PendingPanel));
    expect(out).toContain('Resultados reclamados');
    expect(out).toContain('href="/l/L1/juegos?partido=m1"');
    expect(out).toContain('Ver los 6');
    expect(out).toContain('pedrito dice que es Pedro');
    expect(out).toContain('href="/l/L1/admin?tab=reclamos"');
    expect(out).toContain('Suspender un día');
    expect(out).not.toContain('Todo al día');
  });

  it('sin nada: «Todo al día»; liga nueva: los primeros pasos con los enlaces de esta app', () => {
    data.pending = toLeaguePending(
      {
        ...base,
        checklist: {
          steps: [
            { key: 'invite', label: 'Invita a alguien a la liga', done: true, url: '/l/L1/admin?tab=miembros' },
            { key: 'players', label: 'Agrega a los jugadores', done: false, url: '/l/L1/admin?tab=jugadores' },
          ],
        },
      },
      'L1',
    );
    const out = render(h(PendingPanel, { playersTab: 'parejas' }));
    expect(out).toContain('Todo al día');
    expect(out).toContain('Primeros pasos');
    expect(out).toContain('1<!-- --> de <!-- -->2<!-- --> listos');
    expect(out).toContain('href="/l/L1/admin?tab=parejas"');
    // Lo hecho no es enlace.
    expect(out).not.toContain('href="/l/L1/admin?tab=liga"');
  });

  it('mientras carga, el esqueleto (no «Todo al día»)', () => {
    const out = render(h(PendingPanel));
    expect(out).toContain('skeleton');
    expect(out).not.toContain('Todo al día');
  });
});

describe('inicio de la liga', () => {
  it('lo pendiente es el aviso más importante (admin), con «Ver» a Pendientes; vuelve si llega algo más', () => {
    const p = toLeaguePending({ ...base, submissions: { count: 2, url: '/l/L1/admin?tab=aprobar', items: [] } }, 'L1');
    expect(pendingNotice(p, 'L1', '/l/L1', 'liga')).toEqual({
      id: 'pendientes:L1:2',
      kind: 'admin',
      title: '2 juegos por aprobar',
      action: { label: 'Ver', to: '/l/L1/admin?tab=pendientes' },
    });
    const more = toLeaguePending({ ...base, submissions: { count: 3, url: '/l/L1/admin?tab=aprobar', items: [] } }, 'L1');
    expect(pendingNotice(more, 'L1', '/l/L1', 'liga')?.id).toBe('pendientes:L1:3');
  });

  it('liga nueva sin pendientes: los primeros pasos como pista; sin nada, ningún aviso', () => {
    const young = toLeaguePending(
      {
        ...base,
        checklist: {
          steps: [
            { key: 'invite', label: 'Invita a alguien', done: true, url: '/l/L1/admin?tab=miembros' },
            { key: 'players', label: 'Agrega a los jugadores', done: false, url: '/l/L1/admin?tab=jugadores' },
          ],
        },
      },
      'L1',
    );
    expect(pendingNotice(young, 'L1', '/l/L1', 'liga')).toEqual({
      id: 'primeros-pasos:L1:1',
      kind: 'tip',
      title: 'Tu liga nueva',
      text: 'Primeros pasos: 1 de 2',
      action: { label: 'Seguir', to: '/l/L1/admin?tab=pendientes' },
    });
    expect(pendingNotice(young, 'T1', '/l/T1', 'torneo')?.title).toBe('Tu torneo nuevo');
    expect(pendingNotice(toLeaguePending(base, 'L1'), 'L1', '/l/L1', 'liga')).toBeNull();
    expect(pendingNotice(null, 'L1', '/l/L1', 'liga')).toBeNull();
  });

  it('quien organiza: su lugar del aviso, con lo pendiente y la sugerencia de Pro; un jugador, nada', () => {
    data.pending = toLeaguePending({ ...base, submissions: { count: 2, url: '/l/L1/admin?tab=aprobar', items: [] } }, 'L1');
    expect(render(h(PendingHomeCard))).toContain('[aviso]');
    expect(notices.proposed).toContainEqual(expect.objectContaining({ id: 'pendientes:L1:2', kind: 'admin' }));
    expect(notices.pro).toContainEqual({ title: 'Organizas esta liga', enabled: true });
    notices.proposed.length = 0;
    notices.pro.length = 0;
    expect(render(h(PendingHomeCard), false)).not.toContain('[aviso]');
    expect(notices.proposed.every((n) => !n)).toBe(true);
    expect(notices.pro).toContainEqual({ title: 'Organizas esta liga', enabled: false });
    // Un jugador ni siquiera lo pide.
    expect(data.asked).toContainEqual(['pending', null]);
  });

  it('«Hoy · Suspender» solo si hoy hay algo que se pueda suspender', () => {
    data.preview = toSuspendPreview(
      { counts: { matches: 3, bowlingEvents: 0, golfRounds: 0, swimMeets: 0, otherEvents: 1, locked: 0 } },
      '2026-09-28',
    );
    const out = render(h(SuspendTodayCard));
    expect(out).toContain('3 partidos · 1 evento');
    expect(out).toContain('Suspender');
    data.preview = toSuspendPreview({ counts: { matches: 0, locked: 2 } }, '2026-09-28');
    expect(render(h(SuspendTodayCard))).not.toContain('Suspender');
  });
});
