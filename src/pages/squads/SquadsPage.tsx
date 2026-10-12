import { useMemo, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { Gamepad2, Search, SearchX, Shield, Ticket, X } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useMyEsportsTeams } from '../../lib/data/esports';
import { useFollowedSquads, useMySquads, useSquadSearch, type MySquad, type SquadLite } from '../../lib/data/squads';
import { useIsPro } from '../../lib/useMode';
import { EsportsTint, GameMark, TeamLogo } from '../../components/esports/bits';
import { ScreenTitle, SignInCard } from '../../components/screens/ScreenBits';
import { Quiet } from '../../components/search/SearchRows';
import { AppShell } from '../../components/Shell';
import { LeagueTopBar } from '../../components/league/home/LeagueTopBar';
import { CODE_LENGTH, cleanCode, mySquadLine } from '../../components/squads/logic';
import { SquadRow } from '../../components/squads/SquadBits';
import { SquadFollowButton } from '../../components/squads/SquadFollowButton';
import { SquadResultRow } from '../../components/squads/SquadResultRow';
import { Button, Card, ListRow, ListSkeleton, LoadError, Loading, SectionHeader, cx } from '../../components/ui';
import { GamePickerSheet } from '../esports/GamePickerSheet';
import { createTeamLink, myTeamSubtitle, teamTitle } from '../esports/logic';
import { CreateSquadSheet } from './CreateSquadSheet';

/**
 * Equipos (`/equipos`, de la sección Ligas): «Crear equipo», buscar equipos (nombre, tag o ciudad: cada uno con Seguir o
 * «Tu equipo»), «Mis equipos» (los míos con mi papel y los de esports con su juego), «Equipos que sigo» y «Unirme con
 * código» (8 letras y números → /equipos/unirse/<código>). `?crear=1` abre «Crear equipo» (con `?deporte=`, ese
 * deporte ya elegido); Esports lleva a elegir el juego y crear el equipo allá. Sin cuenta: entrar (y `?crear=1`, la
 * hoja con entrar).
 */
export default function SquadsPage() {
  const auth = useAuth();
  if (auth.loading) {
    return (
      <AppShell>
        <Loading />
      </AppShell>
    );
  }
  return (
    <AppShell>
      <SquadsView uid={auth.user?.uid ?? null} />
    </AppShell>
  );
}

export function SquadsView({ uid }: { uid: string | null }) {
  const pro = useIsPro();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [pickGame, setPickGame] = useState(false);
  const creating = params.get('crear') === '1';

  const setCreating = (on: boolean) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (on) n.set('crear', '1');
        else {
          n.delete('crear');
          n.delete('deporte');
        }
        return n;
      },
      { replace: true },
    );

  return (
    <div className="flex flex-col px-2">
      <LeagueTopBar to="/ligas" label="Ligas" />
      <ScreenTitle title="Equipos" hint="Tu equipo competitivo, con o sin liga" pro={pro} />
      {/* Sin cuenta, el botón principal es el de crear la cuenta (la tarjeta de abajo). */}
      {uid && (
        <Button variant="primary" size={pro ? 'lg' : 'xl'} className="mt-5 w-full" icon={<Shield className="size-5" />} onClick={() => setCreating(true)}>
          Crear equipo
        </Button>
      )}

      {uid ? (
        <SignedIn pro={pro} uid={uid} />
      ) : (
        <SignInCard
          className="mt-6"
          icon={<Shield />}
          title="Entra para ver tus equipos"
          text="Crea tu equipo, invita a los tuyos con un link, sigue a otros equipos y búscale liga."
          next={encodeURIComponent(location.pathname + location.search)}
        />
      )}

      <CreateSquadSheet
        open={creating}
        onClose={() => setCreating(false)}
        sport={params.get('deporte')}
        onEsports={() => {
          setCreating(false);
          setPickGame(true);
        }}
      />
      <GamePickerSheet open={pickGame} onClose={() => setPickGame(false)} title="¿De qué juego?" subtitle="Los equipos de esports son de un juego" onPick={(g) => navigate(createTeamLink(g))} />
    </div>
  );
}

