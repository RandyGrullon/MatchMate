import { useState } from 'react';
import { Ban, CalendarClock, Check, ClipboardPen, Gavel, PauseCircle, Trash2, UserCheck, UserX } from 'lucide-react';
import { deleteMatch, hasResult, isOpen, postponeMatch, rescheduleMatch, resolveDispute, setWalkover, voidMatch, type Match, type MatchScore } from '../../../lib/data/matches';
import { setMatchOfficial, type MatchOfficial } from '../../../lib/data/teamSports';
import { dayKey } from '../../../components/match/format';
import { ResultEntryModal, type ResultParser } from '../../../components/match';
import { BusyIcon, useBusy } from '../../../components/busy';
import { EventMenu, MoreButton, type MenuItem } from '../../../components/event/EventHeader';
import { useAction, useFeedback } from '../../../components/feedback';
import { Badge, Button, Card, Field, Input, Sheet, cx } from '../../../components/ui';
import { scorerCandidates, type ScorerCandidate } from './logic';
import { isIsoDate, localTime, matchClashes, zonedIso } from './schedule';
import type { TeamLeague } from './useTeamLeague';

/** Una opción de «•••» que trae la pantalla (compartir, el acta completa). `keep`: el menú no se cierra al tocarla. */
export interface MatchMenuItem extends MenuItem {
  keep?: boolean;
}

/** Lo del admin en «•••» de un partido. */
export type AdminMenuKey = 'anotador' | 'reprogramar' | 'aplazar' | 'wo' | 'resolver' | 'corregir' | 'anular' | 'borrar';

/**
 * Qué puede hacer el admin con el partido según cómo está (puro, se prueba solo): el anotador de mesa y reprogramar
 * mientras no se juega, aplazar, W.O. si no tiene resultado, decidir un reclamo, poner o corregir el resultado, anular y
 * borrar (al final, en rojo). `official`: el nombre del anotador designado (o null); `first`: el equipo local.
 */
export function adminMenuEntries(
  m: Pick<Match, 'status' | 'scheduledAt'>,
  { official, first }: { official: string | null; first: string },
): { key: AdminMenuKey; label: string; hint?: string; danger?: boolean }[] {
  const open = isOpen(m) || m.status === 'postponed';
  return [
    ...(open ? [{ key: 'anotador' as const, label: 'Anotador de mesa', hint: official ?? 'Sin designar' }] : []),
    ...(m.status === 'scheduled' || m.status === 'postponed' || m.status === 'suspended'
      ? [{ key: 'reprogramar' as const, label: m.scheduledAt ? 'Reprogramar' : 'Poner fecha', hint: 'Fecha, hora y cancha' }]
      : []),
    ...(m.status === 'scheduled' || m.status === 'suspended' ? [{ key: 'aplazar' as const, label: 'Aplazar', hint: 'Queda sin fecha' }] : []),
    ...(!hasResult(m) && m.status !== 'void' ? [{ key: 'wo' as const, label: 'W.O.', hint: 'Quién no se presentó' }] : []),
    ...(m.status === 'disputed' ? [{ key: 'resolver' as const, label: 'Decidir el reclamo', hint: 'Queda confirmado' }] : []),
    { key: 'corregir' as const, label: hasResult(m) ? 'Corregir resultado' : 'Poner resultado', hint: `Primero ${first}` },
    ...(m.status !== 'void' ? [{ key: 'anular' as const, label: 'Anular', hint: 'No cuenta para la tabla' }] : []),
    { key: 'borrar' as const, label: 'Borrar el partido', danger: true },
  ];
}

/**
 * «•••» de un partido de equipos (rediseño «Calma y foco»: lo del admin ya no es una tarjeta llena de botones). Para
 * todos, lo que pase la pantalla (`extra`: compartir el resultado, el acta completa); para el admin, el anotador de
 * mesa designado, reprogramar, aplazar, W.O. (con el marcador del deporte), poner o corregir el resultado, decidir un
 * reclamo, corregir el acta (`extraAdmin`, el fútbol), anular y, al final y en rojo, borrar. Cada cosa abre su hoja.
 * Sin nada que mostrar, no sale el botón.
 */
