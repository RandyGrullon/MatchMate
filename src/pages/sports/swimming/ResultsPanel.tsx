import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ListOrdered, Medal } from 'lucide-react';
import { GENDER_LABEL, STATUS_LABEL, formatSwimTime, type MedalRow, type TeamScore } from '../../../sports/swimming';
import type { SwimEventItem } from '../../../lib/data/swimming';
import { ShareButton, medalPointsShare, type ShareTableSpec } from '../../../components/share';
import { Card, Empty, Position, Select, cx } from '../../../components/ui';
import { ClubTag, StatusBadge, TimeText, meetTitle, useSwim } from './bits';
import { eventResults, groupLabel, meetScores, raceName, raceTitle, scores, type ResultGroup } from './logic';
import type { MeetData } from './MeetPage';

const pts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

/**
 * Imagen de una prueba para mandar al grupo: cada categoría con el puesto, el club, el tiempo (o DQ, «No
 * salió») y los puntos (si el encuentro da puntos).
 */
export function raceShare(data: Pick<MeetData, 'meet' | 'clubs' | 'name'>, ev: SwimEventItem, groups: readonly ResultGroup[]): ShareTableSpec {
  const { meet, clubs, name } = data;
  const withPoints = scores(meet);
  return {
    kind: 'table',
    title: meetTitle(meet),
    subtitle: raceTitle(ev),
    nameLabel: 'Nadador',
    columns: [...(withPoints ? [{ label: 'Pts', optional: true }] : []), { label: 'Tiempo', strong: true }],
    sections: groups.map((g) => ({
      heading: `${GENDER_LABEL[g.gender]} · ${groupLabel(g.ageGroup)}`,
      rows: g.rows.map((r) => {
        const club = r.teamId ? clubs.get(r.teamId) : null;
        const sub = [club?.name, r.tied ? 'empate' : null].filter(Boolean).join(' · ');
        return {
          rank: r.place,
          name: name(r.swimmerId),
          ...(sub ? { sub } : {}),
          dot: club?.color ?? null,
          dim: r.place == null,
          values: [...(withPoints ? [r.points > 0 ? pts(r.points) : ''] : []), r.status === 'ok' ? formatSwimTime(r.time) : STATUS_LABEL[r.status]],
        };
      }),
    })),
    note: meet.finalizedAt ? undefined : 'Resultados provisionales hasta que el organizador finalice el encuentro.',
    caption: `${meetTitle(meet)} · ${raceName(ev)}`,
  };
}

