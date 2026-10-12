import { useMemo } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, Crown, Ellipsis, Medal, Send, Swords, Trophy, UserPlus, UserRound } from 'lucide-react';
import {
  syncSquadRoster,
  useSquadGames,
  useSquadStats,
  withdrawSquadRequest,
  type SquadGame,
  type SquadMember,
  type SquadPage,
} from '../../lib/data/squads';
import { sportMeta } from '../../sports/registry';
import { Avatar } from '../Avatar';
import { useBusy } from '../busy';
import { useFeedback } from '../feedback';
import { LeagueTile } from '../ligas/LigasRows';
import { linkButton } from '../screens/ScreenBits';
import { Quiet } from '../search/SearchRows';
import { userPath } from '../social/UserLink';
import { Badge, Button, Card, DateBlock, ListRow, ListSkeleton, LoadError, SectionHeader, cx } from '../ui';
import {
  LEAGUE_STATUS_TEXT,
  RESULT_MARK,
  canEnterLeagues,
  leaguesSoonText,
  memberCardLine,
  memberLine,
  mineFirstScore,
  recordOrNone,
  recordSummary,
  requestErrorText,
  sortRoster,
  squadGameMeta,
  squadGameTitle,
  squadLeagueRows,
  syncErrorText,
  syncText,
  tournamentLine,
  tournamentPath,
  type SquadLeagueRow,
  type SquadViewer,
} from './logic';
import { LeagueStatusBadge, RowWithActions } from './SquadBits';

/**
 * Las pestañas de la página de un equipo (docs/perfiles-equipos-esports.md §3) que leen algo propio: Juegos
 * (`squad_games`), Torneos y Estadísticas (`squad_stats`, con las ligas del equipo y «Inscribir en una liga») y la
 * Plantilla (con la tarjeta del jugador de `?jugador=`). Juegos, Torneos y Estadísticas piden sesión: sin cuenta, la
 * página no las monta.
 */

// ---------- Juegos ----------

/** G (verde), E (gris) o P (rojo) en un círculo; sin resultado, nada. */
export function ResultMark({ result }: { result: SquadGame['result'] }) {
  if (!result) return null;
  const m = RESULT_MARK[result];
  const tone = m.tone === 'ok' ? 'bg-ok-soft text-ok' : m.tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-muted';
  return (
    <span className={cx('grid size-8 place-items-center rounded-full text-sm font-bold', tone)} title={m.label}>
      <span aria-hidden="true">{m.short}</span>
      <span className="sr-only">{m.label}</span>
    </span>
  );
}

/** Un partido: la fecha, «Tigres vs Leones», la liga y la jornada, el marcador (el equipo primero) y G/E/P. Lleva al partido. */
export function SquadGameRow({ game: g, pro }: { game: SquadGame; pro: boolean }) {
  return (
    <ListRow
      dense={pro}
      to={g.url}
      leading={<DateBlock date={g.at} />}
      title={squadGameTitle(g)}
      subtitle={squadGameMeta(g) || undefined}
      value={g.walkover ? undefined : mineFirstScore(g.score, g.side) ?? undefined}
      trailing={<ResultMark result={g.result} />}
    />
  );
}

/** Los partidos del equipo en sus ligas, del más nuevo al más viejo, con «Ver más». */
export function SquadGamesTab({ squadId, pro }: { squadId: string; pro: boolean }) {
  const games = useSquadGames(squadId);
  if (games.loading && !games.data.length) return <ListSkeleton rows={4} />;
  if (games.error && !games.data.length) return <LoadError error={games.error} onRetry={games.refresh} />;
  if (!games.data.length) {
    return (
      <Quiet icon={<Swords />} title="Todavía no hay partidos">
        Cuando el equipo juegue en una liga, sus partidos salen aquí con el resultado.
      </Quiet>
    );
  }
  return (
    <section aria-label="Partidos del equipo" className="flex flex-col gap-3">
      <Card className="overflow-hidden">
        {games.data.map((g) => (
          <SquadGameRow key={g.key} game={g} pro={pro} />
        ))}
      </Card>
      {games.moreError && (
        <p className="flex items-center justify-center gap-1.5 text-sm text-danger" role="alert">
          <AlertTriangle className="size-4" aria-hidden="true" /> No se pudieron cargar más. Intenta de nuevo.
        </p>
      )}
      {games.hasMore && (
        <Button className="h-11 self-center" loading={games.loadingMore} onClick={() => void games.loadMore()}>
          Ver más
        </Button>
      )}
    </section>
  );
}

