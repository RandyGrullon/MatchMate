import { useState } from 'react';
import { Ban, CalendarClock, ClipboardPen, Gavel, PauseCircle, Settings2, Trash2, UserCheck } from 'lucide-react';
import { deleteMatch, hasResult, isOpen, postponeMatch, rescheduleMatch, setWalkover, voidMatch, type Match, type MatchScore } from '../../../lib/data/matches';
import { setMatchOfficial } from '../../../lib/data/teamSports';
import { dayKey } from '../../../components/match/format';
import { ResultEntryModal, type ResultParser } from '../../../components/match';
import { useAction, useFeedback } from '../../../components/feedback';
import { Badge, Button, Card, Field, Input, Modal, Select } from '../../../components/ui';
import { scorerCandidates } from './logic';
import { isIsoDate, localTime, matchClashes, zonedIso } from './schedule';
import type { TeamLeague } from './useTeamLeague';

/**
 * Lo que el admin hace con un partido de equipos: anotador de mesa designado, reprogramar, aplazar, W.O. (con el
 * marcador del deporte), corregir el resultado o decidir una disputa, anular y borrar.
 */
export function MatchAdminPanel({
  tl,
  match: m,
  parser,
  placeholder,
  walkoverScore,
  minutes = 90,
  onDeleted,
}: {
  tl: TeamLeague;
  match: Match;
  /** Lector de «solo resultado» del deporte (78-72, 2-1). */
  parser: ResultParser;
  placeholder: string;
  /** Marcador del W.O. del deporte (20-0, 3-0) según quién no vino (0 = ninguno). */
  walkoverScore: (absent: 0 | 1 | 2) => MatchScore;
  minutes?: number;
  onDeleted?: () => void;
}) {
  const run = useAction();
  const { confirm } = useFeedback();
  const [modal, setModal] = useState<'reprogramar' | 'wo' | 'corregir' | 'resolver' | null>(null);
  const official = tl.officialOf(m.id);
  const candidates = scorerCandidates(m, tl.teams.data, tl.members.data, tl.players.data);
  const open = isOpen(m) || m.status === 'postponed';
  const name = (side: 1 | 2) => tl.teamOf(m.sides[side - 1].teamId)?.name ?? m.sides[side - 1].label;

  const setOfficial = (uid: string) => run(() => setMatchOfficial(tl.lid, m.id, uid || null), uid ? 'Anotador de mesa designado' : 'Sin anotador designado');
  const postpone = async () => {
    const yes = await confirm({ title: 'Aplazar el partido', message: 'Queda sin fecha hasta que lo reprogrames. Se avisa a los equipos al abrir la app.', confirmText: 'Aplazar' });
    if (yes) await run(() => postponeMatch(tl.lid, m.id), 'Partido aplazado');
  };
  const voidIt = async () => {
    const yes = await confirm({ title: 'Anular el partido', message: 'No cuenta para la tabla ni para las estadísticas. Se puede deshacer corrigiendo el resultado.', confirmText: 'Anular', danger: true });
    if (yes) await run(() => voidMatch(tl.lid, m.id), 'Partido anulado');
  };
  const remove = async () => {
    const yes = await confirm({ title: 'Borrar el partido', message: 'Se borra con su convocatoria y su marcador. Esto no se puede deshacer.', confirmText: 'Borrar', danger: true });
    if (!yes) return;
    const ok = await run(async () => {
      await deleteMatch(tl.lid, m.id);
      return true;
    }, 'Partido borrado');
    if (ok) onDeleted?.();
  };

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <Settings2 className="size-5 text-accent" />
        <h3 className="flex-1 font-semibold">Admin del partido</h3>
      </div>

      {open && (
        <Field
          label="Anotador de mesa"
          hint={
            official
              ? 'Si termina el partido quien está designado, el resultado queda final (no espera al rival).'
              : 'Admins, anotadores de la liga o capitanes y delegados de estos dos equipos. Para otra persona, hazla anotadora de la liga en Miembros.'
          }
        >
          <Select value={official?.userId ?? ''} onChange={(e) => void setOfficial(e.target.value)}>
            <option value="">Sin designar</option>
            {official && !candidates.some((c) => c.uid === official.userId) && <option value={official.userId}>{official.name || 'Designado'}</option>}
            {candidates.map((c) => (
              <option key={c.uid} value={c.uid}>
                {c.name} · {c.why}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <div className="flex flex-wrap gap-2">
        {(m.status === 'scheduled' || m.status === 'postponed' || m.status === 'suspended') && (
          <Button size="sm" icon={<CalendarClock className="size-4" />} onClick={() => setModal('reprogramar')}>
            Reprogramar
          </Button>
        )}
        {(m.status === 'scheduled' || m.status === 'suspended') && (
          <Button size="sm" icon={<PauseCircle className="size-4" />} onClick={() => void postpone()}>
            Aplazar
          </Button>
        )}
        {!hasResult(m) && m.status !== 'void' && (
          <Button size="sm" icon={<UserCheck className="size-4" />} onClick={() => setModal('wo')}>
            W.O.
          </Button>
        )}
        {m.status === 'disputed' && (
          <Button size="sm" variant="primary" icon={<Gavel className="size-4" />} onClick={() => setModal('resolver')}>
            Decidir el reclamo
          </Button>
        )}
        <Button size="sm" icon={<ClipboardPen className="size-4" />} onClick={() => setModal('corregir')}>
          {hasResult(m) ? 'Corregir resultado' : 'Poner resultado'}
        </Button>
        {m.status !== 'void' && (
          <Button size="sm" variant="ghost" icon={<Ban className="size-4" />} onClick={() => void voidIt()}>
            Anular
          </Button>
        )}
        <Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="size-4" />} onClick={() => void remove()}>
          Borrar
        </Button>
      </div>

      <RescheduleModal tl={tl} match={m} minutes={minutes} open={modal === 'reprogramar'} onClose={() => setModal(null)} />
      <WalkoverModal open={modal === 'wo'} onClose={() => setModal(null)} names={[name(1), name(2)]} onPick={(absent) => run(() => setWalkover(tl.lid, m.id, absent, { score: walkoverScore(absent) }), 'W.O. anotado')} />
      <ResultEntryModal
        open={modal === 'corregir' || modal === 'resolver'}
        onClose={() => setModal(null)}
        lid={tl.lid}
        match={m}
        parser={parser}
        placeholder={placeholder}
        mode={modal === 'resolver' ? 'resolve' : 'correct'}
        hint={`Primero ${name(1)}, después ${name(2)}. Queda confirmado.`}
      />
    </Card>
  );
}

function RescheduleModal({ tl, match: m, minutes, open, onClose }: { tl: TeamLeague; match: Match; minutes: number; open: boolean; onClose: () => void }) {
  const run = useAction();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('19:00');
  const [court, setCourt] = useState(m.court);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDate(dayKey(m.scheduledAt, tl.tz) ?? '');
      setTime(m.scheduledAt ? localTime(m.scheduledAt, tl.tz) : '19:00');
      setCourt(m.court);
      setNote('');
    }
  }
  const valid = isIsoDate(date) && /^\d{2}:\d{2}$/.test(time);
  const teams = m.sides.map((s) => s.teamId).filter((x): x is string => !!x);
  const clashes = valid ? matchClashes({ id: m.id, date, time, court: court.trim() || null, teams }, tl.matches.data, minutes, tl.tz) : [];
  const save = async () => {
    setBusy(true);
    const ok = await run(async () => {
      await rescheduleMatch(tl.lid, m.id, zonedIso(date, time, tl.tz), { court: court.trim().slice(0, 40), note });
      return true;
    }, 'Partido reprogramado');
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reprogramar"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={!valid} onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fecha">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Hora">
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Cancha" className="sm:col-span-2">
          <Input value={court} maxLength={40} onChange={(e) => setCourt(e.target.value)} />
        </Field>
        <Field label="Aviso (opcional)" className="sm:col-span-2">
          <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Se cambió por la lluvia" />
        </Field>
        {clashes.length > 0 && (
          <p className="sm:col-span-2">
            <Badge tone="warn">Choca con otro partido a esa hora</Badge>
          </p>
        )}
      </div>
    </Modal>
  );
}

function WalkoverModal({ open, onClose, names, onPick }: { open: boolean; onClose: () => void; names: [string, string]; onPick: (absent: 0 | 1 | 2) => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const pick = async (absent: 0 | 1 | 2) => {
    setBusy(true);
    await onPick(absent);
    setBusy(false);
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="W.O.: ¿quién no se presentó?" footer={<Button onClick={onClose}>Cancelar</Button>}>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted">El que no vino pierde por forfeit (0 puntos en la tabla).</p>
        <Button className="h-12 justify-start" disabled={busy} onClick={() => void pick(1)}>
          No vino {names[0]}
        </Button>
        <Button className="h-12 justify-start" disabled={busy} onClick={() => void pick(2)}>
          No vino {names[1]}
        </Button>
        <Button className="h-12 justify-start" variant="ghost" disabled={busy} onClick={() => void pick(0)}>
          No vino ninguno
        </Button>
      </div>
    </Modal>
  );
}
