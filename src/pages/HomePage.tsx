import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, CalendarDays, Crown, Globe, Lock, LogIn, Ticket, Trophy, UserPlus } from 'lucide-react';
import { displayName, useAuth } from '../lib/auth';
import { isMatchSport, myMatchesSince, nextMatch } from '../lib/calendar';
import { useLeaguesByIds, useMyMemberships } from '../lib/data';
import { useLiveMatches, useMyMatches } from '../lib/data/matches';
import { joinList } from '../lib/format';
import { lastLeague } from '../lib/league';
import { useNow } from '../lib/useNow';
import { SPORTS, leagueSport, sportMeta, sportsOf } from '../sports/registry';
import { openSports, useSportStatus } from '../sports/status';
import { SportBadge, SportIcon } from './sports/SportBits';
import { LiveNow } from '../components/LiveNow';
import { NextMatchCard } from '../components/LiveNowMatches';
import { NotificationsPrompt } from '../components/NotificationsOptIn';
import { WeekCalendar } from '../components/WeekCalendar';
import { Tour } from '../components/Tour';
import { HOME_TOUR } from '../lib/tours';
import { AppShell } from '../components/Shell';
import { Logo } from '../components/Logo';
import { Button, Card, Input, Loading } from '../components/ui';

/**
 * Home: lo que está en juego ahora (el boliche de hoy y los partidos en vivo de tus ligas), tu próximo partido, lo
 * que viene esta semana (eventos y tus partidos), volver a tu última liga y unirse con un código (crear está en el
 * botón del centro de abajo).
 */
export default function HomePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const uid = auth.user?.uid;
  const memberships = useMyMemberships(uid);
  const leagues = useLeaguesByIds(memberships.data.map((m) => m.leagueId));
  const [code, setCode] = useState('');
  const now = useNow();
  // Mis partidos en todas mis ligas (desde ayer, más los abiertos): el próximo, los del calendario y los míos en vivo.
  // La precarga sin señal (src/lib/prefetch.ts) pide lo mismo, así esto sale de la copia del teléfono.
  const mine = useMyMatches(uid, myMatchesSince(now));
  // Los en vivo de mis ligas de raqueta y equipos, juegue o no (se releen cada 45 s mientras se ve).
  const live = useLiveMatches(uid ? leagues.data.filter((l) => isMatchSport(leagueSport(l))).map((l) => l.id) : []);

  if (auth.loading) return <Loading />;

  // La última liga que abriste en este teléfono (si sigues en ella), si no la primera.
  const last = lastLeague();
  const resume = leagues.data.find((l) => l.id === last) ?? (leagues.data.length === 1 ? leagues.data[0] : undefined);
  // Deportes de sus ligas: con uno solo se dice cuál («de boliche»); con varios, no hace falta.
  const sports = sportsOf(leagues.data);
  const only = sports.length === 1 ? sportMeta(sports[0]) : null;
  // Uno que ya está en vivo (según la lista que se relee cada 45 s) sale en «En juego ahora», no como próximo.
  const liveIds = new Set(live.data.map((m) => m.id));
  const next = auth.user ? nextMatch(mine.data.filter((m) => !liveIds.has(m.id)), leagues.data, now.getTime()) : null;

  function submitCode(e: FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c) navigate(`/unirse/${encodeURIComponent(c)}`);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <Logo className="size-11" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight">{auth.user ? `Hola, ${displayName(auth).split(' ')[0]}` : 'MatchMate'}</h1>
            <p className="text-sm text-muted">{only ? `Ligas y torneos de ${only.lower}` : sports.length > 1 ? 'Tus ligas y torneos' : 'Ligas y torneos'}</p>
          </div>
        </div>

        <Tour name="inicio" steps={HOME_TOUR} when={!!auth.user} />
        {auth.user && <LiveNow live={live.data} mine={mine.data} />}
        {next && <NextMatchCard next={next} />}
        <NotificationsPrompt />
        {/* Lo que viene en todas tus ligas (con tus partidos), semana por semana. */}
        {auth.user && <WeekCalendar matches={mine.data} />}

        {resume && (
          <Link
            to={`/l/${resume.id}`}
            className="flex items-center gap-3 rounded-2xl border border-accent/30 bg-gradient-to-br from-accent-soft via-surface to-surface p-4 transition hover:brightness-105"
          >
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-fg">
              {sports.length > 1 ? (
                <SportIcon sport={leagueSport(resume)} className="size-5" />
              ) : resume.kind === 'torneo' ? (
                <Trophy className="size-5" />
              ) : (
                <CalendarDays className="size-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-accent">Seguir en</p>
              <p className="truncate font-semibold">{resume.name}</p>
            </div>
            {sports.length > 1 && <SportBadge sport={leagueSport(resume)} className="hidden sm:inline-flex" />}
            <ArrowRight className="size-5 text-accent" />
          </Link>
        )}

        {auth.user ? (
          <>
            <Card className="p-4" tour="unirse">
              <form onSubmit={submitCode} className="flex flex-col gap-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Ticket className="size-5 text-accent" /> ¿Te invitaron? Pon el código
                </span>
                <div className="flex gap-2">
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="ABCD2345"
                    maxLength={12}
                    autoCapitalize="characters"
                    className="font-mono tracking-widest uppercase"
                    aria-label="Código de invitación"
                  />
                  <Button type="submit" disabled={!code.trim()}>
                    Unirme
                  </Button>
                </div>
              </form>
            </Card>

            <Link to="/ligas" className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 transition hover:bg-surface-2">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Globe className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">Ver ligas y torneos</p>
                <p className="text-sm text-muted">Las tuyas {memberships.data.length ? `(${memberships.data.length})` : ''} y las públicas para unirte.</p>
              </div>
              <ArrowRight className="size-4 text-muted" />
            </Link>

            {auth.isSuper && (
              <Link to="/superadmin" className="flex items-center justify-center gap-2 text-sm font-medium text-accent">
                <Crown className="size-4" /> Panel del superadmin
              </Link>
            )}
          </>
        ) : (
          <Card className="flex flex-col gap-4 p-5">
            <Welcome />
            <div className="grid grid-cols-2 gap-2">
              <Link to="/login?next=%2F" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm font-medium hover:bg-surface-2">
                <LogIn className="size-4" /> Entrar
              </Link>
              <Link
                to="/login?modo=registro&next=%2F"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg"
              >
                <UserPlus className="size-4" /> Crear cuenta
              </Link>
            </div>
            <Link to="/ligas" className="flex items-center justify-center gap-1.5 text-sm font-medium text-accent">
              <Lock className="size-3.5" /> Las ligas públicas se ven sin cuenta <ArrowRight className="size-4" />
            </Link>
          </Card>
        )}
      </div>

    </AppShell>
  );
}

/** Portada sin cuenta: de qué deportes son las ligas (los abiertos en `sport_status`). */
function Welcome() {
  const { status } = useSportStatus();
  const open = openSports(status);
  const onlyBowling = open.length === 1 && open[0] === 'bowling';
  return (
    <div>
      <p className="font-semibold">
        {open.length > 1 ? `Ligas de ${joinList(open.map((id) => SPORTS[id].lower))} en el celular` : `Tu liga de ${SPORTS[open[0] ?? 'bowling'].lower} en el celular`}
      </p>
      <p className="text-sm text-muted">
        {onlyBowling || !open.length
          ? 'Torneos con equipos y handicap, prácticas, ranking y tus estadísticas.'
          : 'Ligas y torneos con su calendario, clasificaciones y tus estadísticas.'}{' '}
        Entra para crear tu liga o unirte a la de tus amigos.
      </p>
    </div>
  );
}
