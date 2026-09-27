import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  CalendarRange,
  Camera,
  ChevronDown,
  ClipboardList,
  ClipboardX,
  Clock,
  DatabaseBackup,
  Globe,
  Lightbulb,
  ImageMinus,
  Inbox,
  Lock,
  MapPin,
  MessageCircle,
  Pencil,
  Save,
  Settings,
  Settings2,
  Shield,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserMinus,
  Users,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import {
  deleteLeague,
  deleteOldPhotos,
  removeMember,
  setMemberRole,
  setMemberScorer,
  updateLeague,
  useLeagueMembers,
  usePlayers,
  useSubmissions,
} from '../lib/data';
import { useNotifications } from '../components/Notifications';
import { formatDate } from '../lib/format';
import { rememberLeague, roleLabel, useLeagueCtx, whatsappUrl } from '../lib/league';
import type { Member } from '../lib/types';
import { Avatar } from '../components/Avatar';
import { InviteCard } from '../components/InviteCard';
import { SuggestionsPanel } from '../components/SuggestionsPanel';
import { Tour } from '../components/Tour';
import { ADMIN_TOUR } from '../lib/tours';
import { LeagueForm, leagueInput } from '../components/LeagueFormModal';
import { useAction, useFeedback } from '../components/feedback';
import { Badge, Button, Card, ListSkeleton, LoadError, Modal, Tabs, TopLoader, cx } from '../components/ui';

const PlayersPage = lazy(() => import('./PlayersPage'));
const ApprovalsPage = lazy(() => import('./ApprovalsPage'));

type Tab = 'jugadores' | 'aprobar' | 'miembros' | 'buzon' | 'liga';

/** Administración de la liga (dueño, admins y superadmin). */
export default function AdminPage() {
  const { lid, isAdmin, league } = useLeagueCtx();
  const [params, setParams] = useSearchParams();
  const pending = useSubmissions(isAdmin ? lid : undefined, 'pendiente').data.length;
  const newSuggestions = useNotifications().feeds.find((f) => f.lid === lid)?.suggestions.length ?? 0;
  const tabs: { key: Tab; label: string; icon: ReactNode; count?: number }[] = [
    { key: 'jugadores', label: 'Jugadores', icon: <Users className="size-4" /> },
    { key: 'aprobar', label: 'Aprobar', icon: <Inbox className="size-4" />, count: pending },
    { key: 'miembros', label: 'Miembros', icon: <Shield className="size-4" /> },
    { key: 'buzon', label: 'Buzón', icon: <Lightbulb className="size-4" />, count: newSuggestions },
    { key: 'liga', label: league.kind === 'torneo' ? 'Datos' : 'Liga', icon: <Settings2 className="size-4" /> },
  ];
  const requested = params.get('tab') as Tab | null;
  const tab: Tab = tabs.some((t) => t.key === requested) ? requested! : 'jugadores';

  if (!isAdmin) {
    return <LoadError error={new Error('permission-denied')} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <Tour name="admin" steps={ADMIN_TOUR} when={isAdmin} />
      <div data-tour="admin-secciones">
        <Tabs items={tabs} active={tab} onChange={(k) => setParams({ tab: k }, { replace: true })} />
      </div>
      <Suspense fallback={<TopLoader />}>
        <div key={tab} className="animate-fade-up">
          {tab === 'jugadores' ? (
            <PlayersPage />
          ) : tab === 'aprobar' ? (
            <ApprovalsPage />
          ) : tab === 'miembros' ? (
            <MembersPanel />
          ) : tab === 'buzon' ? (
            <SuggestionsPanel />
          ) : (
            <SettingsPanel />
          )}
        </div>
      </Suspense>
    </div>
  );
}

const ORDER: Record<Member['role'], number> = { owner: 0, admin: 1, member: 2 };

/**
 * Miembros y permisos. Todos los que entran son jugadores; el dueño nombra admins (y, en torneos
 * sin liga, anotadores). Un miembro puede tener varios roles (p. ej. anotador y jugador).
 */
