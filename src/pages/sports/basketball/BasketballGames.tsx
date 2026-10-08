import { useSearchParams } from 'react-router';
import type { Match } from '../../../lib/data/matches';
import { useNow } from '../../../lib/useNow';
import { MatchCard } from '../../../components/match';
import { GamesList } from '../team/GamesList';
import { TeamName } from '../team/TeamBits';
import { matchLink as teamMatchLink } from '../team/TeamUi';
import { useTeamLeague, type TeamLeague } from '../team/useTeamLeague';
import { LiveStrip } from './bits';
import { MatchDetail } from './MatchDetail';

/** El link de un partido (el push de «resultado por confirmar» trae `?partido=`). */
export const matchLink = teamMatchLink;

/** Tarjeta de un partido de baloncesto: colores de los equipos y el en vivo abajo. */
export function BasketballMatchCard({ tl, match: m, now }: { tl: TeamLeague; match: Match; now?: number }) {
  const names: [string, string] = [tl.teamOf(m.sides[0].teamId)?.name ?? m.sides[0].label, tl.teamOf(m.sides[1].teamId)?.name ?? m.sides[1].label];
  const live = m.status === 'live' || m.status === 'suspended';
  return (
    <MatchCard
      match={m}
      to={matchLink(tl.base, m.id)}
      mySide={tl.speakerOf(m)}
      roundWord="Jornada"
      tz={tl.tz}
      now={now}
      renderSide={(s) => <TeamName team={tl.teamOf(s.teamId)} label={s.label} />}
      footer={live ? <LiveStrip match={m} names={names} /> : undefined}
    />
  );
}

/**
 * Partidos de la liga (/l/:lid/juegos): por jugar, resultados y los de mi equipo, con lo que está en vivo arriba
 * (../team/GamesList). Con `?partido=<id>` abre ese partido (así llega el push de «Tienes un resultado por confirmar»);
 * con `&mesa=1`, su mesa anotadora. Al volver, la lista sigue en la opción en que estaba (`?ver=`).
 */
export default function BasketballGames() {
  const tl = useTeamLeague();
  const [params, setParams] = useSearchParams();
  const partido = params.get('partido');
  const now = useNow(30_000).getTime();

  if (partido) {
    return (
      <MatchDetail
        tl={tl}
        matchId={partido}
        table={params.get('mesa') === '1'}
        onTable={(open) =>
          setParams(
            (p) => {
              const next = new URLSearchParams(p);
              if (open) next.set('mesa', '1');
              else next.delete('mesa');
              return next;
            },
            { replace: !open },
          )
        }
        onBack={() =>
          setParams((p) => {
            const next = new URLSearchParams(p);
            next.delete('partido');
            next.delete('mesa');
            return next;
          })
        }
      />
    );
  }

  return <GamesList tl={tl} now={now} renderMatch={(m) => <BasketballMatchCard tl={tl} match={m} now={now} />} />;
}