function SignedIn({ pro, uid }: { pro: boolean; uid: string }) {
  const [query, setQuery] = useState('');
  const mine = useMySquads();
  const esports = useMyEsportsTeams(uid);
  const followed = useFollowedSquads();
  const search = useSquadSearch(query);
  const mineIds = useMemo(() => new Set(mine.data.map((s) => s.id)), [mine.data]);
  const followedIds = useMemo(() => new Set(followed.data.map((s) => s.id)), [followed.data]);
  const q = query.trim();
  const searching = q.length >= 2;

  const loadingMine = (mine.loading && !mine.data.length) || (esports.loading && !esports.data.length);
  const nothing = !loadingMine && !mine.error && !mine.data.length && !esports.data.length && !followed.loading && !followed.data.length;

  return (
    <>
      <SearchBox value={query} onChange={setQuery} />

      {searching ? (
        <section aria-labelledby="equipos-resultados" className="mt-[26px]">
          <SectionHeader id="equipos-resultados" title="Equipos" />
          <SearchResults search={search} query={q} mineIds={mineIds} followedIds={followedIds} pro={pro} />
        </section>
      ) : (
        <>
          {loadingMine ? (
            <section className="mt-[26px]" aria-busy="true" aria-label="Cargando tus equipos">
              <SectionHeader title="Mis equipos" />
              <ListSkeleton rows={2} />
            </section>
          ) : mine.error && !mine.data.length ? (
            <div className="mt-[26px]">
              <LoadError error={mine.error} />
            </div>
          ) : (
            (mine.data.length > 0 || esports.data.length > 0) && (
              <section aria-labelledby="mis-equipos" className="mt-[26px]">
                <SectionHeader id="mis-equipos" title="Mis equipos" />
                <Card className="overflow-hidden">
                  {mine.data.map((s: MySquad) => (
                    <SquadRow key={s.id} squad={s} dense={pro} subtitle={mySquadLine(s)} />
                  ))}
                  {esports.data.map((t) => (
                    <ListRow
                      key={`esports-${t.id}`}
                      dense={pro}
                      leading={
                        <EsportsTint>
                          <TeamLogo path={t.logoPath} name={t.name} tag={t.tag} className="size-10" />
                        </EsportsTint>
                      }
                      title={teamTitle(t)}
                      subtitle={
                        <span className="inline-flex items-center gap-1.5">
                          <GameMark game={t.game} size="sm" />
                          <span className="min-w-0 truncate">{myTeamSubtitle(t, t.myRole)}</span>
                        </span>
                      }
                      to={`/esports/equipo/${t.id}`}
                    />
                  ))}
                </Card>
              </section>
            )
          )}

          {followed.data.length > 0 && (
            <section aria-labelledby="equipos-que-sigo" className="mt-[30px]">
              <SectionHeader id="equipos-que-sigo" title="Equipos que sigo" />
              <Card className="overflow-hidden">
                {followed.data.map((s) => (
                  <SquadRow key={s.id} squad={s} dense={pro} trailing={<SquadFollowButton squadId={s.id} name={s.name} following size="sm" className="rounded-full!" />} />
                ))}
              </Card>
            </section>
          )}

          {nothing && (
            <div className="mt-[26px]">
              <Quiet icon={<Shield />} title="Todavía no tienes equipo">
                Crea el tuyo y pásale el link a los tuyos, o únete con el código que te dé el capitán.
              </Quiet>
            </div>
          )}

          <JoinWithCode className="mt-[30px]" />
          <EsportsLink className="mt-3.5" pro={pro} />
        </>
      )}
    </>
  );
}

