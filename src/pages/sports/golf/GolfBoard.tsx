import { useMemo, useState } from 'react';
import { ListOrdered } from 'lucide-react';
import { useGolfTournament, type GolfCardDoc, type GolfRoundFull } from '../../../lib/data/golf';
import { useLeagueCtx } from '../../../lib/league';
import { Badge, Card, Empty, Position, cx } from '../../../components/ui';
import { CardModal, ToPar } from './bits';
import { boardModes, modeCompetition, modeLabel, roundBoard, thruText, tournamentBoard, type BoardMode, type BoardRow } from './logic';

/**
 * Leaderboard en vivo de la ronda (o del torneo): neto, bruto o Stableford, con los hoyos jugados de cada
 * quien. Tocar un jugador abre su tarjeta.
 */
export function GolfBoard({ round, cards, nameOf }: { round: GolfRoundFull; cards: GolfCardDoc[]; nameOf: (playerId: string) => string }) {
  const { lid } = useLeagueCtx();
  const [mode, setMode] = useState<BoardMode>('official');
  const [scope, setScope] = useState<'ronda' | 'torneo'>('ronda');
  const [open, setOpen] = useState<{ card: GolfCardDoc; round: GolfRoundFull } | null>(null);
  const tournament = useGolfTournament(lid, round.tournamentId);
  const multi = !!round.tournamentId && tournament.data.rounds.length > 1;
  const comp = modeCompetition(round.competition, mode);
  const stableford = comp.format === 'stableford';
  const net = comp.basis === 'net';

  const rows: BoardRow[] = useMemo(() => {
    if (multi && scope === 'torneo') {
      // Esta ronda con lo último (también lo del teléfono) y las otras como vienen del servidor.
      const others = tournament.data.cards.filter((c) => c.eventId !== round.eventId);
      const rounds = tournament.data.rounds.map((r) => (r.eventId === round.eventId ? round : r));
      return tournamentBoard(rounds, [...others, ...cards], comp);
    }
    return roundBoard(round, cards, comp);
  }, [multi, scope, tournament.data, round, cards, comp]);

  const roundsOf = multi && scope === 'torneo' ? tournament.data.rounds : [round];
  const holes = roundsOf.reduce((a, r) => a + r.holes, 0);

  if (!cards.length) {
    return (
      <Empty icon={<ListOrdered className="size-8" />} title="Todavía no hay inscritos">
        Cuando se inscriban y empiecen a anotar, aquí sale el leaderboard en vivo.
      </Empty>
    );
  }

  const modes = boardModes(round.competition);
  const main = (r: BoardRow) => (stableford ? <span className="tabular-nums">{r.points}</span> : <ToPar value={net ? r.netToPar : r.toPar} />);

  return (
    <div className="flex flex-col gap-3">
      {multi && (
        <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
          {(['ronda', 'torneo'] as const).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={scope === k}
              onClick={() => setScope(k)}
              className={cx('rounded-lg px-3 py-2 text-sm font-medium', scope === k ? 'bg-surface shadow-sm' : 'text-muted')}
            >
              {k === 'ronda' ? `Ronda ${round.roundNo ?? ''}` : `Torneo (${tournament.data.rounds.length} rondas)`}
            </button>
          ))}
        </div>
      )}
      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4" role="group" aria-label="Cómo ver el leaderboard">
        {modes.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={cx('shrink-0 rounded-full px-3 py-1.5 text-sm font-medium', mode === m ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted')}
          >
            {modeLabel(round.competition, m)}
          </button>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="grid grid-cols-[2rem_1fr_3.5rem_3rem_3.5rem] items-center gap-2 border-b border-line px-3 py-2 text-xs text-muted sm:grid-cols-[2rem_1fr_4rem_4rem_4rem_4rem]">
          <span>#</span>
          <span>Jugador</span>
          <span className="text-right">{stableford ? 'Pts' : net ? 'Neto' : 'Total'}</span>
          <span className="text-right" title="Hoyos jugados">
            Hoyos
          </span>
          <span className="text-right">Bruto</span>
          <span className="hidden text-right sm:block">{stableford ? 'Neto' : 'Pts'}</span>
        </div>
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={!r.card}
                onClick={() => r.card && setOpen({ card: r.card, round: roundsOf.find((x) => x.eventId === r.card!.eventId) ?? round })}
                className="grid w-full grid-cols-[2rem_1fr_3.5rem_3rem_3.5rem] items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-2 sm:grid-cols-[2rem_1fr_4rem_4rem_4rem_4rem]"
              >
                <span>{r.rank != null ? <Position pos={r.rank} /> : <span className="text-xs text-muted">–</span>}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{nameOf(r.id)}</span>
                  <span className="flex flex-wrap gap-1">
                    {r.decidedBy && <span className="text-[11px] text-muted">desempate: {r.decidedBy}</span>}
                    {r.unfinished && <Badge tone="warn">No terminó</Badge>}
                    {r.dq && !r.unfinished && <Badge tone="danger">{r.card?.dq ? 'Descalificado' : 'Recogió'}</Badge>}
                    {multi && scope === 'torneo' && (
                      <span className="text-[11px] text-muted">
                        {r.rounds.map((s, i) => (s && s.thru ? `R${i + 1} ${stableford ? s.points : (net ? s.net : s.gross) ?? '–'}` : null)).filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                </span>
                <b className="text-right text-lg">{main(r)}</b>
                <span className="text-right text-sm text-muted tabular-nums">{thruText(r.thru && scope === 'torneo' && multi ? r.holesPlayed : r.thru, scope === 'torneo' && multi ? holes : round.holes)}</span>
                <span className="text-right text-sm tabular-nums">{r.gross ?? '–'}</span>
                <span className="hidden text-right text-sm tabular-nums sm:block">{stableford ? (r.net ?? '–') : r.points}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <p className="text-xs text-muted">
        Ordenado por {modeLabel(round.competition, mode).toLowerCase()}. «Hoyos» = hoyos jugados (F = terminó). Empates al final: countback
        (últimos 9, 6, 3 y 1 hoyos{net && !stableford ? ', con la parte del handicap' : ''}).
      </p>
      <CardModal open={!!open} onClose={() => setOpen(null)} name={open ? nameOf(open.card.playerId) : ''} round={open?.round ?? round} card={open?.card ?? null} />
    </div>
  );
}
