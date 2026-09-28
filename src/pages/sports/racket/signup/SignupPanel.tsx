import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ClipboardList, LogIn, MessageCircle, Settings2, UserCheck, UserMinus, UserPlus } from 'lucide-react';
import { useAuth } from '../../../../lib/auth';
import { joinSignup, leaveSignup, setSignup, useSignups, type RacketEvent } from '../../../../lib/data/racket';
import { useLeagueCtx } from '../../../../lib/league';
import { useNow } from '../../../../lib/useNow';
import { saveErrorMessage, useFeedback } from '../../../../components/feedback';
import { whatsappShareUrl } from '../../../../components/match';
import { Button, Card, Modal, cx } from '../../../../components/ui';
import { PickList, appOrigin } from '../bits';
import {
  PHASE_TEXT,
  deadlineText,
  joinedText,
  mySignup,
  signupCount,
  signupErrorText,
  signupList,
  signupPhase,
  waitlistMoves,
  type SignupList,
  type SignupSettings,
} from '../logic/signup';
import { todayIn } from '../logic/time';
import { useNames } from '../names';
import { useRacket } from '../sport';

/** Una lista: la de la noche (category null) o la de una categoría del torneo. */
export interface SignupListInput {
  category: string | null;
  /** Nombre de la categoría (null en la noche). */
  name: string | null;
  /** Los de la lista, en su orden (config.players o categories[].pairs). */
  listed: readonly string[];
}

/**
 * «Me apunto» del americano o del torneo: cómo va la lista (cupos, espera, fecha límite), apuntarse (en dobles,
 * con su pareja o eligiendo compañero; en el torneo, la categoría), «Ya no puedo», la lista de espera en orden y
 * lo que hace el admin a mano (meter o sacar a alguien de la espera). También invita por WhatsApp.
 */
