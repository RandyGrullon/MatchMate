/**
 * La escalera (LadderPage.tsx de la web, con su misma lógica: racket-formats/logic/ladder.ts y data.ts): «Tu puesto» en
 * grande con a quién puedes retar (o tu reto abierto con su plazo: aceptar, cancelar, anotar el partido); los puestos (el
 * mío resaltado, «Retar» en los que se puede), los retos abiertos de todos y los últimos resultados. Al abrir se aplican
 * los plazos vencidos (W.O. a favor del retador) y los resultados que cuentan a las 48 h. Quien organiza ordena, agrega y
 * saca participantes, cambia las reglas y cancela retos («•••»).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowDown, ArrowUp, Check, ChevronsUp, Clock, ListOrdered, LogIn, LogOut, Settings2, Swords, Trash2, X } from 'lucide-react-native';
import { useMatches, type Match } from '@mm/lib/data/matches';
import { updateRacketEvent, useWithPendingPoints, type RacketEvent } from '@mm/lib/data/racket';
import { saveErrorMessage } from '@mm/lib/errorText';
import { useLeagueCtx } from '@mm/lib/league';
import { useIsPro } from '@mm/lib/useMode';
import { useNow } from '@mm/lib/useNow';
import { acceptChallenge, cancelChallenge, createChallenge, joinLadder, leaveLadder, setLadder, syncLadder, useLadderChallenges, useLadderRungs } from '@mm/pages/sports/racket-formats/data';
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
} from '@mm/pages/sports/racket-formats/logic/ladder';
import { entrantLevel } from '@mm/pages/sports/racket-formats/logic/box';
import { levelText, useLevels } from '@mm/pages/sports/racket/levels';
import { todayIn, zonedIso } from '@mm/pages/sports/racket/logic/time';
import { useMySide } from '@mm/pages/sports/racket/match/side';
import { useNames } from '@mm/pages/sports/racket/names';
import { courtWords } from '@mm/pages/sports/racket/sport';
import { DateStepper } from '../DateStepper';
import { TimeStepper } from '../esports/fields';
import { MatchCard, MatchStatus } from '../match/MatchCard';
import { confirmAsync, toast } from '../feedback';
import { Badge, Button, Card, Empty, Field, Input, ListRow, LoadError, SectionHeader, Sheet, Txt } from '../ui';
import { LogoSpinner } from '../Logo';
import { LadderFields } from './FormatForms';
import { useDeleteEvent } from './EventAdmin';
import { EventMenu, PickList, SaveFooter, ScreenHead, useRacketPhone, type MenuItem } from './parts';
import { matchRoute } from './RacketHome';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** Lo hace y avisa; con error, el aviso del error. */
async function run(fn: () => Promise<unknown>, ok: string) {
  try {
    await fn();
    toast(ok);
  } catch (e) {
    toast(saveErrorMessage(e), 'error');
  }
}

