import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Crosshair, Users } from 'lucide-react';
import { useAuth } from '../../../lib/auth';
import { useMyEsportsEntries } from '../../../lib/data/esports';
import { awaitingConfirmation, hasResult, isOpen, useMatches, type Match } from '../../../lib/data/matches';
import { useLeagueCtx } from '../../../lib/league';
import { useNow } from '../../../lib/useNow';
import { isIndividualMode } from '../../../sports/esports';
import { EntryStatusChip, GameMark } from '../../../components/esports/bits';
import { MatchCard } from '../../../components/match';
import { useIsPro } from '../../../components/mode';
import { Card, Empty, ListRow, ListSkeleton, LoadError, SectionHeader } from '../../../components/ui';
import { cardMatch, sideOfTeams, tournamentPathFor } from './logic';
import { MatchSheet } from './match/MatchSheet';
import { useMyTeams } from './parts';

/**
 * «Lo mío» en la liga de esports (§12.8 `MyProfile`, `/l/:lid/perfil`): mis inscripciones en sus torneos (con su estado)
 * y mis series: por anotar o confirmar, las que vienen y los resultados. `?partido=<id>` abre la hoja del partido.
 */
export default function EsportsMyPage() {
  const { lid, league } = useLeagueCtx();
  const uid = useAuth().user?.uid ?? null;
  const pro = useIsPro();
  const [params, setParams] = useSearchParams();
  const matchId = params.get('partido');
  const entries = useMyEsportsEntries(uid);
  const matches = useMatches({ lid });
  const myTeams = useMyTeams();
  const now = useNow().getTime();
  const mine = useMemo(() => entries.data.filter((e) => e.leagueId === lid), [entries.data, lid]);
  const myMatches = useMemo(() => matches.data.filter((m) => m.status !== 'void' && sideOfTeams(m, myTeams.all) !== null), [matches.data, myTeams.all]);
  const open = (id: string | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set('partido', id);
    else p.delete('partido');
    setParams(p);
  };
  if (matchId) return <MatchSheet matchId={matchId} onBack={() => open(null)} backLabel="Lo mío" shellBar />;
  if (entries.error) return <LoadError error={entries.error} />;

  const todo = myMatches.filter((m) => (isOpen(m) && m.sides.every((s) => !!s.teamId)) || awaitingConfirmation(m, now) || m.status === 'disputed');
  const done = myMatches.filter((m) => hasResult(m) && !todo.includes(m));
  const card = (m: Match) => <MatchCard key={m.id} match={cardMatch(m)} mySide={sideOfTeams(m, myTeams.all)} onClick={() => open(m.id)} tz={league.tz} now={now} roundWord="Jornada" />;

  return (
    <div className="flex flex-col px-2">
      <h1 className={pro ? 'text-title-pro' : 'text-title'}>Lo mío</h1>
      <div className="mt-[26px] flex flex-col gap-[30px]">
        {!uid ? (
          <Empty icon={<Users className="size-8" />} title="Entra para ver lo tuyo">
            <Link to={`/login?next=${encodeURIComponent(`/l/${lid}/perfil`)}`} className="text-accent">
              Entrar
            </Link>
          </Empty>
        ) : entries.loading && !entries.data.length ? (
          <ListSkeleton rows={2} />
        ) : !mine.length && !myMatches.length ? (
          <Empty icon={<Crosshair className="size-8" />} title="Todavía no juegas aquí">
            Cuando te inscribas en un torneo de {league.kind === 'torneo' ? 'este torneo' : 'esta liga'}, tu inscripción y tus series salen aquí.
          </Empty>
        ) : (
          <>
            {mine.length > 0 && (
              <section aria-labelledby="esp-mias">
                <SectionHeader id="esp-mias" title={mine.length === 1 ? 'Mi inscripción' : 'Mis inscripciones'} />
                <Card className="overflow-hidden">
                  {mine.map((e) => (
                    <ListRow
                      key={e.entryId}
                      dense={pro}
                      leading={<GameMark game={e.game} size="md" />}
                      title={e.tournament}
                      subtitle={[isIndividualMode(e.mode) ? null : e.entryName, e.role === 'captain' ? 'Capitán' : e.role === 'sub' ? 'Suplente' : e.kind === 'free_agent' ? 'Agente libre' : null].filter(Boolean).join(' · ') || undefined}
                      trailing={<EntryStatusChip status={e.entryStatus} />}
                      to={tournamentPathFor(lid, e.eventId, league.kind)}
                    />
                  ))}
                </Card>
              </section>
            )}
            {todo.length > 0 && (
              <section aria-labelledby="esp-tocan">
                <SectionHeader id="esp-tocan" title="Te toca" />
                <div className="grid gap-2.5 sm:grid-cols-2">{todo.map(card)}</div>
              </section>
            )}
            {done.length > 0 && (
              <section aria-labelledby="esp-jugadas">
                <SectionHeader id="esp-jugadas" title="Resultados" />
                <div className="grid gap-2.5 sm:grid-cols-2">{done.map(card)}</div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
