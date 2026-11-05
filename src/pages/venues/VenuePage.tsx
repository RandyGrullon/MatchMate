import { Link, useParams } from 'react-router';
import { Clock, MapPin, MessageCircle, PencilLine, Phone, SearchX, Trophy } from 'lucide-react';
import { isFeatured, priceText, useVenue, whatsappLink } from '../../lib/data/business';
import { useIsPro } from '../../lib/useMode';
import { venueDetailsLines } from '../../lib/venues/fields';
import { venueMapUrl, venueWhatsappText } from '../../lib/venues/text';
import { sportMeta } from '../../sports/registry';
import { AppShell } from '../../components/Shell';
import { LeagueTopBar } from '../../components/league/home/LeagueTopBar';
import { FeaturedBadge, VenuePhotoImg } from '../../components/venues/VenueBits';
import { Badge, Card, Empty, ListRow, LoadError, Loading, SectionHeader, cx } from '../../components/ui';
import { SportIcon } from '../sports/SportBits';

const btn = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-btn px-4 text-body font-semibold transition active:scale-[0.98]';

/**
 * La ficha de un espacio (`/canchas/:id`): sus fotos, deporte y lo que tiene, precio, horario, dónde queda, la empresa,
 * escribirle por WhatsApp o llamar, y los torneos y ligas públicas que se juegan ahí. La dueña ve «Cambiar en mi panel».
 */
export default function VenuePage() {
  const { venueId } = useParams();
  const pro = useIsPro();
  const venue = useVenue(venueId);
  const v = venue.data;

  if (venue.loading && !v) {
    return (
      <AppShell>
        <Loading />
      </AppShell>
    );
  }
  if (!v) {
    return (
      <AppShell>
        <div className="flex flex-col px-2">
          <LeagueTopBar to="/canchas" label="Dónde jugar" />
          {venue.error ? (
            <LoadError error={venue.error} />
          ) : (
            <Empty icon={<SearchX className="size-7" aria-hidden="true" />} title="Este espacio no está disponible">
              Puede que lo hayan quitado o que todavía no esté publicado.
            </Empty>
          )}
        </div>
      </AppShell>
    );
  }

  const meta = sportMeta(v.sport);
  const lines = venueDetailsLines(v.sport, v.details);
  const price = priceText(v.priceHour);
  const wa = whatsappLink(v.phone, venueWhatsappText(v));
  const map = venueMapUrl(v);

  return (
    <AppShell>
      <div className="flex flex-col px-2">
        <LeagueTopBar to="/canchas" label="Dónde jugar" />
        <div className="-mx-2 flex snap-x snap-mandatory gap-2 overflow-x-auto px-2 pb-1">
          {(v.photos.length ? v.photos : [null]).map((p, i) => (
            <div key={p?.id ?? 'sin-foto'} className={cx('shrink-0 snap-center overflow-hidden rounded-3xl', v.photos.length > 1 ? 'w-[85%]' : 'w-full')}>
              <VenuePhotoImg photo={p} sport={v.sport} alt={p ? `Foto ${i + 1} de ${v.name}` : ''} />
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent" className="inline-flex items-center gap-1">
              <SportIcon sport={v.sport} className="size-3.5" />
              {meta?.label}
            </Badge>
            {isFeatured(v) && <FeaturedBadge />}
          </div>
          <h1 className={cx(pro ? 'text-title-pro' : 'text-title', 'break-words')}>{v.name}</h1>
          <p className="text-meta text-muted">{v.business.name}</p>
          {price && <p className="text-body font-semibold">{price}</p>}
        </div>

        {(wa || v.phone) && (
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className={cx(btn, 'bg-accent text-accent-fg', !v.phone && 'col-span-2')}>
                <MessageCircle className="size-5" aria-hidden="true" />
                WhatsApp
              </a>
            )}
            {v.phone && (
              <a href={`tel:${v.phone}`} className={cx(btn, 'bg-surface-2 text-fg', !wa && 'col-span-2')}>
                <Phone className="size-5" aria-hidden="true" />
                Llamar
              </a>
            )}
          </div>
        )}

        {lines.length > 0 && (
          <Card className="mt-5 flex flex-wrap gap-2 p-4">
            {lines.map((l) => (
              <Badge key={l}>{l}</Badge>
            ))}
          </Card>
        )}

        <Card className="mt-3 overflow-hidden">
          <ListRow leading={<MapPin className="size-5 text-muted" aria-hidden="true" />} title={v.address || v.city} subtitle={v.address ? v.city : undefined} onClick={() => window.open(map, '_blank', 'noopener')} chevron />
          {v.hours && <ListRow leading={<Clock className="size-5 text-muted" aria-hidden="true" />} title={v.hours} subtitle="Horario" />}
          {v.mine && <ListRow leading={<PencilLine className="size-5 text-accent" aria-hidden="true" />} title="Cambiar en mi panel" to="/empresa" chevron />}
        </Card>

        {v.business.description && (
          <>
            <SectionHeader className="mt-7" title={v.business.name} />
            <p className="text-body whitespace-pre-line text-fg-2">{v.business.description}</p>
          </>
        )}

        {v.leagues.length > 0 && (
          <>
            <SectionHeader className="mt-7" title="Torneos y ligas aquí" />
            <Card className="overflow-hidden">
              {v.leagues.map((l) => (
                <ListRow
                  key={l.id}
                  leading={<Trophy className="size-5 text-muted" aria-hidden="true" />}
                  title={l.name}
                  subtitle={[l.kind === 'torneo' ? 'Torneo' : 'Liga', sportMeta(l.sport)?.short].filter(Boolean).join(' · ')}
                  to={`/l/${l.id}`}
                  chevron
                />
              ))}
            </Card>
          </>
        )}
        <p className="mt-6 text-center text-[13px] text-muted">
          ¿Tienes canchas? <Link to="/empresa" className="font-semibold text-accent">Publícalas en MatchMate</Link>
        </p>
      </div>
    </AppShell>
  );
}