// ---------- Torneos ----------

/** Los torneos donde jugó (ligas tipo torneo y torneos de sus ligas), el más nuevo primero, con su récord. */
export function SquadTournamentsTab({ squadId, pro }: { squadId: string; pro: boolean }) {
  const stats = useSquadStats(squadId);
  const list = stats.data?.tournaments ?? [];
  if (stats.loading && !stats.data) return <ListSkeleton rows={3} />;
  if (stats.error && !stats.data) return <LoadError error={stats.error} />;
  if (!list.length) {
    return (
      <Quiet icon={<Trophy />} title="Todavía no juega torneos">
        Cuando el equipo juegue un torneo, sale aquí con su récord.
      </Quiet>
    );
  }
  return (
    <section aria-label="Torneos del equipo">
      <Card className="overflow-hidden">
        {list.map((t) => (
          <ListRow
            key={`${t.leagueId}:${t.eventId ?? ''}`}
            dense={pro}
            to={tournamentPath(t)}
            leading={<LeagueTile league={{ id: t.leagueId, sport: t.sport, kind: 'torneo', logoPath: null }} dense />}
            title={t.name}
            subtitle={tournamentLine(t)}
          />
        ))}
      </Card>
    </section>
  );
}

// ---------- Estadísticas ----------

/** Un número del récord: grande y qué es debajo. */
function Stat({ value, label }: { value: number; label: string }) {
  return (
    <li className="flex min-w-0 flex-col items-center px-1 py-3">
      <b className="num text-[23px] leading-[1.15] font-[650]">{value.toLocaleString('es-DO')}</b>
      <span className="truncate text-xs text-muted">{label}</span>
    </li>
  );
}

/**
 * El récord total (jugados, ganados, empatados y perdidos) y las ligas del equipo: cada una con su récord, el de cada
 * temporada y cómo va su solicitud. El capitán retira una solicitud pendiente, pasa los miembros nuevos a una liga donde
 * ya está e inscribe el equipo en otra (`onRequest`).
 */
export function SquadStatsTab({ squad, viewer, pro, onRequest }: { squad: SquadPage; viewer: SquadViewer; pro: boolean; onRequest: () => void }) {
  const stats = useSquadStats(squad.id);
  const record = stats.data?.record ?? squad.record;
  const rows = useMemo(() => squadLeagueRows(squad.leagues, stats.data?.leagues), [squad.leagues, stats.data]);
  const summary = recordSummary(record);
  return (
    <div className="flex flex-col gap-7">
      <section aria-labelledby="record-del-equipo">
        <SectionHeader id="record-del-equipo" title="Récord" />
        <Card className="overflow-hidden">
          <ul className="grid grid-cols-4 divide-x divide-line">
            <Stat value={record.played} label="Jugados" />
            <Stat value={record.won} label="Ganados" />
            <Stat value={record.drawn} label="Empatados" />
            <Stat value={record.lost} label="Perdidos" />
          </ul>
          <p className="border-t border-line px-5 py-2.5 text-center text-sm text-muted">{summary || 'Sin partidos todavía'}</p>
        </Card>
      </section>
      <SquadLeagues squad={squad} rows={rows} viewer={viewer} pro={pro} onRequest={onRequest} />
    </div>
  );
}

