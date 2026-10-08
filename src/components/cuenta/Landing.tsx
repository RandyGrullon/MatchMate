import { useMemo } from 'react';
import { Link } from 'react-router';
import { BellRing, CalendarSearch, ChevronRight, ListOrdered, Radio } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { usePublicLeagues } from '../../lib/data';
import { toIsoDate } from '../../lib/format';
import { useNow } from '../../lib/useNow';
import { SPORTS } from '../../sports/registry';
import { openSports, useSportStatus } from '../../sports/status';
import type { SportId } from '../../sports/types';
import { agendaCardNote } from '../agenda/logic';
import { BusyIcon } from '../busy';
import { useJoin } from '../home/useHomeData';
import { LeagueTile } from '../ligas/LigasRows';
import { openLeagueSubtitle } from '../ligas/OpenLeagues';
import { Logo, Wordmark } from '../Logo';
import { Card, ListRow, ListSkeleton, LoadError, RowIcon, SectionHeader, cx, sectionLinkClass } from '../ui';
import { linkButton } from './kit';

/** Ligas públicas que se ven en la portada (las demás, en «Ver todas»). */
export const LANDING_PUBLIC = 5;

/** Qué hace la app, en 3 filas cortas. */
export const LANDING_FEATURES = [
  { icon: ListOrdered, title: 'La tabla se hace sola', text: 'Con cada resultado que se anota' },
  { icon: Radio, title: 'Resultados en vivo', text: 'Anotas en la cancha y todos lo ven' },
  { icon: BellRing, title: 'Avisos en tu teléfono', text: 'Tu próximo juego y lo que falta' },
] as const;

/**
 * «Boliche, pádel, tenis y 7 deportes más»: los deportes abiertos en una línea (con 3 o menos, todos). Sin ninguno
 * abierto todavía, «Tu deporte».
 */
export function sportsLine(open: readonly SportId[]): string {
  const names = [...new Set(open.map((id) => SPORTS[id].lower))];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (!names.length) return 'Tu deporte';
  if (names.length <= 3) return cap(names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`);
  const rest = names.length - 3;
  return cap(`${names.slice(0, 3).join(', ')} y ${rest} ${rest === 1 ? 'deporte' : 'deportes'} más`);
}

/**
 * La portada sin cuenta (`/`), rediseño «Calma y foco»: la marca, un título, de qué deportes es y un solo botón
 * («Crear mi cuenta»; «Ya tengo cuenta» al lado, en gris). Debajo, las ligas abiertas (se ven sin cuenta), «¿Dónde
 * juego esta semana?» y qué hace la app. Los deportes uno por uno están en Acerca de y en Ligas abiertas.
 */
export function Landing() {
  const auth = useAuth();
  const { status } = useSportStatus(auth.isSuper);
  const publics = usePublicLeagues();
  const now = useNow();
  const today = toIsoDate(now);
  const open = useMemo(() => openSports(status), [status]);
  const leagues = publics.data.slice(0, LANDING_PUBLIC);
  const manySports = new Set(publics.data.map((l) => l.sport)).size > 1;
  const next = encodeURIComponent('/');
  // «Unirme» como en Ligas abiertas: sin cuenta lleva a entrar y después sigue con la liga.
  const { joining, join, modal } = useJoin();

  return (
    <div className="flex flex-col px-2">
      <header className="flex items-center gap-2.5" aria-label="MatchMate">
        <Logo className="size-9" />
        <Wordmark className="text-[19px]" />
      </header>

      <h1 className="mt-7 text-title">Tu liga, en el celular</h1>
      <p className="mt-2 text-body text-fg-2">{`${sportsLine(open)}. La tabla, los resultados en vivo y tus números. Gratis.`}</p>
      <div className="mt-6 flex flex-col gap-2.5">
        <Link to={`/login?modo=registro&next=${next}`} className={linkButton('primary', 'w-full')}>
          Crear mi cuenta
        </Link>
        <Link to={`/login?next=${next}`} className={linkButton('quiet', 'w-full')}>
          Ya tengo cuenta
        </Link>
      </div>

      <section aria-labelledby="portada-abiertas" className="mt-[30px]">
        <SectionHeader
          id="portada-abiertas"
          title="Ligas abiertas"
          action={
            <Link to="/ligas" className={sectionLinkClass}>
              Ver todas <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
          }
        />
        {publics.loading && !publics.data.length ? (
          <ListSkeleton rows={3} />
        ) : publics.error && !publics.data.length ? (
          // Sin señal o muchas visitas seguidas sin cuenta: no es que no haya ligas.
          <LoadError error={publics.error} />
        ) : !leagues.length ? (
          <p className="mx-1 text-meta text-muted">Todavía no hay ligas abiertas. Crea tu cuenta y arma la primera.</p>
        ) : (
          <Card className="overflow-hidden">
            {leagues.map((l) => (
              <ListRow
                key={l.id}
                leading={<LeagueTile league={l} dense />}
                title={l.name}
                subtitle={openLeagueSubtitle(l, today, now.getTime(), manySports)}
                to={`/l/${l.id}`}
                trailing={
                  <button
                    type="button"
                    onClick={() => void join(l)}
                    disabled={joining === l.id}
                    aria-busy={joining === l.id || undefined}
                    aria-label={`Unirme a ${l.name}`}
                    className={cx(
                      "relative inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-accent-soft px-3.5 text-sm font-[650] text-accent transition after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] active:scale-[0.97]",
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-80',
                    )}
                  >
                    <span aria-hidden="true" className={cx(joining === l.id && 'text-transparent')}>
                      Unirme
                    </span>
                    <BusyIcon busy={joining === l.id} className="absolute inset-0 m-auto size-4" />
                  </button>
                }
              />
            ))}
          </Card>
        )}
        <Card className="mt-3.5 overflow-hidden">
          <ListRow
            leading={
              <RowIcon tone="accent">
                <CalendarSearch className="size-5" />
              </RowIcon>
            }
            // En 360 px no cabe en una línea: pasa a dos en vez de cortarse con «…».
            title={<span className="whitespace-normal">¿Dónde juego esta semana?</span>}
            subtitle={agendaCardNote(null)}
            to="/agenda"
          />
        </Card>
      </section>

      <section aria-labelledby="portada-que" className="mt-[30px]">
        <SectionHeader id="portada-que" title="Qué hace por ti" />
        <Card className="overflow-hidden">
          {LANDING_FEATURES.map(({ icon: Icon, title, text }) => (
            <ListRow
              key={title}
              leading={
                <RowIcon>
                  <Icon className="size-5" />
                </RowIcon>
              }
              title={title}
              subtitle={text}
            />
          ))}
        </Card>
      </section>
      {modal}
    </div>
  );
}
