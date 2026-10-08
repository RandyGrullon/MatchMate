import { useState } from 'react';
import { useNow } from '../../../lib/useNow';
import { useAction } from '../../../components/feedback';
import { ExcelButton as ExcelPill } from '../../../components/event/EventHeader';
import { ScheduleBuilder } from '../team/ScheduleBuilder';
import { TeamHomeView } from '../team/TeamHome';
import { useTeamLeague, type TeamLeague } from '../team/useTeamLeague';
import { recordLine } from '../team/view';
import BasketballEvent from './BasketballEvent';
import { BasketballMatchCard } from './BasketballGames';
import { exportBasketballExcel } from './excel';
import { basketballConfigFrom, basketballTeamRules } from './rules';
import { useBasketballSeason, type BasketballSeason } from './season';

/**
 * Inicio de la liga de baloncesto (rediseño «Calma y foco», ../team/TeamHome): lo que está en vivo, tu próximo partido
 * con tu convocatoria en un toque, los próximos partidos y los últimos resultados como filas, y los primeros de la
 * tabla con el máximo anotador. Sin partidos, quien organiza arma el calendario desde aquí (si no, en Organizar).
 */
export default function BasketballHome() {
  const tl = useTeamLeague();
  const season = useBasketballSeason(tl);
  const now = useNow(30_000).getTime();
  const [building, setBuilding] = useState(false);
  const config = basketballConfigFrom(tl.rules.data);
  const teamRules = basketballTeamRules(tl.rules.data);
  const format = config.variant === '3x3' ? '3x3' : 'fiba';

  // Torneo sin liga: su inicio es el del torneo (equipos, grupos y eliminatoria), no el calendario de una liga.
  if (tl.league.kind === 'torneo') return <BasketballEvent />;

  const played = season.standings.filter((r) => r.played > 0).length > 0;
  const leader = season.leaders[0];
  return (
    <>
      <TeamHomeView
        tl={tl}
        now={now}
        minPlayers={teamRules.minPlayers}
        renderLive={(m) => <BasketballMatchCard tl={tl} match={m} now={now} />}
        table={{
          rows: played ? season.standings.slice(0, 4).map((r) => ({ id: r.id, rank: r.rank, points: r.points, line: recordLine(r) })) : [],
          footer: leader ? `Máximo anotador: ${tl.nameOf(leader.player)} · ${leader.avg.toLocaleString('es-DO', { maximumFractionDigits: 1 })} por partido` : null,
        }}
        build={{ label: 'Armar calendario', onClick: () => setBuilding(true) }}
      />
      {tl.isAdmin && <ScheduleBuilder tl={tl} open={building} onClose={() => setBuilding(false)} format={format} />}
    </>
  );
}

/**
 * «Excel» (píldora de la barra de arriba de la Tabla, en Pro): la temporada con el calendario, la tabla, los resultados y
 * los anotadores. `label` = la temporada (va en el nombre del archivo).
 */
export function ExcelButton({ tl, season, label }: { tl: TeamLeague; season: BasketballSeason; label?: string | null }) {
  const run = useAction();
  const [busy, setBusy] = useState(false);
  const teamName = (key: string) => tl.teamOf(key)?.name ?? '(equipo borrado)';
  return (
    <ExcelPill
      busy={busy}
      onClick={async () => {
        setBusy(true);
        const leagueName = label ? `${tl.league.name} - ${label}` : tl.league.name;
        await run(() => exportBasketballExcel({ leagueName, matches: season.matches, season, teamName, playerName: tl.nameOf, tz: tl.tz }));
        setBusy(false);
      }}
    />
  );
}