function SquadLeagues({ squad, rows, viewer, pro, onRequest }: { squad: SquadPage; rows: SquadLeagueRow[]; viewer: SquadViewer; pro: boolean; onRequest: () => void }) {
  const { toast, confirm } = useFeedback();
  const act = useBusy<string>();
  const captain = viewer === 'captain';
  const canEnter = canEnterLeagues(squad.sport);

  if (!canEnter && !rows.length) {
    return (
      <Quiet icon={<Trophy />} title="Ligas">
        {leaguesSoonText(squad.sport)}
      </Quiet>
    );
  }

  async function withdraw(l: SquadLeagueRow) {
    if (!l.requestId) return;
    const ok = await confirm({ title: `¿Retirar la solicitud a ${l.name}?`, message: 'Puedes volver a pedir cuando quieras.', confirmText: 'Retirar', danger: true });
    if (!ok) return;
    await act.run(l.requestId, async () => {
      try {
        await withdrawSquadRequest(squad.id, { requestId: l.requestId!, leagueId: l.leagueId });
        toast('Solicitud retirada');
      } catch (e) {
        console.error(e);
        toast(requestErrorText(e), 'error');
      }
    });
  }

  async function sync(l: SquadLeagueRow) {
    await act.run(l.leagueId, async () => {
      try {
        toast(syncText(await syncSquadRoster(squad.id, l.leagueId)));
      } catch (e) {
        console.error(e);
        toast(syncErrorText(e), 'error');
      }
    });
  }

  return (
    <section aria-labelledby="ligas-del-equipo" className="flex flex-col">
      <SectionHeader id="ligas-del-equipo" title="Ligas" />
      {rows.length ? (
        <Card className="overflow-hidden">
          {rows.map((l) => {
            const joined = l.status === 'approved' || l.status === null;
            const key = l.requestId ?? l.leagueId;
            const buttons =
              captain && l.status === 'pending' ? (
                <Button variant="quiet" className="h-11 sm:h-9" loading={act.isBusy(key)} disabled={act.isBusy()} onClick={() => void withdraw(l)}>
                  Retirar solicitud
                </Button>
              ) : captain && joined ? (
                <Button variant="quiet" className="h-11 sm:h-9" loading={act.isBusy(l.leagueId)} disabled={act.isBusy()} icon={<UserPlus className="size-4" />} onClick={() => void sync(l)}>
                  Pasar miembros nuevos
                </Button>
              ) : null;
            const seasons = l.seasons.length ? (
              <ul className="w-full text-sm" aria-label={`Temporadas en ${l.name}`}>
                {l.seasons.map((s) => (
                  <li key={s.seasonId} className="flex items-baseline justify-between gap-3 py-0.5">
                    <span className="min-w-0 truncate text-fg-2">{s.name}</span>
                    <span className="num shrink-0 text-muted">{recordOrNone(s.record)}</span>
                  </li>
                ))}
              </ul>
            ) : null;
            return (
              <RowWithActions
                key={key}
                row={
                  <ListRow
                    dense={pro}
                    to={`/l/${l.leagueId}`}
                    leading={<LeagueTile league={{ id: l.leagueId, sport: l.sport, kind: l.kind, logoPath: l.logo }} dense />}
                    title={l.name}
                    subtitle={joined ? recordOrNone(l.record) : LEAGUE_STATUS_TEXT[l.status!]}
                    trailing={l.status ? <LeagueStatusBadge status={l.status} /> : undefined}
                  />
                }
                actions={
                  seasons || buttons ? (
                    <>
                      {seasons}
                      {buttons}
                    </>
                  ) : undefined
                }
              />
            );
          })}
        </Card>
      ) : (
        <Quiet icon={<Medal />} title="Todavía no juega en ninguna liga">
          {captain ? `Inscríbelo en una liga de ${sportMeta(squad.sport)?.lower ?? 'su deporte'}: los admins de la liga deciden.` : 'Cuando el capitán lo inscriba en una liga, sale aquí.'}
        </Quiet>
      )}
      {captain && canEnter && (
        <Button variant="soft" size={pro ? 'lg' : 'xl'} className="mt-4 w-full" icon={<Send className="size-5" />} onClick={onRequest}>
          Inscribir en una liga
        </Button>
      )}
    </section>
  );
}

