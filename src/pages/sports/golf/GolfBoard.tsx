import { useMemo, useState, type ReactNode } from 'react';
import { ListOrdered } from 'lucide-react';
import { useGolfTournament, type GolfCardDoc, type GolfRoundFull } from '../../../lib/data/golf';
import { useLeagueCtx } from '../../../lib/league';
import { useIsPro } from '../../../components/mode';
import { Initials, PillSelect, PosNum, TuTag } from '../../../components/ranking/parts';
import { Card, ListRow, Segmented, cx } from '../../../components/ui';
import { ShareButton, golfBoardShare } from '../../../components/share';
import { EmptyCard } from '../FieldChrome';
import { CardModal, ToPar } from './bits';
import { boardModes, modeCompetition, modeLabel, roundBoard, thruText, tournamentBoard, type BoardMode, type BoardRow } from './logic';

/** El puesto (o «–» sin puesto: no terminó, recogió o descalificado). */
function Pos({ rank }: { rank: number | null }) {
  return rank != null ? <PosNum pos={rank} /> : <span className="w-[18px] shrink-0 text-center text-[15px] font-semibold text-faint">–</span>;
}

/**
 * Leaderboard en vivo de la ronda (o del torneo), con los hoyos jugados de cada quien; tocar un jugador abre su tarjeta.
 * - Lite: la lista tranquila (puesto, iniciales, nombre con «Tú», hoyos jugados y el número grande de lo oficial).
 * - Pro: «Stableford ▾» para mirarlo también en neto, bruto o Stableford, y la tabla con las columnas (Hoyos, Bruto,
 *   Neto o Pts) y el desempate en una línea.
 * Con un torneo de varias rondas, «Ronda 1 | Torneo». Compartir manda la imagen al grupo.
 */
