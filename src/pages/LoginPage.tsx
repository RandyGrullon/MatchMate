import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { MailCheck } from 'lucide-react';
import {
  afterLoginPath,
  authErrorMessage,
  isEmailNotConfirmed,
  login,
  loginWithGoogle,
  MIN_PASSWORD,
  rememberAdultForGoogle,
  resendConfirmation,
  resetPassword,
  signUp,
  syncAfterLogin,
  useAuth,
} from '../lib/auth';
import { pendingByUser } from '../lib/db/outbox';
import { Button, Card, Loading, Segmented } from '../components/ui';
import { AuthHead, AuthScreen, BackBar, BigField, BigInput, CheckRow, ErrorNote, OrDivider } from '../components/cuenta/kit';
import { PasswordInput } from '../components/PasswordInput';
import { captchaEnabled, Turnstile } from '../components/Turnstile';
import { AcceptTermsBox } from '../components/AcceptTermsBox';
import { rememberLegalForGoogle } from '../lib/legal';
import { PRIVACY_PATH, TERMS_PATH } from './legal/legal';

type Mode = 'entrar' | 'registro' | 'recuperar';

/** La "G" de Google con sus colores (botón de entrar con Google). */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

export default function LoginPage() {
  const { user, loading } = useAuth();
  const [params, setParams] = useSearchParams();
  const modo = params.get('modo');
  const mode: Mode = modo === 'registro' ? 'registro' : modo === 'recuperar' ? 'recuperar' : 'entrar';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  // «Tengo 18 años o más»: obligatorio para crear la cuenta (las ligas con menores las lleva un adulto).
  const [adult, setAdult] = useState(false);
  // «Acepto los Términos y la Política de privacidad»: obligatorio para crear la cuenta (queda guardado con la versión).
  const [terms, setTerms] = useState(false);
  // Qué espera: entrar o crear la cuenta con el correo, con Google, o mandar el link para confirmar (cada uno su ruedita).
  const [busy, setBusy] = useState<'correo' | 'google' | 'confirmar' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Qué correo se mandó: para confirmar la cuenta nueva o para poner otra contraseña.
  const [sent, setSent] = useState<'confirmar' | 'recuperar' | null>(null);
  // Entró con una cuenta sin confirmar el correo (las traídas de BowlingX nunca recibieron el link): se ofrece mandarlo.
  const [unconfirmed, setUnconfirmed] = useState(false);
  // Cambios anotados sin señal que quedaron en el teléfono al salir: salen solos cuando esa cuenta entre.
  const [waiting, setWaiting] = useState(0);
  // Turnstile (si está activado): el token sirve una vez; después de cada intento se pide otro.
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaRound, setCaptchaRound] = useState(0);
  const needCaptcha = captchaEnabled();
  useEffect(() => {
    pendingByUser()
      .then((byUser) => setWaiting(Object.values(byUser).reduce((n, u) => n + u.pending, 0)))
      .catch(() => undefined);
  }, []);

  // A dónde volver (sin entrar, o al entrar): la pantalla de la que vino (si es de la app) o Home.
  const nextParam = params.get('next');
  const target = afterLoginPath(nextParam);
  const back = target ?? '/';

  // Sin cuenta: se guarda a dónde iba (p. ej. una invitación). Si crea la cuenta con Google o confirma el correo en
  // otra pestaña, al abrirse la sesión la app sigue ahí (ResumeAfterLogin) en lugar de quedarse en Home. Sin `next`
  // (o a Home) se borra lo guardado antes: una invitación vieja no se lleva a quien entra desde otro lado.
  const signedOut = !loading && !user;
  useEffect(() => {
    if (signedOut) syncAfterLogin(target);
  }, [signedOut, target]);

  if (user && !busy) {
    if (loading) return <Loading />;
    // Vuelve a donde estaba (solo rutas internas); si no, a Home.
    return <Navigate to={back} replace />;
  }

  const signingUp = mode === 'registro';
  const mismatch = signingUp && password2 !== '' && password !== password2;
  const short = signingUp && password !== '' && password.length < MIN_PASSWORD;

  function switchMode(m: Mode) {
    setError(null);
    setSent(null);
    setUnconfirmed(false);
    setPassword('');
    setPassword2('');
    const p = new URLSearchParams(params);
    if (m === 'entrar') p.delete('modo');
    else p.set('modo', m);
    setParams(p, { replace: true });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (signingUp && (password !== password2 || password.length < MIN_PASSWORD || !adult || !terms)) return;
    if (needCaptcha && !captcha) {
      setError('Espera la casilla de Cloudflare que comprueba que no eres un robot.');
      return;
    }
    setBusy('correo');
    setError(null);
    setUnconfirmed(false);
    const token = captcha ?? undefined;
    try {
      if (mode === 'recuperar') {
        await resetPassword(email, token);
        setSent('recuperar');
      } else if (signingUp) {
        const { needsConfirm } = await signUp(name, email, password, adult, token, terms, target);
        if (needsConfirm) setSent('confirmar');
      } else {
        await login(email, password, token);
      }
    } catch (err) {
      setError(authErrorMessage(err));
      setUnconfirmed(!signingUp && mode === 'entrar' && isEmailNotConfirmed(err));
    } finally {
      setBusy(null);
      if (needCaptcha) setCaptchaRound((n) => n + 1);
    }
  }

  /** Manda (otra vez) el link para confirmar el correo de la cuenta que no pudo entrar. */
  async function sendConfirmation() {
    if (needCaptcha && !captcha) {
      setError('Espera la casilla de Cloudflare que comprueba que no eres un robot.');
      return;
    }
    setBusy('confirmar');
    setError(null);
    try {
      await resendConfirmation(email, captcha ?? undefined, target);
      setUnconfirmed(false);
      setSent('confirmar');
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(null);
      if (needCaptcha) setCaptchaRound((n) => n + 1);
    }
  }

  /** Con Google sirve igual para entrar o registrarse: si no tenía cuenta, se crea. */
  async function google() {
    if (signingUp && (!adult || !terms)) return;
    setBusy('google');
    setError(null);
    // Marcó «tengo 18 años o más» y «Acepto…»: al volver de Google se guarda solo (sin preguntar otra vez).
    if (signingUp && adult) rememberAdultForGoogle();
    if (signingUp && terms) rememberLegalForGoogle();
    try {
      await loginWithGoogle(target);
    } catch (err) {
      setError(authErrorMessage(err) || null);
    } finally {
      setBusy(null);
    }
  }

  const adultBox = signingUp && (
    <CheckRow checked={adult} onChange={setAdult}>
      Tengo 18 años o más. <span className="text-muted">Los menores juegan sin cuenta, en ligas que lleva un adulto.</span>
    </CheckRow>
  );

  // Un título por pantalla: lo que se hace aquí. Debajo, una línea corta.
  const head = sent
    ? { title: 'Revisa tu correo', subtitle: null }
    : mode === 'recuperar'
      ? { title: 'Olvidé mi contraseña', subtitle: 'Te mandamos un link para poner una nueva.' }
      : signingUp
        ? { title: 'Crea tu cuenta', subtitle: 'Es gratis. Después te unes a tu liga con su código.' }
        : { title: 'Entra a tu cuenta', subtitle: 'Tus ligas, tus juegos y tus números.' };

  return (
    // «‹ Inicio» (o «‹ Volver» si venía de una pantalla de la app, como una invitación): dice a dónde vuelve.
    <AuthScreen top={<BackBar to={back} label={target ? 'Volver' : 'Inicio'} />}>
      <AuthHead title={head.title} subtitle={head.subtitle} />
      {!sent && mode !== 'recuperar' && (
        <Segmented
          full
          label="Entrar o crear cuenta"
          options={[
            { key: 'entrar', label: 'Entrar' },
            { key: 'registro', label: 'Crear cuenta' },
          ]}
          value={signingUp ? 'registro' : 'entrar'}
          onChange={switchMode}
          className="mt-6"
        />
      )}
      <Card className="mt-4 flex flex-col gap-5 p-5">
        {sent ? (
          <div className="flex flex-col items-start gap-4">
            <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
              <MailCheck className="size-7" />
            </span>
            <p className="text-body text-fg-2">
              {sent === 'confirmar'
                ? `Te mandamos un link a ${email.trim()} para confirmar tu cuenta. Ábrelo y después entra con tu correo y contraseña.${target ? ' Al entrar sigues donde ibas.' : ''}`
                : `Si ${email.trim()} tiene cuenta, te llegará un link para poner una contraseña nueva.`}
            </p>
            <Button variant="quiet" size="xl" onClick={() => switchMode('entrar')} className="w-full">
              Volver a entrar
            </Button>
          </div>
        ) : mode === 'recuperar' ? (
          <form onSubmit={submit} className="flex flex-col gap-5">
            <BigField label="Correo">
              <BigInput type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            </BigField>
            <Turnstile key="recuperar" onToken={setCaptcha} resetKey={captchaRound} />
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button type="submit" variant="primary" size="xl" loading={busy === 'correo'} disabled={!!busy} className="w-full">
              Mandar el link
            </Button>
          </form>
        ) : (
          <>
            {signingUp && (
              <div className="-my-1 flex flex-col">
                {adultBox}
                <AcceptTermsBox checked={terms} onChange={setTerms} />
              </div>
            )}
            <Button
              variant="quiet"
              size="xl"
              onClick={google}
              loading={busy === 'google'}
              disabled={!!busy || (signingUp && (!adult || !terms))}
              icon={<GoogleIcon />}
              className="w-full"
            >
              {signingUp ? 'Registrarme con Google' : 'Entrar con Google'}
            </Button>
            <OrDivider>o con tu correo</OrDivider>
            <form onSubmit={submit} className="flex flex-col gap-5">
              {signingUp && (
                <BigField label="Tu nombre">
                  <BigInput required maxLength={60} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                </BigField>
              )}
              <BigField label="Correo">
                <BigInput type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </BigField>
              <BigField label="Contraseña" hint={short ? `Mínimo ${MIN_PASSWORD} caracteres.` : undefined} error={short}>
                <PasswordInput value={password} onChange={setPassword} autoComplete={signingUp ? 'new-password' : 'current-password'} invalid={short} />
              </BigField>
              {signingUp && (
                <BigField label="Repite la contraseña" hint={mismatch ? 'Las contraseñas no coinciden.' : undefined} error={mismatch}>
                  <PasswordInput value={password2} onChange={setPassword2} autoComplete="new-password" invalid={mismatch} />
                </BigField>
              )}
              <Turnstile key="correo" onToken={setCaptcha} resetKey={captchaRound} />
              {error && <ErrorNote>{error}</ErrorNote>}
              {unconfirmed && (
                <Button
                  variant="soft"
                  size="xl"
                  onClick={sendConfirmation}
                  loading={busy === 'confirmar'}
                  disabled={!!busy || !email.trim()}
                  icon={<MailCheck className="size-5" />}
                  className="w-full"
                >
                  Mandarme el link para confirmar
                </Button>
              )}
              <Button
                type="submit"
                variant="primary"
                size="xl"
                loading={busy === 'correo'}
                disabled={!!busy || (signingUp && (mismatch || short || !password2 || !adult || !terms))}
                className="w-full"
              >
                {signingUp ? 'Crear cuenta' : 'Entrar'}
              </Button>
            </form>
          </>
        )}
      </Card>
      {/* Debajo de la tarjeta, como link (no compite con el botón): «Olvidé mi contraseña» o «Volver a entrar». */}
      {!sent && mode === 'entrar' && (
        <button type="button" onClick={() => switchMode('recuperar')} className="mt-2 min-h-11 self-center px-3 text-meta font-semibold text-accent">
          Olvidé mi contraseña
        </button>
      )}
      {!sent && mode === 'recuperar' && (
        <button type="button" onClick={() => switchMode('entrar')} className="mt-2 min-h-11 self-center px-3 text-meta font-semibold text-accent">
          Volver a entrar
        </button>
      )}
      {waiting > 0 && (
        <p className="mt-4 rounded-2xl bg-warn-soft px-4 py-3 text-[13px] leading-snug text-warn">
          {waiting === 1 ? 'Hay 1 cambio sin enviar' : `Hay ${waiting} cambios sin enviar`} en este teléfono: entra con la cuenta que los anotó y salen solos.
        </p>
      )}
      {/* Al crear la cuenta las casillas ya lo dicen; al entrar, una línea. */}
      {!signingUp && (
        <p className="mx-2 mt-4 text-center text-[13px] leading-snug text-muted">
          Solo para mayores de 18 años. Al entrar aceptas los{' '}
          <Link to={TERMS_PATH} className="font-medium text-accent underline underline-offset-2">
            Términos
          </Link>{' '}
          y la{' '}
          <Link to={PRIVACY_PATH} className="font-medium text-accent underline underline-offset-2">
            Privacidad
          </Link>
          .
        </p>
      )}
    </AuthScreen>
  );
}
