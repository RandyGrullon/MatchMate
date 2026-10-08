import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { Pencil, Target } from 'lucide-react';
import { useEvents, usePlayer } from '../../../lib/data';
import { setGolfIndex, useGolfIndexes, useGolfPlayer } from '../../../lib/data/golf';
import { eventLabel, formatDate } from '../../../lib/format';
import { useLeagueCtx } from '../../../lib/league';
import { isValidIndex, MAX_INDEX, MIN_INDEX } from '../../../sports/golf/course';
import { EventTopBar } from '../../../components/event/EventHeader';
import { useAction } from '../../../components/feedback';
import { useIsPro } from '../../../components/mode';
import { NumbersGrid, type NumberItem } from '../../../components/stats/YoStats';
import { Button, Card, Field, Input, ListRow, ListSkeleton, LoadError, Modal, SectionHeader, StatsSkeleton, sectionLinkClass } from '../../../components/ui';
import { EmptyCard, ShowMore } from '../FieldChrome';
import { indexInput, parseIndex } from './GolfPlayers';
import { bestRounds, indexText, playedRounds, playerStats, toParText, type PlayedRound } from './logic';

/** Mi golf en la liga: Index (no oficial), mis números y mis rondas. */
export function GolfMyProfile() {
  const { myPlayerId } = useLeagueCtx();
  if (!myPlayerId) {
    return (
      <div className="flex flex-col px-2">
        <h1 className="mt-1 text-title">Mi golf</h1>
        <EmptyCard className="mt-5" icon={<Target className="size-5" />} title="No juegas en esta liga" text="Únete a la liga para anotar tus rondas y ver tus números." />
      </div>
    );
  }
  return (
    <div className="flex flex-col px-2">
      <GolfPlayerView playerId={myPlayerId} own />
    </div>
  );
}

/** El perfil de otro jugador (/j/:playerId): «‹ Golf del Club» vuelve a donde estabas (o al orden de mérito). */
export function GolfPlayerPage() {
  const { playerId } = useParams();
  const { base, league, myPlayerId } = useLeagueCtx();
  if (!playerId) return null;
  return (
    <div className="flex flex-col px-2">
      <EventTopBar back={{ label: league.name, fallback: `${base}/ranking` }} right={null} />
      <GolfPlayerView playerId={playerId} own={playerId === myPlayerId} />
    </div>
  );
}

/**
 * Los números de golf de un jugador (rediseño «Calma y foco», como Yo): el título, su Handicap Index con «Cambiar», y
 * - Lite: Mejor bruto · Promedio · Birdies y sus últimas rondas (3 y «Ver las 10»);
 * - Pro: los 6 números, cómo le fue hoyo por hoyo (eagles, bogeys, putts…), sus mejores rondas y las últimas 10.
 * Solo cuentan las tarjetas firmadas o de rondas cerradas.
 */
