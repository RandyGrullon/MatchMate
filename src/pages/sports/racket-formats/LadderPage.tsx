import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowDown, ArrowUp, Check, ChevronsUp, Clock, ListOrdered, LogIn, Settings2, Swords, Trash2, X } from 'lucide-react';
import { deleteEvent } from '../../../lib/data';
import { useMatches, type Match } from '../../../lib/data/matches';
import { updateRacketEvent, useWithPendingPoints, type RacketEvent } from '../../../lib/data/racket';
import { useLeagueCtx } from '../../../lib/league';
import { useNow } from '../../../lib/useNow';
import { useFeedback, saveErrorMessage, useAction } from '../../../components/feedback';
import { MatchCard } from '../../../components/match';
import { Badge, Button, Card, Empty, Field, Input, ListSkeleton, LoadError, Modal, Position, cx } from '../../../components/ui';
import { BackLink } from '../../../components/BackLink';
import { PickList, Section } from '../racket/bits';
import { levelText, useLevels } from '../racket/levels';
import { todayIn, zonedIso } from '../racket/logic/time';
import { MatchDetail, useMatchParam, useMySide } from '../racket/match/MatchDetail';
import { useNames } from '../racket/names';
import { acceptChallenge, cancelChallenge, createChallenge, joinLadder, leaveLadder, setLadder, syncLadder, useLadderChallenges, useLadderRungs } from './data';
import { entrantLevel } from './logic/box';
import {
  STATUS_TEXT,
  busy as busyOf,
  deadlineText,
  isOpenChallenge,
  ladderConfigJson,
  ladderOrder,
  myEntrants,
  outcomeText,
  overdue,
  parseLadderConfig,
  targetsFor,
  whyNot,
  type LadderChallenge,
  type LadderConfig,
} from './logic/ladder';
import { LadderFields } from './LadderForm';

/**
 * La escalera: los puestos (el mío resaltado), a quién puedo retar (hasta K arriba), mi reto abierto con su
 * plazo (aceptar, cancelar, anotar el partido), los retos abiertos de todos y los últimos resultados. Al abrir se
 * aplican los plazos vencidos (W.O. a favor del retador) y los resultados que cuentan a las 48 h. El admin ordena,
 * agrega y saca participantes, cambia las reglas y cancela retos.
 */
