/**
 * «Me apunto» de la noche, el round robin y el torneo (SignupPanel.tsx de la web, con su misma lógica: logic/signup.ts):
 * cómo va la lista (cupos, espera, fecha límite), apuntarse (en el torneo de dobles, con su pareja o eligiendo
 * compañero; con varias categorías, en cuál), «Ya no puedo», la lista de espera en orden y lo que hace el admin a mano
 * (meter o sacar a alguien de la espera; «Ajustes» abre la inscripción). También invita por WhatsApp. Igual en Lite y Pro.
 */
import { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ClipboardList, LogIn, MessageCircle, Settings2, UserCheck, UserMinus, UserPlus } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { joinSignup, leaveSignup, setSignup, useSignups, type RacketEvent } from '@mm/lib/data/racket';
import { saveErrorMessage } from '@mm/lib/errorText';
import { useLeagueCtx } from '@mm/lib/league';
import { shareOrigin } from '@mm/lib/origin';
import { useNow } from '@mm/lib/useNow';
import { whatsappShareUrl } from '@mm/components/match/format';
import {
  PHASE_NOTE,
  PHASE_TEXT,
  deadlineText,
  joinedText,
  mySignup,
  signupCount,
  signupErrorText,
  signupInviteText,
  signupList,
  signupPhase,
  signupTaken,
  waitlistMoves,
  type SignupList,
  type SignupSettings,
} from '@mm/pages/sports/racket/logic/signup';
import { todayIn } from '@mm/pages/sports/racket/logic/time';
import { useNames } from '@mm/pages/sports/racket/names';
import { confirmAsync, toast } from '../feedback';
import { Button, Card, ChoiceRow, Sheet, Txt } from '../ui';
import { PickList, SaveFooter, useRacketPhone } from './parts';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** Una lista: la de la noche (category null) o la de una categoría del torneo. */
export interface SignupListInput {
  category: string | null;
  /** Nombre de la categoría (null en la noche). */
  name: string | null;
  /** Los de la lista, en su orden (config.players o categories[].pairs). */
  listed: readonly string[];
}