export function MatchMenu({
  tl,
  match: m,
  parser,
  placeholder,
  walkoverScore,
  minutes = 90,
  onDeleted,
  extra = [],
  extraAdmin = [],
  title,
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
  extra?: readonly MatchMenuItem[];
  extraAdmin?: readonly MatchMenuItem[];
  /** El título de la hoja («Tigres vs. Leones»). */
  title: string;
}) {
  const run = useAction();
  const { confirm } = useFeedback();
  // La ruedita en lo que espera; lo demás no se toca mientras tanto.
  const busy = useBusy<'aplazar' | 'anular' | 'borrar'>();
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<'anotador' | 'reprogramar' | 'wo' | 'corregir' | 'resolver' | null>(null);
  const official = tl.officialOf(m.id);
  const name = (side: 1 | 2) => tl.teamOf(m.sides[side - 1].teamId)?.name ?? m.sides[side - 1].label;
  const pick = (s: typeof sheet) => {
    setMenu(false);
    setSheet(s);
  };

  const postpone = async () => {
    setMenu(false);
    const yes = await confirm({ title: 'Aplazar el partido', message: 'Queda sin fecha hasta que lo reprogrames. Se avisa a los equipos al abrir la app.', confirmText: 'Aplazar' });
    if (yes) await busy.run('aplazar', () => run(() => postponeMatch(tl.lid, m.id), 'Partido aplazado'));
  };
  const voidIt = async () => {
    setMenu(false);
    const yes = await confirm({ title: 'Anular el partido', message: 'No cuenta para la tabla ni para las estadísticas. Se puede deshacer corrigiendo el resultado.', confirmText: 'Anular', danger: true });
    if (yes) await busy.run('anular', () => run(() => voidMatch(tl.lid, m.id), 'Partido anulado'));
  };
  const remove = async () => {
    setMenu(false);
    const yes = await confirm({ title: 'Borrar el partido', message: 'Se borra con su convocatoria y su marcador. Esto no se puede deshacer.', confirmText: 'Borrar', danger: true });
    if (!yes) return;
    const ok = await busy.run('borrar', () =>
      run(async () => {
        await deleteMatch(tl.lid, m.id);
        return true;
      }, 'Partido borrado'),
    );
    if (ok) onDeleted?.();
  };

  const withClose = (list: readonly MatchMenuItem[]): MenuItem[] =>
    list.map(({ keep, ...it }) => ({
      ...it,
      onClick: () => {
        if (!keep) setMenu(false);
        it.onClick();
      },
    }));

  const admin = tl.isAdmin;
  const icons: Record<AdminMenuKey, MenuItem['icon']> = {
    anotador: UserCheck,
    reprogramar: CalendarClock,
    aplazar: PauseCircle,
    wo: UserX,
    resolver: Gavel,
    corregir: ClipboardPen,
    anular: Ban,
    borrar: Trash2,
  };
  const act: Record<AdminMenuKey, () => void> = {
    anotador: () => pick('anotador'),
    reprogramar: () => pick('reprogramar'),
    aplazar: () => void postpone(),
    wo: () => pick('wo'),
    resolver: () => pick('resolver'),
    corregir: () => pick('corregir'),
    anular: () => void voidIt(),
    borrar: () => void remove(),
  };
  const adminItems: MenuItem[] = admin
    ? adminMenuEntries(m, { official: official ? official.name || 'Designado' : null, first: name(1) }).map((e) => ({
        ...e,
        icon: icons[e.key],
        onClick: act[e.key],
        busy: e.key === 'aplazar' || e.key === 'anular' || e.key === 'borrar' ? busy.isBusy(e.key) : undefined,
      }))
    : [];
  // Lo del deporte para el admin (corregir el acta) va antes de anular y borrar.
  const tail = adminItems.filter((it) => it.key === 'anular' || it.key === 'borrar');
  const items: MenuItem[] = [...withClose(extra), ...adminItems.filter((it) => !tail.includes(it)), ...(admin ? withClose(extraAdmin) : []), ...tail];
  if (!items.length) return null;

  return (
    <>
      <MoreButton onClick={() => setMenu(true)} />
      <EventMenu open={menu} onClose={() => setMenu(false)} title={title} items={items} />
      {admin && (
        <>
          <OfficialSheet tl={tl} match={m} open={sheet === 'anotador'} onClose={() => setSheet(null)} />
          <RescheduleSheet tl={tl} match={m} minutes={minutes} open={sheet === 'reprogramar'} onClose={() => setSheet(null)} />
          <WalkoverSheet
            open={sheet === 'wo'}
            onClose={() => setSheet(null)}
            names={[name(1), name(2)]}
            onPick={(absent) => run(() => setWalkover(tl.lid, m.id, absent, { score: walkoverScore(absent) }), 'W.O. anotado')}
          />
          <ResultEntryModal
            open={sheet === 'corregir' || sheet === 'resolver'}
            onClose={() => setSheet(null)}
            lid={tl.lid}
            match={m}
            parser={parser}
            placeholder={placeholder}
            mode={sheet === 'resolver' ? 'resolve' : 'correct'}
            hint={`Primero ${name(1)}, después ${name(2)}. Queda confirmado.`}
          />
        </>
      )}
    </>
  );
}

