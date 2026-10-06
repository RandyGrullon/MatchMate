import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Check, LogOut, ShieldCheck, UserX } from 'lucide-react';
import { authErrorMessage, confirmAdult, logout, takeAdultPending, useAuth } from '../lib/auth';
import { LEGAL_PATHS, PRIVACY_PATH, TERMS_PATH } from '../pages/legal/legal';
import { useFeedback } from './feedback';
import { Logo } from './Logo';
import { Button, Card, Loading } from './ui';

const loadDeleteDialog = () => import('../pages/legal/DeleteAccountDialog');
const DeleteAccountDialog = lazy(loadDeleteDialog);

/**
 * «Tengo 18 años o más», una sola vez, para quien no lo dijo al registrarse: entró con Google (el registro de
 * Google no pasa por la casilla) o su cuenta viene de BowlingX. Hasta que lo diga no usa la app: las cuentas son
 * solo de adultos (Ley 136-03); los menores juegan sin cuenta, en ligas que lleva un adulto. La privacidad y los
 * términos se pueden leer igual.
 * Si marcó la casilla en «Crear cuenta» y después fue a Google, al volver se confirma solo (sin preguntar otra vez),
 * pero solo si la cuenta se creó después de marcarla (no otra que entre en el mismo teléfono).
 */
export function AdultGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { pathname } = useLocation();
  if (!auth.user || !auth.needsAdult || LEGAL_PATHS.includes(pathname)) return children;
  return <AdultQuestion uid={auth.user.uid} createdAt={auth.profile?.createdAt ?? null} />;
}

function AdultQuestion({ uid, createdAt }: { uid: string; createdAt: string | null }) {
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const [step, setStep] = useState<'ask' | 'minor'>('ask');
  const [busy, setBusy] = useState<'si' | 'salir' | 'auto' | 'borrar' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const auto = useRef(false);

  async function yes() {
    setBusy('si');
    setError(null);
    try {
      await confirmAdult(uid);
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  // Marcó la casilla antes de ir a Google y esta es la cuenta nueva: se confirma solo (una vez).
  useEffect(() => {
    if (auto.current) return;
    auto.current = true;
    if (!takeAdultPending(createdAt)) return;
    setBusy('auto');
    confirmAdult(uid)
      .catch(() => setError('No se pudo guardar. Toca «Sí, tengo 18 años o más» otra vez.'))
      .finally(() => setBusy(null));
  }, [uid, createdAt]);

  async function signOut() {
    setBusy('salir');
    try {
      const { unsubscribePush } = await import('../lib/push');
      await unsubscribePush(uid);
      await logout();
      navigate('/', { replace: true });
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  // El cuadro de borrar se baja la primera vez: la ruedita mientras llega (si no llega, el aviso sale al abrirlo).
  async function openDelete() {
    setBusy('borrar');
    await loadDeleteDialog().catch(() => undefined);
    setBusy(null);
    setDeleting(true);
  }

  if (busy === 'auto') return <Loading label="Guardando…" />;

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Logo className="size-12" />
          <h1 className="text-2xl font-bold tracking-tight">{step === 'ask' ? 'Antes de seguir' : 'MatchMate es para adultos'}</h1>
        </div>
        <Card className="flex flex-col gap-4 p-5">
          {step === 'ask' ? (
            <>
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
                <p className="text-sm">
                  Las cuentas de MatchMate son solo para mayores de 18 años. Los menores juegan sin cuenta, en ligas que lleva un adulto.{' '}
                  <b>¿Tienes 18 años o más?</b>
                </p>
              </div>
              {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
              <Button variant="primary" onClick={yes} loading={busy === 'si'} disabled={!!busy} icon={<Check className="size-4" />} className="h-11">
                Sí, tengo 18 años o más
              </Button>
              <Button onClick={() => setStep('minor')} disabled={!!busy} className="h-11">
                No, soy menor de 18
              </Button>
              <p className="text-center text-xs text-muted">
                Al seguir aceptas los{' '}
                <Link to={TERMS_PATH} className="font-medium text-accent underline underline-offset-2">
                  Términos de uso
                </Link>{' '}
                y la{' '}
                <Link to={PRIVACY_PATH} className="font-medium text-accent underline underline-offset-2">
                  Política de privacidad
                </Link>
                .
              </p>
            </>
          ) : (
            <>
              <p className="text-sm">
                Lo sentimos: para tener cuenta hay que tener 18 años o más. Para jugar, pídele al organizador de tu liga que te anote como jugador
                sin cuenta, con el permiso de tu mamá, tu papá o tu tutor.
              </p>
              <p className="text-sm text-muted">Puedes salir de esta cuenta, o borrarla para que no quede nada tuyo.</p>
              {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
              <Button variant="primary" onClick={signOut} loading={busy === 'salir'} disabled={!!busy} icon={<LogOut className="size-4" />} className="h-11">
                Salir de la cuenta
              </Button>
              <Button variant="ghost" onClick={openDelete} loading={busy === 'borrar'} disabled={!!busy} icon={<UserX className="size-4" />} className="h-11 text-danger">
                Borrar esta cuenta
              </Button>
              <button type="button" onClick={() => setStep('ask')} className="min-h-11 text-sm font-medium text-accent">
                Me equivoqué: tengo 18 años o más
              </button>
            </>
          )}
        </Card>
      </div>
      {deleting && (
        <Suspense fallback={null}>
          <DeleteAccountDialog
            open={deleting}
            onClose={() => setDeleting(false)}
            onDeleted={() => {
              toast('Tu cuenta se borró.');
              navigate('/', { replace: true });
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