export function LadderPage({ event }: { event: RacketEvent }) {
  const { lid, base, isAdmin, league, myPlayerId, member } = useLeagueCtx();
  const names = useNames();
  const param = useMatchParam();
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const run = useAction();
  const now = useNow(60_000).getTime();
  const cfg = useMemo(() => parseLadderConfig(event.config), [event.config]);
  const rungs = useLadderRungs(lid, event.id);
  const challenges = useLadderChallenges(lid, event.id);
  const q = useMatches({ lid, eventId: event.id });
  const matches = useWithPendingPoints(lid, q.data);
  const { levels, scale } = useLevels();
  const [editing, setEditing] = useState<null | 'orden' | 'ajustes'>(null);
  const [accepting, setAccepting] = useState<LadderChallenge | null>(null);
  const [saving, setSaving] = useState(false);
  const title = event.name || 'Escalera';

  // Al abrir: plazos vencidos y resultados que ya cuentan (como mucho cada 5 minutos por escalera).
  useEffect(() => {
    if (!member) return;
    void syncLadder(lid, event.id).catch((e) => console.warn(e));
  }, [lid, event.id, member]);

  const order = useMemo(() => ladderOrder(rungs.data), [rungs.data]);
  const all = challenges.data;
  const open = all.filter(isOpenChallenge);
  const busyIds = busyOf(all);
  const mine = myEntrants(order, myPlayerId, names.teamsOf(myPlayerId));
  const me = mine[0] ?? null;
  const myOpen = me ? (open.find((c) => c.challenger === me || c.challenged === me) ?? null) : null;
  const targets = me ? targetsFor(order, me, all, cfg.maxUp) : [];
  const matchById = new Map(matches.map((m) => [m.id, m] as const));
  const canJoin = !me && cfg.open && !!myPlayerId && (!cfg.doubles || names.teamsOf(myPlayerId).length === 1);

  if (param.id) return <MatchDetail matchId={param.id} eventId={event.id} title={`${title} · Reto`} onBack={param.close} />;
  if (rungs.error) return <LoadError error={rungs.error} />;

  const challenge = async (target: string) => {
    const err = me ? whyNot(order, me, target, all, cfg.maxUp) : 'No estás en la escalera.';
    if (err) {
      toast(err, 'error');
      return;
    }
    if (!(await confirm({ title: `¿Retar a ${names.entrantName(target)}?`, message: `Tiene ${cfg.acceptDays} días para aceptar y juegan antes de ${cfg.playDays} días. Si no, ganas por W.O.`, confirmText: 'Retar' }))) return;
    await run(() => createChallenge(lid, event.id, target), 'Reto enviado: le llegó el aviso');
  };

  const cancel = async (c: LadderChallenge) => {
    if (!(await confirm({ title: '¿Cancelar el reto?', message: 'Su partido se anula. La escalera no cambia.', confirmText: 'Cancelar el reto', danger: true }))) return;
    await run(() => cancelChallenge(lid, event.id, c.id), 'Reto cancelado');
  };

  const saveConfig = async (next: LadderConfig) => {
    setSaving(true);
    try {
      await updateRacketEvent(lid, event.id, { config: ladderConfigJson(next) });
      toast('Guardado');
      setEditing(null);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: `¿Borrar ${title}?`, message: 'Se borran los puestos, los retos y sus partidos. No se puede deshacer.', confirmText: 'Borrar', danger: true }))) return;
    navigate(base);
    try {
      await deleteEvent(lid, event.id);
      toast('Escalera borrada');
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    }
  };

  const recent = all.filter((c) => !isOpenChallenge(c)).slice(0, 10);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        {league.kind !== 'torneo' && <BackLink fallback={base} className="mt-1" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>
            <Badge tone="accent">{cfg.doubles ? 'Escalera de dobles' : 'Escalera'}</Badge>
          </div>
          <p className="text-sm text-muted">
            {order.length} {cfg.doubles ? 'parejas' : 'jugadores'} · se reta hasta {cfg.maxUp} {cfg.maxUp === 1 ? 'puesto' : 'puestos'} arriba · {cfg.acceptDays} días para aceptar y{' '}
            {cfg.playDays} para jugar
          </p>
        </div>
      </div>

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<ListOrdered className="size-4" />} onClick={() => setEditing('orden')}>
            Ordenar y agregar
          </Button>
          <Button size="sm" icon={<Settings2 className="size-4" />} onClick={() => setEditing('ajustes')}>
            Reglas
          </Button>
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => void remove()}>
            Borrar
          </Button>
        </div>
      )}

      {me ? (
        <Card className="flex flex-col gap-3 border-accent/50 bg-accent-soft/40 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-xl font-black text-accent-fg tabular-nums">{order.indexOf(me) + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-accent">Tu puesto</p>
              <p className="truncate text-lg font-bold">{names.entrantName(me)}</p>
            </div>
          </div>
          {myOpen ? (
            <ChallengeCard c={myOpen} me={me} match={myOpen.matchId ? matchById.get(myOpen.matchId) : undefined} now={now} onOpen={param.open} onAccept={setAccepting} onCancel={cancel} />
          ) : targets.length ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Puedes retar a:</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {targets.map((t) => (
                  <Button key={t} variant="primary" className="h-12 justify-start" icon={<Swords className="size-5" />} onClick={() => void challenge(t)}>
                    <span className="truncate">
                      {order.indexOf(t) + 1}.º {names.entrantName(t)}
                    </span>
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">{order.indexOf(me) === 0 ? 'Eres el 1.º: te toca defender el puesto.' : 'Los de arriba tienen retos abiertos: vuelve en unos días.'}</p>
          )}
        </Card>
      ) : canJoin ? (
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-sm">No estás en la escalera. Entras abajo del todo y de ahí retas hacia arriba.</p>
          <Button variant="primary" className="h-12 text-base" icon={<LogIn className="size-5" />} onClick={() => void run(() => joinLadder(lid, event.id), 'Ya estás en la escalera')}>
            Entrar a la escalera
          </Button>
        </Card>
      ) : null}

      <Section title="Puestos">
        {rungs.loading && !order.length ? (
          <ListSkeleton rows={4} />
        ) : order.length ? (
          <Card className="divide-y divide-line overflow-hidden">
            {order.map((id, i) => {
              const lv = entrantLevel(names.entrant(id), levels);
              const canHit = targets.includes(id) && !myOpen;
              return (
                <div key={id} className={cx('flex min-h-14 items-center gap-3 px-4 py-2', mine.includes(id) && 'bg-accent-soft/50')}>
                  <Position pos={i + 1} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{names.entrantName(id)}</span>
                    {cfg.doubles && <span className="block truncate text-xs text-muted">{names.rosterOf(id).map(names.nameOf).join(' / ')}</span>}
                  </span>
                  {lv != null && <span className="hidden text-xs text-muted sm:inline">{levelText(lv, scale)}</span>}
                  {mine.includes(id) && <Badge tone="accent">Tú</Badge>}
                  {busyIds.has(id) && (
                    <Badge tone="warn">
                      <Swords className="size-3" /> En reto
                    </Badge>
                  )}
                  {canHit && (
                    <Button size="sm" variant="primary" className="h-9" onClick={() => void challenge(id)}>
                      Retar
                    </Button>
                  )}
                </div>
              );
            })}
          </Card>
        ) : (
          <Empty icon={<ChevronsUp className="size-8" />} title="La escalera está vacía">
            {isAdmin ? 'Toca «Ordenar y agregar» para poner a los primeros.' : cfg.open ? 'Entra tú primero.' : 'El admin pone a los participantes.'}
          </Empty>
        )}
      </Section>

      {open.length > 0 && (
        <Section title={`Retos abiertos (${open.length})`}>
          <div className="flex flex-col gap-2">
            {open.map((c) => (
              <ChallengeCard key={c.id} c={c} me={me} match={c.matchId ? matchById.get(c.matchId) : undefined} now={now} onOpen={param.open} onAccept={setAccepting} onCancel={cancel} />
            ))}
          </div>
        </Section>
      )}

      {recent.length > 0 && (
        <Section title="Últimos retos">
          <Card className="divide-y divide-line overflow-hidden">
            {recent.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={!c.matchId}
                onClick={() => c.matchId && param.open(c.matchId)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-2 disabled:hover:bg-transparent"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {names.entrantName(c.challenger)} retó a {names.entrantName(c.challenged)}
                  </span>
                  <span className="block truncate text-xs text-muted">{outcomeText(c, names.entrantName)}</span>
                </span>
                <Badge tone={c.status === 'cancelled' ? 'neutral' : c.winner === c.challenger ? 'ok' : 'accent'}>{STATUS_TEXT[c.status]}</Badge>
              </button>
            ))}
          </Card>
        </Section>
      )}

      {me && isAdmin === false && (
        <Button
          variant="ghost"
          className="self-start text-muted"
          onClick={async () => {
            if (await confirm({ title: '¿Salir de la escalera?', message: 'Pierdes tu puesto. Tus retos abiertos se cancelan.', confirmText: 'Salir', danger: true }))
              await run(() => leaveLadder(lid, event.id, me), 'Saliste de la escalera');
          }}
        >
          Salir de la escalera
        </Button>
      )}

      {accepting && <AcceptModal c={accepting} onClose={() => setAccepting(null)} eventId={event.id} />}
      {editing === 'orden' && <OrderModal cfg={cfg} order={order} onClose={() => setEditing(null)} eventId={event.id} />}
      {editing === 'ajustes' && <SettingsModal cfg={cfg} busy={saving} onClose={() => setEditing(null)} onSave={(c) => void saveConfig(c)} />}
    </div>
  );
}