/**
 * Quién anota el partido en la mesa: «Sin designar» o uno de los que pueden (admins, anotadores de la liga, capitanes
 * y delegados de los dos equipos), como filas para tocar. Si termina el partido quien está designado, el resultado
 * queda final. Mientras se guarda, la ruedita en esa fila.
 */
export function OfficialSheet({ tl, match: m, open, onClose }: { tl: TeamLeague; match: Match; open: boolean; onClose: () => void }) {
  const official = tl.officialOf(m.id);
  const candidates = scorerCandidates(m, tl.allTeams.data, tl.members.data, tl.players.data);
  const names = [tl.teamOf(m.sides[0].teamId)?.name ?? m.sides[0].label, tl.teamOf(m.sides[1].teamId)?.name ?? m.sides[1].label];
  return (
    <Sheet open={open} onClose={onClose} title="Anotador de mesa" subtitle={`${names[0]} vs. ${names[1]}`}>
      <OfficialPicker tl={tl} match={m} official={official} candidates={candidates} onDone={onClose} />
      <p className="mt-3 text-[13px] text-muted">Si termina el partido quien está designado, el resultado queda final. Para otra persona, hazla anotadora en Miembros.</p>
    </Sheet>
  );
}

/** La lista para elegir al anotador (sin estado propio fuera de la ruedita: se prueba sola). */
export function OfficialPicker({
  tl,
  match: m,
  official,
  candidates,
  onDone,
}: {
  tl: Pick<TeamLeague, 'lid'>;
  match: Pick<Match, 'id'>;
  official: MatchOfficial | null;
  candidates: readonly ScorerCandidate[];
  onDone?: () => void;
}) {
  const run = useAction();
  const saving = useBusy();
  const list: { uid: string; name: string; why: string }[] = [
    { uid: '', name: 'Sin designar', why: 'Cualquiera que pueda abre la mesa' },
    ...(official && !candidates.some((c) => c.uid === official.userId) ? [{ uid: official.userId, name: official.name || 'Designado', why: 'Designado' }] : []),
    ...candidates,
  ];
  const current = official?.userId ?? '';
  const choose = (uid: string) =>
    saving.run(uid || 'nadie', async () => {
      if (uid === current) return onDone?.();
      const ok = await run(async () => {
        await setMatchOfficial(tl.lid, m.id, uid || null);
        return true;
      }, uid ? 'Anotador de mesa designado' : 'Sin anotador designado');
      if (ok) onDone?.();
    });
  return (
    <ul role="radiogroup" aria-label="Anotador de mesa" className="-mx-2 flex flex-col">
      {list.map((c) => {
        const on = c.uid === current;
        const key = c.uid || 'nadie';
        return (
          <li key={key}>
            <button
              type="button"
              role="radio"
              aria-checked={on}
              disabled={saving.isBusy()}
              onClick={() => void choose(c.uid)}
              className={cx(
                'flex min-h-14 w-full items-center gap-3.5 rounded-2xl px-2 py-2 text-left transition hover:bg-surface-2 active:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-70',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-semibold">{c.name}</span>
                <span className="block truncate text-[13px] text-muted">{c.why}</span>
              </span>
              <span aria-hidden="true" className={cx('grid size-6 shrink-0 place-items-center rounded-full', on ? 'bg-accent text-accent-fg' : 'shadow-[inset_0_0_0_1.5px_var(--faint)]')}>
                <BusyIcon busy={saving.isBusy(key)} icon={on ? <Check className="size-4" strokeWidth={2.6} /> : null} className="size-4" />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function RescheduleSheet({ tl, match: m, minutes, open, onClose }: { tl: TeamLeague; match: Match; minutes: number; open: boolean; onClose: () => void }) {
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
    <Sheet
      open={open}
      onClose={onClose}
      title={m.scheduledAt ? 'Reprogramar' : 'Poner fecha'}
      footer={
        <Button variant="primary" size="lg" className="w-full" loading={busy} disabled={!valid} onClick={() => void save()}>
          Guardar
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Hora">
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Cancha" className="col-span-2">
          <Input value={court} maxLength={40} onChange={(e) => setCourt(e.target.value)} />
        </Field>
        <Field label="Aviso (opcional)" className="col-span-2">
          <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Se cambió por la lluvia" />
        </Field>
        {clashes.length > 0 && (
          <p className="col-span-2">
            <Badge tone="warn">Choca con otro partido a esa hora</Badge>
          </p>
        )}
      </div>
    </Sheet>
  );
}

function WalkoverSheet({ open, onClose, names, onPick }: { open: boolean; onClose: () => void; names: [string, string]; onPick: (absent: 0 | 1 | 2) => Promise<unknown> }) {
  // La ruedita en el que se tocó (antes solo se apagaban los tres).
  const busy = useBusy<0 | 1 | 2>();
  const pick = (absent: 0 | 1 | 2) =>
    busy.run(absent, async () => {
      await onPick(absent);
      onClose();
    });
  const row = (absent: 0 | 1 | 2, label: string) => (
    <li>
      <button
        type="button"
        disabled={busy.isBusy()}
        onClick={() => void pick(absent)}
        className="flex min-h-14 w-full items-center gap-3.5 rounded-2xl px-2 py-2 text-left transition hover:bg-surface-2 active:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-70"
      >
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg-2">
          <BusyIcon busy={busy.isBusy(absent)} icon={<UserX className="size-5" />} className="size-5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-body font-semibold">{label}</span>
      </button>
    </li>
  );
  return (
    <Sheet open={open} onClose={onClose} title="¿Quién no se presentó?" subtitle="Pierde por forfeit (0 puntos en la tabla)">
      <ul className="-mx-2 flex flex-col">
        {row(1, `No vino ${names[0]}`)}
        {row(2, `No vino ${names[1]}`)}
        {row(0, 'No vino ninguno')}
      </ul>
    </Sheet>
  );
}

/**
 * Un resultado en disputa, para el admin (como en raqueta): «En disputa» en rojo con lo que dijo el rival, «Dejar lo
 * anotado» (confirma lo que se propuso) y «Decidir el reclamo» (pone el marcador que vale). Para los demás no sale.
 */
export function DisputeCard({
  tl,
  match: m,
  parser,
  placeholder,
  className,
}: {
  tl: TeamLeague;
  match: Match;
  parser: ResultParser;
  placeholder: string;
  className?: string;
}) {
  const run = useAction();
  const [deciding, setDeciding] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!tl.isAdmin || m.status !== 'disputed') return null;
  const name = (side: 1 | 2) => tl.teamOf(m.sides[side - 1].teamId)?.name ?? m.sides[side - 1].label;
  const keep = async () => {
    setBusy(true);
    await run(() => resolveDispute(tl.lid, m.id, {}), 'Queda lo anotado');
    setBusy(false);
  };
  return (
    <Card className={cx('px-[18px] pt-4 pb-[18px]', className)}>
      <p className="inline-flex items-center gap-2 text-sm font-[650] text-danger">
        <Gavel aria-hidden="true" className="size-4" />
        En disputa
      </p>
      <p className="mt-2 text-body">{m.disputeNote ? `«${m.disputeNote}»` : 'El rival dice que el resultado no es así.'}</p>
      <div className="mt-4 flex gap-2.5">
        <Button variant="quiet" size="lg" className="flex-1" loading={busy} onClick={() => void keep()}>
          Dejar lo anotado
        </Button>
        <Button variant="primary" size="lg" className="flex-1" disabled={busy} onClick={() => setDeciding(true)}>
          Decidir el reclamo
        </Button>
      </div>
      <ResultEntryModal
        open={deciding}
        onClose={() => setDeciding(false)}
        lid={tl.lid}
        match={m}
        parser={parser}
        placeholder={placeholder}
        mode="resolve"
        hint={`Primero ${name(1)}, después ${name(2)}. Queda confirmado.`}
      />
    </Card>
  );
}
