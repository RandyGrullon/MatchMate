import { Link } from 'react-router';
import { Search, Users } from 'lucide-react';
import { useFollowList, type FollowKind, type FollowPerson } from '../../lib/data/follows';
import { Badge, Button, Empty, ListSkeleton, LoadError, Modal, Tabs } from '../ui';
import { FollowButton } from './FollowButton';
import { UserLink } from './UserLink';
import { compactCount } from './socialFormat';

/**
 * Seguidores y seguidos de una cuenta en una hoja con dos pestañas. Cada persona lleva a su perfil (con su
 * @usuario) y trae su botón de seguir (menos tú). Por páginas de 30 con «Ver más». Abajo, «Buscar personas» (/buscar).
 */
export function FollowersSheet({
  userId,
  name,
  kind,
  counts,
  onKind,
  onClose,
}: {
  userId: string;
  name: string;
  /** Pestaña abierta; null = cerrada. */
  kind: FollowKind | null;
  counts: { followers: number; following: number };
  onKind: (k: FollowKind) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={kind != null}
      onClose={onClose}
      title={name}
      footer={
        <Link
          to="/buscar"
          onClick={onClose}
          className="inline-flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-accent transition hover:bg-accent-soft active:scale-[0.97]"
        >
          <Search className="size-4" aria-hidden="true" /> Buscar personas
        </Link>
      }
    >
      {kind && (
        <div className="flex flex-col gap-4">
          <Tabs<FollowKind>
            items={[
              { key: 'followers', label: `${compactCount(counts.followers)} Seguidores` },
              { key: 'following', label: `${compactCount(counts.following)} Siguiendo` },
            ]}
            active={kind}
            onChange={onKind}
          />
          <FollowPeople key={kind} userId={userId} kind={kind} onPick={onClose} />
        </div>
      )}
    </Modal>
  );
}

function FollowPeople({ userId, kind, onPick }: { userId: string; kind: FollowKind; onPick: () => void }) {
  const list = useFollowList(userId, kind);
  if (list.loading && !list.data.length) return <ListSkeleton rows={4} />;
  if (list.error && !list.data.length) return <LoadError error={list.error} onRetry={list.refresh} />;
  if (!list.data.length) {
    return (
      <Empty icon={<Users className="size-7" aria-hidden="true" />} title={kind === 'followers' ? 'Todavía nadie lo sigue' : 'Todavía no sigue a nadie'}>
        {kind === 'followers' ? 'Cuando alguien lo siga, sale aquí.' : 'Cuando siga a alguien, sale aquí.'}
      </Empty>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="-mx-2 flex flex-col">
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

function PersonRow({ person, onPick }: { person: FollowPerson; onPick: () => void }) {
  return (
    <li className="flex items-center gap-2 rounded-xl px-2 py-1.5">
      <div className="min-w-0 flex-1" onClickCapture={onPick}>
        <UserLink userId={person.id} name={person.name} username={person.username}>
          {person.isMe ? (
            <span className="block text-xs font-normal text-muted">Tú</span>
          ) : person.followsYou ? (
            <Badge className="mt-0.5">Te sigue</Badge>
          ) : null}
        </UserLink>
      </div>
      {!person.isMe && <FollowButton userId={person.id} name={person.name} following={person.isFollowing} followsYou={person.followsYou} size="sm" />}
    </li>
  );
}
