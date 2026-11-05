import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Building2, CircleCheck, Clock, EyeOff, PencilLine, Plus, ShieldAlert, Trash2, UserRound } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { invalidate } from '@mm/lib/data/client';
import {
  BUSINESS_STATUS_LABEL,
  VENUES_MAX,
  businessErrorText,
  businessTags,
  deleteBusiness,
  isFeatured,
  registerBusiness,
  setAccountMode,
  updateBusiness,
  useMyBusiness,
  type Business,
  type OwnVenue,
} from '@mm/lib/data/business';
import { businessFormFrom, businessInputFrom, businessProblem, businessStatusInfo, emptyBusinessForm, showStatusNote, type BusinessFormValue } from '@mm/pages/business/logic';
import { venueLine } from '@mm/lib/venues/text';
import { BusinessFields } from '@/components/business/BusinessFields';
import { FeaturedBadge, VenuePhotoImg } from '@/components/venues/VenueBits';
import { confirmAsync, toast } from '@/components/feedback';
import { Badge, Button, Card, Divider, Empty, ErrorNote, ListRow, Loading, RowIcon, Screen, SectionHeader, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';

/**
 * Mi empresa (`/empresa`, como BusinessPage de la web): para quien tiene canchas o un espacio deportivo. Sin empresa:
 * registrarla (queda en revisión y la app pasa a modo empresa). Con empresa: cómo va la revisión, sus espacios (cada
 * uno se abre en /espacio/<id>), sus datos, volver a la app de jugador y borrarla. docs/empresas.md.
 */
export default function EmpresaScreen() {
  const auth = useAuth();
  const c = useColors();
  if (auth.loading) return <Loading />;
  if (!auth.user) {
    return (
      <Screen>
        <Title />
        <Card style={{ gap: 12 }}>
          <Building2 size={28} color={c.accent} />
          <Txt variant="cardTitle">Entra para registrar tu empresa</Txt>
          <Txt tone="fg2">Si tienes canchas o un espacio deportivo, publícalo: los jugadores te encuentran en «Dónde jugar».</Txt>
          <Button variant="primary" size="xl" full onPress={() => router.push('/login')}>
            Entrar
          </Button>
        </Card>
      </Screen>
    );
  }
  return <BusinessHome />;
}

function Title() {
  return (
    <View style={{ gap: 2 }}>
      <Txt variant="title">Mi empresa</Txt>
      <Txt variant="meta" tone="muted">
        Tus canchas y espacios en MatchMate
      </Txt>
    </View>
  );
}

function BusinessHome() {
  const business = useMyBusiness();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = () => {
    setRefreshing(true);
    invalidate(businessTags.mine);
    setTimeout(() => setRefreshing(false), 700);
  };
  if (business.loading && !business.data) return <Loading label="Cargando tu empresa" />;
  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Title />
      {business.data ? (
        <Panel business={business.data} />
      ) : business.error ? (
        <Empty title="No se pudo cargar tu empresa" text="Revisa tu conexión y desliza hacia abajo para intentar otra vez." />
      ) : (
        <Register />
      )}
    </Screen>
  );
}

function Register() {
  const c = useColors();
  const [form, setForm] = useState<BusinessFormValue>(emptyBusinessForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = businessProblem(form);

  async function register() {
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      await registerBusiness(businessInputFrom(form));
      toast('Listo: tu empresa quedó registrada. La revisamos y te avisamos.');
    } catch (e) {
      setError(businessErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card style={{ gap: 8 }}>
        <Txt variant="section">¿Tienes canchas o un espacio deportivo?</Txt>
        <Txt variant="meta" tone="muted">
          Regístralo gratis: los jugadores lo encuentran en «Dónde jugar» con sus fotos, precio y WhatsApp. Puedes destacar tus canchas para salir primero y
          organizar torneos en ellas. Tu cuenta de jugador sigue igual: cambias entre las dos cuando quieras.
        </Txt>
      </Card>
      <BusinessFields value={form} onChange={setForm} />
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button variant="primary" size="xl" full icon={<Building2 size={20} color={c.accentFg} />} loading={busy} disabled={!!problem} onPress={() => void register()}>
        Registrar mi empresa
      </Button>
      <Txt variant="small" tone="muted" style={{ textAlign: 'center' }}>
        La revisamos antes de que salga en la app (para que no haya canchas falsas).
      </Txt>
    </>
  );
}

function StatusCard({ business }: { business: Business }) {
  const c = useColors();
  const s = business.status;
  const Icon = s === 'approved' ? CircleCheck : s === 'pending' ? Clock : ShieldAlert;
  const { tone, text } = businessStatusInfo(s);
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16 }}>
      <Icon size={22} color={c[tone]} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Txt variant="bodyStrong">{business.name}</Txt>
          <Badge tone={tone}>{BUSINESS_STATUS_LABEL[s]}</Badge>
        </View>
        <Txt variant="meta" tone="muted">
          {text}
        </Txt>
        {showStatusNote(business) && <ErrorNote>{business.statusNote}</ErrorNote>}
      </View>
    </Card>
  );
}

