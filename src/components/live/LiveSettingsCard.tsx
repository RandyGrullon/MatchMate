import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Radio } from 'lucide-react';
import { setLeagueLive } from '../../lib/data/streams';
import { useLeagueCtx } from '../../lib/league';
import { leagueSport } from '../../sports/registry';
import { BusyIcon } from '../busy';
import { useAction } from '../feedback';
import { Card, cx } from '../ui';
import { liveHref } from './LiveParts';

/**
 * «Transmisiones en vivo» en los ajustes de la liga (`leagues.live_enabled`, set_league_live): los admins la prenden o
 * la apagan. Prendida, los admins y anotadores ponen el link de un partido, sale arriba en la liga y avisa a los
 * miembros y seguidores. Lo elegido se ve al momento; si falla, vuelve.
 */
export function LiveSettingsCard({ lid, className }: { lid: string; className?: string }) {
  const { league, isAdmin } = useLeagueCtx();
  const run = useAction();
  const [saving, setSaving] = useState(false);
  // Lo elegido se ve al momento; cuando llega la liga de nuevo, manda la base.
  const [picked, setPicked] = useState<{ from: boolean; to: boolean } | null>(null);
  const saved = league.liveEnabled === true;
  const on = picked && picked.from === saved ? picked.to : saved;
  // En el boliche transmiten solo los admins (como start_stream).
  const who = leagueSport(league) === 'bowling' ? 'Los admins' : 'Los admins y anotadores';
  const explain = `${who} podrán poner el link de YouTube, Twitch, Facebook, Kick, Instagram o TikTok de un partido; sale arriba en ${
    league.kind === 'torneo' ? 'el torneo' : 'la liga'
  } y avisa a los miembros y seguidores.`;

  const toggle = async () => {
    if (!isAdmin || saving) return;
    const next = !on;
    setSaving(true);
    setPicked({ from: saved, to: next });
    const ok = await run(async () => {
      await setLeagueLive(lid, next);
      return true;
    }, next ? 'Transmisiones en vivo activadas' : 'Transmisiones en vivo apagadas');
    if (!ok) setPicked(null);
    setSaving(false);
  };

  return (
    <Card className={cx('overflow-hidden', className)}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-busy={saving || undefined}
        disabled={!isAdmin}
        onClick={() => void toggle()}
        className={cx(
          'flex w-full items-start gap-3 px-4 py-4 text-left transition active:bg-surface-2 disabled:opacity-60',
          'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
        )}
      >
        <Radio className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold tracking-tight">Transmisiones en vivo</span>
          <span className="mt-0.5 block text-sm text-muted">{explain}</span>
        </span>
        <span
          aria-hidden="true"
          className={cx('mt-0.5 flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors', on ? 'bg-accent' : 'bg-surface-2 ring-1 ring-line ring-inset')}
        >
          {/* Mientras se guarda, la ruedita en la bolita (se ve ya cambiado; si falla, vuelve). */}
          <span className={cx('flex size-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform', on && 'translate-x-5')}>
            <BusyIcon busy={saving} className="size-3.5 text-accent" />
          </span>
        </span>
      </button>
      {on && saved && (
        <Link
          to={liveHref(lid)}
          className="flex min-h-12 items-center gap-2 border-t border-line px-4 text-sm font-semibold text-accent transition active:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          <span className="min-w-0 flex-1">Ir a En vivo</span>
          <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
        </Link>
      )}
    </Card>
  );
}
