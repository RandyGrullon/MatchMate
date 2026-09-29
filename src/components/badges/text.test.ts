import { describe, expect, it } from 'vitest';
import { BADGE_TEXT_MESSAGE, badgeTextError, badgeTextProblem, cleanBadgeText, textLength } from './text';

describe('filtro de texto de las insignias de la liga (§5.7)', () => {
  it('vacío y los textos de siempre se pueden usar', () => {
    for (const ok of ['', '   ', 'Campeón', 'Mejor promedio', 'TEMP 26/27', 'Cat. A', '¡Ahí mismito!', 'Juego limpio: 0 rojas', '"La Cigua" & Co. (2026)', 'Ñandú', 'Pingüino', '279 en la final', '#1 del mes', 'Más +10']) {
      expect(badgeTextProblem(ok), ok).toBeNull();
    }
  });

  it('sin emoji, @ ni símbolos raros', () => {
    for (const bad of ['Campeón 🏆', 'ana@correo', 'a_b', 'precio $5', '50%', 'a*b', 'hola~', 'tab​cero']) {
      expect(badgeTextProblem(bad), bad).toBe('caracteres');
    }
  });

  it('sin enlaces, correos ni teléfonos', () => {
    for (const bad of ['http cosa', 'HTTPS', 'www.liga', 'miliga.com', 'Mi liga.DO', 'algo.net y más', 'sitio.org', '8095551234', '809 555 1234', '555-1234', '555.1234', 'Llama 5551234']) {
      expect(badgeTextProblem(bad), bad).toBe('bloqueado');
    }
    // «.do» o «.com» dentro de una palabra sí pasa (no es un dominio).
    expect(badgeTextProblem('Premio.dominicano')).toBeNull();
    expect(badgeTextProblem('Sr.comelón')).toBeNull();
    // 3 dígitos y 4 separados por dos espacios o letras no son un teléfono.
    expect(badgeTextProblem('Top 300 de 2026')).toBeNull();
  });

  it('sin el mismo carácter 4 veces seguidas (con o sin tilde, mayúscula o minúscula)', () => {
    expect(badgeTextProblem('Goooool')).toBe('bloqueado');
    expect(badgeTextProblem('GOoOoL')).toBe('bloqueado');
    expect(badgeTextProblem('aáaA')).toBe('bloqueado');
    expect(badgeTextProblem('!!!!')).toBe('bloqueado');
    expect(badgeTextProblem('Gooo')).toBeNull();
  });

  it('limpia como la base (espacios) y mide por carácter', () => {
    expect(cleanBadgeText('  Mano \n  amiga\t ')).toBe('Mano amiga');
    expect(textLength('Campeón')).toBe(7);
    expect(badgeTextError('ok')).toBeNull();
    expect(badgeTextError('x@y')).toBe(BADGE_TEXT_MESSAGE.caracteres);
    expect(badgeTextError('www.x')).toBe('Ese texto no se puede usar.');
  });
});
