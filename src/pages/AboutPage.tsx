import { Link } from 'react-router';
import { BellRing, Camera, ChartLine, ClipboardPen, Info, LogIn, MessageCircle, Trophy, UserPlus, Users, type LucideIcon } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { appVersion } from '../lib/errorReport';
import { sportHomePath } from '../lib/sportContext';
import { SPORT_GROUPS } from '../sports/registry';
import type { SportId } from '../sports/types';
import { Logo, Wordmark } from '../components/Logo';
import { AppShell } from '../components/Shell';
import { SportTint } from '../components/home/SportTint';
import { Card } from '../components/ui';
import { SportIcon } from './sports/SportBits';
import { PRIVACY_PATH, TERMS_PATH } from './legal/legal';

export const ABOUT_TAGLINE = 'Tus ligas, tus juegos y tus estadísticas en un solo lugar';

/** Qué se puede hacer en la app (corto: se lee en el teléfono). */
export const ABOUT_FEATURES: readonly { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Trophy, title: 'Crear ligas y torneos', text: 'De tu deporte, con su calendario, sus tablas y su ranking.' },
  { icon: Users, title: 'Invitar a tu gente', text: 'Con un link, un código o buscándolos por su @usuario.' },
  { icon: ClipboardPen, title: 'Anotar juegos y resultados', text: 'Desde la cancha o la bolera, y todos lo ven al momento.' },
  { icon: ChartLine, title: 'Estadísticas y promedios', text: 'Tu promedio, tu mejor juego y cómo vas en cada liga.' },
  { icon: Camera, title: 'Leer la foto del marcador', text: 'En el boliche le tomas foto a la pantalla y la app pone los pinos.' },
  { icon: BellRing, title: 'Avisos en tu teléfono', text: 'Tu próximo partido, resultados por confirmar e invitaciones.' },
];

export const ABOUT_STEPS: readonly { title: string; text: string }[] = [
  { title: 'Crea tu cuenta', text: 'Con tu correo o con Google. Es gratis.' },
  { title: 'Crea tu liga o únete a una', text: 'Con el link o el código que te pasen, o entra a una liga pública.' },
  { title: 'Anota y compite', text: 'Tus juegos, la tabla, tus estadísticas y los avisos, todo en el celular.' },
];

/**
 * Columnas de la grilla de deportes: 4 cuando llenan las filas; si no, 3 cuando esas sí (9 grupos = 3 × 3, sin un
 * cuadro solo en la última fila). Clases enteras para que Tailwind las vea.
 */
export const sportGridCols = (n: number): string => (n % 4 !== 0 && n % 3 === 0 ? 'grid-cols-3' : 'grid-cols-4');

const linkBtn = 'inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:scale-[0.97]';

/**
 * Acerca de MatchMate (/acerca, en la barra de quien no tiene cuenta en lugar de «Perfil»): qué es, de qué deportes,
 * qué se puede hacer, cómo empezar y los links para crear la cuenta o entrar (los de /login), la privacidad, los
 * términos y cómo escribirnos.
 */
export default function AboutPage() {
  const { user } = useAuth();
  const version = appVersion();
  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <section className="flex flex-col items-center gap-3 rounded-3xl border border-line bg-gradient-to-b from-accent-soft via-accent-soft/40 to-surface px-5 pt-7 pb-6 text-center card-shadow">
          <Logo className="size-16" title="MatchMate" />
          <h1 className="text-3xl leading-tight">
            <Wordmark />
          </h1>
          <p className="max-w-sm text-base font-medium text-fg/90">{ABOUT_TAGLINE}</p>
          <p className="max-w-sm text-sm text-muted">Ligas y torneos entre amigos, en español y gratis.</p>
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="acerca-deportes">
          <h2 id="acerca-deportes" className="text-lg font-bold tracking-tight">
            Los deportes
          </h2>
          <ul className={`grid ${sportGridCols(SPORT_GROUPS.length)} gap-2`}>
            {SPORT_GROUPS.map((g) => {
              const sport = g.sports[0] as SportId;
              // El otro nombre («Tenis de mesa») va en el nombre accesible y en el título: en 11 px solo cabe «Ping pong».
              const full = g.alias ? `${g.name} (${g.alias.toLowerCase()})` : undefined;
              return (
                <li key={g.id}>
                  <SportTint sport={sport} className="h-full">
                    <Link
                      to={sportHomePath(sport)}
                      aria-label={full}
                      title={full}
                      className="flex h-full min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface px-1 py-2 text-center transition hover:bg-surface-2 active:scale-[0.97]"
                    >
                      <span className="flex size-10 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                        <SportIcon sport={sport} className="size-5" />
                      </span>
                      <span className="w-full truncate text-[11px] font-semibold sm:text-xs">{g.name}</span>
                    </Link>
                  </SportTint>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="acerca-que">
          <h2 id="acerca-que" className="text-lg font-bold tracking-tight">
            Qué puedes hacer
          </h2>
          <Card className="overflow-hidden">
            <ul className="grid gap-px bg-line sm:grid-cols-2">
              {ABOUT_FEATURES.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex items-start gap-3 bg-surface px-4 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="block text-xs text-muted">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="acerca-empezar">
          <h2 id="acerca-empezar" className="text-lg font-bold tracking-tight">
            Cómo empezar
          </h2>
          <ol className="flex flex-col gap-2">
            {ABOUT_STEPS.map((s, i) => (
              <li key={s.title} className="flex items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-fg">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{s.title}</span>
                  <span className="block text-xs text-muted">{s.text}</span>
                </span>
              </li>
            ))}
          </ol>
          {user ? (
            <Link to="/" className={`${linkBtn} mt-1 bg-accent text-accent-fg shadow-sm hover:brightness-110`}>
              Ir al Home
            </Link>
          ) : (
            <div className="mt-1 grid grid-cols-2 gap-2">
              <Link to="/login" className={`${linkBtn} border border-line bg-surface text-fg hover:bg-surface-2`}>
                <LogIn className="size-4" aria-hidden="true" /> Entrar
              </Link>
              <Link to="/login?modo=registro" className={`${linkBtn} bg-accent text-accent-fg shadow-sm hover:brightness-110`}>
                <UserPlus className="size-4" aria-hidden="true" /> Crear cuenta
              </Link>
            </div>
          )}
        </section>

        <footer className="flex flex-col gap-1 border-t border-line pt-4 text-sm text-muted">
          <nav aria-label="Más información" className="flex flex-wrap gap-x-5">
            <Link to={PRIVACY_PATH} className="inline-flex min-h-11 items-center font-medium text-accent">
              Privacidad
            </Link>
            <Link to={TERMS_PATH} className="inline-flex min-h-11 items-center font-medium text-accent">
              Términos
            </Link>
            <Link to="/contacto" className="inline-flex min-h-11 items-center gap-1.5 font-medium text-accent">
              <MessageCircle className="size-4" aria-hidden="true" /> Contáctanos
            </Link>
          </nav>
          {version && (
            <p className="flex items-center gap-1.5 text-xs">
              <Info className="size-3.5" aria-hidden="true" /> Versión {version}
            </p>
          )}
        </footer>
      </div>
    </AppShell>
  );
}
