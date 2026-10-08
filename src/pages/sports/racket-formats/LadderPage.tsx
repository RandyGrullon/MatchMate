import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowDown, ArrowUp, Check, ChevronsUp, Clock, ListOrdered, LogIn, LogOut, Settings2, Swords, Trash2, X } from 'lucide-react';
import { deleteEvent } from '../../../lib/data';
import { useMatches, type Match } from '../../../lib/data/matches';
import { updateRacketEvent, useWithPendingPoints, type RacketEvent } from '../../../lib/data/racket';
import { useLeagueCtx } from '../../../lib/league';
import { useNow } from '../../../lib/useNow';
import { useBusy } from '../../../components/busy';
import { useFeedback, saveErrorMessage, useAction } from '../../../components/feedback';
import { MatchCard } from '../../../components/match';
import { MatchStatus } from '../../../components/match/MatchCard';
import { useIsPro } from '../../../components/mode';
import { NoticeSlot } from '../../../components/NoticeSlot';
import { PosNum, TuTag } from '../../../components/ranking/parts';
import { Button, Card, Empty, Field, Input, ListRow, ListSkeleton, LoadError, SectionHeader, Sheet, cx } from '../../../components/ui';
import { PickList } from '../racket/bits';
import { ScreenHead, useEventBack, type RacketMenuItem } from '../racket/frame';
import { levelText, useLevels } from '../racket/levels';
import { todayIn, zonedIso } from '../racket/logic/time';
import { MatchDetail, useMatchParam, useMySide } from '../racket/match/MatchDetail';
import { SaveFooter } from '../racket/night/parts';
import { useNames } from '../racket/names';
import { courtWords, useRacket } from '../racket/sport';
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
 * La escalera (rediseño «Calma y foco»): «‹ Tenis del sábado» con «•••», el título y «8 jugadores · retas hasta 3
 * arriba». Arriba «Tu puesto» en grande con a quién puedes retar (o tu reto abierto con su plazo: aceptar, cancelar,
 * anotar el partido); debajo los puestos (el mío resaltado, «Retar» en los que se puede), los retos abiertos de todos y
 * los últimos resultados. Al abrir se aplican los plazos vencidos (W.O. a favor del retador) y los resultados que cuentan a
 * las 48 h. El admin ordena, agrega y saca participantes, cambia las reglas y cancela retos («•••»).
 */
