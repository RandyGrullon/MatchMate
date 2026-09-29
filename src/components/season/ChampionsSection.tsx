import { Link } from 'react-router';
import { Trophy } from 'lucide-react';
import { useLeagueChampions } from '../../lib/data/seasons';
import { useLeagueCtx } from '../../lib/league';
import { Section, SectionLink } from '../home/Section';
import { Card } from '../ui';
import { seasonDates } from './logic';

/** Cuántas temporadas salen en el inicio (las demás, en /temporadas). */
const SHOWN = 3;

/**
 * «Campeones» en el inicio de la liga (todos los deportes): el campeón de cada temporada cerrada, la más nueva
 * primero. Sin temporadas cerradas no sale.
 */
export function ChampionsSection() {
  const { lid, base, league } = useLeagueCtx();
  const champions = useLeagueChampions(league.kind === 'torneo' ? null : lid);
  const list = champions.data;
  if (!list.length) return null;
  return (
    <Section title="Campeones" icon={<Trophy className="size-4" />} action={<SectionLink to={`${base}/temporadas`}>Temporadas</SectionLink>}>
      <Card className="divide-y divide-line overflow-hidden">
        {list.slice(0, SHOWN).map((c) => (
          <Link key={c.seasonId} to={`${base}/temporadas`} className="flex min-h-11 items-center gap-3 px-4 py-2.5 transition hover:bg-surface-2">
            <Trophy className={c.champion ? 'size-5 shrink-0 text-gold' : 'size-5 shrink-0 text-muted'} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{c.champion ? c.champion.name : 'Sin campeón anotado'}</span>
              <span className="block truncate text-xs text-muted">
                {c.name} · {seasonDates(c)}
              </span>
            </span>
          </Link>
        ))}
      </Card>
    </Section>
  );
}