export function LadderView({ event }: { event: RacketEvent }) {
  const c = useColors();
  const { lid, isAdmin, myPlayerId, member } = useLeagueCtx();
  const pro = useIsPro();
  const { levels, scale } = useLevels();
  const names = useNames();
  const now = useNow(60_000).getTime();
  const cfg = useMemo(() => parseLadderConfig(event.config), [event.config]);
  const rungs = useLadderRungs(lid, event.id);
  const challenges = useLadderChallenges(lid, event.id);
  const q = useMatches({ lid, eventId: event.id });
  const matches = useWithPendingPoints(lid, q.data);
  const [editing, setEditing] = useState<null | 'orden' | 'ajustes'>(null);
  const [accepting, setAccepting] = useState<LadderChallenge | null>(null);
  const [saving, setSaving] = useState(false);
  // Retar, cancelar un reto, entrar o salir: la ruedita en el botón que se tocó.
  const [pending, setPending] = useState<string | null>(null);
  const title = event.name || 'Escalera';
  const remove = useDeleteEvent(event, { title, message: 'Se borran los puestos, los retos y sus partidos. No se puede deshacer.', ok: 'Escalera borrada' });

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
  const myOpen = me ? (open.find((x) => x.challenger === me || x.challenged === me) ?? null) : null;
  const targets = me ? targetsFor(order, me, all, cfg.maxUp) : [];
  const matchById = new Map(matches.map((m) => [m.id, m] as const));
  const canJoin = !me && cfg.open && !!myPlayerId && (!cfg.doubles || names.teamsOf(myPlayerId).length === 1);

  if (rungs.error) return <LoadError error={rungs.error} />;

  const busyRun = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setPending(key);
    await run(fn, ok);
    setPending(null);
  };
  const challenge = async (target: string, key: string) => {
    const err = me ? whyNot(order, me, target, all, cfg.maxUp) : 'No estás en la escalera.';
    if (err) {
      toast(err, 'error');
      return;
    }
    if (!(await confirmAsync({ title: `¿Retar a ${names.entrantName(target)}?`, message: `Tiene ${cfg.acceptDays} días para aceptar y juegan antes de ${cfg.playDays} días. Si no, ganas por W.O.`, confirmText: 'Retar' }))) return;
    await busyRun(key, () => createChallenge(lid, event.id, target), 'Reto enviado: le llegó el aviso');
  };
  const cancel = async (x: LadderChallenge) => {
    if (!(await confirmAsync({ title: '¿Cancelar el reto?', message: 'Su partido se anula. La escalera no cambia.', confirmText: 'Cancelar el reto', danger: true }))) return;
    await busyRun(`cancelar:${x.id}`, () => cancelChallenge(lid, event.id, x.id), 'Reto cancelado');
  };
  const leave = async () => {
    if (!me) return;
    if (await confirmAsync({ title: '¿Salir de la escalera?', message: 'Pierdes tu puesto. Tus retos abiertos se cancelan.', confirmText: 'Salir', danger: true }))
      await busyRun('salir', () => leaveLadder(lid, event.id, me), 'Saliste de la escalera');
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

  const recent = all.filter((x) => !isOpenChallenge(x)).slice(0, 10);
  const unit = cfg.doubles ? 'parejas' : 'jugadores';
  // Pro: también los plazos para aceptar y para jugar.
  const meta = [
    `${order.length} ${unit}`,
    `retas hasta ${cfg.maxUp} ${cfg.maxUp === 1 ? 'puesto' : 'puestos'} arriba`,
    pro ? `${cfg.acceptDays} días para aceptar y ${cfg.playDays} para jugar` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const items: MenuItem[] = [
    ...(isAdmin
      ? [
          { key: 'orden', icon: ListOrdered, label: 'Ordenar y agregar', hint: 'Subir, bajar, sacar o sumar a alguien', onPress: () => setEditing('orden') },
          { key: 'reglas', icon: Settings2, label: 'Reglas de la escalera', hint: 'Hasta dónde se reta y los plazos', onPress: () => setEditing('ajustes') },
        ]
      : []),
    ...(me && !isAdmin ? [{ key: 'salir', icon: LogOut, label: 'Salir de la escalera', onPress: () => void leave(), busy: pending === 'salir', danger: true }] : []),
    ...(isAdmin ? [{ key: 'borrar', icon: Trash2, label: 'Borrar la escalera', onPress: () => void remove(), danger: true }] : []),
  ];
  const pos = me ? order.indexOf(me) + 1 : 0;

  return (
    <View style={{ gap: 22 }}>
      <ScreenHead
        title={title}
        meta={meta}
        right={
          <EventMenu title={title} items={items}>
            {editing === 'orden' && <OrderSheet cfg={cfg} order={order} eventId={event.id} onClose={() => setEditing(null)} />}
            {editing === 'ajustes' && <SettingsSheet cfg={cfg} busy={saving} onClose={() => setEditing(null)} onSave={(x) => void saveConfig(x)} />}
          </EventMenu>
        }
      />

      {me ? (
        <Card style={{ gap: 14, backgroundColor: c.accentSoft }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
            <Txt style={{ fontSize: 54, lineHeight: 58, fontFamily: font.bold, color: c.accent }}>{`${pos}.º`}</Txt>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt style={{ fontSize: 17, fontFamily: font.bold }}>Tu puesto</Txt>
              <Txt tone="fg2" numberOfLines={1} style={{ fontSize: 14.5 }}>
                {names.entrantName(me)}
              </Txt>
            </View>
          </View>
          {myOpen ? (
            <ChallengeCard x={myOpen} me={me} match={myOpen.matchId ? matchById.get(myOpen.matchId) : undefined} now={now} onAccept={setAccepting} onCancel={cancel} pending={pending} />
          ) : targets.length ? (
            <View style={{ gap: 8 }}>
              <Txt style={{ fontSize: 15, fontFamily: font.semibold }}>Puedes retar a:</Txt>
              {targets.map((t) => (
                <Button
                  key={t}
                  variant="primary"
                  size={pro ? 'lg' : 'xl'}
                  full
                  icon={<Swords size={20} color={c.accentFg} />}
                  loading={pending === `retar:${t}`}
                  disabled={pending !== null}
                  onPress={() => void challenge(t, `retar:${t}`)}
                >
                  {`${order.indexOf(t) + 1}.º ${names.entrantName(t)}`}
                </Button>
              ))}
            </View>
          ) : (
            <Txt variant="meta" tone="fg2">
              {pos === 1 ? 'Eres el 1.º: te toca defender el puesto.' : 'Los de arriba tienen retos abiertos: vuelve en unos días.'}
            </Txt>
          )}
        </Card>
      ) : canJoin ? (
        <Card style={{ gap: 12 }}>
          <View style={{ gap: 4 }}>
            <Txt variant="cardTitle">No estás en la escalera</Txt>
            <Txt variant="meta" tone="fg2">
              Entras abajo del todo y de ahí retas hacia arriba.
            </Txt>
          </View>
          <Button
            variant="primary"
            size="xl"
            full
            icon={<LogIn size={20} color={c.accentFg} />}
            loading={pending === 'entrar'}
            disabled={pending !== null}
            onPress={() => void busyRun('entrar', () => joinLadder(lid, event.id), 'Ya estás en la escalera')}
          >
            Entrar a la escalera
          </Button>
        </Card>
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionHeader title="Puestos" />
        {rungs.loading && !order.length ? (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <LogoSpinner size={32} label="Cargando los puestos" />
          </View>
        ) : order.length ? (
          <Card padded={false}>
            {order.map((id, i) => {
              const canHit = targets.includes(id) && !myOpen;
              const isMe = mine.includes(id);
              // Pro: también su nivel.
              const lv = entrantLevel(names.entrant(id), levels);
              const sub = [cfg.doubles ? names.rosterOf(id).map(names.nameOf).join(' / ') : null, pro && lv != null ? levelText(lv, scale) : null].filter(Boolean).join(' · ');
              return (
                <View
                  key={id}
                  style={[styles.rung, { backgroundColor: isMe ? c.accentSoft : 'transparent', borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: c.line }]}
                  accessibilityLabel={`${i + 1}.º ${names.entrantName(id)}${isMe ? ', tú' : ''}`}
                >
                  <Txt style={{ width: 28, fontSize: 15, fontFamily: font.semibold, color: c.muted }}>{i + 1}</Txt>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Txt numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, fontFamily: font.semibold }}>
                        {names.entrantName(id)}
                      </Txt>
                      {isMe && <Badge>Tú</Badge>}
                    </View>
                    {!!sub && (
                      <Txt tone="muted" numberOfLines={1} style={{ fontSize: 13 }}>
                        {sub}
                      </Txt>
                    )}
                  </View>
                  {canHit ? (
                    <Button variant="soft" loading={pending === `fila:${id}`} disabled={pending !== null} onPress={() => void challenge(id, `fila:${id}`)}>
                      Retar
                    </Button>
                  ) : busyIds.has(id) ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Swords size={14} color={c.muted} />
                      <Txt tone="muted" style={{ fontSize: 13, fontFamily: font.semibold }}>
                        En reto
                      </Txt>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </Card>
        ) : (
          <Empty
            icon={<ChevronsUp size={28} color={c.accent} />}
            title="La escalera está vacía"
            text={isAdmin ? 'En «•••», «Ordenar y agregar» pone a los primeros.' : cfg.open ? 'Entra tú primero.' : 'El admin pone a los participantes.'}
          />
        )}
      </View>

      {open.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionHeader title={`Retos abiertos (${open.length})`} />
          {open.map((x) => (
            <Card key={x.id}>
              <ChallengeCard x={x} me={me} match={x.matchId ? matchById.get(x.matchId) : undefined} now={now} onAccept={setAccepting} onCancel={cancel} pending={pending} />
            </Card>
          ))}
        </View>
      )}

      {recent.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionHeader title="Últimos retos" />
          <Card padded={false}>
            {recent.map((x) => (
              <ListRow
                key={x.id}
                onPress={x.matchId ? () => router.push(matchRoute(lid, x.matchId!)) : undefined}
                title={`${names.entrantName(x.challenger)} retó a ${names.entrantName(x.challenged)}`}
                subtitle={outcomeText(x, names.entrantName)}
              />
            ))}
          </Card>
        </View>
      )}

      {accepting && <AcceptSheet x={accepting} onClose={() => setAccepting(null)} eventId={event.id} />}
    </View>
  );
}

/** Un reto abierto: quién retó a quién, plazo y lo que puedo hacer (aceptar, cancelar, ver o anotar el partido). */
function ChallengeCard({
  x,
  me,
  match,
  now,
  onAccept,
  onCancel,
  pending,
}: {
  x: LadderChallenge;
  me: string | null;
  match: Match | undefined;
  now: number;
  onAccept: (c: LadderChallenge) => void;
  onCancel: (c: LadderChallenge) => void;
  pending: string | null;
}) {
  const c = useColors();
  const { lid, isAdmin, league } = useLeagueCtx();
  const names = useNames();
  const mySideOf = useMySide();
  const iChallenged = me === x.challenger;
  const iAmChallenged = me === x.challenged;
  const late = overdue(x, now);
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <Swords size={20} color={c.accent} style={{ marginTop: 2 }} />
        <Txt style={{ flex: 1, fontSize: 15 }}>
          <Txt style={{ fontSize: 15, fontFamily: font.bold }}>{names.entrantName(x.challenger)}</Txt>
          {x.challengerPos ? ` (${x.challengerPos}.º)` : ''} retó a <Txt style={{ fontSize: 15, fontFamily: font.bold }}>{names.entrantName(x.challenged)}</Txt>
          {x.challengedPos ? ` (${x.challengedPos}.º)` : ''}
        </Txt>
        <MatchStatus label={STATUS_TEXT[x.status]} tone={x.status === 'pending' ? 'warn' : 'neutral'} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Clock size={14} color={late ? c.danger : c.muted} />
        <Txt style={{ fontSize: 13, color: late ? c.danger : c.muted, fontFamily: late ? font.semibold : font.regular }}>
          {late ? 'Se venció el plazo: gana el retador por W.O.' : (deadlineText(x, now) ?? '')}
        </Txt>
      </View>
      {match && match.status !== 'scheduled' && <MatchCard match={match} mySide={mySideOf(match)} onPress={() => router.push(matchRoute(lid, match.id))} tz={league.tz} now={now} roundWord="Reto" />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {x.status === 'pending' && (iAmChallenged || isAdmin) && (
          <View style={{ flexGrow: 1 }}>
            <Button variant="primary" size="lg" full icon={<Check size={18} color={c.accentFg} />} onPress={() => onAccept(x)}>
              Aceptar
            </Button>
          </View>
        )}
        {x.matchId && (
          <View style={{ flexGrow: 1 }}>
            <Button size="lg" full onPress={() => router.push(matchRoute(lid, x.matchId!))}>
              {iChallenged || iAmChallenged ? 'Anotar o ver el partido' : 'Ver el partido'}
            </Button>
          </View>
        )}
        {((x.status === 'pending' && iChallenged) || isAdmin) && (
          <Button variant="ghost" size="lg" icon={<X size={18} color={c.fg} />} loading={pending === `cancelar:${x.id}`} disabled={pending !== null} onPress={() => onCancel(x)}>
            Cancelar
          </Button>
        )}
      </View>
    </View>
  );
}

/** Aceptar un reto: fecha, hora y dónde (se puede dejar para después). */
function AcceptSheet({ x, eventId, onClose }: { x: LadderChallenge; eventId: string; onClose: () => void }) {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const names = useNames();
  // «Cancha» o, en ping pong, «Mesa».
  const w = courtWords(useRacketPhone().ext);
  const [date, setDate] = useState(() => todayIn(league.tz));
  const [time, setTime] = useState('');
  const [court, setCourt] = useState('');
  const [busy, setBusy] = useState(false);
  const accept = async () => {
    setBusy(true);
    try {
      const at = date && time ? zonedIso(date, time, league.tz) : null;
      const status = await acceptChallenge(lid, eventId, x.id, { scheduledAt: at, court });
      if (status === 'accepted') toast('Reto aceptado: a jugar');
      else toast('Ese reto ya se cerró (se venció el plazo).', 'error');
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
      title={`Aceptar el reto de ${names.entrantName(x.challenger)}`}
      subtitle="Cuándo y dónde (se puede dejar para después)"
      footer={<SaveFooter onClose={onClose} busy={busy} onSave={() => void accept()} label="Aceptar el reto" />}
    >
      <Field label="Fecha">
        <DateStepper value={date} onChange={setDate} />
      </Field>
      <Field label="Hora">
        {time ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <TimeStepper value={time} onChange={setTime} label="Hora" />
            </View>
            <Button variant="ghost" icon={<X size={18} color={c.faint} />} accessibilityLabel="Quitar la hora" onPress={() => setTime('')} />
          </View>
        ) : (
          // Sin el campo de hora vacío de la web: al tocar sale una hora para moverla.
          <Button size="md" style={{ alignSelf: 'flex-start' }} accessibilityLabel="Hora" onPress={() => setTime('19:00')}>
            --:--
          </Button>
        )}
      </Field>
      <Field label={w.One}>
        <Input value={court} maxLength={40} onChangeText={setCourt} placeholder={`${w.One} 2`} accessibilityLabel={w.One} />
      </Field>
    </Sheet>
  );
}

/** Admin: el orden (subir, bajar, sacar) y agregar participantes. Se monta al abrirse. */
function OrderSheet({ cfg, order, eventId, onClose }: { cfg: LadderConfig; order: string[]; eventId: string; onClose: () => void }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const names = useNames();
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
  const icon = (a11y: string, child: ReactNode, onPress: () => void, off = false) => (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ disabled: off }} disabled={off} onPress={onPress} style={[styles.icon, { opacity: off ? 0.35 : 1 }]}>
      {child}
    </Pressable>
  );
  return (
    <Sheet open onClose={onClose} title="Ordenar y agregar" subtitle="Quien sale pierde su puesto y sus retos" footer={<SaveFooter onClose={onClose} busy={busy} onSave={() => void save()} />}>
      {list.length > 0 && (
        <Card padded={false}>
          {list.map((id, i) => (
            <View key={id} style={[styles.order, { borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: c.line }]}>
              <Txt tone="muted" style={{ width: 24, textAlign: 'center', fontSize: 14, fontFamily: font.semibold }}>
                {i + 1}
              </Txt>
              <Txt numberOfLines={1} style={{ flex: 1, fontSize: 15, fontFamily: font.semibold }}>
                {names.entrantName(id)}
              </Txt>
              {icon('Subir', <ArrowUp size={16} color={c.fg} />, () => move(i, -1), i === 0)}
              {icon('Bajar', <ArrowDown size={16} color={c.fg} />, () => move(i, 1), i === list.length - 1)}
              {icon(`Sacar a ${names.entrantName(id)}`, <X size={16} color={c.faint} />, () => setList(list.filter((x) => x !== id)))}
            </View>
          ))}
        </Card>
      )}
      <Txt style={{ fontSize: 15, fontFamily: font.semibold }}>Agregar (entran abajo)</Txt>
      <PickList items={items} selected={new Set()} onToggle={(id) => setList([...list, id])} empty={cfg.doubles ? 'No quedan parejas por agregar.' : 'No quedan jugadores por agregar.'} />
    </Sheet>
  );
}

function SettingsSheet({ cfg, busy, onClose, onSave }: { cfg: LadderConfig; busy: boolean; onClose: () => void; onSave: (c: LadderConfig) => void }) {
  const [draft, setDraft] = useState(cfg);
  return (
    <Sheet open onClose={onClose} title="Reglas de la escalera" subtitle="Los plazos nuevos valen para los retos que siguen" footer={<SaveFooter onClose={onClose} busy={busy} onSave={() => onSave(draft)} />}>
      <LadderFields value={draft} onChange={setDraft} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  rung: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingHorizontal: 16, paddingVertical: 8 },
  order: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 48, paddingLeft: 12, paddingRight: 6 },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
