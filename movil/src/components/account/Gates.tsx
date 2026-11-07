/**
 * Las puertas de la cuenta, como la web (src/components/AdultGate.tsx y LegalGate.tsx), con la misma lógica compartida:
 * primero «¿Tienes 18 años o más?» (quien entró con Google y todavía no lo dijo) y después aceptar los Términos de uso y
 * la Política de privacidad vigentes. Tapan la app hasta que se responde; se puede salir o borrar la cuenta.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { FileText, LogOut, Shield, ShieldCheck } from 'lucide-react-native';
import { authErrorMessage, confirmAdult, logout, takeAdultPending, useAuth } from '@mm/lib/auth';
import { acceptLegalOrSkip, legalErrorMessage } from '@mm/lib/data/legal';
import { reportClientError } from '@mm/lib/errorReport';
import { unsubscribePush } from '@mm/lib/push';
import { accountBeforeLegal, LEGAL_DOCS, legalChangesFor, legalDate, legalPending, neverAccepted, takeLegalPending, type LegalDocKey } from '@mm/lib/legal';
import { LEGAL_PATHS } from '@mm/pages/legal/legal';
import { LogoLockup } from '../Logo';
import { toast } from '../feedback';
import { Button, Card, Divider, ErrorNote, ListRow, RowIcon, Screen, Txt } from '../ui';
import { openLegal } from '@/components/legal/links';
import { useColors } from '@/theme/theme';

/**
 * Rutas donde no se tapa nada: borrar la cuenta (se llega desde las puertas) y los Términos y la Privacidad (se leen
 * aunque falte decir «tengo 18 años o más» o aceptar los nuevos, como LEGAL_PATHS en la web).
 */
const OPEN_PATHS = ['/cuenta/borrar', ...LEGAL_PATHS];

/** Va sobre la navegación (en _layout.tsx). */
export function AccountGates() {
  const auth = useAuth();
  const path = usePathname();
  const [skipped, setSkipped] = useState<string | null>(null);
  if (!auth.user || OPEN_PATHS.includes(path)) return null;
  const uid = auth.user.uid;
  if (auth.needsAdult) return <AdultQuestion uid={uid} createdAt={auth.profile?.createdAt ?? null} />;
  if (auth.needsLegal && skipped !== uid) {
    return <LegalQuestion uid={uid} accepted={auth.profile?.legal ?? null} createdAt={auth.profile?.createdAt ?? null} onSkip={() => setSkipped(uid)} />;
  }
  return null;
}

function Cover({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg, zIndex: 10 }]}>{children}</View>;
}

async function signOut(uid: string) {
  // Como la web (AdultGate/LegalGate): sin los avisos de la cuenta en este teléfono.
  await unsubscribePush(uid);
  await logout();
  router.replace('/');
}

