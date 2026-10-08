import { useState, type ReactNode } from 'react';
import { Ban, Copy, Crown, LockOpen, ShieldCheck, ShieldOff } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { BusyIcon, useBusy } from '../../components/busy';
import { useFeedback } from '../../components/feedback';
import { Badge, Button, Card, Field, ListRow, Modal, RowIcon, Skeleton } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { blockUser, setUserSuperadmin, unblockUser, useAdminUser, type AdminUser } from '../../lib/data/admin';
import { SportIcon } from '../sports/SportBits';
import { Counter, Drawer, EmptyState, ErrorRetry, Fact, GroupTitle, TextArea, ToneIcon } from './bits';
import { fmtDate, fmtDateTime, fmtNum, relativeTime } from './format';
import { copyText, useRun } from './hooks';
import { BLOCK_REASON_MAX, ROLE_LABEL, canBlock, providerLabel, userFlags } from './model';

/** Insignias de estado de una cuenta (superadmin, bloqueada, sin confirmar, inactiva). */
export function UserBadges({ u, me }: { u: AdminUser; me?: string }) {
  const f = userFlags(u);
  return (
    <span className="flex flex-wrap gap-1">
      {f.superadmin && (
        <Badge tone="accent">
          <Crown className="size-3" aria-hidden="true" />
          {u.id === me ? 'Tú' : 'Superadmin'}
        </Badge>
      )}
      {f.blocked && (
        <Badge tone="danger">
          <Ban className="size-3" aria-hidden="true" />
          Bloqueada
        </Badge>
      )}
      {f.unconfirmed && <Badge tone="warn">Sin confirmar</Badge>}
      {f.inactive && !f.blocked && <Badge tone="neutral">Inactiva</Badge>}
      {!f.superadmin && !f.blocked && !f.unconfirmed && !f.inactive && <Badge tone="ok">Activa</Badge>}
    </span>
  );
}

/**
 * Acciones sobre una cuenta (hacer o quitar superadmin, bloquear, desbloquear, copiar el correo). `busy` dice cuál
 * espera (`super:<id>`, `unblock:<id>`, `copy`), para su ruedita.
 */
export function useUserActions() {
  const auth = useAuth();
  const run = useRun();
  const busy = useBusy();
  const { confirm, toast } = useFeedback();
  const me = auth.user?.uid;

  async function toggleSuper(u: Pick<AdminUser, 'id' | 'name' | 'superadmin'>) {
    const value = !u.superadmin;
    const ok = await confirm({
      title: value ? `¿Hacer superadmin a ${u.name}?` : `¿Quitarle superadmin a ${u.name}?`,
      message: value
        ? 'Podrá ver y administrar todas las ligas, las cuentas y esta consola.'
        : 'Vuelve a ser una cuenta normal: deja de ver la consola y las ligas de otros.',
      confirmText: value ? 'Hacer superadmin' : 'Quitar superadmin',
      danger: !value,
    });
    if (!ok) return;
    // setUserSuperadmin ya vuelve a pedir la consola (lista, resumen y auditoría) y el perfil de esa cuenta.
    await busy.run(`super:${u.id}`, () => run(() => setUserSuperadmin(u.id, value), value ? `${u.name} ahora es superadmin` : `${u.name} ya no es superadmin`));
  }

  async function unblock(u: Pick<AdminUser, 'id' | 'name'>) {
    const ok = await confirm({
      title: `¿Desbloquear a ${u.name}?`,
      message: 'Podrá volver a guardar cosas en sus ligas.',
      confirmText: 'Desbloquear',
    });
    if (ok) await busy.run(`unblock:${u.id}`, () => run(() => unblockUser(u.id), `${u.name} ya puede usar la app`));
  }

  async function copyEmail(email: string | null) {
    if (!email) return;
    const ok = await busy.run('copy', () => copyText(email));
    if (ok === undefined) return;
    toast(ok ? 'Correo copiado' : 'No se pudo copiar el correo', ok ? 'ok' : 'error');
  }

  return { me, toggleSuper, unblock, copyEmail, run, busy };
}

