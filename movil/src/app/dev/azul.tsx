import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { ShieldCheck, ShieldX } from 'lucide-react-native';
import { REQUEST_HASH_FIELDS, azulHash, pesosFromAzul, sameHash } from '../../../../supabase/functions/azul-pay/core';
import { LOCAL_AZUL_KEY, simulatedAzulResponse, withQuery } from '@mm/lib/azulLocal';
import { Button, Card, Empty, Screen, Txt } from '@/components/ui';
import { goToPaymentReturn } from '@/lib/azul';
import { azulReturnQuery } from '@/lib/azulForm';
import { demoOn } from '@/platform/demoBackend';
import { useColors } from '@/theme/theme';

/**
 * El simulador de la Página de Pagos de Azul (`/dev/azul`, AzulSimulatorPage de la web), solo en la demostración
 * (movil/src/platform/demoBackend.ts): muestra la orden, revisa la firma del comercio con la clave de prueba y vuelve a
 * la app aprobado, declinado o cancelado, firmado igual que Azul. No pide datos de tarjeta: no se cobra nada. En la app
 * publicada (__DEV__ falso) lleva a Hoy.
 */
export default function DevAzul() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Simulator />;
}

function Simulator() {
  const params = useLocalSearchParams<Record<string, string>>();
  const c = useColors();
  const [fields] = useState<Record<string, string>>(() => ({ ...params }));
  const [signed, setSigned] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const demo = demoOn();

  useEffect(() => {
    if (!demo || !fields.AuthHash) return;
    let alive = true;
    void azulHash(REQUEST_HASH_FIELDS.map((f) => fields[f] ?? '').join('') + LOCAL_AZUL_KEY, LOCAL_AZUL_KEY).then((h) => {
      if (alive) setSigned(sameHash(h, fields.AuthHash));
    });
    return () => {
      alive = false;
    };
  }, [fields, demo]);

  if (!demo || !fields.OrderNumber) {
    return (
      <Screen>
        <Empty title="Simulador de Azul" text="Solo funciona en la demostración, al pagar una promoción desde Mi empresa." />
      </Screen>
    );
  }

  const amount = pesosFromAzul(fields.Amount) ?? 0;
  const itbis = pesosFromAzul(fields.ITBIS) ?? 0;
  const money = (n: number) => `RD$${n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  // Como Azul: a ApprovedUrl o DeclinedUrl con la respuesta firmada, o a CancelUrl.
  const back = (url: string) => goToPaymentReturn(azulReturnQuery(url, fields) ?? '');
  const finish = async (approve: boolean) => {
    setBusy(true);
    const res = await simulatedAzulResponse(fields, approve);
    back(withQuery(approve ? fields.ApprovedUrl : fields.DeclinedUrl, res));
  };

  return (
    <Screen>
      <Card style={{ gap: 8 }}>
        <Txt variant="meta" tone="muted">
          Página de Pagos de prueba (demostración) · no se cobra nada
        </Txt>
        <Txt variant="cardTitle" accessibilityRole="header">
          {fields.MerchantName}
        </Txt>
        <Txt>
          Orden {fields.OrderNumber} · <Txt variant="bodyStrong">{money(amount)}</Txt> (ITBIS {money(itbis)})
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {signed === false ? <ShieldX size={16} color={c.danger} /> : <ShieldCheck size={16} color={c.muted} />}
          <Txt variant="meta" tone={signed === false ? 'danger' : 'muted'}>
            {signed === null ? 'Revisando la firma del comercio…' : signed ? 'Firma del comercio válida' : 'La firma del comercio NO coincide'}
          </Txt>
        </View>
      </Card>
      <Button variant="primary" full loading={busy} disabled={!signed} onPress={() => void finish(true)}>
        Aprobar el pago
      </Button>
      <Button variant="secondary" full disabled={busy || !signed} onPress={() => void finish(false)}>
        Declinar
      </Button>
      <Button variant="quiet" full disabled={busy} onPress={() => back(fields.CancelUrl)}>
        Cancelar
      </Button>
    </Screen>
  );
}
