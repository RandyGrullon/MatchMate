import { describe, expect, it, vi } from 'vitest';
import { buildSocialNotices, loadUpTo, mergeUnique, peopleText, type SocialNoticeRow } from './follows';

const follow = (userId: string, name: string, at: string): SocialNoticeRow => ({ kind: 'follow', at, userId, name });
const like = (userId: string, name: string, at: string, extra: Partial<Extract<SocialNoticeRow, { kind: 'like' }>> = {}): SocialNoticeRow => ({
  kind: 'like',
  at,
  userId,
  name,
  gameKind: 'match',
  id: 'm1',
  playerId: 'p1',
  leagueId: 'L1',
  leagueName: 'Pádel Abierto',
  sport: 'padel',
  url: '/l/L1/juegos?partido=m1',
  ...extra,
});

describe('avisos sociales', () => {
  it('seguir: uno por cuenta, lleva a su perfil', () => {
    const [n] = buildSocialNotices([follow('u-ana', ' ana ', '2026-09-28T10:00:00.000Z')]);
    expect(n).toEqual({
      id: `seguir:u-ana:${Date.parse('2026-09-28T10:00:00.000Z')}`,
      kind: 'social',
      title: 'ana te empezó a seguir',
      body: 'Toca para ver su perfil.',
      url: '/u/u-ana',
      at: '2026-09-28T10:00:00.000Z',
      icon: 'follow',
      lid: null,
      sport: null,
    });
  });

  it('me gusta: se juntan por juego, el más nuevo primero, y el id cambia con uno nuevo', () => {
    const rows = [
      like('u-otra', 'otra', '2026-09-28T12:00:00.000Z'),
      like('u-ana', 'ana', '2026-09-28T11:00:00.000Z'),
      like('u-sofi', 'sofi', '2026-09-28T09:00:00.000Z'),
      like('u-ana', 'ana', '2026-09-27T09:00:00.000Z', { gameKind: 'golf', id: 'c1', playerId: 'gp', url: '/l/G/e/r1', leagueId: 'G', leagueName: 'Golf', sport: 'golf' }),
    ];
    const list = buildSocialNotices(rows);
    expect(list.map((n) => n.title)).toEqual(['A otra y 2 más les gustó tu partido', 'A ana le gustó tu ronda']);
    expect(list[0]).toMatchObject({ body: 'Pádel Abierto', url: '/l/L1/juegos?partido=m1', lid: 'L1', sport: 'padel', icon: 'like', at: '2026-09-28T12:00:00.000Z' });
    const again = buildSocialNotices([like('u-luis', 'luis', '2026-09-28T13:00:00.000Z'), ...rows]);
    expect(again[0].id).not.toBe(list[0].id);
    expect(again[0].title).toBe('A luis y 3 más les gustó tu partido');
    // Dos personas: con los dos nombres.
    expect(buildSocialNotices(rows.slice(0, 2))[0].title).toBe('A otra y ana les gustó tu partido');
  });

  it('el mismo partido de otro jugador (mi pareja) es otro aviso; mezcla seguir y me gusta por hora', () => {
    const list = buildSocialNotices([
      follow('u-ana', 'ana', '2026-09-28T10:30:00.000Z'),
      like('u-otra', 'otra', '2026-09-28T12:00:00.000Z'),
      like('u-otra', 'otra', '2026-09-28T08:00:00.000Z', { playerId: 'p2' }),
    ]);
    expect(list.map((n) => n.icon)).toEqual(['like', 'follow', 'like']);
  });

  it('lo que viene mal no rompe nada', () => {
    expect(buildSocialNotices(null)).toEqual([]);
    const list = buildSocialNotices([
      { kind: 'follow', at: '2026-09-28T10:00:00.000Z', userId: '', name: 'x' },
      { ...(like('u', '', '2026-09-28T10:00:00.000Z') as object), id: '' } as SocialNoticeRow,
      follow('u-x', '', '2026-09-28T10:00:00.000Z'),
    ]);
    expect(list.map((n) => n.title)).toEqual(['Alguien te empezó a seguir']);
  });

  it('nombres', () => {
    expect(peopleText([])).toBe('Alguien');
    expect(peopleText(['ana'])).toBe('ana');
    expect(peopleText(['ana', 'luis'])).toBe('ana y luis');
    expect(peopleText(['ana', 'luis', 'sofi', 'otra'])).toBe('ana y 3 más');
  });
});

describe('listas por páginas', () => {
  const all = Array.from({ length: 7 }, (_, i) => ({ id: `g${i}` }));
  const pager = () =>
    vi.fn(async (after: { id: string } | null, limit: number) => {
      const from = after ? all.findIndex((x) => x.id === after.id) + 1 : 0;
      return all.slice(from, from + limit);
    });

  it('lee páginas hasta tener las que se piden', async () => {
    const f = pager();
    expect(await loadUpTo(f, 5, 2, (x) => x.id)).toEqual({ items: all.slice(0, 5), done: false });
    expect(f.mock.calls.map(([a, l]) => [a?.id ?? null, l])).toEqual([
      [null, 2],
      ['g1', 2],
      ['g3', 1],
    ]);
  });

  it('se acaba cuando una página viene incompleta', async () => {
    const f = pager();
    expect(await loadUpTo(f, 20, 3, (x) => x.id)).toEqual({ items: all, done: true });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('nunca pide más de 50 por página', async () => {
    const f = vi.fn(async () => [] as { id: string }[]);
    await loadUpTo(f, 120, 80, (x) => x.id);
    expect(f).toHaveBeenCalledWith(null, 50);
  });

  it('junta sin repetir (lo nuevo reemplaza en su lugar)', () => {
    expect(mergeUnique([{ id: 'a', v: 1 }, { id: 'b', v: 1 }], [{ id: 'b', v: 2 }, { id: 'c', v: 1 }], (x) => x.id)).toEqual([
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
      { id: 'c', v: 1 },
    ]);
  });
});
