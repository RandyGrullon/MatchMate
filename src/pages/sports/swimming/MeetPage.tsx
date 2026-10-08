import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ClipboardPen, FileDown, ListChecks, Lock, LockOpen, Medal, Megaphone, Pencil, Timer, Trash2, Trophy } from 'lucide-react';
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
import { toIsoDate } from '../../../lib/format';
import { formatTime } from '../../../lib/schedule';
import { useNow } from '../../../lib/useNow';
import { ReportButton } from '../../../components/tournamentReport/ReportButton';
import { swimComp } from '../../../prizes/sports';
import { useBusy } from '../../../components/busy';
import { EventMenu, EventTopBar, MoreButton, eventDay, type MenuItem } from '../../../components/event/EventHeader';
import { useAction, useFeedback } from '../../../components/feedback';
import { useIsPro } from '../../../components/mode';
import { Card, Empty, LoadError, PageSkeleton, Segmented, Sheet, Tabs, cx } from '../../../components/ui';
import { MenuSheets, ProLine, useMenuSheet } from '../FieldChrome';
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

const TAB_LABEL: Record<TabKey, string> = {
  programa: 'Programa',
  inscritos: 'Inscritos',
  series: 'Series',
  cronometro: 'Cronometrar',
  resultados: 'Resultados',
  puntos: 'Puntos',
};

/**
 * Un encuentro de natación (rediseño «Calma y foco», con la forma de la práctica del boliche): «‹ Club Acuático» y «•••»
 * arriba, el título grande y una línea con en qué va, el día, la hora y la piscina; el anuncio, si hay.
 * - Lite: un segmentado Pruebas (inscribirse en cada prueba) · Series · Resultados; los puntos por club van en «•••».
 * - Pro: todas las partes (Programa, Inscritos, Series, Cronometrar para el admin y los cronometristas, Resultados y
 *   Puntos), con las herramientas del organizador (armar el programa y las series, publicar).
 * - «•••»: el reporte y, para el admin, Cambiar el encuentro, Cronometristas, Finalizar o abrir y Borrar (nunca al final
 *   de la pantalla). En Lite, quien organiza o cronometra abre ahí lo de Pro (un link de Pro, `?ver=`, se abre igual,
 *   con «Esto es de Pro · Usar Pro»).
 */
