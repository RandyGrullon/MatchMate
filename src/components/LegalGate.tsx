import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Check, ChevronRight, LogOut, ScrollText, ShieldCheck, UserX } from 'lucide-react';
import { logout, useAuth } from '../lib/auth';
import { acceptLegalOrSkip, legalErrorMessage } from '../lib/data/legal';
import { reportClientError } from '../lib/errorReport';
import {
  accountBeforeLegal,
  LEGAL_DOCS,
  legalChangesFor,
  legalDate,
  legalPending,
  neverAccepted,
  takeLegalPending,
  type LegalAccepted,
  type LegalDocKey,
} from '../lib/legal';
import { LEGAL_PATHS, PRIVACY_PATH, TERMS_PATH } from '../pages/legal/legal';
import { useFeedback } from './feedback';
import { Logo } from './Logo';
import { Button, Card, Loading } from './ui';

const DeleteAccountDialog = lazy(() => import('../pages/legal/DeleteAccountDialog'));

/**
 * «Actualizamos los términos»: quien aceptó una versión vieja de los Términos de uso o de la Política de privacidad
 * (o su cuenta es de antes de guardar la aceptación) ve lo nuevo y acepta antes de seguir, como la pantalla de
 * «tengo 18 años o más» (AdultGate, que va primero). Una cuenta nueva que nunca aceptó (entró con Google sin la
 * casilla) ve «Antes de seguir». Las dos páginas se pueden leer igual; puede salir de la cuenta o borrarla. Si marcó
 * «Acepto…» en «Crear cuenta» y después fue a Google, al volver se acepta solo (solo esa cuenta nueva).
 * Si la base no tiene las mismas versiones que la app (se publicó la app antes que la migración, o esta app quedó
 * vieja) o no tiene accept_legal (PGRST202 / 42883), aceptar no se puede guardar: sigue por esta vez (hasta
 * recargar), queda en Errores de la consola y se le vuelve a preguntar después. Así nadie se queda trancado.
 */
export function LegalGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { pathname } = useLocation();
  const [skipped, setSkipped] = useState<string | null>(null);
  if (!auth.user || !auth.needsLegal || auth.needsAdult || LEGAL_PATHS.includes(pathname) || skipped === auth.user.uid) return children;
  const uid = auth.user.uid;
  return (
    <LegalQuestion
      uid={uid}
      accepted={auth.profile?.legal ?? null}
      createdAt={auth.profile?.createdAt ?? null}
      onSkip={() => setSkipped(uid)}
    />
  );
}

const DOC_PATH: Record<LegalDocKey, string> = { terminos: TERMS_PATH, privacidad: PRIVACY_PATH };

/** «los Términos de uso y la Política de privacidad», «los Términos de uso» o «la Política de privacidad». */
function docsText(docs: readonly LegalDocKey[]): string {
  const one = (d: LegalDocKey) => (d === 'terminos' ? 'los Términos de uso' : 'la Política de privacidad');
  return docs.length > 1 ? `${one('terminos')} y ${one('privacidad')}` : one(docs[0] ?? 'terminos');
}

/**
 * `createdAt`: cuándo se creó la cuenta (profiles.created_at). Si es de antes de guardar la aceptación (aceptó el
 * texto sin versión), ve lo nuevo; y la casilla marcada antes de ir a Google solo vale si se creó después.
 * `onSkip`: la base tiene otras versiones y no se pudo guardar: sigue por esta vez.
 */
function LegalQuestion({
  uid,
  accepted,
  createdAt,
  onSkip,
}: {
  uid: string;
  accepted: LegalAccepted | null;
  createdAt: string | null;
  onSkip: () => void;
}) {
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const [busy, setBusy] = useState<'si' | 'salir' | 'auto' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const auto = useRef(false);
  const first = neverAccepted(accepted) && !accountBeforeLegal(createdAt);
  const pending = accepted ? legalPending(accepted) : (['terminos', 'privacidad'] as LegalDocKey[]);
  const changes = first ? [] : legalChangesFor(pending);

  /**
   * Guarda la aceptación; si la base no la puede guardar (otras versiones o sin accept_legal), sigue sin guardarla
   * (y queda en Errores de la consola).
   */
  async function accept(): Promise<void> {
    const skipped = await acceptLegalOrSkip(uid);
    if (skipped === null) return;
    reportClientError('error', new Error(skipped), { component: 'LegalGate' });
    toast('No pudimos guardar que aceptaste. Sigue usando la app; te lo volvemos a preguntar más adelante.');
    onSkip();
  }

  async function yes() {
    setBusy('si');
    setError(null);
    try {
      await accept();
    } catch (e) {
      setError(legalErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  // Marcó «Acepto…» antes de ir a Google y esta es la cuenta nueva: se acepta solo (una vez).
  useEffect(() => {
    if (auto.current) return;
    auto.current = true;
    if (!takeLegalPending(createdAt)) return;
    setBusy('auto');
    accept()
      .catch(() => setError('No se pudo guardar. Toca «Acepto» otra vez.'))
      .finally(() => setBusy(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, createdAt]);

  async function signOut() {
    setBusy('salir');
    try {
      const { unsubscribePush } = await import('../lib/push');
      await unsubscribePush(uid);
      await logout();
      navigate('/', { replace: true });
    } catch (e) {
      setError(legalErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (busy === 'auto') return <Loading label="Guardando…" />;

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Logo className="size-12" />
          <h1 className="text-2xl font-bold tracking-tight">{first ? 'Antes de seguir' : 'Actualizamos los términos'}</h1>
        </div>
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
            <p className="text-sm">
              {first
                ? 'Para usar MatchMate tienes que aceptar los Términos de uso y la Política de privacidad. Dicen qué puedes hacer en la app, qué datos guardamos y cómo los cuidamos.'
                : `Cambiamos ${docsText(pending)}. Esto es lo nuevo:`}
            </p>
          </div>
          {changes.length > 0 && (
            <ul className="flex list-disc flex-col gap-1.5 pl-9 text-sm marker:text-muted">
              {changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-col divide-y divide-line rounded-xl border border-line">
            {(['terminos', 'privacidad'] as const).map((d) => (
              <Link
                key={d}
                to={DOC_PATH[d]}
                className="flex min-h-12 items-center gap-3 px-3 py-2 text-sm transition hover:bg-surface-2"
              >
                <ScrollText className="size-4 shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-accent">{LEGAL_DOCS[d].title}</span>
                  <span className="block text-xs text-muted">Versión {legalDate(LEGAL_DOCS[d].version)}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
              </Link>
            ))}
          </div>
          {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
          <Button variant="primary" onClick={yes} loading={busy === 'si'} disabled={!!busy} icon={<Check className="size-4" />} className="h-11">
            Acepto
          </Button>
          <Button onClick={signOut} loading={busy === 'salir'} disabled={!!busy} icon={<LogOut className="size-4" />} className="h-11">
            Salir de la cuenta
          </Button>
          <p className="text-center text-xs text-muted">
            Si no estás de acuerdo, puedes salir o{' '}
            <button type="button" onClick={() => setDeleting(true)} disabled={!!busy} className="inline-flex min-h-11 items-center gap-1 font-medium text-danger">
              <UserX className="size-3.5" aria-hidden="true" />
              borrar tu cuenta
            </button>
            .
          </p>
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
