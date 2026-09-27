import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ArrowLeft, Gavel, History, Keyboard, PencilLine, Play, Undo2 } from 'lucide-react';
import { useAuth } from '../../../../lib/auth';
import { useLeagueMembers } from '../../../../lib/data';
import { hasResult, isOpen, resolveDispute, sideOf, useMatch, type Match } from '../../../../lib/data/matches';
import { savePointsResult, useWithPendingPoints } from '../../../../lib/data/racket';
import { useLeagueCtx } from '../../../../lib/league';
import { useFeedback, saveErrorMessage } from '../../../../components/feedback';
import { ConfirmResultBanner, MatchCard, ResultEntryModal, ShareResultCard, pointsResultParser, racketResultParser, type ParsedResult } from '../../../../components/match';
import { Button, Card, Empty, LoadError, PageSkeleton } from '../../../../components/ui';
import { appOrigin } from '../bits';
import { PointsCourt } from '../court/PointsCourt';
import { SetsCourt } from '../court/SetsCourt';
import { engineRules } from '../court/adapters';
import { parsePoints } from '../logic/night';
import { isPointsMatch } from '../logic/results';
import { rulesText } from '../logic/rulesText';
import { useNames } from '../names';
import { useRacket } from '../sport';
import { historyLines } from './history';
import { MatchAdmin } from './MatchAdmin';

/** `?partido=<id>` (y `&cancha=1` para el modo cancha) en la pantalla actual. */
export function useMatchParam() {
  const [params, setParams] = useSearchParams();
  const id = params.get('partido');
  const court = params.get('cancha') === '1';
  const set = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    setParams(p);
  };
  return {
    id,
    court,
    open: (matchId: string) => set({ partido: matchId, cancha: null }),
    close: () => set({ partido: null, cancha: null }),
    openCourt: (matchId?: string) => set({ partido: matchId ?? id, cancha: '1' }),
    closeCourt: () => set({ cancha: null }),
  };
}

/** Mi lado en el partido (por mi jugador o mis parejas). */
export function useMySide() {
  const { myPlayerId } = useLeagueCtx();
  const names = useNames();
  return useMemo(() => {
    const teamIds = names.teamsOf(myPlayerId);
    return (m: Pick<Match, 'sides'>) => (myPlayerId ? sideOf(m, { playerIds: [myPlayerId], teamIds }) : null);
  }, [myPlayerId, names]);
}

/**
 * Un partido: marcador y estado, confirmar o reclamar (el rival), anotar en la cancha o «solo resultado»,
 * lo del admin (W.O., aplazar, reprogramar, corregir, decidir el reclamo, suplente, anular) y el historial.
 */
