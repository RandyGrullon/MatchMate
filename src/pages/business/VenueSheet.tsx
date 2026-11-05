import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ExternalLink, ImagePlus, Sparkles, Star, Trash2, Trophy } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useLeaguesByIds, useMyMemberships } from '../../lib/data';
import {
  PROMOTION_DAYS,
  VENUE_HOURS_MAX,
  VENUE_PHOTOS_MAX,
  businessErrorText,
  cancelPromotion,
  deleteVenue,
  deleteVenuePhoto,
  isFeatured,
  requestPromotion,
  saveVenue,
  setLeagueVenue,
  setVenueCover,
  uploadVenuePhoto,
  type Business,
  type OwnVenue,
  type VenuePhoto,
} from '../../lib/data/business';
import { formatDateLong, toIsoDate } from '../../lib/format';
import { venueFields, type VenueField } from '../../lib/venues/fields';
import { sportMeta } from '../../sports/registry';
import { useSportStatus } from '../../sports/status';
import { useFeedback } from '../../components/feedback';
import { VenuePhotoImg } from '../../components/venues/VenueBits';
import { Button, Field, Input, Segmented, Select, Sheet, Textarea, cx } from '../../components/ui';
import { SportPicker } from '../sports/SportPicker';
import { digitsOnly, venueDraftFrom, venueInputFrom, venueLeaguesText, type VenueDraft } from './logic';

/**
 * Un espacio de la empresa (nuevo o para cambiarlo): el deporte, lo que pide ese deporte (src/lib/venues/fields.ts),
 * dónde, precio, horario y si sale en «Dónde jugar». Ya guardado: sus fotos (hasta 8; la primera es la portada), pedir
 * destacarlo, enlazar un torneo que se juega ahí y borrarlo.
 */
export function VenueSheet({ open, onClose, business, venue }: { open: boolean; onClose: () => void; business: Business; venue: OwnVenue | null }) {
  return (
    <Sheet open={open} onClose={onClose} title={venue ? venue.name : 'Agregar espacio'} subtitle={venue ? sportMeta(venue.sport)?.label : 'Una cancha, una bolera, una piscina…'}>
      {open && <VenueEditor key={venue?.id ?? 'nuevo'} business={business} venue={venue} onClose={onClose} />}
    </Sheet>
  );
}

