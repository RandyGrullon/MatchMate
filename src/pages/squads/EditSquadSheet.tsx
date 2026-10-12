import { useState } from 'react';
import { Save } from 'lucide-react';
import { removeSquadLogo, squadErrorText, squadProblem, updateSquad, uploadSquadLogo, type SquadPage } from '../../lib/data/squads';
import type { CompressedLogo } from '../../lib/image';
import { logoErrorText } from '../../lib/logos';
import { useIsPro } from '../../lib/useMode';
import { useFeedback } from '../../components/feedback';
import { SquadTint } from '../../components/squads/SquadBits';
import { Button, Sheet } from '../../components/ui';
import { TeamLogoField } from '../esports/teams/CreateTeamSheet';
import { SquadFields, squadFormOf, squadPatchOf, type SquadForm } from './SquadFields';

/**
 * «Editar equipo» (el capitán, menú «•••»): nombre, tag, ciudad, color, descripción y «Busca jugadores». Guarda solo lo
 * que cambió. El deporte no se cambia.
 */
export function EditSquadSheet({ open, onClose, squad }: { open: boolean; onClose: () => void; squad: SquadPage }) {
  return (
    <Sheet open={open} onClose={onClose} title="Editar equipo" subtitle={squad.name}>
      {open && <EditBody squad={squad} onDone={onClose} />}
    </Sheet>
  );
}

function EditBody({ squad, onDone }: { squad: SquadPage; onDone: () => void }) {
  const pro = useIsPro();
  const { toast } = useFeedback();
  const [form, setForm] = useState<SquadForm>(() => squadFormOf(squad));
  const [busy, setBusy] = useState(false);
  const problem = squadProblem(form);
  const patch = squadPatchOf(squad, form);

  async function save() {
    if (problem || busy) return;
    if (!patch) return onDone();
    setBusy(true);
    try {
      await updateSquad(squad.id, patch);
      toast('Equipo guardado');
      onDone();
    } catch (e) {
      console.error(e);
      toast(squadErrorText(e), 'error');
      setBusy(false);
    }
  }

  return (
    <SquadTint color={form.color} sport={squad.sport}>
      <form
        className="flex flex-col gap-4 pb-1"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <SquadFields form={form} sport={squad.sport} onChange={(p) => setForm((f) => ({ ...f, ...p }))} />
        {problem && (
          <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {problem}
          </p>
        )}
        <Button type="submit" variant="primary" size={pro ? 'lg' : 'xl'} className="mt-1 w-full" loading={busy} disabled={!!problem} icon={<Save className="size-5" />}>
          Guardar
        </Button>
      </form>
    </SquadTint>
  );
}

/**
 * «Logo» (el capitán, menú «•••»): elegir la imagen (se recorta al cuadrado y se comprime aquí), «Quitar» el de ahora
 * (vuelve el tag en su color) y «Guardar».
 */
export function SquadLogoSheet({ open, onClose, squad }: { open: boolean; onClose: () => void; squad: SquadPage }) {
  return (
    <Sheet open={open} onClose={onClose} title="Logo del equipo" subtitle={squad.name}>
      {open && <LogoBody squad={squad} onDone={onClose} />}
    </Sheet>
  );
}

function LogoBody({ squad, onDone }: { squad: SquadPage; onDone: () => void }) {
  const pro = useIsPro();
  const { toast } = useFeedback();
  const [logo, setLogo] = useState<CompressedLogo | null>(null);
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const change = !!logo || (removed && !!squad.logo);

  async function save() {
    if (busy) return;
    if (!change) return onDone();
    setBusy(true);
    try {
      if (logo) await uploadSquadLogo(squad.id, logo);
      else await removeSquadLogo(squad.id);
      toast(logo ? 'Logo guardado' : 'Logo quitado');
      onDone();
    } catch (e) {
      console.warn('[logo del equipo]', e);
      toast(logoErrorText(e), 'error');
      setBusy(false);
    }
  }

  return (
    <SquadTint color={squad.color} sport={squad.sport}>
      <div className="flex flex-col gap-4 pb-1">
        <TeamLogoField value={logo} onChange={setLogo} name={squad.name} tag={squad.tag} current={squad.logo} removed={removed} onRemove={setRemoved} />
        <Button variant="primary" size={pro ? 'lg' : 'xl'} className="w-full" loading={busy} disabled={!change} onClick={() => void save()} icon={<Save className="size-5" />}>
          Guardar
        </Button>
      </div>
    </SquadTint>
  );
}