/** Un reto abierto: quién retó a quién, plazo y lo que puedo hacer (aceptar, cancelar, ver o anotar el partido). */
function ChallengeCard({
  c,
  me,
  match,
  now,
  onOpen,
  onAccept,
  onCancel,
}: {
  c: LadderChallenge;
  me: string | null;
  match: Match | undefined;
  now: number;
  onOpen: (id: string) => void;
  onAccept: (c: LadderChallenge) => void;
  onCancel: (c: LadderChallenge) => void;
}) {
  const { isAdmin, league } = useLeagueCtx();
  const names = useNames();
  const mySideOf = useMySide();
  const iChallenged = me === c.challenger;
  const iAmChallenged = me === c.challenged;
  const late = overdue(c, now);
  return (
    <Card className="flex flex-col gap-2 p-3">
      <div className="flex items-start gap-2">
        <Swords className="mt-0.5 size-5 shrink-0 text-accent" />
        <p className="min-w-0 flex-1 text-sm">
          <b>{names.entrantName(c.challenger)}</b>
          {c.challengerPos ? ` (${c.challengerPos}.º)` : ''} retó a <b>{names.entrantName(c.challenged)}</b>
          {c.challengedPos ? ` (${c.challengedPos}.º)` : ''}
        </p>
        <Badge tone={c.status === 'pending' ? 'warn' : 'ok'}>{STATUS_TEXT[c.status]}</Badge>
      </div>
      <p className={cx('flex items-center gap-1.5 text-xs', late ? 'text-danger' : 'text-muted')}>
        <Clock className="size-3.5" /> {late ? 'Se venció el plazo: gana el retador por W.O.' : deadlineText(c, now)}
      </p>
      {match && match.status !== 'scheduled' && <MatchCard match={match} mySide={mySideOf(match)} onClick={() => onOpen(match.id)} tz={league.tz} now={now} roundWord="Reto" />}
      <div className="flex flex-wrap gap-2">
        {c.status === 'pending' && (iAmChallenged || isAdmin) && (
          <Button variant="primary" className="h-11 flex-1" icon={<Check className="size-4" />} onClick={() => onAccept(c)}>
            Aceptar
          </Button>
        )}
        {c.matchId && (
          <Button className="h-11 flex-1" onClick={() => onOpen(c.matchId!)}>
            {iChallenged || iAmChallenged ? 'Anotar o ver el partido' : 'Ver el partido'}
          </Button>
        )}
        {((c.status === 'pending' && iChallenged) || isAdmin) && (
          <Button variant="ghost" className="h-11" icon={<X className="size-4" />} onClick={() => onCancel(c)}>
            Cancelar
          </Button>
        )}
      </div>
    </Card>
  );
}

