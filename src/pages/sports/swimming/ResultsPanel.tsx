import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ListOrdered, Medal } from 'lucide-react';
import { GENDER_LABEL, STATUS_LABEL, formatSwimTime, type MedalRow, type TeamScore } from '../../../sports/swimming';
import type { SwimEventItem } from '../../../lib/data/swimming';
import { ShareButton, medalPointsShare, type ShareTableSpec } from '../../../components/share';
import { PillSelect, PosNum, TuTag } from '../../../components/ranking/parts';
import { Card, SectionHeader, cx } from '../../../components/ui';
import { EmptyCard } from '../FieldChrome';
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

/**
 * Resultados por prueba y categoría (rediseño «Calma y foco»): cada prueba con su título y compartir, y cada categoría en
 * una tarjeta con el puesto, el nadador (tú, resaltado), su club y el tiempo grande con sus puntos (DQ, DNS y DNF al
 * final, sin puesto). Con más de 2 pruebas, «Todas las pruebas ▾» para ver una.
 */
export function ResultsPanel({ data }: { data: MeetData }) {
  const { base, myPlayerId } = useSwim();
  const { meet, events, entries, clubs, name } = data;
  const [only, setOnly] = useState<string>('');
  const withResults = useMemo(
    () => events.map((ev) => ({ ev, groups: eventResults(ev, entries, meet.points) })).filter((x) => x.groups.length > 0),
    [events, entries, meet.points],
  );
  const withPoints = scores(meet);

  if (!withResults.length) {
    return <EmptyCard icon={<ListOrdered className="size-5" />} title="Todavía no hay resultados" text="Salen aquí apenas se publica cada serie." />;
  }
  const shown = only ? withResults.filter((x) => x.ev.id === only) : withResults;

  return (
    <div className="flex flex-col gap-[26px]">
      {(withResults.length > 2 || !meet.finalizedAt) && (
        <div className="-mb-2 flex flex-wrap items-center justify-between gap-2">
          {withResults.length > 2 ? (
            <PillSelect
              label="Prueba"
              className="max-w-full"
              options={[{ key: '', label: 'Todas las pruebas' }, ...withResults.map(({ ev }) => ({ key: ev.id, label: raceTitle(ev) }))]}
              value={only}
              onChange={setOnly}
            />
          ) : (
            <span />
          )}
          {!meet.finalizedAt && <span className="text-[13px] text-muted">Provisionales hasta finalizar</span>}
        </div>
      )}
      {shown.map(({ ev, groups }) => (
        <section key={ev.id} aria-label={raceTitle(ev)} className="flex flex-col gap-2.5">
          <SectionHeader
            className="mb-0.5"
            title={raceTitle(ev)}
            action={
              <ShareButton
                variant="ghost"
                size="md"
                iconOnly
                className="-my-2 -mr-1 rounded-full! text-fg-2"
                label={`Compartir los resultados de ${raceName(ev)}`}
                path={`${base}/e/${meet.id}?ver=resultados`}
                card={() => raceShare(data, ev, groups)}
              />
            }
          />
          {groups.map((g) => (
            <Card key={g.key} className="overflow-hidden">
              <p className="px-5 pt-3.5 pb-1.5 text-xs font-semibold tracking-[0.06em] text-muted uppercase">
                {GENDER_LABEL[g.gender]} · {groupLabel(g.ageGroup)}
              </p>
              <div>
                {g.rows.map((r) => {
                  const me = !!myPlayerId && r.swimmerId === myPlayerId;
                  return (
                    <div
                      key={r.entryId}
                      className={cx('mm-row relative flex min-h-row-pro items-center gap-3 py-2 pr-5 pl-4', me && 'mm-row-me bg-accent-soft', r.place == null && 'opacity-70')}
                    >
                      <span className="w-[18px] shrink-0 text-center">{r.place != null ? <PosNum pos={r.place} /> : <span className="text-faint">–</span>}</span>
                      <div className="min-w-0 flex-1">
                        <Link to={`${base}/j/${r.swimmerId}`} className="flex min-w-0 items-center gap-1.5 hover:text-accent">
                          <span className="truncate text-[15px] font-semibold">{name(r.swimmerId)}</span>
                          {me && <TuTag small />}
                        </Link>
                        <div className="flex flex-wrap items-center gap-x-2">
                          <ClubTag club={r.teamId ? clubs.get(r.teamId) : null} short />
                          {r.tied && <span className="text-xs text-muted">empate</span>}
                        </div>
                      </div>
                      <StatusBadge status={r.status} />
                      <div className="flex shrink-0 flex-col items-end">
                        <TimeText cs={r.time} empty="" className="num text-row-num-pro" />
                        {withPoints && r.points > 0 && <span className="text-xs text-muted">{pts(r.points)} {r.points === 1 ? 'pt' : 'pts'}</span>}
                      </div>
                    </div>
                  );
                })}
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
    return <EmptyCard icon={<Medal className="size-5" />} title="Todavía no hay puntos" text="Los puntos por club salen de los resultados de cada prueba." />;
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
    <div className="flex flex-col gap-[26px]">
      <ClubPointsCard
        rows={s.clubs}
        clubs={clubs}
        caption={`Por puesto: ${meet.points.join('-')}. En un empate se reparten.${meet.finalizedAt ? '' : ' Provisional hasta finalizar.'}`}
        action={
          s.clubs.length > 0 ? (
            <ShareButton
              variant="ghost"
              size="md"
              iconOnly
              className="-my-2 -mr-1 rounded-full! text-fg-2"
              label="Compartir los puntos por club"
              path={`${base}/e/${meet.id}?ver=puntos`}
              card={shareCard}
            />
          ) : undefined
        }
      />
      <MedalsCard rows={s.medals} clubs={clubs} />
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
    <span className="flex items-center gap-2.5 text-xs text-muted">
      {dot(gold, 'bg-gold', 'oro')}
      {dot(silver, 'bg-silver', 'plata')}
      {dot(bronze, 'bg-bronze', 'bronce')}
    </span>
  );
}

/** Los clubes por puntos, como filas (el puesto, el club con su color y sus medallas, los puntos en grande). */
export function ClubPointsCard({
  rows,
  clubs,
  caption,
  title = 'Puntos por club',
  action,
}: {
  rows: (Pick<TeamScore, 'points' | 'gold' | 'silver' | 'bronze' | 'rank'> & { teamId?: string; clubId?: string })[];
  clubs: Map<string, { id: string; name: string; short: string; color: string | null; coachId: string | null }>;
  caption?: string;
  title?: string;
  action?: ReactNode;
}) {
  return (
    <section aria-label={title}>
      <SectionHeader title={title} action={action} />
      <Card className="overflow-hidden">
        {rows.map((r) => {
          const id = r.teamId ?? r.clubId ?? '';
          const club = clubs.get(id) ?? { id, name: '(club borrado)', short: '', color: null, coachId: null };
          return (
            <div key={id} className="mm-row relative flex min-h-row items-center gap-3.5 py-2.5 pr-5 pl-4">
              <PosNum pos={r.rank} />
              <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ background: club.color ?? 'var(--line)' }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-semibold">{club.name}</p>
                <MedalDots gold={r.gold} silver={r.silver} bronze={r.bronze} />
              </div>
              <span className="num shrink-0 text-row-num">{pts(r.points)}</span>
            </div>
          );
        })}
      </Card>
      {caption && <p className="mx-1 mt-2 text-[12.5px] leading-[1.4] text-muted">{caption}</p>}
    </section>
  );
}

function MedalsCard({ rows, clubs }: { rows: MedalRow[]; clubs: MeetData['clubs'] }) {
  if (!rows.length) return null;
  return (
    <section aria-label="Medallero">
      <SectionHeader title="Medallero" />
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs tracking-[0.06em] text-muted uppercase">
              <th className="px-5 pt-3.5 pb-2 text-left font-semibold">Club</th>
              <th className="w-12 pt-3.5 pb-2 font-semibold">Oro</th>
              <th className="w-12 pt-3.5 pb-2 font-semibold">Plata</th>
              <th className="w-14 pt-3.5 pb-2 font-semibold">Bronce</th>
              <th className="w-14 pt-3.5 pr-5 pb-2 font-semibold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((m) => (
              <tr key={m.id}>
                <td className="max-w-0 px-5 py-3">
                  <span className="flex items-center gap-2">
                    <span className="w-4 shrink-0 text-xs text-muted tabular-nums">{m.rank}</span>
                    <ClubTag club={clubs.get(m.id) ?? { id: m.id, name: '(club borrado)', short: '', color: null, coachId: null }} className="text-sm font-[550] text-fg" />
                  </span>
                </td>
                <td className="num text-center font-semibold">{m.gold}</td>
                <td className="num text-center">{m.silver}</td>
                <td className="num text-center">{m.bronze}</td>
                <td className="num pr-5 text-center text-muted">{m.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}
