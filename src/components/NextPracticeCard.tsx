import { useState } from 'react';
import { CalendarCheck, CalendarDays, Check, X } from 'lucide-react';
import { setRsvp } from '../lib/data';
import { formatDateLong, toIsoDate } from '../lib/format';
import { useLeagueCtx } from '../lib/league';
import type { BowlingEvent } from '../lib/types';
import { useAction } from './feedback';
import { Button, Card, cx } from './ui';

/** Próxima práctica: el jugador confirma si va (el admin sabe cuántas pistas pedir). */
export function NextPracticeCard({ events, playerId }: { events: BowlingEvent[]; playerId: string }) {
  const { lid } = useLeagueCtx();
  const run = useAction();
  const [busy, setBusy] = useState(false);
  const today = toIsoDate(new Date());
  const next = events
    .filter((e) => e.type === 'practica' && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next) return null;

  const going = !!next.rsvp?.[playerId];
  const count = Object.keys(next.rsvp ?? {}).length;

  async function toggle(value: boolean) {
    setBusy(true);
    await run(() => setRsvp(lid, next.id, playerId, value), value ? '¡Te esperamos!' : 'Listo, no vas');
    setBusy(false);
  }

  return (
    <Card tour="proxima-practica" className={cx('animate-fade-up flex flex-col gap-3 p-4 transition sm:flex-row sm:items-center', going && 'border-ok/40 bg-ok-soft/40')}>
      <div className="flex flex-1 items-center gap-3">
        <div className={cx('flex size-11 shrink-0 items-center justify-center rounded-2xl', going ? 'bg-ok-soft text-ok' : 'bg-accent-soft text-accent')}>
          {going ? <CalendarCheck className="size-5" /> : <CalendarDays className="size-5" />}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted">Próxima práctica</p>
          <p className="font-semibold first-letter:uppercase">{formatDateLong(next.date)}</p>
          <p className="text-xs text-muted">
            {count === 0 ? 'Nadie ha confirmado todavía' : `${count} ${count === 1 ? 'confirmado' : 'confirmados'}`}
          </p>
        </div>
      </div>
      {going ? (
        <Button onClick={() => toggle(false)} loading={busy} icon={<X className="size-4" />}>
          Ya no voy
        </Button>
      ) : (
        <Button variant="primary" onClick={() => toggle(true)} loading={busy} icon={<Check className="size-4" />}>
          Voy
        </Button>
      )}
    </Card>
  );
}