export function SignupPanel({
  event,
  settings,
  lists,
  started,
  onEdit,
}: {
  event: RacketEvent;
  settings: SignupSettings;
  lists: readonly SignupListInput[];
  /** La noche publicó una ronda (o se cerró) o el torneo armó grupos o cuadro. */
  started: boolean;
  /** Admin: abrir los ajustes de la inscripción. */
  onEdit?: () => void;
}) {
  const c = useColors();
  const { lid, isAdmin, league, member, myPlayerId } = useLeagueCtx();
  const { doubles, side } = useRacketPhone();
  const auth = useAuth();
  const names = useNames();
  const now = useNow(60_000).getTime();
  const rows = useSignups(lid, event.id).data;
  const [busy, setBusy] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);

  const tourney = event.type === 'torneo';
  const pairs = tourney && doubles;
  const unit: readonly [string, string] = tourney ? side : ['jugador', 'jugadores'];
  const phase = signupPhase(settings, { started, date: event.date, today: todayIn(league.tz, now), now });
  const views = useMemo(() => lists.map((l) => ({ ...l, view: signupList(l.listed, rows, settings, l.category) })), [lists, rows, settings]);
  const mine = (entrant: string) => !!myPlayerId && (entrant === myPlayerId || (pairs && names.rosterOf(entrant).includes(myPlayerId)));
  const my = myPlayerId ? mySignup(lists, rows, mine) : null;
  const myList = my ? views.find((v) => v.category === my.category) : null;
  const allFull = views.every((v) => v.view.free === 0);
  const title = event.name || (tourney ? 'Torneo' : 'Americano');

  const fail = (e: unknown) => toast(signupErrorText(e) ?? saveErrorMessage(e), 'error');
  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      console.error(e);
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const join = () => {
    if (!auth.user) {
      router.push({ pathname: '/login', params: { next: `/l/${lid}/e/${event.id}` } });
      return;
    }
    // Torneo de dobles o con varias categorías: primero con quién y en cuál.
    if (pairs || (tourney && lists.length > 1)) {
      setChoosing(true);
      return;
    }
    void act('join', async () => {
      const r = await joinSignup(lid, event.id, tourney ? { category: lists[0]?.category ?? null } : {});
      toast(joinedText(r));
    });
  };

  const leave = async () => {
    if (!my) return;
    const inList = my.status === 'in';
    const ok = await confirmAsync({
      title: inList ? '¿Ya no puedes?' : '¿Salir de la lista de espera?',
      message: inList ? 'Sales de la lista y, si hay alguien esperando, entra en tu lugar.' : 'Pierdes tu turno en la espera.',
      confirmText: inList ? 'Sí, me bajo' : 'Salir',
    });
    if (!ok) return;
    await act('leave', async () => {
      await leaveSignup(lid, event.id, my.entrant);
      toast(inList ? 'Listo: saliste de la lista' : 'Saliste de la lista de espera');
    });
  };

  const admit = (entrant: string) =>
    act(`in:${entrant}`, async () => {
      const out = await setSignup(lid, event.id, entrant, 'in');
      toast(out === 'in' ? `${names.entrantName(entrant)} entró a la lista` : 'Listo');
    });

  const drop = async (entrant: string) => {
    const ok = await confirmAsync({ title: `¿Sacar a ${names.entrantName(entrant)} de la espera?`, message: 'Pierde su turno.', confirmText: 'Sacar', danger: true });
    if (!ok) return;
    await act(`out:${entrant}`, async () => {
      await setSignup(lid, event.id, entrant, null);
      toast('Listo');
    });
  };

  const counts = views.length === 1 ? signupCount(views[0].view, settings, unit) : views.map((v) => `${v.name}: ${signupCount(v.view, settings, unit)}`).join(' · ');
  const left = views.reduce((n, v) => n + v.view.free, 0);
  const invite = signupInviteText({ title, settings, left, tz: league.tz, url: `${shareOrigin(null)}/l/${lid}/e/${event.id}` });

  return (
    <Card style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
        <View style={[styles.icon, { backgroundColor: c.accentSoft }]}>
          <ClipboardList size={20} color={c.accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt style={{ fontSize: 17, fontFamily: font.bold, letterSpacing: -0.2 }}>
            {PHASE_TEXT[phase]}
            {phase === 'open' && settings.cap != null && allFull && <Txt tone="muted" style={{ fontSize: 17, fontFamily: font.medium }}>{' · lista llena'}</Txt>}
          </Txt>
          <Txt variant="meta" tone="fg2">
            {counts}
          </Txt>
          {!!settings.until && (phase === 'open' || phase === 'deadline') && (
            <Txt tone="muted" style={{ fontSize: 13 }}>
              {`${phase === 'open' ? 'Se cierra' : 'Se cerró'} el ${deadlineText(settings.until, league.tz)}`}
            </Txt>
          )}
        </View>
        {isAdmin && onEdit && (
          <Pressable accessibilityRole="button" hitSlop={4} onPress={onEdit} style={styles.edit}>
            <Settings2 size={16} color={c.accent} />
            <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }}>
              Ajustes
            </Txt>
          </Pressable>
        )}
      </View>

      {my ? (
        <View style={[styles.mine, { backgroundColor: my.status === 'in' ? c.accentSoft : c.surface2 }]}>
          <Txt style={{ fontSize: 15, color: my.status === 'in' ? c.accent : c.fg }}>
            {my.status === 'in' ? (
              <>
                <Txt style={{ fontSize: 15, fontFamily: font.bold, color: c.accent }}>{`Estás en la lista (n.º ${my.position})`}</Txt>
                {`${myList?.name ? ` de ${myList.name}` : ''}.`}
              </>
            ) : (
              <>
                <Txt style={{ fontSize: 15, fontFamily: font.bold }}>{`Estás n.º ${my.position} en la lista de espera`}</Txt>
                {`${myList?.name ? ` de ${myList.name}` : ''}. Si se libera un cupo, entras solo y te avisamos.`}
              </>
            )}
          </Txt>
          {(my.status === 'wait' || !started) && (
            <Button size="lg" full loading={busy === 'leave'} icon={<UserMinus size={16} color={c.fg} />} onPress={() => void leave()} style={{ backgroundColor: c.surface }}>
              {my.status === 'in' ? 'Ya no puedo' : 'Salir de la espera'}
            </Button>
          )}
        </View>
      ) : phase === 'open' ? (
        <View style={{ gap: 6 }}>
          <Button
            variant="primary"
            size="xl"
            full
            loading={busy === 'join'}
            icon={auth.user ? <UserPlus size={20} color={c.accentFg} /> : <LogIn size={20} color={c.accentFg} />}
            onPress={join}
          >
            {!auth.user ? 'Entra para apuntarte' : settings.cap != null && allFull ? 'Me apunto a la lista de espera' : 'Me apunto'}
          </Button>
          {!!auth.user && !member && (
            <Txt tone="muted" style={{ fontSize: 13, textAlign: 'center' }}>
              {`Al apuntarte entras a ${league.name}.`}
            </Txt>
          )}
        </View>
      ) : (
        <Txt variant="meta" tone="muted">
          {PHASE_NOTE[phase]}
        </Txt>
      )}

      {views.map((v) => (
        <WaitingList
          key={v.category ?? '-'}
          name={views.length > 1 ? v.name : null}
          list={v.view}
          nameOf={names.entrantName}
          isMine={mine}
          moves={waitlistMoves(phase)}
          busy={busy}
          onAdmit={isAdmin ? (id) => void admit(id) : undefined}
          onDrop={isAdmin ? (id) => void drop(id) : undefined}
        />
      ))}

      {phase === 'open' && (
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(whatsappShareUrl(invite))} style={styles.invite}>
          <MessageCircle size={16} color={c.accent} />
          <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }}>
            Invitar por WhatsApp
          </Txt>
        </Pressable>
      )}

      {choosing && (
        <JoinSheet
          event={event}
          lists={views}
          pairs={pairs}
          onClose={() => setChoosing(false)}
          onJoin={async (opts) => {
            try {
              const r = await joinSignup(lid, event.id, opts);
              toast(joinedText(r));
              setChoosing(false);
            } catch (e) {
              console.error(e);
              fail(e);
            }
          }}
        />
      )}
    </Card>
  );
}

