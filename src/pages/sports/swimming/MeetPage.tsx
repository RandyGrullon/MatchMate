import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ListChecks, ListOrdered, Lock, LockOpen, Medal, Pencil, Rows3, Timer, Trash2, Trophy, Users, Waves } from 'lucide-react';
import {
  deleteMeet,
  finalizeMeet,
  useSwimEntries,
  useSwimEvents,
  useSwimMeets,
  useSwimRules,
  type SwimClub,
  type SwimEntry,
  type SwimEventItem,
  type SwimMeet,
} from '../../../lib/data/swimming';
import { formatDateLong } from '../../../lib/format';
import { BackLink } from '../../../components/BackLink';
import { ReportButton } from '../../../components/tournamentReport/ReportButton';
import { swimComp } from '../../../prizes/sports';
import { useAction, useFeedback } from '../../../components/feedback';
import { Badge, Button, Empty, LoadError, PageSkeleton, Tabs } from '../../../components/ui';
import { ScorersButton } from '../../../components/scorers/ScorersButton';
import { clubMap, meetTitle, useNames, useSwim } from './bits';
import { EntriesPanel } from './EntriesPanel';
import { HeatSheetPanel } from './HeatSheetPanel';
import { STAGE_LABEL, meetStage, pendingHeats, scores } from './logic';
import { MeetFormModal } from './MeetFormModal';
import { MeetPrizes } from './MeetPrizes';
import { ProgramPanel } from './ProgramPanel';
import { ResultsPanel, ScoresPanel } from './ResultsPanel';
import { TimingPanel } from './TimingPanel';

/** Lo que comparten las pestañas del encuentro. */
export interface MeetData {
  lid: string;
  meet: SwimMeet;
  events: SwimEventItem[];
  entries: SwimEntry[];
  clubs: Map<string, SwimClub>;
  clubList: SwimClub[];
  name: (playerId: string) => string;
}

type TabKey = 'programa' | 'inscritos' | 'series' | 'cronometro' | 'resultados' | 'puntos';

/**
 * Un encuentro de natación: programa de pruebas, inscritos, hoja de series, cronometraje por serie (admin y
 * cronometristas), resultados por prueba y categoría, y puntos por club con el medallero.
 */
