import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Timer } from 'lucide-react';
import { CourtLayout, CourtNote, TwoHalves } from '../../../../court';
import type { Match } from '../../../../lib/data/matches';
import { useLeagueCtx } from '../../../../lib/league';
import { serveInfo, type PointsConfig } from '../../../../sports/formats';
import { Button, cx } from '../../../../components/ui';
import { parsePoints } from '../logic/night';
import { usePointsCourt } from './usePointsCourt';

const clockKey = (id: string) => `mm:reloj:${id}`;

function readClock(id: string): number | null {
  try {
    const v = Number(localStorage.getItem(clockKey(id)));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function writeClock(id: string, at: number | null) {
  try {
    if (at === null) localStorage.removeItem(clockKey(id));
    else localStorage.setItem(clockKey(id), String(at));
  } catch {
    // sin almacenamiento: el reloj vive solo en pantalla
  }
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * La cancha del americano y el mexicano: dos mitades gigantes, se toca la pareja que ganó el punto (+1). Arriba
 * el total al que se juega (o el reloj si es por tiempo) y quién saca; avisa el cambio de saque. «Terminar»
 * guarda el marcador (empate incluido). Todo queda en el teléfono y sale solo al volver la señal.
 */
export function PointsCourt({ match, onExit, isAdmin, userId, title }: { match: Match; onExit: () => void; isAdmin: boolean; userId: string | null; title?: string }) {
  const { lid } = useLeagueCtx();
  const points = useMemo(() => parsePoints((match.rules as Record<string, unknown> | undefined)?.points), [match.rules]);
  const config = useMemo<PointsConfig>(() => ({ ...points, firstServe: 1 }), [points]);
  const court = usePointsCourt({ lid, matchId: match.id, userId, status: match.status, config });
  const [swap, setSwap] = useState(false);
  const [started, setStarted] = useState<number | null>(() => readClock(match.id));
  const [, tick] = useState(0);
  const s = court.state;
  const a = s?.score[0] ?? 0;
  const b = s?.score[1] ?? 0;
  const serve = s ? serveInfo(s) : null;
  const total = a + b;

  // Por tiempo: el reloj arranca con el primer punto (se guarda en el teléfono).
  useEffect(() => {
    if (points.mode !== 'time') return;
    if (total > 0 && started === null) {
      const now = Date.now();
      setStarted(now);
      writeClock(match.id, now);
    }
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [points.mode, total, started, match.id]);

  const names = [match.sides[0].label, match.sides[1].label] as const;
  const elapsed = started ? Date.now() - started : 0;
  const limit = (points.minutes ?? 15) * 60_000;
  const timeUp = points.mode === 'time' && started !== null && elapsed >= limit;
  const left = points.mode === 'total' ? Math.max(0, (points.target ?? 24) - total) : null;
  const winner = s && court.over ? (a === b ? null : a > b ? 1 : 2) : null;

  const header = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        {points.mode === 'total' ? (
          <p className="text-[19px] font-[650] tracking-[-0.01em]">
            A <span className="num">{points.target}</span> <span className="font-medium text-muted">· {court.over ? 'terminó' : `faltan ${left}`}</span>
          </p>
        ) : (
          <p className={cx('num flex items-center gap-1.5 text-[19px] font-[650]', timeUp && 'text-danger')}>
            <Timer className="size-5" />
            {mmss(elapsed)} <span className="font-medium text-muted">de {points.minutes}:00</span>
          </p>
        )}
        <Button variant="quiet" className="h-11 rounded-full px-4" icon={<ArrowLeftRight className="size-4" />} onClick={() => setSwap(!swap)} aria-label="Cambiar de lado en la pantalla">
          Lados
        </Button>
      </div>
      {serve && !court.over && (
        <CourtNote tone={serve.changed ? 'accent' : 'neutral'}>
          <span>
            {serve.changed ? 'Cambio de saque: ' : 'Saca: '}
            <b>{names[serve.side - 1]}</b>
          </span>
        </CourtNote>
      )}
      {timeUp && !court.over && (
        <CourtNote tone="danger" role="alert">
          ¡Tiempo! Toca «Terminar» para guardar el marcador.
        </CourtNote>
      )}
      {court.over && (
        <CourtNote tone="accent">
          {winner ? `Ganan ${names[winner - 1]} ${Math.max(a, b)}-${Math.min(a, b)}` : `Empate ${a}-${b}`}. Toca «Terminar».
        </CourtNote>
      )}
    </div>
  );

  return (
    <CourtLayout
      title={title ?? [match.court, match.round != null ? `Ronda ${match.round}` : null].filter(Boolean).join(' · ')}
      subtitle="Toca la pareja que ganó el punto"
      onExit={onExit}
      court={court}
      isAdmin={isAdmin}
      header={header}
      undoLabel="Deshacer punto"
      finishSummary={winner ? `${a}-${b} · Ganan ${names[winner - 1]}` : `${a}-${b}${s && a === b ? ' · Empate' : ''}`}
      onFinished={() => {
        writeClock(match.id, null);
        onExit();
      }}
    >
      <TwoHalves
        swap={swap}
        disabled={court.readOnly || court.over || !s}
        a={{ label: names[0], big: a, sub: serve?.side === 1 ? 'Saca' : ' ', onTap: () => court.apply({ type: 'point', side: 1 }), ariaLabel: `Punto para ${names[0]}` }}
        b={{ label: names[1], big: b, sub: serve?.side === 2 ? 'Saca' : ' ', onTap: () => court.apply({ type: 'point', side: 2 }), ariaLabel: `Punto para ${names[1]}` }}
      />
    </CourtLayout>
  );
}