function AdultQuestion({ uid, createdAt }: { uid: string; createdAt: string | null }) {
  const c = useColors();
  const [step, setStep] = useState<'ask' | 'minor'>('ask');
  const [busy, setBusy] = useState<'si' | 'salir' | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  // Marcó «Tengo 18 años o más» antes de ir a Google y esta es la cuenta nueva: se confirma solo (una vez).
  useEffect(() => {
    if (auto.current) return;
    auto.current = true;
    if (takeAdultPending(createdAt)) void Promise.resolve().then(yes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, createdAt]);

  return (
    <Cover>
      <Screen edges={['top', 'bottom']}>
        <LogoLockup />
        {step === 'ask' ? (
          <>
            <View style={{ gap: 6 }}>
              <Txt variant="title">Antes de seguir</Txt>
              <Txt tone="muted">Las cuentas de MatchMate son solo para mayores de 18 años.</Txt>
            </View>
            <Card style={{ gap: 14 }}>
              <Txt variant="cardTitle">¿Tienes 18 años o más?</Txt>
              <Txt tone="fg2">Los menores juegan sin cuenta, en ligas que lleva un adulto.</Txt>
              {error && <ErrorNote>{error}</ErrorNote>}
              <Button variant="primary" size="xl" full loading={busy === 'si'} disabled={!!busy} onPress={yes}>
                Sí, tengo 18 años o más
              </Button>
              <Button size="xl" full disabled={!!busy} onPress={() => setStep('minor')}>
                No, soy menor de 18
              </Button>
            </Card>
            <Txt variant="meta" tone="muted" style={{ textAlign: 'center' }}>
              Al seguir aceptas los{' '}
              <Txt variant="meta" tone="accent" onPress={() => openLegal('terminos')}>
                Términos de uso
              </Txt>{' '}
              y la{' '}
              <Txt variant="meta" tone="accent" onPress={() => openLegal('privacidad')}>
                Política de privacidad
              </Txt>
              .
            </Txt>
          </>
        ) : (
          <>
            <View style={{ gap: 6 }}>
              <Txt variant="title">MatchMate es para adultos</Txt>
              <Txt tone="muted">Para tener cuenta hay que tener 18 años o más.</Txt>
            </View>
            <Card style={{ gap: 14 }}>
              <Txt tone="fg2">Pídele a quien organiza tu liga que te agregue como jugador sin cuenta: así juegas y sales en la tabla.</Txt>
              <Button
                size="xl"
                full
                loading={busy === 'salir'}
                icon={<LogOut size={20} color={c.fg} />}
                onPress={async () => {
                  setBusy('salir');
                  await signOut(uid).catch((e: unknown) => setError(authErrorMessage(e)));
                  setBusy(null);
                }}
              >
                Salir de la cuenta
              </Button>
              <Button variant="ghost" full onPress={() => router.push('/cuenta/borrar')}>
                <Txt tone="danger" variant="bodyStrong">
                  Borrar esta cuenta
                </Txt>
              </Button>
            </Card>
            <Button variant="ghost" full onPress={() => setStep('ask')}>
              Me equivoqué: tengo 18 años o más
            </Button>
          </>
        )}
      </Screen>
    </Cover>
  );
}

function LegalQuestion({ uid, accepted, createdAt, onSkip }: { uid: string; accepted: Parameters<typeof legalPending>[0] | null; createdAt: string | null; onSkip: () => void }) {
  const c = useColors();
  const [busy, setBusy] = useState<'si' | 'salir' | 'auto' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const auto = useRef(false);
  const first = neverAccepted(accepted) && !accountBeforeLegal(createdAt);
  const pending: LegalDocKey[] = accepted ? legalPending(accepted) : ['terminos', 'privacidad'];
  const changes = first ? [] : legalChangesFor(pending);
  const docs = pending.length > 1 ? 'los Términos de uso y la Política de privacidad' : pending[0] === 'privacidad' ? 'la Política de privacidad' : 'los Términos de uso';

  /** Guarda la aceptación; si la base no la puede guardar, sigue por esta vez (y queda en Errores de la consola). */
  async function accept() {
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
    void Promise.resolve()
      .then(() => {
        setBusy('auto');
        return accept();
      })
      .catch(() => setError('No se pudo guardar. Toca «Acepto» otra vez.'))
      .finally(() => setBusy(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, createdAt]);

  return (
    <Cover>
      <Screen edges={['top', 'bottom']}>
        <LogoLockup />
        <View style={{ gap: 6 }}>
          <Txt variant="title">{first ? 'Antes de seguir' : 'Actualizamos los términos'}</Txt>
          <Txt tone="muted">{first ? 'Para usar MatchMate tienes que aceptar los Términos de uso y la Política de privacidad.' : `Cambiamos ${docs}. Esto es lo nuevo:`}</Txt>
        </View>
        {changes.length > 0 && (
          <Card style={{ gap: 8 }}>
            {changes.map((t) => (
              <Txt key={t} tone="fg2">
                • {t}
              </Txt>
            ))}
          </Card>
        )}
        <Card padded={false}>
          {(['terminos', 'privacidad'] as const).map((k, i) => (
            <View key={k}>
              {i > 0 && <Divider inset={68} />}
              <ListRow
                icon={<RowIcon>{k === 'terminos' ? <FileText size={20} color={c.accent} /> : <Shield size={20} color={c.accent} />}</RowIcon>}
                title={LEGAL_DOCS[k].title}
                subtitle={`Versión ${legalDate(LEGAL_DOCS[k].version)}`}
                onPress={() => openLegal(k)}
              />
            </View>
          ))}
        </Card>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button variant="primary" size="xl" full loading={busy === 'si' || busy === 'auto'} disabled={!!busy} icon={<ShieldCheck size={20} color={c.accentFg} />} onPress={yes}>
          Acepto
        </Button>
        <Button
          size="xl"
          full
          loading={busy === 'salir'}
          disabled={!!busy}
          icon={<LogOut size={20} color={c.fg} />}
          onPress={async () => {
            setBusy('salir');
            await signOut(uid).catch((e: unknown) => setError(legalErrorMessage(e)));
            setBusy(null);
          }}
        >
          Salir de la cuenta
        </Button>
        <Txt variant="meta" tone="muted" style={{ textAlign: 'center' }}>
          Si no estás de acuerdo, puedes salir o{' '}
          <Txt variant="meta" tone="danger" onPress={() => router.push('/cuenta/borrar')}>
            borrar tu cuenta
          </Txt>
          .
        </Txt>
      </Screen>
    </Cover>
  );
}
