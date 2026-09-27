import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { CheckCircle2, Flag, Keyboard, LayoutGrid, ListOrdered, Lock, LockOpen, MessageCircle, Play, RefreshCw, Rows3, Settings2, SkipForward, Trash2, Trophy, Users } from 'lucide-react';
import { deleteEvent } from '../../../../lib/data';
import { useMatches, type Match } from '../../../../lib/data/matches';
import { saveNightRound, savePointsResult, updateRacketEvent, useWithPendingPoints, type RacketEvent } from '../../../../lib/data/racket';
import { formatDateLong } from '../../../../lib/format';
import { useLeagueCtx } from '../../../../lib/league';
import { useNow } from '../../../../lib/useNow';
import { useFeedback, saveErrorMessage } from '../../../../components/feedback';
import { MatchCard, ResultEntryModal, StandingsTable, whatsappShareUrl, type StandingsColumn } from '../../../../components/match';
import { Badge, Button, Card, Empty, ListSkeleton, Modal, Position, Tabs, cx } from '../../../../components/ui';
import { BackLink } from '../../../../components/BackLink';
import { Stepper, appOrigin } from '../../racket/bits';
import { levelText, useLevels } from '../../racket/levels';
import { nightRounds, type NightRound, type NextRound } from '../../racket/logic/night';
import { timeLabel } from '../../racket/logic/time';
import { MatchDetail, useMatchParam, useMySide } from '../../racket/match/MatchDetail';
import { useNames } from '../../racket/names';
import { NightFields, NightPlayers } from '../../racket/night/NightForm';
import { useRacket } from '../../racket/sport';
import { GameFields, MixedGroups } from './SocialForm';
import {
  gameParser,
  gameText,
  nextSocialRound,
  parseSocialConfig,
  redoSocialRound,
  socialConfigJson,
  socialDrafts,
  socialShareText,
  socialTable,
  type SocialConfig,
} from './logic';

type Tab = 'canchas' | 'tabla' | 'rondas' | 'jugadores';

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

const TABLE_COLUMNS: StandingsColumn[] = [
  { key: 'played', label: 'PJ', title: 'Partidos jugados', value: (r) => r.played },
  { key: 'lost', label: 'P', title: 'Perdidos', value: (r) => r.lost },
  { key: 'for', label: 'PF', title: 'Puntos a favor', value: (r) => r.for, wide: true },
  { key: 'against', label: 'PC', title: 'Puntos en contra', value: (r) => r.against, wide: true },
  { key: 'diff', label: 'Dif.', title: 'Diferencia de puntos', value: (r) => signed(r.diff) },
];

/**
 * Round robin social de pickleball: compañeros que rotan cada ronda y cada partido es un juego a 11 (15 o 21).
 * Jugador: su cancha de la ronda (compañero y rivales) y la tabla en vivo. Organizador: las canchas de la ronda,
 * el marcador con dos números si no se anotó en la cancha, la siguiente ronda al instante, rehacer una ronda que
 * no empezó, jugadores que llegan o se van, mixto, terminar y compartir la tabla por WhatsApp.
 */
