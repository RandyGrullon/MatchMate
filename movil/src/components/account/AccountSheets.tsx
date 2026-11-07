/**
 * Configuración › tu cuenta, como src/pages/AccountPage.tsx: completar el nombre de una cuenta sin perfil, «Tu nombre»,
 * «Tu usuario» (UsernameForm de la web, con la misma revisión mientras escribe) y «Contraseña» (cambiarla o ponerte
 * una; se abre sola al volver del link de «Olvidé mi contraseña»). Cada cosa en su hoja.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, KeyRound } from 'lucide-react-native';
import { authErrorMessage, createProfile, renameProfile, updatePassword, useAuth, type AppUser } from '@mm/lib/auth';
import { checkUsername, normalizeUsername, setUsername, USERNAME_MAX, usernameErrorText, usernameProblem } from '@mm/lib/data/people';
import { saveErrorMessage } from '@mm/lib/errorText';
import { PASSWORD_MISMATCH_HINT, PASSWORD_SHORT_HINT, passwordCheck, passwordSheetTitle, USERNAME_CHECK_MS } from '@mm/components/cuenta/logic';
import { usernameHint, type UsernameCheck } from '@mm/components/social/socialFormat';
import { toast } from '../feedback';
import { Button, Card, ErrorNote, Field, Input, ListRow, RowIcon, Sheet, Txt } from '../ui';
import { useBigButton } from '@/components/home/proLook';
import { PasswordInput } from './PasswordInput';
import { useColors } from '@/theme/theme';

/** Guarda el nombre (crea el perfil si la cuenta no lo tenía). true si quedó. */
async function saveName(user: Pick<AppUser, 'uid'>, hasProfile: boolean, name: string): Promise<boolean> {
  try {
    if (hasProfile) await renameProfile(user, name);
    else await createProfile(user, name);
    toast('Nombre guardado');
    return true;
  } catch (e) {
    console.error(e);
    toast(saveErrorMessage(e), 'error');
    return false;
  }
}

/** Cuenta sin perfil (el registro no alcanzó a crearlo): se completa con el nombre. */
export function NeedsProfileCard({ user }: { user: Pick<AppUser, 'uid'> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  // Pro: el botón de 48 (AccountPage de la web).
  const big = useBigButton();
  async function save() {
    if (busy || !name.trim()) return;
    setBusy(true);
    await saveName(user, false, name);
    setBusy(false);
  }
  return (
    <Card style={{ gap: 16 }}>
      <Field label="Completa tu cuenta: ¿cómo te llamas?">
        <Input
          accessibilityLabel="Nombre y apellido"
          maxLength={60}
          autoFocus
          value={name}
          onChangeText={setName}
          placeholder="Nombre y apellido"
          autoComplete="name"
          textContentType="name"
          returnKeyType="done"
          onSubmitEditing={() => void save()}
        />
      </Field>
      <Button variant="primary" size={big} full loading={busy} disabled={!name.trim()} onPress={save}>
        Guardar
      </Button>
    </Card>
  );
}

/** «Tu nombre»: se abre con el de ahora escrito. */
export function NameSheet({ user, current, onClose }: { user: Pick<AppUser, 'uid'>; current: string; onClose: () => void }) {
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (busy || !name.trim()) return;
    setBusy(true);
    const ok = await saveName(user, true, name);
    setBusy(false);
    if (ok) onClose();
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title="Tu nombre"
      footer={
        <Button variant="primary" size="xl" full loading={busy} disabled={!name.trim()} onPress={save}>
          Guardar
        </Button>
      }
    >
      <Field label="Nombre y apellido" hint="Así te ven en las tablas y en tus ligas.">
        <Input
          accessibilityLabel="Nombre y apellido"
          maxLength={60}
          autoFocus
          value={name}
          onChangeText={setName}
          placeholder="Nombre y apellido"
          autoComplete="name"
          textContentType="name"
          returnKeyType="done"
          onSubmitEditing={() => void save()}
        />
      </Field>
    </Sheet>
  );
}

/** «Tu usuario»: la hoja con el formulario. */
export function UsernameSheet({ uid, current, onClose }: { uid: string; current: string; onClose: () => void }) {
  return (
    <Sheet open onClose={onClose} title="Tu usuario" subtitle="Con él te encuentran y te invitan">
      <UsernameForm uid={uid} current={current} onDone={onClose} />
    </Sheet>
  );
}

/**
 * Cambiar el @usuario (UsernameForm de la web): el campo con la @ delante; mientras escribe dice si está disponible
 * (pregunta a la base 350 ms después de la última tecla) o qué le falta al formato. «Guardar» solo con uno libre o el
 * de ahora (ese solo cierra).
 */
