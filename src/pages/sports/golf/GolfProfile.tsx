import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ChevronRight, Pencil, Target } from 'lucide-react';
import { useEvents, usePlayer } from '../../../lib/data';
import { setGolfIndex, useGolfIndexes, useGolfPlayer } from '../../../lib/data/golf';
import { eventLabel, formatDate } from '../../../lib/format';
import { useLeagueCtx } from '../../../lib/league';
import { isValidIndex, MAX_INDEX, MIN_INDEX } from '../../../sports/golf/course';
import { useAction } from '../../../components/feedback';
import { Badge, Button, Card, Empty, Field, Input, ListSkeleton, LoadError, Modal, StatsSkeleton } from '../../../components/ui';
import { BackLink } from '../../../components/BackLink';
import { Stat, ToPar } from './bits';
import { indexInput, parseIndex } from './GolfPlayers';
import { bestRounds, indexText, playedRounds, playerStats, type PlayedRound } from './logic';

/** Mi golf en la liga: Index (no oficial), estadísticas y mejores rondas. */
export function GolfMyProfile() {
  const { myPlayerId } = useLeagueCtx();
  if (!myPlayerId) {
    return (
      <Empty icon={<Target className="size-8" />} title="No juegas en esta liga">
        Únete a la liga para anotar tus rondas y ver tus estadísticas.
      </Empty>
    );
  }
  return <GolfPlayerView playerId={myPlayerId} own />;
}

/** El perfil de otro jugador (/j/:playerId). */
export function GolfPlayerPage() {
  const { playerId } = useParams();
  const { base, myPlayerId } = useLeagueCtx();
  if (!playerId) return null;
  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback={`${base}/ranking`} />
      <GolfPlayerView playerId={playerId} own={playerId === myPlayerId} />
    </div>
  );
}

function GolfPlayerView({ playerId, own }: { playerId: string; own: boolean }) {
  const { lid, base, isAdmin } = useLeagueCtx();
  const player = usePlayer(lid, playerId);
  const data = useGolfPlayer(lid, playerId);
  const indexes = useGolfIndexes(lid);
  const events = useEvents(lid);
  const [editing, setEditing] = useState(false);

  const rounds = useMemo(() => playedRounds(data.data), [data.data]);
  const stats = useMemo(() => playerStats(rounds), [rounds]);
  const best = useMemo(() => bestRounds(rounds), [rounds]);
  const dateOf = useMemo(() => new Map(events.data.map((e) => [e.id, e] as const)), [events.data]);
  const recent = useMemo(
    () => [...rounds].sort((a, b) => (dateOf.get(b.eventId)?.date ?? '').localeCompare(dateOf.get(a.eventId)?.date ?? '')).slice(0, 10),
    [rounds, dateOf],
  );

  if (data.error) return <LoadError error={data.error} />;
  const idx = indexes.data[playerId] ?? null;
  const canEdit = own || isAdmin;
  const nameOfRound = (r: PlayedRound) => {
    const e = dateOf.get(r.eventId);
    return e ? eventLabel({ type: e.type, name: e.name, date: e.date }, 'golf') : r.round.courseName;
  };
  const eighteen = stats.eighteen.rounds > 0 ? stats.eighteen : stats.nine;
  const holesLabel = stats.eighteen.rounds > 0 ? '18 hoyos' : '9 hoyos';

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{player.data?.name ?? (own ? 'Mi golf' : 'Jugador')}</h1>
        <p className="text-sm text-muted">{rounds.length === 1 ? '1 ronda' : `${rounds.length} rondas`} firmadas o cerradas</p>
      </div>

      <Card className="flex items-center gap-4 px-4 py-4">
        <div className="flex-1">
          <div className="text-xs text-muted">Handicap Index (no oficial)</div>
          <div className="text-3xl font-black tabular-nums">{idx ? indexText(idx.index) : '–'}</div>
          <div className="text-xs text-muted">
            {idx?.at ? `Anotado el ${formatDate(idx.at)}. ` : ''}Es el de FEDOGOLF o GHIN: la app no calcula el oficial. Se congela en cada ronda al inscribirse.
          </div>
        </div>
        {canEdit && (
          <Button icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
            {idx ? 'Cambiar' : 'Anotar'}
          </Button>
        )}
      </Card>

      {data.loading ? (
        <StatsSkeleton />
      ) : !rounds.length ? (
        <Empty icon={<Target className="size-8" />} title="Todavía no hay rondas">
          Las rondas cuentan cuando la tarjeta está firmada o la ronda se cerró.
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={`Mejor bruto (${holesLabel})`} value={eighteen.bestGross ?? '–'} />
            <Stat label={`Mejor neto (${holesLabel})`} value={eighteen.bestNet ?? '–'} />
            <Stat label="Promedio de golpes" value={eighteen.avgGross?.toLocaleString('es-DO') ?? '–'} />
            <Stat label="Stableford medio" value={eighteen.avgPoints?.toLocaleString('es-DO') ?? '–'} sub="puntos" />
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            <Stat label="Eagles o mejor" value={stats.eagles + stats.albatrosses} />
            <Stat label="Birdies" value={stats.birdies} />
            <Stat label="Pares" value={stats.pars} />
            <Stat label="Bogeys" value={stats.bogeys} />
            <Stat label="Doble o peor" value={stats.doubleBogeys} />
            <Stat label="Hoyos en uno" value={stats.holesInOne} />
          </div>
          {(stats.avgPutts != null || stats.puttsPerHole != null) && (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Putts por ronda (18)" value={stats.avgPutts?.toLocaleString('es-DO') ?? '–'} />
              <Stat label="Putts por hoyo" value={stats.puttsPerHole?.toLocaleString('es-DO') ?? '–'} />
            </div>
          )}

          {best.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-muted">Mejores rondas</h2>
              <RoundRows rounds={best} nameOf={nameOfRound} base={base} />
            </section>
          )}
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted">Últimas rondas</h2>
            {events.loading ? <ListSkeleton rows={3} /> : <RoundRows rounds={recent} nameOf={nameOfRound} base={base} />}
          </section>
        </>
      )}
      {canEdit && <IndexModal open={editing} onClose={() => setEditing(false)} playerId={playerId} current={idx?.index ?? null} />}
    </div>
  );
}

