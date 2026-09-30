import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { LogIn, Plus, Trophy, UserPlus } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { BALL_MAX, ballStats, bestBallText, resurfaceQuestion, type Ball } from '../lib/balls';
import { ballErrorText, resurfaceBall, retireBall, useMyBallGames, useMyBalls } from '../lib/data/balls';
import { formatDate, toIsoDate } from '../lib/format';
import { useNow } from '../lib/useNow';
import { BackLink } from '../components/BackLink';
import { BallIcon } from '../components/balls/BallPicker';
import { BallSheet } from '../components/balls/BallSheet';
import { BallCard } from '../components/balls/BallStats';
import { useFeedback } from '../components/feedback';
import { AppShell } from '../components/Shell';
import { Button, Empty, ListSkeleton, Loading, LoadError } from '../components/ui';

/**
 * Mis bolas (/bolas): las bolas de boliche de la cuenta con sus números (juegos, promedio, el más alto y strikes de los
 * juegos anotados por cuadros), con cuál tiras mejor y cuántos juegos lleva cada una desde la última pulida (a los 60,
 * avisa). Se agregan, cambian, pulen, retiran y borran aquí; la bola de cada juego se elige al anotarlo (juegos
 * sueltos, «Mis juegos» y «Subir mis juegos» en la liga). `?bola=<id>` abre esa; `?nueva=1`, una nueva. Solo la cuenta
 * ve sus bolas. Sin cuenta, invita a entrar y vuelve aquí.
 */
export default function BallsPage() {
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
    return (
      <AppShell>
        <div className="flex flex-col gap-5">
          <h1 className="text-2xl font-bold tracking-tight">Mis bolas</h1>
          <Empty icon={<BallIcon className="size-8" />} title="Entra para registrar tus bolas">
            Anota con qué bola tiras cada juego y mira con cuál te va mejor y cuándo toca pulirla.
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

  return <Balls />;
}

function Balls() {
  const { toast, confirm } = useFeedback();
  const mine = useMyBalls();
  const balls = mine.data.balls;
  const games = useMyBallGames(null, balls.length > 0);
  const [params, setParams] = useSearchParams();
  const today = toIsoDate(useNow());
  const [busy, setBusy] = useState<string | null>(null);

  const stats = useMemo(() => ballStats(balls, games.data), [balls, games.data]);
  const active = stats.filter((s) => !s.ball.retired);
  const retired = stats.filter((s) => s.ball.retired);
  const best = bestBallText(active.length >= 2 ? active : stats);

  const openId = params.get('bola');
  const isNew = params.get('nueva') === '1';
  const editing = openId ? (balls.find((b) => b.id === openId) ?? null) : null;
  const full = balls.length >= BALL_MAX;

  const setOpen = useCallback(
    (id: string | 'nueva' | null) =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          next.delete('bola');
          next.delete('nueva');
          if (id === 'nueva') next.set('nueva', '1');
          else if (id) next.set('bola', id);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  async function act(id: string, what: () => Promise<void>, done: string) {
    if (busy) return;
    setBusy(id);
    try {
      await what();
      toast(done);
    } catch (e) {
      toast(ballErrorText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  /** «La pulí hoy»: pregunta antes (la fecha de antes se pierde y los juegos se vuelven a contar). */
  async function resurface(b: Ball) {
    const q = resurfaceQuestion(b, today, formatDate);
    if (!q) {
      toast(`La ${b.name} ya dice que la puliste hoy`);
      return;
    }
    const ok = await confirm({ title: q.title, message: q.message, confirmText: 'Sí, la pulí' });
    if (!ok) return;
    await act(b.id, () => resurfaceBall(b.id), `La ${b.name} quedó pulida hoy`);
  }

  async function retire(id: string, name: string, on: boolean) {
    if (on) {
      const ok = await confirm({
        title: `¿Retirar la ${name}?`,
        message: 'Ya no sale al anotar. Sus números se quedan y la puedes volver a usar cuando quieras.',
        confirmText: 'Retirar',
      });
      if (!ok) return;
    }
    await act(id, () => retireBall(id, on), on ? 'Bola retirada' : 'Bola de vuelta');
  }

  let content;
  if (mine.loading && !balls.length) {
    content = <ListSkeleton rows={2} />;
  } else if (mine.error && !balls.length) {
    content = <LoadError error={mine.error} />;
  } else if (!balls.length) {
    content = (
      <Empty icon={<BallIcon className="size-8" />} title="Todavía no tienes bolas">
        Registra tus bolas y elige con cuál tiras cada juego al anotarlo: verás con cuál te va mejor y cuándo toca pulirla.
        <div className="mt-4 flex justify-center">
          <Button variant="primary" className="h-11" icon={<Plus className="size-4" />} onClick={() => setOpen('nueva')}>
            Agregar bola
          </Button>
        </div>
      </Empty>
    );
  } else {
    content = (
      <>
        {best && (
          <p className="flex items-start gap-2 rounded-xl bg-accent-soft px-3 py-2.5 text-sm text-accent">
            <Trophy className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {best}
          </p>
        )}
        {games.error && !games.data.length && <LoadError error={games.error} />}
        {active.map((s) => (
          <BallCard
            key={s.ball.id}
            stats={s}
            busy={busy === s.ball.id}
            onEdit={() => setOpen(s.ball.id)}
            onResurface={() => void resurface(s.ball)}
            onRetire={() => void retire(s.ball.id, s.ball.name, true)}
          />
        ))}
        <Button variant="primary" className="h-11" icon={<Plus className="size-4" />} disabled={full} onClick={() => setOpen('nueva')}>
          Agregar bola
        </Button>
        {full && <p className="text-center text-xs text-muted">Ya tienes {BALL_MAX} bolas: borra una que ya no uses para agregar otra.</p>}
        {retired.length > 0 && (
          <section className="flex flex-col gap-3" aria-label="Retiradas">
            <h2 className="px-1 text-xs font-semibold tracking-wide text-muted uppercase">Retiradas</h2>
            {retired.map((s) => (
              <BallCard
                key={s.ball.id}
                stats={s}
                busy={busy === s.ball.id}
                onEdit={() => setOpen(s.ball.id)}
                onResurface={() => undefined}
                onRetire={() => void retire(s.ball.id, s.ball.name, false)}
              />
            ))}
          </section>
        )}
        <p className="text-xs text-muted">
          Elige la bola al anotar cada juego: en tus juegos sueltos y en tus juegos de la liga («Mis juegos» y «Subir mis
          juegos»). Los promedios usan los juegos que ya cuentan en cada liga; strikes y spares, los anotados por cuadros.
          Solo tú ves tus bolas.
        </p>
      </>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-2">
          <BackLink fallback="/perfil" className="-ml-2 flex size-11 items-center justify-center p-0" />
          <div className="min-w-0 pt-0.5">
            <h1 className="text-2xl font-bold tracking-tight">Mis bolas</h1>
            <p className="text-sm text-muted">Con cuál tiras mejor y cuándo toca pulirlas</p>
          </div>
        </div>
        {content}
      </div>
      {(isNew || editing) && <BallSheet key={editing?.id ?? 'nueva'} ball={editing} today={today} onClose={() => setOpen(null)} />}
    </AppShell>
  );
}
