import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { CalendarCheck, CalendarDays, Camera, CheckCircle2, ChevronRight, Clock, Flame, Globe, Hash, Layers, LogOut, Share2, Sigma, Target, Trophy, Upload, UserPlus, XCircle } from 'lucide-react';
import { frameStats } from '../lib/bowling';
import { useAuth } from '../lib/auth';
import { removeMember, useEntriesOfEvents, useEvents, usePlayer, usePlayerEntries, usePlayerSubmissions } from '../lib/data';
import { eventLabel, formatDate, formatDateLong } from '../lib/format';
import { rememberLeague, useLeagueCtx } from '../lib/league';
import { effectiveAverage, entryLine, eventPosition, playerStats } from '../lib/stats';
import type { BowlingEvent, Entry } from '../lib/types';
import { ScoreChart, type ChartPoint } from '../components/ScoreChart';
import { SubmitGamesModal } from '../components/SubmitGamesModal';
import { NextPracticeCard } from '../components/NextPracticeCard';
import { useAction, useFeedback } from '../components/feedback';
import { playerUrl, shareLink } from '../components/share';
import { Badge, Button, Card, Empty, ListSkeleton, LoadError, Skeleton, StatsSkeleton, cx } from '../components/ui';
import { Stat } from '../components/event/StandingsTab';
import { Avatar } from '../components/Avatar';
import { BackLink } from '../components/BackLink';
import { SuggestionBox } from '../components/SuggestionBox';

