import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Gavel, History, Keyboard, Play, Share2, Trophy, Undo2 } from 'lucide-react';
import { useAuth } from '../../../../lib/auth';
import { useLeagueMembers } from '../../../../lib/data';
import { hasResult, isOpen, resolveDispute, sideOf, useMatch, type Match } from '../../../../lib/data/matches';
import type { Side } from '../../../../sports/types';
import { savePointsResult, useWithPendingPoints } from '../../../../lib/data/racket';
import { useLeagueCtx } from '../../../../lib/league';
import { useFeedback, saveErrorMessage } from '../../../../components/feedback';
import {
  ConfirmResultBanner,
  ResultEntryModal,
  ShareResultCard,
  pointsResultParser,
  racketResultParser,
  roundLabel,
  scoreColumns,
  sideName,
  statusInfo,
  whenText,
  type ParsedResult,
} from '../../../../components/match';
import { MatchStatus } from '../../../../components/match/MatchCard';
import { TuTag } from '../../../../components/ranking/parts';
import { useIsPro } from '../../../../components/mode';
import { Button, Card, Empty, ListRow, LoadError, PageSkeleton, RowIcon, Sheet, cx } from '../../../../components/ui';
import { appOrigin } from '../bits';
import { PointsCourt } from '../court/PointsCourt';
import { SetsCourt } from '../court/SetsCourt';
import { engineRules } from '../court/adapters';
import { parsePoints } from '../logic/night';
import { isPointsMatch } from '../logic/results';
import { rulesText } from '../logic/rulesText';
import { useNames } from '../names';
import { courtWords, useRacket } from '../sport';
import { BackBar, HideShellBar } from '../frame';
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
 * Un partido (rediseño «Calma y foco»): «‹ Americano del jueves» arriba (vuelve a donde estaba) con «•••»; el título
 * («Ronda 1 · Cancha 2»), el marcador grande, confirmar o reclamar (el rival) y UN botón: «Anotar en la cancha» (con
 * «Solo el resultado» debajo, en gris). Lo del admin (W.O., aplazar, reprogramar, suplente, corregir, anular, borrar),
 * compartir y el historial van en «•••»; decidir un reclamo, en su tarjeta. `shellBar`: la pantalla de abajo trae la
 * barra de la liga (Partidos, Mis partidos): esta la reemplaza.
 */
