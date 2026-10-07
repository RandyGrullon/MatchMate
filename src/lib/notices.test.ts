/**
 * Un solo aviso por pantalla (src/lib/notices.ts): cuál gana (pendientes del admin > instalar > permitir avisos >
 * sugerir Pro > pista), lo cerrado se recuerda por cuenta en el teléfono y nunca se muestran dos lugares a la vez.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NOTICE_PRIORITY,
  activeSlot,
  claimSlot,
  dismissNotice,
  dismissedFor,
  dismissedKey,
  isDismissed,
  noticesSnapshot,
  pickNotice,
  readDismissed,
  registerNotice,
  resetNoticesForTests,
  saveDismissed,
  subscribeNotices,
  withDismissed,
  type Notice,
  type NoticeEntry,
} from './notices';

const DAY = 86_400_000;
const n = (id: string, kind: Notice['kind'], extra: Partial<Notice> = {}): Notice => ({ id, kind, title: id, ...extra });
const entries = (...list: Notice[]): NoticeEntry[] => list.map((notice, i) => ({ notice, seq: i + 1 }));

function memory() {
  const m = new Map<string, string>();
  return { map: m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

beforeEach(() => resetNoticesForTests());
afterEach(() => vi.unstubAllGlobals());

describe('cuál se muestra', () => {
  it('el orden: pendientes del admin, instalar, permitir avisos, sugerir Pro y al final una pista', () => {
    expect(NOTICE_PRIORITY).toEqual(['admin', 'install', 'push', 'pro', 'tip']);
  });

  it('gana el más importante aunque haya llegado después', () => {
    const list = entries(n('pro', 'pro'), n('avisos', 'push'), n('instalar', 'install'), n('pendientes', 'admin'));
    expect(pickNotice(list, {})?.id).toBe('pendientes');
    expect(pickNotice(list.slice(0, 3), {})?.id).toBe('instalar');
    expect(pickNotice(list.slice(0, 2), {})?.id).toBe('avisos');
    expect(pickNotice([], {})).toBeNull();
  });

  it('entre dos del mismo tipo, el que llegó primero', () => {
    expect(pickNotice(entries(n('a', 'tip'), n('b', 'tip')), {})?.id).toBe('a');
  });

  it('lo cerrado no sale y deja pasar al siguiente', () => {
    const list = entries(n('instalar', 'install'), n('pro', 'pro'));
    expect(pickNotice(list, { instalar: 1 })?.id).toBe('pro');
    expect(pickNotice(list, { instalar: 1, pro: 1 })).toBeNull();
  });

  it('con `snoozeDays` vuelve después de esos días; sin X (`dismissible: false`) no se puede cerrar', () => {
    const now = 100 * DAY;
    const later = n('avisos', 'push', { snoozeDays: 14 });
    expect(isDismissed(later, { avisos: now - 13 * DAY }, now)).toBe(true);
    expect(isDismissed(later, { avisos: now - 14 * DAY }, now)).toBe(false);
    expect(isDismissed(n('x', 'admin'), { x: 0 }, now)).toBe(true);
    expect(isDismissed(n('x', 'admin', { dismissible: false }), { x: now }, now)).toBe(false);
  });
});

describe('lo cerrado, en el teléfono y por cuenta', () => {
  it('cada cuenta lo suyo (sin cuenta, aparte); lo dañado no cuenta', () => {
    const s = memory();
    saveDismissed('u1', 'instalar', 10, s);
    expect(readDismissed('u1', s)).toEqual({ instalar: 10 });
    expect(readDismissed('u2', s)).toEqual({});
    expect(dismissedKey('u1')).toBe('mm:avisos-cerrados:u1');
    expect(dismissedKey(null)).toBe('mm:avisos-cerrados');
    s.setItem(dismissedKey('u1'), '[1,2]');
    expect(readDismissed('u1', s)).toEqual({});
    s.setItem(dismissedKey('u1'), '{"a":1,"b":"x","c":null}');
    expect(readDismissed('u1', s)).toEqual({ a: 1 });
    s.setItem(dismissedKey('u1'), '{roto');
    expect(readDismissed('u1', s)).toEqual({});
  });

  it('no crece sin fin: lo de hace más de un año se olvida y quedan los 100 más nuevos', () => {
    const now = 1000 * DAY;
    expect(withDismissed({ viejo: now - 366 * DAY, nuevo: now - DAY }, 'x', now)).toEqual({ nuevo: now - DAY, x: now });
    const many = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`a${i}`, now - i * 1000]));
    const kept = withDismissed(many, 'x', now);
    expect(Object.keys(kept)).toHaveLength(100);
    expect(kept.x).toBe(now);
    expect(kept.a149).toBeUndefined();
  });

  it('sin almacenamiento (privado o bloqueado) igual queda cerrado mientras la app esté abierta', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(readDismissed('u1', broken)).toEqual({});
    dismissNotice('u1', { id: 'instalar' }, 5, broken);
    expect(dismissedFor('u1', broken)).toEqual({ instalar: 5 });
  });

  it('al cerrar se guarda en el teléfono y avisa a las pantallas', () => {
    const s = memory();
    vi.stubGlobal('localStorage', s);
    const seen = vi.fn();
    const off = subscribeNotices(seen);
    dismissNotice('u1', { id: 'pro' }, 7);
    off();
    expect(seen).toHaveBeenCalled();
    expect(JSON.parse(s.getItem(dismissedKey('u1'))!)).toEqual({ pro: 7 });
    expect(dismissedFor('u1')).toEqual({ pro: 7 });
    expect(dismissedFor('u2')).toEqual({});
  });
});

describe('los avisos propuestos', () => {
  it('se proponen y se quitan; con el mismo id se reemplaza (conserva su lugar) y quitar el viejo no borra el nuevo', () => {
    const seen = vi.fn();
    const off = subscribeNotices(seen);
    const offTip = registerNotice(n('pista', 'tip'));
    const offA = registerNotice(n('instalar', 'install', { title: 'Instala' }));
    expect(noticesSnapshot().map((e) => e.notice.id)).toEqual(['pista', 'instalar']);
    const offB = registerNotice(n('instalar', 'install', { title: 'Instala MatchMate' }));
    expect(noticesSnapshot().map((e) => [e.notice.id, e.notice.title, e.seq])).toEqual([
      ['pista', 'pista', 1],
      ['instalar', 'Instala MatchMate', 2],
    ]);
    offA();
    expect(noticesSnapshot()).toHaveLength(2);
    offB();
    offTip();
    expect(noticesSnapshot()).toEqual([]);
    expect(seen).toHaveBeenCalledTimes(5);
    off();
  });

  it('con una función, se lee lo último que dice', () => {
    let title = 'Uno';
    registerNotice(() => n('x', 'tip', { title }));
    title = 'Dos';
    const [e] = noticesSnapshot();
    expect(e.get?.().title).toBe('Dos');
  });

  it('un solo lugar a la vez: muestra el último montado; al quitarlo, vuelve el anterior', () => {
    expect(activeSlot()).toBeNull();
    const a = claimSlot();
    const b = claimSlot();
    expect(activeSlot()).toBe(b.id);
    b.release();
    expect(activeSlot()).toBe(a.id);
    a.release();
    expect(activeSlot()).toBeNull();
  });
});