function RoundRows({ rounds, nameOf, base }: { rounds: PlayedRound[]; nameOf: (r: PlayedRound) => string; base: string }) {
  return (
    <Card className="divide-y divide-line overflow-hidden">
      {rounds.map((r) => (
        <Link key={r.eventId} to={`${base}/e/${r.eventId}?tab=leaderboard`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{nameOf(r)}</div>
            <div className="truncate text-xs text-muted">
              {r.round.courseName} · {r.card.strokes.length} hoyos {!r.score.complete && <Badge tone="warn">sin terminar</Badge>}
            </div>
          </div>
          <div className="shrink-0 text-right text-sm">
            <b className="tabular-nums">{r.stableford.gross ?? '–'}</b>{' '}
            <span className="text-xs text-muted">
              neto <ToPar value={r.stableford.netToPar} /> · {r.stableford.points} pts
            </span>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted" />
        </Link>
      ))}
    </Card>
  );
}

function IndexModal({ open, onClose, playerId, current }: { open: boolean; onClose: () => void; playerId: string; current: number | null }) {
  const { lid } = useLeagueCtx();
  const run = useAction();
  const [text, setText] = useState(indexInput(current));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setText(indexInput(current));
  }, [open, current]);
  const value = parseIndex(text);
  const bad = value != null && !isValidIndex(value);
  async function save() {
    setBusy(true);
    const ok = await run(async () => {
      await setGolfIndex(lid, playerId, value);
      return true;
    }, 'Index guardado');
    setBusy(false);
    if (ok) onClose();
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Handicap Index"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={bad}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Index (no oficial)" hint={`De +${Math.abs(MIN_INDEX)} a ${MAX_INDEX}. Plus: +1.2. Vacío = sin Index.`}>
          <Input inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej.: 14.2" aria-invalid={bad} autoFocus />
        </Field>
        <p className="text-xs text-muted">
          El Index sirve para calcular tu handicap de campo en cada ronda (depende de la salida). Las rondas en las que ya estás inscrito no cambian.
        </p>
      </div>
    </Modal>
  );
}