export default function MeetPage({ meetId: fixed }: { meetId?: string }) {
  const params = useParams();
  const meetId = fixed ?? params.eventId;
  const { lid, base, isAdmin, isTimer, league, clubs } = useSwim();
  const navigate = useNavigate();
  const run = useAction();
  const { confirm } = useFeedback();
  const [search, setSearch] = useSearchParams();
  const meets = useSwimMeets(lid);
  const events = useSwimEvents(lid, meetId);
  const entries = useSwimEntries(lid, meetId);
  const { name, players } = useNames(lid);
  const rules = useSwimRules(lid).data;
  const [editing, setEditing] = useState(false);
  const clubById = useMemo(() => clubMap(clubs.data), [clubs.data]);

  const meet = meets.data.find((m) => m.id === meetId) ?? null;
  const error = meets.error ?? events.error ?? entries.error ?? players.error;
  if (error) return <LoadError error={error} />;
  if (meets.loading || (meet && events.loading)) return <PageSkeleton />;
  if (!meet) {
    return (
      <Empty title="Este encuentro no existe">
        <Link to={base} className="text-accent">
          Volver
        </Link>
      </Empty>
    );
  }

  const data: MeetData = { lid, meet, events: events.data, entries: entries.data, clubs: clubById, clubList: clubs.data, name };
  const stage = meetStage(meet, events.data.length);
  const published = !!meet.heatsPublishedAt;
  const hasResults = entries.data.some((e) => e.resultAt != null);
  const toTime = published && events.data.some((ev) => pendingHeats(ev, entries.data).length > 0);

  const tabs: { key: TabKey; label: string; icon: ReactNode }[] = [
    { key: 'programa', label: 'Programa', icon: <ListChecks className="size-4" /> },
    { key: 'inscritos', label: 'Inscritos', icon: <Users className="size-4" /> },
    ...(published || isAdmin ? [{ key: 'series' as const, label: 'Series', icon: <Rows3 className="size-4" /> }] : []),
    ...(isTimer && published && !meet.finalizedAt ? [{ key: 'cronometro' as const, label: 'Cronometrar', icon: <Timer className="size-4" /> }] : []),
    { key: 'resultados', label: 'Resultados', icon: <ListOrdered className="size-4" /> },
    ...(scores(meet) ? [{ key: 'puntos' as const, label: 'Puntos', icon: <Medal className="size-4" /> }] : []),
  ];
  const fallback: TabKey = isTimer && toTime && !meet.finalizedAt ? 'cronometro' : hasResults ? 'resultados' : published ? 'series' : 'programa';
  const requested = search.get('ver') as TabKey | null;
  const tab: TabKey = requested && tabs.some((t) => t.key === requested) ? requested : fallback;
  const setTab = (k: TabKey) =>
    setSearch(
      (p) => {
        const next = new URLSearchParams(p);
        next.set('ver', k);
        return next;
      },
      { replace: true },
    );

  const standalone = league.kind === 'torneo';

  const remove = async () => {
    if (!(await confirm({ title: '¿Borrar el encuentro?', message: 'Se borran sus pruebas, inscritos, series y resultados. No se puede deshacer.', confirmText: 'Borrar', danger: true }))) return;
    const ok = await run(() => deleteMeet(lid, meet.id).then(() => true), 'Encuentro borrado');
    if (ok) navigate(base, { replace: true });
  };
  const toggleFinal = async () => {
    const closing = !meet.finalizedAt;
    if (
      closing &&
      !(await confirm({
        title: '¿Finalizar el encuentro?',
        message: 'Los resultados quedan cerrados y cuentan para la tabla de la temporada. Un admin lo puede volver a abrir.',
        confirmText: 'Finalizar',
      }))
    )
      return;
    await run(() => finalizeMeet(lid, meet.id, closing), closing ? 'Encuentro finalizado' : 'Encuentro abierto otra vez');
  };
  // Reporte del encuentro (PDF o Excel), para todos: se arma al tocar, con los resultados y los puntos de la app.
  const report = {
    report: () => import('../../../lib/report/swimming').then((m) => m.swimReport({ lid, league, title: meetTitle(meet), data })),
    comp: swimComp(lid, meet),
    disabled: entries.loading || players.loading,
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-2">
        {!standalone && <BackLink fallback={base} className="-ml-1.5 mt-0.5" />}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight">{meetTitle(meet)}</h1>
          <p className="text-sm text-muted first-letter:uppercase">
            {formatDateLong(meet.date)}
            {meet.startTime ? ` · ${meet.startTime}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={stage === 'final' ? 'ok' : stage === 'series' ? 'accent' : 'neutral'}>
              {meet.finalizedAt ? <Lock className="size-3" /> : null}
              {STAGE_LABEL[stage]}
            </Badge>
            <Badge>
              <Waves className="size-3" /> Piscina {meet.pool} m · {meet.lanes} carriles
            </Badge>
            {meet.type === 'control' && <Badge tone="warn">Control de marcas</Badge>}
            {events.data.length > 0 && <Badge>{events.data.length} pruebas</Badge>}
          </div>
        </div>
        <ReportButton {...report} />
      </div>

      {meet.announcement && (
        <div className="rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm whitespace-pre-line">{meet.announcement}</div>
      )}

      {isAdmin && (
        <div className="-mt-1 flex flex-wrap gap-2">
          {!meet.finalizedAt && (
            <Button size="sm" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
              Cambiar
            </Button>
          )}
          <Button size="sm" icon={meet.finalizedAt ? <LockOpen className="size-4" /> : <Trophy className="size-4" />} onClick={toggleFinal}>
            {meet.finalizedAt ? 'Volver a abrir' : 'Finalizar'}
          </Button>
          {/* Cronometristas: los anotadores de la liga toman los tiempos y publican las series. */}
          <ScorersButton
            labeled
            target={{ scope: 'evento', refId: meet.id, title: meet.name || (standalone ? league.name : meetTitle(meet)) }}
            participants={entries.data.map((e) => e.playerId)}
          />
          {!standalone && (
            <Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="size-4" />} onClick={remove}>
              Borrar
            </Button>
          )}
        </div>
      )}

      {/* Finalizado el encuentro, el admin tiene el reporte a la mano (para todos está el botón de arriba). */}
      {isAdmin && !!meet.finalizedAt && <ReportButton {...report} look="card" />}

      <MeetPrizes data={data} />

      <Tabs items={tabs} active={tab} onChange={setTab} />

      <div key={tab} className="animate-fade-up">
        {tab === 'programa' && <ProgramPanel data={data} />}
        {tab === 'inscritos' && <EntriesPanel data={data} />}
        {tab === 'series' && <HeatSheetPanel data={data} />}
        {tab === 'cronometro' && <TimingPanel data={data} />}
        {tab === 'resultados' && <ResultsPanel data={data} />}
        {tab === 'puntos' && <ScoresPanel data={data} />}
      </div>

      <MeetFormModal open={editing} onClose={() => setEditing(false)} lid={lid} meet={meet} defaults={rules} />
    </div>
  );
}
