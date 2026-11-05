import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Building2, CircleCheck, Clock, EyeOff, PencilLine, Plus, ShieldAlert, Trash2, UserRound } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import {
  BUSINESS_STATUS_LABEL,
  VENUES_MAX,
  businessErrorText,
  deleteBusiness,
  isFeatured,
  registerBusiness,
  setAccountMode,
  updateBusiness,
  useMyBusiness,
  type Business,
  type OwnVenue,
} from '../../lib/data/business';
import { useIsPro } from '../../lib/useMode';
import { useFeedback } from '../../components/feedback';
import { ScreenTitle, SignInCard } from '../../components/screens/ScreenBits';
import { AppShell } from '../../components/Shell';
import { FeaturedBadge, VenuePhotoImg, venueLine } from '../../components/venues/VenueBits';
import { Badge, Button, Card, Empty, ListRow, LoadError, Loading, SectionHeader, Sheet } from '../../components/ui';
import { BusinessFields, businessFormFrom, businessInputFrom, businessProblem, emptyBusinessForm, type BusinessFormValue } from './BusinessForm';
import { VenueSheet } from './VenueSheet';

/**
 * Mi empresa (`/empresa`): para quien tiene canchas o un espacio deportivo. Sin empresa: registrarla (queda en revisión
 * y la app pasa a modo empresa). Con empresa: cómo va la revisión, sus espacios (agregar, cambiar, fotos, destacar),
 * sus datos, volver a la app de jugador y borrarla. docs/empresas.md.
 */
export default function BusinessPage() {
  const auth = useAuth();
  const location = useLocation();
  const pro = useIsPro();
  if (auth.loading) {
    return (
      <AppShell>
        <Loading />
      </AppShell>
    );
  }
  return (
    <AppShell>
      <div className="flex flex-col px-2">
        <ScreenTitle title="Mi empresa" hint="Tus canchas y espacios en MatchMate" pro={pro} />
        {auth.user ? (
          <BusinessHome />
        ) : (
          <SignInCard
            className="mt-6"
            icon={<Building2 />}
            title="Entra para registrar tu empresa"
            text="Si tienes canchas o un espacio deportivo, publícalo: los jugadores te encuentran en «Dónde jugar»."
            next={encodeURIComponent(location.pathname)}
          />
        )}
      </div>
    </AppShell>
  );
}

function BusinessHome() {
  const business = useMyBusiness();
  if (business.loading && !business.data) return <Loading label="Cargando tu empresa" />;
  if (business.error && !business.data) return <LoadError error={business.error} />;
  if (!business.data) return <Register />;
  return <Panel business={business.data} />;
}