export function MatchDetail({
  matchId,
  eventId,
  title,
  onBack,
  backLabel,
  shellBar,
}: {
  matchId: string;
  eventId?: string | null;
  title?: string;
  onBack: () => void;
  /** Lo que dice «‹ …» (por defecto el título del evento o «Partidos»). */
  backLabel?: string;
  shellBar?: boolean;
}) {
  const { lid, isAdmin, member, league, base } = useLeagueCtx();
  const { sport, ext } = useRacket();
  const w = courtWords(ext);
  const { user } = useAuth();
  const { toast } = useFeedback();
  const param = useMatchParam();
  const q = useMatch(lid, matchId, { eventId });
  const list = useWithPendingPoints(lid, q.data ? [q.data] : []);
  const m = list[0] ?? null;
  const mySideOf = useMySide();
  const members = useLeagueMembers(lid);
  const [entry, setEntry] = useState<null | 'finish' | 'correct' | 'resolve'>(null);
  const [sheet, setSheet] = useState<null | 'compartir' | 'historial'>(null);
  const [busy, setBusy] = useState(false);
  const pro = useIsPro();
  const back = backLabel ?? title ?? 'Partidos';

  if (q.error) return <LoadError error={q.error} />;
  if (q.loading && !m) return <PageSkeleton />;
  if (!m) {
    return (
      <div className="flex flex-col px-2">
        {shellBar && <HideShellBar />}
        <BackBar label={back} onBack={onBack} />
        <Empty title="Este partido ya no existe">
          <button type="button" className="text-accent" onClick={onBack}>
            Volver
          </button>
        </Empty>
      </div>
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
  const history = historyLines(m.history, memberName, league.tz, w.one);

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
  const status = statusInfo(m);
  const heading = [m.stage || roundLabel(m.round, points ? 'Ronda' : 'Jornada'), m.court].filter(Boolean).join(' · ') || (points ? 'Partido de la noche' : 'Partido');
  const when = whenText(m.scheduledAt, league.tz, true);
  const shared = hasResult(m);

  return (
    <div className="flex flex-col px-2">
      {shellBar && <HideShellBar />}
      <BackBar label={back} onBack={onBack} right={<MatchAdmin match={m} onDeleted={onBack} onCorrect={() => setEntry('correct')} />} />
      <h1 className={pro ? 'mt-0.5 text-title-pro' : 'mt-1 text-title'}>{heading}</h1>
      {(m.status !== 'scheduled' || when) && (
        <p className={cx('flex min-w-0 flex-wrap items-center gap-x-1.5 text-meta text-muted', pro ? 'mt-1' : 'mt-1.5')}>
          {m.status !== 'scheduled' && <MatchStatus label={status.label} tone={status.tone} live={status.live} className="text-meta" />}
          {m.status !== 'scheduled' && when && <span aria-hidden="true">·</span>}
          {when && <span>{when}</span>}
        </p>
      )}

      <Scoreboard match={m} mySide={mySide} rules={points ? null : rulesText(rules)} className="mt-[22px]" />

      <ConfirmResultBanner lid={lid} match={m} mySide={mySide} isAdmin={isAdmin} className="mt-3.5" />

      {open && canScore && (
        <div className="mt-[22px] flex flex-col gap-2.5">
          <Button variant="primary" size={pro ? 'lg' : 'xl'} className="w-full" icon={<Play className="size-5" />} onClick={() => param.openCourt(m.id)}>
            {m.status === 'live' ? `Seguir anotando en la ${w.one}` : m.status === 'suspended' ? `Retomar en la ${w.one}` : `Anotar en la ${w.one}`}
          </Button>
          <Button variant="quiet" size="lg" className="w-full" icon={<Keyboard className="size-5" />} onClick={() => setEntry('finish')}>
            {points ? 'Poner el marcador' : 'Solo el resultado'}
          </Button>
        </div>
      )}

      {isAdmin && m.status === 'disputed' && (
        <Card className="mt-3.5 px-[18px] pt-4 pb-[18px]">
          <p className="inline-flex items-center gap-2 text-sm font-[650] text-danger">
            <Gavel aria-hidden="true" className="size-4" />
            En disputa
          </p>
          <p className="mt-2 text-body">{m.disputeNote ? `«${m.disputeNote}»` : 'El rival dice que el resultado no es así.'}</p>
          <div className="mt-4 flex gap-2.5">
            <Button variant="quiet" size="lg" className="flex-1" icon={<Undo2 className="size-4" />} loading={busy} onClick={() => void keepProposed()}>
              Dejar lo anotado
            </Button>
            <Button variant="primary" size="lg" className="flex-1" onClick={() => setEntry('resolve')}>
              Decidir el reclamo
            </Button>
          </div>
        </Card>
      )}

      {(shared || history.length > 0) && (
        <Card className="mt-[30px] overflow-hidden">
          {shared && (
            <ListRow
              leading={
                <RowIcon>
                  <Share2 className="size-5" />
                </RowIcon>
              }
              title="Compartir el resultado"
              subtitle="Imagen o texto para WhatsApp"
              onClick={() => setSheet('compartir')}
              dense={pro}
            />
          )}
          {history.length > 0 && (
            <ListRow
              leading={
                <RowIcon>
                  <History className="size-5" />
                </RowIcon>
              }
              title={`Historial (${history.length})`}
              subtitle={history[0].text}
              onClick={() => setSheet('historial')}
              dense={pro}
            />
          )}
        </Card>
      )}

      <Sheet open={sheet === 'compartir'} onClose={() => setSheet(null)} title="Compartir el resultado" subtitle={heading}>
        {sheet === 'compartir' && <ShareResultCard match={m} title={title ?? league.name} roundWord={points ? 'Ronda' : 'Jornada'} url={url} className="shadow-none!" />}
      </Sheet>
      <Sheet open={sheet === 'historial'} onClose={() => setSheet(null)} title="Historial" subtitle={heading}>
        <ul className="-mx-1 flex flex-col">
          {history.map((h, i) => (
            <li key={i} className={cx('px-1 py-3', i > 0 && 'border-t border-line')}>
              <p className="text-[15px] font-semibold">{h.text}</p>
              <p className="mt-0.5 text-[13px] text-muted">
                {new Date(h.at).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short', timeZone: league.tz || undefined })}
                {h.who ? ` · ${h.who}` : ''}
                {h.note ? ` · ${h.note}` : ''}
              </p>
            </li>
          ))}
        </ul>
      </Sheet>

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

/**
 * El marcador grande del partido: los dos lados con su marcador por set (o el total) en números de 30 px; el ganador en
 * negrita con copa y el lado propio con «Tú».
 */
function Scoreboard({ match: m, mySide, rules, className }: { match: Match; mySide: Side | null; rules: string | null; className?: string }) {
  const cols = scoreColumns(m.score);
  const walkover = m.status === 'walkover';
  return (
    <Card className={cx('px-[18px] pt-3 pb-4', className)}>
      {m.sides.map((s, i) => {
        const won = m.winner === s.side;
        const mine = mySide === s.side;
        const absent = walkover && (m.walkoverSide === s.side || m.walkoverSide === 0);
        return (
          <div key={s.side} className={cx('flex min-h-14 items-center gap-2.5', i > 0 && 'border-t border-line')}>
            <span className="min-w-0 flex-1">
              <span className={cx('flex min-w-0 items-center gap-1.5 text-[17px]', won ? 'font-bold' : m.winner ? 'font-medium text-muted' : 'font-semibold')}>
                <span className="truncate">{sideName(s)}</span>
                {mine && <TuTag small />}
              </span>
              {absent && <span className="block text-[13px] text-muted">No vino</span>}
            </span>
            {won && <Trophy className="size-5 shrink-0 text-gold" aria-label="Ganó" />}
            <span className="flex shrink-0 gap-3">
              {cols.length ? (
                cols.map((c, j) => {
                  const v = i === 0 ? c.a : c.b;
                  const other = i === 0 ? c.b : c.a;
                  return (
                    <span key={j} className={cx('num w-8 text-right text-[30px] leading-none', v > other ? 'font-bold text-fg' : 'font-medium text-faint')}>
                      {v}
                      {c.tb && v < other && <sup className="text-xs">{c.tb}</sup>}
                    </span>
                  );
                })
              ) : (
                <span className="num w-8 text-right text-[30px] leading-none font-medium text-faint">–</span>
              )}
            </span>
          </div>
        );
      })}
      {/* Las reglas del partido, chicas, debajo del marcador. */}
      {rules && <p className="mt-1 border-t border-line pt-3 text-[13px] text-muted">{rules}</p>}
    </Card>
  );
}
