import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CircleCheck, CircleX, CreditCard } from 'lucide-react';
import {
  cancelPromotionPayment,
  paymentErrorText,
  paymentReturn,
  verifyPromotionPayment,
  type PaymentResult,
  type PaymentReturn,
} from '../../lib/data/business';
import { formatDateLong, toIsoDate } from '../../lib/format';
import { AppShell } from '../../components/Shell';
import { LeagueTopBar } from '../../components/league/home/LeagueTopBar';
import { Card, Empty, Loading } from '../../components/ui';

const btn = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-btn px-4 text-body font-semibold transition active:scale-[0.98]';

type Outcome = { kind: 'result'; result: PaymentResult } | { kind: 'cancelled'; orderNumber: number } | { kind: 'failed'; message: string };

/**
 * La vuelta de Azul (`/empresa/pago`, la ApprovedUrl, DeclinedUrl y CancelUrl de azul-pay): manda la respuesta a
 * revisar (azul-pay: la firma, el número y el monto; la base activa la promoción) o, con «Cancelar», cancela el pago
 * pendiente. Después quita la respuesta de la dirección (que no quede en el historial) y dice qué pasó.
 */
export default function PaymentReturnPage() {
  const navigate = useNavigate();
  // Lo que trajo la URL, leído una vez (después se limpia la dirección).
  const [ret] = useState<PaymentReturn | null>(() => paymentReturn(window.location.search));
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!ret || started.current) return;
    started.current = true;
    const work =
      ret.kind === 'cancelled'
        ? cancelPromotionPayment(ret.orderNumber).then((): Outcome => ({ kind: 'cancelled', orderNumber: ret.orderNumber }))
        : verifyPromotionPayment(ret.params).then((result): Outcome => ({ kind: 'result', result }));
    work
      .catch((e: unknown): Outcome => (ret.kind === 'cancelled' ? { kind: 'cancelled', orderNumber: ret.orderNumber } : { kind: 'failed', message: paymentErrorText(e) }))
      .then((o) => {
        setOutcome(o);
        navigate('/empresa/pago', { replace: true });
      });
  }, [ret, navigate]);

  let body;
  if (!ret) {
    body = (
      <Empty icon={<CreditCard className="size-7" aria-hidden="true" />} title="No hay ningún pago aquí">
        Para destacar un espacio, ábrelo en Mi empresa.
      </Empty>
    );
  } else if (!outcome) {
    body = <Loading label="Confirmando el pago con Azul…" />;
  } else if (outcome.kind === 'cancelled') {
    body = (
      <Card className="flex flex-col gap-2 p-5">
        <h2 className="text-title">Cancelaste el pago</h2>
        <p className="text-meta text-muted">No se cobró nada. Puedes intentarlo otra vez desde el espacio.</p>
      </Card>
    );
  } else if (outcome.kind === 'failed') {
    body = (
      <Card className="flex flex-col gap-2 p-5">
        <CircleX className="size-8 text-danger" aria-hidden="true" />
        <h2 className="text-title">No pudimos confirmar el pago</h2>
        <p className="text-meta">{outcome.message}</p>
      </Card>
    );
  } else {
    const r = outcome.result;
    const amount = `RD$${r.amount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    body =
      r.status === 'approved' ? (
        <Card className="flex flex-col gap-2 p-5">
          <CircleCheck className="size-8 text-accent" aria-hidden="true" />
          <h2 className="text-title">¡Pago aprobado!</h2>
          <p className="text-meta">
            Tu espacio sale primero en «Dónde jugar»{r.endsAt ? ` hasta el ${formatDateLong(toIsoDate(new Date(r.endsAt)))}` : ''}.
          </p>
          <p className="text-meta text-muted">
            Orden {r.orderNumber} · {amount}
          </p>
        </Card>
      ) : (
        <Card className="flex flex-col gap-2 p-5">
          <CircleX className="size-8 text-danger" aria-hidden="true" />
          <h2 className="text-title">Azul no aprobó el pago</h2>
          <p className="text-meta">No se cobró nada. Revisa los datos de la tarjeta o prueba con otra desde el espacio.</p>
          <p className="text-meta text-muted">Orden {r.orderNumber}</p>
        </Card>
      );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4 px-2">
        <LeagueTopBar to="/empresa" label="Mi empresa" />
        {body}
        {outcome || !ret ? (
          <Link to="/empresa" className={`${btn} bg-accent text-accent-fg`}>
            Volver a Mi empresa
          </Link>
        ) : null}
      </div>
    </AppShell>
  );
}
