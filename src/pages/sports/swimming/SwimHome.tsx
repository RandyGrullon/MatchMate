import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronRight, Megaphone, Plus, Timer, Trophy, Waves } from 'lucide-react';
import { useSwimHistory, useSwimMeets, useSwimRules, type SwimMeet } from '../../../lib/data/swimming';
import { formatDate, toIsoDate } from '../../../lib/format';
import { formatTime } from '../../../lib/schedule';
import { useNow } from '../../../lib/useNow';
import { personalBests, STROKE_LABEL, type PersonalBest } from '../../../sports/swimming';
import { eventDay } from '../../../components/event/EventHeader';
import { weekdayLabel } from '../../../components/home/logic';
import { ActionLink, LiveDot } from '../../../components/home/TodayCard';
import { Button, Card, DateBlock, ListRow, ListSkeleton, LoadError, PageSkeleton, SectionHeader, cx } from '../../../components/ui';
import { EmptyCard, SectionAdd, SectionLink, ShowMore } from '../FieldChrome';
import { TimeText, meetTitle, useSwim } from './bits';
import { STAGE_LABEL, meetStage } from './logic';
import { MeetFormModal } from './MeetFormModal';
import MeetPage from './MeetPage';

/**
 * Inicio de la liga de natación (rediseño «Calma y foco», con la forma de la liga del boliche; el ícono, el nombre y las
 * filas de abajo los pone LeagueHomeFrame): el próximo encuentro una sola vez (hoy: con «Cronometrar» para quien toma los
 * tiempos), tus marcas, «Próximos encuentros» con su fecha («OCT / 24») y «+ Nuevo» para el admin, y los anteriores.
 */
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
  if (!m) return <EmptyCard icon={<Trophy className="size-5" />} title="Este torneo no tiene encuentro" text="Un admin puede borrarlo y crearlo otra vez." />;
  return <MeetPage meetId={m.id} />;
}

