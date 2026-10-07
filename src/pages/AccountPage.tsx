import { useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { AtSign, Check, ChevronLeft, ChevronRight, Crown, Info, KeyRound, LogOut, MessageCircle, Pencil } from 'lucide-react';
import { authErrorMessage, createProfile, displayName, logout, MIN_PASSWORD, renameProfile, updatePassword, useAuth } from '../lib/auth';
import { useLeaguesByIds, useMyMemberships } from '../lib/data';
import { rememberLeague, roleLabel } from '../lib/league';
import { AppShell } from '../components/Shell';
import { AppearanceCard } from '../components/AppearanceCard';
import { NotificationsCard } from '../components/NotificationsOptIn';
import { unsubscribePush } from '../lib/push';
import { useCreateMenu } from '../components/CreateMenu';
import { Avatar } from '../components/Avatar';
import { useAction, useFeedback } from '../components/feedback';
import { PasswordInput } from '../components/PasswordInput';
import { atUsername } from '../components/social/socialFormat';
import { UsernameForm } from '../components/social/UsernameForm';
import { Badge, Button, Card, Field, Input, ListSkeleton, Loading } from '../components/ui';
import { AccountDataCard } from './legal/AccountDataCard';

/**
 * Configuración (engrane de arriba): nombre, @usuario, correo, apariencia, mis ligas, tus datos (privacidad,
 * términos, bajar mis datos y borrar la cuenta), superadmin, cerrar sesión y, abajo, Acerca de y Contáctanos.
 */
export default function AccountPage() {
  const auth = useAuth();
  const create = useCreateMenu();
  const navigate = useNavigate();
  const run = useAction();
  const { toast } = useFeedback();
  // Borrando la cuenta: al cerrarse la sesión se va a Home (no al login).
  const leaving = useRef(false);
  const memberships = useMyMemberships(auth.user?.uid);
  const leagues = useLeaguesByIds(memberships.data.map((m) => m.leagueId));
  const [editing, setEditing] = useState(false);
  const [editingUser, setEditingUser] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  if (auth.loading) return <Loading />;
  if (!auth.user) return <Navigate to={leaving.current ? '/' : '/login?next=%2Fcuenta'} replace />;
  const user = auth.user;

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await run(async () => {
      if (auth.profile) await renameProfile(user, name);
      else await createProfile(user, name);
      return true;
    }, 'Nombre guardado');
    setBusy(false);
    if (ok) setEditing(false);
  }

  async function signOut() {
    rememberLeague(null);
    // Primero se sale de la pantalla: sin sesión, esta página manda al login.
    navigate('/ligas', { replace: true });
    // Este teléfono deja de recibir los recordatorios de esta cuenta (sin señal no se espera más de 2 s).
    await unsubscribePush(user.uid);
    await logout();
  }

  function accountDeleted() {
    rememberLeague(null);
    toast('Tu cuenta se borró. Gracias por usar MatchMate.');
    navigate('/', { replace: true });
  }

  // Cuenta sin perfil (el registro no alcanzó a crearlo): se completa con el nombre.
  const needsProfile = !auth.profile;
  // Puede faltar en una copia vieja del teléfono hasta que el perfil se vuelve a leer.
  const username = auth.profile?.username ?? '';
  const handle = atUsername(username);

  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        {/* Se llega con el único engranaje, el de Yo: «‹ Yo» vuelve ahí. */}
        <div>
          <div className="-mt-2 mb-1 flex min-h-13 items-center">
            <BackToYo />
          </div>
          <h1 className="text-title">Configuración</h1>
        </div>
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-4">
            <Avatar name={displayName(auth)} className="size-14 text-lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-xl font-bold tracking-tight">{displayName(auth)}</h2>
                {auth.isSuper && (
                  <Badge tone="accent">
                    <Crown className="size-3" /> Superadmin
                  </Badge>
                )}
              </div>
              {handle && <p className="truncate text-sm font-medium text-muted">{handle}</p>}
              <p className="truncate text-sm text-muted">{user.email}</p>
            </div>
            {!editing && !needsProfile && (
              <Button
                variant="ghost"
                aria-label="Cambiar nombre"
                className="max-sm:size-11"
                icon={<Pencil className="size-4" />}
                onClick={() => {
                  setName(displayName(auth));
                  setEditing(true);
                }}
              />
            )}
          </div>
          {(editing || needsProfile) && (
            <form onSubmit={saveName} className="flex items-end gap-2">
              <Field label={needsProfile ? 'Completa tu cuenta: ¿cómo te llamas?' : 'Tu nombre'} className="flex-1">
                <Input required maxLength={60} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" />
              </Field>
              <Button type="submit" variant="primary" loading={busy} icon={<Check className="size-4" />} className="max-sm:h-11">
                Guardar
              </Button>
            </form>
          )}
          {!needsProfile &&
            (editingUser ? (
              <div className="border-t border-line pt-4">
                <UsernameForm uid={user.uid} current={username} onDone={() => setEditingUser(false)} />
              </div>
            ) : (
              <Button
                variant="ghost"
                className="-ml-2 self-start max-sm:h-11"
                icon={<AtSign className="size-4" />}
                onClick={() => setEditingUser(true)}
              >
                Cambiar tu usuario
              </Button>
            ))}
        </Card>

        <PasswordCard />
        <AppearanceCard />
        <NotificationsCard />

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted">Mis ligas</h2>
          {memberships.loading || leagues.loading ? (
            <ListSkeleton rows={2} />
          ) : leagues.data.length === 0 ? (
            <Card className="p-4 text-sm text-muted">
              Todavía no estás en ninguna.{' '}
              <button type="button" onClick={create.openMenu} className="inline-flex min-h-11 items-center font-medium text-accent">
                Crear o unirme a una liga
              </button>
            </Card>
          ) : (
            <Card className="divide-y divide-line overflow-hidden">
              {leagues.data.map((l) => {
                const role = memberships.data.find((m) => m.leagueId === l.id)?.role;
                return (
                  <Link key={l.id} to={`/l/${l.id}`} className="flex min-h-12 items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
                    <span className="flex-1 truncate font-medium">{l.name}</span>
                    {role && <Badge tone={role === 'member' ? 'neutral' : 'accent'}>{roleLabel(role)}</Badge>}
                    <ChevronRight className="size-4 text-muted" />
                  </Link>
                );
              })}
            </Card>
          )}
        </section>

        <AccountDataCard onDeleting={(d) => (leaving.current = d)} onDeleted={accountDeleted} />

        {auth.isSuper && (
          <Link to="/superadmin" className="flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft/50 px-4 py-3 font-medium text-accent">
            <Crown className="size-5" />
            <span className="flex-1">Panel del superadmin</span>
            <ChevronRight className="size-4" />
          </Link>
        )}

        <Button className="self-center text-danger max-sm:h-11" variant="ghost" icon={<LogOut className="size-4" />} onClick={signOut}>
          Cerrar sesión
        </Button>

        {/* Lo que sin cuenta está en la barra de abajo. */}
        <nav aria-label="Sobre MatchMate" className="-mt-2 flex flex-wrap justify-center gap-x-6 border-t border-line pt-2 text-sm">
          <Link to="/acerca" className="inline-flex min-h-11 items-center gap-1.5 font-medium text-muted hover:text-fg">
            <Info className="size-4" aria-hidden="true" /> Acerca de MatchMate
          </Link>
          <Link to="/contacto" className="inline-flex min-h-11 items-center gap-1.5 font-medium text-muted hover:text-fg">
            <MessageCircle className="size-4" aria-hidden="true" /> Contáctanos
          </Link>
        </nav>
      </div>
    </AppShell>
  );
}