export function LadderPage({ event }: { event: RacketEvent }) {
  const { lid, base, isAdmin, myPlayerId, member } = useLeagueCtx();
  const names = useNames();
  const param = useMatchParam();
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const run = useAction();
  // Retar, cancelar un reto, entrar o salir: la ruedita en el botón que se tocó.
  const pending = useBusy();
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
  const pro = useIsPro();
  const back = useEventBack();
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

  if (param.id) return <MatchDetail matchId={param.id} eventId={event.id} title={`${title} · Reto`} backLabel={title} onBack={param.close} />;
  if (rungs.error) return <LoadError error={rungs.error} />;

  const challenge = async (target: string, key: string) => {
    const err = me ? whyNot(order, me, target, all, cfg.maxUp) : 'No estás en la escalera.';
    if (err) {
      toast(err, 'error');
      return;
    }
    if (!(await confirm({ title: `¿Retar a ${names.entrantName(target)}?`, message: `Tiene ${cfg.acceptDays} días para aceptar y juegan antes de ${cfg.playDays} días. Si no, ganas por W.O.`, confirmText: 'Retar' }))) return;
    await pending.run(key, () => run(() => createChallenge(lid, event.id, target), 'Reto enviado: le llegó el aviso'));
  };

  const cancel = async (c: LadderChallenge) => {
    if (!(await confirm({ title: '¿Cancelar el reto?', message: 'Su partido se anula. La escalera no cambia.', confirmText: 'Cancelar el reto', danger: true }))) return;
    await pending.run(`cancelar:${c.id}`, () => run(() => cancelChallenge(lid, event.id, c.id), 'Reto cancelado'));
  };

  const leave = async () => {
    if (!me) return;
    if (await confirm({ title: '¿Salir de la escalera?', message: 'Pierdes tu puesto. Tus retos abiertos se cancelan.', confirmText: 'Salir', danger: true }))
      await pending.run('salir', () => run(() => leaveLadder(lid, event.id, me), 'Saliste de la escalera'));
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
  const unit = cfg.doubles ? 'parejas' : 'jugadores';
  const meta = [
    `${order.length} ${unit}`,
    `retas hasta ${cfg.maxUp} ${cfg.maxUp === 1 ? 'puesto' : 'puestos'} arriba`,
    pro ? `${cfg.acceptDays} días para aceptar y ${cfg.playDays} para jugar` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const menu: RacketMenuItem[] = [
    ...(isAdmin
      ? [
          { key: 'orden', icon: ListOrdered, label: 'Ordenar y agregar', hint: 'Subir, bajar, sacar o sumar a alguien', onClick: () => setEditing('orden') },
          { key: 'reglas', icon: Settings2, label: 'Reglas de la escalera', hint: 'Hasta dónde se reta y los plazos', onClick: () => setEditing('ajustes') },
        ]
      : []),
    ...(me && !isAdmin ? [{ key: 'salir', icon: LogOut, label: 'Salir de la escalera', onClick: () => void leave(), busy: pending.isBusy('salir'), danger: true }] : []),
    ...(isAdmin ? [{ key: 'borrar', icon: Trash2, label: 'Borrar la escalera', onClick: () => void remove(), danger: true }] : []),
  ];
  const pos = me ? order.indexOf(me) + 1 : 0;

  return (
    <div className="flex flex-col px-2">
      <ScreenHead back={back} title={title} meta={meta} menu={menu} />

      {me ? (
        <Card soft className="mt-[22px] px-5 pt-[18px] pb-5">
          <div className="flex items-center gap-[18px]">
            <b className="num shrink-0 text-[54px] leading-none font-[650] text-accent">{pos}.º</b>
            <div className="min-w-0">
              <p className="text-[17px] font-[650] tracking-[-0.01em]">Tu puesto</p>
              <p className="truncate text-[14.5px] text-fg-2">{names.entrantName(me)}</p>
            </div>
          </div>
          {myOpen ? (
            <ChallengeCard c={myOpen} me={me} match={myOpen.matchId ? matchById.get(myOpen.matchId) : undefined} now={now} onOpen={param.open} onAccept={setAccepting} onCancel={cancel} busy={pending.isBusy} className="mt-4" />
          ) : targets.length ? (
            <div className="mt-4 flex flex-col gap-2">
              <p className="text-[15px] font-semibold">Puedes retar a:</p>
              {targets.map((t) => (
                <Button
                  key={t}
                  variant="primary"
                  size={pro ? 'lg' : 'xl'}
                  className="w-full justify-start"
                  icon={<Swords className="size-5" />}
                  loading={pending.isBusy(`retar:${t}`)}
                  disabled={pending.isBusy()}
                  onClick={() => void challenge(t, `retar:${t}`)}
                >
                  {order.indexOf(t) + 1}.º {names.entrantName(t)}
                </Button>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-meta text-fg-2">{pos === 1 ? 'Eres el 1.º: te toca defender el puesto.' : 'Los de arriba tienen retos abiertos: vuelve en unos días.'}</p>
          )}
        </Card>
      ) : canJoin ? (
        <Card className="mt-[22px] px-5 pt-[18px] pb-5">
          <p className="text-card-title-pro">No estás en la escalera</p>
          <p className="mt-1.5 text-meta text-fg-2">Entras abajo del todo y de ahí retas hacia arriba.</p>
          <Button
            variant="primary"
            size="xl"
            className="mt-4 w-full"
            icon={<LogIn className="size-5" />}
            loading={pending.isBusy('entrar')}
            disabled={pending.isBusy()}
            onClick={() => void pending.run('entrar', () => run(() => joinLadder(lid, event.id), 'Ya estás en la escalera'))}
          >
            Entrar a la escalera
          </Button>
        </Card>
      ) : null}

      <section className="mt-[30px]" aria-labelledby="escalera-puestos">
        <SectionHeader id="escalera-puestos" title="Puestos" />
        {rungs.loading && !order.length ? (
          <ListSkeleton rows={4} />
        ) : order.length ? (
          <Card className="overflow-hidden">
            {order.map((id, i) => {
              const lv = entrantLevel(names.entrant(id), levels);
              const canHit = targets.includes(id) && !myOpen;
              const isMe = mine.includes(id);
              const sub = [cfg.doubles ? names.rosterOf(id).map(names.nameOf).join(' / ') : null, pro && lv != null ? levelText(lv, scale) : null].filter(Boolean).join(' · ');
              return (
                <ListRow
                  key={id}
                  me={isMe}
                  dense={pro}
                  leading={<PosNum pos={i + 1} />}
                  title={
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">{names.entrantName(id)}</span>
                      {isMe && <TuTag />}
                    </span>
                  }
                  subtitle={sub || undefined}
                  trailing={
                    canHit ? (
                      <Button variant="soft" className="h-10 rounded-full px-4" loading={pending.isBusy(`fila:${id}`)} disabled={pending.isBusy()} onClick={() => void challenge(id, `fila:${id}`)}>
                        Retar
                      </Button>
                    ) : busyIds.has(id) ? (
                      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted">
                        <Swords aria-hidden="true" className="size-3.5" /> En reto
                      </span>
                    ) : undefined
                  }
                />
              );
            })}
          </Card>
        ) : (
          <Empty icon={<ChevronsUp className="size-8" />} title="La escalera está vacía">
            {isAdmin ? 'En «•••», «Ordenar y agregar» pone a los primeros.' : cfg.open ? 'Entra tú primero.' : 'El admin pone a los participantes.'}
          </Empty>
        )}
      </section>

      {open.length > 0 && (
        <section className="mt-[30px]" aria-labelledby="escalera-retos">
          <SectionHeader id="escalera-retos" title={`Retos abiertos (${open.length})`} />
          <div className="flex flex-col gap-2.5">
            {open.map((c) => (
              <ChallengeCard key={c.id} c={c} me={me} match={c.matchId ? matchById.get(c.matchId) : undefined} now={now} onOpen={param.open} onAccept={setAccepting} onCancel={cancel} busy={pending.isBusy} card />
            ))}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="mt-[30px]" aria-labelledby="escalera-ultimos">
          <SectionHeader id="escalera-ultimos" title="Últimos retos" />
          <Card className="overflow-hidden">
            {recent.map((c) => (
              <ListRow
                key={c.id}
                dense={pro}
                onClick={c.matchId ? () => param.open(c.matchId!) : undefined}
                title={`${names.entrantName(c.challenger)} retó a ${names.entrantName(c.challenged)}`}
                subtitle={outcomeText(c, names.entrantName)}
              />
            ))}
          </Card>
        </section>
      )}

      <NoticeSlot className="mt-4" />

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
  busy,
  card,
  className,
}: {
  c: LadderChallenge;
  me: string | null;
  match: Match | undefined;
  now: number;
  onOpen: (id: string) => void;
  onAccept: (c: LadderChallenge) => void;
  onCancel: (c: LadderChallenge) => void;
  /** Sin clave: si hay algo guardándose; con clave: si es eso (cancelar este reto). */
  busy: (key?: string) => boolean;
  /** En su propia tarjeta (la lista de retos); si no, va dentro de «Tu puesto». */
  card?: boolean;
  className?: string;
}) {
  const { isAdmin, league } = useLeagueCtx();
  const names = useNames();
  const mySideOf = useMySide();
  const iChallenged = me === c.challenger;
  const iAmChallenged = me === c.challenged;
  const late = overdue(c, now);
  const body = (
    <>
      <div className="flex items-start gap-2.5">
        <Swords aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent" />
        <p className="min-w-0 flex-1 text-[15px]">
          <b>{names.entrantName(c.challenger)}</b>
          {c.challengerPos ? ` (${c.challengerPos}.º)` : ''} retó a <b>{names.entrantName(c.challenged)}</b>
          {c.challengedPos ? ` (${c.challengedPos}.º)` : ''}
        </p>
        <MatchStatus label={STATUS_TEXT[c.status]} tone={c.status === 'pending' ? 'warn' : 'neutral'} />
      </div>
      <p className={cx('mt-1.5 flex items-center gap-1.5 text-[13px]', late ? 'font-semibold text-danger' : 'text-muted')}>
        <Clock aria-hidden="true" className="size-3.5" /> {late ? 'Se venció el plazo: gana el retador por W.O.' : deadlineText(c, now)}
      </p>
      {match && match.status !== 'scheduled' && <MatchCard match={match} mySide={mySideOf(match)} onClick={() => onOpen(match.id)} tz={league.tz} now={now} roundWord="Reto" className="mt-3" />}
      <div className="mt-3.5 flex flex-wrap gap-2.5">
        {c.status === 'pending' && (iAmChallenged || isAdmin) && (
          <Button variant="primary" size="lg" className="flex-1" icon={<Check className="size-4" />} onClick={() => onAccept(c)}>
            Aceptar
          </Button>
        )}
        {c.matchId && (
          <Button variant="quiet" size="lg" className={cx('flex-1', !card && 'bg-surface')} onClick={() => onOpen(c.matchId!)}>
            {iChallenged || iAmChallenged ? 'Anotar o ver el partido' : 'Ver el partido'}
          </Button>
        )}
        {((c.status === 'pending' && iChallenged) || isAdmin) && (
          <Button variant="ghost" className="h-12 rounded-[15px]" icon={<X className="size-4" />} loading={busy(`cancelar:${c.id}`)} disabled={busy()} onClick={() => onCancel(c)}>
            Cancelar
          </Button>
        )}
      </div>
    </>
  );
  return card ? <Card className={cx('px-5 pt-4 pb-[18px]', className)}>{body}</Card> : <div className={className}>{body}</div>;
}

/** Aceptar un reto: fecha, hora y dónde (se puede dejar para después). */
export function AcceptModal({ c, eventId, onClose }: { c: LadderChallenge; eventId: string; onClose: () => void }) {
  const { lid, league } = useLeagueCtx();
  const names = useNames();
  // «Cancha» o, en ping pong, «Mesa».
  const w = courtWords(useRacket().ext);
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
    <Sheet
      open
      onClose={onClose}
      title={`Aceptar el reto de ${names.entrantName(c.challenger)}`}
      subtitle="Cuándo y dónde (se puede dejar para después)"
      footer={<SaveFooter onClose={onClose} busy={busy} onSave={() => void accept()} label="Aceptar el reto" />}
    >
      <div className="flex flex-col gap-3 pb-1">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Hora">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <Field label={w.One}>
          <Input value={court} maxLength={40} onChange={(e) => setCourt(e.target.value)} placeholder={`${w.One} 2`} />
        </Field>
      </div>
    </Sheet>
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
    <Sheet open onClose={onClose} title="Ordenar y agregar" subtitle="Quien sale pierde su puesto y sus retos" footer={<SaveFooter onClose={onClose} busy={busy} onSave={() => void save()} />}>
      <div className="flex flex-col gap-4 pb-1">
        {list.length > 0 && (
          <Card className="overflow-hidden">
            {list.map((id, i) => (
              <div key={id} className="mm-row relative flex min-h-12 items-center gap-1 pr-1.5 pl-4">
                <span className="w-6 text-center text-sm font-semibold text-muted tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{names.entrantName(id)}</span>
                <Button variant="ghost" className="size-11 rounded-full" icon={<ArrowUp className="size-4" />} aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)} />
                <Button variant="ghost" className="size-11 rounded-full" icon={<ArrowDown className="size-4" />} aria-label="Bajar" disabled={i === list.length - 1} onClick={() => move(i, 1)} />
                <Button variant="ghost" className="size-11 rounded-full text-faint" icon={<X className="size-4" />} aria-label={`Sacar a ${names.entrantName(id)}`} onClick={() => setList(list.filter((x) => x !== id))} />
              </div>
            ))}
          </Card>
        )}
        <p className="text-[15px] font-semibold">Agregar (entran abajo)</p>
        <PickList items={items} selected={new Set()} onToggle={(id) => setList([...list, id])} empty={cfg.doubles ? 'No quedan parejas por agregar.' : 'No quedan jugadores por agregar.'} />
      </div>
    </Sheet>
  );
}

function SettingsModal({ cfg, busy, onClose, onSave }: { cfg: LadderConfig; busy: boolean; onClose: () => void; onSave: (c: LadderConfig) => void }) {
  const [draft, setDraft] = useState(cfg);
  return (
    <Sheet open onClose={onClose} title="Reglas de la escalera" subtitle="Los plazos nuevos valen para los retos que siguen" footer={<SaveFooter onClose={onClose} busy={busy} onSave={() => onSave(draft)} />}>
      <div className="pb-1">
        <LadderFields value={draft} onChange={setDraft} />
      </div>
    </Sheet>
  );
}