function UsernameForm({ uid, current, onDone }: { uid: string; current: string; onDone: () => void }) {
  const c = useColors();
  const [value, setValue] = useState(current);
  const [check, setCheck] = useState<UsernameCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const v = normalizeUsername(value);

  useEffect(() => {
    if (!v || v === normalizeUsername(current) || usernameProblem(v)) return;
    let alive = true;
    const t = setTimeout(() => {
      // Si no se pudo preguntar (sin señal, muchas veces seguidas) no se dice nada: al guardar se revisa otra vez.
      checkUsername(v).then(
        (status) => alive && setCheck({ value: v, status }),
        () => alive && setCheck({ value: v, status: 'unknown' }),
      );
    }, USERNAME_CHECK_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [v, current]);

  const hint = usernameHint(value, current, check);

  async function save() {
    if (busy || !hint.canSave) return;
    if (v === normalizeUsername(current)) {
      onDone();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await setUsername(uid, v);
      toast(`Tu usuario ahora es @${saved}`);
      onDone();
    } catch (err) {
      setError(usernameErrorText(err, v));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <View style={{ gap: 8 }}>
        <Txt variant="bodyStrong" tone="fg2">
          Tu usuario
        </Txt>
        <View style={{ justifyContent: 'center' }}>
          <Input
            accessibilityLabel="Tu usuario"
            value={value}
            // Como lo guarda la base: minúsculas, sin espacios y sin la @ (ya está delante).
            onChangeText={(t) => {
              setValue(t.toLowerCase().replace(/\s+/g, '').replace(/^@+/, ''));
              setError(null);
            }}
            maxLength={USERNAME_MAX}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            // No es el usuario para entrar (ese es el correo): que el gestor de contraseñas no lo llene.
            autoComplete="off"
            textContentType="none"
            spellCheck={false}
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            invalid={hint.tone === 'danger'}
            placeholder="tu_usuario"
            style={{ paddingLeft: 34 }}
          />
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: 17 }}>
            <Txt tone="muted" style={{ fontSize: 17 }}>
              @
            </Txt>
          </View>
        </View>
        <Txt variant="meta" tone={hint.tone === 'ok' ? 'ok' : hint.tone === 'danger' ? 'danger' : 'muted'} accessibilityLiveRegion="polite" style={hint.tone !== 'muted' ? { fontWeight: '500' } : undefined}>
          {hint.text}
        </Txt>
      </View>
      {error && <ErrorNote>{error}</ErrorNote>}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button full onPress={onDone}>
            Cancelar
          </Button>
        </View>
        <View style={{ flex: 1 }}>
          <Button variant="primary" full loading={busy} disabled={!hint.canSave} icon={<Check size={18} color={c.accentFg} />} onPress={save}>
            Guardar
          </Button>
        </View>
      </View>
    </>
  );
}

/**
 * La fila «Contraseña» y su hoja para poner una nueva. Se abre sola al volver del link de «Olvidé mi contraseña»
 * (`/cuenta?recuperar=1` o la sesión de recuperar); las cuentas de Google también pueden ponerse una para entrar con su
 * correo.
 */
export function PasswordRow() {
  const c = useColors();
  const auth = useAuth();
  const params = useLocalSearchParams<{ recuperar?: string }>();
  const recovering = auth.recovering || params.recuperar === '1';
  const [open, setOpen] = useState(false);
  // Cerró la hoja que se abrió sola: no se vuelve a abrir hasta otra vuelta del link.
  const [closedRecovery, setClosedRecovery] = useState(false);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { short, mismatch, canSave } = passwordCheck(password, password2);
  const shown = open || (recovering && !closedRecovery);

  function close() {
    setOpen(false);
    if (recovering) setClosedRecovery(true);
    if (params.recuperar) router.setParams({ recuperar: undefined });
  }

  async function save() {
    if (busy || !canSave) return;
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      toast('Contraseña guardada');
      close();
      setPassword('');
      setPassword2('');
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ListRow
        icon={
          <RowIcon>
            <KeyRound size={20} color={c.accent} />
          </RowIcon>
        }
        title="Contraseña"
        subtitle="Cambiarla o ponerte una"
        onPress={() => setOpen(true)}
      />
      <Sheet
        open={shown}
        onClose={close}
        title={passwordSheetTitle(recovering)}
        footer={
          <Button variant="primary" size="xl" full loading={busy} disabled={!canSave} onPress={save}>
            Guardar
          </Button>
        }
      >
        <Field label="Contraseña nueva" hint={short ? PASSWORD_SHORT_HINT : null} error={short}>
          <PasswordInput label="Contraseña nueva" value={password} onChange={setPassword} invalid={short} autoFocus={recovering} />
        </Field>
        <Field label="Repite la contraseña" hint={mismatch ? PASSWORD_MISMATCH_HINT : null} error={mismatch}>
          <PasswordInput label="Repite la contraseña" value={password2} onChange={setPassword2} invalid={mismatch} />
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
      </Sheet>
    </>
  );
}
