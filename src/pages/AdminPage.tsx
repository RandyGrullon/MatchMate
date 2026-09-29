import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  Award,
  Baby,
  BadgeCheck,
  CalendarRange,
  Camera,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  ClipboardX,
  Clock,
  DatabaseBackup,
  Earth,
  Flag,
  Globe,
  Lightbulb,
  ImageMinus,
  ImageUp,
  Inbox,
  Lock,
  MapPin,
  MessageCircle,
  Palette,
  Pencil,
  Save,
  Settings,
  Settings2,
  Shield,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCheck,
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
import { formatDate, venueLabel } from '../lib/format';
import { rememberLeague, roleLabel, useLeagueCtx, whatsappUrl } from '../lib/league';
import { logoErrorText, removeLeagueLogo, uploadLeagueLogo } from '../lib/logos';
import type { Member } from '../lib/types';
import { Avatar } from '../components/Avatar';
import { LeagueIcon } from '../components/home/LeagueCard';
import { InviteCard } from '../components/InviteCard';
import { SuggestionsPanel } from '../components/SuggestionsPanel';
import { Tour } from '../components/Tour';
import { ADMIN_TOUR } from '../lib/tours';
import { leagueSport, sportMeta } from '../sports/registry';
import { hasScreens, useSportScreens } from '../sports/screens';
import { LeagueForm, leagueInput } from '../components/LeagueFormModal';
import { useAction, useFeedback } from '../components/feedback';
import { Badge, Button, Card, ListSkeleton, LoadError, Modal, Skeleton, Tabs, TopLoader, cx } from '../components/ui';
import { AnnouncePanel } from '../components/league/Announce';
import { PEOPLE_TABS, arrangeAdminTabs, tzLabel, tzOffset } from '../components/league/logic';
import { usePendingClaimCount } from '../components/claims/data';
import { PendingPanel } from '../components/organizer/Pending';
import { pendingTotal, useLeaguePending } from '../lib/data/organizer';
import { useReportCounts } from '../lib/data/reports';
import { BadgesSettingsCard } from '../components/badges/BadgesSettings';
import { BadgeMakersCard } from '../components/badges/maker/MakerSettings';
import { useBadgeNotices } from '../lib/data/badges';
import { badgeMakersOf, canMakeBadges, setMemberBadgeMaker } from '../lib/data/leagueBadges';

const PlayersPage = lazy(() => import('./PlayersPage'));
const ClaimsPanel = lazy(() => import('../components/claims/ClaimsPanel').then((m) => ({ default: m.ClaimsPanel })));
const LeagueReportsPanel = lazy(() => import('../components/report/LeagueReportsPanel').then((m) => ({ default: m.LeagueReportsPanel })));
const ReviewsPanel = lazy(() => import('../components/badges/ReviewsPanel'));
const MakerAdmin = lazy(() => import('../components/badges/maker/MakerAdmin'));
const ApprovalsPage = lazy(() => import('./ApprovalsPage'));
const SeasonAdmin = lazy(() => import('../components/season/SeasonAdmin'));

type Tab = string;

interface AdminTab {
  key: Tab;
  label: string;
  icon: ReactNode;
  count?: number;
  Component?: ComponentType;
}

/**
 * Administración de la liga (dueño, admins y superadmin). Abre en «Pendientes» (todos los deportes: lo que espera
 * por el admin, los primeros pasos y «Suspender un día»). Después, en el boliche, las pestañas de siempre. En los
 * otros deportes van primero las suyas (Equipos, Campos, Nadadores, Parejas y niveles: lo que hace falta para
 * arrancar); si el deporte maneja a su gente en su pestaña, la general «Jugadores» no sale y lo de vincular cuentas
 * queda en Miembros.
 */
