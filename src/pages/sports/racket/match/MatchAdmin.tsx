import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Ban, CalendarClock, Check, CircleSlash, Pause, PencilLine, Trash2, UserRoundCog } from 'lucide-react';
import {
  deleteMatch,
  hasResult,
  postponeMatch,
  rescheduleMatch,
  setMatchPlayers,
  setWalkover,
  voidMatch,
  type Match,
} from '../../../../lib/data/matches';
import { useLeagueCtx } from '../../../../lib/league';
import type { Side } from '../../../../sports/types';
import { useBusy } from '../../../../components/busy';
import { saveErrorMessage, useFeedback } from '../../../../components/feedback';
import { EventMenu, MoreButton, type MenuItem } from '../../../../components/event/EventHeader';
import { Button, Field, Input, Segmented, Select, Sheet, cx } from '../../../../components/ui';
import type { RacketMenuItem } from '../frame';
import { walkoverScore } from '../court/adapters';
import { isPointsMatch } from '../logic/results';
import { localParts, todayIn, zonedIso } from '../logic/time';
import { useNames } from '../names';
import { courtWords, useRacket } from '../sport';

type Dialog = null | 'walkover' | 'postpone' | 'reschedule' | 'players';
/** Qué se está guardando: lo del diálogo abierto, anular o borrar (la ruedita va en ese botón). */
type Pending = 'dialog' | 'void' | 'delete';

/**
 * «•••» del partido (rediseño: lo del admin ya no es una fila de botones): W.O., aplazar, reprogramar (fecha, hora y
 * cancha o mesa), quién jugó (suplente), corregir el resultado, anular y borrar; y lo de todos que pase la pantalla
 * (`extra`: compartir, historial). Cada cosa abre su hoja. Sin nada que mostrar, no sale el botón.
 */
export function MatchAdmin({
  match: m,
  onDeleted,
  onCorrect,
  extra = [],
}: {
  match: Match;
  onDeleted: () => void;
  /** Corregir el resultado (la hoja «solo resultado» de la pantalla del partido). */
  onCorrect?: () => void;
  /** Lo de todos: compartir el resultado, el historial. */
  extra?: readonly RacketMenuItem[];
}) {
  const { lid, league, isAdmin } = useLeagueCtx();
  const { sport, ext } = useRacket();
  const w = courtWords(ext);
  const { toast, confirm } = useFeedback();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menu, setMenu] = useState(false);
  const pending = useBusy<Pending>();
  const busy = pending.isBusy('dialog');
  // Mientras se anula o se borra no se abre un diálogo (su Guardar no haría nada).
  const waiting = pending.isBusy();
  const points = isPointsMatch(m);
  const open = m.status === 'scheduled' || m.status === 'live' || m.status === 'suspended' || m.status === 'postponed';

  const act = (fn: () => Promise<unknown>, ok: string, key: Pending = 'dialog') =>
    pending.run(key, async () => {
      try {
        await fn();
        toast(ok);
        setDialog(null);
        return true;
      } catch (e) {
        toast(saveErrorMessage(e), 'error');
        return false;
      }
    });

  const doVoid = async () => {
    setMenu(false);
    if (!(await confirm({ title: '¿Anular el partido?', message: 'No cuenta para la tabla ni las estadísticas. Se puede deshacer corrigiendo el resultado.', confirmText: 'Anular', danger: true }))) return;
    await act(() => voidMatch(lid, m.id), 'Partido anulado', 'void');
  };
  const doDelete = async () => {
    setMenu(false);
    if (!(await confirm({ title: '¿Borrar el partido?', message: 'Se borra con su resultado e historial. No se puede deshacer.', confirmText: 'Borrar', danger: true }))) return;
    if (await act(() => deleteMatch(lid, m.id), 'Partido borrado', 'delete')) onDeleted();
  };
  const openDialog = (d: Dialog) => {
    setMenu(false);
    setDialog(d);
  };

  const items: MenuItem[] = [
    ...(isAdmin && open && !points ? [{ key: 'wo', icon: CircleSlash, label: 'W.O.', hint: 'Quién no se presentó', onClick: () => openDialog('walkover') }] : []),
    ...(isAdmin && (m.status === 'scheduled' || m.status === 'suspended')
      ? [{ key: 'aplazar', icon: Pause, label: 'Aplazar', hint: 'Queda sin fecha hasta reprogramarlo', onClick: () => openDialog('postpone') }]
      : []),
    ...(isAdmin && (m.status === 'scheduled' || m.status === 'postponed' || m.status === 'suspended')
      ? [{ key: 'fecha', icon: CalendarClock, label: m.scheduledAt ? 'Reprogramar' : `Poner fecha y ${w.one}`, hint: `Fecha, hora y ${w.one}`, onClick: () => openDialog('reschedule') }]
      : []),
    ...(isAdmin ? [{ key: 'quien', icon: UserRoundCog, label: 'Quién juega', hint: 'Suplentes', onClick: () => openDialog('players') }] : []),
    ...(isAdmin && onCorrect && (hasResult(m) || m.status === 'void') && m.status !== 'disputed'
      ? [
          {
            key: 'corregir',
            icon: PencilLine,
            label: 'Corregir el resultado',
            hint: 'Queda confirmado',
            onClick: () => {
              setMenu(false);
              onCorrect();
            },
          },
        ]
      : []),
    ...extra.map(({ keep, ...it }) => ({
      ...it,
      onClick: () => {
        if (!keep) setMenu(false);
        it.onClick();
      },
    })),
    ...(isAdmin && m.status !== 'void' ? [{ key: 'anular', icon: Ban, label: 'Anular', hint: 'No cuenta para la tabla', onClick: () => void doVoid(), busy: pending.isBusy('void') }] : []),
    ...(isAdmin ? [{ key: 'borrar', icon: Trash2, label: 'Borrar el partido', onClick: () => void doDelete(), busy: pending.isBusy('delete'), danger: true }] : []),
  ];
  if (!items.length) return null;

  return (
    <>
      <MoreButton onClick={() => !waiting && setMenu(true)} />
      <EventMenu open={menu} onClose={() => setMenu(false)} title="Partido" items={items} />

      <WalkoverDialog
        open={dialog === 'walkover'}
        match={m}
        busy={busy}
        onClose={() => setDialog(null)}
        onSave={(absent, note) =>
          act(() => setWalkover(lid, m.id, absent, { score: absent === 0 ? undefined : walkoverScore(sport, m.rules, absent), note }), 'W.O. anotado')
        }
      />
      <NoteDialog
        open={dialog === 'postpone'}
        title="Aplazar el partido"
        hint="Queda sin fecha hasta que lo reprogrames. Avísale a los jugadores el motivo."
        placeholder={`Lluvia, no hay ${w.one}…`}
        busy={busy}
        onClose={() => setDialog(null)}
        onSave={(note) => act(() => postponeMatch(lid, m.id, note), 'Partido aplazado')}
      />
      <RescheduleDialog
        open={dialog === 'reschedule'}
        match={m}
        words={w}
        tz={league.tz}
        busy={busy}
        onClose={() => setDialog(null)}
        onSave={(iso, court, note) => act(() => rescheduleMatch(lid, m.id, iso, { court, note }), 'Partido reprogramado')}
      />
      <PlayersDialog open={dialog === 'players'} match={m} busy={busy} onClose={() => setDialog(null)} onSave={(side, ids) => act(() => setMatchPlayers(lid, m.id, side, ids.map((playerId) => ({ playerId }))), 'Jugadores guardados')} />
    </>
  );
}

