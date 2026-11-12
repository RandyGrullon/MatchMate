import { describe, expect, it } from 'vitest';
import { checkResponse, paymentFields } from '../../supabase/functions/azul-pay/core';
import { LOCAL_AZUL_KEY, localAzulConfig, simulatedAzulResponse, withQuery } from './azulLocal';

// El simulador de Azul del modo local firma como Azul: lo que manda lo acepta la misma revisión de azul-pay.

describe('simulador de Azul (modo local)', () => {
  it('aprobado y declinado pasan la revisión de la firma con la clave local', async () => {
    const fields = await paymentFields(localAzulConfig('http://localhost:5193'), { orderNumber: 12, amount: 2500, days: 15 });
    expect(fields.ApprovedUrl).toBe('http://localhost:5193/empresa/pago');
    const now = new Date(2026, 10, 5, 10, 30, 0);
    const ok = await simulatedAzulResponse(fields, true, now);
    expect(ok).toMatchObject({ OrderNumber: '12', Amount: '250000', IsoCode: '00', DateTime: '20261105103000' });
    expect(await checkResponse(ok, LOCAL_AZUL_KEY)).toMatchObject({ orderNumber: 12, amount: 2500, status: 'approved' });
    const no = await simulatedAzulResponse(fields, false, now);
    expect(await checkResponse(no, LOCAL_AZUL_KEY)).toMatchObject({ status: 'declined', data: { authorizationCode: '' } });
    // Con otra clave, no.
    expect(await checkResponse(ok, 'otra-clave')).toBeNull();
  });

  it('la URL de vuelta con la respuesta', () => {
    expect(withQuery('http://x.test/empresa/pago', { a: '1', b: 'c d' })).toBe('http://x.test/empresa/pago?a=1&b=c+d');
    expect(withQuery('http://x.test/empresa/pago?cancelado=1', { a: '1' })).toBe('http://x.test/empresa/pago?cancelado=1&a=1');
  });
});
