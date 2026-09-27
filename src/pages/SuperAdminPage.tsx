import { useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { ChevronRight, Crown, DatabaseBackup, Globe, Lock, Search, Trophy, Users } from 'lucide-react';
import { isFixedSuper } from '../lib/admins';
import { useAuth } from '../lib/auth';
import { setSuperadmin, useAllLeagues, useUsers } from '../lib/data';
import { BackLink } from '../components/BackLink';
import { AppShell } from '../components/Shell';
import { Avatar } from '../components/Avatar';
import { useAction, useFeedback } from '../components/feedback';
import { Badge, Button, Card, Input, ListSkeleton, LoadError, Loading, Tabs } from '../components/ui';

type Tab = 'ligas' | 'cuentas';

/** Superadmin: todas las ligas y torneos, las cuentas (nombrar superadmins) y el respaldo completo. */
export default function SuperAdminPage() {
  const auth = useAuth();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'cuentas' ? 'cuentas' : 'ligas';
  const leagues = useAllLeagues(auth.isSuper);
  const users = useUsers(auth.isSuper && tab === 'cuentas');
  const run = useAction();
  const { confirm, toast } = useFeedback();
  const [q, setQ] = useState('');
  const [backingUp, setBackingUp] = useState(false);

  const filteredLeagues = useMemo(
    () => leagues.data.filter((l) => l.name.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)),
    [leagues.data, q],
  );
  const filteredUsers = useMemo(
    () =>
      users.data
        .filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q.trim().toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [users.data, q],
  );

  if (auth.loading) return <Loading />;
  if (!auth.isSuper) return <Navigate to="/ligas" replace />;

  async function backup() {
    setBackingUp(true);
    try {
      const { downloadFullBackup } = await import('../lib/backup');
      const c = await downloadFullBackup();
      toast(`Respaldo descargado: ${c.leagues} ligas, ${c.users} cuentas`);
    } catch (e) {
      console.error(e);
      toast('No se pudo hacer el respaldo.', 'error');
    } finally {
      setBackingUp(false);
    }
  }

  async function toggle(uid: string, name: string, value: boolean) {
    const ok = await confirm({
      title: value ? `¿Hacer superadmin a ${name}?` : `¿Quitarle superadmin a ${name}?`,
      message: value ? 'Podrá ver y administrar todas las ligas y las cuentas.' : 'Vuelve a ser una cuenta normal.',
      confirmText: value ? 'Hacer superadmin' : 'Quitar',
      danger: !value,
    });
    if (ok) await run(() => setSuperadmin(uid, value), value ? `${name} ahora es superadmin` : 'Listo');
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <BackLink fallback="/" className="-ml-1.5 mt-2" />
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-fg">
            <Crown className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight">Superadmin</h1>
            <p className="text-sm text-muted">Todas las ligas y las cuentas de la app.</p>
          </div>
          <Button icon={<DatabaseBackup className="size-4" />} loading={backingUp} onClick={backup}>
            <span className="hidden sm:inline">Respaldo completo</span>
          </Button>
        </div>

        <Tabs
          items={[
            { key: 'ligas', label: 'Ligas', icon: <Trophy className="size-4" />, count: leagues.data.length },
            { key: 'cuentas', label: 'Cuentas', icon: <Users className="size-4" /> },
          ]}
          active={tab}
          onChange={(k) => setParams(k === 'cuentas' ? { tab: k } : {}, { replace: true })}
        />

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>

        {tab === 'ligas' ? (
          leagues.error ? (
            <LoadError error={leagues.error} />
          ) : leagues.loading ? (
            <ListSkeleton rows={4} />
          ) : (
            <Card className="divide-y divide-line overflow-hidden">
              {filteredLeagues.map((l) => (
                <Link key={l.id} to={`/l/${l.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
                  {l.visibility === 'private' ? <Lock className="size-4 text-muted" /> : <Globe className="size-4 text-muted" />}
                  <span className="flex-1 truncate font-medium">{l.name}</span>
                  {l.kind === 'torneo' && <Badge tone="accent">Torneo</Badge>}
                  <ChevronRight className="size-4 text-muted" />
                </Link>
              ))}
              {filteredLeagues.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">No hay ligas.</p>}
            </Card>
          )
        ) : users.error ? (
          <LoadError error={users.error} />
        ) : users.loading ? (
          <ListSkeleton rows={6} />
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {filteredUsers.map((u) => {
              const fixed = isFixedSuper(u.email);
              const isSuper = fixed || u.superadmin === true;
              return (
                <div key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar name={u.name} className="size-8 text-xs" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{u.name}</div>
                    <div className="truncate text-xs text-muted">{u.email}</div>
                  </div>
                  {fixed ? (
                    <Badge tone="accent">
                      <Crown className="size-3" /> Fijo
                    </Badge>
                  ) : (
                    <Button size="sm" variant={isSuper ? 'secondary' : 'ghost'} onClick={() => toggle(u.id, u.name, !isSuper)} disabled={u.id === auth.user?.uid}>
                      {isSuper ? 'Quitar superadmin' : 'Hacer superadmin'}
                    </Button>
                  )}
                </div>
              );
            })}
            {filteredUsers.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">No hay cuentas.</p>}
          </Card>
        )}
      </div>
    </AppShell>
  );
}
