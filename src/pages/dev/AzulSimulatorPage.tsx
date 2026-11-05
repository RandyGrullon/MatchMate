import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldX } from 'lucide-react';
import { REQUEST_HASH_FIELDS, azulHash, pesosFromAzul, sameHash } from '../../../supabase/functions/azul-pay/core';
import { backendMode } from '../../lib/backend';
import { LOCAL_AZUL_KEY, simulatedAzulResponse, withQuery } from '../../lib/azulLocal';
import { AppShell } from '../../components/Shell';
import { Button, Card, Empty } from '../../components/ui';

/**
 * El simulador de la Página de Pagos de Azul (`/dev/azul`), solo en el modo local (src/lib/azulLocal.ts): muestra la
 * orden, revisa la firma del comercio con la clave de prueba y vuelve a la app aprobado, declinado o cancelado, firmado
 * igual que Azul. No pide datos de tarjeta: no se cobra nada.
 */
export default function AzulSimulatorPage() {
  const [fields] = useState<Record<string, string>>(() => Object.fromEntries(new URLSearchParams(window.location.search)));
  const [signed, setSigned] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const local = backendMode() === 'local';

  useEffect(() => {
    if (!local || !fields.AuthHash) return;
    let alive = true;
    azulHash(REQUEST_HASH_FIELDS.map((f) => fields[f] ?? '').join('') + LOCAL_AZUL_KEY, LOCAL_AZUL_KEY).then((h) => {
      if (alive) setSigned(sameHash(h, fields.AuthHash));
    });
    return () => {
      alive = false;
    };
  }, [fields, local]);

  if (!local || !fields.OrderNumber) {
    return (
      <AppShell>
        <Empty title="Simulador de Azul">Solo funciona en el modo local, al pagar una promoción desde Mi empresa.</Empty>
      </AppShell>
    );
  }

  const amount = pesosFromAzul(fields.Amount) ?? 0;
  const itbis = pesosFromAzul(fields.ITBIS) ?? 0;
  const money = (n: number) => `RD$${n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const finish = async (approve: boolean) => {
    setBusy(true);
    const res = await simulatedAzulResponse(fields, approve);
    window.location.assign(withQuery(approve ? fields.ApprovedUrl : fields.DeclinedUrl, res));
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-4 px-2 py-4">
        <Card className="flex flex-col gap-2 p-5">
          <p className="text-meta text-muted">Página de Pagos de prueba (modo local) · no se cobra nada</p>
          <h1 className="text-title">{fields.MerchantName}</h1>
          <p className="text-body">
            Orden {fields.OrderNumber} · <strong>{money(amount)}</strong> (ITBIS {money(itbis)})
          </p>
          <p className={signed === false ? 'flex items-center gap-1 text-meta text-danger' : 'flex items-center gap-1 text-meta text-muted'}>
            {signed === false ? <ShieldX className="size-4" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
            {signed === null ? 'Revisando la firma del comercio…' : signed ? 'Firma del comercio válida' : 'La firma del comercio NO coincide'}
          </p>
        </Card>
        <Button variant="primary" loading={busy} disabled={!signed} onClick={() => finish(true)}>
          Aprobar el pago
        </Button>
        <Button variant="secondary" disabled={busy || !signed} onClick={() => finish(false)}>
          Declinar
        </Button>
        <Button variant="quiet" disabled={busy} onClick={() => window.location.assign(fields.CancelUrl)}>
          Cancelar
        </Button>
      </div>
    </AppShell>
  );
}
