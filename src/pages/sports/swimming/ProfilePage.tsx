import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowDownRight, Medal, Plus, TrendingDown, UserPlus, Users, Waves } from 'lucide-react';
import { useSwimHistory, useSwimmers } from '../../../lib/data/swimming';
import { formatDate } from '../../../lib/format';
import { personalBests, STROKE_LABEL, type PersonalBest } from '../../../sports/swimming';
import { Avatar } from '../../../components/Avatar';
import { BackLink } from '../../../components/BackLink';
import { Badge, Button, Card, Empty, ListSkeleton, LoadError } from '../../../components/ui';
import { ClubTag, StatusBadge, TimeText, clubMap, useNames, useSwim } from './bits';
import { groupLabel, raceName } from './logic';
import { BestTile } from './SwimHome';
import { SwimmerFormModal } from './SwimmersAdmin';

const pct = (n: number) => `${n.toFixed(2).replace('.', ',')} %`;

/** Mis marcas: las del nadador de la cuenta y, si entrena un club, sus nadadores. */
export function SwimMyProfile() {
  const { myPlayerId, coachOf } = useSwim();
  return (
    <div className="flex flex-col gap-6">
      {myPlayerId ? (
        <SwimmerProfile playerId={myPlayerId} mine />
      ) : (
        !coachOf.size && (
          <Empty icon={<Waves className="size-8" />} title="Aquí salen tus marcas">
            Cuando nades en un encuentro de la liga, tus mejores tiempos por estilo, distancia y piscina salen aquí.
          </Empty>
        )
      )}
      {[...coachOf].map((clubId) => (
        <CoachClub key={clubId} clubId={clubId} />
      ))}
    </div>
  );
}

/** Perfil de un nadador: sus marcas personales con la progresión y todo lo que ha nadado. */
export function SwimPlayer() {
  const { playerId } = useParams();
  const { base } = useSwim();
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback={base} className="-ml-1.5 self-start" />
      {playerId && <SwimmerProfile playerId={playerId} />}
    </div>
  );
}

function SwimmerProfile({ playerId, mine }: { playerId: string; mine?: boolean }) {
  const { lid, base, clubs } = useSwim();
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
  if (!players.loading && !exists) return <Empty title="Este nadador ya no está en la liga" />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Avatar name={name(playerId)} className="size-12 text-base" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight">{mine ? 'Mis marcas' : name(playerId)}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {mine && <span className="text-sm text-muted">{name(playerId)}</span>}
            <ClubTag club={club} className="text-sm" />
            {info?.category && <Badge>{groupLabel(info.category)}</Badge>}
          </div>
        </div>
      </div>

      {history.loading ? (
        <ListSkeleton rows={3} />
      ) : !bests.length ? (
        <Empty icon={<Medal className="size-8" />} title="Todavía sin marcas">
          Las marcas salen de los tiempos válidos de los encuentros (DQ, DNS y DNF no cuentan).
        </Empty>
      ) : (
        <>
          {pools.map((pool) => (
            <section key={pool} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold">Piscina de {pool} m</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {bests
                  .filter((b) => b.pool === pool)
                  .map((b) => (
                    <BestTile key={b.key} best={b} active={open === b.key} onClick={() => setOpen(open === b.key ? null : b.key)} />
                  ))}
              </div>
            </section>
          ))}
          {selected ? (
            <Progression best={selected} />
          ) : (
            <p className="text-xs text-muted">Toca una marca para ver cómo fue bajando. Las de 25 m y 50 m van aparte.</p>
          )}
        </>
      )}

      {swims.length > 0 && (
        <Card className="overflow-hidden">
          <h2 className="border-b border-line px-4 py-2.5 font-semibold">Lo que ha nadado</h2>
          <div className="divide-y divide-line">
            {swims.map((s) => (
              <Link key={s.entryId} to={`${base}/e/${s.meetId}?ver=resultados`} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-surface-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {raceName(s)} · {s.pool} m
                  </p>
                  <p className="truncate text-xs text-muted">
                    {formatDate(s.date)} · {s.meetName || (s.meetType === 'control' ? 'Control de marcas' : 'Encuentro')}
                    {s.ageGroup ? ` · ${groupLabel(s.ageGroup)}` : ''}
                  </p>
                </div>
                <StatusBadge status={s.status} />
                <TimeText cs={s.time} empty="" className="font-semibold" />
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Progression({ best }: { best: PersonalBest }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 border-b border-line px-4 py-3">
        <TrendingDown className="mt-0.5 size-5 shrink-0 text-ok" />
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
      <div className="divide-y divide-line">
        {[...best.progression].reverse().map((p, k) => (
          <div key={`${p.date}-${p.time}`} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-24 shrink-0 text-sm text-muted">{formatDate(p.date)}</span>
            <TimeText cs={p.time} className={k === 0 ? 'font-bold' : ''} />
            <span className="flex-1" />
            {p.pct != null ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-ok">
                <ArrowDownRight className="size-3.5" />
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
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Users className="size-5 text-accent" />
        <h2 className="min-w-0 flex-1 text-lg font-semibold">Mi club: {club.name}</h2>
        <Button size="sm" variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setAdding(true)}>
          Registrar
        </Button>
      </div>
      {!mine.length ? (
        <Empty icon={<Plus className="size-8" />} title="Tu club todavía no tiene nadadores">
          Registra a los tuyos (los menores con el permiso de su padre, madre o tutor) para inscribirlos en los encuentros.
        </Empty>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {mine
            .map((s) => ({ s, p: byId.get(s.playerId) }))
            .filter((x) => x.p)
            .sort((a, b) => a.p!.name.localeCompare(b.p!.name))
            .map(({ s, p }) => (
              <Link key={s.playerId} to={`${base}/j/${s.playerId}`} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-surface-2">
                <Avatar name={p!.name} className="size-8 text-xs" />
                <span className="min-w-0 flex-1 truncate font-medium">{p!.name}</span>
                {s.category && <Badge>{groupLabel(s.category)}</Badge>}
              </Link>
            ))}
        </Card>
      )}
      <SwimmerFormModal open={adding} onClose={() => setAdding(false)} fixedClub={clubId} />
    </section>
  );
}