export default function AdminPage() {
  const ctx = useLeagueCtx();
  const { lid, isAdmin, league } = ctx;
  const [params, setParams] = useSearchParams();
  const sport = leagueSport(league);
  const bowling = sport === 'bowling';
  // Pestañas propias del deporte (una con la misma clave que una general la reemplaza).
  const screens = useSportScreens(bowling ? null : sport);
  const pending = useSubmissions(isAdmin && bowling ? lid : undefined, 'pendiente').data.length;
  const newSuggestions = useNotifications().feeds.find((f) => f.lid === lid)?.suggestions.length ?? 0;
  // Reclamos de jugadores sin cuenta («ese soy yo»): todos los deportes.
  const uid = useAuth().user?.uid;
  const claims = usePendingClaimCount(isAdmin ? lid : null, uid);
  // Reportes de comentarios, avisos y juegos de la liga: la pestaña sale solo si alguna vez hubo alguno.
  const reports = useReportCounts(isAdmin, lid).data;
  // Todo lo que espera por el admin (envíos y reclamos en vivo; partidos reclamados o atrasados y listas de espera).
  const toDo = pendingTotal(useLeaguePending(isAdmin ? lid : null).data, { submissions: bowling ? pending : undefined, claims });
  // Hazañas por confirmar (aval de insignias): la pestaña sale cuando hay alguna (o si el link la pide).
  const reviews = useBadgeNotices().data.reviews.filter((r) => r.leagueId === lid).length;
  // Insignias de la liga (el creador): solo para quien las diseña y las da.
  const makers = canMakeBadges(ctx);
  const generic: AdminTab[] = [
    // Primero en todos los deportes (arrangeAdminTabs) y abre ahí.
    { key: 'pendientes', label: 'Pendientes', icon: <ClipboardCheck className="size-4" />, count: toDo },
    { key: 'jugadores', label: 'Jugadores', icon: <Users className="size-4" /> },
    // Aprobar envíos (con foto del marcador) es del boliche; los otros deportes confirman en sus partidos.
    ...(bowling ? [{ key: 'aprobar', label: 'Aprobar', icon: <Inbox className="size-4" />, count: pending }] : []),
    { key: 'miembros', label: 'Miembros', icon: <Shield className="size-4" /> },
    { key: 'reclamos', label: 'Reclamos', icon: <UserCheck className="size-4" />, count: claims },
    ...(reports.all > 0 ? [{ key: 'reportes', label: 'Reportes', icon: <Flag className="size-4" />, count: reports.open }] : []),
    ...(reviews > 0 || params.get('tab') === 'confirmar'
      ? [{ key: 'confirmar', label: 'Por confirmar', icon: <BadgeCheck className="size-4" />, count: reviews }]
      : []),
    ...(makers ? [{ key: 'insignias', label: 'Insignias', icon: <Award className="size-4" /> }] : []),
    { key: 'buzon', label: 'Buzón', icon: <Lightbulb className="size-4" />, count: newSuggestions },
    // Cerrar la temporada con sus campeones y empezar la siguiente (un torneo suelto no tiene temporadas).
    ...(league.kind === 'torneo' ? [] : [{ key: 'temporada', label: 'Temporada', icon: <CalendarRange className="size-4" /> }]),
    { key: 'liga', label: league.kind === 'torneo' ? 'Datos' : 'Liga', icon: <Settings2 className="size-4" /> },
  ];
  // Las del deporte; una que reemplaza a una general conserva su icono y su número.
  const own: AdminTab[] = (screens?.adminTabs ?? []).map((x) => {
    const g = generic.find((t) => t.key === x.key);
    return g
      ? { ...g, label: x.label, Component: x.Component }
      : { key: x.key, label: x.label, icon: x.icon ? <x.icon className="size-4" /> : <Settings2 className="size-4" />, Component: x.Component };
  });
  const { tabs, defaultKey, playersMerged } = arrangeAdminTabs(generic, own, bowling);
  const peopleTab = own.find((t) => PEOPLE_TABS.has(t.key));
  // Las pantallas del deporte llegan aparte: mientras tanto no se abre una pestaña que después cambia.
  const waiting = !bowling && hasScreens(sport) && !screens;
  const raw = params.get('tab');
  // Un link viejo a «Jugadores» donde ya no sale: lo de las cuentas está en Miembros.
  const requested = raw === 'jugadores' && playersMerged ? 'miembros' : raw;
  const tab: Tab = requested && tabs.some((t) => t.key === requested) ? requested : defaultKey;
  const Own = tabs.find((t) => t.key === tab)?.Component;

  if (!isAdmin) {
    return <LoadError error={new Error('permission-denied')} />;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* El tour de Admin habla de las pestañas del boliche (Aprobar, promedios): los otros deportes no lo ven. */}
      <Tour name="admin" steps={ADMIN_TOUR} when={isAdmin && bowling} />
      {waiting ? (
        <AdminSkeleton />
      ) : (
        <AdminTabs
          tabs={tabs}
          tab={tab}
          onChange={(k) => setParams({ tab: k }, { replace: true })}
          Own={Own}
          accountsOf={playersMerged ? (peopleTab?.label ?? null) : null}
          playersTab={playersMerged ? (peopleTab?.key ?? null) : null}
        />
      )}
    </div>
  );
}

function AdminSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <Skeleton className="h-10 w-full rounded-xl sm:w-96" />
      <ListSkeleton rows={5} />
    </div>
  );
}

function AdminTabs({
  tabs,
  tab,
  onChange,
  Own,
  accountsOf,
  playersTab,
}: {
  tabs: AdminTab[];
  tab: Tab;
  onChange: (k: Tab) => void;
  Own: ComponentType | undefined;
  accountsOf: string | null;
  /** Donde se agregan jugadores en este deporte, si no es «Jugadores» (los primeros pasos llevan ahí). */
  playersTab: string | null;
}) {
  return (
    <>
      <div data-tour="admin-secciones">
        <Tabs items={tabs} active={tab} onChange={onChange} />
      </div>
      <Suspense fallback={<TopLoader />}>
        <div key={tab} className="animate-fade-up">
          {Own ? (
            <Own />
          ) : tab === 'pendientes' ? (
            <PendingPanel playersTab={playersTab} />
          ) : tab === 'jugadores' ? (
            <PlayersPage />
          ) : tab === 'aprobar' ? (
            <ApprovalsPage />
          ) : tab === 'miembros' ? (
            <MembersPanel accountsOf={accountsOf} />
          ) : tab === 'reclamos' ? (
            <ClaimsPanel />
          ) : tab === 'reportes' ? (
            <LeagueReportsPanel />
          ) : tab === 'confirmar' ? (
            <ReviewsPanel />
          ) : tab === 'insignias' ? (
            <MakerAdmin />
          ) : tab === 'buzon' ? (
            <SuggestionsPanel />
          ) : tab === 'temporada' ? (
            <SeasonAdmin />
          ) : (
            <SettingsPanel />
          )}
        </div>
      </Suspense>
    </>
  );
}

const ORDER: Record<Member['role'], number> = { owner: 0, admin: 1, member: 2 };

/**
 * Miembros y permisos. Todos los que entran son jugadores; el dueño nombra admins (y, en torneos
 * sin liga, anotadores). Un miembro puede tener varios roles (p. ej. anotador y jugador).
 * `accountsOf`: el deporte maneja a su gente en su propia pestaña (ese es su nombre); aquí abajo queda lo de
 * vincular cada cuenta con su jugador de la lista.
 */
