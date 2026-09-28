import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, ChevronDown, ChevronUp, Radio, Shirt, Trophy, Zap } from 'lucide-react';
import type { Match } from '../../../lib/data/matches';
import { formatDateLong } from '../../../lib/format';
import { BackLink } from '../../../components/BackLink';
import { Badge, Button, Card, Empty, ListSkeleton, cx } from '../../../components/ui';
import { SectionHead, TeamName } from './TeamBits';
import { TeamsManager } from './TeamsManager';
import { stageGroups, tournamentStep, type TournamentStep } from './tournament';
import { TournamentAdvance, TournamentBuilder } from './TournamentBuilder';
import type { TeamLeague } from './useTeamLeague';

/**
 * El torneo de un día de los deportes de equipo (baloncesto, fútbol y sala), sobre todo el «torneo sin liga»:
 * en vez de un evento vacío, guía al organizador por lo que se hace en un relámpago: 1) los equipos (ahí mismo),
 * 2) armar el torneo (grupos de todos contra todos y la eliminatoria, con horas y canchas) y 3) jugar: los partidos
 * por fase y «Pasar a la fase final» cuando terminan los grupos. Los demás ven los equipos y los partidos.
 */
export function TournamentHub({
  tl,
  title,
  date,
  announcement,
  format,
  slotMinutes,
  knockoutRules,
  positions,
  rankGroup,
  renderMatch,
  sportWord = 'equipo',
}: {
  tl: TeamLeague;
  title: string;
  /** 'YYYY-MM-DD' (el día del torneo). */
  date?: string | null;
  announcement?: string | null;
  /** matches.format del deporte. */
  format?: string;
  /** Minutos por turno (el partido con su descanso). */
  slotMinutes?: number;
  /** Reglas de la eliminatoria (p. ej. penales si empatan). */
  knockoutRules?: Record<string, unknown>;
  /** Posiciones del deporte (para las plantillas). */
  positions: readonly string[];
  /** Tabla final de un grupo (ids en orden) o null si todavía no termina. */
  rankGroup: (stage: string) => string[] | null;
  renderMatch: (m: Match) => ReactNode;
  sportWord?: string;
}) {
  const [building, setBuilding] = useState(false);
  const teams = tl.teams.data;
  const matches = tl.matches.data;
  const step = tournamentStep(teams.length, matches.length);
  const stages = useMemo(() => stageGroups(matches), [matches]);
  const live = matches.filter((m) => m.status === 'live' || m.status === 'suspended');
  const standalone = tl.league.kind === 'torneo';
  const loading = (tl.teams.loading && !teams.length) || (tl.matches.loading && !matches.length);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-2">
        {!standalone && <BackLink fallback={tl.base} label="Calendario" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>
            <Badge tone="accent">
              <Zap className="size-3" /> Torneo relámpago
            </Badge>
          </div>
          {date && <p className="text-sm text-muted first-letter:uppercase">{formatDateLong(date)}</p>}
          {announcement && <p className="mt-2 text-sm whitespace-pre-line">{announcement}</p>}
        </div>
      </div>

      {tl.isAdmin && step !== 'play' && (
        <Steps tl={tl} step={step} positions={positions} sportWord={sportWord} onBuild={() => setBuilding(true)} />
      )}

      {tl.isAdmin && <TournamentAdvance tl={tl} rankGroup={rankGroup} />}

      {loading ? (
        <ListSkeleton rows={3} />
      ) : step !== 'play' ? (
        !tl.isAdmin && (
          <Empty icon={<Trophy className="size-8" />} title="El torneo todavía no está armado">
            Cuando el organizador arme los grupos y los partidos, salen aquí con su hora y su cancha.
          </Empty>
        )
      ) : (
        <>
          {live.length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionHead
                title={
                  <span className="flex items-center gap-1.5 text-ok">
                    <Radio className="size-4" /> En vivo
                  </span>
                }
              />
              <div className="grid gap-2 sm:grid-cols-2">
                {live.map((m) => (
                  <div key={m.id}>{renderMatch(m)}</div>
                ))}
              </div>
            </section>
          )}
          {stages.map((g) => (
            <section key={g.stage} className="flex flex-col gap-2">
              <SectionHead title={g.stage} />
              <div className="grid gap-2 sm:grid-cols-2">
                {g.matches.map((m) => (
                  <div key={m.id}>{renderMatch(m)}</div>
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {teams.length > 0 && (step === 'play' || !tl.isAdmin) && (
        <section className="flex flex-col gap-2">
          <SectionHead title={`Equipos (${teams.length})`} />
          <div className="flex flex-wrap gap-1.5">
            {teams.map((t) => (
              <span key={t.id} className="rounded-full border border-line px-3 py-1.5 text-sm">
                <TeamName team={t} />
              </span>
            ))}
          </div>
        </section>
      )}

      {tl.isAdmin && (
        <TournamentBuilder tl={tl} open={building} onClose={() => setBuilding(false)} format={format} slotMinutes={slotMinutes} knockoutRules={knockoutRules} />
      )}
    </div>
  );
}

/** Los pasos del organizador: los equipos (ahí mismo) y armar el torneo. */
function Steps({
  tl,
  step,
  positions,
  sportWord,
  onBuild,
}: {
  tl: TeamLeague;
  step: Exclude<TournamentStep, 'play'>;
  positions: readonly string[];
  sportWord: string;
  onBuild: () => void;
}) {
  const [showTeams, setShowTeams] = useState(step === 'teams');
  const n = tl.teams.data.length;
  return (
    <Card className="flex flex-col divide-y divide-line overflow-hidden">
      <div className="flex flex-col gap-3 px-4 py-4">
        <StepHead n={1} done={n >= 2} title="Los equipos">
          {n >= 2 ? `${n} equipos listos.` : n === 1 ? 'Hay 1 equipo: hacen falta al menos 2.' : 'Crea los equipos con su color y su plantilla (los dorsales se pueden poner después).'}
        </StepHead>
        <div className="flex flex-wrap items-center gap-2 pl-10">
          <Button size="sm" variant={step === 'teams' ? 'primary' : 'secondary'} icon={showTeams ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />} onClick={() => setShowTeams(!showTeams)}>
            {showTeams ? 'Listo con los equipos' : n ? 'Ver los equipos' : 'Crear los equipos'}
          </Button>
          <Link to={`${tl.base}/admin?tab=equipos`} className="flex h-9 items-center gap-1.5 px-2 text-sm font-medium text-accent">
            <Shirt className="size-4" /> Equipos y reglas
          </Link>
        </div>
        {showTeams && (
          <div className="rounded-2xl bg-surface-2 p-3">
            <TeamsManager tl={tl} positions={positions} sportWord={sportWord} />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3 px-4 py-4">
        <StepHead n={2} done={false} title="Arma el torneo">
          Grupos de todos contra todos y después la eliminatoria (semifinales y final, con 3.er lugar si quieres), con horas y canchas, en un solo día.
          La app te muestra los grupos y los partidos antes de guardar.
        </StepHead>
        <div className="pl-10">
          <Button variant="primary" className="h-12" icon={<Trophy className="size-5" />} disabled={n < 2} onClick={onBuild}>
            Armar el torneo
          </Button>
        </div>
      </div>
      <div className="px-4 py-4">
        <StepHead n={3} done={false} title="A jugar">
          Cada partido se anota en la cancha con el teléfono. Cuando terminen los grupos, pasas a los clasificados a la fase final con un toque.
        </StepHead>
      </div>
    </Card>
  );
}

function StepHead({ n, done, title, children }: { n: number; done: boolean; title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={cx(
          'flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold',
          done ? 'bg-ok text-bg' : 'bg-accent-soft text-accent',
        )}
        aria-hidden="true"
      >
        {done ? <CheckCircle2 className="size-4" /> : n}
      </span>
      <div className="min-w-0">
        <p className="font-semibold">
          <span className="sr-only">Paso {n}: </span>
          {title}
        </p>
        <p className="text-sm text-muted">{children}</p>
      </div>
    </div>
  );
}
