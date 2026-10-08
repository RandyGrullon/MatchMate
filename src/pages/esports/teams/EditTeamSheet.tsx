import { useState } from 'react';
import { Save } from 'lucide-react';
import { esportsErrorText, removeTeamLogo, updateTeam, uploadTeamLogo, type EsportsTeam } from '../../../lib/data/esports';
import type { CompressedLogo } from '../../../lib/image';
import { logoErrorText } from '../../../lib/logos';
import { useFeedback } from '../../../components/feedback';
import { useIsPro } from '../../../components/mode';
import { Button, Field, Input, Sheet, Textarea } from '../../../components/ui';
import { cleanTag, teamFormErrors, teamPatch, type TeamForm } from '../logic';
import { TeamLogoField } from './CreateTeamSheet';

/**
 * «Editar equipo» (el capitán, menú «•••» de la página del equipo): nombre, tag, descripción y logo. Guarda solo lo que
 * cambió (`updateTeam`) y el logo aparte (`uploadTeamLogo` / `removeTeamLogo`).
 */
export function EditTeamSheet({ open, onClose, team, onSaved }: { open: boolean; onClose: () => void; team: EsportsTeam; onSaved?: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Editar equipo" subtitle={team.name}>
      {open && (
        <EditTeamBody
          team={team}
          onDone={() => {
            onSaved?.();
            onClose();
          }}
        />
      )}
    </Sheet>
  );
}

function EditTeamBody({ team, onDone }: { team: EsportsTeam; onDone: () => void }) {
  const pro = useIsPro();
  const { toast } = useFeedback();
  const [form, setForm] = useState<TeamForm>({ name: team.name, tag: team.tag, description: team.description ?? '' });
  const [logo, setLogo] = useState<CompressedLogo | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const errors = teamFormErrors(form);
  const patch = teamPatch(team, form);
  const logoChange = !!logo || (logoRemoved && !!team.logoPath);
  const ok = Object.keys(errors).length === 0;

  async function save() {
    if (!ok || busy) return;
    if (!patch && !logoChange) {
      onDone();
      return;
    }
    setBusy(true);
    try {
      if (patch) await updateTeam(team.id, patch);
    } catch (e) {
      console.error(e);
      toast(esportsErrorText(e, team.game, 'equipo'), 'error');
      setBusy(false);
      return;
    }
    try {
      if (logo) await uploadTeamLogo(team.id, logo);
      else if (logoRemoved && team.logoPath) await removeTeamLogo(team.id);
    } catch (e) {
      console.warn('[logo del equipo]', e);
      toast(logoErrorText(e), 'error');
      setBusy(false);
      return;
    }
    toast('Equipo guardado');
    onDone();
  }

  return (
    <form
      className="flex flex-col gap-4 pb-1"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Field label="Nombre del equipo" hint={errors.name ? <span className="text-danger">{errors.name}</span> : undefined}>
        <Input className="h-11" maxLength={40} value={form.name} aria-invalid={!!errors.name || undefined} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </Field>
      <Field label="Tag" hint={errors.tag ? <span className="text-danger">{errors.tag}</span> : 'De 2 a 5 letras o números.'}>
        <Input
          className="h-11 font-semibold tracking-[0.08em] uppercase"
          maxLength={5}
          autoCapitalize="characters"
          value={form.tag}
          aria-invalid={!!errors.tag || undefined}
          onChange={(e) => setForm((f) => ({ ...f, tag: cleanTag(e.target.value) }))}
        />
      </Field>
      <Field label="Descripción (opcional)" hint={errors.description ? <span className="text-danger">{errors.description}</span> : undefined}>
        <Textarea rows={2} maxLength={200} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </Field>
      <TeamLogoField
        value={logo}
        onChange={setLogo}
        name={form.name || team.name}
        tag={form.tag || team.tag}
        current={team.logoPath}
        removed={logoRemoved}
        onRemove={setLogoRemoved}
      />
      <Button type="submit" variant="primary" size={pro ? 'lg' : 'xl'} className="mt-1 w-full" loading={busy} disabled={!ok} icon={<Save className="size-5" />}>
        Guardar
      </Button>
    </form>
  );
}
