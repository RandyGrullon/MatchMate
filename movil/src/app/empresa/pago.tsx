import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CircleCheck, CircleX, CreditCard } from 'lucide-react-native';
import {
  cancelPromotionPayment,
  paymentErrorText,
  paymentReturn,
  verifyPromotionPayment,
  type PaymentResult,
  type PaymentReturn,
} from '@mm/lib/data/business';
import { formatDateLong, toIsoDate } from '@mm/lib/format';
import { BackBar, Button, Card, Empty, Loading, Screen, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';

type Outcome = { kind: 'result'; result: PaymentResult } | { kind: 'cancelled'; orderNumber: number } | { kind: 'failed'; message: string };

/** Lo que trajo la ruta: el query de Azul entero en `q` (movil/src/lib/azul.ts) o, si no, sus parámetros sueltos. */
function searchOf(params: Record<string, string | string[] | undefined>): string {
  if (typeof params.q === 'string') return `?${params.q}`;
  const pairs = Object.entries(params).flatMap(([k, v]) => (v === undefined ? [] : (Array.isArray(v) ? v : [v]).map((x) => [k, x])));
  return `?${new URLSearchParams(pairs).toString()}`;
}

/**
 * La vuelta de Azul en la app (PaymentReturnPage de la web): manda la respuesta a revisar (azul-pay: la firma, el número
 * y el monto; la base activa la promoción) o, con «Cancelar», cancela el pago pendiente, y dice qué pasó. La abre la
 * página de Azul dentro de la app (movil/src/app/empresa/azul.tsx) o el simulador de la demostración.
 */
export default function PaymentReturnScreen() {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const c = useColors();
  // Lo que trajo la ruta, leído una vez.
  const [ret] = useState<PaymentReturn | null>(() => paymentReturn(searchOf(params)));
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!ret || started.current) return;
    started.current = true;
    const work =
      ret.kind === 'cancelled'
        ? cancelPromotionPayment(ret.orderNumber).then((): Outcome => ({ kind: 'cancelled', orderNumber: ret.orderNumber }))
        : verifyPromotionPayment(ret.params).then((result): Outcome => ({ kind: 'result', result }));
    void work
      .catch((e: unknown): Outcome => (ret.kind === 'cancelled' ? { kind: 'cancelled', orderNumber: ret.orderNumber } : { kind: 'failed', message: paymentErrorText(e) }))
      .then(setOutcome);
  }, [ret]);

  let body;
  if (!ret) {
    body = <Empty icon={<CreditCard size={28} color={c.muted} />} title="No hay ningún pago aquí" text="Para destacar un espacio, ábrelo en Mi empresa." />;
  } else if (!outcome) {
    body = <Loading label="Confirmando el pago con Azul…" />;
  } else if (outcome.kind === 'cancelled') {
    body = (
      <Card style={{ gap: 8 }}>
        <Txt variant="cardTitle" accessibilityRole="header">
          Cancelaste el pago
        </Txt>
        <Txt variant="meta" tone="muted">
          No se cobró nada. Puedes intentarlo otra vez desde el espacio.
        </Txt>
      </Card>
    );
  } else if (outcome.kind === 'failed') {
    body = (
      <Card style={{ gap: 8 }}>
        <CircleX size={32} color={c.danger} />
        <Txt variant="cardTitle" accessibilityRole="header">
          No pudimos confirmar el pago
        </Txt>
        <Txt variant="meta">{outcome.message}</Txt>
      </Card>
    );
  } else {
    const r = outcome.result;
    const amount = `RD$${r.amount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    body =
      r.status === 'approved' ? (
        <Card style={{ gap: 8 }}>
          <CircleCheck size={32} color={c.accent} />
          <Txt variant="cardTitle" accessibilityRole="header">
            ¡Pago aprobado!
          </Txt>
          <Txt variant="meta">Tu espacio sale primero en «Dónde jugar»{r.endsAt ? ` hasta el ${formatDateLong(toIsoDate(new Date(r.endsAt)))}` : ''}.</Txt>
          <Txt variant="meta" tone="muted">
            Orden {r.orderNumber} · {amount}
          </Txt>
        </Card>
      ) : (
        <Card style={{ gap: 8 }}>
          <CircleX size={32} color={c.danger} />
          <Txt variant="cardTitle" accessibilityRole="header">
            Azul no aprobó el pago
          </Txt>
          <Txt variant="meta">No se cobró nada. Revisa los datos de la tarjeta o prueba con otra desde el espacio.</Txt>
          <Txt variant="meta" tone="muted">
            Orden {r.orderNumber}
          </Txt>
        </Card>
      );
  }

  return (
    <Screen>
      <BackBar label="Mi empresa" fallback="/empresa" />
      <View style={{ gap: 16 }}>
        {body}
        {outcome || !ret ? (
          <Button variant="primary" full onPress={() => router.dismissTo('/empresa')}>
            Volver a Mi empresa
          </Button>
        ) : null}
      </View>
    </Screen>
  );
}
