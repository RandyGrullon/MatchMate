import { Check, ChevronDown, Plus } from 'lucide-react';
import type { League } from '../../lib/types';
import { SportIcon } from '../../pages/sports/SportBits';
import { leagueSport } from '../../sports/registry';
import { LeagueLogo } from '../home/LeagueCard';
import { ListRow, RowIcon, Sheet, cx } from '../ui';
import { CountBubble, useToDoSummary } from './Hub';

/** El logo de la liga (o el ícono de su deporte) en el tamaño que se pida. */
function LeagueMark({ league, className, glyph }: { league: Pick<League, 'id' | 'sport' | 'logoPath'>; className: string; glyph: string }) {
  return (
    <LeagueLogo path={league.logoPath} className={className}>
      <SportIcon sport={leagueSport(league)} className={glyph} />
    </LeagueLogo>
  );
}

/**
 * La ficha de la liga debajo de «Organizar» («◎ Liga de los martes ⌄»): blanca, redonda, en el color del deporte. Se
 * ve de 36 px y se toca en 44. Abre la lista de lo que organizas.
 */
export function LeaguePickerChip({ league, onOpen, className }: { league: Pick<League, 'id' | 'sport' | 'logoPath' | 'name'> | null; onOpen: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={league ? `${league.name}: cambiar de liga` : 'Elegir la liga'}
      className={cx(
        'group relative inline-flex max-w-full self-start py-1 outline-none',
        'focus-visible:[&>span]:outline-2 focus-visible:[&>span]:outline-offset-2 focus-visible:[&>span]:outline-accent',
        className,
      )}
    >
      <span className="card-shadow inline-flex h-9 min-w-0 items-center gap-1.5 rounded-full bg-surface pr-3 pl-[13px] text-sm font-semibold transition group-active:scale-[0.97]">
        {league ? <LeagueMark league={league} className="size-[18px] shrink-0 rounded-[5px]" glyph="size-4 shrink-0 text-accent" /> : null}
        <span className="min-w-0 truncate">{league?.name ?? 'Elegir la liga'}</span>
        <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-fg-2" strokeWidth={2.4} />
      </span>
    </button>
  );
}

/** Una liga de la lista: lo que espera en ella y su número (o el visto, si es la que se está viendo). */
function PickRow({ league, current, onPick }: { league: League; current: boolean; onPick: () => void }) {
  const todo = useToDoSummary(league.id);
  const total = todo.count;
  return (
    <ListRow
      dense
      className="leading-[1.4]"
      leading={
        <LeagueLogo path={league.logoPath} className="size-10 shrink-0 rounded-xl">
          <RowIcon tone="accent">
            <SportIcon sport={leagueSport(league)} className="size-5" />
          </RowIcon>
        </LeagueLogo>
      }
      title={
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{league.name}</span>
          {current && <Check aria-label="(la que ves)" className="size-4 shrink-0 text-accent" strokeWidth={2.6} />}
        </span>
      }
      subtitle={todo.line || (todo.loading ? undefined : 'Todo al día')}
      onClick={onPick}
      ariaLabel={total > 0 ? `${league.name}: ${total} ${total === 1 ? 'pendiente' : 'pendientes'}` : league.name}
      trailing={total > 0 ? <CountBubble n={total} /> : undefined}
      chevron={false}
    />
  );
}

/** La hoja «Lo que organizas»: tus ligas y torneos (con lo que espera en cada uno) y «Crear una liga o un torneo». */
export function LeaguePickerSheet({
  open,
  onClose,
  leagues,
  current,
  onPick,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  leagues: readonly League[];
  current: string | null;
  onPick: (lid: string) => void;
  onCreate: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Lo que organizas" subtitle="Elige la liga o el torneo">
      <div className="-mx-5 flex flex-col">
        {leagues.map((l) => (
          <PickRow
            key={l.id}
            league={l}
            current={l.id === current}
            onPick={() => {
              onClose();
              onPick(l.id);
            }}
          />
        ))}
        <ListRow
          dense
          leading={
            <RowIcon tone="accent">
              <Plus className="size-5" strokeWidth={2.4} />
            </RowIcon>
          }
          title="Crear una liga o un torneo"
          onClick={() => {
            onClose();
            onCreate();
          }}
          chevron={false}
        />
      </div>
    </Sheet>
  );
}
