/**
 * Las partes del editor de un espacio (movil/src/app/espacio/[venueId].tsx), como VenueSheet.tsx de la web: lo que pide
 * el deporte (src/lib/venues/fields.ts), las fotos (hasta 8; la primera es la portada), destacarlo (pedirlo o pagarlo
 * con Azul) y los torneos que se juegan ahí.
 */
import { useMemo, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { Camera, CreditCard, ImagePlus, Sparkles, Star, Trash2, Trophy } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { useLeaguesByIds, useMyMemberships } from '@mm/lib/data';
import {
  PROMOTION_DAYS,
  VENUE_PHOTOS_MAX,
  businessErrorText,
  cancelPromotion,
  deleteVenuePhoto,
  isFeatured,
  paymentErrorText,
  requestPromotion,
  setLeagueVenue,
  setVenueCover,
  startPromotionPayment,
  uploadVenuePhoto,
  usePromotionPrices,
  type Business,
  type OwnVenue,
  type VenuePhoto,
} from '@mm/lib/data/business';
import { formatDateLong, toIsoDate } from '@mm/lib/format';
import { digitsOnly, venueLeaguesText } from '@mm/pages/business/logic';
import type { VenueField } from '@mm/lib/venues/fields';
import { sportMeta } from '@mm/sports/registry';
import { TextArea } from './BusinessFields';
import { VenuePhotoImg } from '../venues/VenueBits';
import { confirmAsync, toast } from '../feedback';
import { Button, Card, ChoiceRow, Field, Input, Segmented, Txt } from '../ui';
import { openAzul } from '@/lib/azul';
import { pickPhotoAssets, showcasePhoto, type PhotoSource } from '@/lib/pickImage';
import { useColors } from '@/theme/theme';
import { font, radius } from '@/theme/tokens';

/** Sí / no con el interruptor del teléfono. */
export function Toggle({ on, onChange, title, text }: { on: boolean; onChange: (v: boolean) => void; title: string; text?: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={title}
      onPress={() => onChange(!on)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: c.surface2 }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyStrong">{title}</Txt>
        {!!text && (
          <Txt variant="meta" tone="muted">
            {text}
          </Txt>
        )}
      </View>
      <Switch value={on} onValueChange={onChange} trackColor={{ true: c.accent, false: c.line }} thumbColor="#ffffff" accessibilityElementsHidden importantForAccessibility="no" />
    </Pressable>
  );
}

/** Una opción entre pocas, como fichas (tocar la elegida otra vez la quita si no es obligatoria). */
function Chips({ field, value, onChange }: { field: VenueField; value: string; onChange: (v: string) => void }) {
  const c = useColors();
  return (
    <View style={{ gap: 8 }}>
      <Txt variant="bodyStrong" tone="fg2">
        {field.label}
      </Txt>
      <View accessibilityRole="radiogroup" accessibilityLabel={field.label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(field.options ?? []).map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(on && !field.required ? '' : o.value)}
              style={{ height: 44, borderRadius: 22, paddingHorizontal: 16, justifyContent: 'center', borderWidth: 1.5, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accentSoft : c.surface }}
            >
              <Txt variant="bodyStrong" tone={on ? 'accent' : 'fg'}>
                {o.label}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Lo que pide el deporte: números, opciones y sí/no. */
export function DetailsFields({ fields, value, onChange }: { fields: readonly VenueField[]; value: Record<string, string | boolean>; onChange: (v: Record<string, string | boolean>) => void }) {
  const set = (k: string, v: string | boolean) => onChange({ ...value, [k]: v });
  const counts = fields.filter((f) => f.kind === 'count');
  return (
    <View style={{ gap: 16 }}>
      {counts.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {counts.map((f) => (
            <View key={f.key} style={{ flexBasis: '45%', flexGrow: 1 }}>
              <Field label={f.required ? f.label : `${f.label} (opcional)`}>
                <Input accessibilityLabel={f.label} keyboardType="number-pad" value={String(value[f.key] ?? '')} maxLength={3} onChangeText={(t) => set(f.key, digitsOnly(t))} />
              </Field>
            </View>
          ))}
        </View>
      )}
      {fields
        .filter((f) => f.kind === 'choice')
        .map((f) => (
          <Chips key={f.key} field={f} value={String(value[f.key] ?? '')} onChange={(v) => set(f.key, v)} />
        ))}
      {fields
        .filter((f) => f.kind === 'yesno')
        .map((f) => (
          <Toggle key={f.key} on={value[f.key] === true} onChange={(v) => set(f.key, v)} title={f.label} />
        ))}
    </View>
  );
}

/** Las fotos (hasta 8): agregar varias a la vez o tomar una, poner de portada y quitar. */
export function Photos({ venue, onChange }: { venue: OwnVenue; onChange: (photos: VenuePhoto[]) => void }) {
  const c = useColors();
  const [busy, setBusy] = useState<string | null>(null);
  const left = VENUE_PHOTOS_MAX - venue.photos.length;

  async function add(source: PhotoSource) {
    let assets;
    try {
      assets = await pickPhotoAssets(source, left);
    } catch {
      return toast('No se pudo abrir la galería.', 'error');
    }
    let photos = venue.photos;
    for (let i = 0; i < assets.length; i++) {
      setBusy(assets.length > 1 ? `Subiendo ${i + 1} de ${assets.length}…` : 'Subiendo…');
      try {
        photos = await uploadVenuePhoto(venue.id, await showcasePhoto(assets[i]));
        onChange(photos);
      } catch (e) {
        toast(businessErrorText(e, 'No se pudo subir esa foto. Prueba con otra.'), 'error');
        break;
      }
    }
    setBusy(null);
  }

  const act = (p: Promise<VenuePhoto[]>) => p.then(onChange).catch((e: unknown) => toast(businessErrorText(e), 'error'));

  return (
    <View style={{ gap: 12 }}>
      <Txt variant="section" accessibilityRole="header">
        Fotos{' '}
        <Txt variant="section" tone="muted">
          {venue.photos.length}/{VENUE_PHOTOS_MAX}
        </Txt>
      </Txt>
      {venue.photos.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {venue.photos.map((p, i) => (
            <View key={p.id} style={{ flexBasis: '46%', flexGrow: 1, gap: 6 }}>
              <View>
                <VenuePhotoImg photo={p} sport={venue.sport} alt={`Foto ${i + 1} de ${venue.name}`} style={{ borderRadius: 16 }} />
                {i === 0 && (
                  <View style={{ position: 'absolute', top: 8, left: 8, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Txt style={{ color: '#fff', fontFamily: font.semibold, fontSize: 12 }}>Portada</Txt>
                  </View>
                )}
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {i > 0 && (
                  <Button icon={<Star size={16} color={c.fg} />} onPress={() => act(setVenueCover(venue.id, p.id))}>
                    Portada
                  </Button>
                )}
                <Button
                  variant="ghost"
                  accessibilityLabel={`Quitar la foto ${i + 1}`}
                  icon={<Trash2 size={18} color={c.danger} />}
                  onPress={async () => {
                    if (await confirmAsync({ title: '¿Quitar esta foto?', confirmText: 'Quitar', danger: true })) void act(deleteVenuePhoto(venue.id, p.id));
                  }}
                />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Txt variant="meta" tone="muted">
          Sin fotos todavía. Con fotos de la cancha, más gente te escribe.
        </Txt>
      )}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button full icon={<ImagePlus size={20} color={c.fg} />} loading={!!busy} disabled={left <= 0} onPress={() => void add('library')}>
            {busy ?? (left > 0 ? 'Agregar fotos' : 'Ya tienes las 8 fotos')}
          </Button>
        </View>
        <Button accessibilityLabel="Tomar una foto" icon={<Camera size={20} color={c.fg} />} disabled={left <= 0 || !!busy} onPress={() => void add('camera')} />
      </View>
    </View>
  );
}

const money = (n: number) => `RD$${n.toLocaleString('es-DO', { maximumFractionDigits: 2 })}`;

/**
 * Destacar el espacio (sale primero en «Dónde jugar»). Con precios puestos por el superadmin, se paga con Azul y se
 * activa sola (si ya está destacado, se suma al final; movil/src/lib/azul.ts). Sin precios: pedirlo, ver cómo va o
 * hasta cuándo sale.
 */
export function Promotion({ business, venue, onChange }: { business: Business; venue: OwnVenue; onChange: (v: OwnVenue) => void }) {
  const c = useColors();
  const prices = usePromotionPrices();
  const [days, setDays] = useState<string>(String(PROMOTION_DAYS[0]));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const p = venue.promotion;
  const featured = isFeatured(venue);

  let body;
  if (business.status === 'approved' && prices.data.length) {
    const chosen = prices.data.find((x) => String(x.days) === days) ?? prices.data[0];
    body = (
      <>
        {featured ? (
          <Txt variant="meta">
            Sale primero en «Dónde jugar» hasta el {formatDateLong(toIsoDate(new Date(venue.featuredUntil!)))}. Si pagas más días, se suman al final.
          </Txt>
        ) : (
          <Txt variant="meta" tone="muted">
            Sale primero cuando los jugadores buscan dónde jugar {sportMeta(venue.sport)?.lower ?? ''}.
          </Txt>
        )}
        <Segmented label="Por cuántos días" value={String(chosen.days)} onChange={setDays} options={prices.data.map((x) => ({ key: String(x.days), label: `${x.days} días` }))} />
        <Txt>
          <Txt variant="bodyStrong">{money(chosen.amount)}</Txt>{' '}
          <Txt variant="meta" tone="muted">
            ITBIS incluido
          </Txt>
        </Txt>
        <Button
          variant="primary"
          icon={<CreditCard size={20} color={c.accentFg} />}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              openAzul(await startPromotionPayment(venue.id, chosen.days));
            } catch (e) {
              toast(paymentErrorText(e), 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          Pagar con Azul
        </Button>
        <Txt variant="meta" tone="muted">
          Pagas con tarjeta en la página segura de Azul y se activa al volver.
        </Txt>
      </>
    );
  } else if (business.status !== 'approved') {
    body = (
      <Txt variant="meta" tone="muted">
        Cuando aprobemos tu empresa, puedes pedir que tus espacios salgan primero.
      </Txt>
    );
  } else if (featured) {
    body = <Txt variant="meta">Sale primero en «Dónde jugar» hasta el {formatDateLong(toIsoDate(new Date(venue.featuredUntil!)))}.</Txt>;
  } else if (p?.status === 'requested') {
    body = (
      <>
        <Txt variant="meta">Pediste destacarlo por {p.days} días. Te escribimos para el pago y lo activamos.</Txt>
        <Button
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await cancelPromotion(venue.id, p.id);
              onChange({ ...venue, promotion: { ...p, status: 'cancelled' } });
            } catch (e) {
              toast(businessErrorText(e), 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          Retirar lo que pedí
        </Button>
      </>
    );
  } else {
    body = (
      <>
        <Txt variant="meta" tone="muted">
          Sale primero cuando los jugadores buscan dónde jugar {sportMeta(venue.sport)?.lower ?? ''}.
        </Txt>
        <Segmented label="Por cuántos días" value={days} onChange={setDays} options={PROMOTION_DAYS.map((d) => ({ key: String(d), label: `${d} días` }))} />
        <TextArea label="Nota" lines={2} maxLength={300} placeholder="¿Algo que debamos saber? (opcional)" value={note} onChangeText={setNote} />
        <Button
          variant="soft"
          icon={<Sparkles size={20} color={c.accent} />}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              onChange(await requestPromotion(venue.id, Number(days), note.trim() || null));
              toast('Listo: te escribimos para el pago');
            } catch (e) {
              toast(businessErrorText(e), 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          Pedir destacarlo
        </Button>
      </>
    );
  }
  return (
    <Card style={{ gap: 12 }}>
      <Txt variant="section" accessibilityRole="header">
        Destacar
      </Txt>
      {body}
    </Card>
  );
}

/** Los torneos y ligas que se juegan aquí: enlazar uno de los que organizas. */
export function Leagues({ venue }: { venue: OwnVenue }) {
  const auth = useAuth();
  const c = useColors();
  const memberships = useMyMemberships(auth.user?.uid);
  const adminIds = useMemo(() => memberships.data.filter((m) => m.role === 'owner' || m.role === 'admin').map((m) => m.leagueId), [memberships.data]);
  const leagues = useLeaguesByIds(adminIds);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Card style={{ gap: 12 }}>
      <Txt variant="section" accessibilityRole="header">
        Torneos aquí
      </Txt>
      <Txt variant="meta" tone="muted">
        {venueLeaguesText(venue.leagues)}
      </Txt>
      {leagues.data.length > 0 ? (
        <>
          {leagues.data.map((l) => (
            <ChoiceRow key={l.id} title={l.name} selected={pick === l.id} onPress={() => setPick(pick === l.id ? '' : l.id)} />
          ))}
          <Button
            icon={<Trophy size={18} color={c.fg} />}
            disabled={!pick}
            loading={busy}
            onPress={async () => {
              setBusy(true);
              try {
                await setLeagueVenue(pick, venue.id);
                toast('Enlazado');
                setPick('');
              } catch (e) {
                toast(businessErrorText(e), 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            Enlazar
          </Button>
        </>
      ) : (
        <Button variant="soft" icon={<Trophy size={18} color={c.accent} />} onPress={() => router.push({ pathname: '/crear', params: { kind: 'torneo' } })}>
          Crear un torneo
        </Button>
      )}
    </Card>
  );
}
