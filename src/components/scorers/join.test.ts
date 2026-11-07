/**
 * «Entrar para anotar» sin pantalla (join.ts): qué sigue después de joinAsScorer, el vacío del link y las filas de la
 * tarjeta de /anotar/<código>. Datos ficticios.
 */
import { describe, expect, it, vi } from 'vitest';
import { BackendError } from '../../lib/backend/types';
import type { ScorerJoinResult } from '../../lib/data/scorers';
import { deadStatusOf, enterWithLink, scorerJoinLines, scorerJoinSub } from './join';

const joined = (status: 'joined' | 'upgraded' | 'already'): ScorerJoinResult => ({
  status,
  leagueId: 'l1',
  scope: 'liga',
  refId: null,
  title: 'Liga de Ejemplo',
  path: '/l/l1',
});

describe('enterWithLink', () => {
  it('entró: al torneo con el aviso; ya anotaba: sin aviso', async () => {
    const join = vi.fn(async () => joined('joined'));
    expect(await enterWithLink('ANOT2345', { title: 'Liga de Ejemplo' }, join)).toEqual({ kind: 'go', path: '/l/l1', toast: 'Ya puedes anotar en Liga de Ejemplo' });
    expect(join).toHaveBeenCalledWith('ANOT2345');
    expect(await enterWithLink('ANOT2345', { title: 'Liga de Ejemplo' }, async () => joined('already'))).toEqual({ kind: 'go', path: '/l/l1', toast: null });
  });

  it('el código no existe, el link venció o hubo muchos intentos: el vacío; otro error: el aviso', async () => {
    expect(await enterWithLink('ANOT2345', { title: 'X' }, async () => null)).toEqual({ kind: 'dead', preview: null });
    expect(await enterWithLink('ANOT2345', { title: 'X' }, async () => ({ status: 'expired' }))).toEqual({ kind: 'dead', preview: { status: 'expired' } });
    const limited = async () => {
      throw new BackendError('rate_limited', 'rate_limited');
    };
    expect(await enterWithLink('ANOT2345', { title: 'X' }, limited)).toEqual({ kind: 'dead', preview: { status: 'rate_limited' } });
    const offline = async () => {
      throw new BackendError('sin red', 'network');
    };
    expect(await enterWithLink('ANOT2345', { title: 'X' }, offline)).toEqual({ kind: 'error', message: 'Sin conexión. Prueba otra vez cuando tengas señal.' });
  });
});

describe('la tarjeta de /anotar/<código>', () => {
  it('por qué no sirve: null si el código no existe', () => {
    expect(deadStatusOf(null)).toBeNull();
    expect(deadStatusOf({ status: 'full' })).toBe('full');
  });

  it('qué haces siempre; dónde y hasta cuándo, si hay', () => {
    expect(scorerJoinLines(null, '').map((l) => l.label)).toEqual(['Qué haces']);
    expect(scorerJoinLines('Podrás anotar en los torneos de esta liga (no en las prácticas).', '6 de octubre')).toEqual([
      { key: 'que', label: 'Qué haces', value: 'Anotas los resultados. No te inscribe como jugador.' },
      { key: 'donde', label: 'Dónde', value: 'Podrás anotar en los torneos de esta liga (no en las prácticas).' },
      { key: 'hasta', label: 'Hasta cuándo sirve', value: 'El link vence el 6 de octubre' },
    ]);
  });

  it('«en …» solo si el torneo no se llama como la liga', () => {
    expect(scorerJoinSub({ name: 'Liga de Ejemplo', title: 'Liga de Ejemplo' })).toBeNull();
    expect(scorerJoinSub({ name: 'Liga de Ejemplo', title: 'Copa de Ejemplo' })).toBe('en Copa de Ejemplo');
    expect(scorerJoinSub({ name: 'Liga de Ejemplo', title: '' })).toBeNull();
  });
});
