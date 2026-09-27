import { useState } from 'react';
import { Link } from 'react-router';
import { Ban, ChevronRight, Copy, Crown, ShieldCheck, ShieldOff } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { useFeedback } from '../../components/feedback';
import { Badge, Button, Empty, Field, Modal, Skeleton } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { blockUser, setUserSuperadmin, unblockUser, useAdminUser, type AdminUser } from '../../lib/data/admin';
import { SportIcon } from '../sports/SportBits';
import { Counter, Drawer, ErrorRetry, Fact, TextArea } from './bits';
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

/** Acciones sobre una cuenta (hacer o quitar superadmin, bloquear, desbloquear, copiar el correo). */
export function useUserActions() {
  const auth = useAuth();
  const run = useRun();
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
    await run(() => setUserSuperadmin(u.id, value), value ? `${u.name} ahora es superadmin` : `${u.name} ya no es superadmin`);
  }

  async function unblock(u: Pick<AdminUser, 'id' | 'name'>) {
    const ok = await confirm({
      title: `¿Desbloquear a ${u.name}?`,
      message: 'Podrá volver a guardar cosas en sus ligas.',
      confirmText: 'Desbloquear',
    });
    if (ok) await run(() => unblockUser(u.id), `${u.name} ya puede usar la app`);
  }

  async function copyEmail(email: string | null) {
    if (!email) return;
    const ok = await copyText(email);
    toast(ok ? 'Correo copiado' : 'No se pudo copiar el correo', ok ? 'ok' : 'error');
  }

  return { me, toggleSuper, unblock, copyEmail, run };
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
          <Button onClick={close} className="max-sm:min-h-11">
            Cancelar
          </Button>
          <Button variant="danger" icon={<Ban className="size-4" />} disabled={!valid} loading={busy} onClick={submit} className="max-sm:min-h-11">
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
        <p className="text-sm text-muted">
          No podrá guardar nada (anotar, enviar juegos, crear ligas, subir o borrar fotos) hasta que la desbloquees. Puede seguir viendo sus
          ligas y no se borra nada. El motivo queda en la auditoría y la persona lo puede ver en su cuenta.
        </p>
        <Field label="Motivo (obligatorio)" hint={<Counter value={reason} max={BLOCK_REASON_MAX} />}>
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
  const { me, toggleSuper, unblock, copyEmail } = useUserActions();
  const [blocking, setBlocking] = useState<AdminUser | null>(null);
  const flags = u ? userFlags(u) : null;

  return (
    <>
      <Drawer
        open={id != null}
        onClose={onClose}
        title={u?.name ?? 'Cuenta'}
        footer={
          u && (
            <>
              {u.email && (
                <Button icon={<Copy className="size-4" />} onClick={() => copyEmail(u.email)} className="max-sm:min-h-11">
                  Copiar correo
                </Button>
              )}
              <Button
                icon={u.superadmin ? <ShieldOff className="size-4" /> : <ShieldCheck className="size-4" />}
                onClick={() => toggleSuper(u)}
                disabled={u.id === me}
                title={u.id === me ? 'No te puedes quitar superadmin a ti mismo' : undefined}
                className="max-sm:min-h-11"
              >
                {u.superadmin ? 'Quitar superadmin' : 'Hacer superadmin'}
              </Button>
              {flags?.blocked ? (
                <Button variant="primary" onClick={() => unblock(u)} className="max-sm:min-h-11">
                  Desbloquear
                </Button>
              ) : (
                <Button
                  variant="danger"
                  icon={<Ban className="size-4" />}
                  onClick={() => setBlocking(u)}
                  disabled={!canBlock(u, me)}
                  title={!canBlock(u, me) ? 'No se puede bloquear a un superadmin ni a ti mismo' : undefined}
                  className="max-sm:min-h-11"
                >
                  Bloquear
                </Button>
              )}
            </>
          )
        }
      >
        {detail.error && !u ? (
          <ErrorRetry error={detail.error} compact />
        ) : detail.loading && !u ? (
          <div className="flex flex-col gap-4" aria-busy="true">
            <div className="flex items-center gap-3">
              <Skeleton className="size-12 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
            <Skeleton className="h-28" />
            <Skeleton className="h-40" />
          </div>
        ) : !u ? (
          <Empty title="Esta cuenta ya no existe">Puede que la hayan borrado.</Empty>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <Avatar name={u.name} className="size-12 text-base" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{u.name}</p>
                <p className="truncate text-sm text-muted">{u.email ?? 'Sin correo'}</p>
                <div className="mt-1">
                  <UserBadges u={u} me={me} />
                </div>
              </div>
            </div>

            {u.blockedAt && (
              <div role="status" className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm">
                <p className="font-semibold text-danger">Bloqueada {relativeTime(u.blockedAt)}</p>
                <p className="text-muted">{u.blockedReason ? `Motivo: ${u.blockedReason}` : 'Sin motivo anotado.'}</p>
              </div>
            )}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-line p-3">
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

            <section aria-labelledby="mm-user-leagues" className="flex flex-col gap-2">
              <h3 id="mm-user-leagues" className="text-sm font-semibold">
                Sus ligas y torneos ({fmtNum(u.memberships.length)})
              </h3>
              {u.memberships.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-sm text-muted">No es miembro de ninguna liga.</p>
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                  {u.memberships.map((m) => (
                    <li key={m.leagueId}>
                      <Link to={`/l/${m.leagueId}`} className="flex min-h-11 items-center gap-3 px-3 py-2 transition hover:bg-surface-2">
                        <SportIcon sport={m.sport} className="size-4 shrink-0 text-muted" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{m.leagueName}</span>
                          <span className="block text-xs text-muted">
                            {m.kind === 'torneo' ? 'Torneo' : 'Liga'}
                            {m.joinedAt ? ` · desde ${fmtDate(m.joinedAt)}` : ''}
                          </span>
                        </span>
                        <Badge tone={m.role === 'owner' ? 'accent' : m.role === 'admin' ? 'warn' : 'neutral'}>{ROLE_LABEL[m.role]}</Badge>
                        {m.scorer && <Badge tone="neutral">Anotador</Badge>}
                        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <p className="text-xs break-all text-muted">
              Id: <span className="font-mono">{u.id}</span>
            </p>
          </div>
        )}
      </Drawer>
      <BlockModal user={blocking} onClose={() => setBlocking(null)} />
    </>
  );
}
