/**
 * Lo que no es pantalla de Configuración (la web y la app del teléfono dicen lo mismo): las líneas de las filas, la
 * contraseña nueva, la biografía, los errores en palabras simples y quién ve «Organizar».
 */
import { describe, expect, it } from 'vitest';
import { BackendError } from '../../lib/backend/types';
import { MIN_PASSWORD } from '../../lib/auth';
import {
  accountLine,
  avatarErrorText,
  bioErrorText,
  blockedLine,
  blockedSubtitle,
  businessSubtitle,
  cleanBio,
  organizeAriaLabel,
  PASSWORD_MISMATCH_HINT,
  PASSWORD_SHORT_HINT,
  passwordCheck,
  passwordSheetTitle,
  sameBio,
  showsOrganize,
  usernameSubtitle,
} from './logic';

describe('tu cuenta', () => {
  it('la línea de debajo de tu nombre: @usuario y correo, lo que haya', () => {
    expect(accountLine('@jugadoruno', 'correo@ejemplo.com')).toBe('@jugadoruno · correo@ejemplo.com');
    expect(accountLine('', 'correo@ejemplo.com')).toBe('correo@ejemplo.com');
    expect(accountLine('@jugadoruno', null)).toBe('@jugadoruno');
    expect(accountLine('', undefined)).toBe('');
  });

  it('«Tu usuario»: el tuyo o para qué sirve', () => {
    expect(usernameSubtitle('@jugadoruno')).toBe('@jugadoruno');
    expect(usernameSubtitle('')).toBe('Para que te encuentren');
  });
});

describe('la contraseña nueva', () => {
  it('vacía: nada que avisar, pero «Guardar» apagado', () => {
    expect(passwordCheck('', '')).toEqual({ short: false, mismatch: false, canSave: false });
  });

  it(`con menos de ${MIN_PASSWORD} caracteres: muy corta`, () => {
    const c = passwordCheck('12345', '12345');
    expect(c.short).toBe(true);
    expect(c.canSave).toBe(false);
    expect(PASSWORD_SHORT_HINT).toBe(`Mínimo ${MIN_PASSWORD} caracteres.`);
  });

  it('las dos distintas: no coinciden; sin repetirla, todavía no se guarda', () => {
    expect(passwordCheck('123456', '654321')).toEqual({ short: false, mismatch: true, canSave: false });
    expect(passwordCheck('123456', '')).toEqual({ short: false, mismatch: false, canSave: false });
    expect(PASSWORD_MISMATCH_HINT).toBe('Las contraseñas no coinciden.');
  });

  it('larga y repetida igual: se guarda', () => {
    expect(passwordCheck('123456', '123456')).toEqual({ short: false, mismatch: false, canSave: true });
  });

  it('el título de la hoja: al volver del link del correo, ponerla', () => {
    expect(passwordSheetTitle(true)).toBe('Pon tu contraseña nueva');
    expect(passwordSheetTitle(false)).toBe('Cambiar contraseña');
  });
});

describe('perfil público', () => {
  it('la biografía sin espacios de más, y si es la misma de ahora', () => {
    expect(cleanBio('  Zurda.   Voy por\nmi primer 300. ')).toBe('Zurda. Voy por mi primer 300.');
    expect(sameBio(' Zurda ', 'Zurda')).toBe(true);
    expect(sameBio('', null)).toBe(true);
    expect(sameBio('Derecho', 'Zurda')).toBe(false);
  });

  it('personas bloqueadas: mientras llega, qué son; después, cuántas', () => {
    expect(blockedSubtitle(true, 0)).toBe('Las que no ven tu perfil');
    expect(blockedSubtitle(false, 0)).toBe('No has bloqueado a nadie');
    expect(blockedSubtitle(true, 2)).toBe('2 personas');
    expect(blockedLine(1)).toBe('1 persona');
  });

  it('los errores en palabras simples', () => {
    expect(bioErrorText(new BackendError('palabras', 'validation', 'palabras'))).toBe('Tu texto tiene palabras que no se permiten');
    expect(avatarErrorText({ code: 'imagen' })).toBe('No se pudo usar esa imagen. Prueba con otra (JPG, PNG o WebP).');
    expect(avatarErrorText(new BackendError('rate_limited', 'rate_limited'))).toBe('Cambiaste tu foto muchas veces hoy. Prueba mañana.');
    expect(bioErrorText(new BackendError('sin red', 'network'))).toContain('Sin conexión');
  });
});

describe('MatchMate', () => {
  it('«Organizar» sale a quien organiza alguna liga y al superadmin', () => {
    expect(showsOrganize(false, [{ leagueId: 'L1', role: 'member' }])).toBe(false);
    expect(showsOrganize(false, [{ leagueId: 'L1', role: 'admin' }])).toBe(true);
    expect(showsOrganize(false, [{ leagueId: 'L1', role: 'owner' }])).toBe(true);
    expect(showsOrganize(true, [])).toBe(true);
    expect(showsOrganize(false, null)).toBe(false);
  });

  it('lo que dice el lector de pantalla con cosas pendientes', () => {
    expect(organizeAriaLabel(0)).toBeUndefined();
    expect(organizeAriaLabel(1)).toBe('Organizar: 1 pendiente');
    expect(organizeAriaLabel(3)).toBe('Organizar: 3 pendientes');
  });

  it('«Mi empresa»: como empresa o la invitación', () => {
    expect(businessSubtitle('business')).toBe('Estás usando la app como empresa');
    expect(businessSubtitle('player')).toBe('¿Tienes canchas? Regístralas o cambia a modo empresa');
    expect(businessSubtitle(null)).toBe('¿Tienes canchas? Regístralas o cambia a modo empresa');
  });
});
