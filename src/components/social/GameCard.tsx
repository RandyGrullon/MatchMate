import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';
import { BadgeCheck, ChevronRight, Flame, Flag, Medal, Timer } from 'lucide-react';
import { toIsoDate } from '../../lib/format';
import { gameSummary, type ProfileGame } from '../../lib/data/profileGames';
import { formatSwimTime } from '../../sports/swimming/time';
import { STROKE_LABEL } from '../../sports/swimming/events';
import { Badge, Card, cx } from '../ui';
import { LikeButton } from './LikeButton';
import { SportBadge } from './SportBadge';
import { UserLink } from './UserLink';
import { gameDateLabel, matchResult } from './socialFormat';

const strokeText = (s: string) => (STROKE_LABEL as Record<string, string>)[s] ?? s;

/**
 * Tarjeta de un juego para el perfil y el inicio (de cualquier deporte): quién (si `showUser`), el deporte, la liga
 * y el evento, el resultado a su manera (pinos, marcador, golpes, tiempo) y el me gusta. Tocar «Ver» abre el juego
 * en su liga.
 */
export function GameCard({ game, showUser, i = 0, today }: { game: ProfileGame; showUser?: boolean; i?: number; today?: string }) {
  const date = gameDateLabel(game.eventDate, today ?? toIsoDate(new Date()));
  const where = [game.leagueName, game.eventName].filter((s) => s && s.trim()).join(' · ');
  return (
    <Card className="flex flex-col gap-3 px-4 pt-3.5 pb-1.5" style={{ '--i': i } as CSSProperties}>
      <div className="flex items-start gap-3">
        {showUser ? (
          <UserLink userId={game.userId} name={game.userName} className="flex-1">
            <span className="block truncate text-xs font-normal text-muted">{where || 'Juego'}</span>
          </UserLink>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{game.eventName || game.leagueName || 'Juego'}</p>
            {game.eventName && game.leagueName && <p className="truncate text-xs text-muted">{game.leagueName}</p>}
          </div>
        )}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <SportBadge sport={game.sport} />
          {date && <span className="text-[11px] text-muted first-letter:uppercase">{date}</span>}
        </div>
      </div>

      <GameBody game={game} />

      <div className="-mx-2 flex items-center justify-between border-t border-line pt-1">
        <LikeButton game={game} />
        <Link
          to={game.url}
          className="inline-flex h-11 items-center gap-1 rounded-xl px-3 text-sm font-medium text-accent transition hover:bg-accent-soft"
          aria-label={`Ver el juego: ${gameSummary(game)}`}
        >
          Ver <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}

/** El número grande de la derecha con su nota. */
function Big({ value, note }: { value: ReactNode; note: string }) {
  return (
    <div className="shrink-0 text-right">
      <div className="text-2xl leading-tight font-bold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted">{note}</div>
    </div>
  );
}

function GameBody({ game }: { game: ProfileGame }) {
  switch (game.kind) {
    case 'bowling': {
      const d = game.detail;
      if (!d.scores.length) return <p className="text-sm text-muted">Sin juegos anotados</p>;
      const allVerified = d.verified.length > 0 && d.verified.every(Boolean);
      return (
        <div className="flex items-end gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {d.scores.map((s, k) => (
              <span
                key={k}
                className={cx(
                  'inline-flex min-w-11 items-center justify-center rounded-lg px-2 py-1 text-sm font-bold tabular-nums',
                  s >= 200 ? 'bg-accent text-accent-fg' : 'bg-surface-2',
                  d.verified[k] === false && 'opacity-70',
                )}
                title={`Juego ${k + 1}${d.verified[k] === false ? ' (sin verificar)' : ''}`}
              >
                {s >= 200 && <Flame className="mr-0.5 size-3" aria-hidden="true" />}
                {s}
              </span>
            ))}
            {allVerified && (
              <span className="inline-flex items-center gap-1 self-center text-[11px] font-medium text-ok">
                <BadgeCheck className="size-3.5" aria-hidden="true" /> Verificado
              </span>
            )}
          </div>
          <Big value={d.scores.length > 1 ? d.series : d.high} note={d.scores.length > 1 ? `Serie · alto ${d.high}` : 'Pinos'} />
        </div>
      );
    }
    case 'match': {
      const d = game.detail;
      const res = matchResult(game);
      const stage = d.stage ? d.stage : d.round ? `Jornada ${d.round}` : null;
      return (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {res ? <Badge tone={res.tone}>{res.label}</Badge> : <Badge>{d.final ? 'Jugado' : 'Por confirmar'}</Badge>}
              {stage && <span className="truncate text-xs text-muted">{stage}</span>}
            </div>
            <p className="mt-1.5 truncate text-sm">
              <span className="font-semibold">{d.mine || 'Su lado'}</span>
              <span className="text-muted"> vs </span>
              <span className="font-semibold">{d.opponent || 'Rival'}</span>
            </p>
          </div>
          {d.score && !d.walkover ? <Big value={d.score} note="Marcador" /> : null}
        </div>
      );
    }
    case 'golf': {
      const d = game.detail;
      const holes = d.played < d.holes ? `${d.played} de ${d.holes} hoyos` : `${d.holes} hoyos`;
      return (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
              <Flag className="size-4 shrink-0 text-muted" aria-hidden="true" />
              <span className="truncate">{d.course || 'Campo'}</span>
            </p>
            <p className="mt-1 text-xs text-muted">
              {holes}
              {d.playingHcp != null && ` · hcp ${d.playingHcp}`}
              {d.signed && ' · firmada'}
            </p>
          </div>
          {d.dq ? <Badge tone="danger">Descalificado</Badge> : <Big value={d.gross} note="Golpes" />}
        </div>
      );
    }
    case 'swim': {
      const d = game.detail;
      const ok = d.status === 'ok' && d.timeCs != null;
      return (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Timer className="size-4 shrink-0 text-muted" aria-hidden="true" />
              {d.distance} m {strokeText(d.stroke).toLowerCase()}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
              Piscina de {d.pool} m
              {d.place && d.place <= 3 && <Medal className="size-3.5 text-warn" aria-hidden="true" />}
              {d.place ? ` · ${d.place}.º lugar` : ''}
            </p>
          </div>
          {ok ? <Big value={formatSwimTime(d.timeCs)} note="Tiempo" /> : <Badge tone="warn">{d.status.toUpperCase()}</Badge>}
        </div>
      );
    }
  }
}