/** Ventana para bloquear una cuenta: el motivo es obligatorio (queda en la auditoría). */
export function BlockModal({ user, onClose }: { user: Pick<AdminUser, 'id' | 'name'> | null; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const run = useRun();
  const clean = reason.trim();
  const valid = clean.length >= 3 && clean.length <= BLOCK_REASON_MAX;
  const close = () => {
    setReason('');
    onClose();
  };
  async function submit() {
    if (!user || !valid) return;
    setBusy(true);
    const ok = await run(() => blockUser(user.id, clean), `${user.name} quedó bloqueada`);
    setBusy(false);
    if (ok) close();
  }
  return (
    <Modal
      open={user != null}
      onClose={close}
      title={user ? `Bloquear a ${user.name}` : 'Bloquear'}
      footer={
        <>
          <Button variant="quiet" size="lg" onClick={close}>
            Cancelar
          </Button>
          <Button variant="danger" size="lg" icon={<Ban className="size-[18px]" />} disabled={!valid} loading={busy} onClick={submit}>
            Bloquear
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="text-[15px] text-fg-2">No podrá anotar ni guardar nada hasta que la desbloquees. Sigue viendo sus ligas y no se borra nada.</p>
        <Field
          label="Motivo (obligatorio)"
          hint={
            <span className="flex justify-between gap-3">
              <span>Lo ve en su cuenta y queda en la auditoría.</span>
              <Counter value={reason} max={BLOCK_REASON_MAX} />
            </span>
          }
        >
          <TextArea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={BLOCK_REASON_MAX + 20} required placeholder="Ej.: anotaciones falsas en varias ligas" />
        </Field>
      </form>
    </Modal>
  );
}

/** Panel con todo de una cuenta: sus ligas, dispositivos, lecturas de hoy y las acciones. */
export function UserDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const detail = useAdminUser(id);
  const u = detail.data && detail.data.id === id ? detail.data : null;
  const { me, toggleSuper, unblock, copyEmail, busy } = useUserActions();
  const [blocking, setBlocking] = useState<AdminUser | null>(null);
  const flags = u ? userFlags(u) : null;
  // Mientras una acción espera, las demás se apagan (son sobre la misma cuenta).
  const waiting = busy.isBusy();

  // Una acción como fila: con su ruedita mientras espera; sin poder tocarse mientras otra espera o si no se puede.
  const action = (key: string, icon: ReactNode, title: string, opts: { onClick: () => void; busyKey: string; why?: string | null; danger?: boolean }) => {
    const spinning = busy.isBusy(opts.busyKey);
    const blocked = !!opts.why;
    return (
      <ListRow
        key={key}
        dense
        leading={
          opts.danger && !blocked ? (
            <ToneIcon tone="danger">
              <BusyIcon busy={spinning} icon={icon} className="size-5" />
            </ToneIcon>
          ) : (
            <RowIcon>
              <BusyIcon busy={spinning} icon={icon} className="size-5" />
            </RowIcon>
          )
        }
        title={<span className={blocked ? 'text-muted' : opts.danger ? 'text-danger' : undefined}>{title}</span>}
        subtitle={opts.why ?? undefined}
        onClick={blocked || waiting ? undefined : opts.onClick}
        chevron={false}
      />
    );
  };

  return (
    <>
      <Drawer open={id != null} onClose={onClose} title="Cuenta" label={u ? `Cuenta de ${u.name}` : 'Cuenta'}>
        {detail.error && !u ? (
          <ErrorRetry error={detail.error} compact />
        ) : detail.loading && !u ? (
          <div className="flex flex-col gap-4" aria-busy="true">
            <div className="flex items-center gap-4">
              <Skeleton className="size-14 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3.5 w-56" />
              </div>
            </div>
            <Skeleton className="h-36 rounded-3xl" />
            <Skeleton className="h-48 rounded-3xl" />
          </div>
        ) : !u ? (
          <EmptyState title="Esta cuenta ya no existe">Puede que la hayan borrado.</EmptyState>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <Avatar name={u.name} className="size-14 text-lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-card-title-pro">{u.name}</p>
                <p className="mt-0.5 truncate text-meta text-muted">{u.email ?? 'Sin correo'}</p>
                <div className="mt-1.5">
                  <UserBadges u={u} me={me} />
                </div>
              </div>
            </div>

            {u.blockedAt && (
              <div role="status" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm">
                <p className="font-semibold text-danger">Bloqueada {relativeTime(u.blockedAt)}</p>
                <p className="text-fg-2">{u.blockedReason ? `Motivo: ${u.blockedReason}` : 'Sin motivo anotado.'}</p>
              </div>
            )}

            <section aria-labelledby="mm-user-actions">
              <GroupTitle id="mm-user-actions">Acciones</GroupTitle>
              <Card className="overflow-hidden">
                {u.email && action('copy', <Copy className="size-5" />, 'Copiar correo', { onClick: () => copyEmail(u.email), busyKey: 'copy' })}
                {action('super', u.superadmin ? <ShieldOff className="size-5" /> : <ShieldCheck className="size-5" />, u.superadmin ? 'Quitar superadmin' : 'Hacer superadmin', {
                  onClick: () => toggleSuper(u),
                  busyKey: `super:${u.id}`,
                  why: u.id === me ? 'No te lo puedes quitar a ti mismo' : null,
                })}
                {flags?.blocked
                  ? action('unblock', <LockOpen className="size-5" />, 'Desbloquear', { onClick: () => unblock(u), busyKey: `unblock:${u.id}` })
                  : action('block', <Ban className="size-5" />, 'Bloquear', {
                      onClick: () => setBlocking(u),
                      busyKey: 'block',
                      danger: true,
                      why: canBlock(u, me) ? null : 'No se puede bloquear a un superadmin',
                    })}
              </Card>
            </section>

            <section aria-labelledby="mm-user-facts">
            <GroupTitle id="mm-user-facts">Datos</GroupTitle>
            <dl className="card-shadow grid grid-cols-2 gap-x-4 gap-y-4 rounded-3xl bg-surface px-5 py-[18px]">
              <Fact label="Alta">
                <span title={fmtDateTime(u.createdAt)}>{fmtDate(u.createdAt)}</span>
              </Fact>
              <Fact label="Última vez en la app">
                <span title={fmtDateTime(u.lastSeenAt)}>{relativeTime(u.lastSeenAt)}</span>
              </Fact>
              <Fact label="Último inicio de sesión">
                <span title={fmtDateTime(u.lastSignInAt)}>{relativeTime(u.lastSignInAt)}</span>
              </Fact>
              <Fact label="Entra con">{providerLabel(u.provider)}</Fact>
              <Fact label="Correo confirmado">{u.confirmed ? 'Sí' : 'No'}</Fact>
              <Fact label="Mayor de edad">{u.adult ? 'Sí, confirmado' : 'No confirmado'}</Fact>
              <Fact label="Teléfonos con avisos">{fmtNum(u.pushDevices)}</Fact>
              <Fact label="Lecturas de fotos hoy">{fmtNum(u.scansToday)}</Fact>
              <Fact label="Ligas">{fmtNum(u.leagues)}</Fact>
              <Fact label="Dueño de">{fmtNum(u.ownedLeagues)}</Fact>
            </dl>
            </section>

            <section aria-labelledby="mm-user-leagues">
              <GroupTitle id="mm-user-leagues">Sus ligas y torneos ({fmtNum(u.memberships.length)})</GroupTitle>
              {u.memberships.length === 0 ? (
                <Card className="px-5 py-4 text-center text-sm text-muted">No es miembro de ninguna liga.</Card>
              ) : (
                <Card className="overflow-hidden">
                  {u.memberships.map((m) => (
                    <ListRow
                      key={m.leagueId}
                      dense
                      leading={
                        <RowIcon tone={m.role === 'owner' ? 'accent' : 'neutral'}>
                          <SportIcon sport={m.sport} className="size-5" />
                        </RowIcon>
                      }
                      title={m.leagueName}
                      subtitle={[m.kind === 'torneo' ? 'Torneo' : 'Liga', ROLE_LABEL[m.role], m.scorer ? 'Anotador' : null, m.joinedAt ? `desde ${fmtDate(m.joinedAt)}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                      to={`/l/${m.leagueId}`}
                    />
                  ))}
                </Card>
              )}
            </section>

            <p className="mx-1 text-xs break-all text-muted">
              Id: <span className="font-mono">{u.id}</span>
            </p>
          </div>
        )}
      </Drawer>
      <BlockModal user={blocking} onClose={() => setBlocking(null)} />
    </>
  );
}
