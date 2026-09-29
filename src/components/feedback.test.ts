import { describe, expect, it } from 'vitest';
import { mapDbError } from '../lib/backend/errors';
import { saveErrorMessage } from './feedback';

/** Mensajes al guardar: los errores de la base que dicen qué pasó se explican tal cual; los demás, en general. */
describe('saveErrorMessage', () => {
  const raised = (message: string) => mapDbError({ code: 'P0001', message });

  it('las fechas de la temporada y las correcciones del playoff dicen qué hacer', () => {
    expect(saveErrorMessage(raised('invalido: temporada'))).toMatch(/Admin › Temporada/);
    expect(saveErrorMessage(raised('cerrado: serie'))).toMatch(/Anula primero sus juegos/);
    expect(saveErrorMessage(raised('invalido: playoff'))).toMatch(/otro playoff en curso/);
  });

  it('lo demás, como siempre', () => {
    expect(saveErrorMessage(raised('invalido'))).toBe('No se pudo guardar. Intenta de nuevo.');
    expect(saveErrorMessage(mapDbError({ code: '42501', message: 'no_permitido' }))).toMatch(/Sin permiso/);
  });
});
