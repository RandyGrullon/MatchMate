import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  CheckCircle2,
  Download,
  Flag,
  Keyboard,
  LayoutGrid,
  ListOrdered,
  Lock,
  LockOpen,
  MessageCircle,
  Play,
  RefreshCw,
  Rows3,
  Settings2,
  SkipForward,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import { deleteEvent } from '../../../../lib/data';
import { useMatches, type Match } from '../../../../lib/data/matches';
import { saveNightRound, savePointsResult, updateRacketEvent, useWithPendingPoints, type RacketEvent } from '../../../../lib/data/racket';
import { formatDateLong } from '../../../../lib/format';
import { useLeagueCtx } from '../../../../lib/league';
import { useNow } from '../../../../lib/useNow';
import { useFeedback, saveErrorMessage } from '../../../../components/feedback';
import { MatchCard, ResultEntryModal, StandingsTable, pointsResultParser, whatsappShareUrl, type StandingsColumn } from '../../../../components/match';
import { Badge, Button, Card, Empty, ListSkeleton, Modal, Position, Tabs, cx } from '../../../../components/ui';
import { BackLink } from '../../../../components/BackLink';
import { exportNightExcel } from '../excel';
import {
  fmtPoints,
  nextNightRound,
  nightConfigJson,
  nightRounds,
  nightShareText,
  nightTable,
  parseNightConfig,
  parsePoints,
  pointsLabel,
  redoNightRound,
  roundDrafts,
  type NightConfig,
  type NightRound,
  type NextRound,
} from '../logic/night';
import { timeLabel } from '../logic/time';
import { levelText, useLevels } from '../levels';
import { MatchDetail, useMatchParam, useMySide } from '../match/MatchDetail';
import { useNames } from '../names';
import { useRacket } from '../sport';
import { appOrigin, eventTypeInfo } from '../bits';
import { NightFields, NightPlayers } from './NightForm';

type Tab = 'canchas' | 'tabla' | 'rondas' | 'jugadores';

const TABLE_COLUMNS: StandingsColumn[] = [
  { key: 'played', label: 'PJ', title: 'Partidos jugados', value: (r) => r.played },
  { key: 'won', label: 'G', title: 'Ganados', value: (r) => r.won },
  { key: 'drawn', label: 'E', title: 'Empatados', value: (r) => r.drawn, wide: true },
  { key: 'lost', label: 'P', title: 'Perdidos', value: (r) => r.lost },
  { key: 'diff', label: 'Dif.', title: 'Diferencia de puntos', value: (r) => (r.diff > 0 ? `+${r.diff}` : r.diff), wide: true },
  { key: 'rests', label: 'Desc.', title: 'Descansos', value: (r) => r.extra.rests ?? 0, wide: true },
];

/**
 * La noche de Americano o Mexicano. Jugadores: su cancha de la ronda (con compañero y rivales) y la tabla en
 * vivo. Organizador: la ronda actual de cada cancha, poner el marcador con dos números si no se anotó en vivo,
 * la siguiente ronda al instante, rehacer una ronda que no empezó, jugadores que llegan o se van, cerrar la
 * noche, compartir la tabla por WhatsApp y el Excel.
 */
