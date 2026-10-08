import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { Lock, Plus, Search, Trophy, Users } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useEsportsHub, useMyEsportsTeams, type HubTournament } from '../../lib/data/esports';
import { useMyGameIds } from '../../lib/data/esportsIds';
import { useNow } from '../../lib/useNow';
import { GAMES, isGameId, modeLabel, type GameId } from '../../sports/esports';
import { EsportsTint, GameMark, PhaseChip, TeamLogo } from '../../components/esports/bits';
import { LeagueTopBar } from '../../components/league/home/LeagueTopBar';
import { useIsPro } from '../../components/mode';
import { NoticeSlot } from '../../components/NoticeSlot';
import { ScreenTitle } from '../../components/screens/ScreenBits';
import { AppShell } from '../../components/Shell';
import { Button, Card, DateBlock, Empty, Input, ListRow, ListSkeleton, LoadError, Loading, SectionHeader, Segmented, StatDuo } from '../../components/ui';
import { CreateLeagueSheet } from './teams/CreateLeagueSheet';
import { CreateTeamSheet } from './teams/CreateTeamSheet';
import {
  gameHubActions,
  gameLine,
  hasGameId,
  hubPhase,
  hubSections,
  membersText,
  myTeamSubtitle,
  openTournamentCount,
  safeBack,
  teamLists,
  teamTitle,
  tournamentSubtitle,
} from './logic';

type HubView = 'torneos' | 'equipos';

/**
 * La página de un juego (`/esports/:game`, §12.3): «‹ Esports», el monograma grande, el nombre y «5 contra 5 · Riot ID»;
 * «Torneos abiertos | Equipos»; la acción principal (Pro: «Crear torneo» y «Crear equipo» al lado; Lite: «Crear equipo»
 * si todavía no tienes equipo de ese juego, y al final «¿Organizas? Crear torneo»); «Torneos | Equipos» (`?ver=equipos`;
 * los duelos solo tienen torneos). Los torneos van en «Inscripción abierta», «En curso» y «Terminados»; los equipos con
 * un buscador y los tuyos primero. `?crear=equipo` abre «Crear equipo» (`&volver=` a dónde ir después) y
 * `?crear=liga`, «Crear liga». Un juego que no existe vuelve a Esports.
 */
export default function GameHubPage() {
  const { game = '' } = useParams();
  const auth = useAuth();
  if (!isGameId(game)) return <Navigate to="/esports" replace />;
  if (auth.loading) {
    return (
      <AppShell>
        <Loading />
      </AppShell>
    );
  }
  return (
    <AppShell>
      <EsportsTint>
        <GameHub key={game} game={game} uid={auth.user?.uid ?? null} />
      </EsportsTint>
    </AppShell>
  );
}

