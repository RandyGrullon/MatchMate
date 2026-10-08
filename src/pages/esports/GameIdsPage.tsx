import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { IdCard, Plus } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useMyGameIds, useProviders } from '../../lib/data/esportsIds';
import { GAMES, idPlatforms, type GameId } from '../../sports/esports';
import { EsportsTint, GameMark, IdChip, RankChip } from '../../components/esports/bits';
import { useEsportsIdMoveNotice } from '../../components/home/EsportsHomeRow';
import { useFeedback } from '../../components/feedback';
import { LeagueTopBar } from '../../components/league/home/LeagueTopBar';
import { useIsPro } from '../../components/mode';
import { NoticeSlot } from '../../components/NoticeSlot';
import { ScreenTitle, SignInCard } from '../../components/screens/ScreenBits';
import { AppShell } from '../../components/Shell';
import { Button, Card, ListRow, ListSkeleton, LoadError, Loading, SectionHeader } from '../../components/ui';
import { GamePickerSheet } from './GamePickerSheet';
import { GameIdSheet } from './ids/GameIdSheet';
import { defaultRankKey, gameParam, idFor, linkResultToast, safeBack, sortIds } from './logic';

/** «PlayStation» (NBA 2K lleva un ID por plataforma). */
const platformName = (game: GameId, id: string) => idPlatforms(game).find((p) => p.id === id)?.label ?? id;

/** Los parámetros de la vuelta de «Conectar con…» (se quitan después de avisar). */
const LINK_PARAMS = ['conectado', 'error'];

/**
 * Mi ID de juego (`/esports/mi-id`, §12.6): tu ID en cada juego (el monograma, el ID, el rango y su chip: «Cuenta
 * conectada», «Comprobado» o «Declarado») y «Agregar un ID» (el botón principal) que pregunta el juego. El aviso de la
 * pantalla es el de un ID tuyo que pasó a otra cuenta (al cerrarlo queda visto). Tocar un ID abre su hoja
 * (src/pages/esports/ids/GameIdSheet.tsx). Parámetros: `?juego=<g>` abre la hoja de ese juego (`&plataforma=` en NBA
 * 2K); `?volver=<ruta>` vuelve ahí al guardar; `?conectado=<proveedor>` y `?error=<codigo>` (la vuelta de «Conectar
 * con…») avisan cómo salió.
 */
export default function GameIdsPage() {
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
    return (
      <AppShell>
        <EsportsTint>
          <div className="flex flex-col px-2">
            <LeagueTopBar to="/esports" label="Esports" />
            <ScreenTitle title="Mi ID de juego" />
            <SignInCard
              className="mt-5"
              icon={<IdCard />}
              title="Entra para poner tu ID de juego"
              text="Con tu ID de juego te suman a equipos y te inscribes en torneos."
              next={encodeURIComponent(location.pathname + location.search)}
            />
          </div>
        </EsportsTint>
      </AppShell>
    );
  }
  return (
    <AppShell>
      <EsportsTint>
        <GameIds uid={auth.user.uid} />
      </EsportsTint>
    </AppShell>
  );
}