/**
 * «‹ Yo» arriba de Configuración: si se llegó con el engranaje de Yo, vuelve atrás; si se entró directo, abre Yo.
 */
function BackToYo() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromYo = !!(location.state as { yo?: boolean } | null)?.yo;
  return (
    <Link
      to="/perfil"
      replace={!fromYo}
      onClick={(e) => {
        if (!fromYo) return;
        e.preventDefault();
        navigate(-1);
      }}
      className="-ml-1.5 inline-flex h-11 items-center gap-0.5 rounded-xl pr-2 text-body font-[550] text-accent transition active:opacity-70 focus-visible:outline-2 focus-visible:outline-accent"
    >
      <ChevronLeft aria-hidden="true" className="size-6" />
      Yo
    </Link>
  );
}

/**
 * Contraseña nueva. Se abre sola al volver del link de «Olvidé mi contraseña» (/cuenta?recuperar=1); las cuentas
 * de Google también pueden ponerse una para entrar con su correo.
 */
function PasswordCard() {
  const auth = useAuth();
  const { toast } = useFeedback();
  const [params, setParams] = useSearchParams();
  const recovering = auth.recovering || params.get('recuperar') === '1';
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const short = password !== '' && password.length < MIN_PASSWORD;
  const mismatch = password2 !== '' && password !== password2;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (short || mismatch || !password2) return;
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      toast('Contraseña guardada');
      setOpen(false);
      setPassword('');
      setPassword2('');
      if (params.has('recuperar')) {
        const p = new URLSearchParams(params);
        p.delete('recuperar');
        setParams(p, { replace: true });
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open && !recovering) {
    return (
      <Button className="self-start max-sm:h-11" variant="ghost" icon={<KeyRound className="size-4" />} onClick={() => setOpen(true)}>
        Cambiar contraseña
      </Button>
    );
  }
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <KeyRound className="size-4 text-accent" /> {recovering ? 'Pon tu contraseña nueva' : 'Cambiar contraseña'}
      </h2>
      <form onSubmit={save} className="flex flex-col gap-3">
        <Field label="Contraseña nueva" hint={short ? `Mínimo ${MIN_PASSWORD} caracteres.` : undefined}>
          <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" invalid={short} autoFocus={recovering} />
        </Field>
        <Field label="Repite la contraseña" hint={mismatch ? 'Las contraseñas no coinciden.' : undefined}>
          <PasswordInput value={password2} onChange={setPassword2} autoComplete="new-password" invalid={mismatch} />
        </Field>
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          {!recovering && (
            <Button onClick={() => setOpen(false)} className="max-sm:h-11">
              Cancelar
            </Button>
          )}
          <Button type="submit" variant="primary" loading={busy} disabled={short || mismatch || !password2} icon={<Check className="size-4" />} className="max-sm:h-11">
            Guardar
          </Button>
        </div>
      </form>
    </Card>
  );
}
