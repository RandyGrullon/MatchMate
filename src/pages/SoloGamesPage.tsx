import { useCallback, useMemo } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { ChevronRight, CloudUpload, Flame, Hash, Heart, Layers, Lock, LogIn, Plus, Target, UserPlus } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { soloByMonth, soloHigh, soloSeries, soloSummary, soloVenues, useMySoloSessions, type SoloSession } from '../lib/data/solo';
import { formatDate, parseDate, toIsoDate } from '../lib/format';
import { useNow } from '../lib/useNow';
import { getSport } from '../sports/registry';
import { BackLink } from '../components/BackLink';
import { Stat } from '../components/event/StandingsTab';
import { AppShell } from '../components/Shell';
import { ScoreChips } from '../components/social/GameCard';
import { SoloGameSheet } from '../components/solo/SoloGameSheet';
import { Button, Card, Empty, ListSkeleton, Loading, LoadError, StatsSkeleton } from '../components/ui';

/** «sáb 27»: el día de la semana y el número, para la columna de la fecha. */
function dayParts(date: string): { weekday: string; day: string } {
  const d = parseDate(date);
  return { weekday: d.toLocaleDateString('es-DO', { weekday: 'short' }).replace('.', ''), day: String(d.getDate()) };
}

/**
 * Juegos sueltos (/juegos-sueltos): los juegos de boliche de la cuenta fuera de una liga o torneo. Arriba los números
 * (juegos, promedio, el más alto y la mejor serie de 3), «Anotar juego suelto» y la lista por mes (la fecha, la bolera,
 * los juegos, la serie y un candado si no sale en el perfil). Tocar uno lo abre para cambiarlo o borrarlo.
 * `?juego=<id>` abre ese (los avisos y el perfil llevan aquí); `?nuevo=1`, uno nuevo (el menú Crear y el Home del
 * boliche). Sin cuenta, invita a entrar y vuelve aquí.
 */
export default function SoloGamesPage() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.loading) {
    return (
      <AppShell>
        <Loading />
      </AppShell>
    );
  }

  if (!auth.user) {
    const next = encodeURIComponent(location.pathname + location.search);
    const Icon = getSport('bowling').icon;
    return (
      <AppShell>
        <div className="flex flex-col gap-5">
          <h1 className="text-2xl font-bold tracking-tight">Juegos sueltos</h1>
          <Empty icon={<Icon className="size-8" aria-hidden="true" />} title="Entra para anotar tus juegos sueltos">
            Anota los juegos de boliche que haces fuera de una liga o torneo y lleva tu promedio y tus mejores juegos.
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link
                to={`/login?next=${next}`}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium text-fg hover:bg-surface-2"
              >
                <LogIn className="size-4" aria-hidden="true" /> Entrar
              </Link>
              <Link
                to={`/login?modo=registro&next=${next}`}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg"
              >
                <UserPlus className="size-4" aria-hidden="true" /> Crear cuenta
              </Link>
            </div>
          </Empty>
        </div>
      </AppShell>
    );
  }

  return <SoloGames />;
}

