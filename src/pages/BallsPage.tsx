import { useCallback, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { Plus, Trophy } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { BALL_MAX, ballStats, bestBallText, resurfaceQuestion, type Ball } from '../lib/balls';
import { ballErrorText, resurfaceBall, retireBall, useMyBallGames, useMyBalls } from '../lib/data/balls';
import { formatDate, toIsoDate } from '../lib/format';
import { useNow } from '../lib/useNow';
import { BallDesigner } from '../components/balls/BallDesigner';
import { BallIcon } from '../components/balls/BallPicker';
import { BallSheet } from '../components/balls/BallSheet';
import { BallCard } from '../components/balls/BallStats';
import { useFeedback } from '../components/feedback';
import { ScreenTitle, ScreenTop, SignInCard } from '../components/screens/ScreenBits';
import { AppShell } from '../components/Shell';
import { Button, Card, ListSkeleton, Loading, LoadError, SectionHeader } from '../components/ui';

/**
 * Mis bolas (/bolas), rediseño «Calma y foco»: «‹ Yo», el título y una línea; con cuál tiras mejor (una sola línea), cada
 * bola en su tarjeta (dibujada con su diseño, sus números en una fila y cuántos juegos lleva desde la última pulida, con
 * «La pulí hoy»; Editar, Diseñar y Retirar en su «•••»), un solo botón «Agregar bola» y las retiradas aparte. La bola de
 * cada juego se elige al anotarlo (juegos sueltos, «Mis juegos» y «Subir mis juegos» en la liga). `?bola=<id>` abre esa;
 * `?nueva=1`, una nueva; `?disenar=<id>`, el creador de esa. Solo la cuenta ve sus bolas. Sin cuenta, invita a entrar y
 * vuelve aquí.
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
        <div className="flex flex-col px-2">
          <ScreenTop label="Yo" fallback="/perfil" />
          <ScreenTitle title="Mis bolas" />
          <SignInCard
            className="mt-5"
            icon={<BallIcon />}
            title="Entra para registrar tus bolas"
            text="Mira con cuál te va mejor y cuándo toca pulirla."
            next={next}
          />
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
  const designId = params.get('disenar');
  const editing = openId ? (balls.find((b) => b.id === openId) ?? null) : null;
  const designing = designId ? (balls.find((b) => b.id === designId) ?? null) : null;
  const full = balls.length >= BALL_MAX;

  /** Abre la hoja de una bola (`as` 'bola'), una nueva ('nueva') o el creador de una ('disenar'); null cierra. */
  const setOpen = useCallback(
    (id: string | 'nueva' | null, as: 'bola' | 'disenar' = 'bola') =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          next.delete('bola');
          next.delete('nueva');
          next.delete('disenar');
          if (id === 'nueva') next.set('nueva', '1');
          else if (id) next.set(as, id);
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

  // El único botón principal de la pantalla.
  const add = (
    <Button variant="primary" size="xl" className="w-full" icon={<Plus className="size-5" strokeWidth={2.4} />} disabled={full} onClick={() => setOpen('nueva')}>
      Agregar bola
    </Button>
  );
  let content;
  if (mine.loading && !balls.length) {
    content = <ListSkeleton rows={2} />;
  } else if (mine.error && !balls.length) {
    content = <LoadError error={mine.error} />;
  } else if (!balls.length) {
    content = (
      <Card className="flex flex-col items-center px-5 pt-7 pb-5 text-center">
        <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
          <BallIcon className="size-7" />
        </span>
        <h2 className="mt-4 text-card-title">Todavía no tienes bolas</h2>
        <p className="mt-2 max-w-sm text-body text-muted">Elige con cuál tiras cada juego al anotarlo y verás con cuál te va mejor.</p>
        <div className="mt-6 w-full">{add}</div>
      </Card>
    );
  } else {
    content = (
      <>
        {best && (
          <p className="flex items-center gap-3 rounded-2xl bg-accent-soft py-3 pr-4 pl-3.5 text-meta font-[550] text-accent">
            <Trophy className="size-5 shrink-0" aria-hidden="true" /> {best}
          </p>
        )}
        {games.error && !games.data.length && <LoadError error={games.error} />}
        {active.map((s) => (
          <BallCard
            key={s.ball.id}
            stats={s}
            busy={busy === s.ball.id}
            onEdit={() => setOpen(s.ball.id)}
            onDesign={() => setOpen(s.ball.id, 'disenar')}
            onResurface={() => void resurface(s.ball)}
            onRetire={() => void retire(s.ball.id, s.ball.name, true)}
          />
        ))}
        {add}
        {full && <p className="-mt-2 text-center text-[13px] text-muted">Ya tienes {BALL_MAX} bolas: borra una que ya no uses para agregar otra.</p>}
        {retired.length > 0 && (
          <section className="flex flex-col gap-3.5" aria-labelledby="bolas-retiradas">
            <SectionHeader id="bolas-retiradas" title="Retiradas" className="mb-0!" />
            {retired.map((s) => (
              <BallCard
                key={s.ball.id}
                stats={s}
                busy={busy === s.ball.id}
                onEdit={() => setOpen(s.ball.id)}
                onDesign={() => setOpen(s.ball.id, 'disenar')}
                onResurface={() => undefined}
                onRetire={() => void retire(s.ball.id, s.ball.name, false)}
              />
            ))}
          </section>
        )}
        <p className="mx-1 text-[13px] text-muted">Elige la bola al anotar cada juego. Strikes y spares salen de los juegos anotados por cuadros.</p>
      </>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col px-2">
        <ScreenTop label="Yo" fallback="/perfil" />
        <ScreenTitle title="Mis bolas" hint="Solo tú ves tus bolas" />
        <div className="mt-5 flex flex-col gap-3.5">{content}</div>
      </div>
      {designing ? (
        <BallDesigner key={designing.id} ball={designing} onClose={() => setOpen(null)} />
      ) : (
        (isNew || editing) && (
          <BallSheet
            key={editing?.id ?? 'nueva'}
            ball={editing}
            today={today}
            onClose={() => setOpen(null)}
            onDesign={editing ? () => setOpen(editing.id, 'disenar') : undefined}
          />
        )
      )}
    </AppShell>
  );
}