/** El pie de las hojas del partido: Cancelar y lo que guarda, del mismo tamaño. */
function SheetFooter({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <Button variant="quiet" size="lg" className="flex-1" onClick={onClose}>
        Cancelar
      </Button>
      {children}
    </div>
  );
}

function WalkoverDialog({ open, match, busy, onClose, onSave }: { open: boolean; match: Match; busy: boolean; onClose: () => void; onSave: (absent: 0 | 1 | 2, note: string) => void }) {
  const [absent, setAbsent] = useState<0 | 1 | 2>(2);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (open) setNote('');
  }, [open]);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="W.O.: ¿quién no se presentó?"
      subtitle="El que vino gana 6-0 6-0; el que faltó suma 0"
      footer={
        <SheetFooter onClose={onClose}>
          <Button variant="primary" size="lg" className="flex-1" loading={busy} onClick={() => onSave(absent, note)}>
            Anotar W.O.
          </Button>
        </SheetFooter>
      }
    >
      <div className="flex flex-col gap-3">
        <div role="radiogroup" aria-label="Quién no vino" className="flex flex-col gap-2">
          {([1, 2, 0] as const).map((a) => (
            <OptionRow key={a} on={absent === a} onPick={() => setAbsent(a)}>
              {a === 0 ? 'No vino ninguno de los dos' : `No vino ${match.sides[a - 1].label}`}
            </OptionRow>
          ))}
        </div>
        <Field label="Nota (opcional)">
          <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="No llegaron a la hora" />
        </Field>
      </div>
    </Sheet>
  );
}

function NoteDialog({
  open,
  title,
  hint,
  placeholder,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  hint: string;
  placeholder: string;
  busy: boolean;
  onClose: () => void;
  onSave: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  useEffect(() => {
    if (open) setNote('');
  }, [open]);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <SheetFooter onClose={onClose}>
          <Button variant="primary" size="lg" className="flex-1" loading={busy} onClick={() => onSave(note)}>
            Guardar
          </Button>
        </SheetFooter>
      }
    >
      <Field label="Motivo (opcional)" hint={hint}>
        <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} />
      </Field>
    </Sheet>
  );
}