// ---------- Plantilla ----------

/**
 * El jugador del link `?jugador=` (su «perfil en equipo» desde el perfil global): la foto, el nombre, «#10 · Portero ·
 * Capitán» y «Ver su perfil».
 */
export function SquadMemberCard({ member: m, squadName }: { member: SquadMember; squadName: string }) {
  return (
    <Card soft className="flex flex-col gap-4 px-5 py-4">
      <section aria-label={`${m.name} en ${squadName}`} className="flex items-center gap-4">
        <Avatar name={m.name} photo={m.avatar} className="size-16 text-xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-accent">En {squadName}</p>
          <h2 className="truncate text-card-title">{m.isMe ? `${m.name} (tú)` : m.name}</h2>
          <p className="mt-0.5 text-meta text-fg-2">{memberCardLine(m)}</p>
          {m.username && <p className="text-[13px] text-muted">@{m.username}</p>}
        </div>
        {m.jersey != null && (
          <b aria-hidden="true" className="num shrink-0 text-[34px] leading-none font-[750] text-accent">
            {m.jersey}
          </b>
        )}
      </section>
      <Link to={userPath(m.id)} className={linkButton('quiet', 'h-11! w-full bg-surface! text-base!')}>
        <UserRound aria-hidden="true" className="size-4" />
        Ver su perfil
      </Link>
    </Card>
  );
}

/**
 * La plantilla: el capitán primero, cada uno con su posición y número; la fila lleva a su perfil. El capitán toca «•••»
 * para la posición y el número, la capitanía o sacarlo. `highlight` (`?jugador=`): su tarjeta arriba y su fila marcada.
 */
export function SquadRosterTab({
  squad,
  viewer,
  pro,
  highlight,
  onPick,
}: {
  squad: SquadPage;
  viewer: SquadViewer;
  pro: boolean;
  highlight: string | null;
  onPick: (m: SquadMember) => void;
}) {
  const roster = useMemo(() => sortRoster(squad.roster), [squad.roster]);
  const picked = highlight ? roster.find((m) => m.id === highlight) : undefined;
  const captain = viewer === 'captain';
  if (!roster.length) return <ListSkeleton rows={Math.min(5, Math.max(1, squad.members))} />;
  return (
    <div className="flex flex-col gap-4">
      {picked && <SquadMemberCard member={picked} squadName={squad.name} />}
      <section aria-label="Plantilla">
        {captain && <p className="mx-1 mb-3 text-meta text-muted">Con «•••» cambias su posición y número, le pasas la capitanía o lo sacas.</p>}
        <Card className="overflow-hidden">
          {roster.map((m) => (
            <ListRow
              key={m.id}
              dense={pro}
              me={m.isMe}
              className={m.id === highlight && !m.isMe ? 'bg-accent-soft' : undefined}
              to={userPath(m.id)}
              leading={<Avatar name={m.name} photo={m.avatar} className="size-10 text-sm" />}
              title={m.isMe ? `${m.name} (tú)` : m.name}
              subtitle={memberLine(m) || undefined}
              trailing={
                m.role === 'captain' || captain ? (
                  <span className="flex items-center gap-1">
                    {m.role === 'captain' && (
                      <Badge tone="accent">
                        <Crown aria-hidden="true" className="size-3" />
                        Capitán
                      </Badge>
                    )}
                    {captain && (
                      <button
                        type="button"
                        onClick={() => onPick(m)}
                        aria-label={`${m.name}: opciones`}
                        className="-mr-2 grid size-11 place-items-center rounded-full text-muted transition hover:text-fg active:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        <Ellipsis className="size-5" aria-hidden="true" />
                      </button>
                    )}
                  </span>
                ) : undefined
              }
            />
          ))}
        </Card>
      </section>
    </div>
  );
}
