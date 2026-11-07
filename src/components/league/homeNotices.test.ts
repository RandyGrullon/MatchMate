import { describe, expect, it } from 'vitest';
import { toLeaguePending } from '../../lib/data/organizer';
import { leaguePendingNotice, leagueProCopy, organizesRow } from './homeNotices';

const L = 'L1';
/** Lo que manda league_pending (con lo que se pase encima). */
const raw = (over: Record<string, unknown> = {}) => {
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
};

describe('el aviso del inicio de la liga (Lite)', () => {
  it('sin nada pendiente ni primeros pasos, nada', () => {
    expect(leaguePendingNotice(null, L, 'liga')).toBeNull();
    expect(leaguePendingNotice(toLeaguePending(raw(), L), L, 'liga')).toBeNull();
  });

  it('lo pendiente lleva a Organizar de la liga; el id cambia con el número', () => {
    const p = toLeaguePending(raw({ submissions: { count: 2, url: `/l/${L}/admin?tab=aprobar`, items: [] } }), L);
    const n = leaguePendingNotice(p, L, 'liga');
    expect(n).toMatchObject({ id: `pendientes:${L}:2`, kind: 'admin', action: { label: 'Ver', to: `/organizar?liga=${L}` } });
    expect(n?.title).toContain('2');
  });

  it('la liga nueva: los primeros pasos, como pista', () => {
    const steps = [
      { key: 'invite', label: 'Invita a alguien a la liga', done: true, url: `/l/${L}/admin?tab=miembros` },
      { key: 'players', label: 'Agrega a los jugadores', done: true, url: `/l/${L}/admin?tab=jugadores` },
      { key: 'schedule', label: 'Crea el primer evento o partido', done: false, url: `/l/${L}` },
      { key: 'result', label: 'Anota el primer resultado', done: false, url: `/l/${L}` },
    ];
    const p = toLeaguePending(raw({ checklist: { steps } }), L);
    expect(leaguePendingNotice(p, L, 'torneo')).toMatchObject({
      id: `primeros-pasos:${L}:2`,
      kind: 'tip',
      title: 'Tu torneo nuevo',
      text: 'Primeros pasos: 2 de 4',
      action: { label: 'Seguir', to: `/organizar?liga=${L}` },
    });
  });
});

describe('Pro y Lite en el inicio de la liga', () => {
  it('la sugerencia: el boliche con el texto de siempre; los otros deportes, resultados y ajustes', () => {
    expect(leagueProCopy('liga', true)).toEqual({ title: 'Organizas esta liga', text: undefined });
    expect(leagueProCopy('torneo', false)).toEqual({ title: 'Organizas este torneo', text: 'Resultados y ajustes en Pro' });
  });

  it('la fila «Organizas esta liga»: lo que espera o qué hay ahí', () => {
    expect(organizesRow('liga', true, '', '/l/L1')).toEqual({ title: 'Organizas esta liga', subtitle: 'Jugadores, fechas y ajustes', to: '/l/L1/admin' });
    expect(organizesRow('torneo', false, '', '/l/L1')).toEqual({ title: 'Organizas este torneo', subtitle: 'Gente, fechas y ajustes', to: '/l/L1/admin' });
    expect(organizesRow('torneo', true, '3 por aprobar', '/l/L1').title).toBe('Organizas esta liga');
    expect(organizesRow('liga', false, '3 por aprobar', '/l/L1').subtitle).toBe('3 por aprobar');
  });
});
