import { useEffect, useMemo, useState } from 'react';
import { Ban, CalendarClock, CircleSlash, Pause, Trash2, UserRoundCog } from 'lucide-react';
import {
  deleteMatch,
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
import { Button, Field, Input, Modal, Select } from '../../../../components/ui';
import { walkoverScore } from '../court/adapters';
import { isPointsMatch } from '../logic/results';
import { localParts, todayIn, zonedIso } from '../logic/time';
import { useNames } from '../names';
import { courtWords, useRacket } from '../sport';

type Dialog = null | 'walkover' | 'postpone' | 'reschedule' | 'players';
/** Qué se está guardando: lo del diálogo abierto, anular o borrar (la ruedita va en ese botón). */
type Pending = 'dialog' | 'void' | 'delete';

/**
 * Lo que el admin hace con un partido: W.O., aplazar, reprogramar (fecha, hora y cancha o mesa), anular, quién jugó
 * (suplente) y borrar. Los resultados (anotar, corregir, decidir un reclamo) están en la pantalla del partido.
 */
export function MatchAdmin({ match: m, onDeleted }: { match: Match; onDeleted: () => void }) {
  const { lid, league } = useLeagueCtx();
  const { sport, ext } = useRacket();
  const w = courtWords(ext);
  const { toast, confirm } = useFeedback();
  const [dialog, setDialog] = useState<Dialog>(null);
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
    if (!(await confirm({ title: '¿Anular el partido?', message: 'No cuenta para la tabla ni las estadísticas. Se puede deshacer corrigiendo el resultado.', confirmText: 'Anular', danger: true }))) return;
    await act(() => voidMatch(lid, m.id), 'Partido anulado', 'void');
  };
  const doDelete = async () => {
    if (!(await confirm({ title: '¿Borrar el partido?', message: 'Se borra con su resultado e historial. No se puede deshacer.', confirmText: 'Borrar', danger: true }))) return;
    if (await act(() => deleteMatch(lid, m.id), 'Partido borrado', 'delete')) onDeleted();
  };

  return (
    <div className="flex flex-wrap gap-2">
      {open && !points && (
        <Button size="sm" icon={<CircleSlash className="size-4" />} disabled={waiting} onClick={() => setDialog('walkover')}>
          W.O.
        </Button>
      )}
      {(m.status === 'scheduled' || m.status === 'suspended') && (
        <Button size="sm" icon={<Pause className="size-4" />} disabled={waiting} onClick={() => setDialog('postpone')}>
          Aplazar
        </Button>
      )}
      {(m.status === 'scheduled' || m.status === 'postponed' || m.status === 'suspended') && (
        <Button size="sm" icon={<CalendarClock className="size-4" />} disabled={waiting} onClick={() => setDialog('reschedule')}>
          {m.scheduledAt ? 'Reprogramar' : `Poner fecha y ${w.one}`}
        </Button>
      )}
      <Button size="sm" icon={<UserRoundCog className="size-4" />} disabled={waiting} onClick={() => setDialog('players')}>
        Quién juega
      </Button>
      {m.status !== 'void' && (
        <Button size="sm" variant="ghost" icon={<Ban className="size-4" />} onClick={() => void doVoid()} loading={pending.isBusy('void')} disabled={waiting}>
          Anular
        </Button>
      )}
      <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => void doDelete()} loading={pending.isBusy('delete')} disabled={waiting}>
        Borrar
      </Button>

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
    <Modal
      open={open}
      onClose={onClose}
      title="W.O.: ¿quién no se presentó?"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={() => onSave(absent, note)}>
            Anotar W.O.
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {([1, 2, 0] as const).map((a) => (
          <label key={a} className="flex min-h-12 items-center gap-3 rounded-xl border border-line px-3">
            <input type="radio" name="wo" checked={absent === a} onChange={() => setAbsent(a)} className="size-5 accent-[var(--accent)]" />
            <span className="text-sm font-medium">{a === 0 ? 'No vino ninguno de los dos' : `No vino ${match.sides[a - 1].label}`}</span>
          </label>
        ))}
        <p className="text-xs text-muted">El que vino gana 6-0 6-0 y el que faltó suma 0 puntos en la tabla.</p>
        <Field label="Nota (opcional)">
          <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="No llegaron a la hora" />
        </Field>
      </div>
    </Modal>
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
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={() => onSave(note)}>
            Guardar
          </Button>
        </>
      }
    >
      <Field label="Motivo (opcional)" hint={hint}>
        <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} />
      </Field>
    </Modal>
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
    <Modal
      open={open}
      onClose={onClose}
      title={`Fecha, hora y ${w.one}`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={!iso} onClick={() => iso && onSave(iso, court.trim(), note)}>
            Guardar
          </Button>
        </>
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
    </Modal>
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
    <Modal
      open={open}
      onClose={onClose}
      title="Quién juega"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={!picked.length} onClick={() => onSave(side, picked)}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Lado">
          <Select value={side} onChange={(e) => setSide(Number(e.target.value) as Side)}>
            <option value={1}>{match.sides[0].label}</option>
            <option value={2}>{match.sides[1].label}</option>
          </Select>
        </Field>
        <p className="text-xs text-muted">
          Elige {size === 2 ? 'los dos que juegan' : 'quién juega'}. Si falta alguien de la pareja, pon al suplente: la pareja suma en la tabla y las
          estadísticas van a quien jugó.
        </p>
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
    </Modal>
  );
}
