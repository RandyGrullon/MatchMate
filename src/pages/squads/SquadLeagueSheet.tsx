import { useMemo, useState } from 'react';
import { Search, Send } from 'lucide-react';
import { useLeagueSearch, type LeagueHit } from '../../lib/data/leagueSocial';
import { requestSquadLeague, type SquadPage } from '../../lib/data/squads';
import { leagueSport, sportMeta } from '../../sports/registry';
import { useBusy } from '../../components/busy';
import { useFeedback } from '../../components/feedback';
import { useMyLeagues } from '../../components/home/useHomeData';
import { LeagueTile } from '../../components/ligas/LigasRows';
import { leagueResultLine } from '../../components/search/SearchRows';
import { countWord, leagueChoices, requestErrorText, takenLeagues } from '../../components/squads/logic';
import { Badge, Button, Card, ListRow, ListSkeleton, Sheet } from '../../components/ui';

type Pickable = Pick<LeagueHit, 'id' | 'name' | 'sport' | 'kind' | 'visibility' | 'venue' | 'logo' | 'members' | 'isMember'>;

/**
 * «Inscribir en una liga» (el capitán, pestaña Ligas): buscar la liga por nombre o lugar (solo las de su deporte, públicas
 * o de las que ya es miembro); sin buscar, sus ligas de ese deporte. «Pedir» manda la solicitud (con confirmación): los
 * admins de la liga deciden. Las que ya pidió o donde ya está salen marcadas.
 */
export function SquadLeagueSheet({ open, onClose, squad }: { open: boolean; onClose: () => void; squad: SquadPage }) {
  return (
    <Sheet open={open} onClose={onClose} title="Inscribir en una liga" subtitle={squad.name}>
      {open && <LeagueBody squad={squad} onDone={onClose} />}
    </Sheet>
  );
}

function LeagueBody({ squad, onDone }: { squad: SquadPage; onDone: () => void }) {
  const { toast, confirm } = useFeedback();
  const [query, setQuery] = useState('');
  const search = useLeagueSearch(query);
  const mine = useMyLeagues(null);
  const act = useBusy<string>();
  const taken = useMemo(() => takenLeagues(squad.leagues), [squad.leagues]);
  const lower = sportMeta(squad.sport)?.lower ?? 'este deporte';
  const searching = query.trim().length >= 2;

  const own = useMemo<Pickable[]>(
    () =>
      mine.all
        .filter((l) => leagueSport(l) === squad.sport && !l.hasMinors)
        .map((l) => ({
          id: l.id,
          name: l.name,
          sport: leagueSport(l),
          kind: l.kind === 'torneo' ? 'torneo' : 'liga',
          visibility: l.visibility === 'public' ? 'public' : 'private',
          venue: l.venue?.trim() || null,
          logo: l.logoPath ?? null,
          members: 0,
          isMember: true,
        })),
    [mine.all, squad.sport],
  );
  const results = useMemo<Pickable[]>(() => leagueChoices(search.data, squad.sport), [search.data, squad.sport]);
  const list = searching ? results : own;

  async function ask(l: Pickable) {
    const ok = await confirm({
      title: `¿Pedir entrar a ${l.name}?`,
      message: `Los admins de la liga deciden. Si aceptan, el equipo entra ${squad.members === 1 ? 'con su único miembro' : `con sus ${countWord(squad.members, 'miembro', 'miembros')}`}.`,
      confirmText: 'Pedir entrar',
    });
    if (!ok) return;
    await act.run(l.id, async () => {
      try {
        await requestSquadLeague(squad.id, l.id);
        toast(`Listo: le avisamos a ${l.name}`);
        onDone();
      } catch (e) {
        console.error(e);
        toast(requestErrorText(e), 'error');
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 pb-1">
      <label className="relative block">
        <span className="sr-only">Buscar ligas</span>
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value.slice(0, 60))}
          placeholder="Nombre de la liga o lugar"
          enterKeyHint="search"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="h-12 w-full rounded-2xl bg-surface-2 pr-4 pl-11 text-base text-fg placeholder:text-faint focus:outline-2 focus:outline-offset-1 focus:outline-accent [&::-webkit-search-cancel-button]:hidden"
        />
      </label>
      <p className="text-[13px] text-muted">Solo ligas de {lower}, públicas o donde ya juegas. La liga tiene que aceptar al equipo.</p>

      {!searching && <p className="mx-1 -mb-2 text-sm font-semibold">Tus ligas de {lower}</p>}
      {searching && search.loading && !results.length ? (
        <ListSkeleton rows={3} />
      ) : list.length ? (
        <Card className="overflow-hidden">
          {list.map((l) => {
            const status = taken.get(l.id);
            return (
              <ListRow
                key={l.id}
                dense
                to={`/l/${l.id}`}
                leading={<LeagueTile league={{ id: l.id, sport: l.sport, kind: l.kind, logoPath: l.logo }} dense />}
                title={l.name}
                subtitle={leagueResultLine({ ...l, isFollowing: false, isMember: !!l.isMember }) || undefined}
                trailing={
                  status ? (
                    <Badge tone={status === 'approved' ? 'ok' : 'warn'}>{status === 'approved' ? 'Ya está' : 'Pendiente'}</Badge>
                  ) : (
                    <Button variant="soft" className="h-11 sm:h-9" loading={act.isBusy(l.id)} disabled={act.isBusy()} icon={<Send className="size-4" />} onClick={() => void ask(l)}>
                      Pedir
                    </Button>
                  )
                }
              />
            );
          })}
        </Card>
      ) : (
        <p className="mx-1 text-meta text-muted">
          {searching ? `Ninguna liga de ${lower} con «${query.trim()}».` : `Todavía no estás en ninguna liga de ${lower}. Búscala arriba por su nombre o lugar.`}
        </p>
      )}
    </div>
  );
}
