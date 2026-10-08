import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Check, LogOut, ScrollText, ShieldCheck } from 'lucide-react';
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
import { BusyIcon } from './busy';
import { AuthHead, AuthScreen, ErrorNote } from './cuenta/kit';
import { Button, Card, ListRow, Loading, RowIcon } from './ui';

const loadDeleteDialog = () => import('../pages/legal/DeleteAccountDialog');
const DeleteAccountDialog = lazy(loadDeleteDialog);

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
  const [busy, setBusy] = useState<'si' | 'salir' | 'auto' | 'borrar' | null>(null);
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

  // El cuadro de borrar se baja la primera vez: la ruedita mientras llega (si no llega, el aviso sale al abrirlo).
  async function openDelete() {
    setBusy('borrar');
    await loadDeleteDialog().catch(() => undefined);
    setBusy(null);
    setDeleting(true);
  }

  if (busy === 'auto') return <Loading label="Guardando…" />;

  return (
    // Pantalla suelta (sin la barra de abajo), como Entrar: qué cambió, los dos textos en filas y «Acepto».
    <AuthScreen>
      <AuthHead
        title={first ? 'Antes de seguir' : 'Actualizamos los términos'}
        subtitle={first ? 'Para usar MatchMate tienes que aceptar los Términos de uso y la Política de privacidad.' : `Cambiamos ${docsText(pending)}. Esto es lo nuevo:`}
      />
      {changes.length > 0 && (
        <Card className="mt-6 p-5">
          <ul className="flex list-disc flex-col gap-2 pl-5 text-meta text-fg-2 marker:text-faint">
            {changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </Card>
      )}
      <Card className={changes.length ? 'mt-3.5 overflow-hidden' : 'mt-6 overflow-hidden'}>
        {(['terminos', 'privacidad'] as const).map((d) => (
          <ListRow
            key={d}
            leading={<RowIcon>{d === 'terminos' ? <ScrollText className="size-5" /> : <ShieldCheck className="size-5" />}</RowIcon>}
            title={LEGAL_DOCS[d].title}
            subtitle={`Versión ${legalDate(LEGAL_DOCS[d].version)}`}
            to={DOC_PATH[d]}
          />
        ))}
      </Card>
      {error && <ErrorNote className="mt-4">{error}</ErrorNote>}
      <div className="mt-6 flex flex-col gap-2.5">
        <Button variant="primary" size="xl" onClick={yes} loading={busy === 'si'} disabled={!!busy} icon={<Check className="size-5" />} className="w-full">
          Acepto
        </Button>
        <Button variant="quiet" size="xl" onClick={signOut} loading={busy === 'salir'} disabled={!!busy} icon={<LogOut className="size-5" />} className="w-full">
          Salir de la cuenta
        </Button>
      </div>
      <p className="mx-2 mt-3 text-center text-[13px] leading-snug text-muted">
        Si no estás de acuerdo, puedes salir o{' '}
        <button
          type="button"
          onClick={openDelete}
          disabled={!!busy}
          aria-busy={busy === 'borrar' || undefined}
          // En línea con el texto (no salta de renglón); se toca en 44 px de alto con su ::after.
          className="relative inline font-semibold text-danger after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] disabled:opacity-60"
        >
          <BusyIcon busy={busy === 'borrar'} className="mr-1 inline size-3.5 align-[-2px]" />
          borrar tu cuenta
        </button>
        .
      </p>
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