function WaitingList({
  name,
  list,
  nameOf,
  isMine,
  moves,
  busy,
  onAdmit,
  onDrop,
}: {
  name: string | null;
  list: SignupList;
  nameOf: (id: string) => string;
  isMine: (id: string) => boolean;
  moves: boolean;
  busy: string | null;
  onAdmit?: (entrant: string) => void;
  onDrop?: (entrant: string) => void;
}) {
  const c = useColors();
  if (!list.waiting.length) return null;
  return (
    <View style={{ gap: 8 }}>
      <Txt tone="muted" style={{ fontSize: 13, fontFamily: font.semibold }}>
        {`Lista de espera${name ? ` · ${name}` : ''} (${list.waiting.length})${moves ? '' : ' · ya no sube nadie sola'}`}
      </Txt>
      <View style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: c.surface2 }}>
        {list.waiting.map((w, i) => (
          <View key={w.entrantId} style={[styles.waitRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
            <Txt style={{ width: 20, textAlign: 'center', fontSize: 14, fontFamily: font.semibold, color: c.muted }}>{i + 1}</Txt>
            <Txt numberOfLines={1} style={{ flex: 1, fontSize: 15, fontFamily: font.semibold, color: isMine(w.entrantId) ? c.accent : c.fg }}>
              {nameOf(w.entrantId)}
            </Txt>
            {onAdmit && (
              <Button variant="soft" loading={busy === `in:${w.entrantId}`} icon={<UserCheck size={16} color={c.accent} />} onPress={() => onAdmit(w.entrantId)}>
                Meter
              </Button>
            )}
            {onDrop && (
              <Button variant="ghost" loading={busy === `out:${w.entrantId}`} icon={<UserMinus size={16} color={c.faint} />} accessibilityLabel={`Sacar a ${nameOf(w.entrantId)} de la espera`} onPress={() => onDrop(w.entrantId)} />
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

/** Torneo: en qué categoría y (en dobles) con quién: con mi pareja o eligiendo compañero. */
function JoinSheet({
  event,
  lists,
  pairs,
  onClose,
  onJoin,
}: {
  event: RacketEvent;
  lists: readonly (SignupListInput & { view: SignupList })[];
  pairs: boolean;
  onClose: () => void;
  onJoin: (opts: { category: string | null; team: string | null; partner: string | null }) => Promise<void>;
}) {
  const { myPlayerId } = useLeagueCtx();
  const names = useNames();
  const myTeams = names.teamsOf(myPlayerId);
  const [category, setCategory] = useState<string | null>(() => (lists.length === 1 ? lists[0].category : (lists.find((l) => l.view.free > 0)?.category ?? null)));
  const [choice, setChoice] = useState<string>(() => myTeams[0] ?? 'otro');
  const [partner, setPartner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Quien ya está en el torneo (en la lista o en la espera, solo o en pareja) no se puede elegir de compañero.
  const taken = useMemo(() => signupTaken(lists, names.rosterOf), [lists, names]);
  const others = names.players.filter((p) => p.id !== myPlayerId && !taken.has(p.id)).map((p) => ({ id: p.id, name: p.name }));
  const ready = !!category && (!pairs || (choice === 'otro' ? !!partner : !!choice));
  const chosen = lists.find((l) => l.category === category);

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      await onJoin({ category, team: pairs && choice !== 'otro' ? choice : null, partner: pairs && choice === 'otro' ? partner : null });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Me apunto: ${event.name || 'Torneo'}`}
      subtitle="Si está llena, quedas en la espera"
      footer={<SaveFooter onClose={onClose} busy={busy} disabled={!ready} onSave={() => void submit()} label={chosen && chosen.view.free === 0 ? 'A la lista de espera' : 'Me apunto'} />}
    >
      {lists.length > 1 && (
        <View accessibilityRole="radiogroup" accessibilityLabel="Categoría" style={{ gap: 8 }}>
          <Txt style={{ fontSize: 15, fontFamily: font.semibold }}>Categoría</Txt>
          {lists.map((l) => (
            <ChoiceRow
              key={l.category ?? '-'}
              title={l.name ?? ''}
              subtitle={l.view.free > 0 ? `${l.view.free} ${l.view.free === 1 ? 'cupo' : 'cupos'}` : 'llena: espera'}
              selected={category === l.category}
              onPress={() => setCategory(l.category)}
            />
          ))}
        </View>
      )}
      {pairs && (
        <View accessibilityRole="radiogroup" accessibilityLabel="Pareja" style={{ gap: 8 }}>
          <Txt style={{ fontSize: 15, fontFamily: font.semibold }}>¿Con quién juegas?</Txt>
          {myTeams.map((t) => (
            <ChoiceRow key={t} title={names.entrantName(t)} subtitle="Mi pareja" selected={choice === t} onPress={() => setChoice(t)} />
          ))}
          <ChoiceRow title={myTeams.length ? 'Con otro compañero' : 'Elijo a mi compañero'} selected={choice === 'otro'} onPress={() => setChoice('otro')} />
          {choice === 'otro' && (
            <PickList
              items={others}
              selected={new Set(partner ? [partner] : [])}
              onToggle={(id) => setPartner(partner === id ? null : id)}
              empty="No hay más jugadores en la liga todavía: pídele a tu compañero que se una primero, o al admin que lo agregue."
            />
          )}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  edit: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, marginTop: -8, marginRight: -8, paddingHorizontal: 8 },
  mine: { gap: 12, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14 },
  waitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingVertical: 4, paddingLeft: 16, paddingRight: 6 },
  invite: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, alignSelf: 'flex-start', marginVertical: -4, paddingHorizontal: 4 },
});
