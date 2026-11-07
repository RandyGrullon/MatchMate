import { useMemo } from 'react';
import { Link } from 'react-router';
import { CircleHelp } from 'lucide-react';
import { useMySoloSessions, type SoloSession } from '../lib/data/solo';
import type { League, Member } from '../lib/types';
import { sportMeta } from '../sports/registry';
import { splitBySport, useBowlingNumbers, type SportLeagueLink } from './bowlingNumbers';
import { LeagueIcon } from './home/LeagueCard';
import { SPORT_LEAGUES_TEXT, globalPendingNote, globalWhatLine, sportLeaguesTitle, statsLine } from './profileNumbers';
import { Card, ListRow, LoadError, RowIcon, SectionHeader, StatsSkeleton, cx } from './ui';

// Lo que suma los números del boliche (sin pantallas) está en bowlingNumbers.ts: lo comparte la app del teléfono. Se
// sigue importando desde aquí.
export { bowlingNumbers, splitBySport, useBowlingNumbers, type BowlingNumbers, type BowlingNumbersState, type SportLeagueLink } from './bowlingNumbers';

/** Sin números todavía: su jugador se está creando, o cómo empezar (unirse, crear o un juego suelto). */
export function NoBowlingNumbers({ preparing, className }: { preparing: string | null; className?: string }) {
  return preparing ? (
    <Card className={cx('p-5 text-sm text-muted', className)}>
      Estamos preparando tu jugador. Si no aparece en unos segundos, ábrelo en{' '}
      <Link to={`/l/${preparing}/perfil`} className="font-medium text-accent">
        Mis juegos
      </Link>
      .
    </Card>
  ) : (
    <Card className={cx('p-5 text-sm text-muted', className)}>
      Únete a una liga, crea la tuya o{' '}
      <Link to="/juegos-sueltos" className="font-medium text-accent">
        anota un juego suelto
      </Link>
      : aquí verás tus números de todo junto.
    </Card>
  );
}

/**
 * «Por liga y temporada» (Yo, `/perfil?tab=estadisticas`): las ligas de boliche (y torneos) con sus juegos sueltos,
 * todo junto, y aparte las ligas de los otros deportes con un link al perfil de cada una (cada deporte cuenta lo suyo:
 * sets, goles, golpes, marcas).
 */
export function ProfileStats({ memberships, leagues }: { memberships: Member[]; leagues: League[] }) {
  const { bowling, others } = useMemo(() => splitBySport(memberships, leagues), [memberships, leagues]);
  const solo = useMySoloSessions();
  const hasSolo = solo.data.length > 0;
  const showBowling = bowling.length > 0 || others.length === 0 || hasSolo;
  return (
    <>
      {showBowling && <GlobalStats memberships={bowling} leagues={leagues} solo={solo.data} soloLoading={solo.loading} title={others.length > 0} />}
      {others.length > 0 && <SportLeagues leagues={others} alone={!showBowling} />}
    </>
  );
}

/** Las ligas de los otros deportes: cada una abre «Mis números» en esa liga. */
export function SportLeagues({ leagues, alone, className }: { leagues: SportLeagueLink[]; alone: boolean; className?: string }) {
  return (
    <section className={className} aria-label={alone ? 'Mis ligas' : 'Mis ligas de otros deportes'}>
      <SectionHeader title={sportLeaguesTitle(alone)} />
      <p className="mx-1 -mt-1.5 mb-3 text-sm text-muted">{SPORT_LEAGUES_TEXT}</p>
      <Card className="overflow-hidden">
        {leagues.map((l) => {
          const meta = sportMeta(l.sport);
          const Icon = meta?.icon ?? CircleHelp;
          return (
            <ListRow
              key={l.lid}
              to={`/l/${l.lid}/perfil`}
              leading={
                <RowIcon tone="accent">
                  <Icon className="size-5" />
                </RowIcon>
              }
              title={l.name}
              subtitle={`${meta?.short ?? 'Otro deporte'} · ${l.kind === 'torneo' ? 'Torneo' : 'Liga'} · Mis números`}
            />
          );
        })}
      </Card>
    </section>
  );
}

