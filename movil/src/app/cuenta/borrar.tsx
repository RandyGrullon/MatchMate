import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Download, Globe, Trash2, X } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { accountErrorMessage, DELETE_WORD, deleteMyAccount, fetchDeletePlan, type DeletePlan } from '@mm/pages/legal/account';
import { toast } from '@/components/feedback';
import { Button, Card, Empty, ErrorNote, Field, Input, Loading, Screen, Txt } from '@/components/ui';
import { shareMyData } from '@/lib/myData';
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Borrar la cuenta desde la app (regla 5.1.1(v) de Apple), con el mismo camino de la web
 * (src/pages/legal/DeleteAccountDialog.tsx): revisar qué la detiene (ligas a su nombre, último superadmin), decir qué se
 * borra y qué se queda, escribir BORRAR y llamar a la Edge Function delete-account (deleteMyAccount, compartido).
 */
export default function DeleteAccountScreen() {
  const c = useColors();
  const auth = useAuth();
  const uid = auth.user?.uid ?? null;
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState<'borrar' | 'datos' | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Lo que respondió la revisión de este intento (lo de un intento anterior no cuenta: «revisando»).
  const [checked, setChecked] = useState<{ attempt: number; plan: DeletePlan | null; error: string | null } | null>(null);
  // El error de borrar o de bajar los datos.
  const [actionError, setActionError] = useState<string | null>(null);
  const current = checked?.attempt === attempt ? checked : null;
  const plan = current?.plan ?? null;
  const error = actionError ?? current?.error ?? null;

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    fetchDeletePlan()
      .then((p) => alive && setChecked({ attempt, plan: p, error: null }))
      .catch((e: unknown) => alive && setChecked({ attempt, plan: null, error: accountErrorMessage(e) }));
    return () => {
      alive = false;
    };
  }, [uid, attempt]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/yo'));

  if (!uid) {
    return (
      <Screen>
        <Empty title="Entra a tu cuenta" text="Para borrar tu cuenta, primero entra con ella." action={<Button onPress={() => router.replace('/login')}>Entrar</Button>} />
      </Screen>
    );
  }
  if (!plan && !error) return <Loading label="Revisando tu cuenta" />;

  async function remove() {
    if (!uid || busy || word.trim().toUpperCase() !== DELETE_WORD) return;
    setBusy('borrar');
    setActionError(null);
    try {
      await deleteMyAccount(uid);
      toast('Tu cuenta se borró. Gracias por jugar con MatchMate.');
      router.dismissTo('/');
    } catch (e) {
      setActionError(accountErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function data() {
    setBusy('datos');
    try {
      const name = await shareMyData();
      toast(`Listo: ${name}`);
    } catch (e) {
      setActionError(accountErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const owned = plan?.ownedLeagues ?? [];
  const lastSuper = plan?.blockers.includes('last_superadmin') ?? false;
  const s = plan?.summary;

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt variant="title">Borrar mi cuenta</Txt>
        <Button variant="ghost" accessibilityLabel="Cerrar" icon={<X size={22} color={c.fg} />} disabled={busy === 'borrar'} onPress={close} />
      </View>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!plan && error && (
        <Button
          onPress={() => {
            setActionError(null);
            setAttempt((n) => n + 1);
          }}
        >
          Reintentar
        </Button>
      )}

      {plan && !plan.canDelete && (
        <Card style={{ gap: 12 }}>
          {owned.length > 0 && (
            <>
              <Txt variant="cardTitle">{owned.length === 1 ? 'Primero, tu liga' : `Primero, tus ${owned.length} ligas`}</Txt>
              <Txt tone="fg2">
                {owned.length === 1 ? 'Esta liga está a tu nombre' : 'Estas ligas están a tu nombre'}: pásala a otro miembro o bórrala antes de borrar tu
                cuenta.
              </Txt>
              {owned.map((l) => (
                <Txt key={l.id} variant="bodyStrong">
                  • {l.name} <Txt variant="meta" tone="muted">({plural(l.memberCount, 'miembro', 'miembros')})</Txt>
                </Txt>
              ))}
            </>
          )}
          {lastSuper && (
            <>
              <Txt variant="cardTitle">Eres el único superadmin</Txt>
              <Txt tone="fg2">Antes de irte, nombra a otra cuenta superadmin en la consola.</Txt>
            </>
          )}
          <Button full icon={<Globe size={18} color={c.fg} />} onPress={() => openOnWeb(lastSuper && !owned.length ? '/superadmin/cuentas' : '/cuenta')}>
            Resolverlo en la web
          </Button>
          <Button
            variant="ghost"
            full
            onPress={() => {
              setActionError(null);
              setAttempt((n) => n + 1);
            }}
          >
            Ya lo hice: revisar otra vez
          </Button>
        </Card>
      )}

      {plan?.canDelete && (
        <>
          <Card style={{ gap: 10 }}>
            <Txt variant="cardTitle">Esto no se puede deshacer</Txt>
            <Txt variant="bodyStrong">Se borra:</Txt>
            <Txt tone="fg2">• Tu cuenta, tu correo, tu perfil y tus publicaciones.</Txt>
            {!!s?.comments && <Txt tone="fg2">• {plural(s.comments, 'comentario', 'comentarios')}.</Txt>}
            {!!s?.reactions && <Txt tone="fg2">• {plural(s.reactions, 'reacción', 'reacciones')}.</Txt>}
            {!!s?.devices && <Txt tone="fg2">• Los avisos de {plural(s.devices, 'teléfono', 'teléfonos')}.</Txt>}
            <Txt variant="bodyStrong" style={{ marginTop: 6 }}>
              Se queda en las ligas:
            </Txt>
            <Txt tone="fg2">
              • Tus juegos y resultados{s?.leagues ? ` (${plural(s.leagues, 'liga', 'ligas')})` : ''}, como jugador sin cuenta: la tabla no cambia.
            </Txt>
            <Txt variant="meta" tone="warn" style={{ marginTop: 6 }}>
              Lo que anotaste sin señal y todavía no se envió se pierde.
            </Txt>
          </Card>
          <Button size="xl" full loading={busy === 'datos'} disabled={!!busy} icon={<Download size={20} color={c.fg} />} onPress={data}>
            Descargar mis datos antes
          </Button>
          <Field label={`Para confirmar, escribe ${DELETE_WORD}`}>
            <Input accessibilityLabel={`Escribe ${DELETE_WORD} para confirmar`} autoCapitalize="characters" autoCorrect={false} value={word} onChangeText={setWord} />
          </Field>
          <Button
            variant="danger"
            size="xl"
            full
            loading={busy === 'borrar'}
            disabled={!!busy || word.trim().toUpperCase() !== DELETE_WORD}
            icon={<Trash2 size={20} color={c.onDanger} />}
            onPress={remove}
          >
            Borrar mi cuenta para siempre
          </Button>
        </>
      )}
    </Screen>
  );
}
