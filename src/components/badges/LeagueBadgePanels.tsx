import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Award, ChevronDown, Crown, Medal } from 'lucide-react';
import { todayIn } from '../../badges/rules/periods';
import { Insignia } from '../../badges/visual';
import { useBadgeStats, type BadgeAward } from '../../lib/data/badges';
import { usePlayers } from '../../lib/data';
import { useLeagueCtx } from '../../lib/league';
import { useNow } from '../../lib/useNow';
import { Card, cx } from '../ui';
import { BadgeSheet, tileSub, type SheetSubject } from './BadgeSheet';
import { BadgeGrid, BadgeTile } from './BadgeTile';
import { countText, eventAwards, groupTiles, monthAwards, seasonAwards, viewAward, type BadgeTileModel, type WinnerGroup } from './logic';

/**
 * Lo pesado de las insignias en la liga (se carga aparte desde LeagueBadges.tsx): «Premios de {mes}», «Campeones» y
 * las insignias de un jugador.
 */

type Names = ReadonlyMap<string, string>;

/**
 * Una lista de ganadores: la insignia a 40 (tocarla abre el detalle), su nombre, el grupo (caja, equipo, puesto),
 * quiénes la ganaron (a su página) y la línea de evidencia («Promedio 187 en 12 juegos»).
 */
