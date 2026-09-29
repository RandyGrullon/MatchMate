import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Check, Clock, Search, UserPlus } from 'lucide-react';
import type { UnitPair } from '../../sports/registry';
import { Avatar } from '../Avatar';
import { Badge, Button, Input, Modal, cx } from '../ui';
import { PICKER_SEARCH_FROM, searchPlayers } from './logic';

export { joinClaimMessage } from '../claims/logic';

export interface PickablePlayer {
  id: string;
  name: string;
}

/** Lo elegido: el id del jugador, o `null` = «No estoy en la lista» (se crea el suyo). */
export type WhoChoice = string | null;

/**
 * «¿Quién eres?»: la lista de jugadores que el admin ya anotó y que todavía no tienen cuenta, para unirse como uno
 * de ellos (así no sale dos veces en la tabla). La última opción es «No estoy en la lista».
 *
 * Elegir uno ya no vincula al momento: al unirse (join_league con p_prefer) queda el pedido y el dueño o un admin
 * de la liga lo aprueba (src/components/claims). Mientras, la cuenta juega con su propio jugador. `pending` marca
 * el jugador que la cuenta ya pidió («Pendiente de aprobación»). Para el toast después de unirse:
 * `joinClaimMessage(elegido, nombre, player_id, claim_id)`.
 */
export function WhoAreYouList({
  players,
  value,
  onChange,
  people = ['jugador', 'jugadores'],
  pending = null,
}: {
  players: readonly PickablePlayer[];
  value: WhoChoice;
  onChange: (v: WhoChoice) => void;
  people?: UnitPair;
  /** El jugador que la cuenta ya pidió y espera la aprobación del admin. */
  pending?: string | null;
}) {
  const [q, setQ] = useState('');
  const name = useId();
  const shown = useMemo(() => searchPlayers(players, q), [players, q]);
  const option = (id: WhoChoice, label: string, icon: ReactNode) => {
    const on = value === id;
    return (
      <label
        key={id ?? 'nuevo'}
        className={cx(
          'flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/50 has-[:focus-visible]:ring-inset',
          on ? 'bg-accent-soft' : 'hover:bg-surface-2',
        )}
      >
        <input type="radio" name={name} className="sr-only" checked={on} onChange={() => onChange(id)} />
        {icon}
        <span className={cx('min-w-0 flex-1 truncate', on ? 'font-semibold text-accent' : 'font-medium')}>{label}</span>
        {id && id === pending && (
          <Badge tone="warn" className="shrink-0">
            <Clock className="size-3" aria-hidden="true" /> Pendiente de aprobación
          </Badge>
        )}
        <span
          aria-hidden="true"
          className={cx(
            'flex size-5 shrink-0 items-center justify-center rounded-full border',
            on ? 'border-accent bg-accent text-accent-fg' : 'border-line',
          )}
        >
          {on && <Check className="size-3.5" />}
        </span>
      </label>
    );
  };

  return (
    <fieldset className="flex flex-col gap-2 text-left">
      <legend className="mb-1 text-sm text-muted">
        {`El admin ya anotó a estos ${people[1]}. Si uno eres tú, elígelo: cuando el admin lo apruebe, sus resultados quedan con tu cuenta.`}
      </legend>
      {players.length >= PICKER_SEARCH_FROM && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca tu nombre" aria-label="Busca tu nombre" className="pl-9" />
        </div>
      )}
      <div className="max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line">
        {shown.map((p) => option(p.id, p.name, <Avatar name={p.name} className="size-8 text-xs" />))}
        {shown.length === 0 && <p className="px-3 py-3 text-center text-sm text-muted">Nadie se llama así en la lista.</p>}
        {option(
          null,
          'No estoy en la lista',
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
            <UserPlus className="size-4" />
          </span>,
        )}
      </div>
      {value && value !== pending && (
        <p className="flex items-start gap-1.5 text-xs text-muted" aria-live="polite">
          <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {`Queda pendiente de aprobación del admin. Mientras, juegas con tu cuenta.`}
        </p>
      )}
    </fieldset>
  );
}

/** «¿Quién eres?» antes de unirse desde una liga pública (el botón «Unirme» de la liga). */
export function WhoAreYouModal({
  open,
  onClose,
  players,
  initial,
  busy,
  joinText,
  people,
  onJoin,
}: {
  open: boolean;
  onClose: () => void;
  players: readonly PickablePlayer[];
  initial: WhoChoice;
  busy: boolean;
  joinText: string;
  people?: UnitPair;
  onJoin: (choice: WhoChoice) => void;
}) {
  const [value, setValue] = useState<WhoChoice>(initial);
  // Cada vez que se abre, empieza con la sugerencia (la lista pudo cambiar).
  useEffect(() => {
    if (open) setValue(initial);
  }, [open, initial]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="¿Quién eres?"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} icon={<UserPlus className="size-4" />} onClick={() => onJoin(value)}>
            {joinText}
          </Button>
        </>
      }
    >
      <WhoAreYouList players={players} value={value} onChange={setValue} people={people} />
    </Modal>
  );
}
