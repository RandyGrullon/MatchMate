import { useState, type ReactNode } from 'react';
import { Keyboard, LayoutGrid, MessageCircle, Play, Share2, Trophy, Users } from 'lucide-react';
import type { Match } from '../../../../lib/data/matches';
import { savePointsResult } from '../../../../lib/data/racket';
import { useLeagueCtx } from '../../../../lib/league';
import type { StandingRow } from '../../../../sports/types';
import { useBusy } from '../../../../components/busy';
import { useFeedback } from '../../../../components/feedback';
import { MatchCard, ResultEntryModal, whatsappShareUrl, type ResultParser } from '../../../../components/match';
import { useIsPro } from '../../../../components/mode';
import { Badge, Button, Card, Empty, SectionHeader, cx } from '../../../../components/ui';
import type { NightRound } from '../logic/night';
import { useMySide } from '../match/MatchDetail';
import { useNames } from '../names';

/**
 * Piezas de las noches de puntos (el americano y el mexicano del pádel, el round robin social del pickleball) en el
 * rediseño «Calma y foco»: tu cancha de la ronda con UN botón, las canchas de la ronda, las rondas jugadas, el podio, la
 * tabla para compartir y los jugadores. NightPage y SocialPage las usan con lo suyo (cómo se pone el marcador, qué
 * número sale en el podio).
 */

/** «Ronda 1 · te toca · Cancha 2 · con Ana contra Luis / Pedro» y UN botón: «Anotar en la cancha». */
export function MyCourt({ match, round, onOpen, onScore, className }: { match: Match; round: number; onOpen: () => void; onScore: () => void; className?: string }) {
  const names = useNames();
  const { myPlayerId } = useLeagueCtx();
  const pro = useIsPro();
  const mySide = match.sides.find((s) => s.players.some((p) => p.playerId === myPlayerId));
  const mates = (mySide?.players ?? []).map((p) => p.playerId).filter((p) => p !== myPlayerId);
  const rival = match.sides.find((s) => s !== mySide);
  const open = match.status === 'scheduled' || match.status === 'live' || match.status === 'suspended';
  return (
    <Card soft className={cx('px-5 pt-[18px] pb-5', className)}>
      <button type="button" onClick={onOpen} className="block w-full text-left outline-none focus-visible:underline">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-accent">
          <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
          Ronda {round}: te toca
        </p>
        <p className="mt-1.5 text-card-title">{match.court || 'Cancha'}</p>
        <p className="mt-1 text-meta text-fg-2">
          {mates.length ? `Con ${mates.map(names.nameOf).join(' y ')} ` : ''}contra <b className="text-fg">{rival?.label ?? 'el rival'}</b>
        </p>
      </button>
      {open ? (
        <Button variant="primary" size={pro ? 'lg' : 'xl'} className="mt-4 w-full" icon={<Play className="size-5" />} onClick={onScore}>
          Anotar en la cancha
        </Button>
      ) : (
        <Button variant="quiet" size="lg" className="mt-4 w-full" onClick={onOpen}>
          Ver resultado
        </Button>
      )}
    </Card>
  );
}

/** «Ronda 2: descansas» (suma lo que digan las reglas de la noche, o en la próxima te toca). */
export function RestCard({ round, text, className }: { round: number; text: string; className?: string }) {
  return (
    <Card soft className={cx('flex items-center gap-3.5 px-5 py-4', className)}>
      <LayoutGrid aria-hidden="true" className="size-6 shrink-0 text-accent" />
      <p className="text-body">
        <b>Ronda {round}: descansas.</b> <span className="text-fg-2">{text}</span>
      </p>
    </Card>
  );
}

/**
 * Antes de la ronda 1. Quien organiza (en Pro): «Todo listo para la ronda 1» con el resumen y UN botón, «Empezar ronda 1»
 * (y «Jugadores»). Los demás: «Todavía no empieza».
 */
export function FirstRound({
  organize,
  summary,
  problem,
  note,
  busy,
  onStart,
  onPlayers,
}: {
  organize: boolean;
  summary: string;
  /** Lo que falta para empezar («Hacen falta al menos 4 jugadores»), o null. */
  problem: string | null;
  note?: string | null;
  busy: boolean;
  onStart: () => void;
  onPlayers: () => void;
}) {
  if (!organize) {
    return (
      <Empty icon={<LayoutGrid className="size-8" />} title="Todavía no empieza">
        Cuando se arme la ronda 1, aquí sale tu cancha (y te llega un aviso).
      </Empty>
    );
  }
  return (
    <Card className="px-5 pt-[18px] pb-5">
      <p className="text-card-title-pro">Todo listo para la ronda 1</p>
      <p className="mt-1.5 text-meta text-fg-2">{summary}</p>
      {problem && <p className="mt-2 text-sm font-semibold text-danger">{problem}</p>}
      {note && <p className="mt-2 text-[13px] text-muted">{note}</p>}
      <div className="mt-4 flex flex-col gap-2.5">
        <Button variant="primary" size="xl" className="w-full" icon={<Play className="size-5" />} loading={busy} disabled={!!problem} onClick={onStart}>
          Empezar ronda 1
        </Button>
        <Button variant="quiet" size="lg" className="w-full" icon={<Users className="size-4" />} onClick={onPlayers}>
          Jugadores
        </Button>
      </div>
    </Card>
  );
}

