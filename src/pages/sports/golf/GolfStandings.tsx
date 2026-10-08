import { Link } from 'react-router';
import { Medal } from 'lucide-react';
import { useGolfTournaments } from '../../../lib/data/golf';
import { eventLabel, formatDate } from '../../../lib/format';
import { useLeagueCtx } from '../../../lib/league';
import { useIsPro } from '../../../components/mode';
import { MyPlaceCard } from '../../../components/ranking/MyPlaceCard';
import { Initials, PosNum, TuTag } from '../../../components/ranking/parts';
import { ShareButton, type ShareTableSpec } from '../../../components/share';
import { ClosedSeasonView, SeasonBar, useStandingsSeason } from '../../../components/season/SeasonView';
import { seasonDates } from '../../../components/season/logic';
import { Card, ListRow, ListSkeleton, LoadError, SectionHeader, cx } from '../../../components/ui';
import { EmptyCard, ShowMore } from '../FieldChrome';
import { meritPlace } from './home';
import { useGolfMerit } from './seasonTable';

/**
 * Orden de mérito de la temporada (rediseño «Calma y foco», como la Tabla del boliche): puntos por puesto en cada ronda
 * cerrada (un torneo de varias rondas cuenta como un evento cuando todas sus rondas están cerradas). Empates en un
 * evento reparten los puntos. Arriba, el título con compartir y la temporada (?temporada=): la activa con las rondas de
 * sus fechas; una cerrada muestra sus premios y la tabla que se guardó al cerrarla.
 * - Lite: tu lugar («Vas 3.º de 6, con 41 pts · Pedro te lleva 9») y la lista con «Tú».
 * - Pro: la tabla con Puntos, Jugó, Ganó y Mejor.
 * Debajo, las rondas que cuentan (y quién ganó cada una).
 */
