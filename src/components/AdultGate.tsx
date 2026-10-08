import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Check, LogOut, UserX } from 'lucide-react';
import { authErrorMessage, confirmAdult, logout, takeAdultPending, useAuth } from '../lib/auth';
import { LEGAL_PATHS, PRIVACY_PATH, TERMS_PATH } from '../pages/legal/legal';
import { BusyIcon } from './busy';
import { AuthHead, AuthScreen, ErrorNote } from './cuenta/kit';
import { useFeedback } from './feedback';
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
    // Pantalla suelta (sin la barra de abajo), como Entrar: el título, la pregunta en una tarjeta y un solo botón fuerte.
    <AuthScreen>
      {step === 'ask' ? (
        <>
          <AuthHead title="Antes de seguir" subtitle="Las cuentas de MatchMate son solo para mayores de 18 años." />
          <Card className="mt-6 flex flex-col gap-5 p-5">
            <div>
              <p className="text-card-title-pro">¿Tienes 18 años o más?</p>
              <p className="mt-1.5 text-meta text-fg-2">Los menores juegan sin cuenta, en ligas que lleva un adulto.</p>
            </div>
            {error && <ErrorNote>{error}</ErrorNote>}
            <div className="flex flex-col gap-2.5">
              <Button variant="primary" size="xl" onClick={yes} loading={busy === 'si'} disabled={!!busy} icon={<Check className="size-5" />} className="w-full">
                Sí, tengo 18 años o más
              </Button>
              <Button variant="quiet" size="xl" onClick={() => setStep('minor')} disabled={!!busy} className="w-full">
                No, soy menor de 18
              </Button>
            </div>
          </Card>
          <p className="mx-2 mt-4 text-center text-[13px] leading-snug text-muted">
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
          <AuthHead title="MatchMate es para adultos" subtitle="Para tener cuenta hay que tener 18 años o más." />
          <Card className="mt-6 flex flex-col gap-5 p-5">
            <p className="text-meta text-fg-2">
              Para jugar, pídele al organizador de tu liga que te anote como jugador sin cuenta, con el permiso de tu mamá, tu papá o tu tutor.
            </p>
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button variant="primary" size="xl" onClick={signOut} loading={busy === 'salir'} disabled={!!busy} icon={<LogOut className="size-5" />} className="w-full">
              Salir de la cuenta
            </Button>
            <button
              type="button"
              onClick={openDelete}
              disabled={!!busy}
              aria-busy={busy === 'borrar' || undefined}
              className="-my-1 inline-flex min-h-11 items-center justify-center gap-2 self-center px-3 text-meta font-semibold text-danger transition active:opacity-70 disabled:opacity-60"
            >
              <BusyIcon busy={busy === 'borrar'} icon={<UserX className="size-[18px]" aria-hidden="true" />} className="size-[18px]" />
              Borrar esta cuenta
            </button>
          </Card>
          <button type="button" onClick={() => setStep('ask')} className="mt-3 min-h-11 self-center px-3 text-meta font-semibold text-accent">
            Me equivoqué: tengo 18 años o más
          </button>
        </>
      )}
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
    </AuthScreen>
  );
}
