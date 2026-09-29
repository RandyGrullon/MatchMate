import { useState } from 'react';
import { Award } from 'lucide-react';
import { setBadgesAuto, type BadgesAutoMode } from '../../lib/data/badges';
import { useLeagueCtx } from '../../lib/league';
import { useAction } from '../feedback';
import { Card, Spinner, cx } from '../ui';

/** Las tres opciones de «Insignias automáticas» (§6.5). */
export const BADGES_AUTO_OPTIONS: readonly { mode: BadgesAutoMode; label: string; hint: string }[] = [
  { mode: 'todas', label: 'Todas', hint: 'Resultados, marcas, hitos, constancia y los premios del mes y de la temporada.' },
  {
    mode: 'sin_titulos',
    label: 'Sin títulos',
    hint: 'Sin las que comparan a unos con otros (figura, podios, títulos). Recomendado para ligas con menores.',
  },
  { mode: 'ninguna', label: 'Ninguna', hint: 'La liga no da insignias automáticas. Las de cada cuenta (constancia, kilometraje) siguen.' },
];

/** El modo de la liga (sin dato: con menores, «Sin títulos»; si no, «Todas»). */
export const badgesAutoOf = (league: { badgesAuto?: BadgesAutoMode; hasMinors?: boolean }): BadgesAutoMode =>
  league.badgesAuto ?? (league.hasMinors ? 'sin_titulos' : 'todas');

/**
 * «Insignias automáticas» en los ajustes de la liga: lo cambia el dueño; los admins lo ven. Sin `onChange` las
 * opciones quedan de solo lectura.
 */
export function BadgesAutoChoice({
  value,
  onChange,
  busy,
  name = 'insignias-automaticas',
}: {
  value: BadgesAutoMode;
  onChange?: (mode: BadgesAutoMode) => void;
  busy?: BadgesAutoMode | null;
  name?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-1" disabled={!onChange || !!busy}>
      <legend className="sr-only">Insignias automáticas</legend>
      {BADGES_AUTO_OPTIONS.map((o) => (
        <label
          key={o.mode}
          className={cx(
            'flex min-h-11 items-start gap-3 rounded-xl border px-3 py-2.5 transition',
            value === o.mode ? 'border-accent bg-accent-soft/40' : 'border-line',
            onChange ? 'cursor-pointer hover:bg-surface-2' : 'opacity-80',
          )}
        >
          <input
            type="radio"
            name={name}
            value={o.mode}
            checked={value === o.mode}
            onChange={() => onChange?.(o.mode)}
            className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-sm font-semibold">
              {o.label}
              {busy === o.mode && <Spinner className="size-4" />}
            </span>
            <span className="block text-xs text-muted">{o.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** La tarjeta de los ajustes de la liga. */
export function BadgesSettingsCard() {
  const { lid, league, isOwner } = useLeagueCtx();
  const run = useAction();
  const [busy, setBusy] = useState<BadgesAutoMode | null>(null);
  // Lo elegido se ve al momento; cuando llega la liga de nuevo, manda la base.
  const [picked, setPicked] = useState<{ from: BadgesAutoMode; to: BadgesAutoMode } | null>(null);
  const saved = badgesAutoOf(league);
  const value = picked && picked.from === saved ? picked.to : saved;

  const change = async (mode: BadgesAutoMode) => {
    if (mode === value) return;
    setBusy(mode);
    setPicked({ from: saved, to: mode });
    const ok = await run(() => setBadgesAuto(lid, mode), 'Insignias automáticas guardadas');
    if (ok === undefined) setPicked(null);
    setBusy(null);
  };

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-2.5">
        <Award className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-tight">Insignias automáticas</h2>
          <p className="text-sm text-muted">
            MatchMate las da solo con los resultados de la liga. {isOwner ? 'Tú decides cuáles.' : 'Solo el dueño lo cambia.'}
          </p>
        </div>
      </div>
      <BadgesAutoChoice value={value} busy={busy} onChange={isOwner ? (m) => void change(m) : undefined} />
    </Card>
  );
}