export function WinnersList({
  groups,
  names,
  base,
  onOpen,
}: {
  groups: readonly WinnerGroup[];
  names: Names;
  base: string;
  onOpen: (g: WinnerGroup, awardId: string) => void;
}) {
  return (
    <ul className="divide-y divide-line">
      {groups.map((g) => (
        <li key={g.id} className="flex items-start gap-3 px-3 py-2.5">
          <button
            type="button"
            onClick={() => onOpen(g, g.winners[0]?.awardId ?? g.view.award.id)}
            className="-m-0.5 inline-flex size-11 shrink-0 items-center justify-center rounded-xl transition hover:bg-surface-2 active:scale-95"
            aria-label={`Ver ${g.view.label}`}
          >
            <Insignia badge={g.view.look} size={40} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-tight font-semibold break-words">
              {g.view.name}
              {g.subtitle && <span className="font-normal text-muted">{` · ${g.subtitle}`}</span>}
            </p>
            <ul className="flex flex-col">
              {g.winners.map((w) => {
                const who = (
                  <>
                    <span className="font-medium text-fg">{w.playerId ? (names.get(w.playerId) ?? 'Jugador') : 'Jugador'}</span>
                    {w.evidence && <span className="text-xs text-muted">{w.evidence}</span>}
                  </>
                );
                return (
                  <li key={w.awardId}>
                    {w.playerId ? (
                      <Link to={`${base}/j/${w.playerId}`} className="-mx-1 flex min-h-11 flex-col justify-center rounded-lg px-1 text-sm leading-snug transition hover:bg-surface-2">
                        {who}
                      </Link>
                    ) : (
                      <div className="flex min-h-11 flex-col justify-center text-sm leading-snug">{who}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** «Asistencia perfecta: 12 jugadores», plegada. */
export function AttendanceFold({ list, names, base }: { list: readonly { playerId: string | null; awardId: string }[]; names: Names; base: string }) {
  const [open, setOpen] = useState(false);
  if (!list.length) return null;
  return (
    <div className="border-t border-line">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium transition hover:bg-surface-2"
      >
        <span className="flex-1">{`Asistencia perfecta: ${list.length} ${list.length === 1 ? 'jugador' : 'jugadores'}`}</span>
        <ChevronDown className={cx('size-4 text-muted transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <ul className="flex flex-wrap gap-1 px-2 pb-2 text-sm">
          {list.map((a) => (
            <li key={a.awardId}>
              {a.playerId ? (
                <Link to={`${base}/j/${a.playerId}`} className="inline-flex min-h-11 items-center rounded-lg px-2 text-fg transition hover:bg-surface-2">
                  {names.get(a.playerId) ?? 'Jugador'}
                </Link>
              ) : (
                <span className="inline-flex min-h-11 items-center px-2">Jugador</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function useNames(lid: string): Names {
  const players = usePlayers(lid);
  return useMemo(() => new Map(players.data.map((p) => [p.id, p.name])), [players.data]);
}

/** Abre el detalle de una sola fila (con la rareza y, para los admins, «Compartir» para anunciarla). */
function useAwardSheet(awards: readonly BadgeAward[], now: number) {
  const [open, setOpen] = useState<{ awardId: string } | null>(null);
  const subject: SheetSubject | null = useMemo(() => {
    const a = open ? awards.find((x) => x.id === open.awardId) : undefined;
    const tile = a ? groupTiles([a], { own: false, now })[0] : undefined;
    return tile ? { kind: 'award', tile } : null;
  }, [open, awards, now]);
  return { subject, openAward: (awardId: string) => setOpen({ awardId }), close: () => setOpen(null) };
}

/** «Premios de {octubre}» del día 3 al 9 y «Campeones de {temporada}» por 14 días (§6.2). */
export function LeagueAwardsPanel({ awards }: { awards: readonly BadgeAward[] }) {
  const { lid, league, base, isAdmin } = useLeagueCtx();
  const names = useNames(lid);
  const now = useNow().getTime();
  const today = todayIn(now, league.tz || undefined);
  const month = useMemo(() => monthAwards(awards, today), [awards, today]);
  const season = useMemo(() => seasonAwards(awards, now), [awards, now]);
  const stats = useBadgeStats(!!month || !!season);
  const sheet = useAwardSheet(awards, now);
  if (!month && !season) return null;
  const owner = sheet.subject?.kind === 'award' ? sheet.subject.tile.top.award.playerId : null;

  return (
    <div className="flex flex-col gap-5">
      {season && (
        <section aria-labelledby="liga-campeones" className="flex flex-col gap-2">
          <h2 id="liga-campeones" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Crown className="size-5 text-accent" aria-hidden="true" /> {season.title}
          </h2>
          <Card className="overflow-hidden">
            <WinnersList groups={season.groups} names={names} base={base} onOpen={(_, id) => sheet.openAward(id)} />
          </Card>
        </section>
      )}
      {month && (
        <section aria-labelledby="liga-premios-mes" className="flex flex-col gap-2">
          <h2 id="liga-premios-mes" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Medal className="size-5 text-accent" aria-hidden="true" /> {month.title}
          </h2>
          <Card className="overflow-hidden">
            {month.groups.length > 0 && <WinnersList groups={month.groups} names={names} base={base} onOpen={(_, id) => sheet.openAward(id)} />}
            <AttendanceFold list={month.attendance} names={names} base={base} />
          </Card>
        </section>
      )}
      <BadgeSheet
        subject={sheet.subject}
        onClose={sheet.close}
        stats={stats.data}
        playerName={owner ? (names.get(owner) ?? '') : ''}
        announce={isAdmin && !league.hasMinors}
        shareLink={typeof location !== 'undefined' ? `${location.origin}${base}` : undefined}
      />
    </div>
  );
}

/** Las insignias de un jugador en su liga (ámbito liga y, si no tiene cuenta, sus copias de respaldo). */
export function PlayerBadgesPanel({ playerId, awards }: { playerId: string; awards: readonly BadgeAward[] }) {
  const { lid, league, base, isAdmin, myPlayerId } = useLeagueCtx();
  const players = usePlayers(lid);
  const player = players.data.find((p) => p.id === playerId);
  const now = useNow().getTime();
  const tiles = useMemo(() => groupTiles(awards, { own: false, now }), [awards, now]);
  const stats = useBadgeStats(tiles.length > 0);
  const [subject, setSubject] = useState<SheetSubject | null>(null);
  if (!tiles.length) return null;
  const mine = !!myPlayerId && myPlayerId === playerId;
  return (
    <section aria-labelledby="jugador-insignias" className="mt-5 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="jugador-insignias" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <Award className="size-5 text-accent" aria-hidden="true" /> Insignias
          <span className="text-sm font-medium text-muted">{countText(awards.length)}</span>
        </h2>
        {player?.uid && (
          <Link
            to={mine ? '/perfil?tab=insignias' : `/u/${player.uid}?tab=insignias`}
            className="inline-flex h-11 items-center rounded-xl px-3 text-sm font-semibold text-accent hover:bg-accent-soft"
          >
            {mine ? 'Todas las mías' : 'Ver todas'}
          </Link>
        )}
      </div>
      <Card className="p-2">
        <BadgeGrid>
          {tiles.map((t: BadgeTileModel) => (
            <BadgeTile
              key={t.id}
              look={t.top.look}
              state={t.state}
              name={t.top.name}
              sub={tileSub(t)}
              count={t.count}
              label={`${t.top.label}${t.count > 1 ? `, ${t.count} veces` : ''}${t.state === 'new' ? ', nueva' : ''}`}
              onOpen={() => setSubject({ kind: 'award', tile: t })}
            />
          ))}
        </BadgeGrid>
      </Card>
      <BadgeSheet
        subject={subject}
        onClose={() => setSubject(null)}
        stats={stats.data}
        playerName={player?.name ?? ''}
        canShare={mine && !league.hasMinors}
        announce={isAdmin && !mine && !league.hasMinors}
        shareLink={typeof location !== 'undefined' ? `${location.origin}${base}/j/${playerId}` : undefined}
      />
    </section>
  );
}

/** «Insignias del evento» en su página: el podio (y categorías y equipos) con sus insignias, cuando ya se dieron (§6.2). */
export function EventAwardsPanel({ eventId, awards }: { eventId: string; awards: readonly BadgeAward[] }) {
  const { lid, league, base, isAdmin } = useLeagueCtx();
  const names = useNames(lid);
  const now = useNow().getTime();
  const groups = useMemo(() => eventAwards(awards, eventId), [awards, eventId]);
  const stats = useBadgeStats(groups.length > 0);
  const sheet = useAwardSheet(awards, now);
  if (!groups.length) return null;
  const owner = sheet.subject?.kind === 'award' ? sheet.subject.tile.top.award.playerId : null;
  return (
    <section aria-labelledby="evento-insignias" className="flex flex-col gap-2">
      <h2 id="evento-insignias" className="flex items-center gap-2 text-lg font-bold tracking-tight">
        <Award className="size-5 text-accent" aria-hidden="true" /> Insignias del evento
      </h2>
      <Card className="overflow-hidden">
        <WinnersList groups={groups} names={names} base={base} onOpen={(_, id) => sheet.openAward(id)} />
      </Card>
      <BadgeSheet
        subject={sheet.subject}
        onClose={sheet.close}
        stats={stats.data}
        playerName={owner ? (names.get(owner) ?? '') : ''}
        announce={isAdmin && !league.hasMinors}
        shareLink={typeof location !== 'undefined' ? `${location.origin}${base}` : undefined}
      />
    </section>
  );
}

/** El escudo de 24 px del título vigente (§6.2), al lado del campeón en la tabla. */
export function TitleShield({ award }: { award: BadgeAward }) {
  const view = useMemo(() => viewAward(award), [award]);
  if (!view) return null;
  return (
    <span className="inline-flex shrink-0 align-middle" title="Título vigente">
      <Insignia badge={view.look} size={24} label={`Título vigente: ${view.name}`} />
    </span>
  );
}
