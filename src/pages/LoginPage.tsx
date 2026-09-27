import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { ArrowLeft, LogIn, UserPlus } from 'lucide-react';
import { authErrorMessage, login, loginWithGoogle, MIN_PASSWORD, signUp, useAuth } from '../lib/auth';
import { Button, Card, Field, Input, Loading, Tabs } from '../components/ui';
import { Logo } from '../components/Logo';
import { PasswordInput } from '../components/PasswordInput';

type Mode = 'entrar' | 'registro';

/** La "G" de Google con sus colores (botón de entrar con Google). */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-4" aria-hidden="true">
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
  const mode: Mode = params.get('modo') === 'registro' ? 'registro' : 'entrar';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState<'correo' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Mientras se crea la cuenta no se redirige: el perfil (users/{uid}) todavía se está guardando.
  // A dónde volver sin entrar: la pantalla de la que vino (si es de la app) o Home.
  const nextParam = params.get('next');
  const back = nextParam?.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/';

  if (user && !busy) {
    if (loading) return <Loading />;
    // Vuelve a donde estaba (solo rutas internas); si no, a su liga.
    const next = params.get('next');
    return <Navigate to={next?.startsWith('/') && !next.startsWith('//') ? next : '/'} replace />;
  }

  const mismatch = mode === 'registro' && password2 !== '' && password !== password2;
  const short = mode === 'registro' && password !== '' && password.length < MIN_PASSWORD;

  function switchMode(m: Mode) {
    setError(null);
    setPassword('');
    setPassword2('');
    const p = new URLSearchParams(params);
    if (m === 'registro') p.set('modo', 'registro');
    else p.delete('modo');
    setParams(p, { replace: true });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === 'registro' && (password !== password2 || password.length < MIN_PASSWORD)) return;
    setBusy('correo');
    setError(null);
    try {
      if (mode === 'registro') await signUp(name, email, password);
      else await login(email, password);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  /** Con Google sirve igual para entrar o registrarse: si no tenía cuenta, se crea. */
  async function google() {
    setBusy('google');
    setError(null);
    try {
      await loginWithGoogle();
    } catch (err) {
      setError(authErrorMessage(err) || null);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link to={back} className="-mt-4 mb-4 inline-flex items-center gap-1.5 rounded-lg py-1 text-sm font-medium text-muted hover:text-fg">
          <ArrowLeft className="size-4" /> Volver
        </Link>
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Logo className="size-12" />
          <h1 className="text-2xl font-bold tracking-tight">BowlingX</h1>
          <p className="text-sm text-muted">Ligas y torneos de boliche</p>
        </div>
        <Card className="flex flex-col gap-4 p-5">
          <Tabs
            items={[
              { key: 'entrar', label: 'Entrar' },
              { key: 'registro', label: 'Crear cuenta' },
            ]}
            active={mode}
            onChange={switchMode}
          />
          <Button onClick={google} loading={busy === 'google'} disabled={!!busy} icon={<GoogleIcon />}>
            {mode === 'registro' ? 'Registrarme con Google' : 'Entrar con Google'}
          </Button>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" />o con tu correo
            <span className="h-px flex-1 bg-line" />
          </div>
          <form onSubmit={submit} className="flex flex-col gap-4">
            {mode === 'registro' && (
              <Field label="Tu nombre">
                <Input required maxLength={60} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            )}
            <Field label="Correo">
              <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Contraseña" hint={short ? `Mínimo ${MIN_PASSWORD} caracteres.` : undefined}>
              <PasswordInput
                value={password}
                onChange={setPassword}
                autoComplete={mode === 'registro' ? 'new-password' : 'current-password'}
                invalid={short}
              />
            </Field>
            {mode === 'registro' && (
              <Field label="Repite la contraseña" hint={mismatch ? 'Las contraseñas no coinciden.' : undefined}>
                <PasswordInput value={password2} onChange={setPassword2} autoComplete="new-password" invalid={mismatch} />
              </Field>
            )}
            {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
            <Button
              type="submit"
              variant="primary"
              loading={busy === 'correo'}
              disabled={!!busy || (mode === 'registro' && (mismatch || short || !password2))}
              icon={mode === 'registro' ? <UserPlus className="size-4" /> : <LogIn className="size-4" />}
            >
              {mode === 'registro' ? 'Crear cuenta' : 'Entrar'}
            </Button>
          </form>
        </Card>
        <p className="mt-4 text-center text-xs text-muted">
          {mode === 'registro'
            ? 'Después te unes a tu liga y eliges quién eres en la lista de jugadores.'
            : 'Si entras con Google por primera vez, tu cuenta se crea sola.'}
        </p>
      </div>
    </div>
  );
}
