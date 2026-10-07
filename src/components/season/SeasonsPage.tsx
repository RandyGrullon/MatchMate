import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Award, ChevronDown, History, ListOrdered, Settings2, Trophy } from 'lucide-react';
import { useLeagueSeasons } from '../../lib/data/seasons';
import { useLeagueCtx } from '../../lib/league';
import type { Season } from '../../lib/seasons';
import { Badge, Card, Empty, ListSkeleton, LoadError, cx } from '../ui';
import { AWARD_LABEL, parseSnapshot, seasonDates } from './logic';
import { SEASON_PARAM } from './SeasonSelect';
import { SnapshotTables } from './SeasonView';

/**
 * Historial de temporadas de la liga (/l/:lid/temporadas; también sin cuenta en una liga pública): cada temporada
 * con sus fechas, el campeón y los demás premios, el campeón del playoff y la tabla que se guardó al cerrarla. La
 * en curso lleva a su tabla. Aquí llega el aviso «Terminó <temporada>: campeón <nombre>».
 */
export default function SeasonsPage() {
  const { lid, base, isAdmin, league } = useLeagueCtx();
  const seasons = useLeagueSeasons(lid);
  const standalone = league.kind === 'torneo';

  return (
    <div className="flex flex-col gap-5">
      {/* «‹ Liga de los martes» va arriba (LeagueShell). */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <History className="size-5 text-accent" /> Temporadas
          </h1>
          <p className="text-sm text-muted">Los campeones y las tablas de cada temporada de {league.name}.</p>
        </div>
      </div>
      {seasons.error && !seasons.data.length ? (
        <LoadError error={seasons.error} />
      ) : seasons.loading && !seasons.data.length ? (
        <ListSkeleton rows={3} />
      ) : !seasons.data.length ? (
        <Empty icon={<History className="size-8" />} title="Todavía no hay temporadas">
          Cuando la liga cierre su primera temporada, su campeón sale aquí.
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {seasons.data.map((s) => (
            <SeasonCard key={s.id} season={s} base={base} standalone={standalone} />
          ))}
        </div>
      )}
      {isAdmin && !standalone && (
        <Link to={`${base}/admin?tab=temporada`} className="flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-accent">
          <Settings2 className="size-4" /> Cerrar o empezar temporada
        </Link>
      )}
    </div>
  );
}

function SeasonCard({ season: s, base, standalone }: { season: Season; base: string; standalone: boolean }) {
  const [open, setOpen] = useState(false);
  const snapshot = useMemo(() => (s.status === 'closed' ? parseSnapshot(s.standings) : null), [s.status, s.standings]);
  const champion = s.awards.find((a) => a.kind === 'campeon');
  const rest = s.awards.filter((a) => a !== champion);
  const playoff = s.playoffs.find((p) => p.champion);
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <div className={cx('flex size-11 shrink-0 items-center justify-center rounded-2xl', champion ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted')}>
          <Trophy className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-semibold">{s.name}</h2>
            <Badge tone={s.status === 'active' ? 'accent' : 'neutral'}>{s.status === 'active' ? 'En curso' : 'Cerrada'}</Badge>
          </div>
          <p className="text-xs text-muted">{seasonDates(s)}</p>
          {champion ? (
            <p className="mt-1 truncate text-sm">
              <span className="text-muted">{champion.label}:</span> <b>{champion.name}</b>
            </p>
          ) : (
            s.status === 'closed' && <p className="mt-1 text-sm text-muted">Sin campeón anotado.</p>
          )}
        </div>
      </div>
      {rest.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {rest.map((a) => (
            <li key={a.id} className="flex items-start gap-2">
              <Award className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0">
                <span className="text-muted">{a.kind === 'otro' ? a.label : (a.label || AWARD_LABEL[a.kind])}:</span> <span className="font-medium">{a.name}</span>
                {a.note && <span className="block text-xs text-muted">{a.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {playoff?.champion && (!champion || champion.teamId !== playoff.champion.teamId) && (
        <p className="text-sm text-muted">
          {playoff.name}: ganó <b className="text-fg">{playoff.champion.name}</b>
          {playoff.runnerUp ? ` a ${playoff.runnerUp.name}` : ''}.
        </p>
      )}
      <div className="flex flex-wrap gap-x-4">
        {snapshot && (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent">
            <ListOrdered className="size-4" /> {open ? 'Esconder la tabla' : 'Ver la tabla final'}
            <ChevronDown className={cx('size-4 transition-transform', open && 'rotate-180')} />
          </button>
        )}
        {/* La en curso, o una cerrada sin tabla guardada: su tabla se calcula con sus juegos. */}
        {!standalone && (s.status === 'active' || !snapshot) && (
          <Link
            to={s.status === 'active' ? `${base}/ranking` : `${base}/ranking?${SEASON_PARAM}=${s.id}`}
            className="flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent"
          >
            <ListOrdered className="size-4" /> {s.status === 'active' ? 'Ver cómo va la tabla' : 'Ver la tabla'}
          </Link>
        )}
      </div>
      {open && snapshot && <SnapshotTables snapshot={snapshot} />}
    </Card>
  );
}