/** Página del jugador en la liga: sus números, torneos y prácticas. En una liga pública se ve sin login. */
export default function PlayerPage({ playerId: own }: { playerId?: string }) {
  const params = useParams();
  const playerId = own ?? params.playerId;
  const { lid, base, myPlayerId, member, league } = useLeagueCtx();
  const { user } = useAuth();
  const { toast, confirm } = useFeedback();
  const run = useAction();
  const navigate = useNavigate();
  const player = usePlayer(lid, playerId);
  const entries = usePlayerEntries(lid, playerId);
  const events = useEvents(lid);
  const subs = usePlayerSubmissions(lid, playerId);
  const [submitting, setSubmitting] = useState(false);

  const eventById = useMemo(() => new Map(events.data.map((e) => [e.id, e])), [events.data]);
  const mine = useMemo(
    () =>
      entries.data
        .filter((e) => eventById.has(e.eventId))
        .sort((a, b) => eventById.get(b.eventId)!.date.localeCompare(eventById.get(a.eventId)!.date)),
    [entries.data, eventById],
  );
  const tournamentIds = mine.filter((e) => eventById.get(e.eventId)!.type === 'torneo').map((e) => e.eventId);
  const tournamentEntries = useEntriesOfEvents(lid, tournamentIds);

  const loadError = player.error ?? entries.error ?? events.error;
  if (loadError) return <LoadError error={loadError} />;
  if (player.loading || entries.loading || events.loading) {
    return (
      <>
        <div className="flex flex-col gap-6" aria-busy="true">
          <div className="flex items-center gap-4">
            <Skeleton className="size-16 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <StatsSkeleton />
          <Skeleton className="h-52 w-full rounded-2xl" />
          <ListSkeleton rows={3} />
        </div>
      </>
    );
  }
  if (!player.data) return <Empty title="Este jugador no existe">Revisa el link que te compartieron.</Empty>;

  const p = player.data;
  // Solo el dueño del perfil sube juegos y ve sus envíos; el admin anota desde el evento.
  const isOwner = !!myPlayerId && myPlayerId === p.id;
  const unclaimed = !p.uid;
  const stats = playerStats(mine);
  // Eventos a los que fue (con al menos un juego que cuenta).
  const attended = mine.filter((e) => e.scores?.some((sc, i) => sc != null && e.photos?.[i] != null)).length;
  const average = effectiveAverage(p, stats);
  const tournaments = mine.filter((e) => eventById.get(e.eventId)!.type === 'torneo');
  const practices = mine.filter((e) => eventById.get(e.eventId)!.type === 'practica');
  const thisYear = String(new Date().getFullYear());

  // Últimos 30 juegos verificados, del más viejo al más nuevo.
  const points: ChartPoint[] = [...mine]
    .reverse()
    .flatMap((e) => {
      const ev = eventById.get(e.eventId)!;
      return (e.scores ?? []).flatMap((s, i) =>
        s != null && e.photos?.[i] ? [{ score: s, label: `${eventLabel(ev)} · J${i + 1} · ${formatDate(ev.date)}` }] : [],
      );
    })
    .slice(-30);

  const byYear = new Map<string, Entry[]>();
  for (const e of mine) {
    const y = eventById.get(e.eventId)!.date.slice(0, 4);
    byYear.set(y, [...(byYear.get(y) ?? []), e]);
  }

  const openSubs = subs.data
    .filter((s) => s.status !== 'aprobado' || (s.createdAt && Date.now() - s.createdAt.toMillis() < 7 * 86400_000))
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
    .slice(0, 6);

  // Strikes y spares de los juegos anotados por cuadros (y verificados).
  const framed = mine.flatMap((e) =>
    Object.entries(e.frames ?? {})
      .filter(([i]) => e.scores?.[+i] != null && e.photos?.[+i] != null)
      .map(([, f]) => frameStats(f.rolls)),
  );
  const framesTotal = framed.reduce((a, f) => ({ strikes: a.strikes + f.strikes, spares: a.spares + f.spares }), { strikes: 0, spares: 0 });

  async function share() {
    if (await shareLink(playerUrl(lid, p.id), `${p.name} · BowlingX`)) toast('Link copiado');
  }

  async function leave() {
    if (!member) return;
    const ok = await confirm({
      title: 'Salir de la liga',
      message: 'Tus juegos se quedan en la liga; tu cuenta deja de estar vinculada a este jugador. Para volver necesitas unirte otra vez.',
      confirmText: 'Salir',
      danger: true,
    });
    if (!ok) return;
    const done = await run(async () => {
      await removeMember(member);
      return true;
    }, 'Saliste de la liga');
    if (done) {
      rememberLeague(null);
      navigate('/ligas');
    }
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="relative flex flex-col items-center gap-3 overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-accent-soft via-surface to-surface p-5 text-center sm:flex-row sm:pr-14 sm:text-left">
          {/* Jugador abierto desde el ranking o un evento (no "Mis juegos"): flecha para volver. */}
          {!own && <BackLink fallback={league.kind === 'torneo' ? base : `${base}/ranking`} className="absolute top-3 left-3 sm:static sm:self-start" />}
          <Avatar name={p.name} className="size-16 text-xl ring-4 ring-surface" />
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{p.name}</h1>
            <p className="text-sm text-muted">
              {stats.games} juegos verificados{stats.pending > 0 && ` · ${stats.pending} por verificar`}
            </p>
          </div>
          {isOwner && (
            <Button variant="primary" icon={<Upload className="size-4" />} onClick={() => setSubmitting(true)} className="w-full sm:w-auto">
              Subir juegos
            </Button>
          )}
          <Button variant="ghost" size="sm" className="absolute top-3 right-3" onClick={share} aria-label="Compartir perfil" title="Compartir perfil" icon={<Share2 className="size-4" />} />
          {!user && unclaimed && (
            <Link
              to={`/login?modo=registro&next=${encodeURIComponent(`${base}/perfil?soy=${p.id}`)}`}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm font-medium hover:bg-surface-2 sm:w-auto"
            >
              <UserPlus className="size-4" /> ¿Eres tú? Crea tu cuenta
            </Link>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat icon={<Target className="size-4" />} label={p.averageOverride != null ? 'Promedio (fijo)' : 'Promedio'} value={average || '—'} />
          <Stat icon={<Sigma className="size-4" />} label="Puntaje total" value={stats.pins ? stats.pins.toLocaleString('es-DO') : '—'} />
          <Stat icon={<Hash className="size-4" />} label="Juegos" value={stats.games} />
          <Stat icon={<Flame className="size-4" />} label="Mejor juego" value={stats.high || '—'} />
          <Stat icon={<Layers className="size-4" />} label="Mejor serie (3)" value={stats.highSeries || '—'} />
          <Stat icon={<CalendarCheck className="size-4" />} label="Asistencia" value={attended} sub={attended === 1 ? 'evento' : 'eventos'} />
        </div>

        {framed.length > 0 && (
          <p className="-mt-3 flex flex-wrap gap-2 text-xs text-muted">
            <Badge tone="accent">{framesTotal.strikes} strikes</Badge>
            <Badge tone="accent">{framesTotal.spares} spares</Badge>
            <span className="self-center">en {framed.length} juegos anotados por cuadros</span>
          </p>
        )}

        {isOwner && (
          <Link
            to="/perfil"
            className="-mt-2 flex items-center gap-2 self-start rounded-xl px-2 py-1 text-sm font-medium text-accent hover:bg-accent-soft"
          >
            <Globe className="size-4" /> Mis estadísticas de todas las ligas <ChevronRight className="size-4" />
          </Link>
        )}

        {isOwner && <NextPracticeCard events={events.data} playerId={p.id} />}

        {isOwner && openSubs.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted">Mis envíos</h2>
            <Card className="divide-y divide-line">
              {openSubs.map((s) => {
                const ev = s.eventId ? eventById.get(s.eventId) : undefined;
                return (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    {s.status === 'pendiente' ? (
                      <Clock className="size-4 shrink-0 text-warn" />
                    ) : s.status === 'aprobado' ? (
                      <CheckCircle2 className="size-4 shrink-0 text-ok" />
                    ) : (
                      <XCircle className="size-4 shrink-0 text-danger" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{ev ? eventLabel(ev) : s.date ? `Práctica ${formatDate(s.date)}` : 'Evento eliminado'}</div>
                      <div className="text-xs text-muted tabular-nums">
                        {(s.scores ?? []).map((g) => g ?? '–').join(' · ')}
                        {s.note && ` — ${s.note}`}
                      </div>
                    </div>
                    <Badge tone={s.status === 'pendiente' ? 'warn' : s.status === 'aprobado' ? 'ok' : 'danger'}>
                      {s.status === 'pendiente' ? 'Por aprobar' : s.status === 'aprobado' ? 'Aprobado' : 'Rechazado'}
                    </Badge>
                  </div>
                );
              })}
            </Card>
          </section>
        )}

        {points.length >= 2 && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-muted">Últimos {points.length} juegos</h2>
              {average > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="inline-block h-px w-4 bg-muted" /> promedio {average}
                </span>
              )}
            </div>
            <Card className="px-2 pt-3 pb-1 sm:px-4">
              <ScoreChart points={points} average={average || null} />
            </Card>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted">
            <Trophy className="size-4" /> Torneos
          </h2>
          {tournaments.length === 0 ? (
            <p className="text-sm text-muted">Todavía no ha jugado torneos.</p>
          ) : (
            tournaments.map((e) => {
              const ev = eventById.get(e.eventId)!;
              const line = entryLine(e, ev);
              const r = eventPosition(ev, tournamentEntries.data, e.id);
              const team = e.teamId ? ev.teams?.[e.teamId]?.name : null;
              return (
                <Card key={e.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{eventLabel(ev)}</span>
                        {ev.date.startsWith(thisYear) && e === tournaments[0] && <Badge tone="accent">Actual</Badge>}
                      </div>
                      <div className="text-xs text-muted first-letter:uppercase">
                        {formatDateLong(ev.date)}
                        {team && ` · ${team}`}
                      </div>
                    </div>
                    {r && (
                      <div className="text-right">
                        <div className="text-2xl font-bold">{r.pos}°</div>
                        <div className="text-xs text-muted">de {r.of}</div>
                      </div>
                    )}
                  </div>
                  <GameChips entry={e} event={ev} />
                  <Link to={`${base}/e/${ev.id}`} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent">
                    Ver clasificación <ChevronRight className="size-4" />
                  </Link>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    <span className="text-muted">
                      Scratch <b className="text-fg tabular-nums">{line.scratch}</b>
                    </span>
                    {ev.hcpPercent > 0 && (
                      <span className="text-muted">
                        Hcp <b className="text-fg tabular-nums">{line.hcp}</b>/juego
                      </span>
                    )}
                    <span className="text-muted">
                      Total <b className="text-fg tabular-nums">{line.total}</b>
                    </span>
                    <span className="text-muted">
                      Promedio de entrada <b className="text-fg tabular-nums">{e.average}</b>
                    </span>
                  </div>
                </Card>
              );
            })
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted">
            <CalendarDays className="size-4" /> Prácticas
          </h2>
          {practices.length === 0 ? (
            <p className="text-sm text-muted">Todavía no hay prácticas registradas.</p>
          ) : (
            <Card className="divide-y divide-line">
              {practices.map((e) => {
                const ev = eventById.get(e.eventId)!;
                const line = entryLine(e, ev);
                return (
                  <Link key={e.id} to={`${base}/e/${ev.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition hover:bg-surface-2">
                    <div className="min-w-32 flex-1">
                      <div className="font-medium first-letter:uppercase">{formatDate(ev.date)}</div>
                      <GameChips entry={e} event={ev} compact />
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold tabular-nums">{line.avg || '—'}</div>
                      <div className="text-xs text-muted">promedio</div>
                    </div>
                  </Link>
                );
              })}
            </Card>
          )}
        </section>

        {byYear.size > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted">Por año</h2>
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-line">
                    <th className="px-4 py-2 text-left font-medium">Año</th>
                    <th className="px-2 py-2 text-right font-medium">Juegos</th>
                    <th className="px-2 py-2 text-right font-medium">Promedio</th>
                    <th className="px-4 py-2 text-right font-medium">Mejor</th>
                  </tr>
                </thead>
                <tbody>
                  {[...byYear.entries()].map(([y, list]) => {
                    const s = playerStats(list);
                    return (
                      <tr key={y} className="border-b border-line last:border-0">
                        <td className="px-4 py-2 font-medium">{y}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{s.games}</td>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums">{s.autoAverage ?? '—'}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{s.high || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </section>
        )}
        {/* En "Mis juegos": el buzón de sugerencias anónimo (también en torneos sin liga). */}
        {isOwner && own && <SuggestionBox />}
        {isOwner && member && member.role !== 'owner' && (
          <div className="flex justify-center">
            <Button variant="ghost" size="sm" className="text-muted" icon={<LogOut className="size-4" />} onClick={leave}>
              Salir de la liga
            </Button>
          </div>
        )}
      </div>

      <SubmitGamesModal open={submitting} onClose={() => setSubmitting(false)} player={p} events={events.data} myEntries={mine} />
    </>
  );
}

function GameChips({ entry, event, compact }: { entry: Entry; event: BowlingEvent; compact?: boolean }) {
  const line = entryLine(entry, event, true);
  const raw = line.scores;
  if (raw.every((s) => s == null)) return compact ? <div className="text-xs text-muted">Sin juegos</div> : null;
  return (
    <div className={cx('flex flex-wrap gap-1.5', compact ? 'mt-1' : 'mt-3')}>
      {raw.map((s, i) =>
        s == null ? null : (
          <span
            key={i}
            title={line.verified[i] ? 'Verificado' : 'Sin foto: no cuenta todavía'}
            className={cx(
              'inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-sm font-medium tabular-nums',
              line.verified[i] ? 'bg-surface-2' : 'border border-dashed border-warn text-warn',
            )}
          >
            {s}
            {!line.verified[i] && <Camera className="size-3" />}
          </span>
        ),
      )}
    </div>
  );
}