function SoloGames() {
  const sessions = useMySoloSessions();
  const [params, setParams] = useSearchParams();
  const today = toIsoDate(useNow());
  const summary = useMemo(() => soloSummary(sessions.data), [sessions.data]);
  const months = useMemo(() => soloByMonth(sessions.data), [sessions.data]);
  const venues = useMemo(() => soloVenues(sessions.data), [sessions.data]);

  const openId = params.get('juego');
  const isNew = params.get('nuevo') === '1';
  const editing = openId ? (sessions.data.find((s) => s.id === openId) ?? null) : null;

  const setOpen = useCallback(
    (id: string | 'nuevo' | null) =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          next.delete('juego');
          next.delete('nuevo');
          if (id === 'nuevo') next.set('nuevo', '1');
          else if (id) next.set('juego', id);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  // Un link a uno que todavía no está en la lista (la copia del teléfono es vieja) se abre cuando llega; si ya no
  // existe, no se abre nada.
  let content;
  if (sessions.loading && !sessions.data.length) {
    content = (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando tus juegos sueltos">
        <StatsSkeleton />
        <ListSkeleton rows={3} />
      </div>
    );
  } else if (sessions.error && !sessions.data.length) {
    content = <LoadError error={sessions.error} />;
  } else if (!sessions.data.length) {
    const Icon = getSport('bowling').icon;
    content = (
      <Empty icon={<Icon className="size-8" aria-hidden="true" />} title="Todavía no tienes juegos sueltos">
        Anota los juegos que haces fuera de una liga o torneo: tu promedio y tus mejores juegos salen aquí y en tu perfil.
        <div className="mt-4 flex justify-center">
          <Button variant="primary" className="h-11" icon={<Plus className="size-4" />} onClick={() => setOpen('nuevo')}>
            Anotar juego suelto
          </Button>
        </div>
      </Empty>
    );
  } else {
    content = (
      <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat icon={<Hash className="size-4" />} label="Juegos" value={summary.games} sub={`${summary.sessions} ${summary.sessions === 1 ? 'día' : 'días'}`} />
          <Stat icon={<Target className="size-4" />} label="Promedio" value={summary.average ?? '—'} />
          <Stat icon={<Flame className="size-4" />} label="Más alto" value={summary.high || '—'} />
          <Stat icon={<Layers className="size-4" />} label="Mejor serie" value={summary.bestSeries || '—'} sub="3 juegos seguidos" />
        </div>
        <Button variant="primary" className="h-11" icon={<Plus className="size-4" />} onClick={() => setOpen('nuevo')}>
          Anotar juego suelto
        </Button>
        {months.map((m) => (
          <section key={m.month} className="flex flex-col gap-2" aria-label={m.label}>
            <h2 className="px-1 text-xs font-semibold tracking-wide text-muted uppercase">{m.label}</h2>
            <Card className="divide-y divide-line overflow-hidden">
              {m.sessions.map((s) => (
                <SoloRow key={s.id} session={s} onOpen={() => setOpen(s.id)} />
              ))}
            </Card>
          </section>
        ))}
      </>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-2">
          <BackLink fallback="/perfil" className="-ml-2 flex size-11 items-center justify-center p-0" />
          <div className="min-w-0 pt-0.5">
            <h1 className="text-2xl font-bold tracking-tight">Juegos sueltos</h1>
            <p className="text-sm text-muted">Tus juegos de boliche fuera de una liga o torneo</p>
          </div>
        </div>
        {content}
      </div>
      {(isNew || editing) && (
        <SoloGameSheet key={editing?.id ?? 'nuevo'} session={editing} venues={venues} today={today} onClose={() => setOpen(null)} />
      )}
    </AppShell>
  );
}

/** Un día de juegos sueltos en la lista: toda la fila lo abre. */
export function SoloRow({ session: s, onOpen }: { session: SoloSession; onOpen: () => void }) {
  const { weekday, day } = dayParts(s.playedOn);
  const many = s.scores.length > 1;
  const label = [
    `${s.venue || 'Juego suelto'}, ${formatDate(s.playedOn)}`,
    many ? `${s.scores.join(', ')}: serie ${soloSeries(s)}` : `${soloHigh(s)} pinos`,
    !s.shared && 'solo lo ves tú',
    s.pending && 'por enviar',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2 active:bg-surface-2"
      aria-label={label}
    >
      <span className="flex w-10 shrink-0 flex-col items-center leading-tight" aria-hidden="true">
        <span className="text-[11px] text-muted uppercase">{weekday}</span>
        <span className="text-lg font-bold tabular-nums">{day}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex min-w-0 items-center gap-1.5 text-sm">
          <span className="truncate font-medium">{s.venue || 'Juego suelto'}</span>
          {!s.shared && <Lock className="size-3.5 shrink-0 text-muted" aria-hidden="true" />}
          {s.pending && <CloudUpload className="size-3.5 shrink-0 text-accent" aria-hidden="true" />}
          {s.likes > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted">
              <Heart className="size-3" aria-hidden="true" /> {s.likes}
            </span>
          )}
        </span>
        <span className="flex flex-wrap gap-1">
          <ScoreChips scores={s.scores} />
        </span>
      </span>
      <span className="shrink-0 text-right" aria-hidden="true">
        <span className="block text-lg leading-tight font-bold tabular-nums">{many ? soloSeries(s) : soloHigh(s)}</span>
        <span className="block text-[11px] text-muted">{many ? 'serie' : 'pinos'}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
    </button>
  );
}
