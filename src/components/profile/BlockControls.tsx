import { useState } from 'react';
import { Ban, UserCheck } from 'lucide-react';
import { setBlocked } from '../../lib/data/profileSocial';
import { useBusy } from '../busy';
import { EventMenu, MoreButton, type MenuItem } from '../event/EventHeader';
import { saveErrorMessage, useFeedback } from '../feedback';
import { Button, Card, cx } from '../ui';

/** Lo que pasa al bloquear (va en la pregunta antes de hacerlo). */
export const BLOCK_EXPLAIN =
  'Ya no verán las publicaciones del otro, dejarán de seguirse y no te encontrará en la búsqueda. Puedes desbloquear cuando quieras.';

/**
 * Bloquear (con la pregunta antes) y desbloquear a alguien, con su ruedita y el aviso abajo. El perfil cambia solo (la
 * capa de datos pone `blockedByMe` y vuelve a leer sus publicaciones, la búsqueda y las listas).
 */
export function useBlockToggle(person: { id: string; name: string }) {
  const { confirm, toast } = useFeedback();
  const busy = useBusy<'bloquear'>();

  async function change(next: boolean): Promise<boolean> {
    if (next) {
      const ok = await confirm({ title: `¿Bloquear a ${person.name}?`, message: BLOCK_EXPLAIN, confirmText: 'Bloquear', danger: true });
      if (!ok) return false;
    }
    const done = await busy.run('bloquear', async () => {
      try {
        await setBlocked(person.id, next);
        toast(next ? `Bloqueaste a ${person.name}` : `Desbloqueaste a ${person.name}`);
        return true;
      } catch (e) {
        toast(saveErrorMessage(e), 'error');
        return false;
      }
    });
    return done === true;
  }

  return { busy: busy.isBusy(), block: () => change(true), unblock: () => change(false) };
}

/** «•••» arriba del perfil de otra cuenta (al lado de Reportar): una hoja con «Bloquear» o «Desbloquear». */
export function ProfileMoreMenu({ person, blocked }: { person: { id: string; name: string }; blocked: boolean }) {
  const [open, setOpen] = useState(false);
  const toggle = useBlockToggle(person);
  const items: MenuItem[] = [
    blocked
      ? {
          key: 'desbloquear',
          icon: UserCheck,
          label: `Desbloquear a ${person.name}`,
          hint: 'Vuelven a ver las publicaciones del otro',
          busy: toggle.busy,
          onClick: () => {
            setOpen(false);
            void toggle.unblock();
          },
        }
      : {
          key: 'bloquear',
          icon: Ban,
          label: `Bloquear a ${person.name}`,
          hint: 'Dejan de seguirse y no te encuentra',
          busy: toggle.busy,
          danger: true,
          onClick: () => {
            setOpen(false);
            void toggle.block();
          },
        },
  ];
  return (
    <>
      <MoreButton onClick={() => setOpen(true)} />
      <EventMenu open={open} onClose={() => setOpen(false)} title={person.name} items={items} />
    </>
  );
}

/** En vez de sus publicaciones y sus juegos: «Bloqueaste a Ana» con «Desbloquear». */
export function BlockedCard({ person, className }: { person: { id: string; name: string }; className?: string }) {
  const toggle = useBlockToggle(person);
  return (
    <Card className={cx('flex flex-col items-center px-5 pt-7 pb-5 text-center', className)}>
      <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-surface-2 text-fg-2">
        <Ban className="size-7" />
      </span>
      <h2 className="mt-4 text-card-title">Bloqueaste a {person.name}</h2>
      <p className="mt-2 max-w-sm text-body text-muted">No ves sus publicaciones ni sus juegos, y no te encuentra en la búsqueda.</p>
      <Button size="xl" variant="quiet" className="mt-6 w-full" loading={toggle.busy} icon={<UserCheck className="size-5" />} onClick={() => void toggle.unblock()}>
        Desbloquear
      </Button>
    </Card>
  );
}