/** Cómo se pone el marcador de un partido de la ronda («14-10», «11-7»). */
export interface PointsEntry {
  parser: ResultParser;
  placeholder: string;
  hint?: string;
  examples?: string[];
}

/**
 * La ronda de ahora: una tarjeta por cancha con su marcador; tocarla abre el partido. «Anotar» y «Marcador» salen en tu
 * partido y, para quien organiza (o anota, en Pro), en todos. `entry` dice cómo se escribe el marcador de ese partido.
 */
export function RoundCourts({
  round,
  organize,
  entry,
  onOpen,
  onScore,
}: {
  round: NightRound;
  organize: boolean;
  entry: (m: Match) => PointsEntry | null;
  onOpen: (id: string) => void;
  onScore: (id: string) => void;
}) {
  const { lid, league, member } = useLeagueCtx();
  const pro = useIsPro();
  const names = useNames();
  const mySideOf = useMySide();
  const [typing, setTyping] = useState<Match | null>(null);
  const spec = typing ? entry(typing) : null;
  return (
    <section aria-labelledby={`ronda-${round.round}`}>
      <SectionHeader
        id={`ronda-${round.round}`}
        title={`Ronda ${round.round}`}
        action={<span className="text-meta text-muted">{round.pending ? `${round.pending} en juego` : 'Todas terminadas'}</span>}
      />
      <div className="grid gap-2.5 sm:grid-cols-2">
        {round.matches.map((m) => {
          const open = m.match.status === 'scheduled' || m.match.status === 'live' || m.match.status === 'suspended';
          const mine = mySideOf(m.match) !== null;
          const canScore = mine || organize || (pro && !!member?.scorer);
          return (
            <MatchCard
              key={m.id}
              match={m.match}
              mySide={mySideOf(m.match)}
              onClick={() => onOpen(m.id)}
              tz={league.tz}
              footer={
                open && canScore ? (
                  <div className="flex gap-2.5">
                    <Button variant="soft" size="lg" className="flex-1" icon={<Play className="size-4" />} onClick={() => onScore(m.id)}>
                      Anotar
                    </Button>
                    <Button variant="quiet" size="lg" className="flex-1" icon={<Keyboard className="size-4" />} onClick={() => setTyping(m.match)}>
                      Marcador
                    </Button>
                  </div>
                ) : undefined
              }
            />
          );
        })}
      </div>
      {round.rests.length > 0 && (
        <p className="mx-1 mt-3 text-meta text-muted">
          Descansan: <span className="font-semibold text-fg">{round.rests.map(names.nameOf).join(', ')}</span>
        </p>
      )}
      {typing && spec && (
        <ResultEntryModal
          open
          onClose={() => setTyping(null)}
          lid={lid}
          match={typing}
          parser={spec.parser}
          title={`Marcador de ${typing.court || 'la cancha'}`}
          placeholder={spec.placeholder}
          examples={spec.examples}
          hint={spec.hint}
          onSubmit={async (r) => {
            const sides = r.score.sides ?? [0, 0];
            const out = await savePointsResult(lid, typing.id, [sides[0], sides[1]]);
            if (out && !out.ok) throw new Error('Otro teléfono va más adelante con este partido.');
          }}
        />
      )}
    </section>
  );
}

/** Una ronda jugada: cada cancha con sus dos parejas y sus puntos (tocarla abre el partido). */
export function RoundList({ round, onOpen }: { round: NightRound; onOpen: (id: string) => void }) {
  const names = useNames();
  const pair = (ids: string[]) => ids.map(names.nameOf).join(' / ');
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-3.5 pb-1">
        <span className="text-[15px] font-[650]">Ronda {round.round}</span>
        {!round.done && <Badge tone="accent">En juego</Badge>}
      </div>
      <div>
        {round.matches.map((m, i) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onOpen(m.id)}
            className={cx(
              'relative flex w-full items-center gap-3 px-5 py-2.5 text-left transition active:bg-surface-2',
              i > 0 && "before:absolute before:top-0 before:right-0 before:left-5 before:h-px before:bg-line before:content-['']",
            )}
          >
            <span className="w-[4.5rem] shrink-0 truncate text-[13px] text-muted">{m.court}</span>
            <span className="min-w-0 flex-1 text-[15px]">
              <span className={cx('block truncate', m.score1 != null && m.score1 > m.score2! ? 'font-bold' : 'font-medium')}>{pair(m.side1)}</span>
              <span className={cx('block truncate', m.score2 != null && m.score2 > m.score1! ? 'font-bold' : 'font-medium')}>{pair(m.side2)}</span>
            </span>
            <span className="num flex flex-col text-right text-[17px] font-bold">
              <span>{m.score1 ?? '–'}</span>
              <span>{m.score2 ?? '–'}</span>
            </span>
          </button>
        ))}
      </div>
      {round.rests.length > 0 && <p className="px-5 pt-1 pb-3.5 text-[13px] text-muted">Descansan: {round.rests.map(names.nameOf).join(', ')}</p>}
    </Card>
  );
}

