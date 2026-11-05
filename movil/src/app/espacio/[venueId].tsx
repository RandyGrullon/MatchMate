import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { ExternalLink, Trash2 } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { VENUE_HOURS_MAX, businessErrorText, deleteVenue, saveVenue, useMyBusiness, type Business, type OwnVenue } from '@mm/lib/data/business';
import { digitsOnly, venueDraftFrom, venueInputFrom, type VenueDraft } from '@mm/pages/business/logic';
import { venueFields } from '@mm/lib/venues/fields';
import { sportMeta } from '@mm/sports/registry';
import { useSportStatus } from '@mm/sports/status';
import { DetailsFields, Leagues, Photos, Promotion, Toggle } from '@/components/business/VenueParts';
import { confirmAsync, toast } from '@/components/feedback';
import { BackBar, Button, Empty, ErrorNote, Field, Input, Loading, Screen, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';

/**
 * Un espacio de la empresa (`/espacio/nuevo` o `/espacio/<id>`, como VenueSheet de la web): el deporte, lo que pide ese
 * deporte (src/lib/venues/fields.ts), dónde, precio, horario y si sale en «Dónde jugar». Ya guardado: sus fotos,
 * pedir destacarlo, enlazar un torneo que se juega ahí y borrarlo. Se llega desde Mi empresa.
 */
export default function VenueEditorScreen() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>();
  const auth = useAuth();
  const business = useMyBusiness();
  if (auth.loading || (business.loading && !business.data)) return <Loading />;
  if (!auth.user || (!business.data && !business.error)) return <Redirect href="/empresa" />;
  if (!business.data) {
    return (
      <Screen>
        <BackBar label="Mi empresa" fallback="/empresa" />
        <Empty title="No se pudo cargar tu empresa" text="Revisa tu conexión y vuelve a intentar." />
      </Screen>
    );
  }
  const initial = venueId === 'nuevo' ? null : (business.data.venues.find((v) => v.id === venueId) ?? null);
  if (venueId !== 'nuevo' && !initial) {
    return (
      <Screen>
        <BackBar label="Mi empresa" fallback="/empresa" />
        <Empty title="Este espacio ya no existe" text="Puede que lo hayas borrado desde otro lado." />
      </Screen>
    );
  }
  return <VenueEditor key={venueId} business={business.data} initial={initial} />;
}

