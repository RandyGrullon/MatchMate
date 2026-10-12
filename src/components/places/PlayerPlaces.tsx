import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { MapPin, Shield } from 'lucide-react';
import { invalidate } from '../../lib/data/client';
import { peopleTags } from '../../lib/data/follows';
import { usePlayerPlaces } from '../../lib/data/places';
import { isGameId } from '../../sports/esports/catalog';
import { GameMark } from '../esports/bits';
import { LeagueIcon, LeagueLogo } from '../home/LeagueCard';
import { SportMark } from '../SportMark';
import { SquadLogo } from '../squads/SquadBits';
import { Card, ListRow, LoadError, SectionHeader, Skeleton, cx, sectionLinkClass } from '../ui';
import { firstRows, placeCount, placeSections, type PlaceRow, type PlaceSection } from './logic';

/**
 * «Dónde juega» (en Yo, «Dónde juego»): las ligas y torneos de una persona agrupados por deporte o juego (con su cuadro
 * del deporte), sus equipos y sus equipos de esports. Cada fila lleva a su perfil en ese lugar: su página de jugador en
 * la liga, el equipo con su ficha (`?jugador=`) o el equipo de esports. Lo que se ve lo decide la base (solo ligas que
 * quien mira puede ver y nunca las de menores). Con muchas, las primeras `limit` y «Ver todo».
 */
export function PlayerPlaces({
  uid,
  name,
  isMe,
  dense,
  limit = 6,
  className,
}: {
  uid: string;
  /** Su nombre (para el texto de vacío). */
  name?: string;
  isMe?: boolean;
  /** Filas de Pro. */
  dense?: boolean;
  limit?: number;
  className?: string;
}) {
  const places = usePlayerPlaces(uid);
  const [all, setAll] = useState(false);
  const sections = useMemo(() => (places.data ? placeSections(places.data, uid) : []), [places.data, uid]);
  const title = isMe ? 'Dónde juego' : 'Dónde juega';
  const headingId = `donde-juega-${uid}`;

  if (places.loading && !places.data) {
    return (
      <section aria-labelledby={headingId} aria-busy="true" className={className}>
        <SectionHeader id={headingId} title={title} />
        <Skeleton className={cx('rounded-3xl', dense ? 'h-[120px]' : 'h-[136px]')} />
      </section>
    );
  }
  if (!places.data) {
    // Sin datos y sin error: esa persona no existe o te bloqueó (el perfil ya lo dice).
    if (!places.error) return null;
    return (
      <section aria-labelledby={headingId} className={className}>
        <SectionHeader id={headingId} title={title} />
        <LoadError error={places.error} onRetry={() => invalidate(peopleTags.user(uid))} />
      </section>
    );
  }

  const total = placeCount(sections);
  const shown = all ? sections : firstRows(sections, limit);
  const more = total > limit;
  const first = name?.trim().split(/\s+/)[0];

  return (
    <section aria-labelledby={headingId} data-places="" className={className}>
      <SectionHeader
        id={headingId}
        title={title}
        action={
          more ? (
            <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all} className={sectionLinkClass}>
              {all ? 'Ver menos' : `Ver todo (${total})`}
            </button>
          ) : undefined
        }
      />
      {total === 0 ? (
        <Card className="flex items-center gap-3.5 px-5 py-4">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg-2">
            <MapPin className="size-5" />
          </span>
          <p className="min-w-0 flex-1 text-sm text-muted">
            {isMe ? (
              <>
                Todavía no juegas en ninguna liga ni equipo.{' '}
                <Link to="/ligas" className="font-semibold text-accent">
                  Buscar ligas
                </Link>
              </>
            ) : (
              `${first || 'Esta persona'} todavía no juega en ligas o equipos que puedas ver.`
            )}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {shown.map((s) => (
            <div key={s.key} data-place-group={s.key}>
              <SectionLabel section={s} />
              <Card className="overflow-hidden">
                {s.rows.map((r) => (
                  <ListRow key={r.key} dense={dense} to={r.to} leading={<RowMark row={r} />} title={r.title} subtitle={r.subtitle} />
                ))}
              </Card>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** El encabezado de cada bloque: el cuadro del deporte (o del juego) y su nombre; en «Equipos», el escudo. */
function SectionLabel({ section: s }: { section: PlaceSection }) {
  return (
    <h3 className="mx-1 mb-2 flex items-center gap-2 text-meta font-semibold text-fg-2">
      {s.kind === 'squads' ? (
        <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg-2">
          <Shield className="size-3.5" />
        </span>
      ) : (
        <SportMark sport={s.sport} game={s.game} size="xs" label={null} />
      )}
      <span className="truncate">{s.label}</span>
    </h3>
  );
}

/** Lo de la izquierda de cada fila: el logo de la liga (o su cuadro), el del equipo, o el del equipo de esports (o su juego). */
function RowMark({ row: r }: { row: PlaceRow }) {
  if (r.kind === 'league') {
    const l = r.place;
    return <LeagueIcon league={{ id: l.leagueId, sport: l.sport, kind: l.kind, logoPath: l.logo, game: l.game }} />;
  }
  if (r.kind === 'squad') return <SquadLogo squad={r.place} />;
  const t = r.place;
  const box = 'size-10 rounded-xl';
  return (
    <LeagueLogo path={t.logo} className={box}>
      {isGameId(t.game) ? (
        <GameMark game={t.game} box={box} decorative />
      ) : (
        <SportMark sport="esports" size="md" label={null} />
      )}
    </LeagueLogo>
  );
}
