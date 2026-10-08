import { useCallback, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { CloudUpload, Heart, Lock, Plus } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { countedFrames, soloStatGames } from '../lib/bowlingStats';
import { soloByMonth, soloHigh, soloOldestFirst, soloSeries, soloSummary, soloVenues, useMySoloSessions, type SoloSession } from '../lib/data/solo';
import { formatDate, toIsoDate } from '../lib/format';
import { useNow } from '../lib/useNow';
import { getSport } from '../sports/registry';
import { useIsPro } from '../components/mode';
import { ScreenTitle, ScreenTop, SignInCard } from '../components/screens/ScreenBits';
import { AppShell } from '../components/Shell';
import { SoloGameSheet } from '../components/solo/SoloGameSheet';
import { NumbersGrid, ShotsCard, TrendCard } from '../components/stats/YoStats';
import { Button, Card, DateBlock, ListRow, ListSkeleton, Loading, LoadError, SectionHeader, Segmented, Skeleton, StatDuo, cx } from '../components/ui';

/** «Por día» (la lista) o «Estadísticas» (la tendencia y tus tiros). */
type SoloView = 'dias' | 'estadisticas';

/**
 * Juegos sueltos (/juegos-sueltos), rediseño «Calma y foco»: «‹ Yo», el título y una línea, tus números (Lite: el promedio
 * y el mejor juego; Pro: los 6 de siempre), un solo botón «Anotar juego suelto» y la lista por mes (la fecha, la bolera,
 * los juegos y la serie; el candado si no sale en tu perfil y la nube si falta enviarlo). Tocar uno lo abre para
 * cambiarlo o borrarlo. En Pro, «Por día | Estadísticas» (`?ver=estadisticas`) cambia la lista por la tendencia y tus
 * tiros (como en Yo).
 * `?juego=<id>` abre ese (los avisos y el perfil llevan aquí); `?nuevo=1`, uno nuevo (Crear o unirme y «¿Dónde
 * jugaste?» en Hoy). Sin cuenta, invita a entrar y vuelve aquí.
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
        <div className="flex flex-col px-2">
          <ScreenTop label="Yo" fallback="/perfil" />
          <ScreenTitle title="Juegos sueltos" />
          <SignInCard
            className="mt-5"
            icon={<Icon />}
            title="Entra para anotar tus juegos sueltos"
            text="Lleva tu promedio y tus mejores juegos de boliche fuera de una liga."
            next={next}
          />
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
  // Todos los juegos, del más viejo al más nuevo (la tendencia; el mismo día, en el orden en que se jugaron) y los
  // cuadros que cuadran (el análisis).
  const games = useMemo(
    () => soloOldestFirst(sessions.data).flatMap((s) => soloStatGames(s, (i) => `${s.venue || 'Juego suelto'} · J${i + 1} · ${formatDate(s.playedOn)}`)),
    [sessions.data],
  );
  const frames = useMemo(() => countedFrames(games), [games]);
  const pro = useIsPro();
  const statsView = params.get('ver') === 'estadisticas';

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

  const setStatsView = useCallback(
    (on: boolean) =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          if (on) next.set('ver', 'estadisticas');
          else next.delete('ver');
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  // El único botón de la pantalla.
  const add = (
    <Button variant="primary" size={pro ? 'lg' : 'xl'} className="w-full" icon={<Plus className="size-5" strokeWidth={2.4} />} onClick={() => setOpen('nuevo')}>
      Anotar juego suelto
    </Button>
  );
  // Un link a uno que todavía no está en la lista (la copia del teléfono es vieja) se abre cuando llega; si ya no
  // existe, no se abre nada.
  let content;
  if (sessions.loading && !sessions.data.length) {
    content = (
      <div className="flex flex-col gap-3.5" aria-busy="true" aria-label="Cargando tus juegos sueltos">
        <Skeleton className="h-[104px] rounded-3xl" />
        <ListSkeleton rows={3} />
      </div>
    );
  } else if (sessions.error && !sessions.data.length) {
    content = <LoadError error={sessions.error} />;
  } else if (!sessions.data.length) {
    const Icon = getSport('bowling').icon;
    content = (
      <Card className="flex flex-col items-center px-5 pt-7 pb-5 text-center">
        <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Icon className="size-7" />
        </span>
        <h2 className="mt-4 text-card-title">Todavía no tienes juegos sueltos</h2>
        <p className="mt-2 max-w-sm text-body text-muted">Tu promedio y tus mejores juegos salen aquí y en tu perfil.</p>
        <div className="mt-6 w-full">{add}</div>
      </Card>
    );
  } else {
    // En Lite la lista; «Estadísticas» es de Pro (si llega un link con ?ver=estadisticas, se ve y se puede volver).
    const showViews = pro || statsView;
    content = (
      <>
        {pro ? (
          <NumbersGrid
            items={[
              { label: 'Promedio', value: summary.average ?? '—', accent: true },
              { label: 'Más alto', value: summary.high || '—' },
              { label: 'Mejor serie', value: summary.bestSeries || '—' },
              { label: 'Juegos', value: summary.games },
              { label: summary.sessions === 1 ? 'Día' : 'Días', value: summary.sessions },
              { label: 'Por cuadros', value: frames.length },
            ]}
          />
        ) : (
          <div>
            <StatDuo left={{ value: summary.average ?? '—', label: 'Promedio' }} right={{ value: summary.high || '—', label: 'Más alto' }} />
            <p className="mx-1 mt-2.5 text-meta text-muted">
              {summary.games} {summary.games === 1 ? 'juego' : 'juegos'} en {summary.sessions} {summary.sessions === 1 ? 'día' : 'días'}
              {summary.bestSeries ? ` · mejor serie ${summary.bestSeries}` : ''}
            </p>
          </div>
        )}
        {add}
        {showViews && (
          <Segmented<SoloView>
            label="Qué ver"
            full
            options={[
              { key: 'dias', label: 'Por día' },
              { key: 'estadisticas', label: 'Estadísticas' },
            ]}
            value={statsView ? 'estadisticas' : 'dias'}
            onChange={(k) => setStatsView(k === 'estadisticas')}
          />
        )}
        {statsView ? (
          <div className="flex flex-col gap-3.5">
            <TrendCard games={games} average={summary.average} today={today} />
            {games.length < 2 && <p className="mx-1 text-meta text-muted">Con dos juegos o más aquí ves cómo vas.</p>}
            <ShotsCard frames={frames} games={summary.games} />
          </div>
        ) : (
          months.map((m) => (
            <section key={m.month} aria-labelledby={`mes-${m.month}`}>
              <SectionHeader id={`mes-${m.month}`} title={m.label.charAt(0).toUpperCase() + m.label.slice(1)} />
              <Card className="overflow-hidden">
                {m.sessions.map((s) => (
                  <SoloRow key={s.id} session={s} dense={pro} onOpen={() => setOpen(s.id)} />
                ))}
              </Card>
            </section>
          ))
        )}
      </>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col px-2">
        <ScreenTop label="Yo" fallback="/perfil" />
        <ScreenTitle title="Juegos sueltos" hint="Boliche sin liga ni torneo" pro={pro} />
        <div className={cx('mt-5 flex flex-col', pro ? 'gap-3.5' : 'gap-[22px]')}>{content}</div>
      </div>
      {(isNew || editing) && (
        <SoloGameSheet key={editing?.id ?? 'nuevo'} session={editing} venues={venues} today={today} onClose={() => setOpen(null)} />
      )}
    </AppShell>
  );
}

/** «210 · 180 · 190»: los juegos del día, en una línea. */
export const soloScoresLine = (s: Pick<SoloSession, 'scores'>): string => s.scores.join(' · ');

/**
 * Un día de juegos sueltos en la lista: la fecha (OCT / 13), la bolera, los juegos y, a la derecha, la serie (o los pinos
 * de un solo juego). El candado dice que no sale en tu perfil y la nube, que falta enviarlo. Toda la fila lo abre.
 */
export function SoloRow({ session: s, onOpen, dense }: { session: SoloSession; onOpen: () => void; dense?: boolean }) {
  const many = s.scores.length > 1;
  const label = [
    `${s.venue || 'Juego suelto'}, ${formatDate(s.playedOn)}`,
    many ? `${s.scores.join(', ')}: serie ${soloSeries(s)}` : `${soloHigh(s)} pinos`,
    !s.shared && 'solo lo ves tú',
    s.pending && 'por enviar',
  ]
    .filter(Boolean)
    .join(' · ');
  const marks = !s.shared || s.pending || s.likes > 0;
  return (
    <ListRow
      dense={dense}
      onClick={onOpen}
      ariaLabel={label}
      leading={<DateBlock date={s.playedOn} />}
      title={s.venue || 'Juego suelto'}
      subtitle={
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="num truncate">{soloScoresLine(s)}</span>
          {marks && (
            <span aria-hidden="true" className="flex shrink-0 items-center gap-1.5 text-faint">
              {!s.shared && <Lock className="size-3.5" />}
              {s.pending && <CloudUpload className="size-3.5 text-accent" />}
              {s.likes > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <Heart className="size-3.5" /> {s.likes}
                </span>
              )}
            </span>
          )}
        </span>
      }
      value={many ? soloSeries(s) : soloHigh(s)}
      chevron={false}
    />
  );
}
