import { useState } from 'react';
import { Check, CheckCircle2, Hash, Pencil, X } from 'lucide-react';
import { checkIn, decideEntry, esportsErrorText, updateEntry, type EsportsEntry, type EsportsTournament } from '../../../../lib/data/esports';
import { EntryStatusChip } from '../../../../components/esports/bits';
import { useBusy } from '../../../../components/busy';
import { useFeedback } from '../../../../components/feedback';
import { EventMenu, type MenuItem } from '../../../../components/event/EventHeader';
import { Button, Card, Field, Input, ListRow, SectionHeader, Sheet, Textarea } from '../../../../components/ui';
import { pendingEntries, rosterCount, rosterText } from '../logic';
import { Initials } from '../parts';

/** La línea de un inscrito: «5 titulares · 1 suplente», el individual con su ID, el agente libre con el suyo. */
export function entryLine(e: EsportsEntry): string {
  if (e.kind === 'team') {
    const { starters, subs } = rosterCount(e.members);
    return rosterText(starters, subs);
  }
  return e.members[0]?.gamerTag ?? (e.kind === 'free_agent' ? 'Agente libre' : '');
}

/**
 * Lo del organizador en «Equipos» (Pro + admin, §12.8): los pendientes con «Aprobar» y «Rechazar» (con nota). El menú
 * de cada aprobado (siembra, check-in y nombre) es `EntryAdminSheet`.
 */
export function PendingEntries({ t, entries, className }: { t: EsportsTournament; entries: readonly EsportsEntry[]; className?: string }) {
  const { toast } = useFeedback();
  const busy = useBusy<string>();
  const [rejecting, setRejecting] = useState<EsportsEntry | null>(null);
  const pending = pendingEntries(entries);
  if (!pending.length) return null;
  const approve = (e: EsportsEntry) =>
    busy.run(e.id, async () => {
      try {
        await decideEntry(e.id, true);
        toast(`${e.name} aprobado`);
      } catch (err) {
        toast(esportsErrorText(err, t.game, 'inscripcion'), 'error');
      }
    });
  return (
    <section aria-labelledby="esp-pendientes" className={className}>
      <SectionHeader id="esp-pendientes" title={`Por aprobar (${pending.length})`} />
      <Card className="overflow-hidden">
        {pending.map((e) => (
          <ListRow
            key={e.id}
            dense
            leading={<Initials name={e.name} />}
            title={e.tag ? `${e.name} [${e.tag}]` : e.name}
            subtitle={[e.kind === 'free_agent' ? 'Agente libre' : null, entryLine(e)].filter(Boolean).join(' · ')}
            trailing={
              <span className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setRejecting(e)}
                  disabled={busy.isBusy()}
                  aria-label={`Rechazar a ${e.name}`}
                  className="grid size-11 place-items-center rounded-full bg-surface-2 text-fg-2 transition active:scale-95 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <X aria-hidden="true" className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => void approve(e)}
                  disabled={busy.isBusy()}
                  aria-label={`Aprobar a ${e.name}`}
                  aria-busy={busy.isBusy(e.id) || undefined}
                  className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent transition active:scale-95 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Check aria-hidden="true" className="size-5" strokeWidth={2.6} />
                </button>
              </span>
            }
          />
        ))}
      </Card>
      <RejectSheet t={t} entry={rejecting} onClose={() => setRejecting(null)} />
    </section>
  );
}

/** Rechazar con una nota (opcional) que le llega al capitán. */
function RejectSheet({ t, entry, onClose }: { t: EsportsTournament; entry: EsportsEntry | null; onClose: () => void }) {
  const { toast } = useFeedback();
  const busy = useBusy<'rechazar'>();
  const [note, setNote] = useState('');
  const reject = () =>
    busy.run('rechazar', async () => {
      if (!entry) return;
      try {
        await decideEntry(entry.id, false, note);
        toast('Inscripción rechazada');
        setNote('');
        onClose();
      } catch (e) {
        toast(esportsErrorText(e, t.game, 'inscripcion'), 'error');
      }
    });
  return (
    <Sheet
      open={!!entry}
      onClose={onClose}
      title={entry ? `¿Rechazar a ${entry.name}?` : ''}
      subtitle="Le llega el aviso con tu nota"
      footer={
        <div className="flex gap-2.5">
          <Button variant="quiet" size="lg" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" size="lg" className="flex-1" loading={busy.isBusy('rechazar')} onClick={() => void reject()}>
            Rechazar
          </Button>
        </div>
      }
    >
      <Field label="Nota (opcional)" hint="Ejemplo: falta un titular con su ID de juego.">
        <Textarea className="min-h-20" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Sheet>
  );
}

type Panel = null | 'menu' | 'seed' | 'name';

