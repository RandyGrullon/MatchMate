/**
 * Lo de los anotadores que no necesita la base: la invitación de anotador en la campana, las rutas que manda la base
 * (siempre dentro de una liga), buscar el link de un torneo, los errores en palabras y el tiempo real 'scorers'.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BLOCKED_MESSAGE } from '../backend/errors';
import { BackendError } from '../backend/types';
import { queryClient } from './client';
import { inviteNotices, scorerInviteLine, type LeagueInvite } from './invites';
import {
  getScorerLinkPreview,
  inviteScorers,
  joinAsScorer,
  leaguePathOr,
  linkFor,
  normalizeScorerCode,
  scorerErrorText,
  scorerJoinErrorText,
  scorerLinkUrl,
  toScorerLink,
  type ScorerLink,
} from './scorers';
import { handleMessage } from './topics';

const invite = (over: Partial<LeagueInvite> = {}): LeagueInvite => ({
  id: 'i1',
  leagueId: 'L1',
  leagueName: 'Liga de los martes',
  logoPath: null,
  sport: 'bowling',
  kind: 'liga',
  visibility: 'private',
  members: 12,
  invitedBy: { id: 'u-ana', name: 'Ana Pérez', username: 'anaperez' },
  createdAt: '2026-09-28T10:00:00.000Z',
  ...over,
});

const scorer = { title: 'Copa Aniversario', scope: 'evento' as const, refId: 'E1', path: '/l/L1/e/E1', asPlayer: false };

describe('la invitación de anotador en la campana', () => {
  it('«Ana te invitó a anotar en Copa Aniversario»; no lo inscribe (o también a jugar)', () => {
    const [n] = inviteNotices([invite({ scorer })]);
    expect(n).toMatchObject({
      id: 'invitacion:i1',
      title: 'Ana Pérez te invitó a anotar en Copa Aniversario',
      body: 'Toca para ver la invitación. No te inscribe como jugador.',
      url: '/invitacion/i1',
    });
    expect(inviteNotices([invite({ scorer: { ...scorer, asPlayer: true } })])[0].body).toBe('También te invitó a jugar. Toca para ver la invitación.');
  });

  it('sin quien invitó o sin título', () => {
    expect(scorerInviteLine({ invitedBy: null, leagueName: 'Liga', scorer })).toBe('Te invitaron a anotar en Copa Aniversario');
    expect(scorerInviteLine({ invitedBy: null, leagueName: 'Liga', scorer: { title: '' } })).toBe('Te invitaron a anotar en Liga');
  });
});

describe('rutas, códigos y links', () => {
  it('la ruta de la base solo si es de la app y de una liga', () => {
    expect(leaguePathOr('/l/L1/e/E1', 'L1')).toBe('/l/L1/e/E1');
    expect(leaguePathOr('/l/L1/playoffs', 'L1')).toBe('/l/L1/playoffs');
    expect(leaguePathOr('https://otro.sitio/l/x', 'L1')).toBe('/l/L1');
    expect(leaguePathOr('//otro.sitio', 'L1')).toBe('/l/L1');
    expect(leaguePathOr('/perfil', 'L1')).toBe('/l/L1');
    expect(leaguePathOr(null, 'L1')).toBe('/l/L1');
  });

  it('el código como lo mira la base y el link para compartir', () => {
    expect(normalizeScorerCode(' abcdefgh23 ')).toBe('ABCDEFGH23');
    expect(scorerLinkUrl('https://matchmate.app', 'ABCDEFGH23')).toBe('https://matchmate.app/anotar/ABCDEFGH23');
  });

  it('el link de ese torneo entre los de la liga', () => {
    const links: ScorerLink[] = [
      toScorerLink({ id: 'k1', code: 'aaa', scope: 'liga', refId: null, path: '/l/L1', status: 'ok' }, 'L1'),
      toScorerLink({ id: 'k2', code: 'bbb', scope: 'evento', refId: 'E1', path: '/l/L1/e/E1', status: 'raro' }, 'L1'),
    ];
    expect(linkFor(links, { scope: 'evento', refId: 'E1' })?.id).toBe('k2');
    expect(linkFor(links, { scope: 'liga', refId: null })?.code).toBe('AAA');
    expect(linkFor(links, { scope: 'playoff', refId: 'P1' })).toBeNull();
    // Un estado que esta versión no conoce: no sirve.
    expect(links[1].status).toBe('closed');
  });

  it('sin código ni cuentas, ni pregunta', async () => {
    await expect(getScorerLinkPreview('  ')).resolves.toBeNull();
    await expect(joinAsScorer('')).resolves.toBeNull();
    await expect(inviteScorers('L1', [], { scope: 'liga', refId: null })).rejects.toMatchObject({ kind: 'validation' });
    await expect(inviteScorers('L1', Array.from({ length: 21 }, (_, i) => `u${i}`), { scope: 'liga', refId: null })).rejects.toMatchObject({
      kind: 'validation',
    });
  });
});

describe('errores en palabras', () => {
  it('manejar anotadores', () => {
    expect(scorerErrorText(new BackendError(BLOCKED_MESSAGE, 'permission', 'bloqueada'))).toBe(BLOCKED_MESSAGE);
    expect(scorerErrorText(new BackendError('no_permitido', 'permission'))).toBe('Solo el dueño o un admin maneja los anotadores.');
    expect(scorerErrorText(new BackendError('rate_limited', 'rate_limited'))).toBe('Hiciste muchos cambios hoy. Prueba mañana.');
    expect(scorerErrorText(new BackendError('cupo_lleno', 'validation'), 'torneo')).toBe('Ya hay 10 links para anotar abiertos en el torneo. Quita alguno.');
    expect(scorerErrorText(new BackendError('no_existe', 'not_found'))).toBe('Eso ya no existe.');
    expect(scorerErrorText(new BackendError('sin señal', 'network'))).toBe('Sin conexión. Prueba otra vez cuando tengas señal.');
    expect(scorerErrorText(new Error('otra cosa'))).toBe('No se pudo. Prueba otra vez.');
  });

  it('entrar con el link', () => {
    expect(scorerJoinErrorText(new BackendError(BLOCKED_MESSAGE, 'permission', 'bloqueada'))).toBe(BLOCKED_MESSAGE);
    expect(scorerJoinErrorText(new BackendError('rate_limited', 'rate_limited'))).toBe('Demasiados intentos. Espera unos minutos.');
    expect(scorerJoinErrorText(new Error('x'))).toBe('No se pudo entrar. Prueba otra vez.');
  });
});

describe("tiempo real 'scorers'", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const invalidated = (topic: string, payload: Record<string, unknown>) => {
    const spy = vi.spyOn(queryClient, 'invalidate');
    handleMessage(topic, null, { event: 'scorers', payload });
    const out = spy.mock.calls.map(([t]) => t);
    spy.mockRestore();
    return out;
  };

  it('en la liga: sus invitaciones y links de anotador, y sus miembros', () => {
    expect(invalidated('league:L1', { user_id: 'u1' })).toEqual(['scorers:L1', 'members:L1']);
  });

  it('en la cuenta: mis membresías, la campana y los miembros de esa liga', () => {
    expect(invalidated('user:u1', { league_id: 'L1' })).toEqual(['members', 'feeds', 'members:L1']);
    expect(invalidated('user:u1', {})).toEqual(['members', 'feeds']);
  });
});