function Register() {
  const pro = useIsPro();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const [form, setForm] = useState<BusinessFormValue>(emptyBusinessForm);
  const [busy, setBusy] = useState(false);
  const problem = businessProblem(form);

  async function register() {
    if (problem) return;
    setBusy(true);
    try {
      await registerBusiness(businessInputFrom(form));
      toast('Listo: tu empresa quedó registrada. La revisamos y te avisamos.');
      navigate('/empresa', { replace: true });
    } catch (e) {
      toast(businessErrorText(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card className="mt-5 flex flex-col gap-2 p-5">
        <h2 className="text-section">¿Tienes canchas o un espacio deportivo?</h2>
        <p className="text-meta text-muted">
          Regístralo gratis: los jugadores lo encuentran en «Dónde jugar» con sus fotos, precio y WhatsApp. Puedes destacar tus canchas para salir
          primero y organizar torneos en ellas. Tu cuenta de jugador sigue igual: cambias entre las dos cuando quieras.
        </p>
      </Card>
      <form
        className="mt-5 flex flex-col gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void register();
        }}
      >
        <BusinessFields value={form} onChange={setForm} />
        <Button type="submit" variant="primary" size={pro ? 'lg' : 'xl'} className="w-full" icon={<Building2 className="size-5" />} loading={busy} disabled={!!problem}>
          Registrar mi empresa
        </Button>
        <p className="text-center text-[13px] text-muted">La revisamos antes de que salga en la app (para que no haya canchas falsas).</p>
      </form>
    </>
  );
}

const ICON_TONE = { ok: 'text-ok', warn: 'text-warn', danger: 'text-danger' } as const;

function StatusCard({ business }: { business: Business }) {
  const s = business.status;
  const Icon = s === 'approved' ? CircleCheck : s === 'pending' ? Clock : ShieldAlert;
  const tone: keyof typeof ICON_TONE = s === 'approved' ? 'ok' : s === 'pending' ? 'warn' : 'danger';
  const text =
    s === 'approved'
      ? 'Tus espacios activos salen en «Dónde jugar».'
      : s === 'pending'
        ? 'La estamos revisando. Mientras, agrega tus espacios y sus fotos: salen en cuanto la aprobemos.'
        : s === 'rejected'
          ? 'Corrige tus datos y la volvemos a revisar.'
          : 'Tus espacios no salen en la app mientras esté suspendida.';
  return (
    <Card className="mt-5 flex items-start gap-3 p-4">
      <Icon className={`mt-0.5 size-5 shrink-0 ${ICON_TONE[tone]}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          {business.name} <Badge tone={tone}>{BUSINESS_STATUS_LABEL[s]}</Badge>
        </p>
        <p className="mt-1 text-meta text-muted">{text}</p>
        {business.statusNote && (s === 'rejected' || s === 'suspended') && <p className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{business.statusNote}</p>}
      </div>
    </Card>
  );
}

function VenueRow({ venue, onOpen }: { venue: OwnVenue; onOpen: () => void }) {
  const featured = isFeatured(venue);
  return (
    <ListRow
      onClick={onOpen}
      leading={
        <div className="w-16 shrink-0 overflow-hidden rounded-xl">
          <VenuePhotoImg photo={venue.photos[0]} sport={venue.sport} alt="" />
        </div>
      }
      title={venue.name}
      subtitle={venueLine(venue)}
      trailing={
        featured ? (
          <FeaturedBadge />
        ) : !venue.active ? (
          <Badge>
            <EyeOff className="mr-1 inline size-3.5" aria-hidden="true" />
            Oculto
          </Badge>
        ) : venue.promotion?.status === 'requested' ? (
          <Badge tone="accent">Pedida</Badge>
        ) : undefined
      }
      chevron
    />
  );
}

function Panel({ business }: { business: Business }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState<OwnVenue | 'nuevo' | null>(null);
  const [editData, setEditData] = useState(false);
  const inBusinessMode = auth.profile?.accountMode === 'business';
  const full = business.venues.length >= VENUES_MAX;

  async function switchMode(mode: 'player' | 'business') {
    try {
      await setAccountMode(mode);
      toast(mode === 'player' ? 'Ahora ves la app como jugador' : 'Ahora ves la app como empresa');
      if (mode === 'player') navigate('/');
    } catch (e) {
      toast(businessErrorText(e), 'error');
    }
  }

  async function removeBusiness() {
    const ok = await confirm({
      title: `¿Borrar ${business.name}?`,
      message: 'Se borran la empresa, sus espacios y sus fotos. Tu cuenta de jugador sigue igual.',
      confirmText: 'Borrar la empresa',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteBusiness();
      toast('Empresa borrada');
      navigate('/perfil');
    } catch (e) {
      toast(businessErrorText(e), 'error');
    }
  }

  return (
    <>
      <StatusCard business={business} />
      {!inBusinessMode && (
        <Card className="mt-3 flex items-center gap-3 p-4">
          <p className="min-w-0 flex-1 text-meta">Estás viendo la app como jugador.</p>
          <Button variant="soft" size="sm" onClick={() => void switchMode('business')}>
            Modo empresa
          </Button>
        </Card>
      )}

      <SectionHeader
        className="mt-7"
        title="Tus espacios"
        action={
          !full && business.status !== 'suspended' ? (
            <Button variant="soft" size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('nuevo')}>
              Agregar
            </Button>
          ) : undefined
        }
      />
      {business.venues.length ? (
        <Card className="overflow-hidden">
          {business.venues.map((v) => (
            <VenueRow key={v.id} venue={v} onOpen={() => setEditing(v)} />
          ))}
        </Card>
      ) : (
        <Empty icon={<Building2 className="size-7" aria-hidden="true" />} title="Todavía no tienes espacios">
          Agrega tu cancha, tu bolera o tu piscina: el deporte, cuántas canchas tiene, el precio y las fotos.
        </Empty>
      )}
      {!business.venues.length && business.status !== 'suspended' && (
        <Button variant="primary" size="xl" className="mt-3 w-full" icon={<Plus className="size-5" />} onClick={() => setEditing('nuevo')}>
          Agregar mi primer espacio
        </Button>
      )}

      <SectionHeader className="mt-7" title="Tu empresa" />
      <Card className="overflow-hidden">
        <ListRow leading={<PencilLine className="size-5 text-muted" aria-hidden="true" />} title="Datos de la empresa" subtitle={[business.city, business.phone].filter(Boolean).join(' · ')} onClick={() => setEditData(true)} chevron />
        {inBusinessMode && (
          <ListRow leading={<UserRound className="size-5 text-muted" aria-hidden="true" />} title="Usar la app como jugador" subtitle="Tu empresa sigue aquí: vuelves cuando quieras" onClick={() => void switchMode('player')} chevron />
        )}
        <ListRow leading={<Trash2 className="size-5 text-danger" aria-hidden="true" />} title={<span className="text-danger">Borrar mi empresa</span>} onClick={() => void removeBusiness()} />
      </Card>

      <VenueSheet open={editing !== null} onClose={() => setEditing(null)} business={business} venue={editing === 'nuevo' ? null : editing} />
      <EditBusinessSheet open={editData} onClose={() => setEditData(false)} business={business} />
    </>
  );
}

function EditBusinessSheet({ open, onClose, business }: { open: boolean; onClose: () => void; business: Business }) {
  return (
    <Sheet open={open} onClose={onClose} title="Datos de la empresa">
      {open && <EditBusinessBody business={business} onClose={onClose} />}
    </Sheet>
  );
}

function EditBusinessBody({ business, onClose }: { business: Business; onClose: () => void }) {
  const { toast } = useFeedback();
  const [form, setForm] = useState<BusinessFormValue>(() => businessFormFrom(business));
  const [busy, setBusy] = useState(false);
  const problem = businessProblem(form);
  return (
    <div className="flex flex-col gap-5 pb-2">
      <BusinessFields value={form} onChange={setForm} />
      <Button
        variant="primary"
        size="xl"
        className="w-full"
        loading={busy}
        disabled={!!problem}
        onClick={async () => {
          setBusy(true);
          try {
            await updateBusiness(businessInputFrom(form));
            toast(business.status === 'rejected' ? 'Guardado: la volvemos a revisar' : 'Guardado');
            onClose();
          } catch (e) {
            toast(businessErrorText(e), 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        Guardar
      </Button>
    </div>
  );
}