/** El menú de un inscrito para quien organiza: «Cambiar siembra», «Quitar check-in» (o marcarlo) y «Editar nombre». */
export function EntryAdminSheet({ t, entry, onClose }: { t: EsportsTournament; entry: EsportsEntry | null; onClose: () => void }) {
  const [panel, setPanel] = useState<Panel>('menu');
  const close = () => {
    setPanel('menu');
    onClose();
  };
  if (!entry) return null;
  return (
    <>
      <EntryMenu t={t} entry={entry} open={panel === 'menu'} onClose={close} onPick={setPanel} />
      <SeedEdit t={t} entry={entry} open={panel === 'seed'} onClose={close} />
      <NameEdit t={t} entry={entry} open={panel === 'name'} onClose={close} />
    </>
  );
}

function EntryMenu({ t, entry, open, onClose, onPick }: { t: EsportsTournament; entry: EsportsEntry; open: boolean; onClose: () => void; onPick: (p: Panel) => void }) {
  const { toast } = useFeedback();
  const busy = useBusy<'checkin'>();
  const toggleCheckin = () =>
    busy.run('checkin', async () => {
      try {
        await checkIn(entry.id, !!entry.checkedInAt);
        toast(entry.checkedInAt ? 'Check-in quitado' : 'Check-in hecho');
        onClose();
      } catch (e) {
        toast(esportsErrorText(e, t.game, 'inscripcion'), 'error');
      }
    });
  const items: MenuItem[] = [
    ...(entry.status === 'approved' && entry.kind !== 'free_agent' ? [{ key: 'seed', icon: Hash, label: 'Cambiar siembra', hint: entry.seed ? `Ahora: ${entry.seed}` : 'Sin siembra', onClick: () => onPick('seed') }] : []),
    ...(entry.status === 'approved' && t.checkinMinutes
      ? [{ key: 'checkin', icon: CheckCircle2, label: entry.checkedInAt ? 'Quitar check-in' : 'Marcar check-in', onClick: () => void toggleCheckin(), busy: busy.isBusy('checkin') }]
      : []),
    { key: 'name', icon: Pencil, label: 'Editar nombre', hint: entry.tag ? `${entry.name} [${entry.tag}]` : entry.name, onClick: () => onPick('name') },
  ];
  return <EventMenu open={open} onClose={onClose} title={entry.name} items={items} />;
}

function SeedEdit({ t, entry, open, onClose }: { t: EsportsTournament; entry: EsportsEntry; open: boolean; onClose: () => void }) {
  const { toast } = useFeedback();
  const busy = useBusy<'guardar'>();
  const [seed, setSeed] = useState(entry.seed ? String(entry.seed) : '');
  const n = seed.trim() ? Number(seed) : null;
  const ok = n === null || (Number.isInteger(n) && n >= 1 && n <= 128);
  const save = () =>
    busy.run('guardar', async () => {
      try {
        await updateEntry(entry.id, { seed: n });
        toast('Siembra guardada');
        onClose();
      } catch (e) {
        toast(esportsErrorText(e, t.game, 'inscripcion'), 'error');
      }
    });
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Cambiar siembra"
      subtitle={entry.name}
      footer={
        <Button variant="primary" size="lg" className="w-full" disabled={!ok} loading={busy.isBusy('guardar')} onClick={() => void save()}>
          Guardar
        </Button>
      }
    >
      <Field label="Siembra (1 es el mejor; vacío = sin siembra)">
        <Input inputMode="numeric" value={seed} onChange={(e) => setSeed(e.target.value.replace(/\D/g, '').slice(0, 3))} className="h-11" />
      </Field>
    </Sheet>
  );
}

function NameEdit({ t, entry, open, onClose }: { t: EsportsTournament; entry: EsportsEntry; open: boolean; onClose: () => void }) {
  const { toast } = useFeedback();
  const busy = useBusy<'guardar'>();
  const [name, setName] = useState(entry.name);
  const [tag, setTag] = useState(entry.tag);
  const ok = name.trim().length >= 1 && name.trim().length <= 40 && /^[A-Z0-9]{0,5}$/.test(tag);
  const save = () =>
    busy.run('guardar', async () => {
      try {
        await updateEntry(entry.id, { name, tag });
        toast('Nombre guardado');
        onClose();
      } catch (e) {
        toast(esportsErrorText(e, t.game, 'inscripcion'), 'error');
      }
    });
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Editar nombre"
      footer={
        <Button variant="primary" size="lg" className="w-full" disabled={!ok} loading={busy.isBusy('guardar')} onClick={() => void save()}>
          Guardar
        </Button>
      }
    >
      <div className="flex flex-col gap-3 pb-1">
        <Field label="Nombre">
          <Input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className="h-11" />
        </Field>
        <Field label="Tag (hasta 5, mayúsculas)">
          <Input value={tag} maxLength={5} onChange={(e) => setTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} className="h-11" />
        </Field>
      </div>
    </Sheet>
  );
}

/** El estado del inscrito en su fila (con el check-in). */
export function EntryChip({ entry }: { entry: EsportsEntry }) {
  return <EntryStatusChip status={entry.status} checkedIn={!!entry.checkedInAt} />;
}
