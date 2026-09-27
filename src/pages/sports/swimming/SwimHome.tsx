import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CalendarDays, ChevronRight, Clock, Medal, Plus, Timer, Trophy, Waves } from 'lucide-react';
import { useSwimHistory, useSwimMeets, useSwimRules, type SwimMeet } from '../../../lib/data/swimming';
import { formatDate, formatDateLong, toIsoDate } from '../../../lib/format';
import { useNow } from '../../../lib/useNow';
import { personalBests, STROKE_LABEL, type PersonalBest } from '../../../sports/swimming';
import { Badge, Button, Card, Empty, ListSkeleton, LoadError, PageSkeleton, Tabs, cx } from '../../../components/ui';
import { PageHead, TimeText, meetTitle, useSwim } from './bits';
import { STAGE_LABEL, meetStage } from './logic';
import { MeetFormModal } from './MeetFormModal';
import MeetPage from './MeetPage';

/** Inicio de la liga de natación: encuentros (próximos y anteriores) y, para quien nada, sus marcas. */
export default function SwimHome() {
  const { league } = useSwim();
  // Torneo sin liga: el encuentro es la portada.
  return league.kind === 'torneo' ? <SingleMeet /> : <MeetsCalendar />;
}

function SingleMeet() {
  const { lid } = useSwim();
  const meets = useSwimMeets(lid);
  if (meets.error) return <LoadError error={meets.error} />;
  if (meets.loading) return <PageSkeleton />;
  const m = meets.data[0];
  if (!m) return <Empty icon={<Trophy className="size-8" />} title="Este torneo no tiene encuentro">Un admin puede borrarlo y crearlo otra vez.</Empty>;
  return <MeetPage meetId={m.id} />;
}

function MeetsCalendar() {
  const { lid, base, isAdmin, myPlayerId, league } = useSwim();
  const navigate = useNavigate();
  const meets = useSwimMeets(lid);
  const rules = useSwimRules(lid).data;
  const now = useNow();
  const today = toIsoDate(now);
  const [creating, setCreating] = useState(false);
  const upcoming = meets.data.filter((m) => m.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = meets.data.filter((m) => m.date < today);
  const [tab, setTab] = useState<'proximos' | 'anteriores'>('proximos');
  const next = upcoming[0];
  const shown = tab === 'proximos' ? upcoming : past;

  return (
    <div className="flex flex-col gap-5">
      <PageHead icon={<Waves className="size-5" />} title="Encuentros" sub={league.venue || 'Encuentros de club y controles de marcas'}>
        {isAdmin && (
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            <span className="hidden sm:inline">Nuevo encuentro</span>
            <span className="sm:hidden">Nuevo</span>
          </Button>
        )}
      </PageHead>

      {next && <NextMeetCard meet={next} today={today} />}

      {myPlayerId && <MyBestsCard playerId={myPlayerId} />}

      <Tabs
        items={[
          { key: 'proximos', label: 'Próximos', icon: <CalendarDays className="size-4" />, count: upcoming.length },
          { key: 'anteriores', label: 'Anteriores', icon: <Clock className="size-4" /> },
        ]}
        active={tab}
        onChange={setTab}
      />

      {meets.error ? (
        <LoadError error={meets.error} />
      ) : meets.loading ? (
        <ListSkeleton rows={4} />
      ) : !shown.length ? (
        <Empty icon={<Waves className="size-8" />} title={tab === 'proximos' ? 'No hay encuentros por venir' : 'Todavía no hay encuentros anteriores'}>
          {isAdmin && tab === 'proximos' ? 'Crea el primero con «Nuevo encuentro»: puedes empezar con las pruebas de un encuentro de club.' : null}
        </Empty>
      ) : (
        <Card className="stagger divide-y divide-line overflow-hidden">
          {shown.map((m) => (
            <MeetRow key={m.id} meet={m} to={`${base}/e/${m.id}`} />
          ))}
        </Card>
      )}

      <MeetFormModal
        open={creating}
        onClose={() => setCreating(false)}
        lid={lid}
        defaults={rules}
        onCreated={(id) => navigate(`${base}/e/${id}`)}
      />
    </div>
  );
}

function StageBadge({ meet }: { meet: SwimMeet }) {
  const stage = meetStage(meet, 1);
  return <Badge tone={stage === 'final' ? 'ok' : stage === 'series' ? 'accent' : 'neutral'}>{STAGE_LABEL[stage]}</Badge>;
}

function MeetRow({ meet, to }: { meet: SwimMeet; to: string }) {
  const d = meet.date.split('-');
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
      <div className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-surface-2 py-1.5 leading-none">
        <span className="text-lg font-bold tabular-nums">{Number(d[2])}</span>
        <span className="text-[11px] uppercase text-muted">{formatDate(meet.date).split(' ')[1]?.replace('.', '')}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{meetTitle(meet)}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <StageBadge meet={meet} />
          <span className="text-xs text-muted">Piscina {meet.pool} m</span>
          {meet.startTime && <span className="text-xs text-muted">· {meet.startTime}</span>}
        </div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted" />
    </Link>
  );
}

function NextMeetCard({ meet, today }: { meet: SwimMeet; today: string }) {
  const { base, isTimer } = useSwim();
  const isToday = meet.date === today;
  return (
    <Card className="overflow-hidden">
      <Link to={`${base}/e/${meet.id}`} className="flex items-center gap-4 p-4 transition hover:bg-surface-2">
        <div className={cx('flex size-12 shrink-0 items-center justify-center rounded-2xl', isToday ? 'bg-accent text-accent-fg' : 'bg-accent-soft text-accent')}>
          {isToday && isTimer ? <Timer className="size-6" /> : <Waves className="size-6" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-accent">{isToday ? 'Hoy' : 'Próximo encuentro'}</p>
          <p className="truncate text-lg font-semibold">{meetTitle(meet)}</p>
          <p className="text-sm text-muted first-letter:uppercase">
            {formatDateLong(meet.date)}
            {meet.startTime ? ` · ${meet.startTime}` : ''}
          </p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted" />
      </Link>
      {meet.announcement && <p className="border-t border-line px-4 py-3 text-sm whitespace-pre-line">{meet.announcement}</p>}
    </Card>
  );
}

/** Las mejores marcas de quien nada (con cuenta): las 4 más recientes. */
function MyBestsCard({ playerId }: { playerId: string }) {
  const { lid, base } = useSwim();
  const history = useSwimHistory(lid, playerId);
  const bests = useMemo(() => personalBests(history.data).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4), [history.data]);
  if (!bests.length) return null;
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Medal className="size-4 text-accent" /> Mis marcas
        </h2>
        <Link to={`${base}/perfil`} className="text-sm font-medium text-accent">
          Ver todas
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {bests.map((b) => (
          <BestTile key={b.key} best={b} />
        ))}
      </div>
    </Card>
  );
}

export function BestTile({ best, onClick, active }: { best: PersonalBest; onClick?: () => void; active?: boolean }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      className={cx('flex flex-col items-start rounded-xl bg-surface-2 px-3 py-2 text-left', onClick && 'transition active:scale-[0.98]', active && 'ring-2 ring-accent')}
    >
      <span className="text-xs text-muted">
        {best.distance} m {STROKE_LABEL[best.stroke]} · {best.pool} m
      </span>
      <TimeText cs={best.best} className="text-lg font-bold" />
      <span className="text-[11px] text-muted">{formatDate(best.date)}</span>
    </Comp>
  );
}