function RescheduleDialog({
  open,
  match,
  words: w,
  tz,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  match: Match;
  /** «cancha» o «mesa» (ver courtWords). */
  words: ReturnType<typeof courtWords>;
  tz?: string;
  busy: boolean;
  onClose: () => void;
  onSave: (iso: string, court: string, note: string) => void;
}) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('20:00');
  const [court, setCourt] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!open) return;
    const p = localParts(match.scheduledAt, tz);
    setDate(p?.date ?? todayIn(tz));
    setTime(p?.time ?? '20:00');
    setCourt(match.court);
    setNote('');
  }, [open, match.scheduledAt, match.court, tz]);
  const iso = zonedIso(date, time, tz);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Fecha, hora y ${w.one}`}
      footer={
        <SheetFooter onClose={onClose}>
          <Button variant="primary" size="lg" className="flex-1" loading={busy} disabled={!iso} onClick={() => iso && onSave(iso, court.trim(), note)}>
            Guardar
          </Button>
        </SheetFooter>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Hora">
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label={w.One} className="col-span-2">
          <Input value={court} maxLength={40} onChange={(e) => setCourt(e.target.value)} placeholder={`${w.One} 2`} />
        </Field>
        <Field label="Nota para los jugadores (opcional)" className="col-span-2">
          <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Se pasó por lluvia" />
        </Field>
      </div>
    </Sheet>
  );
}

/** Quién jugó en cada lado (el suplente también: la pareja suma y las estadísticas van a quien jugó). */
function PlayersDialog({ open, match, busy, onClose, onSave }: { open: boolean; match: Match; busy: boolean; onClose: () => void; onSave: (side: Side, ids: string[]) => void }) {
  const names = useNames();
  const [side, setSide] = useState<Side>(1);
  const [picked, setPicked] = useState<string[]>([]);
  const { doubles } = useRacket();
  const size = doubles ? 2 : 1;
  useEffect(() => {
    if (open) setPicked(match.sides[side - 1].players.map((p) => p.playerId));
  }, [open, side, match.sides]);
  const s = match.sides[side - 1];
  const roster = s.teamId ? names.rosterOf(s.teamId) : [];
  const options = useMemo(() => {
    const first = new Set([...roster, ...picked]);
    return [...names.players].sort((a, b) => Number(first.has(b.id)) - Number(first.has(a.id)) || a.name.localeCompare(b.name, 'es'));
  }, [names.players, roster, picked]);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Quién juega"
      subtitle={size === 2 ? 'Con suplente, la pareja suma igual' : undefined}
      footer={
        <SheetFooter onClose={onClose}>
          <Button variant="primary" size="lg" className="flex-1" loading={busy} disabled={!picked.length} onClick={() => onSave(side, picked)}>
            Guardar
          </Button>
        </SheetFooter>
      }
    >
      <div className="flex flex-col gap-3">
        <Segmented
          full
          label="Lado"
          options={[
            { key: '1', label: <span className="truncate">{match.sides[0].label}</span> },
            { key: '2', label: <span className="truncate">{match.sides[1].label}</span> },
          ]}
          value={side === 1 ? '1' : '2'}
          onChange={(k) => setSide(k === '1' ? 1 : 2)}
        />
        <p className="text-[13px] text-muted">Elige {size === 2 ? 'los dos que juegan' : 'quién juega'}. Las estadísticas van a quien jugó.</p>
        {[0, 1].slice(0, size).map((i) => (
          <Field key={i} label={size === 2 ? `Jugador ${i + 1}` : 'Jugador'}>
            <Select
              value={picked[i] ?? ''}
              onChange={(e) => {
                const next = [...picked];
                next[i] = e.target.value;
                setPicked(next.filter(Boolean));
              }}
            >
              <option value="">(nadie)</option>
              {options.map((p) => (
                <option key={p.id} value={p.id} disabled={picked.includes(p.id) && picked[i] !== p.id}>
                  {p.name}
                  {roster.includes(p.id) ? ' (de la pareja)' : ''}
                </option>
              ))}
            </Select>
          </Field>
        ))}
      </div>
    </Sheet>
  );
}

/** Una opción de una lista para elegir una sola (W.O.: quién no vino). */
function OptionRow({ on, onPick, children }: { on: boolean; onPick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onPick}
      className={cx(
        'flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 text-left text-[15px] font-semibold transition active:scale-[0.99]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        on ? 'bg-accent-soft text-accent' : 'bg-surface-2',
      )}
    >
      <span aria-hidden="true" className={cx('grid size-6 shrink-0 place-items-center rounded-full', on ? 'bg-accent text-accent-fg' : 'shadow-[inset_0_0_0_1.5px_var(--faint)]')}>
        {on && <Check className="size-4" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}