function MembersPanel({ accountsOf = null }: { accountsOf?: string | null }) {
  const { lid, league, isOwner } = useLeagueCtx();
  const { user } = useAuth();
  const run = useAction();
  const { confirm } = useFeedback();
  const members = useLeagueMembers(lid);
  const players = usePlayers(lid);
  const playerName = useMemo(() => new Map(players.data.map((p) => [p.id, p.name])), [players.data]);
  const sorted = [...members.data].sort((a, b) => ORDER[a.role] - ORDER[b.role] || a.name.localeCompare(b.name));
  // Anotadores: en torneos sin liga y en las ligas de otros deportes (en la liga de práctica del boliche no hacen falta).
  const bowling = leagueSport(league) === 'bowling';
  const scorers = league.kind === 'torneo' || !bowling;
  const where = league.kind === 'torneo' ? 'el torneo' : 'la liga';
  // «Diseña insignias» vale con la regla «Yo y los que yo elija» (Liga › ¿Quién diseña y da insignias?).
  const chosen = badgeMakersOf(league) === 'chosen';

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
        ? bowling
          ? 'Podrá anotar los juegos de los inscritos (a mano, por cuadros o con la foto) y nada más. Sigue siendo jugador.'
          : 'Podrá anotar los partidos, las tarjetas o los tiempos, y nada más. Sigue siendo jugador.'
        : `Ya no podrá anotar en ${where}.`,
      confirmText: make ? 'Hacer anotador' : 'Quitar anotador',
      danger: !make,
    });
    if (ok) await run(() => setMemberScorer(m, make), make ? `${m.name} ahora es anotador` : 'Listo');
  }

  async function toggleMaker(m: Member) {
    const make = !m.badgeMaker;
    const ok = await confirm({
      title: make ? `¿${m.name} diseña insignias?` : `¿Quitarle a ${m.name} el diseño de insignias?`,
      message: make
        ? 'Podrá crear las insignias de la liga y darlas. Solo tú puedes quitarlas.'
        : `Ya no podrá crear ni dar insignias de ${where}. Las que ya dio se quedan.`,
      confirmText: make ? 'Sí, que diseñe' : 'Quitar',
      danger: !make,
    });
    if (ok) await run(() => setMemberBadgeMaker(m, make), make ? `${m.name} ahora diseña insignias` : 'Listo');
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
          {chosen && (
            <>
              ; <b className="text-fg">Diseña insignias</b> crea y da las insignias de {where}
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
            // El dueño saca a cualquiera; un admin solo a los que no tienen permisos (ni admin, ni anotador, ni diseña insignias).
            const canKick = !me && m.role !== 'owner' && (isOwner || (m.role === 'member' && !m.scorer && !m.badgeMaker));
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
                    {chosen && m.badgeMaker && (
                      <Badge tone="accent">
                        <Palette className="size-3" aria-hidden="true" /> Diseña insignias
                      </Badge>
                    )}
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
                    {canManage && chosen && (
                      <Button size="sm" icon={<Palette className="size-4" />} onClick={() => toggleMaker(m)}>
                        {m.badgeMaker ? 'Ya no diseña' : 'Diseña insignias'}
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
      {accountsOf && (
        <Suspense fallback={<ListSkeleton rows={3} />}>
          <div className="mt-2 border-t border-line pt-5">
            <PlayersPage variant="accounts" addWhere={accountsOf} />
          </div>
        </Suspense>
      )}
    </div>
  );
}

/** Datos de la liga (se editan en un modal), el aviso a toda la liga, la invitación y la configuración (respaldo, fotos, borrar). */
function SettingsPanel() {
  const { league } = useLeagueCtx();
  const [editing, setEditing] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [open, setOpen] = useState(false);
  const isTournament = league.kind === 'torneo';
  const season = league.seasonStart && league.seasonEnd ? `${formatDate(league.seasonStart)} – ${formatDate(league.seasonEnd)}` : '';
  const contact = [league.contactName, league.contactPhone].filter(Boolean).join(' · ');
  // La foto del marcador es solo del boliche.
  const photos = sportMeta(leagueSport(league))?.photos ?? false;
  const tz = league.tz || 'America/Santo_Domingo';
  const offset = tzOffset(tz);

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
              <Detail icon={<MapPin className="size-4" />} label={venueLabel(league.sport)} value={league.venue} />
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
              {photos && (
                <Detail
                  icon={<Camera className="size-4" />}
                  label="Foto del marcador"
                  value={league.requirePhoto !== false ? 'Obligatoria para que cuente' : 'Opcional'}
                />
              )}
              <Detail icon={<Earth className="size-4" />} label="Zona horaria" value={`${tzLabel(tz)}${offset ? ` (${offset})` : ''}`} />
              <Detail
                icon={<Baby className="size-4" />}
                label={isTournament ? 'Torneo con menores' : 'Liga con menores'}
                value={league.hasMinors ? 'Sí: privada, sin fotos ni comentarios' : 'No'}
              />
            </dl>
            <Button className="mt-4 w-full sm:w-auto" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
              Editar datos
            </Button>
          </div>
        </div>
      </Card>

      <LogoCard />

      <AnnouncePanel />

      <BadgesSettingsCard />

      <BadgeMakersCard />

      <InviteCard league={league} />

      <EditLeagueModal open={editing} onClose={() => setEditing(false)} />
      <LeagueConfigModal open={configuring} onClose={() => setConfiguring(false)} />
    </div>
  );
}

/**
 * El logo de la liga o del torneo (dueño y admins): cómo se ve, «Subir logo» o «Cambiar» (se recorta al cuadrado
 * del centro y se comprime en el teléfono) y «Quitar» (vuelve el ícono del deporte). Necesita señal.
 */
function LogoCard() {
  const { lid, league } = useLeagueCtx();
  const { confirm, toast } = useFeedback();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kind = league.kind ?? 'liga';
  const noun = kind === 'torneo' ? 'el torneo' : 'la liga';
  const has = !!league.logoPath;

  async function upload(file: File | undefined) {
    if (input.current) input.current.value = '';
    if (!file || busy) return;
    setBusy('upload');
    setError(null);
    try {
      await uploadLeagueLogo(lid, file);
      toast(has ? 'Logo cambiado' : 'Logo listo');
    } catch (e) {
      setError(logoErrorText(e, kind));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: '¿Quitar el logo?',
      message: `${kind === 'torneo' ? 'El torneo' : 'La liga'} vuelve a mostrar el ícono del deporte. Puedes subir otro cuando quieras.`,
      confirmText: 'Quitar',
      danger: true,
    });
    if (!ok) return;
    setBusy('remove');
    setError(null);
    try {
      await removeLeagueLogo(lid);
      toast('Logo quitado');
    } catch (e) {
      setError(logoErrorText(e, kind));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <LeagueIcon league={league} size="xl" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Logo</h2>
          <p className="text-xs text-muted">
            {has ? 'Sale' : 'Si subes uno, sale'} en la lista de ligas, en las invitaciones y arriba en {noun}. Es una imagen pública.
          </p>
        </div>
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0])} />
      <div className="flex flex-wrap gap-2">
        <Button
          className="h-11"
          variant={has ? 'secondary' : 'primary'}
          loading={busy === 'upload'}
          disabled={!!busy}
          icon={<ImageUp className="size-4" />}
          onClick={() => input.current?.click()}
        >
          {busy === 'upload' ? 'Subiendo…' : has ? 'Cambiar' : 'Subir logo'}
        </Button>
        {has && (
          <Button className="h-11" variant="ghost" loading={busy === 'remove'} disabled={!!busy} icon={<Trash2 className="size-4" />} onClick={() => void remove()}>
            Quitar
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </Card>
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
  const bowling = leagueSport(league) === 'bowling';

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
      message: bowling
        ? 'Se borran sus torneos, prácticas, jugadores, juegos, fotos, miembros e invitación. No se puede deshacer; descarga el respaldo antes.'
        : 'Se borran sus eventos, partidos, jugadores, resultados, miembros e invitación. No se puede deshacer; descarga el respaldo antes.',
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
          text={
            bowling
              ? 'Descarga todos los datos (jugadores, eventos, juegos y miembros) en un archivo. Las fotos no entran.'
              : 'Descarga todos los datos (jugadores, eventos, partidos, resultados y miembros) en un archivo.'
          }
          action={
            <Button size="sm" loading={busy === 'backup'} onClick={backup}>
              Descargar
            </Button>
          }
        />
        {bowling && (
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
        )}
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