function GameIds({ uid }: { uid: string }) {
  const pro = useIsPro();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const [params, setParams] = useSearchParams();
  const ids = useMyGameIds(uid);
  const providers = useProviders();
  const [picking, setPicking] = useState(false);

  const list = useMemo(() => sortIds(ids.data), [ids.data]);
  const back = safeBack(params.get('volver'));
  const game = gameParam(params.get('juego'));
  const platform = params.get('plataforma');
  const record = game ? idFor(ids.data, game, platform) : null;

  // El aviso de esta pantalla: un ID tuyo que pasó a otra cuenta (el mismo de Hoy y de Esports; al cerrarlo, visto).
  useEsportsIdMoveNotice(uid);

  // La vuelta de «Conectar con…»: avisa una vez y quita los parámetros (así no vuelve a salir al recargar).
  useEffect(() => {
    const said = linkResultToast(params);
    if (!said) return;
    toast(said.text, said.tone);
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        LINK_PARAMS.forEach((k) => n.delete(k));
        return n;
      },
      { replace: true },
    );
    // Solo al llegar con esos parámetros.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('conectado'), params.get('error')]);

  const setQuery = (set: Record<string, string | null>) =>
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

  const openGame = (g: GameId, plat?: string) => setQuery({ juego: g, plataforma: plat || null });
  const closeGame = () => setQuery({ juego: null, plataforma: null });

  let content;
  if (ids.loading && !ids.data.length) {
    content = (
      <section className="mt-[26px]" aria-busy="true" aria-label="Cargando tus IDs">
        <ListSkeleton rows={2} />
      </section>
    );
  } else if (ids.error && !ids.data.length) {
    content = (
      <div className="mt-[26px]">
        <LoadError error={ids.error} />
      </div>
    );
  } else if (!list.length) {
    content = (
      <Card className="mt-[26px] flex flex-col items-center px-5 pt-7 pb-6 text-center">
        <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
          <IdCard className="size-7" />
        </span>
        <h2 className="mt-4 text-card-title">Todavía no tienes IDs de juego</h2>
        <p className="mt-2 max-w-sm text-body text-muted">Pon tu ID del juego que juegas: así te suman a equipos y te inscribes en torneos.</p>
      </Card>
    );
  } else {
    content = (
      <section aria-labelledby="tus-ids" className="mt-[26px]">
        <SectionHeader id="tus-ids" title="Tus IDs" />
        <Card className="overflow-hidden">
          {list.map((r) => {
            const meta = GAMES[r.game];
            const key = defaultRankKey(r.game);
            const rank = r.ranks[key] ?? Object.values(r.ranks)[0] ?? null;
            return (
              <ListRow
                key={`${r.game}:${r.platform}`}
                dense={pro}
                leading={<GameMark game={r.game} size="md" />}
                title={r.idDisplay}
                ariaLabel={`${meta.name}: ${r.idDisplay}`}
                subtitle={
                  <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{r.platform ? `${meta.name} · ${platformName(r.game, r.platform)}` : meta.name}</span>
                    <IdChip ownership={r.ownership} />
                    {rank && <RankChip game={r.game} rank={rank} source={r.rankSource} />}
                  </span>
                }
                onClick={() => openGame(r.game, r.platform)}
              />
            );
          })}
        </Card>
      </section>
    );
  }

  return (
    <div className="flex flex-col px-2">
      <LeagueTopBar to={back ?? '/esports'} label={back ? 'Volver' : 'Esports'} />
      <ScreenTitle title="Mi ID de juego" hint="Tu ID en cada juego, para equipos y torneos" pro={pro} />
      <NoticeSlot className="mt-5" />

      {content}

      <Button variant="primary" size={pro ? 'lg' : 'xl'} className="mt-6 w-full" icon={<Plus className="size-5" strokeWidth={2.4} />} onClick={() => setPicking(true)}>
        Agregar un ID
      </Button>
      <p className="mx-1 mt-3 text-[13px] text-muted">
        Algunos juegos lo comprueban (entrando con Epic o Steam, o buscándolo en Riot). En los demás queda como lo escribiste.
      </p>

      <GamePickerSheet
        open={picking}
        onClose={() => setPicking(false)}
        marked={new Set(ids.data.map((r) => r.game))}
        onPick={(g) => {
          setPicking(false);
          openGame(g);
        }}
      />

      {/* Con los IDs ya leídos: así la hoja abre en lo que tienes y no en un campo vacío. */}
      {game && (!ids.loading || ids.data.length > 0) && (
        <GameIdSheet
          key={game}
          open
          onClose={closeGame}
          game={game}
          record={record}
          providers={providers.data}
          onDone={() => {
            if (back) navigate(back);
            else closeGame();
          }}
        />
      )}
    </div>
  );
}
