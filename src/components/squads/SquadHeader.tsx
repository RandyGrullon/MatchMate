import { ChevronRight, Users } from 'lucide-react';
import { recordText, useSquadFollowers, type SquadPage } from '../../lib/data/squads';
import { sportMeta } from '../../sports/registry';
import { SportIcon } from '../../pages/sports/SportBits';
import { PersonRow } from '../social/FollowersSheet';
import { compactCount } from '../social/socialFormat';
import { Badge, Button, Card, Empty, ListSkeleton, LoadError, Modal, cx } from '../ui';
import { recordSummary, type SquadTab } from './logic';
import { SquadLogo } from './SquadBits';

/**
 * Lo de arriba de la página de un equipo, como un perfil: el logo (o el tag en su color), el nombre, «[TAG] · deporte ·
 * ciudad», «Busca jugadores» y la descripción, sobre el color del equipo.
 */
export function SquadHeader({ squad, pro }: { squad: SquadPage; pro: boolean }) {
  const meta = sportMeta(squad.sport);
  return (
    <header className="mt-1 rounded-[28px] bg-accent-soft px-5 pt-5 pb-5">
      <div className={cx('flex items-center', pro ? 'gap-3.5' : 'gap-4')}>
        <SquadLogo squad={squad} className={pro ? 'size-15' : 'size-18'} />
        <div className="min-w-0">
          <h1 className={cx('font-bold break-words', pro ? 'text-[22px] leading-[1.2] tracking-[-0.02em]' : 'text-[26px] leading-[1.15] tracking-[-0.025em]')}>{squad.name}</h1>
          <p className={cx('flex flex-wrap items-center gap-x-1.5 text-fg-2', pro ? 'mt-0.5 text-sm' : 'mt-[3px] text-meta')}>
            <span className="font-semibold tracking-[0.08em]">[{squad.tag}]</span>
            <span className="inline-flex items-center gap-1 font-semibold text-accent">
              <SportIcon sport={squad.sport} className="size-4" />
              {meta?.label ?? 'Otro deporte'}
            </span>
            {squad.city && <span>· {squad.city}</span>}
          </p>
          {squad.recruiting && (
            <Badge tone="accent" className="mt-1.5 bg-surface!">
              Busca jugadores
            </Badge>
          )}
        </div>
      </div>
      {squad.description && <p className={cx('mt-3.5 break-words whitespace-pre-line text-fg-2', pro ? 'text-sm' : 'text-body')}>{squad.description}</p>}
    </header>
  );
}

/**
 * Los números del equipo en una tarjeta, como los de un perfil: Publicaciones · Seguidores · Me gusta · Miembros (tocar
 * abre la parte o la lista de seguidores) y, debajo, el récord (lleva a Estadísticas).
 */
export function SquadCounters({ squad, onTab, onFollowers }: { squad: SquadPage; onTab: (t: SquadTab) => void; onFollowers: () => void }) {
  const posts = squad.posts ?? 0;
  const likes = squad.likes ?? 0;
  const counters: { key: string; value: number; label: string; onClick: () => void }[] = [
    { key: 'posts', value: posts, label: posts === 1 ? 'Publicación' : 'Publicaciones', onClick: () => onTab('publicaciones') },
    { key: 'followers', value: squad.followers, label: squad.followers === 1 ? 'Seguidor' : 'Seguidores', onClick: onFollowers },
    { key: 'likes', value: likes, label: 'Me gusta', onClick: () => onTab('publicaciones') },
    { key: 'members', value: squad.members, label: squad.members === 1 ? 'Miembro' : 'Miembros', onClick: () => onTab('plantilla') },
  ];
  const record = recordText(squad.record);
  const summary = recordSummary(squad.record);
  return (
    <Card className="mt-3.5 overflow-hidden">
      <ul aria-label="Números del equipo" className="grid grid-cols-4">
        {counters.map((c, i) => (
          <li key={c.key} className="min-w-0">
            <button
              type="button"
              onClick={c.onClick}
              className={cx(
                'relative flex min-h-[76px] w-full min-w-0 flex-col justify-center px-3 py-3 text-left transition active:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-[389px]:px-2',
                i > 0 && "before:absolute before:inset-y-[14px] before:left-0 before:w-px before:bg-line before:content-['']",
              )}
            >
              <b className="num text-[23px] leading-[1.15] font-[650]">{compactCount(c.value)}</b>
              <span className="text-[11px] leading-tight font-[550] break-words hyphens-auto text-muted min-[390px]:text-xs">{c.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onTab('estadisticas')}
        className="flex min-h-14 w-full items-center gap-3 border-t border-line px-4 py-2.5 text-left transition active:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-[389px]:px-3"
      >
        <span className="text-xs font-[550] text-muted">Récord</span>
        <b className="num text-[17px] font-[650]">{record || '—'}</b>
        <span className="min-w-0 flex-1 truncate text-xs text-muted">{summary || 'Sin partidos todavía'}</span>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-faint" />
      </button>
    </Card>
  );
}

/** Quiénes siguen al equipo (también sin cuenta), cada uno con su perfil y su botón de seguir. Por páginas de 30. */
export function SquadFollowersSheet({ squad, open, onClose }: { squad: Pick<SquadPage, 'id' | 'name' | 'followers'>; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={`Seguidores de ${squad.name}`}>
      {open && <FollowersList squadId={squad.id} onPick={onClose} />}
    </Modal>
  );
}

function FollowersList({ squadId, onPick }: { squadId: string; onPick: () => void }) {
  const list = useSquadFollowers(squadId);
  if (list.loading && !list.data.length) return <ListSkeleton rows={4} />;
  if (list.error && !list.data.length) return <LoadError error={list.error} onRetry={list.refresh} />;
  if (!list.data.length) {
    return (
      <Empty icon={<Users className="size-7" aria-hidden="true" />} title="Todavía nadie sigue a este equipo">
        Cuando alguien lo siga, sale aquí.
      </Empty>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="-mx-2 flex flex-col" aria-label="Seguidores">
        {list.data.map((p) => (
          <PersonRow key={p.id} person={p} onPick={onPick} />
        ))}
      </ul>
      {list.moreError && <p className="text-center text-sm text-danger">No se pudieron cargar más. Intenta de nuevo.</p>}
      {list.hasMore && (
        <Button className="h-11 self-center" loading={list.loadingMore} onClick={() => void list.loadMore()}>
          Ver más
        </Button>
      )}
    </div>
  );
}