function VenueEditor({ business, initial }: { business: Business; initial: OwnVenue | null }) {
  const c = useColors();
  const auth = useAuth();
  const sports = useSportStatus(auth.isSuper);
  // El espacio como quedó guardado aquí (después de guardar uno nuevo, sigue aquí para sus fotos). Cuando llega la
  // empresa leída otra vez, manda esa (es la de la base).
  const [edit, setEdit] = useState<{ from: OwnVenue | null; venue: OwnVenue | null }>({ from: initial, venue: initial });
  const id = edit.venue?.id ?? initial?.id ?? null;
  const live = id ? (business.venues.find((v) => v.id === id) ?? null) : null;
  const venue = live && live !== edit.from ? live : edit.venue;
  const update = (v: OwnVenue) => setEdit({ from: live, venue: v });

  const [draft, setDraft] = useState<VenueDraft>(() => venueDraftFrom(initial, business));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fields = venueFields(draft.sport);
  const set = <K extends keyof VenueDraft>(k: K, v: VenueDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    setError(null);
    const built = venueInputFrom(draft, venue?.id ?? null);
    if (!built.ok) return setError(built.message);
    setBusy(true);
    try {
      const saved = await saveVenue(built.input);
      toast(venue ? 'Guardado' : 'Listo: agrega sus fotos abajo');
      update(saved);
    } catch (e) {
      setError(businessErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!venue) return;
    const ok = await confirmAsync({ title: `¿Borrar ${venue.name}?`, message: 'Se borra con sus fotos. Los torneos que se juegan ahí se quedan, sin espacio.', confirmText: 'Borrar', danger: true });
    if (!ok) return;
    try {
      await deleteVenue(venue.id);
      toast('Espacio borrado');
      if (router.canGoBack()) router.back();
      else router.replace('/empresa');
    } catch (e) {
      toast(businessErrorText(e), 'error');
    }
  }

  return (
    <Screen>
      <BackBar label="Mi empresa" fallback="/empresa" />
      <View style={{ gap: 2 }}>
        <Txt variant="title" numberOfLines={2}>
          {venue ? venue.name : 'Agregar espacio'}
        </Txt>
        <Txt variant="meta" tone="muted">
          {venue ? sportMeta(venue.sport)?.label : 'Una cancha, una bolera, una piscina…'}
        </Txt>
      </View>

      {!venue && (
        <View style={{ gap: 8 }}>
          <Txt variant="bodyStrong" tone="fg2">
            Deporte
          </Txt>
          <View accessibilityRole="radiogroup" accessibilityLabel="Deporte" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {sports.creatable.map((s) => {
              const m = sportMeta(s);
              const Icon = m?.icon;
              const on = s === draft.sport;
              return (
                <Pressable
                  key={s}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => setDraft((d) => ({ ...d, sport: s, details: {} }))}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderRadius: 22, paddingHorizontal: 14, borderWidth: 1.5, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accentSoft : c.surface }}
                >
                  {Icon && <Icon size={18} color={on ? c.accent : (m?.color ?? c.fg)} />}
                  <Txt variant="bodyStrong" tone={on ? 'accent' : 'fg'}>
                    {m?.label ?? s}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <Field label="Nombre">
        <Input accessibilityLabel="Nombre del espacio" value={draft.name} maxLength={80} placeholder={`${sportMeta(draft.sport)?.venue ?? 'Cancha'} Los Prados`} onChangeText={(v) => set('name', v)} />
      </Field>
      <DetailsFields fields={fields} value={draft.details} onChange={(details) => set('details', details)} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label="Ciudad">
            <Input accessibilityLabel="Ciudad" value={draft.city} maxLength={60} onChangeText={(v) => set('city', v)} />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Precio por hora (RD$)">
            <Input accessibilityLabel="Precio por hora" keyboardType="number-pad" value={draft.priceHour} maxLength={7} placeholder="Opcional" onChangeText={(v) => set('priceHour', digitsOnly(v))} />
          </Field>
        </View>
      </View>
      <Field label="Dirección">
        <Input accessibilityLabel="Dirección" value={draft.address} maxLength={160} onChangeText={(v) => set('address', v)} />
      </Field>
      <Field label="Horario (opcional)">
        <Input accessibilityLabel="Horario" value={draft.hours} maxLength={VENUE_HOURS_MAX} placeholder="Lunes a domingo, 7:00 am a 11:00 pm" onChangeText={(v) => set('hours', v)} />
      </Field>
      <Field label="Teléfono de este espacio (opcional)" hint="Si lo dejas vacío, sale el de la empresa.">
        <Input accessibilityLabel="Teléfono de este espacio" keyboardType="phone-pad" value={draft.phone} maxLength={20} onChangeText={(v) => set('phone', v)} />
      </Field>
      <Toggle on={draft.active} onChange={(v) => set('active', v)} title="Sale en «Dónde jugar»" text={draft.active ? 'Los jugadores lo encuentran.' : 'Oculto: solo lo ves tú.'} />
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button variant="primary" size="xl" full loading={busy} onPress={() => void save()}>
        {venue ? 'Guardar cambios' : 'Guardar espacio'}
      </Button>

      {venue && (
        <>
          <Photos venue={venue} onChange={(photos) => update({ ...venue, photos })} />
          <Promotion business={business} venue={venue} onChange={update} />
          <Leagues venue={venue} />
          {business.status === 'approved' && venue.active && (
            <Button variant="ghost" icon={<ExternalLink size={18} color={c.accent} />} onPress={() => router.push({ pathname: '/canchas/[venueId]', params: { venueId: venue.id } })} style={{ alignSelf: 'flex-start' }}>
              Ver cómo la ven los jugadores
            </Button>
          )}
          <Button variant="ghost" icon={<Trash2 size={18} color={c.danger} />} onPress={() => void remove()} style={{ alignSelf: 'flex-start' }}>
            Borrar este espacio
          </Button>
        </>
      )}
    </Screen>
  );
}
