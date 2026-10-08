import { useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { Check, ClipboardPen, FileDown, Shirt, Trophy, Zap } from 'lucide-react';
import type { Match } from '../../../lib/data/matches';
import { formatDateLong } from '../../../lib/format';
import { useNow } from '../../../lib/useNow';
import { teamKoComp, teamKoComplete } from '../../../prizes/sports';
import { EventMenu, MoreButton, type MenuItem } from '../../../components/event/EventHeader';
import { useIsPro } from '../../../components/mode';
import { Button, Card, Empty, ListRow, ListSkeleton, RowIcon, SectionHeader, Sheet, cx } from '../../../components/ui';
import { TeamDot } from './TeamBits';
import { KnockoutPrizes, teamReportNames, type KoEvent } from './TeamPrizes';
import { HistoryBackBar, ReportSheet, ScorersSheet } from './TeamUi';
import { TeamsManager } from './TeamsManager';
import { stageGroups, tournamentStep, type TournamentStep } from './tournament';
import { TournamentAdvance, TournamentBuilder } from './TournamentBuilder';
import type { TeamLeague } from './useTeamLeague';
import type { FootballSeason } from '../football/season';

/**
 * El torneo de un día de los deportes de equipo (baloncesto, fútbol y sala), sobre todo el «torneo sin liga»
 * (rediseño «Calma y foco»). En el inicio del torneo va dentro del marco de la liga (el nombre ya está arriba): solo
 * «⚡ Torneo relámpago · el día»; abierto como evento (/e/…), con su barra «‹ Liga» y «•••» (Reporte, Anotadores) y su
 * título. Guía al organizador por lo que se hace en un relámpago: 1) los equipos (en una hoja), 2) armar el torneo
 * (grupos de todos contra todos y la eliminatoria, con horas y canchas; el único botón) y 3) jugar: los partidos por fase
 * y «Pasar a la fase final» cuando terminan los grupos. Los demás ven los equipos y los partidos.
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
  event = null,
  footballSeason,
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
  /** El evento del torneo suelto (de él cuelgan los premios del torneo). */
  event?: KoEvent | null;
  /** Fútbol y sala: la temporada ya calculada (goleadores y sanciones del comité), para el reporte del torneo. */
  footballSeason?: FootballSeason;
}) {
  const pro = useIsPro();
  const { eventId } = useParams();
  // Sin evento en la dirección: es el inicio del torneo (dentro del marco de la liga, que ya trae el nombre y el atrás).
  const home = !eventId;
  const [building, setBuilding] = useState(false);
  const [sheet, setSheet] = useState<'reporte' | 'anotadores' | null>(null);
  const [menu, setMenu] = useState(false);
  const teams = tl.teams.data;
  const matches = tl.matches.data;
  const step = tournamentStep(teams.length, matches.length);
  const stages = useMemo(() => stageGroups(matches), [matches]);
  const live = matches.filter((m) => m.status === 'live' || m.status === 'suspended');
  const loading = (tl.teams.loading && !teams.length) || (tl.matches.loading && !matches.length);
  const now = useNow(60_000).getTime();

  // En el inicio del torneo no hay evento en la dirección: el día es el del evento del torneo.
  const day = date || event?.date || null;

  // Reporte del torneo (PDF o Excel), para todos: se arma al tocar, con las tablas y la eliminatoria de la app.
  const report = () =>
    import('../../../lib/report/team').then((m) =>
      m.teamKoReport({
        lid: tl.lid,
        league: tl.league,
        title,
        date: day,
        matches,
        teamIds: teams.map((t) => t.id),
        names: teamReportNames(tl),
        rules: tl.rules.data,
        now,
        football: footballSeason,
      }),
    );
  const comp = teamKoComp(tl.lid, { kind: tl.league.kind ?? 'liga', sport: tl.league.sport ?? 'football', event, leagueName: tl.league.name });
  const reportReady = !loading && !tl.players.loading;
  const finished = step === 'play' && teamKoComplete(matches, now);
  const meta = ['Torneo relámpago', day ? formatDateLong(day) : null].filter(Boolean).join(' · ');

  const open = (s: 'reporte' | 'anotadores') => {
    setMenu(false);
    setSheet(s);
  };
  const items: MenuItem[] = [
    ...(reportReady ? [{ key: 'reporte', icon: FileDown, label: 'Reporte del torneo', hint: 'PDF para WhatsApp o imprimir, o Excel', onClick: () => open('reporte') }] : []),
    ...(tl.isAdmin ? [{ key: 'anotadores', icon: ClipboardPen, label: 'Anotadores', hint: 'Quién anota los partidos', onClick: () => open('anotadores') }] : []),
  ];

  return (
    <div className={cx('flex flex-col', !home && 'px-2')}>
      {home ? (
        <p className="inline-flex items-center gap-1.5 text-meta font-semibold text-accent first-letter:uppercase">
          <Zap aria-hidden="true" className="size-4" />
          <span className="first-letter:uppercase">{meta}</span>
        </p>
      ) : (
        <>
          <HistoryBackBar label={tl.league.name} fallback={tl.base} right={items.length > 0 && <MoreButton onClick={() => setMenu(true)} />} />
          <h1 className={cx('break-words', pro ? 'mt-0.5 text-title-pro' : 'mt-1 text-title')}>{title}</h1>
          <p className={cx('inline-flex items-center gap-1.5 text-meta text-muted', pro ? 'mt-1' : 'mt-1.5')}>
            <Zap aria-hidden="true" className="size-4 text-accent" />
            <span className="first-letter:uppercase">{meta}</span>
          </p>
        </>
      )}
      {announcement && <p className="mt-2 text-body whitespace-pre-line text-fg-2">{announcement}</p>}

      <div className="mt-[22px] flex flex-col gap-[30px] empty:hidden">
        {tl.isAdmin && step !== 'play' && <Steps tl={tl} step={step} positions={positions} sportWord={sportWord} onBuild={() => setBuilding(true)} />}

        {tl.isAdmin && <TournamentAdvance tl={tl} rankGroup={rankGroup} />}

        {/* Terminado el torneo, el admin tiene el reporte a la mano (para todos está en «•••» o abajo). */}
        {tl.isAdmin && finished && reportReady && (
          <Card soft className="overflow-hidden">
            <ListRow
              leading={
                <RowIcon tone="accent" className="bg-surface">
                  <FileDown className="size-5" />
                </RowIcon>
              }
              title="Reporte del torneo"
              subtitle="PDF para WhatsApp o imprimir, o Excel"
              onClick={() => open('reporte')}
            />
          </Card>
        )}

        <KnockoutPrizes tl={tl} event={event} />

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
              <section aria-labelledby="torneo-vivo">
                <SectionHeader id="torneo-vivo" title="En vivo" />
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {live.map((m) => (
                    <div key={m.id} className="min-w-0">
                      {renderMatch(m)}
                    </div>
                  ))}
                </div>
              </section>
            )}
            {stages.map((g) => (
              <section key={g.stage} aria-label={g.stage}>
                <SectionHeader title={g.stage} />
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {g.matches.map((m) => (
                    <div key={m.id} className="min-w-0">
                      {renderMatch(m)}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}

        {teams.length > 0 && (step === 'play' || !tl.isAdmin) && (
          <section aria-labelledby="torneo-equipos">
            <SectionHeader id="torneo-equipos" title="Equipos" action={<span className="text-meta text-muted">{teams.length}</span>} />
            <div className="flex flex-wrap gap-2">
              {teams.map((t) => (
                <span key={t.id} className="card-shadow inline-flex h-9 max-w-full items-center gap-2 rounded-full bg-surface px-3.5 text-[15px] font-semibold">
                  <TeamDot team={t} />
                  <span className="truncate">{t.name}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        {/* En el inicio no hay «•••» (la barra es la de la liga): lo mismo como filas al final. */}
        {home && items.length > 0 && (
          <Card className="overflow-hidden">
            {items.map((it) => (
              <ListRow
                key={it.key}
                leading={
                  <RowIcon>
                    <it.icon className="size-5" />
                  </RowIcon>
                }
                title={it.label}
                subtitle={it.hint}
                onClick={it.onClick}
                dense={pro}
              />
            ))}
          </Card>
        )}
      </div>

      {items.length > 0 && <EventMenu open={menu} onClose={() => setMenu(false)} title={title} items={items} />}
      <ReportSheet open={sheet === 'reporte'} onClose={() => setSheet(null)} report={report} comp={comp} />
      {/* La mesa: quién anota los partidos (de la liga, por @usuario o con el link). Siempre de la liga (el permiso lo es,
          y la portada es este torneo): no cambia cuando llega el evento del torneo suelto, así el link que se crea antes
          sigue siendo el de la hoja. */}
      {tl.isAdmin && (
        <ScorersSheet
          open={sheet === 'anotadores'}
          onClose={() => setSheet(null)}
          target={{ scope: 'liga', refId: null, title }}
          participants={teams.flatMap((t) => t.roster.map((r) => r.playerId))}
        />
      )}
      {tl.isAdmin && (
        <TournamentBuilder tl={tl} open={building} onClose={() => setBuilding(false)} format={format} slotMinutes={slotMinutes} knockoutRules={knockoutRules} />
      )}
    </div>
  );
}

/**
 * Los pasos del organizador, como filas numeradas: los equipos (abre la hoja con los equipos y sus plantillas), armar el
 * torneo (el único botón de la pantalla) y a jugar.
 */
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
  const [showTeams, setShowTeams] = useState(false);
  const n = tl.teams.data.length;
  return (
    <section aria-labelledby="torneo-pasos">
      <SectionHeader id="torneo-pasos" title="Para armar el torneo" />
      <Card className="overflow-hidden">
        <ListRow
          leading={<StepMark n={1} done={n >= 2} />}
          title="Los equipos"
          subtitle={n >= 2 ? `${n} equipos listos` : n === 1 ? 'Hay 1: hacen falta al menos 2' : 'Cada uno con su color y su plantilla'}
          onClick={() => setShowTeams(true)}
          ariaLabel={n ? 'Ver los equipos' : 'Crear los equipos'}
        />
        <div className="mm-row relative flex flex-col gap-3.5 pt-2.5 pr-[18px] pb-[18px] pl-5">
          <div className="flex items-center gap-3.5">
            <StepMark n={2} done={false} />
            <div className="min-w-0">
              <p className="text-body font-semibold">Arma el torneo</p>
              <p className="mt-0.5 text-sm text-muted">Grupos y después la eliminatoria, con horas y canchas.</p>
            </div>
          </div>
          {step === 'build' && (
            <Button variant="primary" size="lg" icon={<Trophy className="size-5" />} disabled={n < 2} onClick={onBuild}>
              Armar el torneo
            </Button>
          )}
        </div>
        <ListRow leading={<StepMark n={3} done={false} />} title="A jugar" subtitle="Se anota en la cancha; al terminar los grupos, pasas a la final." />
      </Card>
      <Sheet open={showTeams} onClose={() => setShowTeams(false)} title="Los equipos" subtitle={tl.league.name}>
        {showTeams && (
          <div className="pb-1">
            <TeamsManager tl={tl} positions={positions} sportWord={sportWord} />
          </div>
        )}
      </Sheet>
      {step === 'teams' && (
        <Button variant="primary" size="lg" className="mt-3.5 w-full" icon={<Shirt className="size-5" />} onClick={() => setShowTeams(true)}>
          {n ? 'Seguir con los equipos' : 'Crear los equipos'}
        </Button>
      )}
    </section>
  );
}

/** El número del paso en su círculo (con ✓ cuando está hecho). */
function StepMark({ n, done }: { n: number; done: boolean }) {
  return (
    <span aria-hidden="true" className={cx('grid size-10 shrink-0 place-items-center rounded-full text-[15px] font-bold', done ? 'bg-accent text-accent-fg' : 'bg-accent-soft text-accent')}>
      {done ? <Check className="size-5" strokeWidth={2.6} /> : n}
      <span className="sr-only">Paso {n}</span>
    </span>
  );
}