export default function MeetPage({ meetId: fixed }: { meetId?: string }) {
  const params = useParams();
  const meetId = fixed ?? params.eventId;
  const { lid, base, isAdmin, isTimer, league, clubs } = useSwim();
  const navigate = useNavigate();
  const run = useAction();
  const { confirm } = useFeedback();
  const isPro = useIsPro();
  const busy = useBusy<'final' | 'borrar'>();
  const sheet = useMenuSheet();
  const [search, setSearch] = useSearchParams();
  const meets = useSwimMeets(lid);
  const events = useSwimEvents(lid, meetId);
  const entries = useSwimEntries(lid, meetId);
  const { name, players } = useNames(lid);
  const rules = useSwimRules(lid).data;
  const today = toIsoDate(useNow());
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [pointsOpen, setPointsOpen] = useState(false);
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
  const timing = isTimer && published && !meet.finalizedAt;
  const embedded = !!fixed;
  const standalone = league.kind === 'torneo';

  const proKeys: TabKey[] = [
    'programa',
    'inscritos',
    ...(published || isAdmin ? ['series' as const] : []),
    ...(timing ? ['cronometro' as const] : []),
    'resultados',
    ...(scores(meet) ? ['puntos' as const] : []),
  ];
  // Lite: lo del nadador (inscribirse, su serie y carril, los resultados).
  const liteTabs: { key: TabKey; label: string }[] = [
    { key: 'inscritos', label: 'Pruebas' },
    ...(published ? [{ key: 'series' as const, label: 'Series' }] : []),
    { key: 'resultados', label: 'Resultados' },
  ];
  const requested = search.get('ver') as TabKey | null;
  // Pro, o un link de Pro (cronometrar, el programa) para quien organiza o cronometra: lo de Pro se abre igual.
  const pro = isPro || (isTimer && !!requested && proKeys.includes(requested) && !liteTabs.some((t) => t.key === requested));
  const tabs = pro ? proKeys.map((key) => ({ key, label: TAB_LABEL[key] })) : liteTabs;
  const fallback: TabKey = pro && isTimer && toTime && !meet.finalizedAt ? 'cronometro' : hasResults ? 'resultados' : published ? 'series' : pro ? 'programa' : 'inscritos';
  const tab: TabKey = requested && tabs.some((t) => t.key === requested) ? requested : tabs.some((t) => t.key === fallback) ? fallback : tabs[0].key;
  const setTab = (k: TabKey) =>
    setSearch(
      (p) => {
        const next = new URLSearchParams(p);
        next.set('ver', k);
        return next;
      },
      { replace: true },
    );

  const remove = async () => {
    if (!(await confirm({ title: '¿Borrar el encuentro?', message: 'Se borran sus pruebas, inscritos, series y resultados. No se puede deshacer.', confirmText: 'Borrar', danger: true }))) return;
    const ok = await busy.run('borrar', () => run(() => deleteMeet(lid, meet.id).then(() => true), 'Encuentro borrado'));
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
    await busy.run('final', () => run(() => finalizeMeet(lid, meet.id, closing), closing ? 'Encuentro finalizado' : 'Encuentro abierto otra vez'));
  };
  // Reporte del encuentro (PDF o Excel), para todos: se arma al tocar, con los resultados y los puntos de la app.
  const report = {
    report: () => import('../../../lib/report/swimming').then((m) => m.swimReport({ lid, league, title: meetTitle(meet), data })),
    comp: swimComp(lid, meet),
    disabled: entries.loading || players.loading,
  };

  const closeMenu = () => setMenu(false);
  const open = (k: TabKey) => {
    closeMenu();
    setTab(k);
  };
  const menuItems: MenuItem[] = [
    {
      key: 'reporte',
      icon: FileDown,
      label: 'Reporte del encuentro',
      hint: 'PDF para WhatsApp o imprimir, o Excel',
      onClick: () => sheet.show('reporte', closeMenu),
      busy: sheet.isBusy('reporte'),
    },
    ...(!pro && scores(meet)
      ? [
          {
            key: 'puntos',
            icon: Medal,
            label: 'Puntos por club',
            hint: 'Y el medallero',
            onClick: () => {
              closeMenu();
              setPointsOpen(true);
            },
          },
        ]
      : []),
    ...(!pro && timing ? [{ key: 'crono', icon: Timer, label: 'Cronometrar', hint: 'Tomar los tiempos de cada serie', onClick: () => open('cronometro') }] : []),
    ...(!pro && isAdmin ? [{ key: 'programa', icon: ListChecks, label: 'Programa y series', hint: 'Armar las pruebas y publicar las series', onClick: () => open('programa') }] : []),
    ...(isAdmin
      ? [
          ...(!meet.finalizedAt
            ? [
                {
                  key: 'cambiar',
                  icon: Pencil,
                  label: 'Cambiar el encuentro',
                  hint: 'Nombre, fecha, piscina y puntos',
                  onClick: () => {
                    closeMenu();
                    setEditing(true);
                  },
                },
              ]
            : []),
          {
            // Cronometristas: los anotadores de la liga toman los tiempos y publican las series.
            key: 'anotadores',
            icon: ClipboardPen,
            label: 'Cronometristas',
            hint: 'Quién toma los tiempos',
            onClick: () => sheet.show('anotadores', closeMenu),
            busy: sheet.isBusy('anotadores'),
          },
          {
            key: 'final',
            icon: meet.finalizedAt ? LockOpen : Trophy,
            label: meet.finalizedAt ? 'Volver a abrir' : 'Finalizar el encuentro',
            hint: meet.finalizedAt ? 'Para corregir resultados' : 'Cierra los resultados de la temporada',
            onClick: () => void toggleFinal().then(closeMenu),
            busy: busy.isBusy('final'),
          },
          ...(!standalone ? [{ key: 'borrar', icon: Trash2, label: 'Borrar encuentro', onClick: () => void remove().then(closeMenu), danger: true, busy: busy.isBusy('borrar') }] : []),
        ]
      : []),
  ];

  const status = meet.finalizedAt ? (
    <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-fg-2">
      <Lock aria-hidden="true" className="size-3.5" />
      {STAGE_LABEL[stage]}
    </span>
  ) : (
    <span className="shrink-0 font-semibold text-accent">{STAGE_LABEL[stage]}</span>
  );
  const meta = [
    eventDay(meet.date, today, isPro),
    meet.startTime ? formatTime(meet.startTime.slice(0, 5)) : null,
    `Piscina ${meet.pool} m`,
    isPro ? `${meet.lanes} carriles` : null,
    meet.type === 'control' ? 'Control de marcas' : null,
    isPro && events.data.length ? `${events.data.length} pruebas` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const metaLine = (
    <p className={cx('flex min-w-0 flex-wrap items-center gap-x-1.5 text-meta text-muted', embedded ? 'flex-1' : isPro ? 'mt-1' : 'mt-1.5')}>
      {status}
      <span aria-hidden="true">·</span>
      <span className="min-w-0">{meta}</span>
    </p>
  );
  const more = <MoreButton onClick={() => setMenu(true)} />;

  return (
    <div className={cx('flex flex-col', !embedded && 'px-2')}>
      {embedded ? (
        <div className="flex items-start gap-3">
          {metaLine}
          {more}
        </div>
      ) : (
        <>
          <EventTopBar back={standalone ? null : { label: league.name, fallback: base }} right={more} />
          <h1 className={isPro ? 'mt-0.5 text-title-pro' : 'mt-1 text-title'}>{meetTitle(meet)}</h1>
          {metaLine}
        </>
      )}

      {meet.announcement && (
        <Card soft className="mt-[22px] flex gap-3 p-4 text-sm">
          <Megaphone aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
          <p className="min-w-0 whitespace-pre-line">{meet.announcement}</p>
        </Card>
      )}

      {pro && !isPro && <ProLine className="mt-[22px]" />}

      <div className={meet.announcement || (pro && !isPro) ? 'mt-3.5' : 'mt-[22px]'}>
        {tabs.length <= 3 ? (
          <Segmented full label="Partes del encuentro" options={tabs} value={tab} onChange={setTab} />
        ) : (
          <Tabs items={tabs} active={tab} onChange={setTab} />
        )}
      </div>

      <div key={tab} className="animate-fade-up mt-4">
        {tab === 'programa' && <ProgramPanel data={data} />}
        {tab === 'inscritos' && <EntriesPanel data={data} />}
        {tab === 'series' && <HeatSheetPanel data={data} manage={pro} />}
        {tab === 'cronometro' && <TimingPanel data={data} />}
        {tab === 'resultados' && <ResultsPanel data={data} />}
        {tab === 'puntos' && <ScoresPanel data={data} />}
      </div>

      {/* Lo del torneo, en los dos modos: el reporte a la mano del admin al finalizar (para todos está en «•••») y los premios. */}
      <div className="mt-[30px] flex flex-col gap-4 empty:hidden">
        {isAdmin && !!meet.finalizedAt && <ReportButton {...report} look="card" />}
        <MeetPrizes data={data} />
      </div>

      <EventMenu open={menu} onClose={closeMenu} title={meetTitle(meet)} items={menuItems} />
      <Sheet open={pointsOpen} onClose={() => setPointsOpen(false)} title="Puntos por club" subtitle={meetTitle(meet)}>
        {pointsOpen && <ScoresPanel data={data} />}
      </Sheet>
      <MenuSheets
        open={sheet.open}
        onClose={sheet.close}
        scorers={isAdmin ? { target: { scope: 'evento', refId: meet.id, title: meet.name || (standalone ? league.name : meetTitle(meet)) }, participants: entries.data.map((e) => e.playerId) } : null}
        report={report}
      />
      <MeetFormModal open={editing} onClose={() => setEditing(false)} lid={lid} meet={meet} defaults={rules} />
    </div>
  );
}
