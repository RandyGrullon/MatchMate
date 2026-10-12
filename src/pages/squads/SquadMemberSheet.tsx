import { useState } from 'react';
import { Link } from 'react-router';
import { Crown, Save, UserMinus, UserRound } from 'lucide-react';
import { removeSquadMember, setSquadMember, type SquadMember, type SquadPage } from '../../lib/data/squads';
import { Avatar } from '../../components/Avatar';
import { BusyIcon, useBusy } from '../../components/busy';
import { useFeedback } from '../../components/feedback';
import { POSITION_MAX, memberActions, memberErrorText, parseJersey, type SquadViewer } from '../../components/squads/logic';
import { userPath } from '../../components/social/UserLink';
import { Button, Field, Input, Sheet, cx } from '../../components/ui';

/**
 * Lo que el capitán hace con alguien de la plantilla (tocando su fila): la posición y el número (también los suyos),
 * pasarle la capitanía y sacarlo del equipo (los dos con confirmación). Arriba, su cara y «Ver perfil».
 */
export function SquadMemberSheet({ member, squad, viewer, onClose }: { member: SquadMember | null; squad: SquadPage; viewer: SquadViewer; onClose: () => void }) {
  return (
    <Sheet open={!!member} onClose={onClose} title={member ? (member.isMe ? `${member.name} (tú)` : member.name) : ''} subtitle={member?.username ? `@${member.username}` : undefined}>
      {member && <MemberBody key={member.id} member={member} squad={squad} viewer={viewer} onDone={onClose} />}
    </Sheet>
  );
}

function MemberBody({ member: m, squad, viewer, onDone }: { member: SquadMember; squad: SquadPage; viewer: SquadViewer; onDone: () => void }) {
  const { toast, confirm } = useFeedback();
  const act = useBusy<'guardar' | 'capitan' | 'sacar'>();
  const [position, setPosition] = useState(m.position ?? '');
  const [jersey, setJersey] = useState(m.jersey != null ? String(m.jersey) : '');
  const actions = memberActions(viewer, m);
  const parsed = parseJersey(jersey);
  const badJersey = parsed === 'invalid';
  const changed = position.trim() !== (m.position ?? '') || (!badJersey && parsed !== m.jersey);

  async function run(key: 'guardar' | 'capitan' | 'sacar', fn: () => Promise<void>, done: string) {
    await act.run(key, async () => {
      try {
        await fn();
        toast(done);
        onDone();
      } catch (e) {
        console.error(e);
        toast(memberErrorText(e), 'error');
      }
    });
  }

  async function save() {
    if (!changed || badJersey) return;
    await run('guardar', () => setSquadMember(squad.id, m.id, { position: position.trim() || null, jersey: parsed }), 'Listo');
  }

  async function makeCaptain() {
    const ok = await confirm({
      title: `¿Pasarle la capitanía a ${m.name}?`,
      message: 'Va a poder invitar, sacar gente, editar el equipo e inscribirlo en ligas. Tú sigues en el equipo.',
      confirmText: 'Pasar la capitanía',
    });
    if (ok) await run('capitan', () => setSquadMember(squad.id, m.id, { role: 'captain' }), `${m.name} es el nuevo capitán`);
  }

  async function remove() {
    const ok = await confirm({
      title: `¿Sacar a ${m.name}?`,
      message: 'Puede volver a entrar si le mandas el link o el código.',
      confirmText: 'Sacar',
      danger: true,
    });
    if (ok) await run('sacar', () => removeSquadMember(squad.id, m.id), `${m.name} ya no está en el equipo`);
  }

  const item = (danger?: boolean) =>
    cx(
      'flex min-h-14 w-full items-center gap-3.5 rounded-2xl px-2 py-2 text-left transition hover:bg-surface-2 active:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-70',
      danger && 'text-danger',
    );
  const box = (danger?: boolean) => cx('grid size-10 shrink-0 place-items-center rounded-xl', danger ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-fg-2');

  return (
    <div className="flex flex-col gap-4 pb-1">
      <div className="flex items-center gap-3">
        <Avatar name={m.name} photo={m.avatar} className="size-12 text-base" />
        <Link to={userPath(m.id)} className="inline-flex min-h-11 items-center gap-1.5 text-meta font-semibold text-accent focus-visible:outline-2 focus-visible:outline-accent">
          <UserRound aria-hidden="true" className="size-4" />
          Ver perfil
        </Link>
      </div>

      {actions.includes('edit') && (
        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid grid-cols-[1fr_96px] gap-3">
            <Field label="Posición">
              <Input className="h-11" maxLength={POSITION_MAX} value={position} placeholder="Portero, base, delantero…" onChange={(e) => setPosition(e.target.value)} />
            </Field>
            <Field label="Número">
              <Input
                className="h-11 text-center"
                inputMode="numeric"
                maxLength={2}
                value={jersey}
                placeholder="10"
                aria-invalid={badJersey || undefined}
                onChange={(e) => setJersey(e.target.value.replace(/\D/g, '').slice(0, 2))}
              />
            </Field>
          </div>
          {badJersey && <p className="text-xs text-danger">El número va de 0 a 99.</p>}
          <Button type="submit" variant="quiet" className="h-11 w-full" loading={act.isBusy('guardar')} disabled={!changed || badJersey || act.isBusy()} icon={<Save className="size-4" />}>
            Guardar posición y número
          </Button>
        </form>
      )}

      {(actions.includes('make_captain') || actions.includes('remove')) && (
        <ul className="-mx-2 flex flex-col">
          {actions.includes('make_captain') && (
            <li>
              <button type="button" className={item()} disabled={act.isBusy()} aria-busy={act.isBusy('capitan') || undefined} onClick={() => void makeCaptain()}>
                <span aria-hidden="true" className={box()}>
                  <BusyIcon busy={act.isBusy('capitan')} icon={<Crown className="size-5" />} className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold">Pasar la capitanía</span>
                  <span className="block truncate text-[13px] text-muted">Tú sigues en el equipo</span>
                </span>
              </button>
            </li>
          )}
          {actions.includes('remove') && (
            <li>
              <button type="button" className={item(true)} disabled={act.isBusy()} aria-busy={act.isBusy('sacar') || undefined} onClick={() => void remove()}>
                <span aria-hidden="true" className={box(true)}>
                  <BusyIcon busy={act.isBusy('sacar')} icon={<UserMinus className="size-5" />} className="size-5" />
                </span>
                <span className="block min-w-0 flex-1 truncate text-body font-semibold">Sacar del equipo</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