/** Resultados por prueba y categoría: puesto, tiempo y puntos (DQ, DNS y DNF al final, sin puesto). */
export function ResultsPanel({ data }: { data: MeetData }) {
  const { base } = useSwim();
  const { meet, events, entries, clubs, name } = data;
  const [only, setOnly] = useState<string>('');
  const withResults = useMemo(
    () => events.map((ev) => ({ ev, groups: eventResults(ev, entries, meet.points) })).filter((x) => x.groups.length > 0),
    [events, entries, meet.points],
  );
  const withPoints = scores(meet);

  if (!withResults.length) {
    return <Empty icon={<ListOrdered className="size-8" />} title="Todavía no hay resultados">Salen aquí apenas se publica cada serie.</Empty>;
  }
  const shown = only ? withResults.filter((x) => x.ev.id === only) : withResults;

  return (
    <div className="flex flex-col gap-4">
      {!meet.finalizedAt && <p className="text-xs text-muted">Resultados provisionales hasta que el organizador finalice el encuentro.</p>}
      {withResults.length > 2 && (
        <Select value={only} onChange={(e) => setOnly(e.target.value)} aria-label="Prueba">
          <option value="">Todas las pruebas</option>
          {withResults.map(({ ev }) => (
            <option key={ev.id} value={ev.id}>
              {raceTitle(ev)}
            </option>
          ))}
        </Select>
      )}
      {shown.map(({ ev, groups }) => (
        <section key={ev.id} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 flex-1 text-sm font-semibold">{raceTitle(ev)}</h2>
            <ShareButton
              variant="ghost"
              size="md"
              iconOnly
              className="-my-2 -mr-2"
              label={`Compartir los resultados de ${raceName(ev)}`}
              path={`${base}/e/${meet.id}?ver=resultados`}
              card={() => raceShare(data, ev, groups)}
            />
          </div>
          {groups.map((g) => (
            <Card key={g.key} className="overflow-hidden">
              <p className="border-b border-line bg-surface-2 px-4 py-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                {GENDER_LABEL[g.gender]} · {groupLabel(g.ageGroup)}
              </p>
              <div className="divide-y divide-line">
                {g.rows.map((r) => (
                  <div key={r.entryId} className={cx('flex items-center gap-3 px-4 py-2.5', r.place == null && 'opacity-70')}>
                    <span className="w-6 shrink-0 text-center">{r.place != null ? <Position pos={r.place} /> : <span className="text-muted">—</span>}</span>
                    <div className="min-w-0 flex-1">
                      <Link to={`${base}/j/${r.swimmerId}`} className="block truncate font-medium hover:text-accent">
                        {name(r.swimmerId)}
                      </Link>
                      <div className="flex flex-wrap items-center gap-x-2">
                        <ClubTag club={r.teamId ? clubs.get(r.teamId) : null} short />
                        {r.tied && <span className="text-xs text-muted">empate</span>}
                      </div>
                    </div>
                    <StatusBadge status={r.status} />
                    <div className="flex shrink-0 flex-col items-end">
                      <TimeText cs={r.time} empty="" className="font-semibold" />
                      {withPoints && r.points > 0 && <span className="text-[11px] text-muted">{pts(r.points)} pts</span>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </section>
      ))}
    </div>
  );
}

/** Puntos por club y medallero del encuentro. */
export function ScoresPanel({ data }: { data: MeetData }) {
  const { base } = useSwim();
  const { meet, events, entries, clubs } = data;
  const s = useMemo(() => meetScores(events, entries, meet.points), [events, entries, meet.points]);
  if (!s.clubs.length && !s.medals.length) {
    return <Empty icon={<Medal className="size-8" />} title="Todavía no hay puntos">Los puntos por club salen de los resultados de cada prueba.</Empty>;
  }
  // Imagen de los puntos por club (con las medallas) para mandar al grupo.
  const shareCard = () =>
    medalPointsShare({
      title: meetTitle(meet),
      subtitle: meet.finalizedAt ? 'Puntos por club' : 'Puntos por club · Provisional',
      rows: s.clubs.map((c) => ({ ...c, id: c.teamId })),
      who: (id) => clubs.get(id) ?? { name: '(club borrado)' },
      note: `Puntos por puesto: ${meet.points.join('-')}. En un empate se reparten.`,
    });
  return (
    <div className="flex flex-col gap-4">
      {s.clubs.length > 0 && (
        <div className="flex justify-end">
          <ShareButton path={`${base}/e/${meet.id}?ver=puntos`} card={shareCard} />
        </div>
      )}
      <ClubPointsCard rows={s.clubs} clubs={clubs} caption={`Puntos por puesto: ${meet.points.join('-')}. En un empate se reparten.`} />
      <MedalsCard rows={s.medals} clubs={clubs} />
      {!meet.finalizedAt && <p className="text-xs text-muted">Provisional hasta que el organizador finalice el encuentro.</p>}
    </div>
  );
}

export function MedalDots({ gold, silver, bronze }: { gold: number; silver: number; bronze: number }) {
  const dot = (n: number, color: string, label: string) => (
    <span className="inline-flex items-center gap-1 tabular-nums" aria-label={`${n} de ${label}`}>
      <span className={cx('size-2.5 rounded-full', color)} aria-hidden="true" />
      {n}
    </span>
  );
  return (
    <span className="flex items-center gap-2 text-xs text-muted">
      {dot(gold, 'bg-gold', 'oro')}
      {dot(silver, 'bg-silver', 'plata')}
      {dot(bronze, 'bg-bronze', 'bronce')}
    </span>
  );
}

export function ClubPointsCard({
  rows,
  clubs,
  caption,
  title = 'Puntos por club',
}: {
  rows: (Pick<TeamScore, 'points' | 'gold' | 'silver' | 'bronze' | 'rank'> & { teamId?: string; clubId?: string })[];
  clubs: Map<string, { id: string; name: string; short: string; color: string | null; coachId: string | null }>;
  caption?: string;
  title?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <h2 className="border-b border-line px-4 py-2.5 font-semibold">{title}</h2>
      <div className="divide-y divide-line">
        {rows.map((r) => {
          const id = r.teamId ?? r.clubId ?? '';
          return (
            <div key={id} className="flex items-center gap-3 px-4 py-3">
              <Position pos={r.rank} />
              <div className="min-w-0 flex-1">
                <ClubTag club={clubs.get(id) ?? { id, name: '(club borrado)', short: '', color: null, coachId: null }} className="text-sm font-medium text-fg" />
                <MedalDots gold={r.gold} silver={r.silver} bronze={r.bronze} />
              </div>
              <span className="text-lg font-bold tabular-nums">{pts(r.points)}</span>
            </div>
          );
        })}
      </div>
      {caption && <p className="border-t border-line px-4 py-2 text-xs text-muted">{caption}</p>}
    </Card>
  );
}

function MedalsCard({ rows, clubs }: { rows: MedalRow[]; clubs: MeetData['clubs'] }) {
  if (!rows.length) return null;
  return (
    <Card className="overflow-hidden">
      <h2 className="border-b border-line px-4 py-2.5 font-semibold">Medallero</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted">
            <th className="px-4 py-2 text-left font-medium">Club</th>
            <th className="w-12 py-2 font-medium">Oro</th>
            <th className="w-12 py-2 font-medium">Plata</th>
            <th className="w-14 py-2 font-medium">Bronce</th>
            <th className="w-12 py-2 pr-4 font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((m) => (
            <tr key={m.id}>
              <td className="max-w-0 px-4 py-2.5">
                <span className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-xs text-muted tabular-nums">{m.rank}</span>
                  <ClubTag club={clubs.get(m.id) ?? { id: m.id, name: '(club borrado)', short: '', color: null, coachId: null }} className="text-sm text-fg" />
                </span>
              </td>
              <td className="text-center font-semibold tabular-nums">{m.gold}</td>
              <td className="text-center tabular-nums">{m.silver}</td>
              <td className="text-center tabular-nums">{m.bronze}</td>
              <td className="pr-4 text-center tabular-nums text-muted">{m.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
