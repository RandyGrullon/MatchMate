import { describe, expect, it } from 'vitest';
import { NOTICE_PRIORITY, pickNotice } from './notices';
import { PROMPT_SNOOZE_DAYS, installNotice, pushNotice, pushPageNotice } from './prompts';

describe('los avisos de la app (antes carteles)', () => {
  it('instalar en Android: «Instalar» que abre el diálogo del teléfono; vuelve en 14 días si lo cierra', () => {
    const install = () => Promise.resolve();
    const onDismiss = () => undefined;
    const n = installNotice('prompt', { install, onDismiss });
    expect(n).toMatchObject({ id: 'instalar', kind: 'install', title: 'Instala MatchMate', snoozeDays: 14 });
    expect(n.action?.label).toBe('Instalar');
    expect(n.action?.onClick).toBe(install);
    expect(n.onDismiss).toBe(onDismiss);
    expect(PROMPT_SNOOZE_DAYS).toBe(14);
  });

  it('instalar en iPhone: cómo hacerlo, sin botón', () => {
    const n = installNotice('ios');
    expect(n).toMatchObject({ id: 'instalar-iphone', kind: 'install', text: 'Toca Compartir y luego «Agregar a inicio»' });
    expect(n.action).toBeUndefined();
  });

  it('permitir avisos: «¿Te avisamos?» con «Activar»; pierde con instalar y le gana a sugerir Pro', () => {
    const enable = () => undefined;
    const push = pushNotice({ enable });
    expect(push).toMatchObject({ id: 'permitir-avisos', kind: 'push', title: '¿Te avisamos?', snoozeDays: 14 });
    expect(push.action).toEqual({ label: 'Activar', onClick: enable });
    expect(NOTICE_PRIORITY.indexOf('install')).toBeLessThan(NOTICE_PRIORITY.indexOf('push'));
    const pro = { id: 'sugerir-pro', kind: 'pro' as const, title: 'Organizas una liga' };
    expect(pickNotice([{ notice: pro, seq: 1 }, { notice: push, seq: 2 }], {})?.id).toBe('permitir-avisos');
    expect(pickNotice([{ notice: push, seq: 1 }, { notice: installNotice('ios'), seq: 2 }], {})?.id).toBe('instalar-iphone');
  });

  it('la página de avisos: activar, bloqueadas o falta instalar (cada uno con su id, aparte del de las otras pantallas)', () => {
    const ask = pushPageNotice('ask', { enable: () => undefined });
    expect(ask).toMatchObject({ id: 'avisos-pagina', kind: 'push', title: 'Activa las notificaciones' });
    expect(ask.action?.label).toBe('Activar');
    const denied = pushPageNotice('denied');
    expect(denied).toMatchObject({ title: 'Las notificaciones están bloqueadas', text: 'Actívalas en los ajustes del teléfono' });
    expect(denied.action).toBeUndefined();
    expect(pushPageNotice('install').title).toBe('Recibe los avisos en tu teléfono');
    const ids = new Set([ask.id, denied.id, pushPageNotice('install').id, pushNotice().id]);
    expect(ids.size).toBe(4);
  });
});
