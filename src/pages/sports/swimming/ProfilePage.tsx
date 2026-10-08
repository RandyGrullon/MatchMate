import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { ArrowDownRight, Medal, Plus, TrendingDown, Waves } from 'lucide-react';
import { useSwimHistory, useSwimmers } from '../../../lib/data/swimming';
import { formatDate } from '../../../lib/format';
import { personalBests, STROKE_LABEL, type PersonalBest } from '../../../sports/swimming';
import { EventTopBar } from '../../../components/event/EventHeader';
import { useIsPro } from '../../../components/mode';
import { Initials } from '../../../components/ranking/parts';
import { Badge, Card, DateBlock, ListRow, ListSkeleton, LoadError, SectionHeader } from '../../../components/ui';
import { EmptyCard, SectionAdd, ShowMore } from '../FieldChrome';
import { ClubTag, StatusBadge, TimeText, clubMap, useNames, useSwim } from './bits';
import { groupLabel, raceName } from './logic';
import { BestTile } from './SwimHome';
import { SwimmerFormModal } from './SwimmersAdmin';

const pct = (n: number) => `${n.toFixed(2).replace('.', ',')} %`;

/** Mis marcas: las del nadador de la cuenta y, si entrena un club, sus nadadores. */
export function SwimMyProfile() {
  const { myPlayerId, coachOf } = useSwim();
  return (
    <div className="flex flex-col gap-[30px] px-2">
      {myPlayerId ? (
        <SwimmerProfile playerId={myPlayerId} mine />
      ) : (
        !coachOf.size && (
          <div className="flex flex-col">
            <h1 className="mt-1 text-title">Mis marcas</h1>
            <EmptyCard
              className="mt-5"
              icon={<Waves className="size-5" />}
              title="Aquí salen tus marcas"
              text="Cuando nades en un encuentro de la liga, tus mejores tiempos por estilo, distancia y piscina salen aquí."
            />
          </div>
        )
      )}
      {[...coachOf].map((clubId) => (
        <CoachClub key={clubId} clubId={clubId} />
      ))}
    </div>
  );
}

/** Perfil de un nadador (/j/:playerId): «‹ Club Acuático» vuelve a donde estabas. */
export function SwimPlayer() {
  const { playerId } = useParams();
  const { base, league } = useSwim();
  return (
    <div className="flex flex-col px-2">
      <EventTopBar back={{ label: league.name, fallback: base }} right={null} />
      {playerId && <SwimmerProfile playerId={playerId} />}
    </div>
  );
}

/**
 * Las marcas de un nadador (rediseño «Calma y foco», como Yo): el título con su club y categoría, sus marcas personales
 * por piscina como fichas (tocar una muestra cómo fue bajando) y lo que ha nadado (Lite: lo último, con «Ver todo»;
 * Pro: todo).
 */
function SwimmerProfile({ playerId, mine }: { playerId: string; mine?: boolean }) {
  const { lid, base, clubs } = useSwim();
  const pro = useIsPro();
  const { name, players } = useNames(lid);
  const swimmers = useSwimmers(lid);
  const history = useSwimHistory(lid, playerId);
  const info = swimmers.data.find((s) => s.playerId === playerId);
  const club = info?.clubId ? clubMap(clubs.data).get(info.clubId) : null;
  const bests = useMemo(() => personalBests(history.data), [history.data]);
  const [open, setOpen] = useState<string | null>(null);
  const selected = bests.find((b) => b.key === open) ?? null;
  const swims = useMemo(() => [...history.data].reverse(), [history.data]);
  const pools = ([25, 50] as const).filter((p) => bests.some((b) => b.pool === p));
  const exists = players.data.some((p) => p.id === playerId);

  if (history.error) return <LoadError error={history.error} />;
  if (!players.loading && !exists) return <EmptyCard className="mt-2" title="Este nadador ya no está en la liga" />;

  const swimRows = (list: typeof swims) => (
    <Card className="overflow-hidden">
      {list.map((s) => (
        <ListRow
          key={s.entryId}
          dense
          to={`${base}/e/${s.meetId}?ver=resultados`}
          leading={<DateBlock date={s.date} />}
          title={`${raceName(s)} · ${s.pool} m`}
          subtitle={[s.meetName || (s.meetType === 'control' ? 'Control de marcas' : 'Encuentro'), pro && s.ageGroup ? groupLabel(s.ageGroup) : null].filter(Boolean).join(' · ')}
          trailing={
            <span className="flex items-center gap-2">
              <StatusBadge status={s.status} />
              <TimeText cs={s.time} empty="" className="num text-row-num-pro" />
            </span>
          }
          chevron={false}
        />
      ))}
    </Card>
  );

  return (
    <div className="flex flex-col">
      <h1 className={pro ? 'mt-0.5 truncate text-title-pro' : 'mt-1 truncate text-title'}>{mine ? 'Mis marcas' : name(playerId)}</h1>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted">
        {mine && <span>{name(playerId)}</span>}
        <ClubTag club={club} className="text-meta" />
        {info?.category && <Badge>{groupLabel(info.category)}</Badge>}
      </div>

      {history.loading ? (
        <div className="mt-5">
          <ListSkeleton rows={3} />
        </div>
      ) : !bests.length ? (
        <EmptyCard className="mt-5" icon={<Medal className="size-5" />} title="Todavía sin marcas" text="Salen de los tiempos válidos de los encuentros (DQ, DNS y DNF no cuentan)." />
      ) : (
        <>
          {pools.map((pool) => (
            <section key={pool} aria-labelledby={`piscina-${pool}`} className="mt-[26px]">
              <SectionHeader id={`piscina-${pool}`} title={`Piscina de ${pool} m`} />
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {bests
                  .filter((b) => b.pool === pool)
                  .map((b) => (
                    <BestTile key={b.key} best={b} raised hidePool active={open === b.key} onClick={() => setOpen(open === b.key ? null : b.key)} />
                  ))}
              </div>
            </section>
          ))}
          {selected ? (
            <Progression best={selected} className="mt-3.5" />
          ) : (
            <p className="mx-1 mt-3 text-[13px] text-muted">Toca una marca para ver cómo fue bajando.</p>
          )}
        </>
      )}

      {swims.length > 0 && (
        <section aria-labelledby="lo-nadado" className="mt-[30px]">
          <SectionHeader id="lo-nadado" title={mine ? 'Lo que has nadado' : 'Lo que ha nadado'} />
          {pro ? swimRows(swims) : <ShowMore items={swims} max={5} noun="pruebas" render={(shown) => swimRows([...shown])} />}
        </section>
      )}
    </div>
  );
}

