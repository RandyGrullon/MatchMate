import { useState } from 'react';
import { Palette } from 'lucide-react';
import { BADGE_MAKERS_OPTIONS, badgeMakersOf, setBadgePolicy, type BadgeMakers } from '../../../lib/data/leagueBadges';
import { useLeagueCtx } from '../../../lib/league';
import { useAction } from '../../feedback';
import { Card, Spinner, cx } from '../../ui';

/**
 * «¿Quién diseña y da insignias?» (§5.1): «Solo yo», «Yo y los admins» (por defecto) o «Yo y los que yo elija» (se
 * marcan en Miembros con «Diseña insignias»). Sin `onChange` queda de solo lectura (los admins lo ven).
 */
export function BadgeMakersChoice({
  value,
  onChange,
  busy,
  name = 'quien-disena',
}: {
  value: BadgeMakers;
  onChange?: (v: BadgeMakers) => void;
  busy?: BadgeMakers | null;
  name?: string;
}) {
  return (
    <fieldset className="min-w-0 flex flex-col gap-1" disabled={!onChange || !!busy}>
      <legend className="sr-only">¿Quién diseña y da insignias?</legend>
      {BADGE_MAKERS_OPTIONS.map((o) => (
        <label
          key={o.value}
          className={cx(
            'flex min-h-11 items-start gap-3 rounded-xl border px-3 py-2.5 transition',
            value === o.value ? 'border-accent bg-accent-soft/40' : 'border-line',
            onChange ? 'cursor-pointer hover:bg-surface-2' : 'opacity-80',
          )}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange?.(o.value)}
            className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-sm font-semibold">
              {onChange ? o.label : o.who[0].toUpperCase() + o.who.slice(1)}
              {busy === o.value && <Spinner className="size-4" />}
            </span>
            {onChange && <span className="block text-xs text-muted">{o.hint}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** La tarjeta de los ajustes de la liga: la cambia el dueño; los admins la ven. */
export function BadgeMakersCard() {
  const { lid, league, isOwner } = useLeagueCtx();
  const run = useAction();
  const [busy, setBusy] = useState<BadgeMakers | null>(null);
  // Lo elegido se ve al momento; cuando llega la liga de nuevo, manda la base.
  const [picked, setPicked] = useState<{ from: BadgeMakers; to: BadgeMakers } | null>(null);
  const saved = badgeMakersOf(league);
  const value = picked && picked.from === saved ? picked.to : saved;

  const change = async (v: BadgeMakers) => {
    if (v === value) return;
    setBusy(v);
    setPicked({ from: saved, to: v });
    const ok = await run(() => setBadgePolicy(lid, v), 'Listo: ya sabemos quién diseña las insignias');
    if (ok === undefined) setPicked(null);
    setBusy(null);
  };

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-2.5">
        <Palette className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-tight">¿Quién diseña y da insignias?</h2>
          <p className="text-sm text-muted">
            Las insignias propias de la liga (más abajo, en «Insignias de la liga»). Nadie se las da a sí mismo. {isOwner ? 'Tú decides.' : 'Solo el dueño lo cambia.'}
          </p>
        </div>
      </div>
      <BadgeMakersChoice value={value} busy={busy} onChange={isOwner ? (v) => void change(v) : undefined} />
      {value === 'chosen' && isOwner && <p className="text-xs text-muted">Marca a quién en Miembros con «Diseña insignias».</p>}
    </Card>
  );
}
