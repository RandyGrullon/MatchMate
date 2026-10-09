import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { AtSign, ChevronLeft, Crown, Info, KeyRound, LogOut, MessageCircle, Pencil, Plus } from 'lucide-react';
import { authErrorMessage, createProfile, displayName, logout, MIN_PASSWORD, renameProfile, updatePassword, useAuth } from '../lib/auth';
import { useLeaguesByIds, useMyMemberships } from '../lib/data';
import { usePublicProfile } from '../lib/data/follows';
import { rememberLeague, roleLabel } from '../lib/league';
import { useIsPro } from '../lib/useMode';
import { AppShell } from '../components/Shell';
import { AppearanceCard } from '../components/AppearanceCard';
import { NotificationsCard } from '../components/NotificationsOptIn';
import { unsubscribePush } from '../lib/push';
import { useCreateMenu } from '../components/CreateMenu';
import { BigField, BigInput, ErrorNote } from '../components/cuenta/kit';
import { PublicProfileSection } from '../components/cuenta/PublicProfile';
import { ProfileAvatar } from '../components/profile/ProfileAvatar';
import { useAction, useFeedback } from '../components/feedback';
import { LeagueTile } from '../components/ligas/LigasRows';
import { PasswordInput } from '../components/PasswordInput';
import { atUsername } from '../components/social/socialFormat';
import { UsernameForm } from '../components/social/UsernameForm';
import { Badge, Button, Card, ListRow, ListSkeleton, Loading, RowIcon, SectionHeader, Sheet, cx } from '../components/ui';
import { AccountDataCard } from './legal/AccountDataCard';

/**
 * Configuración (el engranaje de Yo), rediseño «Calma y foco»: «‹ Yo», el título y quién eres (como en Yo); después
 * filas en tarjetas, sin botones sueltos: tu cuenta (nombre, @usuario y contraseña, cada uno en su hoja), Perfil público
 * (foto, biografía y personas bloqueadas, src/components/cuenta/PublicProfile.tsx), Apariencia
 * (claro, oscuro o automático y cómo ver la app), Notificaciones, Mis ligas, Tus datos (privacidad, términos, bajar mis
 * datos y borrar la cuenta), MatchMate (superadmin, Acerca de y Contáctanos) y, al final, Cerrar sesión. En Pro, lo
 * mismo más denso.
 */