function VenueRow({ venue }: { venue: OwnVenue }) {
  const c = useColors();
  const right = isFeatured(venue) ? (
    <FeaturedBadge />
  ) : !venue.active ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <EyeOff size={14} color={c.muted} />
      <Badge tone="muted">Oculto</Badge>
    </View>
  ) : venue.promotion?.status === 'requested' ? (
    <Badge>Pedida</Badge>
  ) : undefined;
  return (
    <ListRow
      icon={<VenuePhotoImg photo={venue.photos[0]} sport={venue.sport} style={{ width: 64, borderRadius: 12 }} />}
      title={venue.name}
      subtitle={venueLine(venue)}
      right={right}
      onPress={() => router.push({ pathname: '/espacio/[venueId]', params: { venueId: venue.id } })}
    />
  );
}

function Panel({ business }: { business: Business }) {
  const auth = useAuth();
  const c = useColors();
  const [editData, setEditData] = useState(false);
  const inBusinessMode = auth.profile?.accountMode === 'business';
  const canAdd = business.venues.length < VENUES_MAX && business.status !== 'suspended';
  const add = () => router.push({ pathname: '/espacio/[venueId]', params: { venueId: 'nuevo' } });

  async function switchMode(mode: 'player' | 'business') {
    try {
      await setAccountMode(mode);
      toast(mode === 'player' ? 'Ahora ves la app como jugador' : 'Ahora ves la app como empresa');
      if (mode === 'player') router.navigate('/');
    } catch (e) {
      toast(businessErrorText(e), 'error');
    }
  }

  async function removeBusiness() {
    const ok = await confirmAsync({
      title: `¿Borrar ${business.name}?`,
      message: 'Se borran la empresa, sus espacios y sus fotos. Tu cuenta de jugador sigue igual.',
      confirmText: 'Borrar la empresa',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteBusiness();
      toast('Empresa borrada');
      router.navigate('/');
    } catch (e) {
      toast(businessErrorText(e), 'error');
    }
  }

  return (
    <>
      <StatusCard business={business} />
      {!inBusinessMode && (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
          <Txt variant="meta" style={{ flex: 1 }}>
            Estás viendo la app como jugador.
          </Txt>
          <Button variant="soft" onPress={() => void switchMode('business')}>
            Modo empresa
          </Button>
        </Card>
      )}

      <SectionHeader
        title="Tus espacios"
        action={
          canAdd && business.venues.length > 0 ? (
            <Button variant="soft" icon={<Plus size={18} color={c.accent} />} onPress={add}>
              Agregar
            </Button>
          ) : undefined
        }
      />
      {business.venues.length ? (
        <Card padded={false}>
          {business.venues.map((v, i) => (
            <View key={v.id}>
              {i > 0 && <Divider inset={92} />}
              <VenueRow venue={v} />
            </View>
          ))}
        </Card>
      ) : (
        <>
          <Empty icon={<Building2 size={28} color={c.accent} />} title="Todavía no tienes espacios" text="Agrega tu cancha, tu bolera o tu piscina: el deporte, cuántas canchas tiene, el precio y las fotos." />
          {canAdd && (
            <Button variant="primary" size="xl" full icon={<Plus size={20} color={c.accentFg} />} onPress={add}>
              Agregar mi primer espacio
            </Button>
          )}
        </>
      )}

      <SectionHeader title="Tu empresa" />
      <Card padded={false}>
        <ListRow
          icon={
            <RowIcon>
              <PencilLine size={20} color={c.accent} />
            </RowIcon>
          }
          title="Datos de la empresa"
          subtitle={[business.city, business.phone].filter(Boolean).join(' · ')}
          onPress={() => setEditData(true)}
        />
        {inBusinessMode && (
          <>
            <Divider inset={68} />
            <ListRow
              icon={
                <RowIcon>
                  <UserRound size={20} color={c.accent} />
                </RowIcon>
              }
              title="Usar la app como jugador"
              subtitle="Tu empresa sigue aquí: vuelves cuando quieras"
              onPress={() => void switchMode('player')}
            />
          </>
        )}
        <Divider inset={68} />
        <ListRow
          icon={
            <RowIcon>
              <Trash2 size={20} color={c.danger} />
            </RowIcon>
          }
          title="Borrar mi empresa"
          chevron={false}
          onPress={() => void removeBusiness()}
        />
      </Card>

      {editData && <EditBusinessSheet business={business} onClose={() => setEditData(false)} />}
    </>
  );
}

function EditBusinessSheet({ business, onClose }: { business: Business; onClose: () => void }) {
  const [form, setForm] = useState<BusinessFormValue>(() => businessFormFrom(business));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = businessProblem(form);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateBusiness(businessInputFrom(form));
      onClose();
      toast(business.status === 'rejected' ? 'Guardado: la volvemos a revisar' : 'Guardado');
    } catch (e) {
      // Dentro de la hoja (el aviso de abajo quedaría detrás).
      setError(businessErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Datos de la empresa"
      footer={
        <Button variant="primary" size="xl" full loading={busy} disabled={!!problem} onPress={() => void save()}>
          Guardar
        </Button>
      }
    >
      <BusinessFields value={form} onChange={setForm} />
      {error && <ErrorNote>{error}</ErrorNote>}
    </Sheet>
  );
}