export function NightPage({ event }: { event: RacketEvent }) {
  const { lid, base, isAdmin, league, myPlayerId } = useLeagueCtx();
  const { leagueRules } = useRacket();
  const names = useNames();
  const param = useMatchParam();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const now = useNow(30_000).getTime();
  const q = useMatches({ lid, eventId: event.id });
  const matches = useWithPendingPoints(lid, q.data);
  const cfg = useMemo(() => parseNightConfig(event.config, event.type), [event.config, event.type]);
  const rounds = useMemo(() => nightRounds(cfg, matches, now), [cfg, matches, now]);
  const table = useMemo(() => nightTable(cfg, rounds), [cfg, rounds]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<null | 'ajustes' | 'jugadores'>(null);
  const title = event.name || eventTypeInfo(event.type).label;

  if (param.id) return <MatchDetail matchId={param.id} eventId={event.id} title={title} onBack={param.close} />;

  const current = rounds.at(-1) ?? null;
  const finished = cfg.closed || (!!current && current.round >= cfg.rounds && current.done);
  const requested = search.get('ver') as Tab | null;
  const tab: Tab = requested ?? (current ? 'canchas' : isAdmin ? 'canchas' : 'jugadores');
  const setTab = (t: Tab) => setSearch({ ver: t }, { replace: true });

  const saveConfig = async (next: NightConfig, ok?: string) => {
    setBusy(true);
    try {
      await updateRacketEvent(lid, event.id, { config: nightConfigJson(next) });
      if (ok) toast(ok);
      return true;
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const publish = async (next: NextRound, ok: string) => {
    if (!next.ok) {
      toast(next.reason, 'error');
      return;
    }
    setBusy(true);
    try {
      let c = cfg;
      if (next.config) {
        c = next.config;
        await updateRacketEvent(lid, event.id, { config: nightConfigJson(c) });
      }
      const { drafts, rests } = roundDrafts(c, next.social, leagueRules);
      await saveNightRound(lid, event.id, next.round, drafts, rests);
      toast(ok);
      setTab('canchas');
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const nextRound = async () => {
    const next = nextNightRound(cfg, rounds);
    if (next.ok && next.pendingPrev > 0) {
      const go = await confirm({
        title: `Faltan ${next.pendingPrev} ${next.pendingPrev === 1 ? 'partido' : 'partidos'} de la ronda ${current?.round}`,
        message: 'Los puntos cuentan cuando terminen. ¿Armar la siguiente ronda de todas formas?',
        confirmText: 'Sí, siguiente ronda',
      });
      if (!go) return;
    }
    await publish(next, next.ok ? `Ronda ${next.round} lista: a cada quien le llegó su cancha` : '');
  };

  const redo = async () => {
    const go = await confirm({ title: `¿Rehacer la ronda ${current?.round}?`, message: 'Se vuelve a sortear con los jugadores de ahora. Nadie ha empezado a jugar.', confirmText: 'Rehacer' });
    if (go) await publish(redoNightRound(cfg, rounds, Date.now().toString(36)), 'Ronda rehecha');
  };

  const closeNight = async (closed: boolean) => {
    if (closed && !(await confirm({ title: '¿Terminar la noche?', message: 'Queda la tabla final. Se puede volver a abrir.', confirmText: 'Terminar la noche' }))) return;
    await saveConfig({ ...cfg, closed }, closed ? 'Noche terminada' : 'Noche abierta otra vez');
  };

  const remove = async () => {
    if (!(await confirm({ title: `¿Borrar ${title}?`, message: 'Se borran sus rondas y resultados. No se puede deshacer.', confirmText: 'Borrar', danger: true }))) return;
    navigate(base);
    try {
      await deleteEvent(lid, event.id);
      toast('Noche borrada');
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    }
  };

  const share = nightShareText({
    title,
    date: formatDateLong(event.date),
    rows: table,
    nameOf: names.nameOf,
    points: cfg.points,
    final: finished,
    url: `${appOrigin()}${base}/e/${event.id}?ver=tabla`,
  });

  const excel = () =>
    exportNightExcel({ title, date: event.date, rounds, table, nameOf: names.nameOf }).catch((e) => {
      console.error(e);
      toast('No se pudo hacer el Excel', 'error');
    });

  const mine = current?.matches.find((m) => [...m.side1, ...m.side2].includes(myPlayerId ?? '')) ?? null;
  const resting = !!myPlayerId && !!current?.rests.includes(myPlayerId);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        {league.kind !== 'torneo' && <BackLink fallback={base} className="mt-1" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>
            <Badge tone="accent">{eventTypeInfo(cfg.format).label}</Badge>
            {finished ? (
              <Badge tone="ok">
                <CheckCircle2 className="size-3" /> Terminada
              </Badge>
            ) : current ? (
              <Badge tone="ok">
                <span className="live-dot" /> Ronda {current.round} de {cfg.rounds}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted first-letter:uppercase">
            {formatDateLong(event.date)}
            {event.startTime ? ` · ${timeLabel(event.startTime)}` : ''} · {pointsLabel(cfg.points)} · {cfg.players.length} jugadores · {cfg.courts.length}{' '}
            {cfg.courts.length === 1 ? 'cancha' : 'canchas'}
          </p>
        </div>
      </div>

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Settings2 className="size-4" />} onClick={() => setEditing('ajustes')}>
            Ajustes
          </Button>
          <Button size="sm" icon={<Users className="size-4" />} onClick={() => setEditing('jugadores')}>
            Jugadores
          </Button>
          {cfg.closed ? (
            <Button size="sm" icon={<LockOpen className="size-4" />} onClick={() => void closeNight(false)} loading={busy}>
              Volver a abrir
            </Button>
          ) : (
            current && (
              <Button size="sm" icon={<Lock className="size-4" />} onClick={() => void closeNight(true)} loading={busy}>
                Terminar la noche
              </Button>
            )
          )}
          <Button size="sm" icon={<Download className="size-4" />} onClick={() => void excel()} disabled={!rounds.length}>
            Excel
          </Button>
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => void remove()}>
            Borrar
          </Button>
        </div>
      )}

      {mine && !finished && (
        <MyCourt match={mine.match} partner={mine.side1.includes(myPlayerId!) ? mine.side1 : mine.side2} round={current!.round} onOpen={() => param.open(mine.id)} onScore={() => param.openCourt(mine.id)} />
      )}
      {resting && !finished && (
        <Card className="flex items-center gap-3 border-accent/40 bg-accent-soft/40 px-4 py-3">
          <Rows3 className="size-6 shrink-0 text-accent" />
          <p className="text-sm">
            <b>Ronda {current!.round}: descansas.</b> Suma lo que dicen las reglas de la noche.
          </p>
        </Card>
      )}

      <Tabs
        items={[
          { key: 'canchas' as Tab, label: 'Canchas', icon: <LayoutGrid className="size-4" /> },
          { key: 'tabla' as Tab, label: 'Tabla', icon: <ListOrdered className="size-4" /> },
          { key: 'rondas' as Tab, label: 'Rondas', icon: <Rows3 className="size-4" /> },
          { key: 'jugadores' as Tab, label: 'Jugadores', icon: <Users className="size-4" /> },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div key={tab} className="animate-fade-up flex flex-col gap-4">
        {tab === 'canchas' &&
          (q.loading && !matches.length ? (
            <ListSkeleton rows={2} />
          ) : !current ? (
            <FirstRound cfg={cfg} busy={busy} onStart={() => void nextRound()} onPlayers={() => setEditing('jugadores')} />
          ) : (
            <>
              {finished && <Podium table={table} nameOf={names.nameOf} share={share} />}
              <RoundCourts round={current} onOpen={param.open} onScore={param.openCourt} />
              {isAdmin && !cfg.closed && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  {current.round < cfg.rounds && (
                    <Button variant="primary" className="h-12 flex-1 text-base" loading={busy} icon={<SkipForward className="size-5" />} onClick={() => void nextRound()}>
                      Siguiente ronda ({current.round + 1} de {cfg.rounds})
                    </Button>
                  )}
                  {current.round >= cfg.rounds && current.done && (
                    <Button variant="primary" className="h-12 flex-1 text-base" loading={busy} icon={<Flag className="size-5" />} onClick={() => void closeNight(true)}>
                      Terminar la noche
                    </Button>
                  )}
                  {!current.started && (
                    <Button className="h-12" loading={busy} icon={<RefreshCw className="size-4" />} onClick={() => void redo()}>
                      Rehacer la ronda
                    </Button>
                  )}
                </div>
              )}
            </>
          ))}

        {tab === 'tabla' && (
          <>
            <StandingsTable
              rows={table.filter((r) => r.played > 0 || r.points > 0)}
              nameOf={names.nameOf}
              columns={TABLE_COLUMNS}
              highlight={myPlayerId ? [myPlayerId] : []}
              primary={['puntos']}
              empty="Cuando termine el primer partido, sale la tabla."
            />
            <p className="px-1 text-xs text-muted">
              Orden: puntos → partidos ganados → diferencia de puntos. Se actualiza al terminar cada partido.
              {cfg.rest !== 'none' && ' Quien descansa suma según las reglas de la noche.'}
            </p>
            <ShareBox text={share} />
          </>
        )}

        {tab === 'rondas' && (rounds.length ? rounds.slice().reverse().map((r) => <RoundList key={r.round} round={r} onOpen={param.open} />) : <Empty title="Todavía no hay rondas" />)}

        {tab === 'jugadores' && <PlayersTab cfg={cfg} table={table} onEdit={isAdmin ? () => setEditing('jugadores') : undefined} />}
      </div>

      <SettingsModal open={editing === 'ajustes'} cfg={cfg} busy={busy} onClose={() => setEditing(null)} onSave={async (c) => (await saveConfig(c, 'Guardado')) && setEditing(null)} />
      <PlayersModal open={editing === 'jugadores'} cfg={cfg} busy={busy} onClose={() => setEditing(null)} onSave={async (c) => (await saveConfig(c, 'Jugadores guardados')) && setEditing(null)} />
    </div>
  );
}

/** «Te toca: Cancha 2 · con Ana contra Luis / Pedro». */
function MyCourt({ match, partner, round, onOpen, onScore }: { match: Match; partner: string[]; round: number; onOpen: () => void; onScore: () => void }) {
  const names = useNames();
  const { myPlayerId } = useLeagueCtx();
  const mateIds = partner.filter((p) => p !== myPlayerId);
  const rival = match.sides.find((s) => !s.players.some((p) => p.playerId === myPlayerId));
  const open = match.status === 'scheduled' || match.status === 'live' || match.status === 'suspended';
  return (
    <Card className="flex flex-col gap-3 border-accent/50 bg-accent-soft/40 p-4">
      <div>
        <p className="text-xs font-semibold text-accent">Ronda {round}: te toca</p>
        <p className="text-2xl font-black">{match.court || 'Cancha'}</p>
        <p className="text-sm">
          {mateIds.length ? `Con ${mateIds.map(names.nameOf).join(' y ')} ` : ''}contra <b>{rival?.label ?? 'el rival'}</b>
        </p>
      </div>
      <div className="flex gap-2">
        {open && (
          <Button variant="primary" className="h-12 flex-1 text-base" icon={<Play className="size-5" />} onClick={onScore}>
            Anotar en la cancha
          </Button>
        )}
        <Button className="h-12" onClick={onOpen}>
          {open ? 'Ver' : 'Ver resultado'}
        </Button>
      </div>
    </Card>
  );
}

function FirstRound({ cfg, busy, onStart, onPlayers }: { cfg: NightConfig; busy: boolean; onStart: () => void; onPlayers: () => void }) {
  const { isAdmin } = useLeagueCtx();
  const next = nextNightRound(cfg, []);
  if (!isAdmin) {
    return (
      <Empty icon={<LayoutGrid className="size-8" />} title="Todavía no empieza">
        Cuando el organizador arme la ronda 1, aquí sale tu cancha (y te llega un aviso).
      </Empty>
    );
  }
  return (
    <Card className="flex flex-col gap-3 p-4">
      <p className="font-semibold">Todo listo para la ronda 1</p>
      <p className="text-sm text-muted">
        {cfg.players.length} jugadores en {cfg.courts.length} {cfg.courts.length === 1 ? 'cancha' : 'canchas'}, {pointsLabel(cfg.points).toLowerCase()},{' '}
        {cfg.rounds} rondas. {cfg.format === 'mexicano' ? (cfg.firstRound === 'level' ? 'La ronda 1 va por nivel.' : 'La ronda 1 va al azar.') : 'Las parejas rotan sin repetir compañero.'}
      </p>
      {!next.ok && <p className="text-sm text-warn">{next.reason}</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="primary" className="h-12 flex-1 text-base" icon={<Play className="size-5" />} loading={busy} disabled={!next.ok} onClick={onStart}>
          Empezar ronda 1
        </Button>
        <Button className="h-12" icon={<Users className="size-4" />} onClick={onPlayers}>
          Jugadores
        </Button>
      </div>
    </Card>
  );
}

/** La ronda actual: una tarjeta por cancha con su marcador; tocarla abre el partido. */
function RoundCourts({ round, onOpen, onScore }: { round: NightRound; onOpen: (id: string) => void; onScore: (id: string) => void }) {
  const { lid, league, isAdmin, member } = useLeagueCtx();
  const names = useNames();
  const mySideOf = useMySide();
  const [typing, setTyping] = useState<Match | null>(null);
  const points = typing ? parsePoints((typing.rules as Record<string, unknown> | undefined)?.points) : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-muted">Ronda {round.round}</h2>
        <span className="text-xs text-muted">{round.pending ? `${round.pending} en juego` : 'Todas terminadas'}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {round.matches.map((m) => {
          const open = m.match.status === 'scheduled' || m.match.status === 'live' || m.match.status === 'suspended';
          const canScore = isAdmin || !!member?.scorer || mySideOf(m.match) !== null;
          return (
            <MatchCard
              key={m.id}
              match={m.match}
              mySide={mySideOf(m.match)}
              onClick={() => onOpen(m.id)}
              tz={league.tz}
              footer={
                open && canScore ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="primary" className="h-10 flex-1" icon={<Play className="size-4" />} onClick={() => onScore(m.id)}>
                      Anotar
                    </Button>
                    <Button size="sm" className="h-10 flex-1" icon={<Keyboard className="size-4" />} onClick={() => setTyping(m.match)}>
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
        <p className="px-1 text-sm text-muted">
          Descansan: <span className="font-medium text-fg">{round.rests.map(names.nameOf).join(', ')}</span>
        </p>
      )}
      {typing && points && (
        <ResultEntryModal
          open
          onClose={() => setTyping(null)}
          lid={lid}
          match={typing}
          parser={pointsResultParser(points)}
          title={`Marcador de ${typing.court || 'la cancha'}`}
          placeholder="14-10"
          hint={points.mode === 'total' ? `Los puntos de cada lado: suman ${points.target}.` : 'Los puntos de cada lado.'}
          onSubmit={async (r) => {
            const sides = r.score.sides ?? [0, 0];
            const out = await savePointsResult(lid, typing.id, [sides[0], sides[1]]);
            if (out && !out.ok) throw new Error('Otro teléfono va más adelante con este partido.');
          }}
        />
      )}
    </div>
  );
}

function RoundList({ round, onOpen }: { round: NightRound; onOpen: (id: string) => void }) {
  const names = useNames();
  const pair = (ids: string[]) => ids.map(names.nameOf).join(' / ');
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-2 text-sm font-semibold">
        <span>Ronda {round.round}</span>
        {!round.done && <Badge tone="ok">En juego</Badge>}
      </div>
      <div className="divide-y divide-line">
        {round.matches.map((m) => (
          <button key={m.id} type="button" onClick={() => onOpen(m.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-2">
            <span className="w-20 shrink-0 truncate text-xs text-muted">{m.court}</span>
            <span className="min-w-0 flex-1">
              <span className={cx('block truncate', m.score1 != null && m.score1 > m.score2! && 'font-semibold')}>{pair(m.side1)}</span>
              <span className={cx('block truncate', m.score2 != null && m.score2 > m.score1! && 'font-semibold')}>{pair(m.side2)}</span>
            </span>
            <span className="flex flex-col text-right font-bold tabular-nums">
              <span>{m.score1 ?? '–'}</span>
              <span>{m.score2 ?? '–'}</span>
            </span>
          </button>
        ))}
      </div>
      {round.rests.length > 0 && <p className="border-t border-line px-4 py-2 text-xs text-muted">Descansan: {round.rests.map(names.nameOf).join(', ')}</p>}
    </Card>
  );
}

function Podium({ table, nameOf, share }: { table: ReturnType<typeof nightTable>; nameOf: (id: string) => string; share: string }) {
  const top = table.filter((r) => r.played > 0).slice(0, 3);
  if (!top.length) return null;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <p className="flex items-center gap-2 font-semibold">
        <Trophy className="size-5 text-gold" /> Tabla final
      </p>
      <div className="flex flex-col gap-2">
        {top.map((r) => (
          <div key={r.id} className="flex items-center gap-3">
            <Position pos={r.rank} />
            <span className="flex-1 truncate font-medium">{nameOf(r.id)}</span>
            <span className="font-bold tabular-nums">{fmtPoints(r.points)}</span>
          </div>
        ))}
      </div>
      <a
        href={whatsappShareUrl(share)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-ok px-4 text-sm font-medium text-bg hover:brightness-110 active:scale-[0.97]"
      >
        <MessageCircle className="size-5" /> Compartir por WhatsApp
      </a>
    </Card>
  );
}

function ShareBox({ text }: { text: string }) {
  const { toast } = useFeedback();
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={whatsappShareUrl(text)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-ok px-4 text-sm font-medium text-bg hover:brightness-110 active:scale-[0.97]"
      >
        <MessageCircle className="size-5" /> WhatsApp
      </a>
      <Button
        className="h-11 flex-1"
        onClick={() =>
          navigator.clipboard
            .writeText(text)
            .then(() => toast('Tabla copiada'))
            .catch(() => toast('No se pudo copiar', 'error'))
        }
      >
        Copiar la tabla
      </Button>
    </div>
  );
}

function PlayersTab({ cfg, table, onEdit }: { cfg: NightConfig; table: ReturnType<typeof nightTable>; onEdit?: () => void }) {
  const names = useNames();
  const { levels, scale } = useLevels();
  const byId = new Map(table.map((r) => [r.id, r] as const));
  const list: ReactNode = cfg.players.length ? (
    <Card className="divide-y divide-line overflow-hidden">
      {cfg.players.map((id) => {
        const r = byId.get(id);
        return (
          <div key={id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1 truncate font-medium">{names.nameOf(id)}</span>
            {levels[id] != null && <Badge tone="neutral">{levelText(levels[id], scale)}</Badge>}
            <span className="text-sm text-muted tabular-nums">{r ? `${fmtPoints(r.points)} pts` : ''}</span>
          </div>
        );
      })}
    </Card>
  ) : (
    <Empty title="Sin jugadores" />
  );
  return (
    <>
      {list}
      {onEdit && (
        <Button className="h-11" icon={<Users className="size-4" />} onClick={onEdit}>
          Cambiar jugadores
        </Button>
      )}
    </>
  );
}

function SettingsModal({ open, cfg, busy, onClose, onSave }: { open: boolean; cfg: NightConfig; busy: boolean; onClose: () => void; onSave: (c: NightConfig) => void }) {
  const [draft, setDraft] = useState(cfg);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setDraft(cfg);
  }
  const changedPlan = draft.courts.length !== cfg.courts.length || draft.rounds !== cfg.rounds;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ajustes de la noche"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={() => onSave(changedPlan ? { ...draft, courts: draft.courts.map((c, i) => c.trim() || `Cancha ${i + 1}`), plan: undefined, planPlayers: undefined, planFrom: undefined } : draft)}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <NightFields value={draft} onChange={setDraft} />
        <p className="text-xs text-muted">Los cambios valen desde la ronda que sigue. Los partidos ya creados se quedan como están.</p>
      </div>
    </Modal>
  );
}

function PlayersModal({ open, cfg, busy, onClose, onSave }: { open: boolean; cfg: NightConfig; busy: boolean; onClose: () => void; onSave: (c: NightConfig) => void }) {
  const { levels } = useLevels();
  const [players, setPlayers] = useState(cfg.players);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setPlayers(cfg.players);
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Jugadores de la noche"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={players.length < 4}
            onClick={() => {
              const lv = { ...cfg.levels };
              for (const p of players) if (levels[p] != null) lv[p] = levels[p];
              onSave({ ...cfg, players, levels: lv });
            }}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">Quien llega tarde o se va: los cambios valen desde la ronda que sigue.</p>
        <NightPlayers value={players} onChange={setPlayers} levels={levels} />
      </div>
    </Modal>
  );
}