export default function AccountPage() {
  const auth = useAuth();
  const pro = useIsPro();
  const create = useCreateMenu();
  const navigate = useNavigate();
  const run = useAction();
  const { toast } = useFeedback();
  // Borrando la cuenta: al cerrarse la sesión se va a Home (no al login).
  const leaving = useRef(false);
  const memberships = useMyMemberships(auth.user?.uid);
  const leagues = useLeaguesByIds(memberships.data.map((m) => m.leagueId));
  // Tu foto y tu biografía (las del perfil público).
  const me = usePublicProfile(auth.user?.uid);
  const [sheet, setSheet] = useState<'nombre' | 'usuario' | null>(null);
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
    if (ok) setSheet(null);
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
  const icon = pro ? 'size-[19px]' : 'size-5';
  const line = [handle, user.email].filter(Boolean).join(' · ');

  return (
    <AppShell>
      <div className="flex flex-col px-2">
        {/* Se llega con el único engranaje, el de Yo: «‹ Yo» vuelve ahí. */}
        <div className="-mt-2 mb-1 flex min-h-13 items-center">
          <BackToYo />
        </div>
        <h1 className={pro ? 'text-title-pro' : 'text-title'}>Configuración</h1>

        {/* Quién eres, como arriba de Yo. */}
        <div className={cx('flex items-center', pro ? 'mt-[18px] gap-3.5' : 'mt-5 gap-4')}>
          <ProfileAvatar name={displayName(auth)} photo={me.data?.avatar} className={pro ? 'size-[52px] text-lg' : 'size-[60px] text-[21px]'} />
          <div className="min-w-0">
            <p className={cx('flex min-w-0 items-center gap-2 font-bold', pro ? 'text-[22px] leading-[1.2] tracking-[-0.02em]' : 'text-[24px] leading-[1.15] tracking-[-0.025em]')}>
              <span className="truncate">{displayName(auth)}</span>
              {auth.isSuper && (
                <Badge tone="accent" className="shrink-0">
                  <Crown className="size-3" /> Superadmin
                </Badge>
              )}
            </p>
            {line && <p className="mt-0.5 truncate text-meta text-muted">{line}</p>}
          </div>
        </div>

        {needsProfile && (
          <Card className="mt-5 p-5">
            <form onSubmit={saveName} className="flex flex-col gap-4">
              <BigField label="Completa tu cuenta: ¿cómo te llamas?">
                <BigInput required maxLength={60} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" />
              </BigField>
              <Button type="submit" variant="primary" size={pro ? 'lg' : 'xl'} loading={busy} className="w-full">
                Guardar
              </Button>
            </form>
          </Card>
        )}

        <Card className="mt-5 overflow-hidden">
          {!needsProfile && (
            <ListRow
              dense={pro}
              leading={
                <RowIcon>
                  <Pencil className={icon} />
                </RowIcon>
              }
              title="Tu nombre"
              subtitle={displayName(auth)}
              onClick={() => {
                setName(displayName(auth));
                setSheet('nombre');
              }}
            />
          )}
          {!needsProfile && (
            <ListRow
              dense={pro}
              leading={
                <RowIcon>
                  <AtSign className={icon} />
                </RowIcon>
              }
              title="Tu usuario"
              subtitle={handle || 'Para que te encuentren'}
              onClick={() => setSheet('usuario')}
            />
          )}
          <PasswordRow dense={pro} icon={icon} />
        </Card>

        {!needsProfile && <PublicProfileSection className="mt-[26px]" name={displayName(auth)} profile={me.data} dense={pro} icon={icon} />}

        <AppearanceCard className="mt-[26px]" />
        <NotificationsCard className="mt-[26px]" />

        <section aria-labelledby="cfg-ligas" className="mt-[26px]">
          <SectionHeader id="cfg-ligas" title="Mis ligas" />
          {memberships.loading || leagues.loading ? (
            <ListSkeleton rows={2} />
          ) : (
            <Card className="overflow-hidden">
              {leagues.data.length === 0 ? (
                <ListRow
                  dense={pro}
                  leading={
                    <RowIcon tone="accent">
                      <Plus className={icon} />
                    </RowIcon>
                  }
                  title="Crear o unirme a una liga"
                  subtitle="Todavía no estás en ninguna"
                  onClick={create.openMenu}
                />
              ) : (
                leagues.data.map((l) => {
                  const role = memberships.data.find((m) => m.leagueId === l.id)?.role;
                  return (
                    <ListRow
                      key={l.id}
                      dense={pro}
                      leading={<LeagueTile league={l} dense />}
                      title={l.name}
                      subtitle={role ? roleLabel(role) : null}
                      to={`/l/${l.id}`}
                    />
                  );
                })
              )}
            </Card>
          )}
        </section>

        <AccountDataCard className="mt-[26px]" onDeleting={(d) => (leaving.current = d)} onDeleted={accountDeleted} />

        {/* Lo que sin cuenta está en la barra de abajo (y la consola del dueño de la app). */}
        <section aria-labelledby="cfg-matchmate" className="mt-[26px]">
          <SectionHeader id="cfg-matchmate" title="MatchMate" />
          <Card className="overflow-hidden">
            {auth.isSuper && (
              <ListRow
                dense={pro}
                leading={
                  <RowIcon tone="accent">
                    <Crown className={icon} />
                  </RowIcon>
                }
                title="Panel del superadmin"
                to="/superadmin"
              />
            )}
            <ListRow
              dense={pro}
              leading={
                <RowIcon>
                  <Info className={icon} />
                </RowIcon>
              }
              title="Acerca de MatchMate"
              to="/acerca"
            />
            <ListRow
              dense={pro}
              leading={
                <RowIcon>
                  <MessageCircle className={icon} />
                </RowIcon>
              }
              title="Contáctanos"
              to="/contacto"
            />
          </Card>
        </section>

        <Card className="mt-[26px] overflow-hidden">
          <button
            type="button"
            onClick={signOut}
            className={cx(
              'flex w-full items-center justify-center gap-2 text-body font-semibold text-danger transition active:bg-surface-2',
              'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
              pro ? 'min-h-row-pro' : 'min-h-row',
            )}
          >
            <LogOut aria-hidden="true" className="size-5" /> Cerrar sesión
          </button>
        </Card>
      </div>

      <Sheet
        open={sheet === 'nombre'}
        onClose={() => setSheet(null)}
        title="Tu nombre"
        footer={
          <Button type="submit" form="cfg-nombre" variant="primary" size="xl" loading={busy} className="w-full">
            Guardar
          </Button>
        }
      >
        <form id="cfg-nombre" onSubmit={saveName} className="pt-1">
          <BigField label="Nombre y apellido" hint="Así te ven en las tablas y en tus ligas.">
            <BigInput required maxLength={60} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" />
          </BigField>
        </form>
      </Sheet>
      <Sheet open={sheet === 'usuario'} onClose={() => setSheet(null)} title="Tu usuario" subtitle="Con él te encuentran y te invitan">
        {sheet === 'usuario' && <UsernameForm uid={user.uid} current={username} onDone={() => setSheet(null)} />}
      </Sheet>
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
 * La fila «Contraseña» y su hoja para poner una nueva. Se abre sola al volver del link de «Olvidé mi contraseña»
 * (/cuenta?recuperar=1); las cuentas de Google también pueden ponerse una para entrar con su correo.
 */
function PasswordRow({ dense, icon }: { dense: boolean; icon: string }) {
  const auth = useAuth();
  const { toast } = useFeedback();
  const [params, setParams] = useSearchParams();
  const recovering = auth.recovering || params.get('recuperar') === '1';
  const [open, setOpen] = useState(recovering);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const short = password !== '' && password.length < MIN_PASSWORD;
  const mismatch = password2 !== '' && password !== password2;

  // Llegó del link del correo con la pantalla ya abierta: la hoja se abre igual.
  useEffect(() => {
    if (recovering) setOpen(true);
  }, [recovering]);

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

  return (
    <>
      <ListRow
        dense={dense}
        leading={
          <RowIcon>
            <KeyRound className={icon} />
          </RowIcon>
        }
        title="Contraseña"
        subtitle="Cambiarla o ponerte una"
        onClick={() => setOpen(true)}
      />
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={recovering ? 'Pon tu contraseña nueva' : 'Cambiar contraseña'}
        footer={
          <Button type="submit" form="cfg-contrasena" variant="primary" size="xl" loading={busy} disabled={short || mismatch || !password2} className="w-full">
            Guardar
          </Button>
        }
      >
        <form id="cfg-contrasena" onSubmit={save} className="flex flex-col gap-5 pt-1">
          <BigField label="Contraseña nueva" hint={short ? `Mínimo ${MIN_PASSWORD} caracteres.` : undefined} error={short}>
            <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" invalid={short} autoFocus={recovering} />
          </BigField>
          <BigField label="Repite la contraseña" hint={mismatch ? 'Las contraseñas no coinciden.' : undefined} error={mismatch}>
            <PasswordInput value={password2} onChange={setPassword2} autoComplete="new-password" invalid={mismatch} />
          </BigField>
          {error && <ErrorNote>{error}</ErrorNote>}
        </form>
      </Sheet>
    </>
  );
}