export function SocialPage({ event }: { event: RacketEvent }) {
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
  const cfg = useMemo(() => parseSocialConfig(event.config, event.type), [event.config, event.type]);
  const rounds = useMemo(() => nightRounds(cfg, matches, now), [cfg, matches, now]);
  const people = useMemo(() => {
    const out = new Set(cfg.players);
    for (const r of rounds) for (const m of r.matches) for (const p of [...m.side1, ...m.side2]) out.add(p);
    return [...out];
  }, [cfg.players, rounds]);
  const table = useMemo(() => socialTable(people, rounds), [people, rounds]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<null | 'ajustes' | 'jugadores'>(null);
  const title = event.name || 'Round robin';

  if (param.id) return <MatchDetail matchId={param.id} eventId={event.id} title={title} onBack={param.close} />;

  const current = rounds.at(-1) ?? null;
  const finished = cfg.closed || (!!current && current.round >= cfg.rounds && current.done);
  const requested = search.get('ver') as Tab | null;
  const tab: Tab = requested ?? (current ? 'canchas' : isAdmin ? 'canchas' : 'jugadores');
  const setTab = (t: Tab) => setSearch({ ver: t }, { replace: true });

  const saveConfig = async (next: SocialConfig, ok?: string) => {
    setBusy(true);
    try {
      await updateRacketEvent(lid, event.id, { config: socialConfigJson(next) });
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
        c = { ...cfg, ...next.config };
        await updateRacketEvent(lid, event.id, { config: socialConfigJson(c) });
      }
      const { drafts, rests } = socialDrafts(c, next.social, leagueRules);
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
    const next = nextSocialRound(cfg, rounds);
    if (next.ok && next.pendingPrev > 0) {
      const go = await confirm({
        title: `Faltan ${next.pendingPrev} ${next.pendingPrev === 1 ? 'partido' : 'partidos'} de la ronda ${current?.round}`,
        message: 'Cuentan cuando terminen. ¿Armar la siguiente ronda de todas formas?',
        confirmText: 'Sí, siguiente ronda',
      });
      if (!go) return;
    }
    await publish(next, next.ok ? `Ronda ${next.round} lista: a cada quien le llegó su cancha` : '');
  };

  const redo = async () => {
    const go = await confirm({ title: `¿Rehacer la ronda ${current?.round}?`, message: 'Se vuelve a sortear con los jugadores de ahora. Nadie ha empezado a jugar.', confirmText: 'Rehacer' });
    if (go) await publish(redoSocialRound(cfg, rounds, Date.now().toString(36)), 'Ronda rehecha');
  };

  const close = async (closed: boolean) => {
    if (closed && !(await confirm({ title: '¿Terminar el round robin?', message: 'Queda la tabla final. Se puede volver a abrir.', confirmText: 'Terminar' }))) return;
    await saveConfig({ ...cfg, closed }, closed ? 'Round robin terminado' : 'Abierto otra vez');
  };

  const remove = async () => {
    if (!(await confirm({ title: `¿Borrar ${title}?`, message: 'Se borran sus rondas y resultados. No se puede deshacer.', confirmText: 'Borrar', danger: true }))) return;
    navigate(base);
    try {
      await deleteEvent(lid, event.id);
      toast('Round robin borrado');
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    }
  };

  const share = socialShareText({ title, date: formatDateLong(event.date), rows: table, nameOf: names.nameOf, final: finished, url: `${appOrigin()}${base}/e/${event.id}?ver=tabla` });
  const mine = current?.matches.find((m) => [...m.side1, ...m.side2].includes(myPlayerId ?? '')) ?? null;
  const resting = !!myPlayerId && !!current?.rests.includes(myPlayerId);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        {league.kind !== 'torneo' && <BackLink fallback={base} className="mt-1" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>
            <Badge tone="accent">{cfg.mixed ? 'Round robin mixto' : 'Round robin'}</Badge>
            {finished ? (
              <Badge tone="ok">
                <CheckCircle2 className="size-3" /> Terminado
              </Badge>
            ) : current ? (
              <Badge tone="ok">
                <span className="live-dot" /> Ronda {current.round} de {cfg.rounds}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted first-letter:uppercase">
            {formatDateLong(event.date)}
            {event.startTime ? ` · ${timeLabel(event.startTime)}` : ''} · {gameText(cfg.game)} · {cfg.players.length} jugadores · {cfg.courts.length}{' '}
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
            <Button size="sm" icon={<LockOpen className="size-4" />} onClick={() => void close(false)} loading={busy}>
              Volver a abrir
            </Button>
          ) : (
            current && (
              <Button size="sm" icon={<Lock className="size-4" />} onClick={() => void close(true)} loading={busy}>
                Terminar
              </Button>
            )
          )}
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => void remove()}>
            Borrar
          </Button>
        </div>
      )}

      {mine && !finished && <MyCourt match={mine.match} round={current!.round} onOpen={() => param.open(mine.id)} onScore={() => param.openCourt(mine.id)} />}
      {resting && !finished && (
        <Card className="flex items-center gap-3 border-accent/40 bg-accent-soft/40 px-4 py-3">
          <Rows3 className="size-6 shrink-0 text-accent" />
          <p className="text-sm">
            <b>Ronda {current!.round}: descansas.</b> En la próxima te toca.
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
              <RoundCourts cfg={cfg} round={current} onOpen={param.open} onScore={param.openCourt} />
              {isAdmin && !cfg.closed && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  {current.round < cfg.rounds && (
                    <Button variant="primary" className="h-12 flex-1 text-base" loading={busy} icon={<SkipForward className="size-5" />} onClick={() => void nextRound()}>
                      Siguiente ronda ({current.round + 1} de {cfg.rounds})
                    </Button>
                  )}
                  {current.round >= cfg.rounds && current.done && (
                    <Button variant="primary" className="h-12 flex-1 text-base" loading={busy} icon={<Flag className="size-5" />} onClick={() => void close(true)}>
                      Terminar el round robin
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
              rows={table.filter((r) => r.played > 0)}
              nameOf={names.nameOf}
              columns={TABLE_COLUMNS}
              highlight={myPlayerId ? [myPlayerId] : []}
              pointsLabel="G"
              primary={['partidos ganados']}
              empty="Cuando termine el primer juego, sale la tabla."
            />
            <p className="px-1 text-xs text-muted">Orden: partidos ganados → diferencia de puntos → puntos a favor. Se actualiza al terminar cada juego.</p>
            <ShareBox text={share} />
          </>
        )}

        {tab === 'rondas' && (rounds.length ? rounds.slice().reverse().map((r) => <RoundList key={r.round} round={r} onOpen={param.open} />) : <Empty title="Todavía no hay rondas" />)}

        {tab === 'jugadores' && <PlayersTab cfg={cfg} onEdit={isAdmin ? () => setEditing('jugadores') : undefined} />}
      </div>

      <SettingsModal open={editing === 'ajustes'} cfg={cfg} busy={busy} onClose={() => setEditing(null)} onSave={async (c) => (await saveConfig(c, 'Guardado')) && setEditing(null)} />
      <PlayersModal open={editing === 'jugadores'} cfg={cfg} busy={busy} onClose={() => setEditing(null)} onSave={async (c) => (await saveConfig(c, 'Jugadores guardados')) && setEditing(null)} />
    </div>
  );
}

/** «Ronda 2: te toca Cancha 1 · con Ana contra Luis / Pedro». */
function MyCourt({ match, round, onOpen, onScore }: { match: Match; round: number; onOpen: () => void; onScore: () => void }) {
  const names = useNames();
  const { myPlayerId } = useLeagueCtx();
  const mySide = match.sides.find((s) => s.players.some((p) => p.playerId === myPlayerId));
  const mates = (mySide?.players ?? []).map((p) => p.playerId).filter((p) => p !== myPlayerId);
  const rival = match.sides.find((s) => s !== mySide);
  const open = match.status === 'scheduled' || match.status === 'live' || match.status === 'suspended';
  return (
    <Card className="flex flex-col gap-3 border-accent/50 bg-accent-soft/40 p-4">
      <div>
        <p className="text-xs font-semibold text-accent">Ronda {round}: te toca</p>
        <p className="text-2xl font-black">{match.court || 'Cancha'}</p>
        <p className="text-sm">
          {mates.length ? `Con ${mates.map(names.nameOf).join(' y ')} ` : ''}contra <b>{rival?.label ?? 'el rival'}</b>
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

function FirstRound({ cfg, busy, onStart, onPlayers }: { cfg: SocialConfig; busy: boolean; onStart: () => void; onPlayers: () => void }) {
  const { isAdmin } = useLeagueCtx();
  const next = nextSocialRound(cfg, []);
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
        {cfg.players.length} jugadores en {cfg.courts.length} {cfg.courts.length === 1 ? 'cancha' : 'canchas'}, {gameText(cfg.game).toLowerCase()}, {cfg.rounds} rondas.{' '}
        {cfg.mixed ? 'Cada pareja con uno de cada grupo.' : 'Las parejas rotan sin repetir compañero.'}
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

/** La ronda de ahora: una tarjeta por cancha; anotar en la cancha o poner el marcador del juego. */
function RoundCourts({ cfg, round, onOpen, onScore }: { cfg: SocialConfig; round: NightRound; onOpen: (id: string) => void; onScore: (id: string) => void }) {
  const { lid, league, isAdmin, member } = useLeagueCtx();
  const names = useNames();
  const mySideOf = useMySide();
  const [typing, setTyping] = useState<Match | null>(null);
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
      {typing && (
        <ResultEntryModal
          open
          onClose={() => setTyping(null)}
          lid={lid}
          match={typing}
          parser={gameParser(cfg.game)}
          title={`Marcador de ${typing.court || 'la cancha'}`}
          placeholder={`${cfg.game.to}-7`}
          examples={[`${cfg.game.to}-9`, `${cfg.game.to}-5`]}
          hint={`Los puntos de cada lado. ${gameText(cfg.game)}.`}
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

function Podium({ table, nameOf, share }: { table: ReturnType<typeof socialTable>; nameOf: (id: string) => string; share: string }) {
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
            <span className="font-bold tabular-nums">
              {r.won} G <span className="text-sm font-medium text-muted">({signed(r.diff)})</span>
            </span>
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

function PlayersTab({ cfg, onEdit }: { cfg: SocialConfig; onEdit?: () => void }) {
  const names = useNames();
  const { levels, scale } = useLevels();
  return (
    <>
      {cfg.players.length ? (
        <Card className="divide-y divide-line overflow-hidden">
          {cfg.players.map((id) => (
            <div key={id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate font-medium">{names.nameOf(id)}</span>
              {cfg.mixed && <Badge tone="neutral">Grupo {cfg.mixed.includes(id) ? 'A' : 'B'}</Badge>}
              {levels[id] != null && <Badge tone="neutral">{levelText(levels[id], scale)}</Badge>}
            </div>
          ))}
        </Card>
      ) : (
        <Empty title="Sin jugadores" />
      )}
      {onEdit && (
        <Button className="h-11" icon={<Users className="size-4" />} onClick={onEdit}>
          Cambiar jugadores
        </Button>
      )}
    </>
  );
}

function SettingsModal({ open, cfg, busy, onClose, onSave }: { open: boolean; cfg: SocialConfig; busy: boolean; onClose: () => void; onSave: (c: SocialConfig) => void }) {
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
      title="Ajustes del round robin"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={() =>
              onSave(
                changedPlan
                  ? { ...draft, courts: draft.courts.map((c, i) => c.trim() || `Cancha ${i + 1}`), plan: undefined, planPlayers: undefined, planFrom: undefined }
                  : draft,
              )
            }
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <NightFields value={draft} onChange={(c) => setDraft({ ...draft, courts: c.courts })} parts={['courts']} />
        <Stepper label="Rondas" value={draft.rounds} min={1} max={30} onChange={(rounds) => setDraft({ ...draft, rounds })} />
        <GameFields value={draft.game} onChange={(game) => setDraft({ ...draft, game })} />
        <p className="text-xs text-muted">Los cambios valen desde la ronda que sigue. Los juegos ya creados se quedan como están.</p>
      </div>
    </Modal>
  );
}

function PlayersModal({ open, cfg, busy, onClose, onSave }: { open: boolean; cfg: SocialConfig; busy: boolean; onClose: () => void; onSave: (c: SocialConfig) => void }) {
  const { levels } = useLevels();
  const [players, setPlayers] = useState(cfg.players);
  const [mixed, setMixed] = useState(cfg.mixed);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setPlayers(cfg.players);
      setMixed(cfg.mixed);
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Jugadores del round robin"
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
              onSave({ ...cfg, players, levels: lv, mixed: mixed ? mixed.filter((p) => players.includes(p)) : null });
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
        <MixedGroups players={players} value={mixed} onChange={setMixed} />
      </div>
    </Modal>
  );
}
