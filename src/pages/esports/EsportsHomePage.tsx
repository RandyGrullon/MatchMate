import { useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { Gamepad2, IdCard } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useMyEsportsEntries, useMyEsportsTeams } from '../../lib/data/esports';
import { useMyGameIds } from '../../lib/data/esportsIds';
import { useNow } from '../../lib/useNow';
import { EsportsTint, GameMark, PhaseChip, TeamLogo } from '../../components/esports/bits';
import { useEsportsIdMoveNotice } from '../../components/home/EsportsHomeRow';
import { LeagueTopBar } from '../../components/league/home/LeagueTopBar';
import { useIsPro } from '../../components/mode';
import { NoticeSlot, useNotice } from '../../components/NoticeSlot';
import { ScreenTitle, SignInCard } from '../../components/screens/ScreenBits';
import { AppShell } from '../../components/Shell';
import { Card, ListRow, ListSkeleton, Loading, RowIcon, SectionHeader } from '../../components/ui';
import { GamePickerSheet } from './GamePickerSheet';
import { entryPhase, esportsNotice, gameSections, liveEntries, myEntrySubtitle, myIdsSubtitle, myTeamSubtitle, teamTitle } from './logic';

/**
 * Esports (`/esports`, docs/esports.md §12.2), rediseño «Calma y foco»: «‹ Ligas», el título y una línea, el aviso de la
 * pantalla (un ID tuyo que pasó a otra cuenta gana; si no tienes ningún ID, «Pon tu ID de juego»), «Mis torneos» (tus
 * inscripciones vivas), «Mis equipos», los 15 juegos en tres secciones y, al final, «Mi ID de juego». Es un índice: no
 * tiene botón principal. `?crear=torneo` o `?crear=liga` (desde Crear) abre «¿De qué juego?» y lleva a crear el torneo o
 * a la página del juego con la hoja de la liga. Sin cuenta se ve todo menos lo tuyo.
 */
export default function EsportsHomePage() {
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
      <EsportsTint>
        <EsportsHome uid={auth.user?.uid ?? null} />
      </EsportsTint>
    </AppShell>
  );
}

function EsportsHome({ uid }: { uid: string | null }) {
  const pro = useIsPro();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const now = useNow().getTime();
  const ids = useMyGameIds(uid);
  const teams = useMyEsportsTeams(uid);
  const entries = useMyEsportsEntries(uid);
  const sections = useMemo(() => gameSections(), []);
  const mine = useMemo(() => liveEntries(entries.data), [entries.data]);

  // El de un ID tuyo que pasó a otra cuenta (el mismo de Hoy) gana; si no, sin ningún ID, «Pon tu ID de juego».
  useEsportsIdMoveNotice(uid);
  useNotice(esportsNotice({ signedIn: !!uid, ids: ids.data, idsLoading: ids.loading }));

  const crear = params.get('crear');
  const picking = crear === 'torneo' || crear === 'liga';
  const closePicker = () =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete('crear');
        return n;
      },
      { replace: true },
    );

  const loadingMine = !!uid && ((teams.loading && !teams.data.length) || (entries.loading && !entries.data.length));

  return (
    <div className="flex flex-col px-2">
      <LeagueTopBar to="/ligas" label="Ligas" />
      <ScreenTitle title="Esports" hint="Torneos y equipos por juego" pro={pro} />
      <NoticeSlot className="mt-5" />

      {loadingMine && (
        <section className="mt-[26px]" aria-busy="true" aria-label="Cargando lo tuyo">
          <ListSkeleton rows={2} />
        </section>
      )}

      {mine.length > 0 && (
        <section aria-labelledby="mis-torneos" className="mt-[26px]">
          <SectionHeader id="mis-torneos" title="Mis torneos" />
          <Card className="overflow-hidden">
            {mine.map((e) => (
              <ListRow
                key={e.entryId}
                dense={pro}
                leading={<GameMark game={e.game} size="md" />}
                title={e.tournament}
                subtitle={
                  <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    <span>{myEntrySubtitle(e)}</span>
                    <PhaseChip phase={entryPhase(e, now)} />
                  </span>
                }
                to={`/l/${e.leagueId}`}
              />
            ))}
          </Card>
        </section>
      )}

      {teams.data.length > 0 && (
        <section aria-labelledby="mis-equipos" className="mt-[26px]">
          <SectionHeader id="mis-equipos" title="Mis equipos" />
          <Card className="overflow-hidden">
            {teams.data.map((t) => (
              <ListRow
                key={t.id}
                dense={pro}
                leading={<TeamLogo path={t.logoPath} name={t.name} tag={t.tag} className="size-10" />}
                title={teamTitle(t)}
                subtitle={myTeamSubtitle(t, t.myRole)}
                to={`/esports/equipo/${t.id}`}
              />
            ))}
          </Card>
        </section>
      )}

      {sections.map((s) => (
        <section key={s.kind} aria-labelledby={`juegos-${s.kind}`} className="mt-[26px]">
          <SectionHeader id={`juegos-${s.kind}`} title={s.title} />
          <Card className="overflow-hidden">
            {s.games.map((g) => (
              <ListRow key={g.id} dense={pro} leading={<GameMark game={g.id} size="md" />} title={g.name} subtitle={g.blurb} to={`/esports/${g.id}`} />
            ))}
          </Card>
        </section>
      ))}

      <section aria-label="Mi ID de juego" className="mt-[26px]">
        <Card className="overflow-hidden">
          <ListRow
            dense={pro}
            leading={
              <RowIcon tone="accent">
                <IdCard className="size-5" />
              </RowIcon>
            }
            title="Mi ID de juego"
            subtitle={myIdsSubtitle(ids.data, !!uid)}
            to="/esports/mi-id"
          />
        </Card>
      </section>

      <GamePickerSheet
        open={picking}
        onClose={closePicker}
        title="¿De qué juego?"
        subtitle={crear === 'liga' ? 'La liga es de un solo juego' : 'El torneo es de un solo juego'}
        onPick={(g) => navigate(crear === 'liga' ? `/esports/${g}?crear=liga` : `/esports/${g}/nuevo-torneo`)}
      >
        {!uid ? (
          <SignInCard
            className="mb-2"
            icon={<Gamepad2 />}
            title={crear === 'liga' ? 'Entra para crear una liga' : 'Entra para crear un torneo'}
            text="Con tu cuenta organizas torneos de tu juego y apruebas a los equipos."
            next={encodeURIComponent(location.pathname + location.search)}
          />
        ) : undefined}
      </GamePickerSheet>
    </div>
  );
}
