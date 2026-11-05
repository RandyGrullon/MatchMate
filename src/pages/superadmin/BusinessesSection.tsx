import { useState } from 'react';
import { Link } from 'react-router';
import { Building2, CircleCheck, ExternalLink, Percent, Sparkles, XCircle } from 'lucide-react';
import {
  ADMIN_BUSINESS_PAGE,
  BUSINESS_STATUS_LABEL,
  PROMOTION_DAYS,
  PROMOTION_STATUS_LABEL,
  adminDecidePromotion,
  adminEndPromotion,
  adminGrantPromotion,
  adminSetBusinessStatus,
  adminSetCommission,
  businessErrorText,
  isFeatured,
  useAdminBusiness,
  useAdminBusinesses,
  type AdminBusinessRow,
  type AdminPromotion,
  type BusinessStatus,
} from '../../lib/data/business';
import { formatDateLong, toIsoDate } from '../../lib/format';
import { sportMeta } from '../../sports/registry';
import { useFeedback } from '../../components/feedback';
import { venueLine } from '../../components/venues/VenueBits';
import { Badge, Button, Input, ListRow } from '../../components/ui';
import { Drawer, EmptyCard, ErrorRetry, Fact, FactGrid, FilterChips, Pager, SearchBox, SectionHeader, TableSkeleton, TextArea } from './bits';

type Filter = BusinessStatus | 'todas';

const STATUS_TONE: Record<BusinessStatus, 'warn' | 'ok' | 'danger' | 'neutral'> = { pending: 'warn', approved: 'ok', rejected: 'danger', suspended: 'neutral' };

const money = (n: number | null | undefined) => `RD$${(n ?? 0).toLocaleString('es-DO', { maximumFractionDigits: 2 })}`;
const day = (iso: string | null | undefined) => (iso ? formatDateLong(toIsoDate(new Date(iso))) : '—');

/**
 * Empresas (consola): las que tienen canchas o espacios en MatchMate (docs/empresas.md). Las pendientes primero; abrir
 * una para aprobarla, rechazarla o suspenderla (con el motivo), su comisión, sus espacios, las promociones (decidir las
 * pedidas con lo que pagó, dar una o terminarla) y los torneos que se juegan en sus espacios.
 */