function GolfPlayerView({ playerId, own }: { playerId: string; own: boolean }) {
  const { lid, base, isAdmin } = useLeagueCtx();
  const pro = useIsPro();
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
  const name = player.data?.name ?? (own ? 'Mi golf' : 'Jugador');
  const nameOfRound = (r: PlayedRound) => {
    const e = dateOf.get(r.eventId);
    return e ? eventLabel({ type: e.type, name: e.name, date: e.date }, 'golf') : r.round.courseName;
  };
  const nineOnly = stats.eighteen.rounds === 0;
  const main = nineOnly ? stats.nine : stats.eighteen;
  const nine = nineOnly ? ' (9 hoyos)' : '';
  const dec = (v: number | null | undefined) => v?.toLocaleString('es-DO') ?? '–';
  const lite: NumberItem[] = [
    { label: `Mejor bruto${nine}`, value: main.bestGross ?? '–', accent: true },
    { label: 'Promedio', value: dec(main.avgGross) },
    { label: 'Birdies', value: stats.birdies },
  ];
  const full: NumberItem[] = [
    { label: `Mejor bruto${nine}`, value: main.bestGross ?? '–', accent: true },
    { label: `Mejor neto${nine}`, value: main.bestNet ?? '–' },
    { label: 'Promedio', value: dec(main.avgGross) },
    { label: 'Stableford medio', value: dec(main.avgPoints) },
    { label: 'Birdies', value: stats.birdies },
    { label: 'Pares', value: stats.pars },
  ];
  const holes: NumberItem[] = [
    { label: 'Eagles o mejor', value: stats.eagles + stats.albatrosses },
    { label: 'Bogeys', value: stats.bogeys },
    { label: 'Doble o peor', value: stats.doubleBogeys },
    { label: 'Hoyos en uno', value: stats.holesInOne },
    { label: 'Putts por ronda', value: dec(stats.avgPutts) },
    { label: 'Putts por hoyo', value: dec(stats.puttsPerHole) },
  ];

  return (
    <div className="flex flex-col">
      <h1 className={pro ? 'mt-0.5 text-title-pro break-words' : 'mt-1 text-title break-words'}>{own ? 'Mi golf' : name}</h1>
      <p className="mt-1.5 text-meta text-muted">
        {[own && player.data ? name : null, rounds.length === 1 ? '1 ronda firmada o cerrada' : `${rounds.length} rondas firmadas o cerradas`].filter(Boolean).join(' · ')}
      </p>

      <Card className="mt-5 py-[18px] pr-5 pl-[22px]">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-meta font-medium text-muted">Handicap Index (no oficial)</p>
          {canEdit && (
            <button type="button" onClick={() => setEditing(true)} aria-haspopup="dialog" className={sectionLinkClass}>
              <Pencil aria-hidden="true" className="size-4" />
              {idx ? 'Cambiar' : 'Anotar'}
            </button>
          )}
        </div>
        <p className="num mt-2 text-stat">{idx ? indexText(idx.index) : '–'}</p>
        <p className="mt-2 text-[13px] leading-snug text-muted">
          {idx?.at ? `Anotado el ${formatDate(idx.at)} · ` : ''}el de FEDOGOLF o GHIN; se congela al inscribirte
        </p>
      </Card>

      {data.loading ? (
        <div className="mt-3.5">
          <StatsSkeleton />
        </div>
      ) : !rounds.length ? (
        <EmptyCard className="mt-3.5" icon={<Target className="size-5" />} title="Todavía no hay rondas" text="Cuentan cuando la tarjeta está firmada o la ronda se cerró." />
      ) : (
        <>
          <NumbersGrid className="mt-3.5" items={pro ? full : lite} />
          {pro && (
            <section aria-labelledby="golf-hoyos" className="mt-[26px]">
              <SectionHeader id="golf-hoyos" title="Hoyo por hoyo" />
              <NumbersGrid items={holes} />
            </section>
          )}
          {pro && best.length > 0 && (
            <section aria-labelledby="golf-mejores" className="mt-[26px]">
              <SectionHeader id="golf-mejores" title="Mejores rondas" />
              <RoundRows rounds={best} nameOf={nameOfRound} base={base} />
            </section>
          )}
          <section aria-labelledby="golf-ultimas" className="mt-[26px]">
            <SectionHeader id="golf-ultimas" title="Últimas rondas" />
            {events.loading ? (
              <ListSkeleton rows={3} />
            ) : pro ? (
              <RoundRows rounds={recent} nameOf={nameOfRound} base={base} />
            ) : (
              <ShowMore items={recent} noun="rondas" render={(shown) => <RoundRows rounds={shown} nameOf={nameOfRound} base={base} />} />
            )}
          </section>
        </>
      )}
      {canEdit && <IndexModal open={editing} onClose={() => setEditing(false)} playerId={playerId} current={idx?.index ?? null} />}
    </div>
  );
}

/** Las rondas como filas: el nombre, el campo y el neto, y los golpes brutos en grande (abre su leaderboard). */
function RoundRows({ rounds, nameOf, base }: { rounds: readonly PlayedRound[]; nameOf: (r: PlayedRound) => string; base: string }) {
  return (
    <Card className="overflow-hidden">
      {rounds.map((r) => (
        <ListRow
          key={r.eventId}
          to={`${base}/e/${r.eventId}?tab=leaderboard`}
          title={nameOf(r)}
          subtitle={[
            r.round.courseName,
            `${r.card.strokes.length} hoyos`,
            `neto ${toParText(r.stableford.netToPar)}`,
            `${r.stableford.points} pts`,
            !r.score.complete ? 'sin terminar' : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          value={r.stableford.gross ?? '–'}
        />
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
          <Button className="h-11" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" className="h-11" onClick={save} loading={busy} disabled={bad}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Index (no oficial)" hint={`De +${Math.abs(MIN_INDEX)} a ${MAX_INDEX}. Plus: +1.2. Vacío = sin Index.`}>
          <Input inputMode="decimal" className="h-11" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej.: 14.2" aria-invalid={bad} autoFocus />
        </Field>
        <p className="text-xs text-muted">Con el Index sale tu handicap de campo en cada ronda. Las rondas en las que ya estás inscrito no cambian.</p>
      </div>
    </Modal>
  );
}
