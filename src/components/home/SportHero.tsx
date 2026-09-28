import { Link } from 'react-router';
import { LayoutGrid, Plus, Trophy } from 'lucide-react';
import { setActiveSport } from '../../lib/sportContext';
import { SPORTS } from '../../sports/registry';
import type { SportStatus } from '../../sports/status';
import type { SportId } from '../../sports/types';
import { SportSplash } from '../splash/SportSplash';
import { Badge, Button } from '../ui';
import { SportTint } from './SportTint';

/** «2 ligas tuyas · 5 públicas», «Ninguna liga tuya todavía». */
export function heroCountsLabel(mine: number, publicCount: number): string {
  const a = mine ? `${mine} ${mine === 1 ? 'liga tuya' : 'ligas tuyas'}` : 'Ninguna liga tuya todavía';
  const b = publicCount ? `${publicCount} ${publicCount === 1 ? 'pública' : 'públicas'}` : '';
  return [a, b].filter(Boolean).join(' · ');
}

/**
 * La portada del Home de un deporte, en su color: su animación, el nombre, cuántas ligas tengo y cuántas públicas
 * hay, «Crear liga de <deporte>» (con el deporte ya marcado) y volver a «Todos los deportes».
 */
export function SportHero({
  sport,
  status,
  mine,
  publicCount,
  signedIn,
  canCreate,
  onCreate,
}: {
  sport: SportId;
  status: SportStatus | undefined;
  mine: number;
  publicCount: number;
  signedIn: boolean;
  canCreate: boolean;
  onCreate: (kind: 'liga' | 'torneo') => void;
}) {
  const meta = SPORTS[sport];
  return (
    <SportTint sport={sport}>
      <section
        className="animate-fade-up relative overflow-hidden rounded-3xl border border-accent/30 bg-gradient-to-br from-accent-soft via-accent-soft/40 to-surface card-shadow"
        aria-label={meta.label}
        data-tour="portada-deporte"
      >
        <div className="flex items-center gap-3 px-4 pt-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-wide text-accent uppercase">Estás en</p>
            <h1 className="text-3xl leading-tight font-extrabold tracking-tight break-words">{meta.label}</h1>
            <p className="mt-0.5 text-sm text-muted">{signedIn ? heroCountsLabel(mine, publicCount) : `Ligas y torneos de ${meta.lower}`}</p>
            {status && status !== 'open' && (
              <Badge tone={status === 'beta' ? 'warn' : 'neutral'} className="mt-1.5">
                {status === 'beta' ? 'En prueba' : 'Pronto'}
              </Badge>
            )}
          </div>
          <SportSplash sport={sport} word={false} width={120} className="pointer-events-none -mr-2 shrink-0" />
        </div>
        <div className="flex flex-col gap-2 p-4">
          {canCreate ? (
            <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-[1fr_auto]">
              <Button variant="primary" className="h-11 min-w-0" icon={<Plus className="size-4" />} onClick={() => onCreate('liga')} data-tour="crear-deporte">
                <span className="truncate">Crear liga de {meta.lower}</span>
              </Button>
              <Button
                className="h-11"
                icon={<Trophy className="size-4" />}
                onClick={() => onCreate('torneo')}
                aria-label={`Crear torneo de ${meta.lower} sin liga`}
              >
                Torneo
              </Button>
            </div>
          ) : (
            signedIn && <p className="text-sm text-muted">Crear ligas de {meta.lower} se abre pronto. Mientras, puedes unirte a las que ya hay.</p>
          )}
          <Link
            to="/"
            onClick={() => setActiveSport(null)}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 self-center text-sm font-medium text-accent"
          >
            <LayoutGrid className="size-4" aria-hidden="true" /> Ver todos los deportes
          </Link>
        </div>
      </section>
    </SportTint>
  );
}
