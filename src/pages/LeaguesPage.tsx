import { useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router';
import { CalendarDays, ChevronRight, Globe, Lock, LogIn, MapPin, Plus, Shield, Trophy } from 'lucide-react';
import { displayName, useAuth } from '../lib/auth';
import { joinLeague, useLeaguesByIds, useMyMemberships, usePublicLeagues } from '../lib/data';
import { roleLabel } from '../lib/league';
import type { League, Member } from '../lib/types';
import { AppShell } from '../components/Shell';
import { useCreateMenu } from '../components/CreateMenu';
import { useAction } from '../components/feedback';
import { Badge, Button, Card, Empty, ListSkeleton, LoadError } from '../components/ui';

/** Eventos: tus ligas (privadas y públicas) y las ligas públicas para unirte. Se entra a cada una para ver sus eventos. */
export default function LeaguesPage() {
  const auth = useAuth();
  const create = useCreateMenu();
  const navigate = useNavigate();
  const run = useAction();
  const memberships = useMyMemberships(auth.user?.uid);
  const mine = useLeaguesByIds(memberships.data.map((m) => m.leagueId));
  const pub = usePublicLeagues();
  const [joining, setJoining] = useState<string | null>(null);

  const roleOf = (lid: string) => memberships.data.find((m) => m.leagueId === lid)?.role;
  const others = pub.data.filter((l) => !roleOf(l.id)).sort((a, b) => a.name.localeCompare(b.name));

  async function join(l: League) {
    if (!auth.user) return navigate(`/login?next=${encodeURIComponent('/ligas')}`);
    setJoining(l.id);
    const ok = await run(async () => {
      await joinLeague(l.id, { uid: auth.user!.uid, name: displayName(auth) }, null);
      return true;
    }, `Te uniste a ${l.name}`);
    setJoining(null);
    if (ok) navigate(`/l/${l.id}`);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Eventos</h1>
          <p className="text-sm text-muted">Entra a una liga o torneo para ver sus torneos, prácticas y clasificaciones.</p>
        </div>

        {auth.user ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted">Tus ligas y torneos</h2>
            {memberships.error ? (
              <LoadError error={memberships.error} />
            ) : memberships.loading || mine.loading ? (
              <ListSkeleton rows={2} />
            ) : mine.data.length === 0 ? (
              <Empty icon={<Shield className="size-8" />} title="Todavía no estás en ninguna">
                Únete a una pública aquí abajo, o crea la tuya o pon el código que te compartieron.
                <div className="mt-4">
                  <button type="button" onClick={create.openMenu} className="inline-flex items-center gap-1.5 font-medium text-accent">
                    <Plus className="size-4" /> Crear o unirme con código
                  </button>
                </div>
              </Empty>
            ) : (
              <Card className="stagger divide-y divide-line overflow-hidden">
                {mine.data.map((l, i) => (
                  <LeagueRow key={l.id} league={l} index={i} role={roleOf(l.id)} />
                ))}
              </Card>
            )}
          </section>
        ) : (
          !auth.loading && (
            <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <p className="flex-1 text-sm text-muted">Entra para ver tus ligas privadas. Las públicas se ven sin cuenta.</p>
              <Link to="/login?next=%2Fligas" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm font-medium hover:bg-surface-2">
                <LogIn className="size-4" /> Entrar
              </Link>
            </Card>
          )
        )}

        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted">
            <Globe className="size-4" /> Públicas para unirte
          </h2>
          {pub.error ? (
            <LoadError error={pub.error} />
          ) : pub.loading ? (
            <ListSkeleton rows={3} />
          ) : others.length === 0 ? (
            <p className="text-sm text-muted">{pub.data.length ? 'Ya estás en todas las públicas.' : 'Todavía no hay ligas ni torneos públicos.'}</p>
          ) : (
            <Card className="stagger divide-y divide-line overflow-hidden">
              {others.map((l, i) => (
                <div key={l.id} style={{ '--i': i } as CSSProperties} className="flex items-center gap-3 px-4 py-3">
                  <Link to={`/l/${l.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <LeagueIcon league={l} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{l.name}</span>
                        {l.kind === 'torneo' && <Badge tone="accent">Torneo</Badge>}
                      </div>
                      <LeagueMeta league={l} />
                    </div>
                  </Link>
                  <Button size="sm" loading={joining === l.id} onClick={() => join(l)}>
                    Unirme
                  </Button>
                </div>
              ))}
            </Card>
          )}
        </section>
      </div>
    </AppShell>
  );
}

export function LeagueMeta({ league }: { league: League }) {
  const bits = [league.venue, league.schedule].filter(Boolean);
  if (!bits.length) return null;
  return (
    <div className="flex items-center gap-1 truncate text-xs text-muted">
      <MapPin className="size-3 shrink-0" />
      <span className="truncate">{bits.join(' · ')}</span>
    </div>
  );
}

function LeagueIcon({ league }: { league: League }) {
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
      {league.kind === 'torneo' ? <Trophy className="size-5" /> : league.visibility === 'private' ? <Lock className="size-5" /> : <CalendarDays className="size-5" />}
    </div>
  );
}

function LeagueRow({ league, role, index }: { league: League; role?: Member['role']; index: number }) {
  return (
    <Link to={`/l/${league.id}`} style={{ '--i': index } as CSSProperties} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
      <LeagueIcon league={league} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-medium">{league.name}</span>
          <Badge tone={league.visibility === 'private' ? 'neutral' : 'accent'}>
            {league.visibility === 'private' ? <Lock className="size-3" /> : <Globe className="size-3" />}
            {league.kind === 'torneo' ? 'Torneo' : league.visibility === 'private' ? 'Privada' : 'Pública'}
          </Badge>
          {role && role !== 'member' && <Badge tone="accent">{roleLabel(role)}</Badge>}
        </div>
        <LeagueMeta league={league} />
      </div>
      <ChevronRight className="size-4 text-muted" />
    </Link>
  );
}