function MembersPanel() {
  const { lid, league, isOwner } = useLeagueCtx();
  const { user } = useAuth();
  const run = useAction();
  const { confirm } = useFeedback();
  const members = useLeagueMembers(lid);
  const players = usePlayers(lid);
  const playerName = useMemo(() => new Map(players.data.map((p) => [p.id, p.name])), [players.data]);
  const sorted = [...members.data].sort((a, b) => ORDER[a.role] - ORDER[b.role] || a.name.localeCompare(b.name));
  // Anotadores: solo en torneos sin liga (en la liga de práctica no hacen falta).
  const scorers = league.kind === 'torneo';
  const where = scorers ? 'el torneo' : 'la liga';

  async function toggleAdmin(m: Member) {
    const makeAdmin = m.role === 'member';
    const ok = await confirm({
      title: makeAdmin ? `¿Hacer admin a ${m.name}?` : `¿Quitarle admin a ${m.name}?`,
      message: makeAdmin
        ? scorers
          ? 'Podrá inscribir jugadores, armar equipos, anotar y aprobar juegos, e invitar. Los permisos los sigues manejando tú.'
          : 'Podrá crear torneos y prácticas, anotar y aprobar juegos, manejar jugadores e invitar. Los permisos los sigues manejando tú.'
        : m.uid === user?.uid
          ? `Vas a dejar de administrar ${where}; sigues como jugador. Para volver a ser admin, el dueño te lo tiene que dar.`
          : `Sigue en ${where} como jugador.`,
      confirmText: makeAdmin ? 'Hacer admin' : 'Quitar admin',
      danger: !makeAdmin,
    });
    if (ok) await run(() => setMemberRole(m, makeAdmin ? 'admin' : 'member'), makeAdmin ? `${m.name} ahora es admin` : 'Listo');
  }

  async function toggleScorer(m: Member) {
    const make = !m.scorer;
    const ok = await confirm({
      title: make ? `¿Hacer anotador a ${m.name}?` : `¿Quitarle anotador a ${m.name}?`,
      message: make
        ? 'Podrá anotar los juegos de los inscritos (a mano, por cuadros o con la foto) y nada más. Sigue siendo jugador.'
        : 'Ya no podrá anotar los juegos del torneo.',
      confirmText: make ? 'Hacer anotador' : 'Quitar anotador',
      danger: !make,
    });
    if (ok) await run(() => setMemberScorer(m, make), make ? `${m.name} ahora es anotador` : 'Listo');
  }

  async function kick(m: Member) {
    const ok = await confirm({
      title: `¿Sacar a ${m.name} de ${where}?`,
      message: `Sus juegos se quedan; su cuenta deja de estar en ${where}. Si es privado, necesitará otra invitación para volver.`,
      confirmText: 'Sacar',
      danger: true,
    });
    if (ok) await run(() => removeMember(m), `${m.name} ya no está en ${where}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold tracking-tight">Miembros y permisos</h2>
        <p className="text-sm text-muted">
          Todos son jugadores. <b className="text-fg">Admin</b> maneja {where}
          {scorers && (
            <>
              ; <b className="text-fg">Anotador</b> solo anota los juegos
            </>
          )}
          . {isOwner ? 'Solo tú, como dueño, das o quitas permisos.' : 'Solo el dueño da o quita permisos.'}
        </p>
      </div>
      {members.error ? (
        <LoadError error={members.error} />
      ) : members.loading ? (
        <ListSkeleton rows={4} />
      ) : (
        <Card className="stagger divide-y divide-line overflow-hidden">
          {sorted.map((m, i) => {
            const me = m.uid === user?.uid;
            // El dueño saca a cualquiera; un admin solo a los que no tienen permisos (ni admin ni anotador).
            const canKick = !me && m.role !== 'owner' && (isOwner || (m.role === 'member' && !m.scorer));
            const canManage = isOwner && m.role !== 'owner';
            // Un admin puede dejar de serlo por su cuenta.
            const canStepDown = me && m.role === 'admin' && !isOwner;
            return (
              <div key={m.id} style={{ '--i': i } as CSSProperties} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar name={m.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-medium">{m.name}</span>
                    {me && <Badge>Tú</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.role !== 'member' && <Badge tone="accent">{roleLabel(m.role)}</Badge>}
                    {scorers && m.scorer && <Badge tone="warn">Anotador</Badge>}
                    <Badge tone={m.playerId ? 'ok' : 'neutral'}>{m.playerId ? `Jugador: ${playerName.get(m.playerId) ?? '—'}` : 'Su jugador se crea al abrir la liga'}</Badge>
                  </div>
                </div>
                {(canManage || canKick || canStepDown) && (
                  <div className="flex flex-wrap justify-end gap-1">
                    {canStepDown && (
                      <Button size="sm" icon={<ShieldOff className="size-4" />} onClick={() => toggleAdmin(m)}>
                        Dejar de ser admin
                      </Button>
                    )}
                    {canManage && (
                      <Button
                        size="sm"
                        icon={m.role === 'admin' ? <ShieldOff className="size-4" /> : <ShieldCheck className="size-4" />}
                        onClick={() => toggleAdmin(m)}
                      >
                        {m.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                      </Button>
                    )}
                    {canManage && scorers && (
                      <Button
                        size="sm"
                        icon={m.scorer ? <ClipboardX className="size-4" /> : <ClipboardList className="size-4" />}
                        onClick={() => toggleScorer(m)}
                      >
                        {m.scorer ? 'Quitar anotador' : 'Hacer anotador'}
                      </Button>
                    )}
                    {canKick && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger"
                        aria-label={`Sacar a ${m.name}`}
                        title={`Sacar de ${where}`}
                        icon={<UserMinus className="size-4" />}
                        onClick={() => kick(m)}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

/** Datos de la liga (se editan en un modal), invitación y la configuración (respaldo, fotos, borrar). */
function SettingsPanel() {
  const { league } = useLeagueCtx();
  const [editing, setEditing] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [open, setOpen] = useState(false);
  const isTournament = league.kind === 'torneo';
  const season = league.seasonStart && league.seasonEnd ? `${formatDate(league.seasonStart)} – ${formatDate(league.seasonEnd)}` : '';
  const contact = [league.contactName, league.contactPhone].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col p-4">
        <div className="flex items-center gap-2">
          {/* Acordeón: cerrado solo se ve el nombre; al tocarlo se despliegan los datos. */}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="datos-liga"
            className="-m-1 flex min-w-0 flex-1 items-center gap-2 rounded-xl p-1 text-left transition hover:bg-surface-2"
          >
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-xs font-medium text-muted">
                {isTournament ? 'Datos del torneo' : 'Datos de la liga'}
                <Badge tone={league.visibility === 'private' ? 'neutral' : 'accent'} className="px-1.5 py-0 text-[11px]">
                  {league.visibility === 'private' ? <Lock className="size-3" /> : <Globe className="size-3" />}
                  {league.visibility === 'private' ? 'Privada' : 'Pública'}
                </Badge>
              </p>
              <h2 className="truncate text-lg font-bold tracking-tight">{league.name}</h2>
            </div>
            <ChevronDown className={cx('size-5 shrink-0 text-muted transition-transform duration-200', open && 'rotate-180')} />
          </button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Settings className="size-4" />}
            onClick={() => setConfiguring(true)}
            aria-label={isTournament ? 'Configuración del torneo' : 'Configuración de la liga'}
            title="Configuración"
          />
        </div>
        <div
          id="datos-liga"
          className={cx('grid transition-[grid-template-rows,opacity] duration-200 ease-out', open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}
        >
          <div className="overflow-hidden" inert={!open}>
            <dl className="grid gap-2.5 pt-4 text-sm sm:grid-cols-2">
              <Detail icon={<MapPin className="size-4" />} label="Bolera" value={league.venue} />
              {!isTournament && <Detail icon={<Clock className="size-4" />} label="Cuándo juegan" value={league.schedule} />}
              {!isTournament && <Detail icon={<CalendarRange className="size-4" />} label="Temporada" value={season} />}
              <Detail
                icon={<MessageCircle className="size-4" />}
                label="Contacto"
                value={
                  contact &&
                  (league.contactPhone ? (
                    <a href={whatsappUrl(league.contactPhone)} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                      {contact}
                    </a>
                  ) : (
                    contact
                  ))
                }
              />
              <Detail
                icon={<Camera className="size-4" />}
                label="Foto del marcador"
                value={league.requirePhoto !== false ? 'Obligatoria para que cuente' : 'Opcional'}
              />
            </dl>
            <Button className="mt-4 w-full sm:w-auto" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
              Editar datos
            </Button>
          </div>
        </div>
      </Card>

      <InviteCard league={league} />

      <EditLeagueModal open={editing} onClose={() => setEditing(false)} />
      <LeagueConfigModal open={configuring} onClose={() => setConfiguring(false)} />
    </div>
  );
}

function Detail({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-accent">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-muted">{label}</dt>
        <dd className={cx('truncate', !value && 'text-muted')}>{value || 'Sin definir'}</dd>
      </div>
    </div>
  );
}

/** Editar los datos: se guardan con "Guardar"; "Cancelar" cierra sin cambiar nada. */
function EditLeagueModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lid, league } = useLeagueCtx();
  const run = useAction();
  const [saving, setSaving] = useState(false);
  // Se toma la foto de los datos al abrir: si alguien más los cambia, no se pisa lo que estás escribiendo.
  const [initial, setInitial] = useState(() => leagueInput(league));
  useEffect(() => {
    if (open) setInitial(leagueInput(league));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={league.kind === 'torneo' ? 'Datos del torneo' : 'Datos de la liga'}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="league-edit" loading={saving} icon={<Save className="size-4" />}>
            Guardar
          </Button>
        </>
      }
    >
      <LeagueForm
        id="league-edit"
        initial={initial}
        onSubmit={async (data) => {
          setSaving(true);
          const ok = await run(async () => {
            await updateLeague(lid, data);
            return true;
          }, 'Cambios guardados');
          setSaving(false);
          if (ok) onClose();
        }}
      />
    </Modal>
  );
}

/** Configuración: respaldo, liberar espacio de fotos y borrar la liga (dueño o superadmin). */
function LeagueConfigModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lid, league, isOwner } = useLeagueCtx();
  const { user, isSuper } = useAuth();
  const navigate = useNavigate();
  const run = useAction();
  const { confirm, toast } = useFeedback();
  const [busy, setBusy] = useState<string | null>(null);
  const isTournament = league.kind === 'torneo';

  async function backup() {
    setBusy('backup');
    try {
      const { downloadLeagueBackup } = await import('../lib/backup');
      const c = await downloadLeagueBackup(league);
      toast(`Respaldo descargado: ${c.players} jugadores, ${c.events} eventos, ${c.entries} participaciones`);
    } catch (e) {
      console.error(e);
      toast('No se pudo hacer el respaldo. Intenta de nuevo.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function freePhotos() {
    const ok = await confirm({
      title: 'Borrar fotos de hace más de un año',
      message: 'Los juegos siguen contando; solo deja de verse la foto. Sirve para no llenar el espacio gratis.',
      confirmText: 'Borrar fotos',
      danger: true,
    });
    if (!ok) return;
    setBusy('photos');
    const n = await run(() => deleteOldPhotos(lid, 12));
    if (n != null) toast(n ? `${n} fotos borradas` : 'No hay fotos de hace más de un año');
    setBusy(null);
  }

  async function remove() {
    const ok = await confirm({
      title: `¿Borrar ${league.name}?`,
      message: 'Se borran sus torneos, prácticas, jugadores, juegos, fotos, miembros e invitación. No se puede deshacer; descarga el respaldo antes.',
      confirmText: 'Borrar todo',
      danger: true,
    });
    if (!ok || !user) return;
    setBusy('delete');
    const done = await run(async () => {
      await deleteLeague(lid, user.uid);
      return true;
    }, 'Borrado');
    setBusy(null);
    if (done) {
      onClose();
      rememberLeague(null);
      navigate('/ligas', { replace: true });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Settings className="size-5 text-accent" /> {isTournament ? 'Configuración del torneo' : 'Configuración de la liga'}
        </span>
      }
      footer={<Button onClick={onClose}>Cerrar</Button>}
    >
      <div className="flex flex-col gap-3">
        <ConfigRow
          icon={<DatabaseBackup className="size-5" />}
          title="Respaldo"
          text="Descarga todos los datos (jugadores, eventos, juegos y miembros) en un archivo. Las fotos no entran."
          action={
            <Button size="sm" loading={busy === 'backup'} onClick={backup}>
              Descargar
            </Button>
          }
        />
        <ConfigRow
          icon={<ImageMinus className="size-5" />}
          title="Fotos viejas"
          text="Borra las fotos de hace más de un año para no llenar el espacio gratis. Los juegos siguen contando."
          action={
            <Button size="sm" loading={busy === 'photos'} onClick={freePhotos}>
              Borrar
            </Button>
          }
        />
        {(isOwner || isSuper) && (
          <ConfigRow
            danger
            icon={<Trash2 className="size-5" />}
            title={isTournament ? 'Borrar el torneo' : 'Borrar la liga'}
            text="Se borra todo y no se puede deshacer. Descarga el respaldo antes."
            action={
              <Button size="sm" variant="danger" loading={busy === 'delete'} onClick={remove}>
                Borrar
              </Button>
            }
          />
        )}
      </div>
    </Modal>
  );
}

function ConfigRow({ icon, title, text, action, danger }: { icon: ReactNode; title: string; text: string; action: ReactNode; danger?: boolean }) {
  return (
    <div className={cx('flex items-start gap-3 rounded-xl border p-3', danger ? 'border-danger/40 bg-danger-soft/40' : 'border-line')}>
      <span className={cx('mt-0.5', danger ? 'text-danger' : 'text-accent')}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className={cx('text-sm font-semibold', danger && 'text-danger')}>{title}</p>
        <p className="text-xs text-muted">{text}</p>
      </div>
      <div className="shrink-0 self-center">{action}</div>
    </div>
  );
}