export function GolfBoard({ round, cards, nameOf }: { round: GolfRoundFull; cards: GolfCardDoc[]; nameOf: (playerId: string) => string }) {
  const { lid, league, myPlayerId } = useLeagueCtx();
  const pro = useIsPro();
  const [picked, setMode] = useState<BoardMode>('official');
  const [scope, setScope] = useState<'ronda' | 'torneo'>('ronda');
  const [open, setOpen] = useState<{ card: GolfCardDoc; round: GolfRoundFull } | null>(null);
  const tournament = useGolfTournament(lid, round.tournamentId);
  const multi = !!round.tournamentId && tournament.data.rounds.length > 1;
  // Lite ve lo oficial (los otros modos son de Pro).
  const mode: BoardMode = pro ? picked : 'official';
  const comp = modeCompetition(round.competition, mode);
  const stableford = comp.format === 'stableford';
  const net = comp.basis === 'net';
  const whole = multi && scope === 'torneo';

  const rows: BoardRow[] = useMemo(() => {
    if (whole) {
      // Esta ronda con lo último (también lo del teléfono) y las otras como vienen del servidor.
      const others = tournament.data.cards.filter((c) => c.eventId !== round.eventId);
      const rounds = tournament.data.rounds.map((r) => (r.eventId === round.eventId ? round : r));
      return tournamentBoard(rounds, [...others, ...cards], comp);
    }
    return roundBoard(round, cards, comp);
  }, [whole, tournament.data, round, cards, comp]);

  const roundsOf = whole ? tournament.data.rounds : [round];
  const holes = roundsOf.reduce((a, r) => a + r.holes, 0);

  if (!cards.length) {
    return <EmptyCard icon={<ListOrdered className="size-5" />} title="Todavía no hay inscritos" text="Cuando se inscriban y empiecen a anotar, aquí sale el leaderboard en vivo." />;
  }

  const modes = boardModes(round.competition);
  const main = (r: BoardRow): ReactNode => (stableford ? r.points : <ToPar value={net ? r.netToPar : r.toPar} />);
  const thru = (r: BoardRow) => thruText(r.thru && whole ? r.holesPlayed : r.thru, whole ? holes : round.holes);
  const status = (r: BoardRow) => (r.unfinished ? 'No terminó' : r.dq ? (r.card?.dq ? 'Descalificado' : 'Recogió') : null);
  const openCard = (r: BoardRow) => r.card && setOpen({ card: r.card, round: roundsOf.find((x) => x.eventId === r.card!.eventId) ?? round });
  const perRound = (r: BoardRow) =>
    whole ? r.rounds.map((s, i) => (s && s.thru ? `R${i + 1} ${stableford ? s.points : ((net ? s.net : s.gross) ?? '–')}` : null)).filter(Boolean).join(' · ') : '';

  const share = (
    <ShareButton
      variant="ghost"
      size="md"
      iconOnly
      label="Compartir el leaderboard"
      className="relative rounded-full! bg-surface-2 text-fg-2 after:absolute after:-inset-0.5 after:content-['']"
      card={() =>
        golfBoardShare({
          title: league.name,
          subtitle: [whole ? `Torneo (${tournament.data.rounds.length} rondas)` : round.roundNo ? `Ronda ${round.roundNo}` : null, round.courseName, modeLabel(round.competition, mode)]
            .filter(Boolean)
            .join(' · '),
          rows,
          nameOf,
          stableford,
          net,
          holes: whole ? holes : round.holes,
          total: whole,
          statusOf: (r) => status(r) ?? undefined,
        })
      }
    />
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {multi && (
            <Segmented
              label="Qué leaderboard ver"
              className="[&>button]:px-3 [&>button]:text-sm"
              options={[
                { key: 'ronda' as const, label: `Ronda ${round.roundNo ?? ''}`.trim() },
                { key: 'torneo' as const, label: 'Torneo' },
              ]}
              value={scope}
              onChange={setScope}
            />
          )}
          {pro ? (
            <PillSelect label="Cómo ver el leaderboard" options={modes.map((m) => ({ key: m, label: modeLabel(round.competition, m) }))} value={mode} onChange={setMode} />
          ) : (
            !multi && <p className="mx-1 text-meta font-semibold text-fg-2">{modeLabel(round.competition, 'official')}</p>
          )}
        </div>
        {share}
      </div>

      {pro ? (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[1.5rem_1fr_3.25rem_3rem_3.25rem] items-center gap-2 border-b border-line px-4 py-2.5 text-xs font-semibold tracking-[0.06em] text-muted uppercase sm:grid-cols-[1.5rem_1fr_4rem_4rem_4rem_4rem]">
            <span>#</span>
            <span>Jugador</span>
            <span className="text-right">{stableford ? 'Pts' : net ? 'Neto' : 'Total'}</span>
            <span className="text-right" title="Hoyos jugados">
              Hoyos
            </span>
            <span className="text-right">Bruto</span>
            <span className="hidden text-right sm:block">{stableford ? 'Neto' : 'Pts'}</span>
          </div>
          <ul>
            {rows.map((r) => {
              const me = !!myPlayerId && r.id === myPlayerId;
              const note = [status(r), r.decidedBy ? `desempate: ${r.decidedBy}` : null, perRound(r)].filter(Boolean).join(' · ');
              return (
                <li key={r.id} className="border-t border-line first:border-t-0">
                  <button
                    type="button"
                    disabled={!r.card}
                    onClick={() => openCard(r)}
                    className={cx(
                      'grid min-h-row-pro w-full grid-cols-[1.5rem_1fr_3.25rem_3rem_3.25rem] items-center gap-2 px-4 py-2 text-left transition enabled:active:bg-surface-2 sm:grid-cols-[1.5rem_1fr_4rem_4rem_4rem_4rem]',
                      me && 'bg-accent-soft',
                    )}
                  >
                    <Pos rank={r.rank} />
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[15px] font-semibold">{nameOf(r.id)}</span>
                        {me && <TuTag small />}
                      </span>
                      {note && <span className="block truncate text-xs text-muted">{note}</span>}
                    </span>
                    <b className="num text-right text-row-num-pro">{main(r)}</b>
                    <span className="num text-right text-sm text-muted">{thru(r)}</span>
                    <span className="num text-right text-sm">{r.gross ?? '–'}</span>
                    <span className="num hidden text-right text-sm sm:block">{stableford ? (r.net ?? '–') : r.points}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {rows.map((r) => {
            const me = !!myPlayerId && r.id === myPlayerId;
            const t = thru(r);
            const sub = [status(r) ?? (t === 'F' ? 'Terminó' : t === '–' ? 'Sin empezar' : `${t} ${t === '1' ? 'hoyo' : 'hoyos'}`), perRound(r)].filter(Boolean).join(' · ');
            return (
              <ListRow
                key={r.id}
                onClick={r.card ? () => openCard(r) : undefined}
                ariaLabel={`${nameOf(r.id)}: ver su tarjeta`}
                chevron={false}
                me={me}
                className="min-h-[60px]!"
                leading={
                  <>
                    <Pos rank={r.rank} />
                    <Initials name={nameOf(r.id)} me={me} />
                  </>
                }
                title={
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{nameOf(r.id)}</span>
                    {me && <TuTag />}
                  </span>
                }
                subtitle={sub}
                value={
                  stableford ? (
                    <>
                      {r.points}
                      <span className="ml-1 text-sm font-medium tracking-normal text-muted">pts</span>
                    </>
                  ) : (
                    main(r)
                  )
                }
              />
            );
          })}
        </Card>
      )}
      <p className="mx-1 text-[12.5px] leading-[1.4] text-muted">
        {pro
          ? `Empates: countback (últimos 9, 6, 3 y 1 hoyos${net && !stableford ? ', con la parte del handicap' : ''}). F = terminó.`
          : 'Toca un jugador para ver su tarjeta.'}
      </p>
      <CardModal open={!!open} onClose={() => setOpen(null)} name={open ? nameOf(open.card.playerId) : ''} round={open?.round ?? round} card={open?.card ?? null} />
    </div>
  );
}