function MeetsCalendar() {
  const { lid, base, isAdmin, myPlayerId } = useSwim();
  const navigate = useNavigate();
  const meets = useSwimMeets(lid);
  const rules = useSwimRules(lid).data;
  const today = toIsoDate(useNow());
  const [creating, setCreating] = useState(false);
  const upcoming = meets.data.filter((m) => m.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = meets.data.filter((m) => m.date < today).sort((a, b) => b.date.localeCompare(a.date));
  const next = upcoming[0];
  const rest = upcoming.slice(1);

  return (
    <div className="flex flex-col gap-[30px]">
      {next && <NextMeetCard meet={next} today={today} />}

      {myPlayerId && <MyBestsCard playerId={myPlayerId} />}

      <section aria-labelledby="natacion-proximos">
        <SectionHeader id="natacion-proximos" title="Próximos encuentros" action={isAdmin && next ? <SectionAdd onClick={() => setCreating(true)} /> : undefined} />
        {meets.error ? (
          <LoadError error={meets.error} />
        ) : meets.loading && !meets.data.length ? (
          <ListSkeleton rows={3} />
        ) : rest.length ? (
          <MeetList meets={rest} today={today} />
        ) : next ? (
          <p className="mx-1 text-meta text-muted">No hay más encuentros por ahora.</p>
        ) : (
          <EmptyCard
            icon={<Waves className="size-5" />}
            title="No hay encuentros por venir"
            text={isAdmin ? 'Crea el primero: puedes empezar con las pruebas de un encuentro de club.' : 'Cuando el organizador cree el próximo, sale aquí.'}
            action={
              isAdmin && (
                <Button variant="primary" size="lg" icon={<Plus className="size-5" />} onClick={() => setCreating(true)}>
                  Nuevo encuentro
                </Button>
              )
            }
          />
        )}
      </section>

      {past.length > 0 && (
        <section aria-labelledby="natacion-anteriores">
          <SectionHeader id="natacion-anteriores" title="Anteriores" />
          <ShowMore items={past} noun="encuentros" render={(shown) => <MeetList meets={shown} today={today} />} />
        </section>
      )}

      <MeetFormModal open={creating} onClose={() => setCreating(false)} lid={lid} defaults={rules} onCreated={(id) => navigate(`${base}/e/${id}`)} />
    </div>
  );
}

/** Los encuentros como filas con su fecha («OCT / 24»): cuándo, la piscina y en qué va (inscripciones, series, final). */
function MeetList({ meets, today }: { meets: readonly SwimMeet[]; today: string }) {
  const { base } = useSwim();
  return (
    <Card className="overflow-hidden">
      {meets.map((m) => {
        const ahead = m.date >= today;
        const line = [
          ahead ? weekdayLabel(m.date, today) : null,
          ahead && m.startTime ? formatTime(m.startTime.slice(0, 5)) : null,
          m.type === 'control' ? 'Control de marcas' : `Piscina ${m.pool} m`,
          STAGE_LABEL[meetStage(m, 1)],
        ]
          .filter(Boolean)
          .join(' · ');
        return <ListRow key={m.id} leading={<DateBlock date={m.date} />} title={meetTitle(m)} subtitle={line} to={`${base}/e/${m.id}`} />;
      })}
    </Card>
  );
}

/**
 * El próximo encuentro, una sola vez: «Hoy · 8:00 am» (o «Próximo encuentro»), el nombre (abre el encuentro), cuándo y en
 * qué va, el anuncio y, el día del encuentro, UN botón para quien toma los tiempos: «Cronometrar».
 */
function NextMeetCard({ meet, today }: { meet: SwimMeet; today: string }) {
  const { base, isTimer } = useSwim();
  const isToday = meet.date === today;
  const time = meet.startTime ? formatTime(meet.startTime.slice(0, 5)) : '';
  const when = isToday ? (time ? `Hoy · ${time}` : 'Hoy') : 'Próximo encuentro';
  const line = [
    isToday ? null : eventDay(meet.date, today),
    isToday ? null : time || null,
    meet.type === 'control' ? 'Control de marcas' : `Piscina ${meet.pool} m`,
    STAGE_LABEL[meetStage(meet, 1)],
  ]
    .filter(Boolean)
    .join(' · ');
  const timing = isToday && isTimer && !!meet.heatsPublishedAt && !meet.finalizedAt;
  return (
    <Card soft={isToday} className="pt-[18px] pr-[18px] pb-[18px] pl-5">
      <section aria-label={`${meetTitle(meet)}: ${when}`}>
        <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-accent">
          {isToday && <LiveDot />}
          <span className="truncate">{when}</span>
        </p>
        <Link
          to={`${base}/e/${meet.id}`}
          className="mt-2 block rounded-xl transition active:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="flex items-center justify-between gap-3">
            <b className="min-w-0 truncate text-[21px] leading-[1.4] font-bold tracking-[-0.02em]">{meetTitle(meet)}</b>
            <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-accent" />
          </span>
          <span className="mt-[3px] block text-[14.5px] leading-[1.4] text-fg-2 first-letter:uppercase">{line}</span>
        </Link>
        {meet.announcement && (
          <p className={cx('mt-3 flex gap-2.5 border-t pt-3 text-[14.5px] leading-[1.4] whitespace-pre-line text-fg-2', isToday ? 'border-accent/15' : 'border-line')}>
            <Megaphone aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
            <span className="min-w-0">{meet.announcement}</span>
          </p>
        )}
        {timing && (
          <ActionLink to={`${base}/e/${meet.id}?ver=cronometro`} icon={Timer} className="mt-4 w-full">
            Cronometrar
          </ActionLink>
        )}
      </section>
    </Card>
  );
}

/** Tus mejores marcas (de quien nada con cuenta): las 4 más recientes, con «Ver todas». */
function MyBestsCard({ playerId }: { playerId: string }) {
  const { lid, base } = useSwim();
  const history = useSwimHistory(lid, playerId);
  const bests = useMemo(() => personalBests(history.data).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4), [history.data]);
  if (!bests.length) return null;
  return (
    <section aria-labelledby="natacion-marcas">
      <SectionHeader id="natacion-marcas" title="Tus marcas" action={<SectionLink to={`${base}/perfil`}>Ver todas</SectionLink>} />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {bests.map((b) => (
          <BestTile key={b.key} best={b} raised />
        ))}
      </div>
    </section>
  );
}

/**
 * Una marca personal como ficha (como las de juego): la prueba y la piscina arriba (sin la piscina con `hidePool`, si ya
 * la dice la sección), el tiempo grande y el día. `raised`: sobre el fondo de la pantalla (blanca, con sombra); si no,
 * sobre una tarjeta (gris).
 */
export function BestTile({ best, onClick, active, raised, hidePool }: { best: PersonalBest; onClick?: () => void; active?: boolean; raised?: boolean; hidePool?: boolean }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      className={cx(
        'flex min-w-0 flex-col items-start rounded-tile px-3.5 py-3 text-left',
        active ? 'bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--accent)]' : raised ? 'card-shadow bg-surface' : 'bg-surface-2',
        onClick && 'transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-accent',
      )}
    >
      <span className={cx('max-w-full truncate text-[13px] font-[550]', active ? 'text-accent' : 'text-muted')}>
        {best.distance} m {STROKE_LABEL[best.stroke]}
        {hidePool ? '' : ` · ${best.pool} m`}
      </span>
      <TimeText cs={best.best} className="num mt-1.5 text-[24px] leading-none font-[650]" />
      <span className="mt-1.5 text-xs text-muted">{formatDate(best.date)}</span>
    </Comp>
  );
}