function GameHub({ game, uid }: { game: GameId; uid: string | null }) {
  const meta = GAMES[game];
  const pro = useIsPro();
  const navigate = useNavigate();
  const now = useNow().getTime();
  const [params, setParams] = useSearchParams();
  const hub = useEsportsHub(game);
  const myTeams = useMyEsportsTeams(uid);
  const ids = useMyGameIds(uid);
  const [query, setQuery] = useState('');

  const teamsOn = meta.kind !== 'duel';
  const view: HubView = teamsOn && params.get('ver') === 'equipos' ? 'equipos' : 'torneos';
  const crear = params.get('crear');
  const back = safeBack(params.get('volver'));
  const mine = useMemo(() => myTeams.data.filter((t) => t.game === game), [myTeams.data, game]);
  const sections = useMemo(() => hubSections(hub.data.tournaments), [hub.data.tournaments]);
  const lists = useMemo(() => teamLists(mine, hub.data.teams, query), [mine, hub.data.teams, query]);
  const actions = gameHubActions({ pro, kind: meta.kind, hasTeam: mine.length > 0 });
  const newTournament = `/esports/${game}/nuevo-torneo`;
  const teamCount = Math.max(hub.data.teams.length, mine.length);
  const liveCount = hub.data.tournaments.filter((t) => t.status === 'live').length;

  const setQueryParams = (set: Record<string, string | null>) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        for (const [k, v] of Object.entries(set)) {
          if (v == null) n.delete(k);
          else n.set(k, v);
        }
        return n;
      },
      { replace: true },
    );
  const setView = (v: HubView) => setQueryParams({ ver: v === 'equipos' ? 'equipos' : null });
  const openCreateTeam = () => setQueryParams({ crear: 'equipo' });
  const closeCreate = () => setQueryParams({ crear: null, volver: null });

  const size = pro ? 'lg' : 'xl';
  const createTournamentButton = (
    <Button variant="primary" size={size} className="w-full" icon={<Trophy className="size-5" />} onClick={() => navigate(newTournament)}>
      Crear torneo
    </Button>
  );
  // Principal (Lite, sin equipo de ese juego) o en gris debajo de «Crear torneo» (Pro): en 360 px no caben lado a lado.
  const createTeamButton = (variant: 'primary' | 'secondary') => (
    <Button
      variant={variant}
      size={variant === 'primary' ? size : 'md'}
      className={variant === 'primary' ? 'w-full' : 'h-11 w-full'}
      icon={<Users className={variant === 'primary' ? 'size-5' : 'size-4'} />}
      onClick={openCreateTeam}
    >
      Crear equipo
    </Button>
  );

  let body;
  if (view === 'torneos') {
    if (hub.loading && !hub.data.tournaments.length) body = <ListSkeleton rows={3} />;
    else if (hub.error && !hub.data.tournaments.length) body = <LoadError error={hub.error} />;
    else if (!sections.length)
      body = (
        <Empty icon={<Trophy className="size-7" />} title={`Todavía no hay torneos de ${meta.name}`}>
          Arma el primero: eliges el formato y los equipos se inscriben.
          <div className="mt-4 flex justify-center">
            <Link to={newTournament} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent-soft px-4 text-meta font-semibold text-accent">
              <Plus aria-hidden="true" className="size-4" />
              Crear torneo
            </Link>
          </div>
        </Empty>
      );
    else
      body = sections.map((s, i) => (
        <section key={s.key} aria-labelledby={`torneos-${s.key}`} className={i ? 'mt-[26px]' : undefined}>
          <SectionHeader id={`torneos-${s.key}`} title={s.title} />
          <Card className="overflow-hidden">
            {s.items.map((t) => (
              <TournamentRow key={t.eventId} t={t} now={now} dense={pro} />
            ))}
          </Card>
        </section>
      ));
  } else {
    const nothing = !lists.mine.length && !lists.others.length;
    body = (
      <>
        <label className="relative block">
          <span className="sr-only">Buscar equipo</span>
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input type="search" className="h-11 pl-9" value={query} placeholder="Buscar por nombre o tag" onChange={(e) => setQuery(e.target.value)} />
        </label>
        {lists.mine.length > 0 && (
          <section aria-labelledby="tus-equipos" className="mt-[26px]">
            <SectionHeader id="tus-equipos" title="Tus equipos" />
            <Card className="overflow-hidden">
              {lists.mine.map((t) => (
                <ListRow
                  key={t.id}
                  dense={pro}
                  me
                  leading={<TeamLogo path={t.logoPath} name={t.name} tag={t.tag} className="size-10" />}
                  title={teamTitle(t)}
                  subtitle={myTeamSubtitle(t, t.myRole)}
                  to={`/esports/equipo/${t.id}`}
                />
              ))}
            </Card>
          </section>
        )}
        {lists.others.length > 0 && (
          <section aria-labelledby="equipos" className="mt-[26px]">
            <SectionHeader id="equipos" title={lists.mine.length ? 'Otros equipos' : 'Equipos'} />
            <Card className="overflow-hidden">
              {lists.others.map((t) => (
                <ListRow
                  key={t.id}
                  dense={pro}
                  leading={<TeamLogo path={t.logoPath} name={t.name} tag={t.tag} className="size-10" />}
                  title={teamTitle(t)}
                  subtitle={membersText(t.memberCount)}
                  to={`/esports/equipo/${t.id}`}
                />
              ))}
            </Card>
          </section>
        )}
        {hub.loading && nothing && (
          <div className="mt-[26px]">
            <ListSkeleton rows={3} />
          </div>
        )}
        {!hub.loading && nothing && (
          <div className="mt-[26px]">
            <Empty icon={<Users className="size-7" />} title={query.trim() ? 'Ningún equipo se llama así' : `Todavía no hay equipos de ${meta.name}`}>
              {query.trim() ? 'Prueba con otro nombre o con el tag.' : 'Crea el tuyo e invita a los demás con un link.'}
            </Empty>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col px-2">
      <LeagueTopBar to="/esports" label="Esports" />
      <header className="flex items-center gap-4">
        <GameMark game={game} size="lg" />
        <ScreenTitle title={meta.name} hint={gameLine(meta, modeLabel(meta.defaultMode))} pro={pro} className="flex-1" />
      </header>

      <StatDuo
        className="mt-5"
        left={{ value: openTournamentCount(hub.data.tournaments, now), label: 'Torneos abiertos', onClick: teamsOn ? () => setView('torneos') : undefined }}
        right={
          teamsOn
            ? { value: teamCount, label: 'Equipos', onClick: () => setView('equipos') }
            : { value: liveCount, label: 'En curso' }
        }
      />

      {actions.primary === 'tournament' && (
        <div className="mt-4 flex flex-col gap-2">
          {createTournamentButton}
          {actions.secondary === 'team' && createTeamButton('secondary')}
        </div>
      )}
      {actions.primary === 'team' && <div className="mt-4">{createTeamButton('primary')}</div>}

      <NoticeSlot className="mt-5" />

      {teamsOn && (
        <Segmented<HubView>
          className="mt-6"
          label="Qué ver"
          full
          value={view}
          onChange={setView}
          options={[
            { key: 'torneos', label: 'Torneos' },
            { key: 'equipos', label: 'Equipos' },
          ]}
        />
      )}

      <div className="mt-5 flex flex-col">{body}</div>

      {/* Sin torneos, el cartel ya trae «Crear torneo»: no se repite abajo. */}
      {actions.organizeLink && !(view === 'torneos' && !hub.loading && !sections.length) && (
        <Link
          to={newTournament}
          className="mx-auto mt-6 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-meta font-semibold text-muted transition hover:text-fg active:opacity-70 focus-visible:outline-2 focus-visible:outline-accent"
        >
          ¿Organizas? <span className="text-accent">Crear torneo</span>
        </Link>
      )}

      <CreateTeamSheet
        open={crear === 'equipo' && teamsOn}
        onClose={closeCreate}
        game={game}
        signedIn={!!uid}
        hasId={hasGameId(ids.data, game)}
        idsLoading={!!uid && ids.loading && !ids.data.length}
        back={back}
      />
      <CreateLeagueSheet open={crear === 'liga'} onClose={closeCreate} game={game} signedIn={!!uid} />
    </div>
  );
}

function TournamentRow({ t, now, dense }: { t: HubTournament; now: number; dense: boolean }) {
  const priv = t.visibility === 'private';
  return (
    <ListRow
      dense={dense}
      leading={<DateBlock date={t.startsAt} />}
      title={
        <span className="inline-flex max-w-full items-center gap-1.5">
          <span className="truncate">{t.name}</span>
          {priv && <Lock aria-label="Privado" className="size-3.5 shrink-0 text-muted" />}
        </span>
      }
      ariaLabel={priv ? `${t.name} (privado)` : undefined}
      // La fase va en la línea de abajo: a la derecha no cabe en 360 px («Inscripción abierta»).
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <PhaseChip phase={hubPhase(t, now)} />
          <span>{tournamentSubtitle(t)}</span>
        </span>
      }
      to={`/l/${t.leagueId}`}
    />
  );
}
