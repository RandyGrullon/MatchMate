import { Link } from 'react-router';
import { Info, MessageCircle, ScrollText, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { appVersion } from '../lib/errorReport';
import { sportHomePath } from '../lib/sportContext';
import { SPORT_GROUPS } from '../sports/registry';
import type { SportId } from '../sports/types';
import { Logo, Wordmark } from '../components/Logo';
import { AppShell } from '../components/Shell';
import { SportTint } from '../components/home/SportTint';
import { BackBar, linkButton } from '../components/cuenta/kit';
import { Card, ListRow, RowIcon, SectionHeader } from '../components/ui';
import { SportIcon } from './sports/SportBits';
import { PRIVACY_PATH, TERMS_PATH } from './legal/legal';
import { ABOUT_FEATURES, ABOUT_HEADINGS, ABOUT_NOTE, ABOUT_STEPS, ABOUT_TAGLINE, sportFullName, sportGridCols } from './aboutText';

// Lo que dice la página (la frase, qué puedes hacer, cómo empezar, la grilla de deportes): aboutText.ts (lo comparte la
// app del teléfono).
export { ABOUT_FEATURES, ABOUT_STEPS, ABOUT_TAGLINE, sportGridCols };

/** Un número en círculo, en el color del deporte (los pasos de «Cómo empezar»). */
function StepNumber({ n }: { n: number }) {
  return (
    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-base font-bold text-accent">
      {n}
    </span>
  );
}

/**
 * Acerca de MatchMate (/acerca; sin cuenta, en la barra de abajo; con cuenta, desde Configuración con «‹ Configuración»),
 * rediseño «Calma y foco»: el logo y el título con la frase, los deportes en cuadros, qué puedes hacer y cómo empezar en
 * filas, un solo botón («Crear cuenta», con «Entrar» al lado en gris) y abajo la privacidad, los términos, cómo
 * escribirnos y la versión.
 */
export default function AboutPage() {
  const { user } = useAuth();
  const version = appVersion();
  return (
    <AppShell>
      <div className="flex flex-col px-2">
        {user ? <BackBar to="/cuenta" label="Configuración" className="-mt-2 mb-1" /> : null}
        <Logo className="size-12" title="MatchMate" />
        <h1 className="mt-5 text-title">
          Acerca de <Wordmark />
        </h1>
        <p className="mt-2 text-body text-fg-2">{ABOUT_TAGLINE}</p>
        <p className="mt-1 text-meta text-muted">{ABOUT_NOTE}</p>

        <section className="mt-[30px]" aria-labelledby="acerca-deportes">
          <SectionHeader id="acerca-deportes" title={ABOUT_HEADINGS.sports} />
          <ul className={`grid ${sportGridCols(SPORT_GROUPS.length)} gap-2.5`}>
            {SPORT_GROUPS.map((g) => {
              const sport = g.sports[0] as SportId;
              // El otro nombre («Tenis de mesa») va en el nombre accesible y en el título: en 12 px solo cabe «Ping pong».
              const full = sportFullName(g);
              return (
                <li key={g.id}>
                  <SportTint sport={sport} className="h-full">
                    <Link
                      to={sportHomePath(sport)}
                      aria-label={full}
                      title={full}
                      className="card-shadow flex h-full min-h-[92px] flex-col items-center justify-center gap-2 rounded-[20px] bg-surface px-1 py-3 text-center transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
                        <SportIcon sport={sport} className="size-5" />
                      </span>
                      <span className="w-full truncate text-[13px] font-semibold">{g.name}</span>
                    </Link>
                  </SportTint>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mt-[30px]" aria-labelledby="acerca-que">
          <SectionHeader id="acerca-que" title={ABOUT_HEADINGS.features} />
          <Card className="overflow-hidden">
            {ABOUT_FEATURES.map(({ icon: Icon, title, text }) => (
              <ListRow
                key={title}
                leading={
                  <RowIcon tone="accent">
                    <Icon className="size-5" />
                  </RowIcon>
                }
                title={title}
                subtitle={text}
              />
            ))}
          </Card>
        </section>

        <section className="mt-[30px]" aria-labelledby="acerca-empezar">
          <SectionHeader id="acerca-empezar" title={ABOUT_HEADINGS.steps} />
          <Card className="overflow-hidden">
            <ol>
              {ABOUT_STEPS.map((s, i) => (
                <li key={s.title} className="mm-row relative">
                  <ListRow leading={<StepNumber n={i + 1} />} title={s.title} subtitle={s.text} />
                </li>
              ))}
            </ol>
          </Card>
          {!user && (
            <div className="mt-5 flex flex-col gap-2.5">
              <Link to="/login?modo=registro" className={linkButton('primary', 'w-full')}>
                Crear cuenta
              </Link>
              <Link to="/login" className={linkButton('quiet', 'w-full')}>
                Entrar
              </Link>
            </div>
          )}
        </section>

        <nav aria-label="Más información" className="mt-[30px]">
          <Card className="overflow-hidden">
            <ListRow
              leading={
                <RowIcon>
                  <ShieldCheck className="size-5" />
                </RowIcon>
              }
              title="Privacidad"
              to={PRIVACY_PATH}
            />
            <ListRow
              leading={
                <RowIcon>
                  <ScrollText className="size-5" />
                </RowIcon>
              }
              title="Términos"
              to={TERMS_PATH}
            />
            <ListRow
              leading={
                <RowIcon>
                  <MessageCircle className="size-5" />
                </RowIcon>
              }
              title="Contáctanos"
              to="/contacto"
            />
          </Card>
        </nav>
        {version && (
          <p className="mx-1 mt-3 flex items-center gap-1.5 text-[13px] text-muted">
            <Info className="size-3.5" aria-hidden="true" /> Versión {version}
          </p>
        )}
      </div>
    </AppShell>
  );
}