function AcceptModal({ c, eventId, onClose }: { c: LadderChallenge; eventId: string; onClose: () => void }) {
  const { lid, league } = useLeagueCtx();
  const names = useNames();
  const { toast } = useFeedback();
  const [date, setDate] = useState(todayIn(league.tz));
  const [time, setTime] = useState('');
  const [court, setCourt] = useState('');
  const [busy, setBusy] = useState(false);
  const accept = async () => {
    setBusy(true);
    try {
      const at = date && time ? zonedIso(date, time, league.tz) : null;
      const status = await acceptChallenge(lid, eventId, c.id, { scheduledAt: at, court });
      toast(status === 'accepted' ? 'Reto aceptado: a jugar' : 'Ese reto ya se cerró (se venció el plazo).', status === 'accepted' ? undefined : 'error');
      onClose();
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Aceptar el reto de ${names.entrantName(c.challenger)}`}
      footer={
        <>
          <Button onClick={onClose}>Atrás</Button>
          <Button variant="primary" loading={busy} onClick={() => void accept()}>
            Aceptar el reto
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">Si ya saben cuándo y dónde juegan, ponlo (se puede dejar para después).</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Hora">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <Field label="Cancha">
          <Input value={court} maxLength={40} onChange={(e) => setCourt(e.target.value)} placeholder="Cancha 2" />
        </Field>
      </div>
    </Modal>
  );
}

/** Admin: el orden (subir, bajar, sacar) y agregar participantes. */
function OrderModal({ cfg, order, eventId, onClose }: { cfg: LadderConfig; order: string[]; eventId: string; onClose: () => void }) {
  const { lid } = useLeagueCtx();
  const names = useNames();
  const { toast } = useFeedback();
  const [list, setList] = useState(order);
  const [busy, setBusy] = useState(false);
  const items = (cfg.doubles ? names.teams.map((t) => ({ id: t.id, name: t.name })) : names.players.map((p) => ({ id: p.id, name: p.name }))).filter((x) => !list.includes(x.id));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };
  const save = async () => {
    setBusy(true);
    try {
      await setLadder(lid, eventId, list);
      toast('Escalera guardada');
      onClose();
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      wide
      title="Ordenar y agregar"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">Quien saques pierde su puesto y sus retos abiertos se cancelan.</p>
        {list.length > 0 && (
          <Card className="divide-y divide-line overflow-hidden">
            {list.map((id, i) => (
              <div key={id} className="flex items-center gap-2 px-3 py-1.5">
                <span className="w-6 text-right text-xs text-muted tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{names.entrantName(id)}</span>
                <Button size="sm" variant="ghost" icon={<ArrowUp className="size-4" />} aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)} />
                <Button size="sm" variant="ghost" icon={<ArrowDown className="size-4" />} aria-label="Bajar" disabled={i === list.length - 1} onClick={() => move(i, 1)} />
                <Button size="sm" variant="ghost" icon={<X className="size-4" />} aria-label={`Sacar a ${names.entrantName(id)}`} onClick={() => setList(list.filter((x) => x !== id))} />
              </div>
            ))}
          </Card>
        )}
        <p className="text-sm font-semibold">Agregar (entran abajo)</p>
        <PickList items={items} selected={new Set()} onToggle={(id) => setList([...list, id])} empty={cfg.doubles ? 'No quedan parejas por agregar.' : 'No quedan jugadores por agregar.'} />
      </div>
    </Modal>
  );
}

function SettingsModal({ cfg, busy, onClose, onSave }: { cfg: LadderConfig; busy: boolean; onClose: () => void; onSave: (c: LadderConfig) => void }) {
  const [draft, setDraft] = useState(cfg);
  return (
    <Modal
      open
      onClose={onClose}
      title="Reglas de la escalera"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={() => onSave(draft)}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <LadderFields value={draft} onChange={setDraft} />
        <p className="text-xs text-muted">Los plazos nuevos valen para los retos que se creen de aquí en adelante.</p>
      </div>
    </Modal>
  );
}