export function MatchDetail({ matchId, eventId, title, onBack }: { matchId: string; eventId?: string | null; title?: string; onBack: () => void }) {
  const { lid, isAdmin, member, league, base } = useLeagueCtx();
  const { sport, ext } = useRacket();
  const { user } = useAuth();
  const { toast } = useFeedback();
  const param = useMatchParam();
  const q = useMatch(lid, matchId, { eventId });
  const list = useWithPendingPoints(lid, q.data ? [q.data] : []);
  const m = list[0] ?? null;
  const mySideOf = useMySide();
  const members = useLeagueMembers(lid);
  const [entry, setEntry] = useState<null | 'finish' | 'correct' | 'resolve'>(null);
  const [busy, setBusy] = useState(false);

  if (q.error) return <LoadError error={q.error} />;
  if (q.loading && !m) return <PageSkeleton />;
  if (!m) {
    return (
      <Empty title="Este partido ya no existe">
        <button type="button" className="text-accent" onClick={onBack}>
          Volver
        </button>
      </Empty>
    );
  }

  const mySide = mySideOf(m);
  const canScore = isAdmin || !!member?.scorer || mySide !== null;
  const points = isPointsMatch(m);
  const open = isOpen(m);
  const rules = engineRules(sport, m.rules);
  const uid = user?.uid ?? null;

  const Court = ext.court?.(m) ?? null;
  const custom = ext.resultEntry?.(m) ?? null;
  if (param.court && open && canScore) {
    if (Court) return <Court match={m} isAdmin={isAdmin} userId={uid} onExit={param.closeCourt} />;
    return points ? (
      <PointsCourt match={m} isAdmin={isAdmin} userId={uid} onExit={param.closeCourt} />
    ) : (
      <SetsCourt match={m} sport={sport} isAdmin={isAdmin} userId={uid} onExit={param.closeCourt} />
    );
  }

  const parser = custom?.parser ?? (points ? pointsResultParser(parsePoints(m.rules?.points)) : racketResultParser(rules));
  const pointsSubmit = (note?: string) => async (r: ParsedResult) => {
    const sides = r.score.sides ?? [0, 0];
    const out = await savePointsResult(lid, m.id, [sides[0], sides[1]], { note });
    if (out && !out.ok) throw new Error('Otro teléfono va más adelante con este partido.');
  };
  const memberName = (id: string) => members.data.find((x) => x.uid === id)?.name ?? null;
  const history = historyLines(m.history, memberName, league.tz);

  const keepProposed = async () => {
    setBusy(true);
    try {
      await resolveDispute(lid, m.id, { note: 'Queda el resultado anotado' });
      toast('Reclamo resuelto: queda el resultado anotado');
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const url = `${appOrigin()}${eventId ? `${base}/e/${eventId}` : `${base}/juegos`}?partido=${m.id}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onBack} icon={<ArrowLeft className="size-5" />} aria-label="Volver" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold">{title ?? (points ? 'Partido de la noche' : 'Partido')}</h1>
          {!points && <p className="truncate text-xs text-muted">{rulesText(rules)}</p>}
        </div>
      </div>

      <MatchCard match={m} mySide={mySide} roundWord={points ? 'Ronda' : 'Jornada'} tz={league.tz} />

      <ConfirmResultBanner lid={lid} match={m} mySide={mySide} isAdmin={isAdmin} />

      {open && canScore && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="primary" className="h-14 text-base" icon={<Play className="size-5" />} onClick={() => param.openCourt(m.id)}>
            {m.status === 'live' ? 'Seguir anotando en la cancha' : m.status === 'suspended' ? 'Retomar en la cancha' : 'Anotar en la cancha'}
          </Button>
          <Button className="h-14 text-base" icon={<Keyboard className="size-5" />} onClick={() => setEntry('finish')}>
            {points ? 'Poner el marcador' : 'Solo el resultado'}
          </Button>
        </div>
      )}

      {isAdmin && (hasResult(m) || m.status === 'void') && (
        <div className="flex flex-wrap gap-2">
          {m.status === 'disputed' ? (
            <>
              <Button variant="primary" icon={<Gavel className="size-4" />} onClick={() => setEntry('resolve')}>
                Decidir el reclamo
              </Button>
              <Button icon={<Undo2 className="size-4" />} loading={busy} onClick={() => void keepProposed()}>
                Dejar lo anotado
              </Button>
            </>
          ) : (
            <Button icon={<PencilLine className="size-4" />} onClick={() => setEntry('correct')}>
              Corregir el resultado
            </Button>
          )}
        </div>
      )}

      {isAdmin && (
        <Card className="flex flex-col gap-2 p-4">
          <p className="text-xs font-semibold text-muted">Admin</p>
          <MatchAdmin match={m} onDeleted={onBack} />
        </Card>
      )}

      {hasResult(m) && <ShareResultCard match={m} title={title ?? league.name} roundWord={points ? 'Ronda' : 'Jornada'} url={url} />}

      {history.length > 0 && (
        <details className="rounded-2xl border border-line bg-surface px-4 py-3">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <History className="size-4" /> Historial ({history.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {history.map((h, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{h.text}</span>
                <span className="block text-xs text-muted">
                  {new Date(h.at).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short', timeZone: league.tz || undefined })}
                  {h.who ? ` · ${h.who}` : ''}
                  {h.note ? ` · ${h.note}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {entry && (
        <ResultEntryModal
          open
          onClose={() => setEntry(null)}
          lid={lid}
          match={m}
          parser={parser}
          mode={entry}
          placeholder={custom?.placeholder ?? (points ? '14-10' : sport === 'pickleball' ? '11-7 9-11 11-5' : '6-4 3-6 10-7')}
          examples={custom?.examples ?? (points ? [] : sport === 'pickleball' ? ['11-7', '11-9'] : ['6-4 6-4', '6-3 6-2', '6-4 3-6 10-7', '7-6(5) 6-4'])}
          hint={
            custom?.hint ??
            (points
              ? `Los puntos de cada lado${parsePoints(m.rules?.points).mode === 'total' ? `: suman ${parsePoints(m.rules?.points).target}` : ''}.`
              : sport === 'pickleball'
                ? 'Juego por juego, separados por espacio (11-7 9-11 11-5).'
                : 'Set por set, separados por espacio. El súper tie-break va con sus puntos (10-7).')
          }
          onSubmit={(custom ? custom.points : points) ? pointsSubmit(entry === 'finish' ? undefined : 'Corregido por el admin') : undefined}
        />
      )}
    </div>
  );
}