/** La caja para buscar equipos (nombre, tag o ciudad). */
function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <form role="search" className="mt-5" onSubmit={(e) => e.preventDefault()}>
      <label className="relative block">
        <span className="sr-only">Buscar equipos</span>
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, 60))}
          placeholder="Buscar equipos por nombre, tag o ciudad"
          enterKeyHint="search"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="card-shadow h-[52px] w-full rounded-2xl bg-surface pr-12 pl-12 text-base text-fg placeholder:text-faint focus:outline-2 focus:outline-offset-1 focus:outline-accent [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button type="button" onClick={() => onChange('')} aria-label="Borrar búsqueda" className="absolute top-1/2 right-1 grid size-11 -translate-y-1/2 place-items-center text-faint hover:text-fg">
            <X aria-hidden="true" className="size-[18px]" />
          </button>
        )}
      </label>
    </form>
  );
}

/** Los equipos encontrados: «Tu equipo» si es tuyo; si no, Seguir. */
function SearchResults({
  search,
  query,
  mineIds,
  followedIds,
  pro,
}: {
  search: { data: SquadLite[]; loading: boolean; error: Error | null; settled: boolean };
  query: string;
  mineIds: ReadonlySet<string>;
  followedIds: ReadonlySet<string>;
  pro: boolean;
}) {
  if (search.loading && !search.data.length) return <ListSkeleton rows={3} />;
  if (search.error && !search.data.length) return <LoadError error={search.error} />;
  if (!search.data.length) {
    if (!search.settled) return <ListSkeleton rows={3} />;
    return (
      <Quiet icon={<SearchX />} title={`No encontramos equipos con «${query}»`}>
        Busca por el nombre, el tag (como TGR) o la ciudad.
      </Quiet>
    );
  }
  const stale = !search.settled || search.loading;
  return (
    <Card className={cx('overflow-hidden transition-opacity', stale && 'opacity-60')}>
      {search.data.map((s) => (
        <SquadResultRow key={s.id} squad={s} dense={pro} mine={mineIds.has(s.id)} following={followedIds.has(s.id)} />
      ))}
    </Card>
  );
}

/** «Unirme con código»: las 8 letras y números que da el capitán → la pantalla de unirse. */
function JoinWithCode({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const ready = code.length === CODE_LENGTH;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (ready) navigate(`/equipos/unirse/${code}`);
  }
  return (
    <form onSubmit={submit} className={cx('rounded-[22px] bg-accent-soft px-4 pt-4 pb-4', className)} aria-labelledby="unirme-equipo">
      <p id="unirme-equipo" className="flex items-center gap-2.5 text-body font-[650] text-fg">
        <Ticket aria-hidden="true" className="size-[22px] shrink-0 text-accent" /> Unirme con código
      </p>
      <p className="mt-[3px] mb-3 pl-8 text-sm text-fg-2">Te lo da el capitán del equipo</p>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(cleanCode(e.target.value))}
          placeholder="EJ. ABCD2345"
          aria-label="Código del equipo"
          maxLength={CODE_LENGTH}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          className="h-[52px] min-w-0 flex-1 rounded-[15px] bg-surface px-4 text-base font-semibold tracking-[0.1em] text-fg uppercase placeholder:text-faint focus:outline-2 focus:outline-offset-1 focus:outline-accent max-[389px]:px-3 max-[389px]:tracking-[0.04em]"
        />
        <button
          type="submit"
          disabled={!ready}
          className="h-[52px] w-[104px] shrink-0 rounded-[15px] bg-accent text-base font-semibold text-accent-fg transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 max-[389px]:w-[92px]"
        >
          Unirme
        </button>
      </div>
    </form>
  );
}

/** Los equipos de esports van por juego, en Esports. */
function EsportsLink({ className, pro }: { className?: string; pro: boolean }) {
  return (
    <Card className={cx('overflow-hidden', className)}>
      <ListRow
        dense={pro}
        leading={
          <EsportsTint>
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <Gamepad2 className="size-5" />
            </span>
          </EsportsTint>
        }
        title="Equipos de esports"
        subtitle="Van por juego, con tu ID de juego"
        to="/esports"
      />
    </Card>
  );
}
