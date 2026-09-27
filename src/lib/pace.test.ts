import { beforeEach, describe, expect, it } from 'vitest';
import { paceCheck, paceStart, resetPace } from './pace';

describe('ritmo de envíos', () => {
  beforeEach(resetPace);

  it('mientras uno está pendiente no se manda otro; al aceptarlo cuenta la espera', async () => {
    let accept!: () => void;
    const sending = new Promise<void>((r) => (accept = r));
    expect(paceCheck('l1:comentario', 3)).toEqual({ ok: true });
    paceStart('l1:comentario', sending);
    expect(paceCheck('l1:comentario', 3)).toMatchObject({ ok: false, reason: 'pendiente' });
    accept();
    await sending;
    await Promise.resolve();
    const check = paceCheck('l1:comentario', 3);
    expect(check).toMatchObject({ ok: false, reason: 'ritmo' });
    expect(paceCheck('l1:comentario', 3, Date.now() + 3100)).toEqual({ ok: true });
  });

  it('si el envío falla, se puede reintentar enseguida', async () => {
    const failing = Promise.reject(new Error('sin permiso'));
    paceStart('l1:sugerencia', failing);
    await failing.catch(() => undefined);
    await Promise.resolve();
    expect(paceCheck('l1:sugerencia', 60)).toEqual({ ok: true });
  });

  it('cada liga y cada tipo lleva su propio ritmo', async () => {
    const done = Promise.resolve();
    paceStart('l1:comentario', done);
    await done;
    await Promise.resolve();
    expect(paceCheck('l2:comentario', 3)).toEqual({ ok: true });
    expect(paceCheck('l1:sugerencia', 60)).toEqual({ ok: true });
  });
});
