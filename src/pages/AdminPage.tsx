import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import {
  Baby,
  CalendarRange,
  Camera,
  ChevronDown,
  ClipboardList,
  ClipboardX,
  Clock,
  DatabaseBackup,
  Earth,
  Globe,
  ImageMinus,
  ImageUp,
  Lock,
  MapPin,
  MessageCircle,
  Palette,
  Pencil,
  Save,
  Settings,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserMinus,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { deleteLeague, deleteOldPhotos, removeMember, setMemberRole, setMemberScorer, updateLeague, useLeagueMembers, usePlayers } from '../lib/data';
import { rememberLeague, roleLabel, useLeagueCtx } from '../lib/league';
import { logoErrorText, removeLeagueLogo, uploadLeagueLogo } from '../lib/logos';
import type { Member } from '../lib/types';
import { Avatar } from '../components/Avatar';
import { LeagueIcon } from '../components/home/LeagueCard';
import { InviteCard } from '../components/InviteCard';
import { SuggestionsPanel } from '../components/SuggestionsPanel';
import { leagueSport } from '../sports/registry';
import { LeagueForm } from '../components/LeagueFormModal';
import { useAction, useFeedback } from '../components/feedback';
import { useBusy } from '../components/busy';
import { Badge, Button, Card, ListRow, ListSkeleton, LoadError, Modal, RowIcon, Segmented, Skeleton, TopLoader, cx } from '../components/ui';
import { AnnouncePanel } from '../components/league/Announce';
import {
  BACKUP_ERROR_TEXT,
  DELETED_TEXT,
  EMPTY_DETAIL,
  FREE_PHOTOS_CONFIRM,
  LOGO_REMOVED_TEXT,
  OLD_PHOTOS_MONTHS,
  backupDoneText,
  configRowSubtitle,
  configRowTitle,
  configRows,
  configTitle,
  deleteLeagueConfirm,
  freedPhotosText,
  leagueDataTitle,
  leagueInput,
  leaguePhotos,
  logoButtonLabel,
  logoDoneText,
  logoHint,
  removeLogoConfirm,
  settingsDetails,
  visibilityLabel,
  type ConfigKey,
  type DetailKey,
} from '../components/league/settings';
import { adminConfirm, kickConfirm, makerConfirm, memberLabels, memberPlayerBadge, memberRights, membersIntro, membersScope, scorerConfirm, sortMembers } from '../components/league/members';
import { usePendingClaimCount } from '../components/claims/data';
import { ScreenHeader, useOwnTabs } from '../components/organizer/Hub';
import { adminScreenTitle, organizeUrl } from '../components/organizer/hubLogic';
import { SuspendDayRow } from '../components/organizer/SuspendDay';
import { BadgesSettingsCard } from '../components/badges/BadgesSettings';
import { LiveSettingsCard } from '../components/live/LiveSettingsCard';
import { canEnterLeagues } from '../components/squads/logic';
import { SquadRequestsPanel } from '../components/squads/SquadRequestsPanel';
import { BadgeMakersCard } from '../components/badges/maker/MakerSettings';
import { badgeMakersOf, canMakeBadges, setMemberBadgeMaker } from '../lib/data/leagueBadges';

const PlayersPage = lazy(() => import('./PlayersPage'));
const ClaimsPanel = lazy(() => import('../components/claims/ClaimsPanel').then((m) => ({ default: m.ClaimsPanel })));
const LeagueReportsPanel = lazy(() => import('../components/report/LeagueReportsPanel').then((m) => ({ default: m.LeagueReportsPanel })));
const ReviewsPanel = lazy(() => import('../components/badges/ReviewsPanel'));
const MakerAdmin = lazy(() => import('../components/badges/maker/MakerAdmin'));
const ApprovalsPage = lazy(() => import('./ApprovalsPage'));
const SeasonAdmin = lazy(() => import('../components/season/SeasonAdmin'));

/** Las pantallas de Organizar que son de la gente de la liga (un segmentado arriba las cambia). */
type PeopleTab = 'jugadores' | 'miembros' | 'reclamos';
const PEOPLE: readonly string[] = ['jugadores', 'miembros', 'reclamos'];

/**
 * Las pantallas de Organizar (`/l/:lid/admin?tab=…`), cada una con «‹ Organizar» y su título: Jugadores y miembros
 * (Jugadores · Miembros · Reclamos), Aprobar juegos, Buzón, Temporada y fechas (con «Suspender un día»), Avisar a toda
 * la liga, Insignias, Ajustes de la liga, Reportes, Insignias por confirmar y las propias del deporte (Equipos, Campos,
 * Nadadores, Parejas y niveles). Sin pantalla (o con la vieja «Pendientes») va a Organizar, con «Por hacer» y «La liga»
 * (src/pages/OrganizePage.tsx). Dueño, admins y superadmin.
 */
export default function AdminPage() {
  const ctx = useLeagueCtx();
  const { lid, isAdmin, league } = ctx;
  const [params, setParams] = useSearchParams();
  // Las del deporte; una con la misma clave que una general la reemplaza (p. ej. 'jugadores').
  const own = useOwnTabs(league);
  // Reclamos de jugadores sin cuenta («ese soy yo»): todos los deportes.
  const uid = useAuth().user?.uid;
  const claims = usePendingClaimCount(isAdmin ? lid : null, uid);
  // Insignias de la liga (el creador): solo para quien las diseña y las da.
  const makers = canMakeBadges(ctx);

  if (!isAdmin) {
    return <LoadError error={new Error('permission-denied')} />;
  }
  // Las pantallas del deporte llegan aparte: mientras tanto no se abre una que después cambia.
  if (!own.ready) return <AdminSkeleton />;

  const raw = params.get('tab');
  // Un link viejo a «Jugadores» donde la gente va en la pantalla del deporte: lo de las cuentas está en Miembros.
  const tab = raw === 'jugadores' && own.playersMerged ? 'miembros' : raw;
  const ownTab = tab ? own.all.find((t) => t.key === tab) : undefined;
  // Aprobar envíos (con foto del marcador) es del boliche; los otros deportes confirman en sus partidos.
  const general = !!tab && adminScreenTitle(tab, league.kind) !== null && (tab !== 'aprobar' || own.bowling);
  if (!tab || (!ownTab && !general)) return <Navigate to={organizeUrl(lid)} replace />;

  const people = PEOPLE.includes(tab);
  const title = (!people && ownTab?.label) || adminScreenTitle(tab, league.kind) || '';
  const peopleOptions = [
    ...(own.playersMerged ? [] : [{ key: 'jugadores' as const, label: own.all.find((t) => t.key === 'jugadores')?.label ?? 'Jugadores' }]),
    { key: 'miembros' as const, label: 'Miembros' },
    {
      key: 'reclamos' as const,
      ariaLabel: claims ? `Reclamos: ${claims} por revisar` : 'Reclamos',
      label: (
        <>
          Reclamos
          {claims > 0 && <span className="num grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold tracking-normal text-accent-fg">{claims}</span>}
        </>
      ),
    },
  ];

  return (
    // 24 px a los lados en el teléfono, como Hoy y Organizar.
    <div className="flex flex-col gap-5 px-2">
      <ScreenHeader lid={lid} title={title}>
        {people && (
          <Segmented<PeopleTab>
            label="Gente de la liga"
            full
            className="mt-4"
            options={peopleOptions}
            value={tab as PeopleTab}
            onChange={(k) => setParams({ tab: k }, { replace: true })}
          />
        )}
      </ScreenHeader>
      <Suspense fallback={<TopLoader />}>
        <div key={tab} className="animate-fade-up">
          {ownTab ? (
            <div className="flex flex-col gap-[26px]">
              {/* Equipos que piden entrar a la liga (src/components/squads): arriba de los equipos de la liga. */}
              {ownTab.key === 'equipos' && canEnterLeagues(leagueSport(league)) && <SquadRequestsPanel lid={lid} />}
              <ownTab.Component />
            </div>
          ) : tab === 'jugadores' ? (
            <PlayersPage />
          ) : tab === 'miembros' ? (
            <MembersPanel accountsOf={own.playersMerged ? (own.peopleTab?.label ?? null) : null} />
          ) : tab === 'reclamos' ? (
            <ClaimsPanel />
          ) : tab === 'aprobar' ? (
            <ApprovalsPage />
          ) : tab === 'buzon' ? (
            <SuggestionsPanel />
          ) : tab === 'temporada' ? (
            <SeasonScreen />
          ) : tab === 'avisar' ? (
            <AnnouncePanel />
          ) : tab === 'insignias' ? (
            <BadgesScreen makers={makers} />
          ) : tab === 'confirmar' ? (
            <ReviewsPanel />
          ) : tab === 'reportes' ? (
            <LeagueReportsPanel />
          ) : (
            <SettingsPanel />
          )}
        </div>
      </Suspense>
    </div>
  );
}

function AdminSkeleton() {
  return (
    <div className="flex flex-col gap-5 px-2" aria-busy="true">
      <Skeleton className="h-11 w-32 rounded-xl" />
      <Skeleton className="h-9 w-2/3 rounded-xl" />
      <ListSkeleton rows={5} />
    </div>
  );
}

/** Temporada y fechas: «Suspender un día» (lluvia, la bolera cerrada) y, en una liga, cerrar la temporada y empezar otra. */
function SeasonScreen() {
  const { league } = useLeagueCtx();
  return (
    <div className="flex flex-col gap-6">
      <SuspendDayRow />
      {/* Un torneo suelto no tiene temporadas. La temporada llega aparte: «Suspender un día» sale de una vez. */}
      {league.kind !== 'torneo' && (
        <Suspense fallback={<ListSkeleton rows={2} />}>
          <SeasonAdmin />
        </Suspense>
      )}
    </div>
  );
}

/**
 * Insignias: las automáticas (cuáles da la app), quién diseña y da las de la liga y, para quien las diseña, el creador
 * (antes en Admin › Liga y Admin › Insignias).
 */
function BadgesScreen({ makers }: { makers: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      <BadgesSettingsCard />
      <BadgeMakersCard />
      {/* El creador llega aparte: lo de arriba sale de una vez. */}
      {makers && (
        <Suspense fallback={<ListSkeleton rows={2} />}>
          <MakerAdmin />
        </Suspense>
      )}
    </div>
  );
}

/**
 * Miembros y permisos. Todos los que entran son jugadores (salvo quien entró solo para anotar); el dueño nombra
 * admins y el dueño o un admin, anotadores. Un miembro puede tener varios roles (p. ej. anotador y jugador).
 * `accountsOf`: el deporte maneja a su gente en su propia pestaña (ese es su nombre); aquí abajo queda lo de
 * vincular cada cuenta con su jugador de la lista.
 */
function MembersPanel({ accountsOf = null }: { accountsOf?: string | null }) {
  const { lid, league, isOwner, isAdmin } = useLeagueCtx();
  const { user } = useAuth();
  const run = useAction();
  const { confirm } = useFeedback();
  // Qué permiso de quién se está guardando (`${m.id}:admin`…): ese botón da vueltas y los demás esperan.
  const busy = useBusy();
  const members = useLeagueMembers(lid);
  const players = usePlayers(lid);
  const playerName = useMemo(() => new Map(players.data.map((p) => [p.id, p.name])), [players.data]);
  const sorted = sortMembers(members.data);
  // Anotadores: en todas (en una liga de boliche anotan sus torneos, no las prácticas). «Diseña insignias» vale con la
  // regla «Yo y los que yo elija» (Liga › ¿Quién diseña y da insignias?).
  const scope = membersScope(league, badgeMakersOf(league) === 'chosen');
  const { chosen } = scope;

  async function toggleAdmin(m: Member) {
    const ask = adminConfirm(m, scope, user?.uid);
    if (await confirm(ask)) await busy.run(`${m.id}:admin`, () => run(() => setMemberRole(m, ask.role), ask.done));
  }

  async function toggleScorer(m: Member) {
    // Quien entró solo para anotar (sin jugador ni otro permiso) sale de la liga al quitarle el permiso (lo dice la pregunta).
    const ask = scorerConfirm(m, scope);
    if (await confirm(ask)) await busy.run(`${m.id}:scorer`, () => run(() => setMemberScorer(m, ask.make), ask.done));
  }

  async function toggleMaker(m: Member) {
    const ask = makerConfirm(m, scope);
    if (await confirm(ask)) await busy.run(`${m.id}:maker`, () => run(() => setMemberBadgeMaker(m, ask.make), ask.done));
  }

  async function kick(m: Member) {
    const ask = kickConfirm(m, scope);
    if (await confirm(ask)) await busy.run(`${m.id}:kick`, () => run(() => removeMember(m), ask.done));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="px-1">
        <p className="text-sm text-muted">
          {membersIntro(scope, isOwner).map((part, i) =>
            part.strong ? (
              <b key={i} className="text-fg">
                {part.text}
              </b>
            ) : (
              part.text
            ),
          )}
        </p>
      </div>
      {members.error ? (
        <LoadError error={members.error} />
      ) : members.loading ? (
        <ListSkeleton rows={4} />
      ) : (
        <Card className="stagger overflow-hidden">
          {sorted.map((m, i) => {
            const me = m.uid === user?.uid;
            // Quién puede qué (members.ts): el dueño saca a cualquiera; un admin, a los que no tienen permisos.
            const { canKick, canManage, canScorer, canStepDown } = memberRights(m, { uid: user?.uid, isOwner, isAdmin });
            const label = memberLabels(m, scope);
            const player = memberPlayerBadge(m, m.playerId ? playerName.get(m.playerId) : undefined);
            return (
              <div key={m.id} style={{ '--i': i } as CSSProperties} className="mm-row relative flex flex-wrap items-center gap-3 py-3 pr-[18px] pl-5">
                <Avatar name={m.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-medium">{m.name}</span>
                    {me && <Badge>Tú</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.role !== 'member' && <Badge tone="accent">{roleLabel(m.role)}</Badge>}
                    {m.scorer && <Badge tone="warn">Anotador</Badge>}
                    {chosen && m.badgeMaker && (
                      <Badge tone="accent">
                        <Palette className="size-3" aria-hidden="true" /> Diseña insignias
                      </Badge>
                    )}
                    <Badge tone={player.tone}>{player.text}</Badge>
                  </div>
                </div>
                {(canManage || canScorer || canKick || canStepDown) && (
                  <div className="flex flex-wrap justify-end gap-1">
                    {canStepDown && (
                      <Button
                        size="sm"
                        className="h-11"
                        icon={<ShieldOff className="size-4" />}
                        loading={busy.isBusy(`${m.id}:admin`)}
                        disabled={busy.isBusy()}
                        onClick={() => toggleAdmin(m)}
                      >
                        {label.stepDown}
                      </Button>
                    )}
                    {canManage && (
                      <Button
                        size="sm"
                        className="h-11"
                        icon={m.role === 'admin' ? <ShieldOff className="size-4" /> : <ShieldCheck className="size-4" />}
                        loading={busy.isBusy(`${m.id}:admin`)}
                        disabled={busy.isBusy()}
                        onClick={() => toggleAdmin(m)}
                      >
                        {label.admin}
                      </Button>
                    )}
                    {canScorer && (
                      <Button
                        size="sm"
                        className="h-11"
                        icon={m.scorer ? <ClipboardX className="size-4" /> : <ClipboardList className="size-4" />}
                        loading={busy.isBusy(`${m.id}:scorer`)}
                        disabled={busy.isBusy()}
                        onClick={() => toggleScorer(m)}
                      >
                        {label.scorer}
                      </Button>
                    )}
                    {canManage && chosen && (
                      <Button
                        size="sm"
                        className="h-11"
                        icon={<Palette className="size-4" />}
                        loading={busy.isBusy(`${m.id}:maker`)}
                        disabled={busy.isBusy()}
                        onClick={() => toggleMaker(m)}
                      >
                        {label.maker}
                      </Button>
                    )}
                    {canKick && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-11 text-danger"
                        aria-label={label.kick}
                        title={label.kickTitle}
                        icon={<UserMinus className="size-4" />}
                        loading={busy.isBusy(`${m.id}:kick`)}
                        disabled={busy.isBusy()}
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

/** El ícono de cada dato de la liga (settingsDetails). */
const DETAIL_ICONS: Record<DetailKey, ReactNode> = {
  venue: <MapPin className="size-4" />,
  schedule: <Clock className="size-4" />,
  season: <CalendarRange className="size-4" />,
  contact: <MessageCircle className="size-4" />,
  photo: <Camera className="size-4" />,
  tz: <Earth className="size-4" />,
  minors: <Baby className="size-4" />,
};

/** El ícono de cada fila de la configuración (configRows). */
const CONFIG_ICONS: Record<ConfigKey, ReactNode> = {
  backup: <DatabaseBackup className="size-5" />,
  photos: <ImageMinus className="size-5" />,
  delete: <Trash2 className="size-5" />,
};

/**
 * Ajustes de la liga: los datos (se editan en un modal; ahí va la foto del marcador), el logo, las transmisiones en vivo,
 * la invitación y, al final, el respaldo, las fotos viejas y borrar la liga (en su hoja). Avisar e Insignias tienen su
 * propia fila en Organizar. Lo que no es pantalla está en src/components/league/settings.ts (lo usa también la app).
 */
function SettingsPanel() {
  const { league, isOwner } = useLeagueCtx();
  const { isSuper } = useAuth();
  const [editing, setEditing] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [open, setOpen] = useState(false);
  const canDelete = isOwner || isSuper;
  // La foto del marcador es solo del boliche.
  const photos = leaguePhotos(league);

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
                {leagueDataTitle(league.kind)}
                <Badge tone={league.visibility === 'private' ? 'neutral' : 'accent'} className="px-1.5 py-0 text-[11px]">
                  {league.visibility === 'private' ? <Lock className="size-3" /> : <Globe className="size-3" />}
                  {visibilityLabel(league.visibility)}
                </Badge>
              </p>
              <h2 className="truncate text-lg font-bold tracking-tight">{league.name}</h2>
            </div>
            <ChevronDown className={cx('size-5 shrink-0 text-muted transition-transform duration-200', open && 'rotate-180')} />
          </button>
        </div>
        <div
          id="datos-liga"
          className={cx('grid transition-[grid-template-rows,opacity] duration-200 ease-out', open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}
        >
          <div className="overflow-hidden" inert={!open}>
            <dl className="grid gap-2.5 pt-4 text-sm sm:grid-cols-2">
              {settingsDetails(league).map((d) => (
                <Detail
                  key={d.key}
                  icon={DETAIL_ICONS[d.key]}
                  label={d.label}
                  value={
                    d.href ? (
                      <a href={d.href} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                        {d.value}
                      </a>
                    ) : (
                      d.value
                    )
                  }
                />
              ))}
            </dl>
            <Button className="mt-4 w-full sm:w-auto" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
              Editar datos
            </Button>
          </div>
        </div>
      </Card>

      <LogoCard />

      {/* Transmisiones en vivo: los admins y anotadores ponen el link de un partido (src/components/live). */}
      <LiveSettingsCard lid={league.id} />

      <InviteCard league={league} />

      <Card className="overflow-hidden">
        <ListRow
          dense
          leading={
            <RowIcon>
              <Settings className="size-[19px]" />
            </RowIcon>
          }
          title={configRowTitle(league.kind, canDelete)}
          subtitle={configRowSubtitle(league.kind, photos, canDelete)}
          onClick={() => setConfiguring(true)}
        />
      </Card>

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
  const has = !!league.logoPath;

  async function upload(file: File | undefined) {
    if (input.current) input.current.value = '';
    if (!file || busy) return;
    setBusy('upload');
    setError(null);
    try {
      await uploadLeagueLogo(lid, file);
      toast(logoDoneText(has));
    } catch (e) {
      setError(logoErrorText(e, kind));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    const ok = await confirm(removeLogoConfirm(kind));
    if (!ok) return;
    setBusy('remove');
    setError(null);
    try {
      await removeLeagueLogo(lid);
      toast(LOGO_REMOVED_TEXT);
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
          <p className="text-xs text-muted">{logoHint(has, kind)}</p>
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
          {logoButtonLabel(busy === 'upload', has)}
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
        <dd className={cx('truncate', !value && 'text-muted')}>{value || EMPTY_DETAIL}</dd>
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
      title={leagueDataTitle(league.kind)}
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
  const [busy, setBusy] = useState<ConfigKey | null>(null);
  const bowling = leagueSport(league) === 'bowling';

  async function backup() {
    setBusy('backup');
    try {
      const { downloadLeagueBackup } = await import('../lib/backup');
      toast(backupDoneText(await downloadLeagueBackup(league)));
    } catch (e) {
      console.error(e);
      toast(BACKUP_ERROR_TEXT, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function freePhotos() {
    const ok = await confirm(FREE_PHOTOS_CONFIRM);
    if (!ok) return;
    setBusy('photos');
    const n = await run(() => deleteOldPhotos(lid, OLD_PHOTOS_MONTHS));
    if (n != null) toast(freedPhotosText(n));
    setBusy(null);
  }

  async function remove() {
    const ok = await confirm(deleteLeagueConfirm(league.name, bowling));
    if (!ok || !user) return;
    setBusy('delete');
    const done = await run(async () => {
      await deleteLeague(lid, user.uid);
      return true;
    }, DELETED_TEXT);
    setBusy(null);
    if (done) {
      onClose();
      rememberLeague(null);
      navigate('/ligas', { replace: true });
    }
  }

  const actions: Record<ConfigKey, () => Promise<void>> = { backup, photos: freePhotos, delete: remove };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Settings className="size-5 text-accent" /> {configTitle(league.kind)}
        </span>
      }
      footer={<Button onClick={onClose}>Cerrar</Button>}
    >
      <div className="flex flex-col gap-3">
        {configRows({ kind: league.kind, bowling, canDelete: isOwner || isSuper }).map((r) => (
          <ConfigRow
            key={r.key}
            danger={r.danger}
            icon={CONFIG_ICONS[r.key]}
            title={r.title}
            text={r.text}
            action={
              <Button size="sm" variant={r.danger ? 'danger' : undefined} loading={busy === r.key} disabled={!!busy} onClick={actions[r.key]}>
                {r.action}
              </Button>
            }
          />
        ))}
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