export default function GolfStandings() {
  const { lid, base, league, myPlayerId } = useLeagueCtx();
  const pro = useIsPro();
  const picked = useStandingsSeason();
  const { season, rules, events, players, merit, counted } = useGolfMerit(picked.selected);
  const tournaments = useGolfTournaments(lid);

  const title = <h1 className={pro ? 'text-title-pro' : 'text-title'}>Orden de mérito</h1>;
  if (season.error) return <LoadError error={season.error} />;
  if (season.loading) return <ListSkeleton rows={6} />;
  if (picked.closed) {
    return (
      <div className="flex flex-col gap-4 px-2">
        <div className="mt-1">{title}</div>
        <SeasonBar seasons={picked.seasons} selected={picked.selected} onChange={picked.setSelected} />
        <ClosedSeasonView season={picked.closed} highlight={myPlayerId ? [myPlayerId] : []} />
      </div>
    );
  }
  const nameOf = (id: string) => players.data.find((p) => p.id === id)?.name ?? '(jugador borrado)';
  const eventName = (id: string) => {
    const e = events.data.find((x) => x.id === id);
    return e ? eventLabel({ type: e.type, name: e.name, date: e.date }, 'golf') : 'Ronda';
  };
  const season$ = picked.selected
    ? `${picked.selected.name} (${seasonDates(picked.selected)})`
    : league.seasonStart || league.seasonEnd
      ? `${league.seasonStart ? formatDate(league.seasonStart) : '…'} – ${league.seasonEnd ? formatDate(league.seasonEnd) : '…'}`
      : null;
  const place = pro ? null : meritPlace(merit, myPlayerId, nameOf);
  const leader = merit[0];

  // Imagen del orden de mérito para mandar al grupo.
  const shareCard = (): ShareTableSpec => ({
    kind: 'table',
    title: league.name,
    subtitle: season$ ? `Orden de mérito · ${season$}` : 'Orden de mérito',
    nameLabel: 'Jugador',
    columns: [{ label: 'Jugó' }, { label: 'Ganó' }, { label: 'Mejor', optional: true }, { label: 'Puntos', strong: true }],
    sections: [{ rows: merit.map((m) => ({ rank: m.rank, name: nameOf(m.id), values: [m.events, m.wins, m.best ?? '–', m.points.toLocaleString('es-DO')] })) }],
    note: `Puntos por puesto en cada ronda cerrada (${counted.length} ${counted.length === 1 ? 'evento' : 'eventos'}).`,
  });

  return (
    <div className="flex flex-col px-2">
      <div className="mt-1 flex items-center justify-between gap-3">
        {title}
        {merit.length > 0 && (
          <ShareButton
            variant="ghost"
            size="md"
            iconOnly
            label="Compartir el orden de mérito"
            card={shareCard}
            className="relative shrink-0 rounded-full! bg-surface-2 text-fg-2 after:absolute after:-inset-0.5 after:content-['']"
          />
        )}
      </div>
      {!picked.selected && season$ && <p className="mt-1.5 text-meta text-muted">Temporada {season$}</p>}
      <SeasonBar className="mt-3" seasons={picked.seasons} selected={picked.selected} onChange={picked.setSelected} />

      {!merit.length ? (
        <EmptyCard className="mt-5" icon={<Medal className="size-5" />} title="Todavía no hay rondas cerradas" text="Cuando el admin cierre una ronda, sus resultados suman aquí." />
      ) : pro ? (
        <Card className="mt-3.5 overflow-hidden">
          <div className="grid grid-cols-[1.5rem_1fr_3.5rem_2.75rem_2.75rem] gap-2 border-b border-line px-4 py-2.5 text-xs font-semibold tracking-[0.06em] text-muted uppercase sm:grid-cols-[1.5rem_1fr_4rem_4rem_4rem_4rem]">
            <span>#</span>
            <span>Jugador</span>
            <span className="text-right">Puntos</span>
            <span className="text-right">Jugó</span>
            <span className="text-right">Ganó</span>
            <span className="hidden text-right sm:block">Mejor</span>
          </div>
          <ul>
            {merit.map((m) => {
              const me = !!myPlayerId && m.id === myPlayerId;
              return (
                <li key={m.id} className="border-t border-line first:border-t-0">
                  <Link
                    to={`${base}/j/${m.id}`}
                    className={cx(
                      'grid min-h-row-pro grid-cols-[1.5rem_1fr_3.5rem_2.75rem_2.75rem] items-center gap-2 px-4 py-2 transition active:bg-surface-2 sm:grid-cols-[1.5rem_1fr_4rem_4rem_4rem_4rem]',
                      me && 'bg-accent-soft',
                    )}
                  >
                    <PosNum pos={m.rank} />
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[15px] font-semibold">{nameOf(m.id)}</span>
                      {me && <TuTag small />}
                    </span>
                    <b className="num text-right text-row-num-pro">{m.points.toLocaleString('es-DO')}</b>
                    <span className="num text-right text-sm">{m.events}</span>
                    <span className="num text-right text-sm">{m.wins}</span>
                    <span className="num hidden text-right text-sm sm:block">{m.best ?? '–'}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <>
          {place && leader && (
            <MyPlaceCard
              className="mt-5"
              copy={{
                big: place.big,
                title: place.title,
                subtitle: place.subtitle,
                bar: leader.points ? (merit.find((m) => m.id === myPlayerId)?.points ?? 0) / leader.points : 0,
                left: `Tú · ${merit.find((m) => m.id === myPlayerId)?.points ?? 0}`,
                right: leader.id === myPlayerId ? null : `1.º · ${nameOf(leader.id)} ${leader.points}`,
              }}
            />
          )}
          <Card className={cx('overflow-hidden', place ? 'mt-3.5' : 'mt-5')}>
            {merit.map((m) => {
              const me = !!myPlayerId && m.id === myPlayerId;
              return (
                <ListRow
                  key={m.id}
                  to={`${base}/j/${m.id}`}
                  chevron={false}
                  me={me}
                  className="min-h-[60px]!"
                  leading={
                    <>
                      <PosNum pos={m.rank} />
                      <Initials name={nameOf(m.id)} me={me} />
                    </>
                  }
                  title={
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">{nameOf(m.id)}</span>
                      {me && <TuTag />}
                    </span>
                  }
                  subtitle={`Jugó ${m.events} · ganó ${m.wins}`}
                  value={m.points.toLocaleString('es-DO')}
                />
              );
            })}
          </Card>
        </>
      )}
      <p className="mt-3.5 text-center text-[13px] leading-[1.4] text-muted">Puntos por puesto en cada ronda cerrada: {rules.data.meritPoints.slice(0, 5).join(', ')}…</p>

      {counted.length > 0 && (
        <section aria-labelledby="golf-cuentan" className="mt-[30px]">
          <SectionHeader id="golf-cuentan" title={`Rondas que cuentan (${counted.length})`} />
          <ShowMore
            items={counted}
            noun="rondas"
            render={(shown) => (
              <Card className="overflow-hidden">
                {shown.map((e) => (
                  <ListRow
                    key={e.id}
                    dense
                    to={`${base}/e/${e.eventIds[0]}?tab=leaderboard`}
                    title={e.kind === 'torneo' ? (tournaments.data.find((t) => t.id === e.id)?.name ?? 'Torneo') : eventName(e.id)}
                    subtitle={`${e.kind === 'torneo' ? `${e.eventIds.length} rondas · ` : ''}ganó ${e.rows.filter((r) => r.rank === 1).map((r) => nameOf(r.id)).join(' y ') || '–'}`}
                  />
                ))}
              </Card>
            )}
          />
        </section>
      )}
    </div>
  );
}
