import { useState } from 'react';
import { Check, CheckCircle2, Hash, Pencil, X } from 'lucide-react';
import { checkIn, decideEntry, esportsErrorText, updateEntry, type EsportsEntry, type EsportsTournament } from '../../../../lib/data/esports';
import { EntryStatusChip } from '../../../../components/esports/bits';
import { useBusy } from '../../../../components/busy';
import { useFeedback } from '../../../../components/feedback';
import { EventMenu, type MenuItem } from '../../../../components/event/EventHeader';
import { Button, Card, Field, Input, ListRow, SectionHeader, Sheet, Textarea } from '../../../../components/ui';
import { entryLine, pendingEntries } from '../logic';
import { cleanEntryTag, cleanSeedInput, entryAdminItems, entryNameOk, entryTitle, seedFromInput, type EntryMenuKey } from './logic';
import { Initials } from '../parts';

/** La línea de un inscrito (en logic.ts: la usa también la app del teléfono). */
export { entryLine };

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
            title={entryTitle(e)}
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
  const icons: Record<EntryMenuKey, MenuItem['icon']> = { seed: Hash, checkin: CheckCircle2, name: Pencil };
  const items: MenuItem[] = entryAdminItems(t, entry).map((it) => ({
    ...it,
    icon: icons[it.key],
    onClick: it.key === 'checkin' ? () => void toggleCheckin() : () => onPick(it.key as Panel),
    ...(it.key === 'checkin' ? { busy: busy.isBusy('checkin') } : {}),
  }));
  return <EventMenu open={open} onClose={onClose} title={entry.name} items={items} />;
}

function SeedEdit({ t, entry, open, onClose }: { t: EsportsTournament; entry: EsportsEntry; open: boolean; onClose: () => void }) {
  const { toast } = useFeedback();
  const busy = useBusy<'guardar'>();
  const [seed, setSeed] = useState(entry.seed ? String(entry.seed) : '');
  const { n, ok } = seedFromInput(seed);
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
        <Input inputMode="numeric" value={seed} onChange={(e) => setSeed(cleanSeedInput(e.target.value))} className="h-11" />
      </Field>
    </Sheet>
  );
}

function NameEdit({ t, entry, open, onClose }: { t: EsportsTournament; entry: EsportsEntry; open: boolean; onClose: () => void }) {
  const { toast } = useFeedback();
  const busy = useBusy<'guardar'>();
  const [name, setName] = useState(entry.name);
  const [tag, setTag] = useState(entry.tag);
  const ok = entryNameOk(name, tag);
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
          <Input value={tag} maxLength={5} onChange={(e) => setTag(cleanEntryTag(e.target.value))} className="h-11" />
        </Field>
      </div>
    </Sheet>
  );
}

/** El estado del inscrito en su fila (con el check-in). */
export function EntryChip({ entry }: { entry: EsportsEntry }) {
  return <EntryStatusChip status={entry.status} checkedIn={!!entry.checkedInAt} />;
}