function VenueEditor({ business, venue: initial, onClose }: { business: Business; venue: OwnVenue | null; onClose: () => void }) {
  const auth = useAuth();
  const { toast, confirm } = useFeedback();
  const sports = useSportStatus(auth.isSuper);
  // El espacio como quedó guardado (después de guardar uno nuevo, sigue aquí para sus fotos).
  const [venue, setVenue] = useState<OwnVenue | null>(initial);
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
      setVenue(saved);
    } catch (e) {
      setError(businessErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!venue) return;
    const ok = await confirm({ title: `¿Borrar ${venue.name}?`, message: 'Se borra con sus fotos. Los torneos que se juegan ahí se quedan, sin espacio.', confirmText: 'Borrar', danger: true });
    if (!ok) return;
    try {
      await deleteVenue(venue.id);
      toast('Espacio borrado');
      onClose();
    } catch (e) {
      toast(businessErrorText(e), 'error');
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-2">
      {!venue && <SportPicker groups={sports.choices} status={sports.status} value={draft.sport} onChange={(s) => setDraft((d) => ({ ...d, sport: s, details: {} }))} />}
      <Field label="Nombre">
        <Input value={draft.name} maxLength={80} placeholder={`${sportMeta(draft.sport)?.venue ?? 'Cancha'} Los Prados`} onChange={(e) => set('name', e.target.value)} />
      </Field>
      <DetailsFields fields={fields} value={draft.details} onChange={(details) => set('details', details)} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ciudad">
          <Input value={draft.city} maxLength={60} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="Precio por hora (RD$)">
          <Input inputMode="numeric" value={draft.priceHour} maxLength={7} placeholder="Opcional" onChange={(e) => set('priceHour', digitsOnly(e.target.value))} />
        </Field>
      </div>
      <Field label="Dirección">
        <Input value={draft.address} maxLength={160} onChange={(e) => set('address', e.target.value)} />
      </Field>
      <Field label="Horario (opcional)">
        <Input value={draft.hours} maxLength={VENUE_HOURS_MAX} placeholder="Lunes a domingo, 7:00 am a 11:00 pm" onChange={(e) => set('hours', e.target.value)} />
      </Field>
      <Field label="Teléfono de este espacio (opcional)" hint="Si lo dejas vacío, sale el de la empresa.">
        <Input type="tel" inputMode="tel" value={draft.phone} maxLength={20} onChange={(e) => set('phone', e.target.value)} />
      </Field>
      <Toggle on={draft.active} onChange={(v) => set('active', v)} title="Sale en «Dónde jugar»" text={draft.active ? 'Los jugadores lo encuentran.' : 'Oculto: solo lo ves tú.'} />
      {error && <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
      <Button variant="primary" size="xl" className="w-full" loading={busy} onClick={() => void save()}>
        {venue ? 'Guardar cambios' : 'Guardar espacio'}
      </Button>

      {venue && (
        <>
          <Photos venue={venue} onChange={(photos) => setVenue({ ...venue, photos })} />
          <Promotion business={business} venue={venue} onChange={setVenue} />
          <Leagues venue={venue} />
          <div className="flex flex-col gap-2">
            {business.status === 'approved' && venue.active && (
              <Link to={`/canchas/${venue.id}`} className="inline-flex min-h-11 items-center gap-2 text-meta font-semibold text-accent">
                <ExternalLink className="size-4" aria-hidden="true" />
                Ver cómo la ven los jugadores
              </Link>
            )}
            <Button variant="ghost" className="justify-start text-danger" icon={<Trash2 className="size-4" />} onClick={() => void remove()}>
              Borrar este espacio
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Lo que pide el deporte: números, opciones y sí/no. */
function DetailsFields({ fields, value, onChange }: { fields: readonly VenueField[]; value: Record<string, string | boolean>; onChange: (v: Record<string, string | boolean>) => void }) {
  const set = (k: string, v: string | boolean) => onChange({ ...value, [k]: v });
  const counts = fields.filter((f) => f.kind === 'count');
  const choices = fields.filter((f) => f.kind === 'choice');
  const flags = fields.filter((f) => f.kind === 'yesno');
  return (
    <div className="flex flex-col gap-4">
      {counts.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {counts.map((f) => (
            <Field key={f.key} label={f.required ? f.label : `${f.label} (opcional)`}>
              <Input inputMode="numeric" value={String(value[f.key] ?? '')} maxLength={3} onChange={(e) => set(f.key, digitsOnly(e.target.value))} />
            </Field>
          ))}
        </div>
      )}
      {choices.map((f) =>
        (f.options?.length ?? 0) <= 3 ? (
          // Sin <label> (Field): envolvería al primer botón y le cambiaría el nombre; el grupo lleva su aria-label.
          <div key={f.key} className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted" aria-hidden="true">
              {f.label}
            </span>
            <Segmented label={f.label} full value={String(value[f.key] ?? '')} onChange={(v) => set(f.key, v)} options={(f.options ?? []).map((o) => ({ key: o.value, label: o.label }))} />
          </div>
        ) : (
          <Field key={f.key} label={f.label}>
            <Select value={String(value[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)}>
              <option value="">{f.required ? 'Elige' : 'Sin decir'}</option>
              {(f.options ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        ),
      )}
      {flags.map((f) => (
        <Toggle key={f.key} on={value[f.key] === true} onChange={(v) => set(f.key, v)} title={f.label} />
      ))}
    </div>
  );
}

function Toggle({ on, onChange, title, text }: { on: boolean; onChange: (v: boolean) => void; title: string; text?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-surface-2 px-4 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{title}</span>
        {text && <span className="block text-[13px] text-muted">{text}</span>}
      </span>
      <span aria-hidden="true" className={cx('flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors', on ? 'bg-accent' : 'bg-surface ring-1 ring-line ring-inset')}>
        <span className={cx('size-5 rounded-full bg-white shadow-sm transition-transform', on && 'translate-x-5')} />
      </span>
    </button>
  );
}

/** Las fotos (hasta 8): agregar varias a la vez, poner de portada y quitar. */
function Photos({ venue, onChange }: { venue: OwnVenue; onChange: (photos: VenuePhoto[]) => void }) {
  const { toast, confirm } = useFeedback();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const left = VENUE_PHOTOS_MAX - venue.photos.length;

  async function add(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files].slice(0, left);
    let photos = venue.photos;
    for (let i = 0; i < list.length; i++) {
      setBusy(list.length > 1 ? `Subiendo ${i + 1} de ${list.length}…` : 'Subiendo…');
      try {
        photos = await uploadVenuePhoto(venue.id, list[i]);
        onChange(photos);
      } catch (e) {
        toast(businessErrorText(e, 'No se pudo subir esa foto. Prueba con otra.'), 'error');
        break;
      }
    }
    if (files.length > left) toast(`Solo caben ${VENUE_PHOTOS_MAX} fotos por espacio.`, 'error');
    setBusy(null);
    if (input.current) input.current.value = '';
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby={`fotos-${venue.id}`}>
      <h3 id={`fotos-${venue.id}`} className="text-section">
        Fotos <span className="text-muted">{venue.photos.length}/{VENUE_PHOTOS_MAX}</span>
      </h3>
      {venue.photos.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2.5">
          {venue.photos.map((p, i) => (
            <li key={p.id} className="flex flex-col gap-1.5">
              <div className="relative overflow-hidden rounded-2xl">
                <VenuePhotoImg photo={p} sport={venue.sport} alt={`Foto ${i + 1} de ${venue.name}`} />
                {i === 0 && <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">Portada</span>}
              </div>
              <div className="flex gap-1">
                {i > 0 && (
                  <Button size="sm" variant="quiet" icon={<Star className="size-4" />} onClick={() => setVenueCover(venue.id, p.id).then(onChange).catch((e) => toast(businessErrorText(e), 'error'))}>
                    Portada
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Quitar la foto ${i + 1}`}
                  icon={<Trash2 className="size-4" />}
                  onClick={async () => {
                    if (!(await confirm({ title: '¿Quitar esta foto?', confirmText: 'Quitar', danger: true }))) return;
                    deleteVenuePhoto(venue.id, p.id).then(onChange).catch((e) => toast(businessErrorText(e), 'error'));
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-meta text-muted">Sin fotos todavía. Con fotos de la cancha, más gente te escribe.</p>
      )}
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => void add(e.target.files)} />
      <Button className="w-full" icon={<ImagePlus className="size-5" />} loading={!!busy} disabled={left <= 0} onClick={() => input.current?.click()}>
        {busy ?? (left > 0 ? 'Agregar fotos' : 'Ya tienes las 8 fotos')}
      </Button>
    </section>
  );
}

/** Destacar el espacio (sale primero en «Dónde jugar»): pedirlo, ver cómo va o hasta cuándo sale. */
function Promotion({ business, venue, onChange }: { business: Business; venue: OwnVenue; onChange: (v: OwnVenue) => void }) {
  const { toast } = useFeedback();
  const [days, setDays] = useState<string>(String(PROMOTION_DAYS[0]));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const p = venue.promotion;
  const featured = isFeatured(venue);

  let body;
  if (business.status !== 'approved') {
    body = <p className="text-meta text-muted">Cuando aprobemos tu empresa, puedes pedir que tus espacios salgan primero.</p>;
  } else if (featured) {
    body = <p className="text-meta">Sale primero en «Dónde jugar» hasta el {formatDateLong(toIsoDate(new Date(venue.featuredUntil!)))}.</p>;
  } else if (p?.status === 'requested') {
    body = (
      <>
        <p className="text-meta">Pediste destacarlo por {p.days} días. Te escribimos para el pago y lo activamos.</p>
        <Button
          variant="quiet"
          loading={busy}
          onClick={async () => {
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
        <p className="text-meta text-muted">Sale primero cuando los jugadores buscan dónde jugar {sportMeta(venue.sport)?.lower ?? ''}.</p>
        <Segmented label="Por cuántos días" full value={days} onChange={setDays} options={PROMOTION_DAYS.map((d) => ({ key: String(d), label: `${d} días` }))} />
        <Textarea rows={2} maxLength={300} placeholder="¿Algo que debamos saber? (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button
          variant="soft"
          icon={<Sparkles className="size-5" />}
          loading={busy}
          onClick={async () => {
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
    <section className="flex flex-col gap-3" aria-label="Destacar este espacio">
      <h3 className="text-section">Destacar</h3>
      {body}
    </section>
  );
}

/** Los torneos y ligas que se juegan aquí: enlazar uno de los que organizas. */
function Leagues({ venue }: { venue: OwnVenue }) {
  const auth = useAuth();
  const { toast } = useFeedback();
  const memberships = useMyMemberships(auth.user?.uid);
  const adminIds = useMemo(() => memberships.data.filter((m) => m.role === 'owner' || m.role === 'admin').map((m) => m.leagueId), [memberships.data]);
  const leagues = useLeaguesByIds(adminIds);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <section className="flex flex-col gap-3" aria-label="Torneos en este espacio">
      <h3 className="text-section">Torneos aquí</h3>
      <p className="text-meta text-muted">
        {venueLeaguesText(venue.leagues)}
      </p>
      {leagues.data.length > 0 ? (
        <div className="flex gap-2">
          <Select className="min-w-0 flex-1" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Torneo o liga">
            <option value="">Elige un torneo o liga</option>
            {leagues.data.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <Button
            icon={<Trophy className="size-4" />}
            disabled={!pick}
            loading={busy}
            onClick={async () => {
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
        </div>
      ) : (
        <Link to="/organizar" className="inline-flex min-h-11 items-center gap-2 text-meta font-semibold text-accent">
          <Trophy className="size-4" aria-hidden="true" />
          Crear un torneo
        </Link>
      )}
    </section>
  );
}

