import { Link } from 'react-router';
import { Layers, LogIn, Plus, Shield, Trophy } from 'lucide-react';
import { useCreateMenu } from '../CreateMenu';
import { parseActiveSport } from '../../lib/sportContext';
import { sportMeta } from '../../sports/registry';
import { SportIcon } from '../../pages/sports/SportBits';
import { Button, Card, Empty } from '../ui';
import { noLeaguesTitle, otherSportsText } from './logic';

/**
 * Sin ninguna liga ni torneo (del deporte, o de ninguno): qué es cada cosa y cómo empezar (crear, unirse a una pública
 * de abajo o con el código). Si tiene en otros deportes, ofrece verlos.
 */
export function NoLeaguesYet({ sport, others, onShowAll }: { sport: string | null; others: number; onShowAll?: () => void }) {
  const { startCreate } = useCreateMenu();
  const id = parseActiveSport(sport);
  const otherText = otherSportsText(others);
  return (
    <Empty icon={sport ? <SportIcon sport={sport} className="size-7" /> : <Shield className="size-7" />} title={noLeaguesTitle(sport)}>
      <p>
        Una <strong className="font-semibold text-fg">liga</strong> juega toda la temporada; un <strong className="font-semibold text-fg">torneo</strong> se
        juega en uno o pocos días. Únete a una pública aquí abajo, pon el código que te pasaron o crea la tuya.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => startCreate('liga', id)} className="h-11">
          Crear liga
        </Button>
        <Button icon={<Trophy className="size-4" />} onClick={() => startCreate('torneo', id)} className="h-11">
          Crear torneo
        </Button>
      </div>
      {otherText && onShowAll && (
        <p className="mt-3">
          {otherText}{' '}
          <button type="button" onClick={onShowAll} className="inline-flex min-h-11 items-center gap-1 font-medium text-accent hover:underline">
            <Layers className="size-4" aria-hidden="true" /> Ver todos los deportes
          </button>
        </p>
      )}
    </Empty>
  );
}

/** Tiene ligas pero ningún torneo (o al revés): una línea que explica y el botón para crear. */
export function NoneOfKind({ kind, sport }: { kind: 'liga' | 'torneo'; sport: string | null }) {
  const { startCreate } = useCreateMenu();
  const lower = sport ? ` de ${sportMeta(sport)?.lower ?? 'este deporte'}` : '';
  const torneo = kind === 'torneo';
  return (
    <Card className="flex items-center gap-3 px-4 py-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted" aria-hidden="true">
        {torneo ? <Trophy className="size-5" /> : <Shield className="size-5" />}
      </span>
      <p className="min-w-0 flex-1 text-sm text-muted">
        {torneo ? `No estás en ningún torneo${lower}. Se juegan en uno o pocos días.` : `No estás en ninguna liga${lower}. Juegan toda la temporada.`}
      </p>
      <Button size="sm" className="h-11 shrink-0" icon={<Plus className="size-4" />} onClick={() => startCreate(kind, parseActiveSport(sport))}>
        Crear
      </Button>
    </Card>
  );
}

/** Sin cuenta: las públicas se ven igual; para lo tuyo hay que entrar. */
export function SignedOutCard() {
  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <p className="flex-1 text-sm text-muted">Entra para ver tus ligas, tus torneos y lo que viene. Las públicas se ven sin cuenta.</p>
      <Link
        to="/login?next=%2Fligas"
        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg transition hover:brightness-110"
      >
        <LogIn className="size-4" aria-hidden="true" /> Entrar
      </Link>
    </Card>
  );
}
