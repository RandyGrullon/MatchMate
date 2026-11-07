import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, Eye, EyeOff, MailCheck, X } from 'lucide-react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { authErrorMessage, isEmailNotConfirmed, login, loginWithGoogle, MIN_PASSWORD, rememberAdultForGoogle, resendConfirmation, resetPassword, signUp } from '@mm/lib/auth';
import { rememberLegalForGoogle } from '@mm/lib/legal';
import { appleAvailable, signInWithApple } from '@/platform/backend';
import { LogoLockup } from '@/components/Logo';
import { Button, Card, ErrorNote, Field, Input, Screen, Segmented, Txt } from '@/components/ui';
import { openOnWeb } from '@/lib/web';
import { useColors, useTheme } from '@/theme/theme';

type Mode = 'entrar' | 'registro' | 'recuperar';

/** Casilla con su texto (Tengo 18 años o más, Acepto los Términos…). */
function CheckRow({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 44, paddingVertical: 4 }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 7,
          borderWidth: 2,
          borderColor: checked ? c.accent : c.faint,
          backgroundColor: checked ? c.accent : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        }}
      >
        {checked && <Check size={16} color={c.accentFg} strokeWidth={3} />}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}

function PasswordInput({ value, onChange, label, newPassword, invalid }: { value: string; onChange: (v: string) => void; label: string; newPassword?: boolean; invalid?: boolean }) {
  const c = useColors();
  const [shown, setShown] = useState(false);
  return (
    <View style={{ justifyContent: 'center' }}>
      <Input
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        secureTextEntry={!shown}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={newPassword ? 'new-password' : 'current-password'}
        textContentType={newPassword ? 'newPassword' : 'password'}
        invalid={invalid}
        style={{ paddingRight: 52 }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={shown ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        onPress={() => setShown(!shown)}
        style={{ position: 'absolute', right: 4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        {shown ? <EyeOff size={20} color={c.muted} /> : <Eye size={20} color={c.muted} />}
      </Pressable>
    </View>
  );
}

/**
 * Entrar, crear la cuenta o pedir una contraseña nueva: lo mismo que src/pages/LoginPage.tsx (las mismas reglas y
 * mensajes de src/lib/auth.tsx). Google e «Iniciar sesión con Apple» van juntos (regla 4.8 de Apple).
 */
export default function LoginScreen() {
  const c = useColors();
  const { isDark } = useTheme();
  const params = useLocalSearchParams<{ modo?: string; next?: string }>();
  // A dónde volver al entrar (como `?next=` de la web): solo una dirección de la app, nunca otro sitio.
  const next = typeof params.next === 'string' && params.next.startsWith('/') && !params.next.startsWith('//') ? params.next : '/';
  const [mode, setMode] = useState<Mode>(params.modo === 'registro' ? 'registro' : 'entrar');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<'confirmar' | 'recuperar' | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [social, setSocial] = useState<'google' | 'apple' | null>(null);
  const [apple, setApple] = useState(false);
  useEffect(() => {
    void appleAvailable().then(setApple);
  }, []);
  // Regla 4.8 de Apple: en iPhone, Google solo junto a «Iniciar sesión con Apple».
  const googleShown = Platform.OS !== 'ios' || apple;

  const signingUp = mode === 'registro';
  const short = signingUp && password !== '' && password.length < MIN_PASSWORD;
  const mismatch = signingUp && password2 !== '' && password !== password2;
  const blankName = signingUp && name !== '' && !name.trim();
  const canSubmit =
    !!email.trim() &&
    (mode === 'recuperar' || !!password) &&
    (!signingUp || (!!name.trim() && !short && !mismatch && !!password2 && adult && terms));

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setSent(null);
    setUnconfirmed(false);
    setPassword('');
    setPassword2('');
  }

  async function submit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    setUnconfirmed(false);
    try {
      if (mode === 'recuperar') {
        await resetPassword(email);
        setSent('recuperar');
      } else if (signingUp) {
        const { needsConfirm } = await signUp(name.trim(), email, password, adult, undefined, terms, null);
        if (needsConfirm) setSent('confirmar');
        else router.dismissTo(next as never);
      } else {
        await login(email, password);
        router.dismissTo(next as never);
      }
    } catch (e) {
      setError(authErrorMessage(e));
      setUnconfirmed(mode === 'entrar' && isEmailNotConfirmed(e));
    } finally {
      setBusy(false);
    }
  }

  /** Google o Apple. Al crear la cuenta, primero las dos casillas (quedan marcadas para cuando vuelva, como la web). */
  async function withProvider(kind: 'google' | 'apple') {
    if (busy || social) return;
    if (signingUp && (!adult || !terms)) {
      setError('Marca primero las dos casillas: tener 18 años o más y aceptar los Términos.');
      return;
    }
    if (signingUp) {
      rememberAdultForGoogle();
      rememberLegalForGoogle();
    }
    setSocial(kind);
    setError(null);
    try {
      if (kind === 'google') await loginWithGoogle();
      else await signInWithApple();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setSocial(null);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <LogoLockup />
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <X size={24} color={c.fg} />
          </Pressable>
        </View>
        <View style={{ gap: 6 }}>
          <Txt variant="title">{mode === 'recuperar' ? 'Contraseña nueva' : signingUp ? 'Crea tu cuenta' : 'Entra a tu cuenta'}</Txt>
          <Txt tone="muted">{signingUp ? 'Es gratis. Después te unes a tu liga con su código.' : mode === 'recuperar' ? 'Te mandamos un link a tu correo.' : 'Con tu correo y tu contraseña.'}</Txt>
        </View>

        {sent ? (
          <Card style={{ gap: 12, alignItems: 'center' }}>
            <MailCheck size={36} color={c.accent} />
            <Txt variant="cardTitle" style={{ textAlign: 'center' }}>
              Revisa tu correo
            </Txt>
            <Txt tone="fg2" style={{ textAlign: 'center' }}>
              {sent === 'confirmar'
                ? `Te mandamos un link a ${email.trim()} para confirmar tu cuenta. Ábrelo y después entra con tu correo y contraseña.`
                : `Si ${email.trim()} tiene cuenta, te llegará un link para poner una contraseña nueva.`}
            </Txt>
            <Button full onPress={() => switchMode('entrar')}>
              Volver a entrar
            </Button>
          </Card>
        ) : (
          <>
            {mode !== 'recuperar' && (
              <Segmented<Mode>
                label="Entrar o crear cuenta"
                value={mode}
                onChange={switchMode}
                options={[
                  { key: 'entrar', label: 'Entrar' },
                  { key: 'registro', label: 'Crear cuenta' },
                ]}
              />
            )}
            <Card style={{ gap: 18 }}>
              {signingUp && (
                <View style={{ gap: 4 }}>
                  <CheckRow checked={adult} onChange={setAdult}>
                    <Txt>
                      <Txt variant="bodyStrong">Tengo 18 años o más.</Txt> <Txt tone="muted">Los menores juegan sin cuenta, en ligas que lleva un adulto.</Txt>
                    </Txt>
                  </CheckRow>
                  <CheckRow checked={terms} onChange={setTerms}>
                    <Txt>
                      Acepto los{' '}
                      <Txt tone="accent" variant="bodyStrong" onPress={() => openOnWeb('/terminos')}>
                        Términos
                      </Txt>{' '}
                      y la{' '}
                      <Txt tone="accent" variant="bodyStrong" onPress={() => openOnWeb('/privacidad')}>
                        Política de privacidad
                      </Txt>
                      .
                    </Txt>
                  </CheckRow>
                </View>
              )}
              {(apple || googleShown) && (
                <View style={{ gap: 10 }}>
                  {apple && (
                    <AppleAuthentication.AppleAuthenticationButton
                      buttonType={signingUp ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                      buttonStyle={isDark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                      cornerRadius={16}
                      style={{ height: 56, width: '100%', opacity: social ? 0.6 : 1 }}
                      onPress={() => void withProvider('apple')}
                    />
                  )}
                  {googleShown && (
                    <Button size="xl" full loading={social === 'google'} disabled={!!social || busy} onPress={() => withProvider('google')}>
                      {signingUp ? 'Registrarme con Google' : 'Entrar con Google'}
                    </Button>
                  )}
                  <Txt variant="meta" tone="muted" style={{ textAlign: 'center' }}>
                    o con tu correo
                  </Txt>
                </View>
              )}
              {signingUp && (
                <Field label="Tu nombre" hint={blankName ? 'Escribe el nombre (no solo espacios).' : null} error={blankName}>
                  <Input accessibilityLabel="Tu nombre" value={name} onChangeText={setName} maxLength={60} autoComplete="name" textContentType="name" invalid={blankName} />
                </Field>
              )}
              <Field label="Correo">
                <Input
                  accessibilityLabel="Correo"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  textContentType="emailAddress"
                />
              </Field>
              {mode !== 'recuperar' && (
                <Field label="Contraseña" hint={short ? `Mínimo ${MIN_PASSWORD} caracteres.` : null} error={short}>
                  <PasswordInput label="Contraseña" value={password} onChange={setPassword} newPassword={signingUp} invalid={short} />
                </Field>
              )}
              {signingUp && (
                <Field label="Repite la contraseña" hint={mismatch ? 'Las contraseñas no coinciden.' : null} error={mismatch}>
                  <PasswordInput label="Repite la contraseña" value={password2} onChange={setPassword2} newPassword invalid={mismatch} />
                </Field>
              )}
              {error && <ErrorNote>{error}</ErrorNote>}
              {unconfirmed && (
                <Button
                  variant="soft"
                  full
                  onPress={async () => {
                    try {
                      await resendConfirmation(email);
                      setSent('confirmar');
                    } catch (e) {
                      setError(authErrorMessage(e));
                    }
                  }}
                >
                  Mandarme otra vez el link
                </Button>
              )}
              <Button variant="primary" size="xl" full loading={busy} disabled={!canSubmit} onPress={submit}>
                {mode === 'recuperar' ? 'Mandar el link' : signingUp ? 'Crear cuenta' : 'Entrar'}
              </Button>
              {mode === 'entrar' && (
                <Button variant="ghost" full onPress={() => switchMode('recuperar')}>
                  Olvidé mi contraseña
                </Button>
              )}
              {mode === 'recuperar' && (
                <Button variant="ghost" full onPress={() => switchMode('entrar')}>
                  Volver a entrar
                </Button>
              )}
            </Card>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
