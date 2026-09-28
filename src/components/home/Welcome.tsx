import { Link } from 'react-router';
import { ArrowRight, BellRing, ListOrdered, LogIn, Radio, UserPlus } from 'lucide-react';
import { joinList } from '../../lib/format';
import { SPORTS } from '../../sports/registry';
import type { SportId } from '../../sports/types';
import { Wordmark } from '../Logo';
import { SportSplash } from '../splash/SportSplash';

const FEATURES = [
  {
    icon: ListOrdered,
    title: 'Tablas y ranking',
    text: 'Se calculan solos con cada resultado.',
  },
  {
    icon: Radio,
    title: 'En vivo',
    text: 'Anota desde la cancha y todos lo ven al momento.',
  },
  {
    icon: BellRing,
    title: 'Avisos',
    text: 'Tu próximo partido, resultados por confirmar y más.',
  },
];

/**
 * Portada sin cuenta: qué es MatchMate, de qué deportes son las ligas (los abiertos), y entrar o crear cuenta. Las
 * ligas públicas se ven sin cuenta.
 */
export function Welcome({ open }: { open: readonly SportId[] }) {
  const names = open.map((id) => SPORTS[id].lower);
  const next = encodeURIComponent('/');
  return (
    <section className="animate-fade-up overflow-hidden rounded-3xl border border-line bg-surface card-shadow" aria-label="Bienvenido a MatchMate">
      <div className="flex flex-col items-center gap-3 bg-gradient-to-b from-accent-soft via-accent-soft/40 to-surface px-5 pt-6 pb-5 text-center">
        <SportSplash word={false} className="pointer-events-none [--sp-w:150px]" />
        <h1 className="text-2xl leading-tight font-extrabold tracking-tight">
          Tu liga en el celular con <Wordmark />
        </h1>
        <p className="max-w-sm text-sm text-muted">
          {names.length > 1 ? `Ligas y torneos de ${joinList(names)} entre amigos` : `Tu liga de ${names[0] ?? 'tu deporte'} entre amigos`}: calendario, tablas,
          resultados en vivo y tus estadísticas. Gratis y en español.
        </p>
        <div className="grid w-full max-w-sm grid-cols-2 gap-2 pt-1">
          <Link
            to={`/login?next=${next}`}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2"
          >
            <LogIn className="size-4" /> Entrar
          </Link>
          <Link
            to={`/login?modo=registro&next=${next}`}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg shadow-sm hover:brightness-110"
          >
            <UserPlus className="size-4" /> Crear cuenta
          </Link>
        </div>
        <Link to="/ligas" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent">
          Ver las ligas públicas sin cuenta <ArrowRight className="size-4" />
        </Link>
      </div>
      <ul className="grid gap-px border-t border-line bg-line sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
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
    </section>
  );
}