function Progression({ best, className }: { best: PersonalBest; className?: string }) {
  return (
    <Card className={className ? `overflow-hidden ${className}` : 'overflow-hidden'}>
      <div className="flex items-start gap-3 px-5 pt-4 pb-3">
        <TrendingDown aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ok" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {best.distance} m {STROKE_LABEL[best.stroke]} · piscina {best.pool} m
          </p>
          <p className="text-sm text-muted">
            {best.swims === 1 ? 'Nadada 1 vez' : `Nadada ${best.swims} veces`}
            {best.improvementPct > 0 ? ` · bajó ${pct(best.improvementPct)} desde su primer tiempo` : ''}
          </p>
        </div>
      </div>
      <div>
        {[...best.progression].reverse().map((p, k) => (
          <div key={`${p.date}-${p.time}`} className="mm-row relative flex min-h-12 items-center gap-3 py-2 pr-5 pl-5">
            <span className="w-24 shrink-0 text-sm text-muted">{formatDate(p.date)}</span>
            <TimeText cs={p.time} className={k === 0 ? 'num font-[650]' : 'num'} />
            <span className="flex-1" />
            {p.pct != null ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-ok">
                <ArrowDownRight aria-hidden="true" className="size-3.5" />
                {pct(p.pct)}
              </span>
            ) : (
              <span className="text-xs text-muted">Primer tiempo</span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Para el entrenador: los nadadores de su club y registrar uno nuevo. */
function CoachClub({ clubId }: { clubId: string }) {
  const { lid, base, clubs } = useSwim();
  const { players } = useNames(lid);
  const swimmers = useSwimmers(lid);
  const [adding, setAdding] = useState(false);
  const club = clubs.data.find((c) => c.id === clubId);
  const mine = swimmers.data.filter((s) => s.clubId === clubId);
  const byId = new Map(players.data.map((p) => [p.id, p] as const));
  if (!club) return null;
  return (
    <section aria-label={`Mi club: ${club.name}`}>
      <SectionHeader title={`Mi club: ${club.name}`} action={<SectionAdd label="Registrar" onClick={() => setAdding(true)} />} />
      {!mine.length ? (
        <EmptyCard
          icon={<Plus className="size-5" />}
          title="Tu club todavía no tiene nadadores"
          text="Registra a los tuyos (los menores con el permiso de su padre, madre o tutor) para inscribirlos en los encuentros."
        />
      ) : (
        <Card className="overflow-hidden">
          {mine
            .map((s) => ({ s, p: byId.get(s.playerId) }))
            .filter((x) => x.p)
            .sort((a, b) => a.p!.name.localeCompare(b.p!.name))
            .map(({ s, p }) => (
              <ListRow
                key={s.playerId}
                dense
                to={`${base}/j/${s.playerId}`}
                leading={<Initials name={p!.name} />}
                title={p!.name}
                trailing={s.category ? <Badge>{groupLabel(s.category)}</Badge> : undefined}
              />
            ))}
        </Card>
      )}
      <SwimmerFormModal open={adding} onClose={() => setAdding(false)} fixedClub={clubId} />
    </section>
  );
}