export function SignupPanel({
  event,
  settings,
  lists,
  started,
  onEdit,
  className,
}: {
  event: RacketEvent;
  settings: SignupSettings;
  lists: readonly SignupListInput[];
  /** La noche publicó una ronda (o se cerró) o el torneo armó grupos o cuadro. */
  started: boolean;
  /** Admin: abrir los ajustes de la inscripción. */
  onEdit?: () => void;
  className?: string;
}) {
  const { lid, base, isAdmin, league, member, myPlayerId } = useLeagueCtx();
  const { doubles, side } = useRacket();
  const auth = useAuth();
  const names = useNames();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast, confirm } = useFeedback();
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
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
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
    const ok = await confirm({
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
    const ok = await confirm({ title: `¿Sacar a ${names.entrantName(entrant)} de la espera?`, message: 'Pierde su turno.', confirmText: 'Sacar', danger: true });
    if (!ok) return;
    await act(`out:${entrant}`, async () => {
      await setSignup(lid, event.id, entrant, null);
      toast('Listo');
    });
  };

  const counts = views.length === 1 ? signupCount(views[0].view, settings, unit) : views.map((v) => `${v.name}: ${signupCount(v.view, settings, unit)}`).join(' · ');
  const left = views.reduce((n, v) => n + v.view.free, 0);
  const url = `${appOrigin()}${base}/e/${event.id}`;
  const invite = [
    `${title}: apúntate en MatchMate.`,
    settings.cap != null ? (left > 0 ? `${left === 1 ? 'Queda 1 cupo' : `Quedan ${left} cupos`}.` : 'La lista está llena: hay lista de espera.') : '',
    settings.until ? `Se cierra el ${deadlineText(settings.until, league.tz)}.` : '',
    url,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Card className={cx('flex flex-col gap-3 border-accent/40 p-4', className)}>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <ClipboardList className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {PHASE_TEXT[phase]}
            {phase === 'open' && settings.cap != null && allFull && <span className="font-normal text-muted"> · lista llena</span>}
          </p>
          <p className="text-sm text-muted">{counts}</p>
          {settings.until && (phase === 'open' || phase === 'deadline') && (
            <p className="text-xs text-muted">
              {phase === 'open' ? 'Se cierra' : 'Se cerró'} el {deadlineText(settings.until, league.tz)}
            </p>
          )}
        </div>
        {isAdmin && onEdit && (
          <Button size="sm" variant="ghost" icon={<Settings2 className="size-4" />} onClick={onEdit}>
            Ajustes
          </Button>
        )}
      </div>

      {my ? (
        <div className={cx('flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5', my.status === 'in' ? 'bg-ok-soft' : 'bg-warn-soft')}>
          <p className="min-w-0 flex-1 text-sm">
            {my.status === 'in' ? (
              <>
                <b>Estás en la lista</b> (n.º {my.position}){myList?.name ? ` de ${myList.name}` : ''}.
              </>
            ) : (
              <>
                <b>Estás n.º {my.position} en la lista de espera</b>
                {myList?.name ? ` de ${myList.name}` : ''}. Si se libera un cupo, entras solo y te avisamos.
              </>
            )}
          </p>
          {(my.status === 'wait' || !started) && (
            <Button size="sm" loading={busy === 'leave'} icon={<UserMinus className="size-4" />} onClick={() => void leave()}>
              {my.status === 'in' ? 'Ya no puedo' : 'Salir de la espera'}
            </Button>
          )}
        </div>
      ) : phase === 'open' ? (
        <div className="flex flex-col gap-1.5">
          <Button
            variant="primary"
            className="h-12 text-base"
            loading={busy === 'join'}
            icon={auth.user ? <UserPlus className="size-5" /> : <LogIn className="size-5" />}
            onClick={join}
          >
            {!auth.user ? 'Entra para apuntarte' : settings.cap != null && allFull ? 'Me apunto a la lista de espera' : 'Me apunto'}
          </Button>
          {auth.user && !member && <p className="text-center text-xs text-muted">Al apuntarte entras a {league.name}.</p>}
        </div>
      ) : (
        <p className="text-sm text-muted">
          {phase === 'closed'
            ? 'El organizador cerró la inscripción.'
            : phase === 'deadline'
              ? 'Pasó la fecha límite para apuntarse.'
              : phase === 'started'
                ? 'Ya empezó: la lista quedó así.'
                : 'Este evento ya pasó.'}
        </p>
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
        <a
          href={whatsappShareUrl(invite)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl px-3 text-sm font-medium text-accent hover:bg-surface-2"
        >
          <MessageCircle className="size-4" /> Invitar por WhatsApp
        </a>
      )}

      {choosing && (
        <JoinModal
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
  if (!list.waiting.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold text-muted">
        Lista de espera{name ? ` · ${name}` : ''} ({list.waiting.length})
        {!moves && ' · ya no sube nadie sola'}
      </p>
      <ol className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line">
        {list.waiting.map((w, i) => (
          <li key={w.entrantId} className="flex min-h-11 items-center gap-2 px-3 py-1.5">
            <span className="w-5 text-right text-xs text-muted tabular-nums">{i + 1}</span>
            <span className={cx('min-w-0 flex-1 truncate text-sm', isMine(w.entrantId) && 'font-semibold text-accent')}>{nameOf(w.entrantId)}</span>
            {onAdmit && (
              <Button size="sm" variant="ghost" loading={busy === `in:${w.entrantId}`} icon={<UserCheck className="size-4" />} onClick={() => onAdmit(w.entrantId)}>
                Meter
              </Button>
            )}
            {onDrop && (
              <Button
                size="sm"
                variant="ghost"
                loading={busy === `out:${w.entrantId}`}
                icon={<UserMinus className="size-4" />}
                aria-label={`Sacar a ${nameOf(w.entrantId)} de la espera`}
                onClick={() => onDrop(w.entrantId)}
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Torneo: en qué categoría y (en dobles) con quién: con mi pareja o eligiendo compañero. */
function JoinModal({
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
  const taken = useMemo(() => {
    const out = new Set<string>();
    for (const l of lists) for (const id of [...l.listed, ...l.view.waiting.map((w) => w.entrantId)]) for (const p of [id, ...names.rosterOf(id)]) out.add(p);
    return out;
  }, [lists, names]);
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
    <Modal
      open
      onClose={onClose}
      title={`Me apunto: ${event.name || 'Torneo'}`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={!ready} icon={<UserPlus className="size-4" />} onClick={() => void submit()}>
            {chosen && chosen.view.free === 0 ? 'A la lista de espera' : 'Me apunto'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {lists.length > 1 && (
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Categoría">
            <p className="text-sm font-semibold">Categoría</p>
            {lists.map((l) => (
              <label key={l.category ?? '-'} className={cx('flex min-h-12 items-center gap-3 rounded-xl border px-3', category === l.category ? 'border-accent bg-accent-soft/60' : 'border-line')}>
                <input type="radio" name="categoria" className="size-5 accent-[var(--accent)]" checked={category === l.category} onChange={() => setCategory(l.category)} />
                <span className="min-w-0 flex-1 text-sm font-medium">{l.name}</span>
                <span className="text-xs text-muted">{l.view.free > 0 ? `${l.view.free} ${l.view.free === 1 ? 'cupo' : 'cupos'}` : 'llena: espera'}</span>
              </label>
            ))}
          </div>
        )}
        {pairs && (
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Pareja">
            <p className="text-sm font-semibold">¿Con quién juegas?</p>
            {myTeams.map((t) => (
              <label key={t} className={cx('flex min-h-12 items-center gap-3 rounded-xl border px-3', choice === t ? 'border-accent bg-accent-soft/60' : 'border-line')}>
                <input type="radio" name="pareja" className="size-5 accent-[var(--accent)]" checked={choice === t} onChange={() => setChoice(t)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{names.entrantName(t)}</span>
                  <span className="block truncate text-xs text-muted">Mi pareja</span>
                </span>
              </label>
            ))}
            <label className={cx('flex min-h-12 items-center gap-3 rounded-xl border px-3', choice === 'otro' ? 'border-accent bg-accent-soft/60' : 'border-line')}>
              <input type="radio" name="pareja" className="size-5 accent-[var(--accent)]" checked={choice === 'otro'} onChange={() => setChoice('otro')} />
              <span className="text-sm font-medium">{myTeams.length ? 'Con otro compañero' : 'Elijo a mi compañero'}</span>
            </label>
            {choice === 'otro' && (
              <PickList
                items={others}
                selected={new Set(partner ? [partner] : [])}
                onToggle={(id) => setPartner(partner === id ? null : id)}
                empty="No hay más jugadores en la liga todavía: pídele a tu compañero que se una primero, o al admin que lo agregue."
              />
            )}
          </div>
        )}
        <p className="text-xs text-muted">Si la lista está llena, quedas en la espera y entras solo cuando se libere un cupo (te llega un aviso).</p>
      </div>
    </Modal>
  );
}