export default function BusinessesSection() {
  const [filter, setFilter] = useState<Filter>('pending');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const list = useAdminBusinesses(filter === 'todas' ? null : filter, query, page);
  const c = list.data.counts;

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title="Empresas"
        hint={c.requests ? `${c.requests} ${c.requests === 1 ? 'promoción pedida espera' : 'promociones pedidas esperan'} respuesta` : 'Canchas y espacios deportivos'}
        below={
          <div className="flex flex-col gap-3">
            <FilterChips<Filter>
              label="Estado"
              value={filter}
              onChange={(f) => {
                setFilter(f);
                setPage(0);
              }}
              items={[
                { key: 'pending', label: 'En revisión', count: c.pending },
                { key: 'approved', label: 'Aprobadas', count: c.approved },
                { key: 'rejected', label: 'Rechazadas', count: c.rejected },
                { key: 'suspended', label: 'Suspendidas', count: c.suspended },
                { key: 'todas', label: 'Todas' },
              ]}
            />
            <SearchBox
              label="Buscar empresas"
              placeholder="Nombre, ciudad o dueño"
              value={query}
              onChange={(v) => {
                setQuery(v);
                setPage(0);
              }}
            />
          </div>
        }
      />
      {list.loading && !list.data.rows.length ? (
        <TableSkeleton rows={4} cols={3} />
      ) : list.error && !list.data.rows.length ? (
        <ErrorRetry error={list.error} />
      ) : list.data.rows.length ? (
        <div className="card-shadow overflow-hidden rounded-3xl bg-surface">
          {list.data.rows.map((b) => (
            <BusinessRow key={b.id} b={b} onOpen={() => setOpen(b.id)} />
          ))}
        </div>
      ) : (
        <EmptyCard icon={<Building2 />} title={filter === 'pending' ? 'Ninguna espera revisión' : 'No hay empresas aquí'}>
          {query ? 'Prueba con otra búsqueda.' : 'Cuando alguien registre su empresa, sale aquí.'}
        </EmptyCard>
      )}
      {list.data.total > ADMIN_BUSINESS_PAGE && <Pager page={page} pageSize={ADMIN_BUSINESS_PAGE} total={list.data.total} onPage={setPage} noun="empresas" />}
      <BusinessDrawer id={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function BusinessRow({ b, onOpen }: { b: AdminBusinessRow; onOpen: () => void }) {
  return (
    <ListRow
      onClick={onOpen}
      leading={<Building2 className="size-5 text-muted" aria-hidden="true" />}
      title={b.name}
      subtitle={[b.city, b.owner.name ?? b.owner.email, `${b.venues} ${b.venues === 1 ? 'espacio' : 'espacios'}`].filter(Boolean).join(' · ')}
      trailing={
        <span className="flex items-center gap-1.5">
          {b.requests > 0 && <Badge tone="accent">{b.requests} pedida{b.requests === 1 ? '' : 's'}</Badge>}
          <Badge tone={STATUS_TONE[b.status]}>{BUSINESS_STATUS_LABEL[b.status]}</Badge>
        </span>
      }
      chevron
    />
  );
}

function BusinessDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const detail = useAdminBusiness(id);
  const b = detail.data;
  return (
    <Drawer open={!!id} onClose={onClose} title={b?.name ?? 'Empresa'} label="Detalle de la empresa">
      {!b ? (
        detail.error ? <ErrorRetry error={detail.error} compact /> : <TableSkeleton rows={3} cols={2} />
      ) : (
        <div className="flex flex-col gap-6">
          <FactGrid>
            <Fact label="Estado">
              <Badge tone={STATUS_TONE[b.status]}>{BUSINESS_STATUS_LABEL[b.status]}</Badge>
            </Fact>
            <Fact label="Dueño">
              {b.owner.name ?? '—'} {b.owner.blocked && <Badge tone="danger">Bloqueada</Badge>}
              <span className="block text-muted">{b.owner.email}</span>
            </Fact>
            <Fact label="Ciudad">{b.city}</Fact>
            <Fact label="Teléfono">{b.phone ?? '—'}</Fact>
            <Fact label="Correo">{b.email ?? '—'}</Fact>
            <Fact label="RNC o cédula">{b.taxId ?? '—'}</Fact>
            <Fact label="Registrada">{day(b.createdAt)}</Fact>
            <Fact label="Pagado en promociones">{money(b.paid)}</Fact>
          </FactGrid>
          {b.description && <p className="text-meta whitespace-pre-line text-fg-2">{b.description}</p>}
          {b.statusNote && <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{b.statusNote}</p>}
          <StatusActions id={b.id} status={b.status} />
          <Commission id={b.id} pct={b.commissionPct} />

          <section className="flex flex-col gap-2">
            <h3 className="text-section">Espacios ({b.venues.length})</h3>
            {b.venues.length ? (
              <div className="overflow-hidden rounded-2xl bg-surface-2">
                {b.venues.map((v) => (
                  <ListRow
                    key={v.id}
                    title={v.name}
                    subtitle={[isFeatured(v) ? 'Destacada' : null, v.active ? null : 'Oculto', venueLine(v), v.city, `${v.photos.length} fotos`].filter(Boolean).join(' · ')}
                    trailing={<GrantPromotion venueId={v.id} />}
                  />
                ))}
              </div>
            ) : (
              <p className="text-meta text-muted">Todavía no tiene espacios.</p>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-section">Promociones</h3>
            {b.promotions.length ? b.promotions.map((p) => <PromotionItem key={p.id} p={p} />) : <p className="text-meta text-muted">Ninguna todavía.</p>}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-section">Torneos y ligas en sus espacios ({b.leagues.length})</h3>
            {b.leagues.length ? (
              <div className="overflow-hidden rounded-2xl bg-surface-2">
                {b.leagues.map((l) => (
                  <ListRow key={l.id} title={l.name} subtitle={[l.kind === 'torneo' ? 'Torneo' : 'Liga', sportMeta(l.sport)?.short, day(l.createdAt)].filter(Boolean).join(' · ')} to={`/l/${l.id}`} chevron />
                ))}
              </div>
            ) : (
              <p className="text-meta text-muted">Ninguno todavía. Comisión de la app: {b.commissionPct} %.</p>
            )}
          </section>
          {b.status === 'approved' && b.venues.some((v) => v.active) && (
            <Link to={`/canchas/${b.venues.find((v) => v.active)!.id}`} className="inline-flex min-h-11 items-center gap-2 text-meta font-semibold text-accent">
              <ExternalLink className="size-4" aria-hidden="true" />
              Ver cómo la ven los jugadores
            </Link>
          )}
        </div>
      )}
    </Drawer>
  );
}

function StatusActions({ id, status }: { id: string; status: BusinessStatus }) {
  const { toast } = useFeedback();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<BusinessStatus | null>(null);
  const run = async (next: BusinessStatus) => {
    if ((next === 'rejected' || next === 'suspended') && !note.trim()) return toast('Escribe el motivo (lo ve la empresa).', 'error');
    setBusy(next);
    try {
      await adminSetBusinessStatus(id, next, note.trim() || null);
      toast(`Listo: ${BUSINESS_STATUS_LABEL[next].toLowerCase()}`);
      setNote('');
    } catch (e) {
      toast(businessErrorText(e), 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-section">Revisión</h3>
      <TextArea rows={2} maxLength={300} placeholder="Motivo (para rechazar o suspender)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        {status !== 'approved' && (
          <Button variant="primary" icon={<CircleCheck className="size-4" />} loading={busy === 'approved'} onClick={() => void run('approved')}>
            Aprobar
          </Button>
        )}
        {status === 'pending' && (
          <Button variant="quiet" icon={<XCircle className="size-4" />} loading={busy === 'rejected'} onClick={() => void run('rejected')}>
            Rechazar
          </Button>
        )}
        {status === 'approved' && (
          <Button variant="danger" loading={busy === 'suspended'} onClick={() => void run('suspended')}>
            Suspender
          </Button>
        )}
      </div>
    </section>
  );
}

function Commission({ id, pct }: { id: string; pct: number }) {
  const { toast } = useFeedback();
  const [value, setValue] = useState(String(pct));
  const [busy, setBusy] = useState(false);
  const n = Number(value.replace(',', '.'));
  const ok = Number.isFinite(n) && n >= 0 && n <= 50 && n !== pct;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-section">Comisión de la app</h3>
      <p className="text-meta text-muted">Lo que se queda MatchMate de lo que esta empresa cobre por la app (torneos, reservas). Por ahora solo se anota.</p>
      <div className="flex items-center gap-2">
        <Input className="w-28" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Comisión en porcentaje" />
        <Percent className="size-4 text-muted" aria-hidden="true" />
        <Button
          disabled={!ok}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await adminSetCommission(id, n);
              toast('Comisión guardada');
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
    </section>
  );
}

function PromotionItem({ p }: { p: AdminPromotion }) {
  const { toast } = useFeedback();
  const [amount, setAmount] = useState('');
  const [days, setDays] = useState(String(p.days));
  const [busy, setBusy] = useState(false);
  const live = p.status === 'active' && !!p.endsAt && Date.parse(p.endsAt) > Date.now();
  const act = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast(done);
    } catch (e) {
      toast(businessErrorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-3.5">
      <p className="flex flex-wrap items-center gap-2 text-meta font-semibold">
        {p.venueName} <Badge tone={p.status === 'requested' ? 'accent' : live ? 'warn' : 'neutral'}>{live ? 'Activa' : PROMOTION_STATUS_LABEL[p.status]}</Badge>
      </p>
      <p className="text-[13px] text-muted">
        {p.days} días · pedida el {day(p.createdAt)}
        {p.status === 'active' ? ` · del ${day(p.startsAt)} al ${day(p.endsAt)} · ${money(p.amount)}` : ''}
      </p>
      {p.note && <p className="text-[13px] text-fg-2">«{p.note}»</p>}
      {p.status === 'requested' && (
        <div className="flex flex-wrap items-center gap-2">
          <Input className="w-32" inputMode="decimal" placeholder="Pagó (RD$)" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Lo que pagó" />
          <Input className="w-20" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} aria-label="Días" />
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            disabled={!amount.trim() || !Number(days)}
            onClick={() => void act(() => adminDecidePromotion(p.id, true, { amount: Number(amount.replace(',', '.')), days: Number(days) }), 'Promoción activada')}
          >
            Activar
          </Button>
          <Button variant="quiet" size="sm" loading={busy} onClick={() => void act(() => adminDecidePromotion(p.id, false), 'Promoción rechazada')}>
            Rechazar
          </Button>
        </div>
      )}
      {live && (
        <Button variant="quiet" size="sm" className="self-start" loading={busy} onClick={() => void act(() => adminEndPromotion(p.id), 'Promoción terminada')}>
          Terminar ya
        </Button>
      )}
    </div>
  );
}

/** Destacar un espacio sin que lo pida (por ejemplo, de cortesía o cobrado aparte). */
function GrantPromotion({ venueId }: { venueId: string }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="soft"
      icon={<Sparkles className="size-4" />}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await adminGrantPromotion(venueId, PROMOTION_DAYS[0], 0, 'Dada desde la consola');
          toast(`Destacada por ${PROMOTION_DAYS[0]} días`);
        } catch (e) {
          toast(businessErrorText(e), 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      Destacar
    </Button>
  );
}