/**
 * Perfil global del boliche, por liga y por año: el total de todas sus ligas (y torneos sin liga) y sus juegos sueltos,
 * cada liga con sus números (abre «Mis números» de esa liga) y cada año. La cuenta es su jugador en cada liga. Solo
 * cuentan los juegos verificados, igual que en cada liga. Recibe solo las membresías del boliche (ver `splitBySport`).
 * Los juegos sueltos suman al total y a cada año, y tienen su fila en «Por liga»; el promedio y la tabla de cada liga
 * siguen siendo solo de la liga. El promedio grande, la tendencia y los tiros van arriba, en Yo.
 */
export function GlobalStats({
  memberships,
  leagues,
  solo,
  soloLoading = false,
  title,
}: {
  memberships: Member[];
  leagues: League[];
  solo?: SoloSession[];
  soloLoading?: boolean;
  /** «Boliche, todo junto» (cuando también hay otros deportes). */
  title?: boolean;
}) {
  const state = useBowlingNumbers(memberships, leagues, solo, soloLoading);
  const leagueOf = useMemo(() => new Map(leagues.map((l) => [l.id, l])), [leagues]);
  if (state.status === 'none') return <NoBowlingNumbers preparing={state.preparing} />;
  if (state.status === 'error') return <LoadError error={state.error} />;
  if (state.status === 'loading') return <StatsSkeleton />;
  const n = state.data;

  return (
    <div className="flex flex-col gap-[26px]">
      <section aria-label="Todo junto">
        <SectionHeader title={title ? 'Boliche, todo junto' : 'Todo junto'} />
        <Card className="p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm text-muted">Promedio</p>
              <p className="num mt-1 text-stat">{n.all.autoAverage ?? '—'}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted">Puntaje total</p>
              <p className="num mt-1 text-row-num">{n.all.pins ? n.all.pins.toLocaleString('es-DO') : '—'}</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-fg-2">{globalWhatLine(n)}</p>
          <p className="mt-1 text-[13px] text-muted">{globalPendingNote(n.all.pending)}</p>
        </Card>
      </section>

      <section aria-label="Por liga">
        <SectionHeader title="Por liga" action={<span className="text-sm text-muted">Promedio</span>} />
        <Card className="overflow-hidden">
          {n.perLeague.map(({ lid, name, stats }) => (
            <ListRow
              key={lid}
              to={`/l/${lid}/perfil`}
              leading={<LeagueIcon league={leagueOf.get(lid) ?? { id: lid, sport: 'bowling', kind: 'liga' }} />}
              title={name}
              subtitle={statsLine(stats)}
              value={stats.autoAverage ?? '—'}
              chevron
            />
          ))}
          {n.solo && (
            <ListRow
              to="/juegos-sueltos"
              leading={<LeagueIcon league={SOLO_ICON} />}
              title="Juegos sueltos"
              subtitle={statsLine(n.solo)}
              value={n.solo.autoAverage ?? '—'}
              chevron
            />
          )}
        </Card>
      </section>

      {n.years.length > 0 && (
        <section aria-label="Por año">
          <SectionHeader title="Por año" />
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-5 py-2.5 text-left font-medium">Año</th>
                  <th className="px-2 py-2.5 text-right font-medium">Juegos</th>
                  <th className="px-2 py-2.5 text-right font-medium">Promedio</th>
                  <th className="px-5 py-2.5 text-right font-medium">Mejor</th>
                </tr>
              </thead>
              <tbody>
                {n.years.map(({ year, stats: s }) => (
                  <tr key={year} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 font-medium">{year}</td>
                    <td className="px-2 py-3 text-right tabular-nums">{s.games}</td>
                    <td className="px-2 py-3 text-right font-semibold tabular-nums">{s.autoAverage ?? '—'}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{s.high || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}
    </div>
  );
}

/** El cuadrito de «Juegos sueltos» en «Por liga»: el del boliche (no hay liga con logo). */
const SOLO_ICON = { id: 'juegos-sueltos', sport: 'bowling', kind: 'liga' } as const;