/** «Tabla final»: los 3 primeros con su número (`value`) y «Compartir la tabla». */
export function Podium({ table, nameOf, value, onShare }: { table: readonly StandingRow[]; nameOf: (id: string) => string; value: (r: StandingRow) => ReactNode; onShare: () => void }) {
  const top = table.filter((r) => r.played > 0).slice(0, 3);
  if (!top.length) return null;
  return (
    <Card className="px-5 pt-[18px] pb-5">
      <p className="flex items-center gap-2 text-card-title-pro">
        <Trophy aria-hidden="true" className="size-5 text-gold" /> Tabla final
      </p>
      <ol className="mt-3 flex flex-col">
        {top.map((r, i) => (
          <li key={r.id} className={cx('flex min-h-12 items-center gap-3', i > 0 && 'border-t border-line')}>
            <span className="w-5 text-center text-[15px] font-semibold text-muted tabular-nums">{r.rank}</span>
            <span className="min-w-0 flex-1 truncate text-body font-semibold">{nameOf(r.id)}</span>
            <span className="num text-row-num-pro">{value(r)}</span>
          </li>
        ))}
      </ol>
      <Button variant="soft" size="lg" className="mt-3 w-full" icon={<Share2 className="size-4" />} onClick={onShare}>
        Compartir la tabla
      </Button>
    </Card>
  );
}

/** La tabla en texto: por WhatsApp o copiada (en la hoja «Compartir la tabla»). */
export function ShareBox({ text }: { text: string }) {
  const { toast } = useFeedback();
  const copying = useBusy();
  return (
    <div className="flex flex-col gap-3 pb-1">
      <pre className="max-h-64 overflow-y-auto rounded-2xl bg-surface-2 px-4 py-3 font-sans text-[14px] leading-[1.45] whitespace-pre-wrap">{text}</pre>
      <div className="grid grid-cols-2 gap-2.5">
        <a
          href={whatsappShareUrl(text)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-[15px] bg-accent px-4 text-[15px] font-semibold text-accent-fg transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <MessageCircle className="size-5" /> WhatsApp
        </a>
        <Button
          variant="quiet"
          size="lg"
          loading={copying.isBusy()}
          onClick={() =>
            void copying.run('copiar', () =>
              navigator.clipboard
                .writeText(text)
                .then(() => toast('Tabla copiada'))
                .catch(() => toast('No se pudo copiar', 'error')),
            )
          }
        >
          Copiar la tabla
        </Button>
      </div>
    </div>
  );
}

/** Los jugadores en una hoja: el nombre, una línea (nivel, grupo del mixto) y un número a la derecha (sus puntos). */
export function PlayersList({ ids, sub, value }: { ids: readonly string[]; sub?: (id: string) => ReactNode; value?: (id: string) => ReactNode }) {
  const names = useNames();
  if (!ids.length) return <Empty title="Sin jugadores" />;
  return (
    <ul className="-mx-1 flex flex-col pb-1">
      {ids.map((id, i) => {
        const line = sub?.(id);
        const v = value?.(id);
        return (
          <li key={id} className={cx('flex min-h-14 items-center gap-3 px-1', i > 0 && 'border-t border-line')}>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{names.nameOf(id)}</span>
              {line && <span className="block text-[13px] text-muted">{line}</span>}
            </span>
            {v != null && v !== false && <span className="num shrink-0 text-[17px] font-[650]">{v}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** El pie de las hojas que guardan: Cancelar y Guardar, del mismo tamaño. */
export function SaveFooter({ onClose, busy, disabled, onSave, label = 'Guardar' }: { onClose: () => void; busy: boolean; disabled?: boolean; onSave: () => void; label?: string }) {
  return (
    <div className="flex gap-2.5">
      <Button variant="quiet" size="lg" className="flex-1" onClick={onClose}>
        Cancelar
      </Button>
      <Button variant="primary" size="lg" className="flex-1" loading={busy} disabled={disabled} onClick={onSave}>
        {label}
      </Button>
    </div>
  );
}
